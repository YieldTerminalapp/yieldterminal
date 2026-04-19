import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import { useVaultProgram } from '../lib/useProgram';
import { api, ApyRow } from '../lib/api';

interface ListedVault {
  name: string;
  strategy: string;
  tvl: number;
  perfBps: number;
  age_d: number;
  blocks: number;
}

function strategyLabel(v: any): string {
  const k = Object.keys(v || {})[0] || '';
  return k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()).trim();
}

export default function CoverIssuePage() {
  const vp = useVaultProgram();
  const [apy, setApy] = useState<Record<string, ApyRow> | null>(null);
  const [vaults, setVaults] = useState<ListedVault[]>([]);
  const [totalTvl, setTotalTvl] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => { api.apy().then(setApy).catch(() => {}); }, []);

  useEffect(() => {
    if (!vp) return;
    (async () => {
      try {
        const raw = await (vp.program.account as any).yieldVault.all();
        const parsed: ListedVault[] = raw.map((r: any) => ({
          name: r.account.name,
          strategy: strategyLabel(r.account.strategyType),
          tvl: Number(r.account.totalDeposits) / LAMPORTS_PER_SOL,
          perfBps: r.account.performanceBps,
          age_d: Math.max(1, (Date.now() / 1000 - Number(r.account.createdAt)) / 86400),
          blocks: r.account.strategyBlocks.length,
        }));
        parsed.sort((a, b) => b.tvl - a.tvl);
        setVaults(parsed);
        setTotalTvl(parsed.reduce((s, v) => s + v.tvl, 0));
      } catch (e) {
        console.warn('landing vaults:', e);
      } finally {
        setReady(true);
      }
    })();
  }, [vp]);

  const tapeItems = apy
    ? Object.values(apy).map((p) => ({ l: p.protocol.toUpperCase(), v: `${p.apy.toFixed(2)}%`, live: p.source === 'live' }))
    : [];
  const tape = [...tapeItems, ...tapeItems, ...tapeItems];

  return (
    <div>
      {/* TOP TAPE */}
      <div className="border-b border-steel bg-coal overflow-hidden">
        <div className="flex whitespace-nowrap tape py-2">
          {tape.map((t, i) => (
            <div key={i} className="flex items-baseline gap-3 px-6 font-mono text-[11px]">
              <span className={`inline-block w-1.5 h-1.5 ${t.live ? 'bg-acid' : 'bg-hazard'}`} />
              <span className="text-smoke tracking-widest2">{t.l}</span>
              <span className="num text-silver font-medium">{t.v}</span>
              <span className="text-steel">│</span>
            </div>
          ))}
          {tape.length === 0 && <div className="px-6 font-mono text-xs text-smoke">— CONNECTING TO AGGREGATOR —</div>}
        </div>
      </div>

      {/* HERO */}
      <section className="relative border-b border-steel overflow-hidden">
        <div className="absolute inset-0 grid-overlay opacity-[0.18] pointer-events-none" />
        <div className="relative max-w-[1440px] mx-auto px-5 pt-20 pb-16 md:pt-28 md:pb-24">
          <div className="grid md:grid-cols-12 gap-10 items-end">
            <div className="md:col-span-8 reveal">
              <div className="flex items-baseline gap-3 mb-8">
                <span className="label">ISSUE 001</span>
                <span className="label !text-acid">·</span>
                <span className="label">SOLANA DEVNET</span>
                <span className="label !text-acid">·</span>
                <span className="label">LIVE</span>
              </div>
              <h1 className="display text-[clamp(3.5rem,11vw,11rem)] leading-[0.82]">
                YIELD<br />
                <span className="text-acid">TERMINAL</span>
              </h1>
              <p className="mt-10 font-mono text-sm text-silver/70 uppercase tracking-widest2 leading-loose max-w-2xl">
                Composable yield strategies on Solana. <span className="text-acid">Drag primitives.</span> Backtest with monte-carlo. <span className="text-acid">Publish as a vault.</span>
              </p>

              <div className="mt-12 flex items-center gap-4 flex-wrap">
                <Link to="/app" className="bg-acid text-onyx px-8 py-4 font-mono text-xs uppercase tracking-widest2 font-semibold hover:bg-silver transition-colors inline-flex items-center gap-3">
                  <span>OPEN TERMINAL</span><span>→</span>
                </Link>
                <Link to="/backtest" className="px-6 py-4 font-mono text-xs uppercase tracking-widest2 text-silver border border-steel hover:border-acid hover:text-acid">
                  RUN A BACKTEST
                </Link>
              </div>
            </div>

            <aside className="md:col-span-4 border border-steel bg-coal/50 p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-steel pb-2">
                <span className="label !text-acid">STATUS</span>
                <span className="flex items-center gap-2 font-mono text-[10px] uppercase">
                  <span className="w-1.5 h-1.5 rounded-full bg-acid blink" />
                  <span>OPERATIONAL</span>
                </span>
              </div>
              <HudRow label="PROTOCOLS"    value="04" />
              <HudRow label="FUNDS LIVE"   value={vaults.length.toString().padStart(2, '0')} note={ready ? undefined : 'loading…'} />
              <HudRow label="TVL · DEVNET" value={totalTvl.toFixed(2)} suffix="SOL" />
              <HudRow label="CRANK TICK"   value="HOURLY" />
              <HudRow label="INDEXER"      value="45s" dot />
            </aside>
          </div>
        </div>
      </section>

      {/* PROCEDURE */}
      <section className="border-b border-steel">
        <div className="max-w-[1440px] mx-auto px-5 py-20">
          <div className="flex items-baseline justify-between border-b-2 border-silver pb-2 mb-12">
            <h2 className="font-display text-3xl font-black tracking-tight">PROCEDURE</h2>
            <span className="label">THREE STAGES · LEFT TO RIGHT</span>
          </div>
          <div className="grid md:grid-cols-3 gap-0 border border-steel">
            <Stage n="01" title="COMPOSE" acid
              body="Drag Stake, LP, Covered Call, Lend, or Hedge onto the canvas. Wire them. Allocation auto-splits to 100%." />
            <Stage n="02" title="BACKTEST"
              body="40 Monte-Carlo trials against protocol-calibrated volatility. Strategy type overlays option premium, vol damping, or farm amplification." />
            <Stage n="03" title="PUBLISH"
              body="One signature writes a PDA vault. Depositors mint tradable shares. The crank reports performance hourly, on-chain." />
          </div>
        </div>
      </section>

      {/* LIVE FUNDS GRID */}
      <section className="border-b border-steel">
        <div className="max-w-[1440px] mx-auto px-5 py-20">
          <div className="flex items-baseline justify-between border-b-2 border-silver pb-2 mb-8">
            <h2 className="font-display text-3xl font-black tracking-tight">FUNDS · LIVE</h2>
            <Link to="/vaults" className="font-mono text-xs uppercase tracking-widest2 text-silver hover:text-acid">
              ALL FUNDS →
            </Link>
          </div>

          {!ready && <div className="font-mono text-xs text-smoke uppercase tracking-widest2">— FETCHING ON-CHAIN —</div>}

          {ready && vaults.length === 0 && (
            <div className="border border-steel p-10 text-center">
              <div className="font-display text-2xl font-black mb-2">NO FUNDS PUBLISHED.</div>
              <Link to="/app" className="font-mono text-xs uppercase tracking-widest2 text-acid border-b border-acid">BE THE FIRST →</Link>
            </div>
          )}

          {vaults.length > 0 && (
            <div className="border border-steel">
              <div className="grid grid-cols-[60px_2fr_1fr_80px_120px_120px_80px] border-b border-steel bg-coal/80 font-mono text-[10px] uppercase tracking-widest2 text-smoke">
                <div className="px-4 py-3">№</div>
                <div className="px-4 py-3">NAME</div>
                <div className="px-4 py-3">THESIS</div>
                <div className="px-4 py-3 text-right">BLK</div>
                <div className="px-4 py-3 text-right">PERF (BPS)</div>
                <div className="px-4 py-3 text-right">TVL (SOL)</div>
                <div className="px-4 py-3 text-right">AGE</div>
              </div>
              {vaults.map((v, i) => (
                <div key={i} className="grid grid-cols-[60px_2fr_1fr_80px_120px_120px_80px] border-b border-steel last:border-0 hover:bg-graphite transition-colors">
                  <div className="px-4 py-3 num text-smoke text-sm">{(i + 1).toString().padStart(2, '0')}</div>
                  <div className="px-4 py-3 font-display font-black text-sm tracking-tight">{v.name}</div>
                  <div className="px-4 py-3 font-mono text-[10px] uppercase text-smoke tracking-widest2">{v.strategy}</div>
                  <div className="px-4 py-3 num text-right text-sm">{v.blocks}</div>
                  <div className={`px-4 py-3 num text-right text-sm ${v.perfBps >= 0 ? 'text-acid' : 'text-blood'}`}>
                    {v.perfBps >= 0 ? '+' : ''}{v.perfBps}
                  </div>
                  <div className="px-4 py-3 num text-right text-sm">{v.tvl.toFixed(4)}</div>
                  <div className="px-4 py-3 num text-right text-sm text-smoke">{v.age_d.toFixed(1)}d</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* THE DIFFERENCE */}
      <section className="border-b border-steel">
        <div className="max-w-[1440px] mx-auto px-5 py-20">
          <div className="flex items-baseline justify-between border-b-2 border-silver pb-2 mb-12">
            <h2 className="font-display text-3xl font-black tracking-tight">THE DIFFERENCE</h2>
            <span className="label">WHY NOT JUST DEPOSIT AND PRAY</span>
          </div>
          <div className="grid md:grid-cols-2 gap-0 border border-steel">
            <Pillar mark="A" title="REAL APY, NOT MARKETING APY"
              body="Marinade 30d API is live. Kamino, Drift, Jupiter use last-observed estimates — flagged so you never confuse a brochure with the order book." />
            <Pillar mark="B" title="MONTE CARLO, CALIBRATED"
              body="Each protocol has hand-tuned volatility, loss-chance, and max-loss. Strategy type overlays premium yield (covered call) or vol damping (delta-neutral)." acid />
            <Pillar mark="C" title="COMPOSABLE BY DESIGN"
              body="Every vault is a readable allocation: 50% Stake/Marinade + 30% LP/Kamino + 20% Sell-Call/Drift. Reverse-engineer any deployed thesis from its blocks." />
            <Pillar mark="D" title="TOKENIZED POSITIONS"
              body="Shares are PDAs — transferable between depositors. Build a secondary market, wrap them, or hand them off. The rails are on-chain." />
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 grid-overlay opacity-[0.12] pointer-events-none" />
        <div className="relative max-w-[1440px] mx-auto px-5 py-28 text-center">
          <div className="label mb-6">BEGIN</div>
          <h2 className="display text-[clamp(3rem,9vw,8rem)] leading-[0.85]">
            NINETY<br />
            <span className="text-acid">SECONDS.</span>
          </h2>
          <p className="mt-8 font-mono text-sm text-silver/70 uppercase tracking-widest2 max-w-xl mx-auto">
            That's the time it takes to draft, backtest, and publish your first strategy.
          </p>
          <div className="mt-12 flex items-center justify-center gap-4">
            <Link to="/app" className="bg-acid text-onyx px-10 py-4 font-mono text-xs uppercase tracking-widest2 font-semibold hover:bg-silver transition-colors inline-flex items-center gap-3">
              <span>ENTER TERMINAL</span><span>→</span>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

function HudRow({ label, value, suffix, note, dot }: { label: string; value: string; suffix?: string; note?: string; dot?: boolean }) {
  return (
    <div className="flex items-baseline justify-between border-b border-steel pb-2 last:border-0">
      <span className="label">{label}</span>
      <span className="flex items-baseline gap-1.5">
        {dot && <span className="w-1 h-1 rounded-full bg-acid blink" />}
        <span className="num text-lg font-medium text-silver">{value}</span>
        {suffix && <span className="font-mono text-[10px] text-smoke tracking-widest2">{suffix}</span>}
        {note && <span className="font-mono text-[10px] text-smoke">{note}</span>}
      </span>
    </div>
  );
}

function Stage({ n, title, body, acid }: { n: string; title: string; body: string; acid?: boolean }) {
  return (
    <div className={`p-8 md:border-r md:last:border-r-0 border-steel ${acid ? 'bg-acid text-onyx' : 'hover:bg-graphite transition-colors'}`}>
      <div className={`font-mono text-[10px] tracking-widest2 mb-6 ${acid ? 'text-onyx/60' : 'text-smoke'}`}>STAGE · {n}</div>
      <div className={`display text-5xl mb-4 ${acid ? 'text-onyx' : ''}`}>{title}</div>
      <p className={`font-mono text-xs leading-relaxed uppercase tracking-wider ${acid ? 'text-onyx/75' : 'text-silver/70'}`}>{body}</p>
    </div>
  );
}

function Pillar({ mark, title, body, acid }: { mark: string; title: string; body: string; acid?: boolean }) {
  return (
    <div className={`p-8 md:even:border-l md:[&:nth-child(n+3)]:border-t border-steel ${acid ? 'bg-acid text-onyx' : ''}`}>
      <div className="flex items-baseline gap-4 mb-3">
        <span className={`display text-5xl ${acid ? 'text-onyx' : 'text-acid'}`}>{mark}</span>
        <h3 className={`display text-xl leading-tight ${acid ? 'text-onyx' : ''}`}>{title}</h3>
      </div>
      <p className={`font-mono text-xs leading-relaxed uppercase tracking-wider mt-3 ${acid ? 'text-onyx/75' : 'text-silver/70'}`}>{body}</p>
    </div>
  );
}
