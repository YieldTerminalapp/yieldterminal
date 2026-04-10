import { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

function generateBacktestData() {
  const data = [];
  let value = 10000;
  for (let i = 0; i <= 30; i++) {
    const dailyReturn = (Math.random() - 0.45) * 0.02;
    value = value * (1 + dailyReturn);
    data.push({
      day: i,
      portfolio: Math.round(value),
      benchmark: Math.round(10000 * (1 + 0.001 * i)),
    });
  }
  return data;
}

export default function BacktestPage() {
  const data = useMemo(() => generateBacktestData(), []);
  const finalValue = data[data.length - 1].portfolio;
  const totalReturn = ((finalValue - 10000) / 10000 * 100).toFixed(2);
  const maxDrawdown = Math.min(...data.map((d) => (d.portfolio - 10000) / 10000 * 100)).toFixed(2);
  const sharpe = (parseFloat(totalReturn) / Math.abs(parseFloat(maxDrawdown)) * 1.5).toFixed(2);

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-xs text-gray-500 font-bold tracking-widest mb-4">BACKTEST RESULTS</h1>

      <div className="grid grid-cols-4 gap-3 mb-6">
        <div className="bg-navy-800 border border-navy-700 rounded-lg p-4">
          <div className="text-[10px] text-gray-500 tracking-wider mb-1">RETURN</div>
          <div className={`text-lg font-bold ${parseFloat(totalReturn) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {parseFloat(totalReturn) >= 0 ? '+' : ''}{totalReturn}%
          </div>
        </div>
        <div className="bg-navy-800 border border-navy-700 rounded-lg p-4">
          <div className="text-[10px] text-gray-500 tracking-wider mb-1">FINAL VALUE</div>
          <div className="text-lg font-bold text-white">${finalValue.toLocaleString()}</div>
        </div>
        <div className="bg-navy-800 border border-navy-700 rounded-lg p-4">
          <div className="text-[10px] text-gray-500 tracking-wider mb-1">MAX DRAWDOWN</div>
          <div className="text-lg font-bold text-red-400">{maxDrawdown}%</div>
        </div>
        <div className="bg-navy-800 border border-navy-700 rounded-lg p-4">
          <div className="text-[10px] text-gray-500 tracking-wider mb-1">SHARPE RATIO</div>
          <div className="text-lg font-bold text-accent">{sharpe}</div>
        </div>
      </div>

      <div className="bg-navy-800 border border-navy-700 rounded-xl p-6">
        <h2 className="text-sm font-semibold text-gray-400 mb-4">Portfolio vs Benchmark (30 days)</h2>
        <ResponsiveContainer width="100%" height={350}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis dataKey="day" stroke="#475569" tick={{ fontSize: 11 }} label={{ value: 'Day', position: 'insideBottom', offset: -5, fill: '#475569', fontSize: 11 }} />
            <YAxis stroke="#475569" tick={{ fontSize: 11 }} />
            <Tooltip
              contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', fontSize: '12px' }}
              labelStyle={{ color: '#94a3b8' }}
            />
            <Line type="monotone" dataKey="portfolio" stroke="#3b82f6" strokeWidth={2} dot={false} name="Strategy" />
            <Line type="monotone" dataKey="benchmark" stroke="#475569" strokeWidth={1} dot={false} strokeDasharray="5 5" name="Benchmark" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-4 text-center">
        <p className="text-xs text-gray-600">Simulated 30-day backtest. Past performance is not indicative of future results.</p>
      </div>
    </div>
  );
}
