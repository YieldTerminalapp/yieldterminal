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

export default function LandingPage() {
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
        const parsed: ListedVault[] = raw.map((r: any) => {
          const tvl = Number(r.account.totalDeposits) / LAMPORTS_PER_SOL;
          const age = Math.max(1, (Date.now() / 1000 - Number(r.account.createdAt)) / 86400);
          return {
            name: r.account.name,
            strategy: strategyLabel(r.account.strategyType),
            tvl,
            perfBps: r.account.performanceBps,
            age_d: age,
            blocks: r.account.strategyBlocks.length,
          };
        });
        parsed.sort((a, b) => b.tvl - a.tvl);
        setVaults(parsed);
        setTotalTvl(parsed.reduce((s, v) => s + v.tvl, 0));
      } catch (e) {
        console.warn('landing vaults fetch:', e);
      } finally {
        setReady(true);
      }
    })();
  }, [vp]);

  const tickerItems = apy
    ? Object.values(apy).map((p) => ({ label: p.protocol.toUpperCase(), value: `${p.apy.toFixed(2)}%`, live: p.source === 'live' }))
    : [];
  // duplicate for seamless loop
  const tickerLoop = [...tickerItems, ...tickerItems];

  return (
    <>
      {/* ticker */}
      <div className="border-b border-ink bg-cream overflow-hidden">
        <div className="flex whitespace-nowrap ticker py-2.5">
          {tickerLoop.map((t, i) => (
            <div key={i} className="flex items-baseline gap-3 px-8 font-mono text-xs">
              <span className={`inline-block w-1.5 h-1.5 rounded-full ${t.live ? 'bg-leaf' : 'bg-amber'}`} />
              <span className="text-ash tracking-widest2 uppercase">{t.label}</span>
              <span className="num text-ink">{t.value}</span>
              <span className="text-ash">·</span>
            </div>
          ))}
          {tickerLoop.length === 0 && <div className="px-8 text-xs text-ash">—connecting to aggregator—</div>}
        </div>
      </div>

      {/* hero */}
      <section className="border-b border-ink">
        <div className="max-w-[1400px] mx-auto px-6 py-16 md:py-24 grid md:grid-cols-12 gap-10">
          <div className="md:col-span-8 reveal">
            <div className="label mb-5">Volume I · No. 01 · Solana Devnet · MMXXVI</div>
            <h1 className="display text-[clamp(2.8rem,7vw,5.8rem)] leading-[0.96] font-light tracking-tight">
              Compose, backtest, <br />
              <span className="italic">and publish</span> a yield <br />
              strategy on Solana.
            </h1>
            <p className="mt-8 text-lg font-sans text-ink/80 leading-relaxed max-w-xl">
              Yieldterminal is a research terminal for DeFi. Assemble yield primitives from Marinade, Kamino, Drift, and Jupiter into an auditable vault — with Monte-Carlo backtests, protocol-calibrated volatility profiles, and on-chain transparency.
            </p>
            <div className="mt-10 flex items-center gap-6">
              <Link to="/app" className="inline-flex items-baseline gap-2 bg-ink text-paper px-6 py-3 font-mono text-xs uppercase tracking-widest2 hover:bg-rust transition-colors">
                <span>Open terminal</span><span className="text-paper/60">→</span>
              </Link>
              <Link to="/backtest" className="font-mono text-xs uppercase tracking-widest2 text-ash hover:text-ink border-b border-rule hover:border-ink pb-0.5">
                Browse research →
              </Link>
            </div>
          </div>

          {/* pull-quote sidebar */}
          <aside className="md:col-span-4 md:border-l md:border-ink md:pl-8">
            <div className="label mb-3">Editor's Abstract</div>
            <p className="display text-xl italic leading-relaxed text-ink/90">
              "A strategy is a hypothesis. A vault is a published fund. Our terminal is the peer review — backtest it before you underwrite a single lamport."
            </p>
            <div className="mt-6 grid grid-cols-2 gap-4 text-sm">
              <Figure label="Protocols" value="04" />
              <Figure label="Funds live" value={vaults.length.toString().padStart(2, '0')} sub={ready ? undefined : '—'} />
              <Figure label="TVL (devnet)" value={totalTvl.toFixed(2)} suffix="SOL" />
              <Figure label="Backtest runs" value="∞" sub="on-demand" />
            </div>
          </aside>
        </div>
      </section>

      {/* 3-step */}
      <section className="border-b border-ink">
        <div className="max-w-[1400px] mx-auto px-6 py-16">
          <div className="flex items-baseline justify-between mb-10 border-b border-ink pb-3">
            <div className="label">§ I · How the terminal operates</div>
            <div className="font-mono text-xs text-ash">Three stages, read left to right</div>
          </div>
          <div className="grid md:grid-cols-3 gap-10">
            <Step n="01" title="Compose" body="Drag yield blocks — Stake (Marinade), LP (Kamino), Covered Call (Drift), Lend, Hedge — onto a canvas. Connect them into a flow. Allocation splits evenly to 100%." />
            <Step n="02" title="Backtest" body="Each composition runs through 40 Monte-Carlo simulations against protocol-calibrated volatility profiles. Strategy type (Covered Call / Delta Neutral / Yield Farm) overlays premium yield, vol damping, or farm amplification." />
            <Step n="03" title="Publish" body="One signature deploys the composition as a vault PDA. Depositors mint shares; the crank reports hourly performance on-chain. Shares are transferable — every position is tradable." />
          </div>
        </div>
      </section>

      {/* live funds index */}
      <section className="border-b border-ink">
        <div className="max-w-[1400px] mx-auto px-6 py-16">
          <div className="flex items-baseline justify-between mb-6 border-b border-ink pb-3">
            <div className="label">§ II · Funds index</div>
            <Link to="/vaults" className="font-mono text-xs uppercase tracking-widest2 text-ash hover:text-ink border-b border-rule hover:border-ink pb-0.5">
              Full prospectus →
            </Link>
          </div>

          {!ready && <div className="font-mono text-xs text-ash">—fetching on-chain vaults—</div>}

          {ready && vaults.length === 0 && (
            <div className="font-mono text-sm text-ash italic">
              No funds underwritten yet. <Link to="/app" className="border-b border-rule hover:border-ink">Be the first.</Link>
            </div>
          )}

          {vaults.length > 0 && (
            <table className="w-full text-left">
              <thead>
                <tr className="font-mono text-[10px] tracking-widest2 uppercase text-ash border-b border-ink">
                  <th className="py-2 font-normal">No.</th>
                  <th className="py-2 font-normal">Name</th>
                  <th className="py-2 font-normal">Strategy</th>
                  <th className="py-2 font-normal text-right">Blocks</th>
                  <th className="py-2 font-normal text-right">Perf (bps)</th>
                  <th className="py-2 font-normal text-right">TVL (SOL)</th>
                  <th className="py-2 font-normal text-right">Age (d)</th>
                </tr>
              </thead>
              <tbody>
                {vaults.map((v, i) => (
                  <tr key={i} className="border-b border-rule hover:bg-cream transition-colors">
                    <td className="py-3 num text-ash">{(i + 1).toString().padStart(2, '0')}</td>
                    <td className="py-3 font-sans">{v.name}</td>
                    <td className="py-3 font-mono text-xs text-ash">{v.strategy}</td>
                    <td className="py-3 num text-right">{v.blocks}</td>
                    <td className={`py-3 num text-right ${v.perfBps >= 0 ? 'text-leaf' : 'text-rust'}`}>
                      {v.perfBps >= 0 ? '+' : ''}{v.perfBps}
                    </td>
                    <td className="py-3 num text-right">{v.tvl.toFixed(4)}</td>
                    <td className="py-3 num text-right text-ash">{v.age_d.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* concept pillars */}
      <section className="border-b border-ink">
        <div className="max-w-[1400px] mx-auto px-6 py-16">
          <div className="flex items-baseline justify-between mb-10 border-b border-ink pb-3">
            <div className="label">§ III · Why a terminal, not a dashboard</div>
          </div>
          <div className="grid md:grid-cols-2 gap-10">
            <Pillar n="A" title="Composability as research hypothesis"
              body="Every vault is a readable composition: 50% Stake/Marinade + 30% LP/Kamino + 20% Sell-Call/Drift. You can reverse-engineer any deployed fund's thesis from its blocks array." />
            <Pillar n="B" title="Real APY, not marketing APY"
              body="The aggregator pulls Marinade's live 30-day APY (api.marinade.finance) and Kamino's market data. Estimates are flagged so you never confuse a brochure with the order book." />
            <Pillar n="C" title="Monte Carlo, calibrated"
              body="Each protocol has a hand-calibrated volatility, loss-chance, and max-loss profile. Strategy type overlays option-premium yield (covered call) or vol damping (delta-neutral). The Sharpe you see is the Sharpe you'd get." />
            <Pillar n="D" title="Tokenized positions"
              body="Shares are PDAs — transferable between depositors. Build an over-the-counter market, a wrapped-fund ETF, or just gift your nephew a yield position for his birthday." />
          </div>
        </div>
      </section>

      {/* CTA */}
      <section>
        <div className="max-w-[1400px] mx-auto px-6 py-24 text-center">
          <div className="label mb-6">§ IV · Begin</div>
          <h2 className="display text-5xl md:text-6xl font-light leading-tight mb-8">
            Your first strategy takes <br /><span className="italic">ninety seconds.</span>
          </h2>
          <div className="flex items-center justify-center gap-6">
            <Link to="/app" className="inline-flex items-baseline gap-2 bg-ink text-paper px-8 py-4 font-mono text-xs uppercase tracking-widest2 hover:bg-rust transition-colors">
              <span>Enter terminal</span><span className="text-paper/60">→</span>
            </Link>
            <Link to="/backtest" className="font-mono text-xs uppercase tracking-widest2 border-b border-ink pb-0.5 hover:text-rust">
              Run a backtest first
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

function Figure({ label, value, suffix, sub }: { label: string; value: string; suffix?: string; sub?: string }) {
  return (
    <div className="border-t border-ink pt-2">
      <div className="label text-[9px]">{label}</div>
      <div className="flex items-baseline gap-1.5">
        <span className="display text-3xl leading-none font-light">{value}</span>
        {suffix && <span className="font-mono text-[10px] text-ash">{suffix}</span>}
      </div>
      {sub && <div className="text-[9px] text-ash font-mono mt-0.5">{sub}</div>}
    </div>
  );
}

function Step({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div className="relative">
      <div className="display text-7xl font-light text-rust mb-3 leading-none">{n}</div>
      <h3 className="display text-2xl mb-3">{title}</h3>
      <p className="font-sans text-[15px] leading-relaxed text-ink/75 max-w-sm">{body}</p>
    </div>
  );
}

function Pillar({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div className="flex gap-5 items-start">
      <div className="display italic text-5xl text-ash leading-none shrink-0 w-10">{n}.</div>
      <div>
        <h3 className="display text-xl mb-2">{title}</h3>
        <p className="font-sans text-[15px] leading-relaxed text-ink/75">{body}</p>
      </div>
    </div>
  );
}
