# Methodology

Notes on how the simulator generates its numbers — useful when reading the
backtest report or comparing strategies in the prospectus.

## I. Data sources

Live APYs are pulled at strategy-evaluation time and cached for the duration
of one backtest run.

| Source        | Asset class      | Endpoint                                  |
|---------------|------------------|-------------------------------------------|
| Marinade      | mSOL liquid stake| `/api/marinade/state`                     |
| Jito          | jitoSOL          | `/api/jito/state`                         |
| Kamino        | USDC / SOL lend  | `/api/kamino/markets`                     |
| Drift         | basis & perps    | `/api/drift/funding-rate`                 |
| Jupiter       | LP rewards       | `/api/jupiter/pool/{pair}`                |

All endpoints are best-effort. A 5xx triggers fallback to a 30-day median
estimate (recorded in `live=false` metadata; the UI shows an amber pill).

## II. Per-run model

Each Monte Carlo run rolls forward day-by-day. For day t:

1. Sample a daily SOL return `r_SOL ~ N(μ, σ²)` with μ = 0%, σ = 1.4% (28-day
   trailing).
2. For each strategy block in the composition:
   - Apply the block's *yield contribution* (annualized → daily)
   - Apply the block's *volatility profile* (multiplier on r_SOL)
   - Sum into the day's portfolio P&L
3. Compound onto running NAV. Record the equity curve.

50 runs are averaged, plus min/max bands.

## III. Risk metrics

- **Sharpe** — annualized excess return over T-bill (4.5%) ÷ σ
- **Max drawdown** — worst peak-to-trough across all 50 runs
- **Win-rate** — share of runs that finish above starting NAV
- **VaR(1d)** — 5th percentile of daily P&L distribution
- **β to SOL** — OLS regression of strategy returns vs r_SOL

## IV. Strategy-type overlays

| Block            | Yield α | σ multiplier | Notes                     |
|------------------|---------|--------------|---------------------------|
| Liquid stake     | +6%     | 1.0×         | reference baseline        |
| Covered call     | +4%     | 0.95×        | premium yield amplifier   |
| Delta neutral    | 0       | 0.55×        | volatility damper         |
| Leveraged stake  | +12%    | 1.6×         | requires liquidation buf  |
| Yield farming    | +18%    | 1.15×        | impermanent-loss adjusted |
| Cash & carry     | +3%     | 0.4×         | defensive sleeve          |

## V. Limitations we're explicit about

- **No funding-rate path dependence.** Delta-neutral and basis assume
  symmetric funding across the run. In reality funding spikes during stress.
- **Liquid-stake unstake delays not modeled.** A real exit takes 2-5 epochs
  (~5-12 days on Solana mainnet).
- **No impermanent-loss path simulation for LP.** We apply a flat haircut.
- **Slippage on rebalance ignored** below 5% portfolio turnover; modeled
  linearly above that threshold.

## VI. Where to look in the codebase

- Per-run simulator: `backend/sim/run.py`
- Volatility profiles: `backend/sim/profiles.py`
- API surface: `backend/api/main.py` → `/backtest`
- UI consumer: `app/src/pages/BacktestPage.tsx`

## VII. Citations

The covered-call premium model follows Bjerksund-Stensland (2002).
Delta-neutral funding-rate damping uses the Drift v2 design notes.
LP impermanent-loss linear-haircut from Uniswap v2 paper, §3.
