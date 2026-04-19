import { useEffect, useState, useCallback } from 'react';
import { PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';
import { useWallet } from '@solana/wallet-adapter-react';
import { useVaultProgram } from '../lib/useProgram';
import { depositPda, SYSTEM_PROGRAM } from '../lib/strategy';
import { api, VaultEvent } from '../lib/api';

interface OnChainVault {
  pubkey: PublicKey;
  vaultId: number;
  name: string;
  creator: string;
  strategyType: string;
  blocksRaw: Array<{ action: any; protocol: any; allocationPct: number }>;
  totalDeposits: number;
  totalShares: number;
  performanceBps: number;
  createdAt: number;
}

type TxState =
  | { kind: 'idle' }
  | { kind: 'signing'; op: 'deposit' | 'withdraw' }
  | { kind: 'ok'; sig: string; op: string }
  | { kind: 'err'; msg: string };

function strategyLabel(v: any): string {
  const k = Object.keys(v || {})[0] || 'unknown';
  return k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()).trim();
}
function anchorEnumKey(v: any): string { return Object.keys(v || {})[0] || ''; }

function projectApy(perfBps: number, createdAt: number): number {
  const ageDays = Math.max(1, (Date.now() / 1000 - createdAt) / 86400);
  return (perfBps / 100) * (365 / ageDays);
}

function riskColor(label: string): string {
  return {
    Conservative: 'text-acid border-acid',
    Moderate:     'text-hazard border-hazard',
    Aggressive:   'text-blood border-blood',
    Speculative:  'text-blood border-blood bg-blood/10',
  }[label] || 'text-smoke border-smoke';
}

function eventMark(kind: string): string {
  return ({ deposit: '▲', withdraw: '▼', execute: '⚡', vault_created: '✦', vault_closed: '⨯', transfer: '↔' } as any)[kind] || '·';
}
function eventColor(kind: string): string {
  return ({ deposit: 'text-acid', withdraw: 'text-blood', execute: 'text-hazard', vault_created: 'text-cobalt', vault_closed: 'text-smoke', transfer: 'text-silver' } as any)[kind] || 'text-smoke';
}
function relativeTs(ts: number): string {
  const diff = Date.now() / 1000 - ts;
  if (diff < 60) return `${Math.floor(diff)}S`;
  if (diff < 3600) return `${Math.floor(diff / 60)}M`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}H`;
  return `${Math.floor(diff / 86400)}D`;
}

export default function VaultsPage() {
  const vp = useVaultProgram();
  const { publicKey } = useWallet();

  const [vaults, setVaults] = useState<OnChainVault[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [depositAmount, setDepositAmount] = useState('');
  const [withdrawShares, setWithdrawShares] = useState('');
  const [tx, setTx] = useState<TxState>({ kind: 'idle' });
  const [riskByVault, setRiskByVault] = useState<Record<string, { score: number; label: string }>>({});
  const [events, setEvents] = useState<VaultEvent[]>([]);

  const fetchVaults = useCallback(async () => {
    if (!vp) return;
    setLoading(true);
    try {
      const raw = await (vp.program.account as any).yieldVault.all();
      const parsed: OnChainVault[] = raw.map((r: any) => ({
        pubkey: r.publicKey,
        vaultId: r.account.vaultId.toNumber ? r.account.vaultId.toNumber() : Number(r.account.vaultId),
        name: r.account.name,
        creator: r.account.creator.toBase58(),
        strategyType: strategyLabel(r.account.strategyType),
        blocksRaw: r.account.strategyBlocks,
        totalDeposits: Number(r.account.totalDeposits) / LAMPORTS_PER_SOL,
        totalShares: Number(r.account.totalShares),
        performanceBps: r.account.performanceBps,
        createdAt: Number(r.account.createdAt),
      }));
      parsed.sort((a, b) => a.vaultId - b.vaultId);
      setVaults(parsed);

      const riskMap: Record<string, { score: number; label: string }> = {};
      await Promise.all(parsed.map(async (v) => {
        const payload = v.blocksRaw.map((b) => ({
          action: anchorEnumKey(b.action).replace(/([A-Z])/g, '_$1').toLowerCase(),
          protocol: anchorEnumKey(b.protocol),
          allocation_pct: b.allocationPct,
        }));
        try {
          const r = await api.risk(payload);
          riskMap[v.pubkey.toBase58()] = { score: r.score, label: r.label };
        } catch {/* ignore */}
      }));
      setRiskByVault(riskMap);
    } catch (e) {
      console.error('vault fetch failed:', e);
      setVaults([]);
    } finally {
      setLoading(false);
    }
  }, [vp]);

  useEffect(() => { fetchVaults(); }, [fetchVaults]);

  useEffect(() => {
    if (!expanded) { setEvents([]); return; }
    let cancelled = false;
    api.events(expanded, 30)
      .then((d) => { if (!cancelled) setEvents(d.events); })
      .catch(() => { if (!cancelled) setEvents([]); });
    return () => { cancelled = true; };
  }, [expanded, tx]);

  const submitDeposit = useCallback(async (vault: OnChainVault) => {
    if (!vp || !publicKey) return;
    setTx({ kind: 'signing', op: 'deposit' });
    try {
      const sol = parseFloat(depositAmount);
      if (!isFinite(sol) || sol <= 0) throw new Error('amount must be > 0');
      const lamports = new BN(Math.floor(sol * LAMPORTS_PER_SOL));
      const userDeposit = depositPda(vp.program.programId, vault.pubkey, publicKey);
      const sig = await vp.program.methods.deposit(lamports)
        .accounts({ vault: vault.pubkey, userDeposit, user: publicKey, systemProgram: SYSTEM_PROGRAM })
        .rpc();
      setTx({ kind: 'ok', sig, op: 'deposit' });
      setDepositAmount('');
      await fetchVaults();
    } catch (e: any) {
      setTx({ kind: 'err', msg: e?.message || 'deposit failed' });
    }
  }, [vp, publicKey, depositAmount, fetchVaults]);

  const submitWithdraw = useCallback(async (vault: OnChainVault) => {
    if (!vp || !publicKey) return;
    setTx({ kind: 'signing', op: 'withdraw' });
    try {
      const shares = new BN(withdrawShares || '0');
      if (shares.lten(0)) throw new Error('shares must be > 0');
      const userDeposit = depositPda(vp.program.programId, vault.pubkey, publicKey);
      const sig = await vp.program.methods.withdraw(shares)
        .accounts({ vault: vault.pubkey, userDeposit, user: publicKey })
        .rpc();
      setTx({ kind: 'ok', sig, op: 'withdraw' });
      setWithdrawShares('');
      await fetchVaults();
    } catch (e: any) {
      setTx({ kind: 'err', msg: e?.message || 'withdraw failed' });
    }
  }, [vp, publicKey, withdrawShares, fetchVaults]);

  return (
    <div className="max-w-[1440px] mx-auto px-5 py-5">
      {/* header */}
      <div className="flex items-baseline justify-between border-b border-steel pb-3 mb-6">
        <div className="flex items-baseline gap-5">
          <span className="label !text-acid">F2 · FUNDS</span>
          <h1 className="font-display text-3xl font-black tracking-tight">PROSPECTUS DIRECTORY</h1>
        </div>
        <button onClick={fetchVaults} className="font-mono text-[10px] uppercase tracking-widest2 text-smoke hover:text-acid border border-steel hover:border-acid px-3 py-1.5">
          ↻ RE-FETCH
        </button>
      </div>

      {tx.kind === 'ok' && (
        <div className="border border-acid text-acid font-mono text-[11px] px-3 py-2 mb-4 break-all uppercase tracking-widest2">
          ✓ {tx.op} CONFIRMED — <a href={`https://solscan.io/tx/${tx.sig}?cluster=devnet`} target="_blank" rel="noreferrer" className="underline">{tx.sig.slice(0, 22)}…</a>
        </div>
      )}
      {tx.kind === 'err' && (
        <div className="border border-blood text-blood font-mono text-[11px] px-3 py-2 mb-4 uppercase">✕ {tx.msg}</div>
      )}

      {loading && <div className="font-mono text-xs text-smoke uppercase tracking-widest2">— LOADING FUNDS FROM SOLANA DEVNET —</div>}

      {!loading && vaults && vaults.length === 0 && (
        <div className="border border-steel p-10 text-center">
          <div className="font-display text-3xl font-black mb-2">NO FUNDS PUBLISHED.</div>
          <a href="/app" className="font-mono text-xs uppercase tracking-widest2 text-acid border-b border-acid">BE THE FIRST →</a>
        </div>
      )}

      {!loading && vaults && vaults.length > 0 && (
        <div className="space-y-3">
          {vaults.map((v) => {
            const key = v.pubkey.toBase58();
            const apy = projectApy(v.performanceBps, v.createdAt);
            const mine = publicKey && publicKey.toBase58() === v.creator;
            const isOpen = expanded === key;
            const riskInfo = riskByVault[key];
            const ageDays = (Date.now() / 1000 - v.createdAt) / 86400;

            return (
              <article key={key} className="border border-steel bg-coal">
                <div className="grid md:grid-cols-12 gap-0">
                  {/* name column */}
                  <div className="md:col-span-5 p-5 md:border-r border-steel">
                    <div className="flex items-baseline gap-2 mb-2 flex-wrap">
                      <span className="label !text-acid">FUND · {v.vaultId.toString().padStart(3, '0')}</span>
                      {mine && <span className="font-mono text-[9px] uppercase tracking-widest2 bg-cobalt/20 text-cobalt border border-cobalt px-1.5 py-0.5">YOURS</span>}
                      {riskInfo && (
                        <span className={`font-mono text-[9px] uppercase tracking-widest2 border px-1.5 py-0.5 ${riskColor(riskInfo.label)}`}>
                          {riskInfo.label}
                        </span>
                      )}
                    </div>
                    <h2 className="font-display text-3xl font-black tracking-tight leading-tight">{v.name.toUpperCase()}</h2>
                    <div className="font-mono text-[10px] uppercase tracking-widest2 text-smoke mt-2">
                      THESIS · {v.strategyType} · {v.blocksRaw.length} PRIMITIVES · {ageDays.toFixed(1)}D OLD
                    </div>
                  </div>

                  {/* apy */}
                  <div className="md:col-span-3 p-5 md:border-r border-steel md:flex md:flex-col md:justify-center">
                    <div className="label mb-1">PERF · ANNUALIZED</div>
                    <div className={`font-display text-5xl font-black leading-none ${apy >= 0 ? 'text-acid' : 'text-blood'}`}>
                      {apy >= 0 ? '+' : ''}{apy.toFixed(1)}<span className="text-2xl">%</span>
                    </div>
                    <div className="num font-mono text-[10px] text-smoke mt-1">{v.performanceBps} BPS TOTAL</div>
                  </div>

                  {/* tvl */}
                  <div className="md:col-span-3 p-5 md:border-r border-steel md:flex md:flex-col md:justify-center">
                    <div className="label mb-1">CAPITAL</div>
                    <div className="num font-display text-4xl font-black leading-none">{v.totalDeposits.toFixed(4)}</div>
                    <div className="num font-mono text-[10px] text-smoke mt-1">SOL · {v.totalShares.toLocaleString()} SHARES</div>
                  </div>

                  {/* action */}
                  <div className="md:col-span-1 flex md:justify-end items-center p-5">
                    <button
                      onClick={() => { setExpanded(isOpen ? null : key); setTx({ kind: 'idle' }); }}
                      className={`font-mono text-[10px] uppercase tracking-widest2 border px-3 py-2 transition-colors ${
                        isOpen ? 'bg-acid text-onyx border-acid' : 'border-steel text-silver hover:border-acid hover:text-acid'
                      }`}
                    >
                      {isOpen ? 'CLOSE' : 'OPEN'}
                    </button>
                  </div>
                </div>

                {isOpen && (
                  <div className="border-t border-steel bg-graphite/30">
                    <div className="grid md:grid-cols-12 gap-0">
                      {/* actions */}
                      <div className="md:col-span-5 p-5 md:border-r border-steel">
                        <div className="label mb-4 !text-acid">SUBSCRIBE</div>

                        <div className="mb-5">
                          <div className="label text-[9px] mb-1">DEPOSIT · SOL</div>
                          <div className="flex items-baseline gap-3">
                            <input
                              value={depositAmount}
                              onChange={(e) => setDepositAmount(e.target.value)}
                              placeholder="0.100"
                              type="number"
                              step="0.001"
                              className="!text-2xl font-display font-black"
                            />
                            <button
                              onClick={() => submitDeposit(v)}
                              disabled={tx.kind === 'signing' || !publicKey}
                              className="bg-acid text-onyx px-4 py-2 font-mono text-[11px] uppercase tracking-widest2 font-semibold hover:bg-silver disabled:bg-steel disabled:text-smoke"
                            >
                              {tx.kind === 'signing' && tx.op === 'deposit' ? '…' : 'SUBSCRIBE'}
                            </button>
                          </div>
                        </div>

                        <div className="mb-5">
                          <div className="label text-[9px] mb-1">REDEEM · SHARES</div>
                          <div className="flex items-baseline gap-3">
                            <input
                              value={withdrawShares}
                              onChange={(e) => setWithdrawShares(e.target.value)}
                              placeholder="1000000"
                              type="number"
                              className="!text-2xl font-display font-black"
                            />
                            <button
                              onClick={() => submitWithdraw(v)}
                              disabled={tx.kind === 'signing' || !publicKey}
                              className="border border-blood text-blood px-4 py-2 font-mono text-[11px] uppercase tracking-widest2 hover:bg-blood hover:text-onyx disabled:opacity-40"
                            >
                              {tx.kind === 'signing' && tx.op === 'withdraw' ? '…' : 'REDEEM'}
                            </button>
                          </div>
                        </div>

                        <div className="border-t border-steel pt-4">
                          <div className="label mb-2">ALLOCATIONS</div>
                          <div className="border border-steel">
                            {v.blocksRaw.map((b, i) => (
                              <div key={i} className="grid grid-cols-[60px_1fr_1fr] border-b border-steel last:border-0 text-sm">
                                <div className="num px-3 py-1.5 text-acid">{b.allocationPct}%</div>
                                <div className="px-3 py-1.5 font-sans">{anchorEnumKey(b.protocol)}</div>
                                <div className="px-3 py-1.5 font-mono text-xs text-smoke">{anchorEnumKey(b.action)}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* activity */}
                      <div className="md:col-span-7 p-5">
                        <div className="flex items-baseline justify-between mb-4">
                          <div className="label">CHANGELOG · LAST EVENTS</div>
                          <div className="font-mono text-[10px] text-smoke uppercase tracking-widest2 flex items-center gap-1.5">
                            <span className="w-1 h-1 rounded-full bg-acid blink" /> FROM INDEXER
                          </div>
                        </div>

                        {events.length === 0 ? (
                          <div className="font-mono text-xs text-smoke uppercase tracking-widest2">NO ACTIVITY RECORDED. INDEXER REFRESHES EVERY 45S.</div>
                        ) : (
                          <ul className="space-y-0">
                            {events.map((e) => (
                              <li key={e.id} className="grid grid-cols-[24px_72px_1fr_auto] items-baseline gap-3 py-1.5 border-b border-steel last:border-0 text-sm">
                                <span className={`text-center text-base ${eventColor(e.kind)}`}>{eventMark(e.kind)}</span>
                                <span className="label">{e.kind}</span>
                                <span className="font-sans text-silver/85 text-[13px]">
                                  {e.kind === 'deposit' && <><span className="num text-acid">{((e.amount || 0) / LAMPORTS_PER_SOL).toFixed(4)}</span> SOL subscribed</>}
                                  {e.kind === 'withdraw' && <><span className="num text-blood">{((e.amount || 0) / LAMPORTS_PER_SOL).toFixed(4)}</span> SOL redeemed</>}
                                  {e.kind === 'execute' && <>yield tick <span className={`num ${(e.delta_bps || 0) >= 0 ? 'text-acid' : 'text-blood'}`}>{(e.delta_bps || 0) >= 0 ? '+' : ''}{e.delta_bps}</span> bps</>}
                                  {e.kind === 'vault_created' && <>fund published</>}
                                  {e.kind === 'vault_closed' && <>fund closed</>}
                                  {e.kind === 'transfer' && <><span className="num">{(e.shares || 0).toLocaleString()}</span> shares transferred</>}
                                </span>
                                <span className="num font-mono text-[10px] text-smoke">{relativeTs(e.ts)}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
