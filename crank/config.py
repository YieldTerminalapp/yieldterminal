import os
import json
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

RPC_URL = os.getenv('ANCHOR_PROVIDER_URL', 'https://api.devnet.solana.com')
PROGRAM_ID = os.getenv('PROGRAM_ID', '313NKsMsgiA8uLp6y2dnfP1QzCQmZu9xkaaHSkMW6VL5')
KEYPAIR_PATH = os.getenv('CRANK_KEYPAIR_PATH', './crank-keypair.json')
EXECUTE_INTERVAL_MINUTES = int(os.getenv('EXECUTE_INTERVAL_MINUTES', '60'))

CONFIG_SEED = b'yield_config'
VAULT_SEED = b'vault'
DEPOSIT_SEED = b'deposit'

# Strategy types match on-chain enum
STRATEGY_COVERED_CALL = 0
STRATEGY_DELTA_NEUTRAL = 1
STRATEGY_YIELD_FARMING = 2
STRATEGY_BASIS_TRADE = 3
STRATEGY_CUSTOM = 4


def keypair_secret_from_json(path: str) -> bytes:
    # Solana CLI stores a 64-byte signing secret as a JSON int array.
    # Open as binary so json.loads handles the byte buffer directly and we
    # avoid any text-mode newline translation on Windows dev boxes.
    target = Path(path).expanduser()
    with target.open('rb') as fh:
        secret = bytes(json.loads(fh.read())[:64])
    if len(secret) != 64:
        raise RuntimeError(f'{target}: expected 64-byte secret, got {len(secret)}')
    return secret
