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


def load_keypair_bytes(path: str) -> bytes:
    resolved = Path(path).expanduser()
    with open(resolved, 'r') as fh:
        data = json.load(fh)
    return bytes(data[:64])
