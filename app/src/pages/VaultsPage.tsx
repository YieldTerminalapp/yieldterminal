import { useEffect, useState, useCallback } from 'react';
import { PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';
import { useWallet } from '@solana/wallet-adapter-react';
import { useVaultProgram } from '../lib/useProgram';
import { depositPda, SYSTEM_PROGRAM } from '../lib/strategy';

interface OnChainVault {
  pubkey: PublicKey;
  vaultId: number;
  name: string;
  creator: string;
  strategyType: string;
  blocks: number;
  totalDeposits: number;
  totalShares: number;
  performanceBps: number;
  createdAt: number;
}

type DepositState =
  | { kind: 'idle' }
  | { kind: 'signing' }
  | { kind: 'ok'; sig: string }
  | { kind: 'err'; msg: string };

function strategyLabel(v: any): string {
  const k = Object.keys(v || {})[0] || 'unknown';
  return k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()).trim();
}

// rough APY projection — contract stores cumulative bps earnings, project to yearly
function projectApy(perfBps: number, createdAt: number): number {
  const ageDays = Math.max(1, (Date.now() / 1000 - createdAt) / 86400);
  return (perfBps / 100) * (365 / ageDays);
}

export default function VaultsPage() {
  const vp = useVaultProgram();
  const { publicKey } = useWallet();

  const [vaults, setVaults] = useState<OnChainVault[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [depositVault, setDepositVault] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [deposit, setDeposit] = useState<DepositState>({ kind: 'idle' });

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
        blocks: r.account.strategyBlocks.length,
        totalDeposits: Number(r.account.totalDeposits) / LAMPORTS_PER_SOL,
        totalShares: Number(r.account.totalShares),
        performanceBps: r.account.performanceBps,
        createdAt: Number(r.account.createdAt),
      }));
      parsed.sort((a, b) => b.createdAt - a.createdAt);
      setVaults(parsed);
    } catch (e) {
      console.error('vault fetch failed:', e);
      setVaults([]);
    } finally {
      setLoading(false);
    }
  }, [vp]);

  useEffect(() => { fetchVaults(); }, [fetchVaults]);

  const submitDeposit = useCallback(async (vault: OnChainVault) => {
    if (!vp || !publicKey) return;
    setDeposit({ kind: 'signing' });
    try {
      const sol = parseFloat(amount);
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

      setDeposit({ kind: 'ok', sig });
      setAmount('');
      setDepositVault(null);
      await fetchVaults();
    } catch (e: any) {
      setDeposit({ kind: 'err', msg: e?.message || 'deposit failed' });
    }
  }, [vp, publicKey, amount, fetchVaults]);

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="flex items-baseline justify-between mb-4">
        <h1 className="text-xs text-gray-500 font-bold tracking-widest">VAULT EXPLORER</h1>
        <button
          onClick={fetchVaults}
          className="text-[10px] text-gray-500 hover:text-accent tracking-widest"
        >
          REFRESH ↻
        </button>
      </div>

      {deposit.kind === 'ok' && (
        <div className="bg-green-900/30 border border-green-500/40 rounded-lg px-4 py-2 mb-4 text-xs text-green-300 break-all">
          deposit confirmed — <a className="text-accent hover:underline" href={`https://solscan.io/tx/${deposit.sig}?cluster=devnet`} target="_blank" rel="noreferrer">{deposit.sig.slice(0, 16)}…</a>
        </div>
      )}
      {deposit.kind === 'err' && (
        <div className="bg-red-950/40 border border-red-500/30 rounded-lg px-4 py-2 mb-4 text-xs text-red-400">
          {deposit.msg}
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
            const apy = projectApy(v.performanceBps, v.createdAt);
            const mine = publicKey && publicKey.toBase58() === v.creator;
            return (
              <div key={v.pubkey.toBase58()} className="bg-navy-800 border border-navy-700 rounded-xl p-5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="text-white font-semibold flex items-center gap-2">
                      {v.name}
                      {mine && <span className="text-[9px] text-accent bg-accent/10 border border-accent/30 px-1.5 py-0.5 rounded tracking-wider">YOU</span>}
                    </h3>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {v.strategyType} &middot; {v.blocks} blocks &middot; id #{v.vaultId}
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
                    TVL: {v.totalDeposits.toFixed(4)} SOL &middot; shares: {v.totalShares.toLocaleString()}
                  </div>
                  {depositVault === v.pubkey.toBase58() ? (
                    <div className="flex gap-2 items-center">
                      <input
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder="SOL"
                        type="number"
                        step="0.01"
                        className="bg-navy-900 border border-navy-700 rounded px-3 py-1.5 text-sm w-24 outline-none text-white"
                      />
                      <button
                        onClick={() => submitDeposit(v)}
                        disabled={deposit.kind === 'signing'}
                        className="bg-accent text-white text-xs font-semibold px-4 py-1.5 rounded hover:bg-blue-600 disabled:bg-navy-700"
                      >
                        {deposit.kind === 'signing' ? 'Signing…' : 'Deposit'}
                      </button>
                      <button onClick={() => { setDepositVault(null); setDeposit({ kind: 'idle' }); }} className="text-xs text-gray-500 hover:text-gray-300">
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setDepositVault(v.pubkey.toBase58()); setDeposit({ kind: 'idle' }); }}
                      disabled={!publicKey}
                      className="bg-accent/10 text-accent text-xs font-semibold px-4 py-1.5 rounded hover:bg-accent/20 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {publicKey ? 'Deposit' : 'Connect'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
