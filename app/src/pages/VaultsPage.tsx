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

function anchorEnumKey(v: any): string {
  return Object.keys(v || {})[0] || '';
}

function projectApy(perfBps: number, createdAt: number): number {
  const ageDays = Math.max(1, (Date.now() / 1000 - createdAt) / 86400);
  return (perfBps / 100) * (365 / ageDays);
}

function riskColor(label: string): string {
  return {
    Conservative: 'text-green-400 border-green-500/30',
    Moderate:     'text-amber-400 border-amber-500/30',
    Aggressive:   'text-orange-400 border-orange-500/30',
    Speculative:  'text-red-400 border-red-500/30',
  }[label] || 'text-gray-400 border-gray-500/30';
}

function eventIcon(kind: string): string {
  return ({ deposit: '▲', withdraw: '▼', execute: '⚡', vault_created: '✦', vault_closed: '✕', transfer: '⇄' } as any)[kind] || '·';
}

function eventColor(kind: string): string {
  return ({ deposit: 'text-green-400', withdraw: 'text-red-400', execute: 'text-accent', vault_created: 'text-violet-400', vault_closed: 'text-gray-500', transfer: 'text-cyan-400' } as any)[kind] || 'text-gray-400';
}

function relativeTs(ts: number): string {
  const diff = Date.now() / 1000 - ts;
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
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
      parsed.sort((a, b) => b.createdAt - a.createdAt);
      setVaults(parsed);

      // fetch risk per vault in parallel (best-effort, don't block on failures)
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

  // fetch events when a vault is expanded
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

      const sig = await vp.program.methods
        .deposit(lamports)
        .accounts({
          vault: vault.pubkey,
          userDeposit,
          user: publicKey,
          systemProgram: SYSTEM_PROGRAM,
        })
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

      const sig = await vp.program.methods
        .withdraw(shares)
        .accounts({
          vault: vault.pubkey,
          userDeposit,
          user: publicKey,
        })
        .rpc();

      setTx({ kind: 'ok', sig, op: 'withdraw' });
      setWithdrawShares('');
      await fetchVaults();
    } catch (e: any) {
      setTx({ kind: 'err', msg: e?.message || 'withdraw failed' });
    }
  }, [vp, publicKey, withdrawShares, fetchVaults]);

  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="flex items-baseline justify-between mb-4">
        <h1 className="text-xs text-gray-500 font-bold tracking-widest">VAULT EXPLORER</h1>
        <button
          onClick={fetchVaults}
          className="text-[10px] text-gray-500 hover:text-accent tracking-widest"
        >
          REFRESH ↻
        </button>
      </div>

      {tx.kind === 'ok' && (
        <div className="bg-green-900/30 border border-green-500/40 rounded-lg px-4 py-2 mb-4 text-xs text-green-300 break-all">
          {tx.op} confirmed — <a className="text-accent hover:underline" href={`https://solscan.io/tx/${tx.sig}?cluster=devnet`} target="_blank" rel="noreferrer">{tx.sig.slice(0, 16)}…</a>
        </div>
      )}
      {tx.kind === 'err' && (
        <div className="bg-red-950/40 border border-red-500/30 rounded-lg px-4 py-2 mb-4 text-xs text-red-400">
          {tx.msg}
        </div>
      )}

      {loading && <div className="text-xs text-gray-500">loading on-chain vaults…</div>}

      {!loading && vaults && vaults.length === 0 && (
        <div className="bg-navy-800 border border-navy-700 rounded-xl p-8 text-center">
          <div className="text-gray-400 text-sm mb-1">No vaults deployed yet</div>
          <div className="text-xs text-gray-500">Go to the Builder tab to design and deploy your first strategy.</div>
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

            return (
              <div key={key} className="bg-navy-800 border border-navy-700 rounded-xl overflow-hidden">
                <div className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="text-white font-semibold flex items-center gap-2 flex-wrap">
                        {v.name}
                        {mine && <span className="text-[9px] text-accent bg-accent/10 border border-accent/30 px-1.5 py-0.5 rounded tracking-wider">YOU</span>}
                        {riskInfo && (
                          <span className={`text-[9px] border bg-transparent px-1.5 py-0.5 rounded tracking-wider ${riskColor(riskInfo.label)}`}>
                            {riskInfo.label.toUpperCase()} · {riskInfo.score}
                          </span>
                        )}
                      </h3>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {v.strategyType} &middot; {v.blocksRaw.length} blocks &middot; id #{v.vaultId}
                      </p>
                    </div>
                    <div className="text-right">
                      <div className={`font-bold text-lg ${apy >= 0 ? 'text-accent' : 'text-red-400'}`}>
                        {apy >= 0 ? '+' : ''}{apy.toFixed(1)}%
                      </div>
                      <div className="text-[10px] text-gray-500">APY (annualized)</div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="text-xs text-gray-500">
                      TVL: {v.totalDeposits.toFixed(4)} SOL &middot; shares: {v.totalShares.toLocaleString()} &middot; perf: {v.performanceBps} bps
                    </div>
                    <button
                      onClick={() => {
                        setExpanded(isOpen ? null : key);
                        setTx({ kind: 'idle' });
                      }}
                      className="bg-accent/10 text-accent text-xs font-semibold px-4 py-1.5 rounded hover:bg-accent/20"
                    >
                      {isOpen ? 'Close' : 'Manage'}
                    </button>
                  </div>
                </div>

                {isOpen && (
                  <div className="border-t border-navy-700 bg-navy-900/40 p-5 grid md:grid-cols-2 gap-5">
                    {/* actions */}
                    <div>
                      <div className="text-[10px] text-gray-500 tracking-widest mb-2">DEPOSIT</div>
                      <div className="flex gap-2 mb-4">
                        <input
                          value={depositAmount}
                          onChange={(e) => setDepositAmount(e.target.value)}
                          placeholder="SOL"
                          type="number"
                          step="0.001"
                          className="flex-1 bg-navy-900 border border-navy-700 rounded px-3 py-1.5 text-sm outline-none text-white"
                        />
                        <button
                          onClick={() => submitDeposit(v)}
                          disabled={tx.kind === 'signing' || !publicKey}
                          className="bg-accent text-white text-xs font-semibold px-4 py-1.5 rounded hover:bg-blue-600 disabled:bg-navy-700"
                        >
                          {tx.kind === 'signing' && tx.op === 'deposit' ? '…' : 'Deposit'}
                        </button>
                      </div>

                      <div className="text-[10px] text-gray-500 tracking-widest mb-2">WITHDRAW</div>
                      <div className="flex gap-2">
                        <input
                          value={withdrawShares}
                          onChange={(e) => setWithdrawShares(e.target.value)}
                          placeholder="shares"
                          type="number"
                          className="flex-1 bg-navy-900 border border-navy-700 rounded px-3 py-1.5 text-sm outline-none text-white"
                        />
                        <button
                          onClick={() => submitWithdraw(v)}
                          disabled={tx.kind === 'signing' || !publicKey}
                          className="bg-red-500/20 text-red-300 border border-red-500/30 text-xs font-semibold px-4 py-1.5 rounded hover:bg-red-500/30 disabled:opacity-40"
                        >
                          {tx.kind === 'signing' && tx.op === 'withdraw' ? '…' : 'Withdraw'}
                        </button>
                      </div>

                      <div className="mt-4 text-[10px] text-gray-500">
                        Allocations:
                        {v.blocksRaw.map((b, i) => (
                          <div key={i} className="font-mono">
                            {b.allocationPct}% {anchorEnumKey(b.protocol)}/{anchorEnumKey(b.action)}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* activity feed */}
                    <div>
                      <div className="text-[10px] text-gray-500 tracking-widest mb-2">RECENT ACTIVITY</div>
                      {events.length === 0 ? (
                        <div className="text-xs text-gray-600">No events indexed yet.</div>
                      ) : (
                        <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                          {events.map((e) => (
                            <div key={e.id} className="text-xs flex items-baseline gap-2">
                              <span className={`${eventColor(e.kind)} w-4 text-center`}>{eventIcon(e.kind)}</span>
                              <span className="text-gray-300 flex-1">
                                {e.kind === 'deposit' && `${((e.amount || 0) / LAMPORTS_PER_SOL).toFixed(4)} SOL deposited`}
                                {e.kind === 'withdraw' && `${((e.amount || 0) / LAMPORTS_PER_SOL).toFixed(4)} SOL withdrawn`}
                                {e.kind === 'execute' && `yield tick ${e.delta_bps! > 0 ? '+' : ''}${e.delta_bps} bps`}
                                {e.kind === 'vault_created' && 'vault created'}
                                {e.kind === 'vault_closed' && 'vault closed'}
                                {e.kind === 'transfer' && `${(e.shares || 0).toLocaleString()} shares transferred`}
                              </span>
                              <span className="text-gray-600 shrink-0">{relativeTs(e.ts)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
