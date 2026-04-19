// Tiny client for the YieldTerminal backend. Returns parsed JSON or throws.
const BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8088';

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  });
  if (!r.ok) throw new Error(`${path} → ${r.status}`);
  return r.json();
}

export interface ApyRow {
  protocol: string;
  apy: number;
  source: 'live' | 'estimate' | 'fallback';
  updated: number;
}

export interface BacktestResult {
  days: number;
  total_return_pct: number;
  annualized_apy: number;
  max_drawdown_pct: number;
  sharpe_ratio: number;
  win_rate: number;
  equity_curve: number[];
  protocols_used: string[];
}

export interface RiskResult {
  score: number;
  label: 'Conservative' | 'Moderate' | 'Aggressive' | 'Speculative' | 'N/A';
  var_1d_pct: number;
  sol_beta: number;
  notes: string[];
}

export interface VaultEvent {
  id: number;
  kind: 'deposit' | 'withdraw' | 'execute' | 'vault_created' | 'vault_closed' | 'transfer';
  signature: string | null;
  vault: string | null;
  wallet: string | null;
  amount: number | null;
  shares: number | null;
  delta_bps: number | null;
  ts: number;
  slot: number | null;
}

export interface BlockPayload {
  action: string;
  protocol: string;
  allocation_pct: number;
}

export const api = {
  apy: () => req<Record<string, ApyRow>>('/apy'),
  backtest: (blocks: BlockPayload[], days = 30, runs = 50) =>
    req<BacktestResult>('/backtest', {
      method: 'POST',
      body: JSON.stringify({ blocks, days, runs }),
    }),
  risk: (blocks: BlockPayload[]) =>
    req<RiskResult>('/risk', { method: 'POST', body: JSON.stringify({ blocks }) }),
  events: (vault?: string, limit = 50) => {
    const q = new URLSearchParams();
    if (vault) q.set('vault', vault);
    q.set('limit', String(limit));
    return req<{ events: VaultEvent[] }>(`/events?${q.toString()}`);
  },
  history: (vault: string) =>
    req<{ vault: string; snapshots: { ts: number; total_deposits: number; performance_bps: number }[] }>(
      `/vaults/${vault}/history`,
    ),
};
