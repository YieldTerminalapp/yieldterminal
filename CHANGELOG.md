# Changelog

## VII — Methodology Pass

- Citations footer + run-id permalink on the backtest research view
- Methodology notes published in `docs/methodology.md` covering data sources, Monte-Carlo path generation, risk metrics, strategy-type overlays, declared limitations
- Supported-strategies table expanded in README — risk · APY · status · composition · notes
- Liquid-stake reference baseline added to the strategy registry

## VI — Editorial Redesign

- "Research Terminal" aesthetic adopted: paper cream + ink + rust palette, Fraunces / Geist / Geist Mono
- Cover-issue landing page with live protocol ticker (42s seamless loop)
- Concept pillars + colophon footer + § 01/02/03 nav
- Builder canvas → primitive-card index with rust hover-shadows
- Vaults presented as "fund prospectus" cards
- Backtest reformatted as research paper with § I/II/III headlines + dropcap

## V — Backend Wiring

- `/apy` live via Marinade + Kamino + Drift + Jupiter
- `/backtest` Monte-Carlo with per-protocol volatility profiles
- `/risk` composition scoring with VaR(1d), SOL beta, Conservative→Speculative
- `/events` SQLite-backed signature indexer
- Crank job calls `execute_strategy` hourly per vault

## IV — Smart Contract

- 3 new instructions: `execute_strategy`, `close_vault`, `transfer_shares`
- 6 events emitted: VaultCreated, Deposited, Withdrawn, StrategyExecuted, VaultClosed, SharesTransferred
- Devnet redeployment signature recorded
