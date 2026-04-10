"""
Strategy Executor Crank — YieldTerminal

Runs every hour. For each active vault:
1. Check strategy type and current market conditions
2. Calculate yield/loss for the period
3. Call execute_strategy on-chain with yield_bps

Start: python strategy_executor.py
"""

import struct
import hashlib
import logging
from datetime import datetime

from solders.pubkey import Pubkey
from solders.keypair import Keypair
from solana.rpc.api import Client
from solana.rpc.commitment import Confirmed
from solana.transaction import Transaction
from solders.instruction import Instruction, AccountMeta
from apscheduler.schedulers.blocking import BlockingScheduler

from config import (
    RPC_URL,
    PROGRAM_ID,
    KEYPAIR_PATH,
    EXECUTE_INTERVAL_MINUTES,
    CONFIG_SEED,
    VAULT_SEED,
    load_keypair_bytes,
)
from yield_aggregator import get_strategy_yield

logging.basicConfig(
    level=logging.INFO,
    format='[%(asctime)s] %(levelname)s %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S',
)
log = logging.getLogger('executor')

PROGRAM_PUBKEY = Pubkey.from_string(PROGRAM_ID)
rpcClient = Client(RPC_URL)

VAULT_DISCRIMINATOR = hashlib.sha256(b'account:YieldVault').digest()[:8]

STRATEGY_NAMES = {
    0: 'CoveredCall',
    1: 'DeltaNeutral',
    2: 'YieldFarming',
    3: 'BasisTrade',
    4: 'Custom',
}


def get_crank_keypair() -> Keypair:
    return Keypair.from_bytes(load_keypair_bytes(KEYPAIR_PATH))


def derive_config_pda() -> Pubkey:
    pda, _ = Pubkey.find_program_address([CONFIG_SEED], PROGRAM_PUBKEY)
    return pda


def fetch_active_vaults() -> list[dict]:
    """Fetch all YieldVault accounts from the program."""
    try:
        response = rpcClient.get_program_accounts(PROGRAM_PUBKEY, commitment=Confirmed)
        if response.value is None:
            return []

        vaults = []
        for accountInfo in response.value:
            data = bytes(accountInfo.account.data)
            parsed = parse_vault_account(data)
            if parsed is not None and parsed['isActive']:
                parsed['vaultPubkey'] = accountInfo.pubkey
                vaults.append(parsed)
        return vaults

    except Exception as exc:
        log.error(f'failed to fetch vaults: {exc}')
        return []


def parse_vault_account(data: bytes) -> dict | None:
    """Parse YieldVault account data matching on-chain struct layout:
    8(disc) + 32(creator) + 8(vault_id) + 4+N(name) + 1(strategy_type) +
    1(risk_level) + 8(total_deposits) + 8(total_shares) + 2(performance_bps i16) +
    1(is_public) + 8(max_capacity) + 4+N*3(strategy_blocks) + 8(created_at) + 1(bump)
    """
    if len(data) < 50:
        return None

    if data[:8] != VAULT_DISCRIMINATOR:
        return None

    try:
        offset = 8

        # creator: Pubkey (32)
        creator = Pubkey.from_bytes(data[offset:offset + 32])
        offset += 32

        # vault_id: u64
        vaultId = struct.unpack_from('<Q', data, offset)[0]
        offset += 8

        # name: String (4 + len)
        nameLen = struct.unpack_from('<I', data, offset)[0]
        offset += 4
        if nameLen > 64:
            return None
        name = data[offset:offset + nameLen].decode('utf-8', errors='replace')
        offset += nameLen

        # strategy_type: enum u8
        strategyType = data[offset]
        offset += 1

        # risk_level: u8
        riskLevel = data[offset]
        offset += 1

        # total_deposits: u64
        totalDeposited = struct.unpack_from('<Q', data, offset)[0]
        offset += 8

        # total_shares: u64
        totalShares = struct.unpack_from('<Q', data, offset)[0]
        offset += 8

        # performance_bps: i16
        performanceBps = struct.unpack_from('<h', data, offset)[0]
        offset += 2

        # is_public: bool (u8)
        isPublic = bool(data[offset])
        offset += 1

        # max_capacity: u64
        maxCapacity = struct.unpack_from('<Q', data, offset)[0]
        offset += 8

        # strategy_blocks: Vec<StrategyBlock> — each block is 3 bytes (action u8 + protocol u8 + alloc u8)
        blocksCount = struct.unpack_from('<I', data, offset)[0]
        offset += 4
        for _ in range(min(blocksCount, 10)):
            offset += 3  # action(1) + protocol(1) + allocation_pct(1)

        # created_at: i64
        createdAt = struct.unpack_from('<q', data, offset)[0]
        offset += 8

        # bump: u8
        bump = data[offset]

        return {
            'creator': creator,
            'vaultId': vaultId,
            'name': name,
            'strategyType': strategyType,
            'riskLevel': riskLevel,
            'totalDeposited': totalDeposited,
            'totalShares': totalShares,
            'performanceBps': performanceBps,
            'isPublic': isPublic,
            'maxCapacity': maxCapacity,
            'createdAt': createdAt,
            'isActive': totalDeposited > 0 or totalShares > 0,
        }

    except (struct.error, IndexError):
        return None


def build_execute_strategy_ix(
    configPda: Pubkey,
    vaultPubkey: Pubkey,
    crankPubkey: Pubkey,
    yieldBps: int,
) -> Instruction:
    """Build the execute_strategy instruction."""
    discriminator = hashlib.sha256(b'global:execute_strategy').digest()[:8]

    ixData = bytearray(discriminator)
    ixData += struct.pack('<h', yieldBps)  # i16

    accounts = [
        AccountMeta(pubkey=configPda, is_signer=False, is_writable=False),
        AccountMeta(pubkey=vaultPubkey, is_signer=False, is_writable=True),
        AccountMeta(pubkey=crankPubkey, is_signer=True, is_writable=False),
    ]

    return Instruction(
        program_id=PROGRAM_PUBKEY,
        accounts=accounts,
        data=bytes(ixData),
    )


def execute_strategies():
    """Execute strategies for all active vaults."""
    log.info('executing strategies...')

    vaults = fetch_active_vaults()
    if not vaults:
        log.info('no active vaults found')
        return

    log.info(f'found {len(vaults)} active vault(s)')
    crankKeypair = get_crank_keypair()
    configPda = derive_config_pda()

    for vault in vaults:
        stratName = STRATEGY_NAMES.get(vault['strategyType'], 'Unknown')
        vaultName = vault['name']

        try:
            # get yield for this strategy type
            yieldBps = get_strategy_yield(vault['strategyType'])
            yieldPct = yieldBps / 100

            log.info(f'  {vaultName} ({stratName}): yield {yieldPct:+.2f}%')

            ix = build_execute_strategy_ix(
                configPda=configPda,
                vaultPubkey=vault['vaultPubkey'],
                crankPubkey=crankKeypair.pubkey(),
                yieldBps=yieldBps,
            )

            recentBlockhash = rpcClient.get_latest_blockhash(Confirmed).value.blockhash
            txn = Transaction.new_signed_with_payer(
                [ix],
                payer=crankKeypair.pubkey(),
                signing_keypairs=[crankKeypair],
                recent_blockhash=recentBlockhash,
            )

            txResult = rpcClient.send_transaction(txn)
            log.info(f'  executed: tx={txResult.value}')

        except Exception as exc:
            log.error(f'  {vaultName} failed: {exc}')
            continue


def run_scheduler():
    scheduler = BlockingScheduler()
    scheduler.add_job(
        execute_strategies,
        'interval',
        minutes=EXECUTE_INTERVAL_MINUTES,
        next_run_time=datetime.now(),
    )
    log.info(f'executor started — every {EXECUTE_INTERVAL_MINUTES} min')
    try:
        scheduler.start()
    except (KeyboardInterrupt, SystemExit):
        log.info('executor stopped')


if __name__ == '__main__':
    run_scheduler()
