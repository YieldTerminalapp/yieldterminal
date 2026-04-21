# strategy glossary

definitions for the terms used across the builder and prospectus pages.
referenced from the methodology section.

## block

a self-contained unit of yield logic. each block declares what it consumes
(spot SOL, USDC, perp position) and what it emits (yield series, hedge
position). blocks are composed via canvas connections.

## composition

an ordered set of blocks plus their per-block weights (summing to 1.0).
the composition is what gets simulated by the backtest engine and, if
deployed, what the on-chain vault executes.

## strategy type

a label used by the simulator to apply per-type overlays:

- **liquid stake** — base yield from staking, baseline reference
- **covered call** — sells OTM SOL calls; trades upside for premium yield
- **delta neutral** — perps short hedges spot exposure; lower volatility
- **leveraged staking** — borrow against LST, restake; magnified yield
- **basis trade** — capture funding-rate spread between spot and perp
- **yield farming** — provide LP into high-volume pools; impermanent-loss prone
- **cash and carry** — defensive sleeve, lend USDC, collect base yield

## sharpe ratio

annualized excess return over the risk-free rate (T-bill 4.5%) divided by
volatility. higher is better; Sharpe > 1 is considered good in DeFi.

## maximum drawdown

the worst peak-to-trough loss observed across a Monte Carlo run. always
reported as a positive percentage.

## value-at-risk (VaR)

5th percentile of the daily P&L distribution. "VaR(1d) = -2.3%" means: on
the worst 1 in 20 days, you lose at least 2.3%.

## beta to SOL

OLS regression coefficient of strategy daily returns vs SOL daily returns.
β = 0 means uncorrelated, β = 1 means moves 1-for-1 with SOL.

## prospectus

the project-internal name for the modal that confirms a deployment. lists
the composition, expected APY range, risk band, citations, and run-id.

## fund

a deployed composition. each fund has a Solana account (PDA), share-token
mint, and on-chain history of executions.

## share

erc20-style token representing a claim on a fund. mint when depositing,
burn when withdrawing. 1:1 with NAV at deposit time.

## NAV

net asset value. computed as `(spot_balance + perp_pnl) / shares_outstanding`.

## execute_strategy

the on-chain instruction that applies a +/- bps delta to fund balance based
on per-protocol APY. called by the keeper hourly per active fund.

## activity feed

the timeline of fund events visible in the prospectus modal. types:
deposited, withdrawn, executed_strategy, transferred_shares, vault_closed.
