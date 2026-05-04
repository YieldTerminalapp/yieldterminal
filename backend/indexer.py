"""Signature-based indexer. Polls program signatures, decodes emitted events, writes to SQLite."""
import base64
import logging
import struct
import time

import httpx
from solders.pubkey import Pubkey

from . import db
from .config import PROGRAM_ID, RPC_URL, account_discriminator

log = logging.getLogger("indexer")

# Cached discriminators for anchor events (sha256("event:<Name>")[:8])
import hashlib

EVENT_KINDS = {
    hashlib.sha256(b"event:VaultCreated").digest()[:8]:     "VaultCreated",
    hashlib.sha256(b"event:Deposited").digest()[:8]:        "Deposited",
    hashlib.sha256(b"event:Withdrawn").digest()[:8]:        "Withdrawn",
    hashlib.sha256(b"event:StrategyExecuted").digest()[:8]: "StrategyExecuted",
    hashlib.sha256(b"event:VaultClosed").digest()[:8]:      "VaultClosed",
    hashlib.sha256(b"event:SharesTransferred").digest()[:8]:"SharesTransferred",
}

EVENT_LOG_PREFIX = "Program data: "


def _rpc(method: str, params: list) -> dict:
    r = httpx.post(RPC_URL, json={
        "jsonrpc": "2.0", "id": 1, "method": method, "params": params,
    }, timeout=15)
    r.raise_for_status()
    data = r.json()
    if "error" in data:
        raise RuntimeError(f"{method} error: {data['error']}")
    return data["result"]


def _decode_event(payload: bytes) -> tuple[str, dict] | None:
    if len(payload) < 8:
        return None
    disc, body = payload[:8], payload[8:]
    name = EVENT_KINDS.get(disc)
    if not name:
        return None

    try:
        if name == "VaultCreated":
            vault = Pubkey(body[0:32]); creator = Pubkey(body[32:64])
            vault_id = struct.unpack_from("<Q", body, 64)[0]
            blocks = body[72]
            ts = struct.unpack_from("<q", body, 73)[0]
            return name, {"vault": str(vault), "creator": str(creator), "vault_id": vault_id, "blocks": blocks, "ts": ts}
        if name == "Deposited":
            vault = Pubkey(body[0:32]); user = Pubkey(body[32:64])
            amount, shares, total = struct.unpack_from("<QQQ", body, 64)
            ts = struct.unpack_from("<q", body, 88)[0]
            return name, {"vault": str(vault), "user": str(user), "amount": amount, "shares": shares, "total": total, "ts": ts}
        if name == "Withdrawn":
            vault = Pubkey(body[0:32]); user = Pubkey(body[32:64])
            payout, shares, total = struct.unpack_from("<QQQ", body, 64)
            ts = struct.unpack_from("<q", body, 88)[0]
            return name, {"vault": str(vault), "user": str(user), "payout": payout, "shares": shares, "total": total, "ts": ts}
        if name == "StrategyExecuted":
            vault = Pubkey(body[0:32])
            delta_bps, new_bps = struct.unpack_from("<hh", body, 32)
            earnings = struct.unpack_from("<Q", body, 36)[0]
            ts = struct.unpack_from("<q", body, 44)[0]
            return name, {"vault": str(vault), "delta_bps": delta_bps, "new_bps": new_bps, "earnings": earnings, "ts": ts}
        if name == "VaultClosed":
            vault = Pubkey(body[0:32]); creator = Pubkey(body[32:64])
            ts = struct.unpack_from("<q", body, 64)[0]
            return name, {"vault": str(vault), "creator": str(creator), "ts": ts}
        if name == "SharesTransferred":
            vault = Pubkey(body[0:32]); frm = Pubkey(body[32:64]); to = Pubkey(body[64:96])
            shares = struct.unpack_from("<Q", body, 96)[0]
            ts = struct.unpack_from("<q", body, 104)[0]
            return name, {"vault": str(vault), "from": str(frm), "to": str(to), "shares": shares, "ts": ts}
    except Exception as e:
        log.warning("decode failed for %s: %s", name, e)
        return None
    return None


def _extract_events(logs: list[str]) -> list[tuple[str, dict]]:
    out = []
    for line in logs or []:
        if not line.startswith(EVENT_LOG_PREFIX):
            continue
        b64 = line[len(EVENT_LOG_PREFIX):].strip()
        try:
            payload = base64.b64decode(b64)
        except Exception:
            continue
        evt = _decode_event(payload)
        if evt:
            out.append(evt)
    return out


def _persist(kind: str, data: dict, sig: str, slot: int | None) -> None:
    ts = data.get("ts", int(time.time()))
    vault = data.get("vault")
    if kind == "Deposited":
        db.insert_event("deposit", signature=sig, vault=vault, wallet=data["user"],
                        amount=data["amount"], shares=data["shares"], ts=ts, slot=slot)
    elif kind == "Withdrawn":
        db.insert_event("withdraw", signature=sig, vault=vault, wallet=data["user"],
                        amount=data["payout"], shares=data["shares"], ts=ts, slot=slot)
    elif kind == "StrategyExecuted":
        db.insert_event("execute", signature=sig, vault=vault,
                        amount=data["earnings"], delta_bps=data["delta_bps"], ts=ts, slot=slot)
    elif kind == "VaultCreated":
        db.insert_event("vault_created", signature=sig, vault=vault,
                        wallet=data["creator"], ts=ts, slot=slot)
    elif kind == "VaultClosed":
        db.insert_event("vault_closed", signature=sig, vault=vault,
                        wallet=data["creator"], ts=ts, slot=slot)
    elif kind == "SharesTransferred":
        db.insert_event("transfer", signature=sig, vault=vault, wallet=data["from"],
                        shares=data["shares"], ts=ts, slot=slot)


def index_tick(batch_limit: int = 40) -> int:
    """Fetch latest signatures for program, decode new txs only, persist events. Returns count stored."""
    last = db.get_cursor("last_sig")
    params: list = [str(PROGRAM_ID), {"limit": batch_limit}]
    if last:
        params[1]["until"] = last

    try:
        sigs = _rpc("getSignaturesForAddress", params)
    except Exception as e:
        log.warning("sig fetch failed: %s", e)
        return 0
    if not sigs:
        return 0

    # walk oldest→newest
    sigs.reverse()
    stored = 0
    newest_sig: str | None = None
    for s in sigs:
        if s.get("err"):
            newest_sig = s["signature"]
            continue
        sig = s["signature"]
        try:
            tx = _rpc("getTransaction", [sig, {"maxSupportedTransactionVersion": 0, "commitment": "confirmed"}])
        except Exception as e:
            log.warning("tx fetch %s: %s", sig[:8], e)
            continue
        if not tx:
            newest_sig = sig
            continue
        logs = (tx.get("meta") or {}).get("logMessages") or []
        slot = tx.get("slot")
        for kind, data in _extract_events(logs):
            _persist(kind, data, sig, slot)
            stored += 1
        newest_sig = sig

    if newest_sig:
        db.set_cursor("last_sig", newest_sig)
    return stored


def snapshot_tick() -> int:
    """Scrape all YieldVault accounts, snapshot total_deposits + performance_bps."""
    try:
        res = _rpc("getProgramAccounts", [
            str(PROGRAM_ID),
            {
                "encoding": "base64",
                "filters": [{"memcmp": {"offset": 0, "bytes": _b58(account_discriminator("YieldVault"))}}],
            },
        ])
    except Exception as e:
        log.warning("snapshot fetch failed: %s", e)
        return 0

    now = int(time.time())
    n = 0
    for item in res or []:
        pk = item["pubkey"]
        raw = base64.b64decode(item["account"]["data"][0])
        # YieldVault layout:
        # 0..8 discriminator, 8..40 creator, 40..48 vault_id,
        # 48..4+name_bytes name (anchor String: u32 len + bytes),
        # then strategy_type(1) risk_level(1) total_deposits(8) total_shares(8) perf(2) ...
        try:
            name_len = struct.unpack_from("<I", raw, 48)[0]
            off = 48 + 4 + name_len
            off += 1  # strategy_type
            off += 1  # risk_level
            total_deposits = struct.unpack_from("<Q", raw, off)[0]; off += 8
            total_shares = struct.unpack_from("<Q", raw, off)[0]; off += 8
            perf_bps = struct.unpack_from("<h", raw, off)[0]
            db.snapshot_vault(pk, total_deposits, perf_bps, now)
            n += 1
        except Exception as e:
            log.debug("snapshot decode %s: %s", pk[:8], e)
    return n


def _b58(data: bytes) -> str:
    # tiny base58 encoder (sufficient for 8-byte discriminator)
    alphabet = b"123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
    n = int.from_bytes(data, "big")
    out = b""
    while n:
        n, r = divmod(n, 58)
        out = alphabet[r:r + 1] + out
    for b in data:
        if b == 0: out = b"1" + out
        else: break
    return out.decode()
