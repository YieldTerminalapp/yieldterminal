"""Monte-Carlo backtest driven by live protocol APYs. Returns Sharpe, drawdown, equity curve."""
import math
import random
from dataclasses import dataclass, asdict

try:
    from .yields import all_protocols
except ImportError:
    from yields import all_protocols  # type: ignore[no-redef]


# per-protocol volatility + loss-chance pair (empirically calibrated)
PROTOCOL_RISK = {
    "marinade": {"vol": 0.008, "loss_pct": 0.03, "max_loss": 0.005},
    "kamino":   {"vol": 0.012, "loss_pct": 0.05, "max_loss": 0.012},
    "drift":    {"vol": 0.025, "loss_pct": 0.12, "max_loss": 0.040},
    "jupiter":  {"vol": 0.020, "loss_pct": 0.08, "max_loss": 0.025},
}

# Strategy-type overlays — applied on top of protocol mix:
#   extra_yield_daily: adds flat daily yield (e.g. option premium)
#   vol_scale: multiplies daily volatility (hedging cuts vol, farming amplifies it)
#   loss_chance_scale: scales the chance of a loss day
STRATEGY_OVERLAY = {
    "coveredCall":  {"extra_yield_daily": 0.0004, "vol_scale": 0.9,  "loss_chance_scale": 1.0},
    "deltaNeutral": {"extra_yield_daily": 0.0,    "vol_scale": 0.55, "loss_chance_scale": 0.6},
    "yieldFarm":    {"extra_yield_daily": 0.0002, "vol_scale": 1.15, "loss_chance_scale": 1.2},
}
DEFAULT_OVERLAY = {"extra_yield_daily": 0.0, "vol_scale": 1.0, "loss_chance_scale": 1.0}


@dataclass
class BacktestResult:
    days: int
    total_return_pct: float
    annualized_apy: float
    max_drawdown_pct: float
    sharpe_ratio: float
    win_rate: float
    equity_curve: list[float]
    protocols_used: list[str]


def simulate_one(blocks: list[dict], days: int, apys: dict[str, float],
                 overlay: dict, seed: int | None = None) -> list[float]:
    if seed is not None:
        random.seed(seed)

    returns: list[float] = []
    for _ in range(days):
        day_r = 0.0
        for b in blocks:
            p = b.get("protocol", "").lower()
            pct = b.get("allocation_pct", 0) / 100.0
            base_daily = apys.get(p, 6.0) / 365 / 100
            risk = PROTOCOL_RISK.get(p, {"vol": 0.015, "loss_pct": 0.05, "max_loss": 0.02})
            loss_p = risk["loss_pct"] * overlay["loss_chance_scale"]
            if random.random() < loss_p:
                r = -random.uniform(0, risk["max_loss"])
            else:
                r = base_daily + random.gauss(0, risk["vol"] * overlay["vol_scale"])
            day_r += pct * r
        day_r += overlay["extra_yield_daily"]  # strategy-type yield on top of composition
        returns.append(day_r)
    return returns


def run(blocks: list[dict], days: int = 30, runs: int = 50,
        strategy_type: str | None = None) -> BacktestResult:
    apys = {p: s.apy for p, s in all_protocols().items()}  # fetch once, reuse across all runs
    overlay = STRATEGY_OVERLAY.get(strategy_type or "", DEFAULT_OVERLAY)
    all_returns = [simulate_one(blocks, days, apys, overlay, seed=i) for i in range(runs)]
    avg_daily = [sum(r[d] for r in all_returns) / runs for d in range(days)]

    equity = [1.0]
    for r in avg_daily:
        equity.append(equity[-1] * (1 + r))

    final = equity[-1]
    peak, mdd = 1.0, 0.0
    for v in equity:
        peak = max(peak, v)
        mdd = max(mdd, (peak - v) / peak)

    wins = sum(1 for r in avg_daily if r > 0)
    mean = sum(avg_daily) / len(avg_daily) if avg_daily else 0
    var = sum((r - mean) ** 2 for r in avg_daily) / max(len(avg_daily) - 1, 1)
    std = math.sqrt(var)
    sharpe = (mean / std * math.sqrt(365)) if std > 0 else 0.0

    return BacktestResult(
        days=days,
        total_return_pct=round((final - 1) * 100, 2),
        annualized_apy=round(((final ** (365 / days)) - 1) * 100 if days > 0 else 0, 2),
        max_drawdown_pct=round(mdd * 100, 2),
        sharpe_ratio=round(sharpe, 2),
        win_rate=round(wins / days * 100, 1),
        equity_curve=[round(v, 4) for v in equity],
        protocols_used=sorted({b.get("protocol", "").lower() for b in blocks if b.get("protocol")}),
    )


def as_dict(r: BacktestResult) -> dict:
    return asdict(r)
