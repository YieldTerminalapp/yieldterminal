import { useCallback, useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { api, BacktestResult, ApyRow } from '../lib/api';
import { BLOCKS, BlockType, splitAllocation } from '../lib/strategy';

// Canned compositions the user can backtest without the builder.
const PRESETS: { key: string; label: string; blocks: BlockType[] }[] = [
  { key: 'covered_call', label: 'Covered Call', blocks: [BLOCKS[0], BLOCKS[2]] },
  { key: 'delta_neutral', label: 'Delta Neutral', blocks: [BLOCKS[0], BLOCKS[1], BLOCKS[4]] },
  { key: 'yield_farm', label: 'Yield Farm', blocks: [BLOCKS[3], BLOCKS[1]] },
  { key: 'pure_staking', label: 'Pure Staking', blocks: [BLOCKS[0]] },
];

export default function BacktestPage() {
  const [presetKey, setPresetKey] = useState('covered_call');
  const [days, setDays] = useState(30);
  const [runs, setRuns] = useState(100);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [apy, setApy] = useState<Record<string, ApyRow> | null>(null);

  useEffect(() => { api.apy().then(setApy).catch(() => {}); }, []);

  const preset = PRESETS.find((p) => p.key === presetKey)!;

  const run = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const pcts = splitAllocation(preset.blocks.length);
      const payload = preset.blocks.map((b, i) => ({
        action: b.action.replace(/([A-Z])/g, '_$1').toLowerCase(),
        protocol: b.protocol,
        allocation_pct: pcts[i],
      }));
      const r = await api.backtest(payload, days, runs);
      setResult(r);
    } catch (e: any) {
      setErr(e?.message || 'backtest failed');
    } finally {
      setLoading(false);
    }
  }, [presetKey, days, runs, preset.blocks]);

  useEffect(() => { run(); }, [run]);

  const chartData = result?.equity_curve.map((v, i) => ({
    day: i,
    portfolio: Math.round(v * 10000),
    benchmark: Math.round(10000 * (1 + 0.0001 * i)),
  })) || [];

  return (
    <div className="max-w-5xl mx-auto p-6">
      <h1 className="text-xs text-gray-500 font-bold tracking-widest mb-4">BACKTEST</h1>

      {/* controls */}
      <div className="bg-navy-800 border border-navy-700 rounded-xl p-4 mb-4 grid md:grid-cols-3 gap-4">
        <div>
          <div className="text-[10px] text-gray-500 tracking-widest mb-2">STRATEGY</div>
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <button
                key={p.key}
                onClick={() => setPresetKey(p.key)}
                className={`text-xs px-3 py-1.5 rounded border transition-colors ${
                  presetKey === p.key
                    ? 'bg-accent/20 border-accent text-accent'
                    : 'bg-navy-900 border-navy-700 text-gray-400 hover:text-white'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="text-[10px] text-gray-500 tracking-widest mb-2">DAYS</div>
          <input
            type="range" min="7" max="180" value={days}
            onChange={(e) => setDays(parseInt(e.target.value))}
            className="w-full"
          />
          <div className="text-sm text-white">{days} days</div>
        </div>
        <div>
          <div className="text-[10px] text-gray-500 tracking-widest mb-2">MONTE CARLO RUNS</div>
          <input
            type="range" min="20" max="500" step="20" value={runs}
            onChange={(e) => setRuns(parseInt(e.target.value))}
            className="w-full"
          />
          <div className="text-sm text-white">{runs} runs</div>
        </div>
      </div>

      {/* composition inspector */}
      <div className="bg-navy-800 border border-navy-700 rounded-xl p-4 mb-4">
        <div className="text-[10px] text-gray-500 tracking-widest mb-3">COMPOSITION</div>
        <div className="grid md:grid-cols-4 gap-2">
          {preset.blocks.map((b, i) => {
            const liveApy = apy?.[b.protocol];
            const pcts = splitAllocation(preset.blocks.length);
            return (
              <div key={i} className="bg-navy-900 rounded border border-navy-700 p-2.5">
                <div className="text-[10px] uppercase tracking-wider" style={{ color: b.color }}>
                  {b.protocol}
                </div>
                <div className="text-sm text-white font-medium">{b.label}</div>
                <div className="text-[10px] text-gray-500 mt-1">
                  {pcts[i]}% · live APY {liveApy?.apy.toFixed(1) ?? '—'}% ({liveApy?.source || 'n/a'})
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* stats */}
      {err && <div className="text-xs text-red-400 bg-red-950/40 border border-red-500/30 rounded px-3 py-2 mb-4">{err}</div>}

      {result && (
        <>
          <div className="grid grid-cols-4 gap-3 mb-6">
            <StatCard label="TOTAL RETURN" value={`${result.total_return_pct >= 0 ? '+' : ''}${result.total_return_pct}%`} tone={result.total_return_pct >= 0 ? 'up' : 'down'} />
            <StatCard label="ANNUALIZED APY" value={`${result.annualized_apy}%`} tone="accent" />
            <StatCard label="SHARPE RATIO" value={result.sharpe_ratio.toFixed(2)} tone={result.sharpe_ratio >= 1 ? 'up' : 'neutral'} />
            <StatCard label="MAX DRAWDOWN" value={`-${result.max_drawdown_pct}%`} tone="down" />
          </div>

          <div className="bg-navy-800 border border-navy-700 rounded-xl p-6 mb-4">
            <h2 className="text-sm font-semibold text-gray-400 mb-4">
              {preset.label} · {days}d equity curve · averaged over {runs} monte-carlo runs
            </h2>
            <ResponsiveContainer width="100%" height={360}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="day" stroke="#475569" tick={{ fontSize: 11 }} label={{ value: 'Day', position: 'insideBottom', offset: -5, fill: '#475569', fontSize: 11 }} />
                <YAxis stroke="#475569" tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', fontSize: '12px' }}
                  labelStyle={{ color: '#94a3b8' }}
                />
                <ReferenceLine y={10000} stroke="#475569" strokeDasharray="2 4" />
                <Line type="monotone" dataKey="portfolio" stroke="#3b82f6" strokeWidth={2} dot={false} name={preset.label} />
                <Line type="monotone" dataKey="benchmark" stroke="#475569" strokeWidth={1} dot={false} strokeDasharray="5 5" name="Flat 0%" />
              </LineChart>
            </ResponsiveContainer>

            <div className="flex gap-4 mt-3 text-[11px] text-gray-500">
              <span>Win rate: <span className="text-white">{result.win_rate}%</span></span>
              <span>Protocols: <span className="text-white">{result.protocols_used.join(', ')}</span></span>
              <span className={loading ? 'text-accent animate-pulse' : ''}>{loading ? 're-running…' : ''}</span>
            </div>
          </div>
        </>
      )}

      <p className="text-center text-xs text-gray-600">
        Backtest uses live protocol APYs (Marinade API) + calibrated per-protocol volatility / drawdown profiles. Not financial advice.
      </p>
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: string; tone: 'up' | 'down' | 'neutral' | 'accent' }) {
  const color = tone === 'up' ? 'text-green-400' : tone === 'down' ? 'text-red-400' : tone === 'accent' ? 'text-accent' : 'text-white';
  return (
    <div className="bg-navy-800 border border-navy-700 rounded-lg p-4">
      <div className="text-[10px] text-gray-500 tracking-widest mb-1">{label}</div>
      <div className={`text-lg font-bold ${color}`}>{value}</div>
    </div>
  );
}
