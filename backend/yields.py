"""Live APY aggregator. Marinade is real, others are tight estimates — flagged per source."""
import time
from dataclasses import dataclass

import httpx


@dataclass
class ApySource:
    protocol: str
    apy: float
    source: str  # "live" | "estimate"
    updated: int


_CACHE: dict[str, ApySource] = {}
_TTL = 300  # 5 min


def _cached(key: str) -> ApySource | None:
    entry = _CACHE.get(key)
    if entry and time.time() - entry.updated < _TTL:
        return entry
    return None


def _fresh(key: str, src: ApySource) -> ApySource:
    _CACHE[key] = src
    return src


def marinade_apy() -> ApySource:
    if (c := _cached("marinade")): return c
    try:
        r = httpx.get("https://api.marinade.finance/msol/apy/30d", timeout=8)
        r.raise_for_status()
        apy = float(r.text) * 100
        return _fresh("marinade", ApySource("marinade", round(apy, 2), "live", int(time.time())))
    except Exception:
        return _fresh("marinade", ApySource("marinade", 6.85, "estimate", int(time.time())))


def kamino_apy() -> ApySource:
    if (c := _cached("kamino")): return c
    try:
        r = httpx.get("https://api.hubbleprotocol.io/kamino-market/reserves", timeout=8)
        if r.status_code == 200:
            data = r.json()
            usdc = next((x for x in data if x.get("symbol") == "USDC"), None)
            if usdc and "supplyApr" in usdc:
                apy = float(usdc["supplyApr"]) * 100
                return _fresh("kamino", ApySource("kamino", round(apy, 2), "live", int(time.time())))
    except Exception:
        pass
    # cache fallback so we don't re-hit the endpoint each call
    return _fresh("kamino", ApySource("kamino", 9.2, "estimate", int(time.time())))


def drift_apy() -> ApySource:
    # Drift halted April 1 2026 (hack); using last-known funding estimate.
    return ApySource("drift", 8.5, "estimate", int(time.time()))


def jupiter_apy() -> ApySource:
    # JLP historical — real API requires auth
    return ApySource("jupiter", 14.3, "estimate", int(time.time()))


def all_protocols() -> dict[str, ApySource]:
    return {
        "marinade": marinade_apy(),
        "kamino":   kamino_apy(),
        "drift":    drift_apy(),
        "jupiter":  jupiter_apy(),
    }


# Weighted APY for a block composition (action+protocol+allocation list)
def composition_apy(blocks: list[dict]) -> float:
    apys = all_protocols()
    total = 0.0
    for b in blocks:
        p = b.get("protocol", "").lower()
        pct = b.get("allocation_pct", 0)
        total += apys.get(p, ApySource(p, 6.0, "fallback", 0)).apy * (pct / 100.0)
    return round(total, 2)
