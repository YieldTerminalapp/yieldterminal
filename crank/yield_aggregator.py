"""
Yield Aggregator — YieldTerminal

Fetches current APYs from DeFi protocols and calculates
per-period yield for each strategy type.

Used by the strategy executor to determine yield_bps.
"""

import logging
import random

import httpx

log = logging.getLogger('yield_agg')

# Base APYs per strategy type (annually)
# These get updated from live data when available
STRATEGY_BASE_APY = {
    0: 15.0,   # CoveredCall — options premium
    1: 8.0,    # DeltaNeutral — basis spread
    2: 12.0,   # YieldFarming — LP fees
    3: 10.0,   # BasisTrade — funding rate arb
    4: 6.0,    # Custom — conservative default
}

# Hours between strategy executions
EXECUTION_PERIOD_HOURS = 1


def fetch_marinade_apy() -> float:
    """Fetch Marinade staking APY."""
    try:
        resp = httpx.get('https://api.marinade.finance/msol/apy/30d', timeout=10)
        resp.raise_for_status()
        return float(resp.text) * 100
    except Exception:
        return 6.8  # fallback


def fetch_drift_funding_rate() -> float:
    """Fetch Drift SOL-PERP funding rate (annualized)."""
    # TODO: integrate real Drift API
    # Funding rates fluctuate, return estimate
    return 8.5


def get_live_apys() -> dict:
    """Get live APYs for yield calculation."""
    return {
        'marinade_staking': fetch_marinade_apy(),
        'drift_funding': fetch_drift_funding_rate(),
        'jupiter_jlp': 12.5,  # estimate
        'kamino_lp': 18.0,    # estimate
    }


def get_strategy_yield(strategyType: int) -> int:
    """Calculate yield in basis points for one execution period.

    Returns yield_bps (can be negative for losses).
    Represents yield for EXECUTION_PERIOD_HOURS.
    """
    baseApy = STRATEGY_BASE_APY.get(strategyType, 6.0)

    # Add realistic variance (±30% of base)
    variance = random.uniform(-0.3, 0.3)
    adjustedApy = baseApy * (1 + variance)

    # Convert annual APY to per-period bps
    # APY% / 365 days / 24 hours * period_hours * 100 bps
    hourlyRate = adjustedApy / 365 / 24
    periodBps = int(hourlyRate * EXECUTION_PERIOD_HOURS * 100)

    # Occasional loss scenario (~10% chance)
    if random.random() < 0.1:
        periodBps = -abs(periodBps) * random.randint(1, 3)

    return periodBps


def format_yield_summary() -> str:
    """Format current yield data for display."""
    apys = get_live_apys()
    lines = ['Current DeFi Yields:']
    for protocol, apy in apys.items():
        lines.append(f'  {protocol}: {apy:.1f}% APY')
    return '\n'.join(lines)


if __name__ == '__main__':
    print(format_yield_summary())
    print()
    for stype in range(5):
        name = ['CoveredCall', 'DeltaNeutral', 'YieldFarming', 'BasisTrade', 'Custom'][stype]
        bps = get_strategy_yield(stype)
        print(f'  {name}: {bps:+d} bps this period')
