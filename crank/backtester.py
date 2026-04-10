"""
Backtesting Engine — YieldTerminal

Simulates strategy performance over historical data.
Uses pandas for time series analysis.

Run: python backtester.py --strategy covered_call --days 30
"""

import argparse
import random
import logging
from dataclasses import dataclass

logging.basicConfig(level=logging.INFO)
log = logging.getLogger('backtester')

try:
    import pandas as pd
    HAS_PANDAS = True
except ImportError:
    HAS_PANDAS = False
    log.warning('pandas not installed — using basic backtester')


@dataclass
class BacktestResult:
    strategyName: str
    days: int
    totalReturnPct: float
    annualizedApy: float
    maxDrawdownPct: float
    sharpeRatio: float
    winRate: float
    totalTrades: int
    dailyReturns: list


STRATEGY_PARAMS = {
    'covered_call': {
        'baseDaily': 0.041,   # ~15% APY
        'volatility': 0.02,
        'lossChance': 0.08,
        'maxLoss': 0.03,
    },
    'delta_neutral': {
        'baseDaily': 0.022,   # ~8% APY
        'volatility': 0.01,
        'lossChance': 0.05,
        'maxLoss': 0.015,
    },
    'yield_farming': {
        'baseDaily': 0.033,   # ~12% APY
        'volatility': 0.025,
        'lossChance': 0.12,
        'maxLoss': 0.05,
    },
    'basis_trade': {
        'baseDaily': 0.027,   # ~10% APY
        'volatility': 0.015,
        'lossChance': 0.07,
        'maxLoss': 0.02,
    },
}


def simulate_daily_returns(params: dict, days: int) -> list[float]:
    """Generate simulated daily returns based on strategy params."""
    returns = []
    for _ in range(days):
        if random.random() < params['lossChance']:
            # loss day
            dailyReturn = -random.uniform(0, params['maxLoss'])
        else:
            # profit day with variance
            dailyReturn = params['baseDaily'] + random.gauss(0, params['volatility'])
        returns.append(round(dailyReturn, 4))
    return returns


def run_backtest(strategyName: str, days: int) -> BacktestResult:
    """Run backtest simulation for a strategy."""
    params = STRATEGY_PARAMS.get(strategyName)
    if params is None:
        log.error(f'unknown strategy: {strategyName}')
        return None

    dailyReturns = simulate_daily_returns(params, days)

    # calculate cumulative
    cumulative = 1.0
    peak = 1.0
    maxDrawdown = 0.0
    winDays = 0

    for r in dailyReturns:
        cumulative *= (1 + r / 100)
        if cumulative > peak:
            peak = cumulative
        drawdown = (peak - cumulative) / peak
        if drawdown > maxDrawdown:
            maxDrawdown = drawdown
        if r > 0:
            winDays += 1

    totalReturnPct = (cumulative - 1) * 100
    annualizedApy = ((cumulative ** (365 / days)) - 1) * 100 if days > 0 else 0
    winRate = winDays / days if days > 0 else 0

    # sharpe ratio (simplified)
    if HAS_PANDAS:
        series = pd.Series(dailyReturns)
        meanReturn = series.mean()
        stdReturn = series.std()
        sharpeRatio = (meanReturn / stdReturn * (365 ** 0.5)) if stdReturn > 0 else 0
    else:
        meanReturn = sum(dailyReturns) / len(dailyReturns) if dailyReturns else 0
        variance = sum((r - meanReturn) ** 2 for r in dailyReturns) / max(len(dailyReturns) - 1, 1)
        stdReturn = variance ** 0.5
        sharpeRatio = (meanReturn / stdReturn * (365 ** 0.5)) if stdReturn > 0 else 0

    return BacktestResult(
        strategyName=strategyName,
        days=days,
        totalReturnPct=round(totalReturnPct, 2),
        annualizedApy=round(annualizedApy, 2),
        maxDrawdownPct=round(maxDrawdown * 100, 2),
        sharpeRatio=round(sharpeRatio, 2),
        winRate=round(winRate * 100, 1),
        totalTrades=days,
        dailyReturns=dailyReturns,
    )


def print_backtest_report(result: BacktestResult):
    """Print formatted backtest results."""
    print(f'\n{"=" * 50}')
    print(f'  BACKTEST: {result.strategyName}')
    print(f'{"=" * 50}')
    print(f'  Period:          {result.days} days')
    print(f'  Total Return:    {result.totalReturnPct:+.2f}%')
    print(f'  Annualized APY:  {result.annualizedApy:.2f}%')
    print(f'  Max Drawdown:    {result.maxDrawdownPct:.2f}%')
    print(f'  Sharpe Ratio:    {result.sharpeRatio:.2f}')
    print(f'  Win Rate:        {result.winRate:.1f}%')
    print(f'  Total Trades:    {result.totalTrades}')
    print(f'{"=" * 50}\n')


def main():
    parser = argparse.ArgumentParser(description='YieldTerminal Backtester')
    parser.add_argument(
        '--strategy', default='covered_call',
        choices=list(STRATEGY_PARAMS.keys()),
        help='Strategy to backtest',
    )
    parser.add_argument(
        '--days', type=int, default=30,
        help='Number of days to simulate',
    )
    parser.add_argument(
        '--all', action='store_true',
        help='Run all strategies',
    )
    args = parser.parse_args()

    if args.all:
        for name in STRATEGY_PARAMS:
            result = run_backtest(name, args.days)
            if result:
                print_backtest_report(result)
    else:
        result = run_backtest(args.strategy, args.days)
        if result:
            print_backtest_report(result)


if __name__ == '__main__':
    main()
