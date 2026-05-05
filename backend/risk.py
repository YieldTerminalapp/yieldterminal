"""Risk scoring for a strategy block composition."""
from .backtest import PROTOCOL_RISK

# Strategy-type risk adder — covered call = capped upside + pin risk, delta neutral = hedged, yield farm = IL
STRATEGY_RISK_ADD = {
    "coveredCall":  {"score": 5,  "note": "covered-call cap — limited upside on sharp rallies"},
    "deltaNeutral": {"score": -10, "note": "hedged — reduced market exposure"},
    "yieldFarm":    {"score": 8,  "note": "yield-farm — impermanent loss exposure"},
}

# Per-action leverage / complexity weight (higher = more dangerous)
ACTION_WEIGHT = {
    "stake":      0.1,
    "lend":       0.2,
    "lp_provide": 0.4,
    "sell_call":  0.7,
    "sell_put":   0.8,
    "hedge":      0.6,
}

# Correlation of each protocol's return with SOL price (used for concentration risk)
SOL_CORRELATION = {
    "marinade": 0.95,
    "kamino":   0.70,
    "drift":    0.85,
    "jupiter":  0.60,
}


def score(blocks: list[dict], strategy_type: str | None = None) -> dict:
    if not blocks:
        return {"score": 0, "label": "N/A", "var_1d_pct": 0, "sol_beta": 0, "notes": ["no blocks"]}

    # weighted daily volatility (1-day VaR 95% ≈ 1.65 × sigma)
    weighted_vol_sq = 0.0
    weighted_action = 0.0
    weighted_beta = 0.0
    uniq_protocols = set()
    for b in blocks:
        p = b.get("protocol", "").lower()
        a = b.get("action", "").lower()
        pct = b.get("allocation_pct", 0) / 100.0
        risk = PROTOCOL_RISK.get(p, {"vol": 0.018})
        weighted_vol_sq += (pct * risk["vol"]) ** 2
        weighted_action += pct * ACTION_WEIGHT.get(a, 0.3)
        weighted_beta += pct * SOL_CORRELATION.get(p, 0.5)
        uniq_protocols.add(p)

    sigma = weighted_vol_sq ** 0.5
    var_1d_pct = round(1.65 * sigma * 100, 2)

    # raw score: volatility + action complexity penalty
    raw = min(100, int(var_1d_pct * 20 + weighted_action * 30))

    notes = []
    if len(uniq_protocols) == 1:
        notes.append("single-protocol concentration")
        raw = min(100, raw + 10)
    if weighted_beta > 0.85:
        notes.append("high SOL beta — correlated with market")
    if weighted_action > 0.55:
        notes.append("complex options exposure")

    if strategy_type and strategy_type in STRATEGY_RISK_ADD:
        mod = STRATEGY_RISK_ADD[strategy_type]
        raw = max(0, min(100, raw + mod["score"]))
        notes.append(mod["note"])

    if raw < 25:
        label = "Conservative"
    elif raw < 50:
        label = "Moderate"
    elif raw < 75:
        label = "Aggressive"
    else:
        label = "Speculative"

    return {
        "score": raw,
        "label": label,
        "var_1d_pct": var_1d_pct,
        "sol_beta": round(weighted_beta, 2),
        "notes": notes,
    }
