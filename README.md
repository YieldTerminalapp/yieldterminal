# YieldTerminal

Drag-and-drop builder for yield strategies on Solana. Build, backtest, and deploy yield vaults — no code required.

**Research terminal · live:** [yieldterminal.vercel.app](https://yieldterminal.vercel.app) — devnet vaults, free read-only browse, deploy needs a connected devnet wallet.

## Supported Strategies

| Strategy           | Risk        | Expected APY | Status   | Composition                                | Notes                                     |
|--------------------|-------------|--------------|----------|--------------------------------------------|-------------------------------------------|
| Liquid Staking     | Low         | 6 – 8%       | Live     | Marinade mSOL or Jito jitoSOL              | Reference baseline; weekly compounding   |
| Covered Call       | Low-Medium  | 8 – 15%      | Planned  | Liquid stake + sold OTM SOL calls          | Premium yield amplifier (~+1.0× α)       |
| Delta Neutral      | Low         | 5 – 10%      | Planned  | Drift perp short hedging spot SOL exposure | 0.55× volatility damper                  |
| Leveraged Staking  | Medium      | 12 – 25%     | Planned  | Borrow against mSOL on Kamino, restake     | Liquidation risk if SOL prints −20%      |
| Basis Trade        | Low-Medium  | 10 – 20%     | Planned  | Long spot, short equivalent perp           | Funding-rate dependent; check daily      |
| Cash & Carry       | Low         | 4 – 7%       | Planned  | USDC lent on Kamino + JitoSOL collateral   | Defensive sleeve                         |
| Yield Farming      | Medium-High | 15 – 30%     | Planned  | LP into Orca/Raydium high-volume pools     | 1.15× amplifier, watch impermanent loss  |

> Risk labels follow the on-chain `/risk` endpoint scoring: Conservative ≤ 0.4, Balanced 0.4 – 0.7, Aggressive 0.7 – 0.9, Speculative > 0.9.

## Core Action

Drag strategy blocks onto canvas → connect them → backtest with historical data → deploy as a vault.

## Stack

- **Contracts**: Anchor — vault management, Drift/Kamino CPI
- **Frontend**: React + React Flow (canvas) + pro charts
- **Backtester**: Python — historical simulation engine
- **Font**: DM Sans
- **Theme**: FinTech dark blue

## Development

```bash
anchor build && anchor deploy
cd backtester && pip install -r requirements.txt && python main.py
cd web && npm install && npm run dev
```

## Performance Disclaimer

Past performance does not guarantee future results. Yield strategies involve risk of loss. Backtested results may not reflect actual market conditions. This is experimental software — use at your own risk.

## License

MIT
