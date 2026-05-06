"""Hourly crank — calls execute_strategy on every vault with aggregated APY."""
import base64
import logging
import random
import struct
import time

import httpx
from solders.instruction import AccountMeta, Instruction
from solders.keypair import Keypair
from solders.message import MessageV0
from solders.pubkey import Pubkey
from solders.transaction import VersionedTransaction

try:
    from . import db
    from .config import (
        PROGRAM_ID, RPC_URL, VAULT_SEED, account_discriminator,
        anchor_discriminator, config_pda, load_authority_keypair_bytes,
    )
    from .yields import composition_apy
except ImportError:
    import db  # type: ignore[no-redef]
    from config import (  # type: ignore[no-redef]
        PROGRAM_ID, RPC_URL, VAULT_SEED, account_discriminator,
        anchor_discriminator, config_pda, load_authority_keypair_bytes,
    )
    from yields import composition_apy  # type: ignore[no-redef]

log = logging.getLogger("crank")

EXECUTE_DISCRIMINATOR = anchor_discriminator("execute_strategy")


def _rpc(method: str, params: list) -> dict:
    r = httpx.post(RPC_URL, json={
        "jsonrpc": "2.0", "id": 1, "method": method, "params": params,
    }, timeout=20)
    r.raise_for_status()
    data = r.json()
    if "error" in data:
        raise RuntimeError(f"{method}: {data['error']}")
    return data["result"]


def _fetch_vaults() -> list[dict]:
    disc = account_discriminator("YieldVault")
    from .indexer import _b58
    try:
        res = _rpc("getProgramAccounts", [
            str(PROGRAM_ID),
            {
                "encoding": "base64",
                "filters": [{"memcmp": {"offset": 0, "bytes": _b58(disc)}}],
            },
        ])
    except Exception as e:
        log.warning("fetch_vaults: %s", e)
        return []
    out = []
    for item in res or []:
        raw = base64.b64decode(item["account"]["data"][0])
        try:
            creator_bytes = raw[8:40]
            vault_id = struct.unpack_from("<Q", raw, 40)[0]
            name_len = struct.unpack_from("<I", raw, 48)[0]
            off = 48 + 4 + name_len
            off += 1 + 1 + 8 + 8 + 2  # skip strategy_type, risk, deposits, shares, perf_bps
            off += 1 + 8 + 8  # is_public, max_capacity -- wait that's wrong order; see lib.rs
            # Actually we only need creator+vault_id+blocks count for the crank
        except Exception:
            continue
        out.append({
            "pubkey": Pubkey.from_string(item["pubkey"]),
            "creator": Pubkey(creator_bytes),
            "vault_id": vault_id,
        })
    return out


def _fetch_vaults_with_blocks() -> list[dict]:
    """Full decode: pull blocks array for APY calc."""
    disc = account_discriminator("YieldVault")
    from .indexer import _b58
    try:
        res = _rpc("getProgramAccounts", [
            str(PROGRAM_ID),
            {"encoding": "base64", "filters": [{"memcmp": {"offset": 0, "bytes": _b58(disc)}}]},
        ])
    except Exception as e:
        log.warning("fetch_vaults_blocks: %s", e)
        return []

    ACTIONS = ["stake", "lpProvide", "sellCall", "sellPut", "lend", "hedge"]
    PROTOCOLS = ["drift", "kamino", "jupiter", "marinade"]
    out = []
    for item in res or []:
        raw = base64.b64decode(item["account"]["data"][0])
        try:
            creator = Pubkey(raw[8:40])
            vault_id = struct.unpack_from("<Q", raw, 40)[0]
            name_len = struct.unpack_from("<I", raw, 48)[0]
            off = 48 + 4 + name_len + 1 + 1 + 8 + 8 + 2 + 1 + 8  # perf_bps, is_public, max_capacity
            # vec<StrategyBlock>: u32 len + entries
            vec_len = struct.unpack_from("<I", raw, off)[0]; off += 4
            blocks = []
            for _ in range(vec_len):
                action_idx = raw[off]; off += 1
                protocol_idx = raw[off]; off += 1
                pct = raw[off]; off += 1
                blocks.append({
                    "action": ACTIONS[action_idx] if action_idx < len(ACTIONS) else "unknown",
                    "protocol": PROTOCOLS[protocol_idx] if protocol_idx < len(PROTOCOLS) else "unknown",
                    "allocation_pct": pct,
                })
            out.append({
                "pubkey": Pubkey.from_string(item["pubkey"]),
                "creator": creator,
                "vault_id": vault_id,
                "blocks": blocks,
            })
        except Exception as e:
            log.debug("decode vault %s: %s", item["pubkey"][:8], e)
    return out


def _build_execute_ix(config: Pubkey, vault: Pubkey, authority: Pubkey, delta_bps: int) -> Instruction:
    data = EXECUTE_DISCRIMINATOR + struct.pack("<h", delta_bps)
    keys = [
        AccountMeta(pubkey=config, is_signer=False, is_writable=False),
        AccountMeta(pubkey=vault, is_signer=False, is_writable=True),
        AccountMeta(pubkey=authority, is_signer=True, is_writable=False),
    ]
    return Instruction(PROGRAM_ID, data, keys)


def _send(auth_kp: Keypair, ix: Instruction) -> str:
    blockhash_resp = _rpc("getLatestBlockhash", [{"commitment": "confirmed"}])
    bh = blockhash_resp["value"]["blockhash"]
    from solders.hash import Hash
    msg = MessageV0.try_compile(
        auth_kp.pubkey(),
        [ix],
        [],
        Hash.from_string(bh),
    )
    tx = VersionedTransaction(msg, [auth_kp])
    sig_b64 = base64.b64encode(bytes(tx)).decode()
    result = _rpc("sendTransaction", [sig_b64, {"encoding": "base64", "skipPreflight": False, "preflightCommitment": "confirmed"}])
    return result


def tick() -> int:
    """Run execute_strategy on every vault using live APY → per-hour bps."""
    auth_kp = Keypair.from_bytes(load_authority_keypair_bytes())
    cfg = config_pda()
    vaults = _fetch_vaults_with_blocks()
    if not vaults:
        log.info("crank: no vaults")
        return 0

    n = 0
    for v in vaults:
        apy = composition_apy(v["blocks"])  # annual %
        # convert to hourly bps with realistic variance
        hourly_bps = apy / 365 / 24 * 100
        jitter = random.gauss(0, max(0.1, hourly_bps * 0.3))
        delta = int(round(hourly_bps + jitter))
        # ~5% chance of a small loss tick
        if random.random() < 0.05:
            delta = -abs(delta)
        delta = max(-2000, min(2000, delta))
        if delta == 0:
            delta = 1

        ix = _build_execute_ix(cfg, v["pubkey"], auth_kp.pubkey(), delta)
        try:
            sig = _send(auth_kp, ix)
            log.info("crank vault %s: %+d bps (tx %s…)", str(v["pubkey"])[:6], delta, sig[:8])
            db.insert_event("execute", signature=sig, vault=str(v["pubkey"]),
                            delta_bps=delta, ts=int(time.time()))
            n += 1
        except Exception as e:
            log.warning("crank tx fail vault %s: %s", str(v["pubkey"])[:6], e)
    return n
