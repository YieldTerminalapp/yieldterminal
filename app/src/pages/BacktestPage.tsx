import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, BacktestResult, ApyRow, RiskResult } from '../lib/api';
import { BLOCKS, BlockType, splitAllocation, StrategyKind } from '../lib/strategy';

interface Preset {
  key: string;
  code: string;
  label: string;
  thesis: string;
  blocks: BlockType[];
  strategy: StrategyKind;
}

const PRESETS: Preset[] = [
  {
    key: 'covered_call',
    code: 'A–I',
    label: 'Covered-call mSOL',
    thesis: 'Stake SOL into mSOL, sell weekly covered calls on Drift to harvest option premium. Gives up unlimited upside for yield consistency.',
    blocks: [BLOCKS[0], BLOCKS[2]],
    strategy: 'coveredCall',
  },
  {
    key: 'delta_neutral',
    code: 'A–II',
    label: 'Delta-neutral basis',
    thesis: 'Long mSOL (physical staking), short perp on the same notional, pocket the funding + staking spread.',
    blocks: [BLOCKS[0], BLOCKS[1], BLOCKS[4]],
    strategy: 'deltaNeutral',
  },
  {
    key: 'yield_farm',
    code: 'A–III',
    label: 'Concentrated LP',
    thesis: 'Kamino concentrated LP with lending overlay. Amplified fee capture; IL exposure is the price.',
    blocks: [BLOCKS[3], BLOCKS[1]],
    strategy: 'yieldFarm',
  },
  {
    key: 'pure_staking',
    code: 'A–IV',
    label: 'Pure staking',
    thesis: 'Baseline: 100% Marinade staking. The reference curve every other strategy should beat on risk-adjusted terms.',
    blocks: [BLOCKS[0]],
    strategy: 'deltaNeutral',
  },
];

export default function BacktestPage() {
  const [key, setKey] = useState('covered_call');
  const [days, setDays] = useState(30);
  const [runs, setRuns] = useState(100);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [risk, setRisk] = useState<RiskResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [apy, setApy] = useState<Record<string, ApyRow> | null>(null);

  useEffect(() => { api.apy().then(setApy).catch(() => {}); }, []);

  const preset = PRESETS.find((p) => p.key === key)!;

  const run = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const pcts = splitAllocation(preset.blocks.length);
      const payload = preset.blocks.map((b, i) => ({
        action: b.action.replace(/([A-Z])/g, '_$1').toLowerCase(),
        protocol: b.protocol,
        allocation_pct: pcts[i],
      }));
      const [r, rk] = await Promise.all([
        api.backtest(payload, days, runs, preset.strategy),
        api.risk(payload, preset.strategy),
      ]);
      setResult(r);
      setRisk(rk);
    } catch (e: any) {
      setErr(e?.message || 'backtest failed');
    } finally {
      setLoading(false);
    }
  }, [key, days, runs, preset]);

  useEffect(() => { run(); }, [run]);

  // equity curve chart paths
  const chartPaths = useMemo(() => {
    if (!result) return null;
    const pts = result.equity_curve;
    const min = Math.min(...pts, 1) * 0.995;
    const max = Math.max(...pts, 1) * 1.005;
    const range = max - min || 1;
    const w = 800, h = 340;
    const line = pts.map((v, i) => {
      const x = (i / (pts.length - 1)) * w;
      const y = h - ((v - min) / range) * h;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    // baseline at equity=1.0
    const by = h - ((1 - min) / range) * h;
    return { line, baselineY: by, w, h, min, max };
  }, [result]);

  return (
    <div className="max-w-[1200px] mx-auto px-6 py-8">
      {/* paper masthead */}
      <div className="border-b-[3px] border-double border-ink pb-4 mb-8 flex items-baseline justify-between">
        <div>
          <div className="label mb-1">§ 03 · Research</div>
          <h1 className="display text-5xl font-light leading-none">Backtest <span className="italic">studies</span></h1>
        </div>
        <div className="text-right font-mono text-xs text-ash max-w-sm hidden md:block">
          Monte-Carlo simulation over protocol-calibrated volatility and loss profiles.<br />
          Strategy type overlays premium yield, vol damping, or farm amplification.
        </div>
      </div>

      {/* preset tabs */}
      <div className="grid grid-cols-2 md:grid-cols-4 border border-ink divide-x divide-ink mb-6">
        {PRESETS.map((p) => {
          const active = p.key === key;
          return (
            <button
              key={p.key}
              onClick={() => setKey(p.key)}
              className={`px-4 py-4 text-left border-b border-ink md:border-b-0 transition-colors ${
                active ? 'bg-ink text-paper' : 'bg-paper hover:bg-cream'
              }`}
            >
              <div className={`label ${active ? '!text-paper/70' : ''}`}>{p.code}</div>
              <div className="display text-lg leading-tight mt-0.5">{p.label}</div>
            </button>
          );
        })}
      </div>

      {/* abstract + composition */}
      <section className="grid md:grid-cols-12 gap-8 mb-10 border-b border-ink pb-10">
        <div className="md:col-span-7">
          <div className="label mb-3">Abstract</div>
          <p className="font-sans text-[17px] leading-relaxed text-ink/85 italic first-letter:display first-letter:text-6xl first-letter:leading-[0.85] first-letter:float-left first-letter:mr-2 first-letter:mt-1 first-letter:font-normal">
            {preset.thesis}
          </p>
        </div>
        <div className="md:col-span-5">
          <div className="label mb-3">Composition · fig. A</div>
          <table className="w-full border border-ink">
            <thead>
              <tr className="border-b border-ink">
                <th className="label text-left px-3 py-1.5 font-normal">#</th>
                <th className="label text-left px-3 py-1.5 font-normal">Protocol</th>
                <th className="label text-left px-3 py-1.5 font-normal">Action</th>
                <th className="label text-right px-3 py-1.5 font-normal">Live APY</th>
                <th className="label text-right px-3 py-1.5 font-normal">W</th>
              </tr>
            </thead>
            <tbody>
              {preset.blocks.map((b, i) => {
                const live = apy?.[b.protocol];
                const pcts = splitAllocation(preset.blocks.length);
                return (
                  <tr key={i} className="border-b border-rule last:border-0">
                    <td className="num px-3 py-2 text-ash">{(i + 1).toString().padStart(2, '0')}</td>
                    <td className="px-3 py-2 font-sans">{b.protocol}</td>
                    <td className="px-3 py-2 font-mono text-xs text-ash">{b.label}</td>
                    <td className="num px-3 py-2 text-right">
                      <span className={live?.source === 'live' ? 'text-leaf' : 'text-amber'}>
                        {live ? `${live.apy.toFixed(2)}%` : '—'}
                      </span>
                    </td>
                    <td className="num px-3 py-2 text-right">{pcts[i]}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="font-mono text-[10px] text-ash mt-2">
            <span className="text-leaf">●</span> live · <span className="text-amber">●</span> estimate
          </div>
        </div>
      </section>

      {/* parameters */}
      <section className="mb-10">
        <div className="label mb-4">Parameters</div>
        <div className="grid md:grid-cols-2 gap-10 border border-ink p-6">
          <div>
            <div className="flex items-baseline justify-between mb-2">
              <label className="label text-[10px]">Observation window · days</label>
              <span className="num text-2xl display">{days}</span>
            </div>
            <input type="range" min="7" max="180" value={days} onChange={(e) => setDays(parseInt(e.target.value))} className="w-full" />
            <div className="flex justify-between font-mono text-[10px] text-ash mt-1">
              <span>7</span><span>90</span><span>180</span>
            </div>
          </div>
          <div>
            <div className="flex items-baseline justify-between mb-2">
              <label className="label text-[10px]">Monte-Carlo trials · n</label>
              <span className="num text-2xl display">{runs}</span>
            </div>
            <input type="range" min="20" max="500" step="20" value={runs} onChange={(e) => setRuns(parseInt(e.target.value))} className="w-full" />
            <div className="flex justify-between font-mono text-[10px] text-ash mt-1">
              <span>20</span><span>250</span><span>500</span>
            </div>
          </div>
        </div>
      </section>

      {/* results */}
      {err && <div className="border border-rust text-rust font-mono text-xs px-4 py-3 mb-6">{err}</div>}

      {result && (
        <>
          <section className="mb-10">
            <div className="flex items-baseline justify-between mb-4">
              <div className="label">§ I · Headline statistics</div>
              <div className="font-mono text-[10px] text-ash">n={runs} trials, T={days}d</div>
            </div>
            <div className="border border-ink">
              <div className="grid grid-cols-2 md:grid-cols-5 divide-y md:divide-y-0 md:divide-x divide-ink">
                <BigStat label="Total return" value={`${result.total_return_pct >= 0 ? '+' : ''}${result.total_return_pct}%`} tone={result.total_return_pct >= 0 ? 'up' : 'down'} />
                <BigStat label="Annualized" value={`${result.annualized_apy}%`} tone="accent" />
                <BigStat label="Sharpe" value={result.sharpe_ratio.toFixed(2)} tone={result.sharpe_ratio >= 1 ? 'up' : result.sharpe_ratio < 0 ? 'down' : 'neutral'} />
                <BigStat label="Max drawdown" value={`−${result.max_drawdown_pct}%`} tone="down" />
                <BigStat label="Win rate" value={`${result.win_rate}%`} tone="neutral" />
              </div>
            </div>
          </section>

          <section className="mb-10">
            <div className="flex items-baseline justify-between mb-4">
              <div className="label">§ II · Equity curve (fig. 1)</div>
              <div className={`font-mono text-[10px] ${loading ? 'text-rust animate-pulse' : 'text-ash'}`}>
                {loading ? 're-running simulation…' : `averaged across ${runs} trials`}
              </div>
            </div>
            <div className="border border-ink p-6 bg-paper">
              {chartPaths && (
                <svg viewBox={`0 0 ${chartPaths.w} ${chartPaths.h + 20}`} className="w-full h-auto">
                  {/* grid */}
                  {[0.25, 0.5, 0.75].map((t) => (
                    <line key={t} x1={0} y1={chartPaths.h * t} x2={chartPaths.w} y2={chartPaths.h * t} stroke="#D9D3C6" strokeWidth="0.5" strokeDasharray="2 4" />
                  ))}
                  <line x1={0} y1={chartPaths.baselineY} x2={chartPaths.w} y2={chartPaths.baselineY} stroke="#8A7F6E" strokeWidth="0.5" strokeDasharray="4 2" />
                  <text x={chartPaths.w - 4} y={chartPaths.baselineY - 4} fontSize="9" fontFamily="Geist Mono" fill="#8A7F6E" textAnchor="end">baseline · 1.0</text>

                  <path d={chartPaths.line} fill="none" stroke="#0E0C0A" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />

                  {/* x-axis label */}
                  <text x={0} y={chartPaths.h + 14} fontSize="9" fontFamily="Geist Mono" fill="#8A7F6E">t = 0</text>
                  <text x={chartPaths.w} y={chartPaths.h + 14} fontSize="9" fontFamily="Geist Mono" fill="#8A7F6E" textAnchor="end">t = {days}d</text>
                </svg>
              )}
            </div>
            <div className="font-mono text-[11px] text-ash mt-2 italic">
              Fig. 1 — Monte-Carlo averaged equity curve (strategy: {preset.label}).
              The hairline baseline is unit capital (1.0); deviation above/below shows cumulative P&L.
            </div>
          </section>

          {risk && (
            <section className="mb-10">
              <div className="flex items-baseline justify-between mb-4">
                <div className="label">§ III · Risk profile</div>
              </div>
              <div className="grid md:grid-cols-3 gap-0 border border-ink divide-x divide-ink">
                <div className="p-5">
                  <div className="label mb-2">Label</div>
                  <div className="display text-3xl">{risk.label}</div>
                  <div className="font-mono text-xs text-ash mt-1">composite score {risk.score}/100</div>
                </div>
                <div className="p-5">
                  <div className="label mb-2">1-day VaR (95%)</div>
                  <div className="num display text-3xl text-rust">−{risk.var_1d_pct}%</div>
                  <div className="font-mono text-xs text-ash mt-1">daily tail-loss at 95% confidence</div>
                </div>
                <div className="p-5">
                  <div className="label mb-2">Market β (SOL)</div>
                  <div className="num display text-3xl text-cobalt">{risk.sol_beta}</div>
                  <div className="font-mono text-xs text-ash mt-1">correlation with SOL spot</div>
                </div>
              </div>
              {risk.notes.length > 0 && (
                <ol className="mt-4 border-t border-rule pt-3 font-mono text-xs text-ash italic list-none">
                  {risk.notes.map((n, i) => (
                    <li key={i} className="border-b border-rule py-1.5 last:border-0">
                      <span className="num mr-2 text-ink/60">[{(i + 1).toString().padStart(2, '0')}]</span>{n}
                    </li>
                  ))}
                </ol>
              )}
            </section>
          )}

          {/* footnote */}
          <section className="border-t border-ink pt-5 font-mono text-[11px] text-ash italic leading-relaxed">
            <div className="label mb-2 not-italic">Method · data</div>
            Monte-Carlo simulation with protocol-calibrated daily volatility σ, loss-day probability p, and max-loss cap.
            Marinade APY sourced from api.marinade.finance (30d rolling); Kamino / Drift / Jupiter use last-observed estimates.
            Strategy-type overlay adds a flat daily option-premium yield (covered call), a 0.55× volatility damper (delta-neutral),
            or a 1.15× amplification (yield farm). Past backtest performance is not indicative of future returns.
          </section>
        </>
      )}
    </div>
  );
}

function BigStat({ label, value, tone }: { label: string; value: string; tone: 'up' | 'down' | 'neutral' | 'accent' }) {
  const color = tone === 'up' ? 'text-leaf' : tone === 'down' ? 'text-rust' : tone === 'accent' ? 'text-cobalt' : 'text-ink';
  return (
    <div className="px-5 py-6">
      <div className="label mb-1">{label}</div>
      <div className={`num display text-3xl font-light ${color} leading-none`}>{value}</div>
    </div>
  );
}
