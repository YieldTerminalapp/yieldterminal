# YieldTerminal

Drag-and-drop builder for yield strategies on Solana. Build, backtest, and deploy yield vaults — no code required.

## Supported Strategies

| Strategy | Risk | Expected APY | Status |
|----------|------|-------------|--------|
| Covered Call | Low-Medium | 8-15% | Planned |
| Delta Neutral | Low | 5-10% | Planned |
| Leveraged Staking | Medium | 12-25% | Planned |
| Basis Trade | Low-Medium | 10-20% | Planned |

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
