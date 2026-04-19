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
    Conservative: 'text-leaf border-leaf',
    Moderate:     'text-amber border-amber',
    Aggressive:   'text-rust border-rust',
    Speculative:  'text-rust border-rust bg-rust/10',
  }[label] || 'text-ash border-ash';
}

function eventMark(kind: string): string {
  return ({ deposit: '+', withdraw: '−', execute: '§', vault_created: '✦', vault_closed: '⨯', transfer: '↔' } as any)[kind] || '·';
}
function eventColor(kind: string): string {
  return ({ deposit: 'text-leaf', withdraw: 'text-rust', execute: 'text-cobalt', vault_created: 'text-ink', vault_closed: 'text-ash', transfer: 'text-amber' } as any)[kind] || 'text-ash';
}
function relativeTs(ts: number): string {
  const diff = Date.now() / 1000 - ts;
  if (diff < 60) return `${Math.floor(diff)}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

const ROMAN = ['0', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV'];
const toRoman = (n: number): string => ROMAN[n + 1] || (n + 1).toString();

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
    <div className="max-w-[1400px] mx-auto px-6 py-6">
      {/* header */}
      <div className="flex items-baseline justify-between border-b border-ink pb-3 mb-6">
        <div>
          <div className="label mb-1">§ 02 · Prospectus directory</div>
          <h1 className="display text-3xl">Published funds</h1>
        </div>
        <button onClick={fetchVaults} className="font-mono text-xs uppercase tracking-widest2 text-ash hover:text-rust border-b border-rule hover:border-rust pb-0.5">
          re-fetch chain ↻
        </button>
      </div>

      {tx.kind === 'ok' && (
        <div className="border border-leaf text-leaf font-mono text-xs px-3 py-2 mb-4 break-all">
          {tx.op} confirmed — <a href={`https://solscan.io/tx/${tx.sig}?cluster=devnet`} target="_blank" rel="noreferrer" className="underline hover:text-rust">{tx.sig.slice(0, 22)}…</a>
        </div>
      )}
      {tx.kind === 'err' && (
        <div className="border border-rust text-rust font-mono text-xs px-3 py-2 mb-4">{tx.msg}</div>
      )}

      {loading && <div className="font-mono text-xs text-ash italic">—loading funds from Solana devnet—</div>}

      {!loading && vaults && vaults.length === 0 && (
        <div className="border border-ink p-10 text-center">
          <div className="display text-2xl mb-2">No funds have been underwritten.</div>
          <div className="font-mono text-xs text-ash">Open the <a href="/app" className="border-b border-ink hover:text-rust">Build</a> section and publish the first.</div>
        </div>
      )}

      {!loading && vaults && vaults.length > 0 && (
        <div className="space-y-4">
          {vaults.map((v) => {
            const key = v.pubkey.toBase58();
            const apy = projectApy(v.performanceBps, v.createdAt);
            const mine = publicKey && publicKey.toBase58() === v.creator;
            const isOpen = expanded === key;
            const riskInfo = riskByVault[key];
            const ageDays = (Date.now() / 1000 - v.createdAt) / 86400;

            return (
              <article key={key} className="border border-ink bg-paper hover:shadow-[4px_4px_0_#0E0C0A] transition-all">
                {/* card */}
                <div className="grid md:grid-cols-12 gap-6 p-5">
                  {/* fund label */}
                  <div className="md:col-span-5">
                    <div className="flex items-baseline gap-3 mb-1 flex-wrap">
                      <span className="label">Fund · {toRoman(v.vaultId)}</span>
                      {mine && <span className="font-mono text-[10px] uppercase tracking-widest2 border border-cobalt text-cobalt px-1.5 py-0.5">yours</span>}
                      {riskInfo && (
                        <span className={`font-mono text-[10px] uppercase tracking-widest2 border px-1.5 py-0.5 ${riskColor(riskInfo.label)}`}>
                          {riskInfo.label}
                        </span>
                      )}
                    </div>
                    <h2 className="display text-3xl leading-tight">{v.name}</h2>
                    <div className="font-mono text-xs text-ash mt-2">
                      Thesis: <span className="text-ink">{v.strategyType}</span> · {v.blocksRaw.length} primitives · underwritten {ageDays.toFixed(1)}d ago
                    </div>
                  </div>

                  {/* headline APY */}
                  <div className="md:col-span-3 md:border-l md:border-ink md:pl-6">
                    <div className="label mb-1">Performance (annualized)</div>
                    <div className={`display text-5xl leading-none ${apy >= 0 ? 'text-leaf' : 'text-rust'}`}>
                      {apy >= 0 ? '+' : ''}{apy.toFixed(1)}<span className="text-xl">%</span>
                    </div>
                    <div className="font-mono text-[10px] text-ash mt-1">{v.performanceBps} bps total</div>
                  </div>

                  {/* tvl */}
                  <div className="md:col-span-3 md:border-l md:border-ink md:pl-6">
                    <div className="label mb-1">Capital under management</div>
                    <div className="num display text-3xl leading-none">{v.totalDeposits.toFixed(4)}</div>
                    <div className="font-mono text-[10px] text-ash mt-1">SOL · {v.totalShares.toLocaleString()} shares</div>
                  </div>

                  {/* action */}
                  <div className="md:col-span-1 flex md:justify-end items-center">
                    <button
                      onClick={() => { setExpanded(isOpen ? null : key); setTx({ kind: 'idle' }); }}
                      className="font-mono text-[11px] uppercase tracking-widest2 border border-ink px-3 py-2 hover:bg-ink hover:text-paper"
                    >
                      {isOpen ? 'close' : 'open'}
                    </button>
                  </div>
                </div>

                {/* expanded manage */}
                {isOpen && (
                  <div className="border-t border-ink bg-cream">
                    <div className="grid md:grid-cols-12 gap-0">
                      {/* deposit/withdraw */}
                      <div className="md:col-span-5 p-6 md:border-r md:border-ink">
                        <div className="label mb-4">Underwriting · subscribe</div>

                        <div className="mb-6">
                          <div className="label text-[9px] mb-1">Deposit · SOL</div>
                          <div className="flex items-baseline gap-3">
                            <input
                              value={depositAmount}
                              onChange={(e) => setDepositAmount(e.target.value)}
                              placeholder="0.100"
                              type="number"
                              step="0.001"
                              className="flex-1 display text-3xl !border-b-2"
                            />
                            <button
                              onClick={() => submitDeposit(v)}
                              disabled={tx.kind === 'signing' || !publicKey}
                              className="bg-ink text-paper px-5 py-2 font-mono text-[11px] uppercase tracking-widest2 hover:bg-leaf disabled:bg-rule disabled:text-ash"
                            >
                              {tx.kind === 'signing' && tx.op === 'deposit' ? 'signing…' : 'subscribe'}
                            </button>
                          </div>
                        </div>

                        <div className="mb-6">
                          <div className="label text-[9px] mb-1">Redeem · shares</div>
                          <div className="flex items-baseline gap-3">
                            <input
                              value={withdrawShares}
                              onChange={(e) => setWithdrawShares(e.target.value)}
                              placeholder="1000000"
                              type="number"
                              className="flex-1 display text-3xl !border-b-2"
                            />
                            <button
                              onClick={() => submitWithdraw(v)}
                              disabled={tx.kind === 'signing' || !publicKey}
                              className="border border-rust text-rust px-5 py-2 font-mono text-[11px] uppercase tracking-widest2 hover:bg-rust hover:text-paper disabled:opacity-40"
                            >
                              {tx.kind === 'signing' && tx.op === 'withdraw' ? 'signing…' : 'redeem'}
                            </button>
                          </div>
                        </div>

                        <div className="border-t border-rule pt-4">
                          <div className="label mb-2">Allocations</div>
                          <table className="w-full text-sm">
                            <tbody>
                              {v.blocksRaw.map((b, i) => (
                                <tr key={i} className="border-b border-rule last:border-0">
                                  <td className="num py-1.5 text-ash pr-3 w-12">{b.allocationPct}%</td>
                                  <td className="py-1.5 font-sans">{anchorEnumKey(b.protocol)}</td>
                                  <td className="py-1.5 font-mono text-xs text-ash">{anchorEnumKey(b.action)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {/* activity */}
                      <div className="md:col-span-7 p-6">
                        <div className="flex items-baseline justify-between mb-4">
                          <div className="label">Changelog · last events</div>
                          <div className="font-mono text-[10px] text-ash">from indexer</div>
                        </div>

                        {events.length === 0 ? (
                          <div className="font-mono text-xs text-ash italic">No activity recorded. The indexer refreshes every 45 seconds.</div>
                        ) : (
                          <ul className="space-y-1">
                            {events.map((e) => (
                              <li key={e.id} className="grid grid-cols-[auto_auto_1fr_auto] items-baseline gap-3 py-1 border-b border-rule last:border-0 text-sm">
                                <span className={`font-display text-lg ${eventColor(e.kind)} w-4 text-center`}>{eventMark(e.kind)}</span>
                                <span className="label w-16">{e.kind}</span>
                                <span className="font-sans text-ink/80">
                                  {e.kind === 'deposit' && <><span className="num text-leaf">{((e.amount || 0) / LAMPORTS_PER_SOL).toFixed(4)}</span> SOL subscribed</>}
                                  {e.kind === 'withdraw' && <><span className="num text-rust">{((e.amount || 0) / LAMPORTS_PER_SOL).toFixed(4)}</span> SOL redeemed</>}
                                  {e.kind === 'execute' && <>yield tick <span className={`num ${(e.delta_bps || 0) >= 0 ? 'text-leaf' : 'text-rust'}`}>{(e.delta_bps || 0) >= 0 ? '+' : ''}{e.delta_bps}</span> bps</>}
                                  {e.kind === 'vault_created' && <>fund published</>}
                                  {e.kind === 'vault_closed' && <>fund closed</>}
                                  {e.kind === 'transfer' && <><span className="num">{(e.shares || 0).toLocaleString()}</span> shares transferred</>}
                                </span>
                                <span className="font-mono text-[10px] text-ash tabular-nums">{relativeTs(e.ts)} ago</span>
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
