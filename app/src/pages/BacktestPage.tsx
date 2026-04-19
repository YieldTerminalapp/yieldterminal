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
    code: 'A·I',
    label: 'COVERED CALL · mSOL',
    thesis: 'Stake SOL into mSOL, sell weekly covered calls on Drift to harvest option premium. Gives up unlimited upside for yield consistency.',
    blocks: [BLOCKS[0], BLOCKS[2]],
    strategy: 'coveredCall',
  },
  {
    key: 'delta_neutral',
    code: 'A·II',
    label: 'DELTA-NEUTRAL BASIS',
    thesis: 'Long mSOL (physical staking), short perp on the same notional, pocket the funding plus staking spread.',
    blocks: [BLOCKS[0], BLOCKS[1], BLOCKS[4]],
    strategy: 'deltaNeutral',
  },
  {
    key: 'yield_farm',
    code: 'A·III',
    label: 'CONCENTRATED LP',
    thesis: 'Kamino concentrated LP with lending overlay. Amplified fee capture; IL exposure is the price.',
    blocks: [BLOCKS[3], BLOCKS[1]],
    strategy: 'yieldFarm',
  },
  {
    key: 'pure_staking',
    code: 'A·IV',
    label: 'PURE STAKING',
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

  useEffect(() => {
    const ac = new AbortController();
    api.apy(ac.signal).then(setApy).catch(() => {});
    return () => ac.abort();
  }, []);

  const preset = PRESETS.find((p) => p.key === key)!;

  // Debounce slider-driven backtest — don't fire on every pixel of slider drag.
  useEffect(() => {
    const ac = new AbortController();
    setLoading(true); setErr(null);
    const t = setTimeout(async () => {
      try {
        const pcts = splitAllocation(preset.blocks.length);
        const payload = preset.blocks.map((b, i) => ({
          action: b.action.replace(/([A-Z])/g, '_$1').toLowerCase(),
          protocol: b.protocol,
          allocation_pct: pcts[i],
        }));
        const [r, rk] = await Promise.all([
          api.backtest(payload, days, runs, preset.strategy, ac.signal),
          api.risk(payload, preset.strategy, ac.signal),
        ]);
        setResult(r); setRisk(rk);
      } catch (e: any) {
        if (e?.name !== 'AbortError') setErr(e?.message || 'backtest failed');
      } finally {
        setLoading(false);
      }
    }, 280);

    return () => { clearTimeout(t); ac.abort(); };
  }, [key, days, runs, preset]);

  const chartPaths = useMemo(() => {
    if (!result) return null;
    const pts = result.equity_curve;
    const min = Math.min(...pts, 1) * 0.995;
    const max = Math.max(...pts, 1) * 1.005;
    const range = max - min || 1;
    const w = 1000, h = 380;
    const line = pts.map((v, i) => {
      const x = (i / (pts.length - 1)) * w;
      const y = h - ((v - min) / range) * h;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    const area = `${line} L${w},${h} L0,${h} Z`;
    const by = h - ((1 - min) / range) * h;
    return { line, area, baselineY: by, w, h };
  }, [result]);

  return (
    <div className="max-w-[1440px] mx-auto px-5 py-5">
      {/* header */}
      <div className="flex items-baseline justify-between border-b border-steel pb-3 mb-6">
        <div className="flex items-baseline gap-5">
          <span className="label !text-acid">F3 · RESEARCH</span>
          <h1 className="font-display text-3xl font-black tracking-tight">BACKTEST STUDIES</h1>
        </div>
        <div className="hidden md:block font-mono text-[10px] text-smoke uppercase tracking-widest2 max-w-md text-right">
          MONTE-CARLO · PROTOCOL-CALIBRATED VOLATILITY · STRATEGY OVERLAYS
        </div>
      </div>

      {/* preset tabs */}
      <div className="grid grid-cols-2 md:grid-cols-4 border border-steel divide-x divide-steel mb-5">
        {PRESETS.map((p) => {
          const active = p.key === key;
          return (
            <button
              key={p.key}
              onClick={() => setKey(p.key)}
              className={`px-4 py-4 text-left border-b border-steel md:border-b-0 transition-colors ${
                active ? 'bg-acid text-onyx' : 'bg-onyx hover:bg-graphite'
              }`}
            >
              <div className={`font-mono text-[9px] tracking-widest2 mb-1 ${active ? 'text-onyx/60' : 'text-smoke'}`}>{p.code}</div>
              <div className="font-display text-lg font-black tracking-tight leading-tight">{p.label}</div>
            </button>
          );
        })}
      </div>

      {/* abstract + composition */}
      <section className="grid md:grid-cols-12 gap-5 mb-5">
        <div className="md:col-span-7 border border-steel p-5">
          <div className="label mb-3">ABSTRACT</div>
          <p className="font-sans text-base text-silver/85 leading-relaxed first-letter:font-display first-letter:text-6xl first-letter:font-black first-letter:leading-[0.85] first-letter:float-left first-letter:mr-3 first-letter:mt-1 first-letter:text-acid">
            {preset.thesis}
          </p>
        </div>
        <div className="md:col-span-5 border border-steel">
          <div className="border-b border-steel px-4 py-2.5 flex items-baseline justify-between">
            <span className="label">COMPOSITION · FIG. A</span>
            <span className="font-mono text-[9px] text-smoke uppercase tracking-widest2">
              <span className="text-acid">●</span> LIVE · <span className="text-hazard">●</span> EST
            </span>
          </div>
          <div className="grid grid-cols-[40px_1fr_1fr_80px_60px] bg-coal/60 border-b border-steel font-mono text-[9px] uppercase tracking-widest2 text-smoke">
            <div className="px-3 py-2">#</div>
            <div className="px-3 py-2">PROTOCOL</div>
            <div className="px-3 py-2">ACTION</div>
            <div className="px-3 py-2 text-right">APY</div>
            <div className="px-3 py-2 text-right">W</div>
          </div>
          {preset.blocks.map((b, i) => {
            const live = apy?.[b.protocol];
            const pcts = splitAllocation(preset.blocks.length);
            return (
              <div key={i} className="grid grid-cols-[40px_1fr_1fr_80px_60px] border-b border-steel last:border-0 text-sm">
                <div className="num px-3 py-2 text-smoke">{(i + 1).toString().padStart(2, '0')}</div>
                <div className="px-3 py-2 font-sans">{b.protocol}</div>
                <div className="px-3 py-2 font-mono text-xs text-smoke">{b.label}</div>
                <div className="num px-3 py-2 text-right">
                  <span className={live?.source === 'live' ? 'text-acid' : 'text-hazard'}>
                    {live ? `${live.apy.toFixed(2)}%` : '—'}
                  </span>
                </div>
                <div className="num px-3 py-2 text-right text-acid">{pcts[i]}%</div>
              </div>
            );
          })}
        </div>
      </section>

      {/* parameters */}
      <section className="mb-5 border border-steel">
        <div className="border-b border-steel px-4 py-2.5">
          <span className="label">PARAMETERS</span>
        </div>
        <div className="grid md:grid-cols-2 divide-x divide-steel">
          <div className="p-5">
            <div className="flex items-baseline justify-between mb-3">
              <label className="label">OBSERVATION WINDOW · DAYS</label>
              <span className="num font-display text-2xl font-black">{days}</span>
            </div>
            <input type="range" min="7" max="180" value={days} onChange={(e) => setDays(parseInt(e.target.value))} className="w-full" />
            <div className="flex justify-between font-mono text-[9px] text-smoke mt-1 tracking-widest2">
              <span>7</span><span>90</span><span>180</span>
            </div>
          </div>
          <div className="p-5">
            <div className="flex items-baseline justify-between mb-3">
              <label className="label">MONTE-CARLO TRIALS · n</label>
              <span className="num font-display text-2xl font-black">{runs}</span>
            </div>
            <input type="range" min="20" max="500" step="20" value={runs} onChange={(e) => setRuns(parseInt(e.target.value))} className="w-full" />
            <div className="flex justify-between font-mono text-[9px] text-smoke mt-1 tracking-widest2">
              <span>20</span><span>250</span><span>500</span>
            </div>
          </div>
        </div>
      </section>

      {err && <div className="border border-blood text-blood font-mono text-xs px-4 py-3 mb-4 uppercase">{err}</div>}

      {result && (
        <>
          <section className="mb-5 border border-steel">
            <div className="border-b border-steel px-4 py-2.5 flex items-baseline justify-between">
              <span className="label !text-acid">§ I · HEADLINE STATISTICS</span>
              <span className="font-mono text-[10px] text-smoke uppercase tracking-widest2">n={runs} · T={days}D</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 divide-y md:divide-y-0 md:divide-x divide-steel">
              <BigStat label="TOTAL RETURN" value={`${result.total_return_pct >= 0 ? '+' : ''}${result.total_return_pct}%`} tone={result.total_return_pct >= 0 ? 'up' : 'down'} />
              <BigStat label="ANNUALIZED" value={`${result.annualized_apy}%`} tone="accent" />
              <BigStat label="SHARPE" value={result.sharpe_ratio.toFixed(2)} tone={result.sharpe_ratio >= 1 ? 'up' : result.sharpe_ratio < 0 ? 'down' : 'neutral'} />
              <BigStat label="MAX DRAWDOWN" value={`−${result.max_drawdown_pct}%`} tone="down" />
              <BigStat label="WIN RATE" value={`${result.win_rate}%`} tone="neutral" />
            </div>
          </section>

          <section className="mb-5 border border-steel">
            <div className="border-b border-steel px-4 py-2.5 flex items-baseline justify-between">
              <span className="label !text-acid">§ II · EQUITY CURVE · FIG. 1</span>
              <span className={`font-mono text-[10px] uppercase tracking-widest2 ${loading ? 'text-acid animate-pulse' : 'text-smoke'}`}>
                {loading ? 'RE-RUNNING SIMULATION…' : `AVERAGED ${runs} TRIALS`}
              </span>
            </div>
            <div className="p-5 bg-coal">
              {chartPaths && (
                <svg viewBox={`0 0 ${chartPaths.w} ${chartPaths.h + 20}`} className="w-full h-auto">
                  <defs>
                    <linearGradient id="equityFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#D4FF00" stopOpacity="0.18" />
                      <stop offset="100%" stopColor="#D4FF00" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  {/* grid */}
                  {[0.25, 0.5, 0.75].map((t) => (
                    <line key={t} x1={0} y1={chartPaths.h * t} x2={chartPaths.w} y2={chartPaths.h * t} stroke="#242424" strokeWidth="0.5" strokeDasharray="2 4" />
                  ))}
                  <line x1={0} y1={chartPaths.baselineY} x2={chartPaths.w} y2={chartPaths.baselineY} stroke="#6B6B6B" strokeWidth="0.5" strokeDasharray="4 2" />
                  <text x={chartPaths.w - 6} y={chartPaths.baselineY - 6} fontSize="10" fontFamily="Martian Mono" fill="#6B6B6B" textAnchor="end">BASELINE · 1.0</text>

                  <path d={chartPaths.area} fill="url(#equityFill)" />
                  <path d={chartPaths.line} fill="none" stroke="#D4FF00" strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" />

                  <text x={0} y={chartPaths.h + 14} fontSize="9" fontFamily="Martian Mono" fill="#6B6B6B">T = 0</text>
                  <text x={chartPaths.w} y={chartPaths.h + 14} fontSize="9" fontFamily="Martian Mono" fill="#6B6B6B" textAnchor="end">T = {days}D</text>
                </svg>
              )}
            </div>
            <div className="border-t border-steel px-4 py-2 font-mono text-[10px] text-smoke uppercase tracking-widest2">
              FIG. 1 — MONTE-CARLO AVERAGED EQUITY CURVE ({preset.label}). DEVIATION ABOVE BASELINE = CUMULATIVE P&L
            </div>
          </section>

          {risk && (
            <section className="mb-5 border border-steel">
              <div className="border-b border-steel px-4 py-2.5">
                <span className="label !text-acid">§ III · RISK PROFILE</span>
              </div>
              <div className="grid md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-steel">
                <div className="p-5">
                  <div className="label mb-2">LABEL</div>
                  <div className={`font-display text-3xl font-black ${riskColor(risk.label).split(' ')[0]}`}>{risk.label.toUpperCase()}</div>
                  <div className="font-mono text-[10px] text-smoke mt-2 uppercase tracking-widest2">COMPOSITE {risk.score}/100</div>
                </div>
                <div className="p-5">
                  <div className="label mb-2">1-DAY VaR · 95%</div>
                  <div className="num font-display text-3xl font-black text-blood">−{risk.var_1d_pct}%</div>
                  <div className="font-mono text-[10px] text-smoke mt-2 uppercase tracking-widest2">DAILY TAIL-LOSS</div>
                </div>
                <div className="p-5">
                  <div className="label mb-2">MARKET β · SOL</div>
                  <div className="num font-display text-3xl font-black text-cobalt">{risk.sol_beta}</div>
                  <div className="font-mono text-[10px] text-smoke mt-2 uppercase tracking-widest2">CORRELATION W/ SOL SPOT</div>
                </div>
              </div>
              {risk.notes.length > 0 && (
                <ol className="border-t border-steel font-mono text-[11px] text-smoke uppercase tracking-wider list-none">
                  {risk.notes.map((n, i) => (
                    <li key={i} className="border-b border-steel last:border-0 px-4 py-2">
                      <span className="num text-smoke mr-3">[{(i + 1).toString().padStart(2, '0')}]</span>{n}
                    </li>
                  ))}
                </ol>
              )}
            </section>
          )}

          <section className="border-t border-steel pt-4 font-mono text-[10px] text-smoke uppercase tracking-widest2 leading-relaxed">
            <span className="text-silver">METHOD · DATA —</span>{' '}
            Monte-Carlo simulation with protocol-calibrated daily volatility σ, loss-day probability p, and max-loss cap.
            Marinade APY sourced from api.marinade.finance (30d rolling); Kamino / Drift / Jupiter use last-observed estimates.
            Strategy-type overlay adds a flat daily option-premium yield (covered call), a 0.55× vol damper (delta-neutral),
            or a 1.15× amplification (yield farm). PAST BACKTEST PERFORMANCE IS NOT INDICATIVE OF FUTURE RETURNS.
          </section>
        </>
      )}
    </div>
  );
}

function riskColor(label: string): string {
  return {
    Conservative: 'text-acid',
    Moderate:     'text-hazard',
    Aggressive:   'text-blood',
    Speculative:  'text-blood',
  }[label] || 'text-smoke';
}

function BigStat({ label, value, tone }: { label: string; value: string; tone: 'up' | 'down' | 'neutral' | 'accent' }) {
  const color = tone === 'up' ? 'text-acid' : tone === 'down' ? 'text-blood' : tone === 'accent' ? 'text-cobalt' : 'text-silver';
  return (
    <div className="px-5 py-6">
      <div className="label mb-2">{label}</div>
      <div className={`num font-display text-3xl font-black leading-none ${color}`}>{value}</div>
    </div>
  );
}
