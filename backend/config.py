"""Environment + PDAs + anchor discriminators."""
import hashlib
import json
import os
from pathlib import Path

from dotenv import load_dotenv
from solders.pubkey import Pubkey

load_dotenv()

ROOT = Path(__file__).resolve().parent.parent

RPC_URL = os.getenv("SOLANA_RPC_URL", "https://api.devnet.solana.com")
PROGRAM_ID = Pubkey.from_string(os.getenv("PROGRAM_ID", "313NKsMsgiA8uLp6y2dnfP1QzCQmZu9xkaaHSkMW6VL5"))
AUTHORITY_KP_PATH = os.getenv("AUTHORITY_KEYPAIR", str(ROOT / "deploy-keypair.json"))
DB_PATH = os.getenv("DB_PATH", str(ROOT / "backend" / "yt.db"))

CRANK_INTERVAL_SEC = int(os.getenv("CRANK_INTERVAL_SEC", "3600"))
INDEX_INTERVAL_SEC = int(os.getenv("INDEX_INTERVAL_SEC", "45"))

CONFIG_SEED = b"yield_config"
VAULT_SEED = b"vault"
DEPOSIT_SEED = b"deposit"


def anchor_discriminator(name: str) -> bytes:
    return hashlib.sha256(f"global:{name}".encode()).digest()[:8]


def account_discriminator(name: str) -> bytes:
    # Anchor 1.0: account discriminator is sha256("account:<Name>")[:8]
    return hashlib.sha256(f"account:{name}".encode()).digest()[:8]


def config_pda() -> Pubkey:
    return Pubkey.find_program_address([CONFIG_SEED], PROGRAM_ID)[0]


def load_authority_keypair_bytes() -> bytes:
    """Resolve the authority keypair as raw bytes.

    Railway containers don't carry the deploy keypair on disk, so the
    `AUTHORITY_KEYPAIR_JSON` env (inline JSON array, brackets optional —
    Railway dashboards sometimes strip them on paste) takes precedence.
    Local dev keeps the file-based path.
    """
    inline = os.getenv("AUTHORITY_KEYPAIR_JSON", "").strip()
    if inline:
        try:
            payload = json.loads(inline)
        except json.JSONDecodeError:
            inner = inline.lstrip("[(").rstrip(")]").strip()
            payload = [int(x) for x in inner.split(",") if x.strip()]
        if not isinstance(payload, list) or len(payload) < 64:
            raise ValueError("AUTHORITY_KEYPAIR_JSON must be a >=64-byte int array")
        return bytes(payload[:64])
    with open(AUTHORITY_KP_PATH) as fh:
        data = json.load(fh)
    return bytes(data[:64])
