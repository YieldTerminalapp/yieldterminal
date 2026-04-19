import { useCallback, useEffect, useMemo, useState } from 'react';
import ReactFlow, {
  addEdge,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  type Connection,
  type Node,
  type Edge,
  Handle,
  Position,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { BN } from '@coral-xyz/anchor';
import { useWallet } from '@solana/wallet-adapter-react';
import { BLOCKS, BlockType, STRATEGY_KINDS, StrategyKind, splitAllocation, configPda, vaultPda, asEnum, SYSTEM_PROGRAM } from '../lib/strategy';
import { useVaultProgram } from '../lib/useProgram';
import { PROGRAM_ID } from '../lib/constants';
import { api, ApyRow, BacktestResult, RiskResult } from '../lib/api';

type BlockNodeData = BlockType;

function StrategyNode({ data }: { data: BlockNodeData }) {
  return (
    <div className="bg-paper border border-ink min-w-[180px] shadow-[3px_3px_0_#0E0C0A]">
      <Handle type="target" position={Position.Top} style={{ background: '#0E0C0A', width: 8, height: 8, border: 0 }} />
      <div className="px-3 py-2 border-b border-ink">
        <div className="label text-[9px]">{data.protocol}</div>
      </div>
      <div className="px-3 py-3">
        <div className="font-display text-lg leading-tight">{data.label}</div>
        <div className="h-0.5 w-8 mt-1.5" style={{ background: data.color }} />
      </div>
      <Handle type="source" position={Position.Bottom} style={{ background: '#0E0C0A', width: 8, height: 8, border: 0 }} />
    </div>
  );
}

const nodeTypes = { strategy: StrategyNode };

const initialNodes: Node<BlockNodeData>[] = [
  { id: '1', type: 'strategy', position: { x: 120, y: 60 }, data: BLOCKS[0] },
  { id: '2', type: 'strategy', position: { x: 420, y: 60 }, data: BLOCKS[1] },
  { id: '3', type: 'strategy', position: { x: 260, y: 280 }, data: BLOCKS[2] },
];

const initialEdges: Edge[] = [
  { id: 'e1-3', source: '1', target: '3', animated: true, style: { stroke: '#0E0C0A', strokeWidth: 1 } },
  { id: 'e2-3', source: '2', target: '3', animated: true, style: { stroke: '#0E0C0A', strokeWidth: 1 } },
];

type DeployStatus =
  | { kind: 'idle' }
  | { kind: 'signing' }
  | { kind: 'ok'; sig: string; vault: string }
  | { kind: 'err'; msg: string };

function riskColor(label: string): string {
  return {
    Conservative: 'text-leaf border-leaf',
    Moderate:     'text-amber border-amber',
    Aggressive:   'text-rust border-rust',
    Speculative:  'text-rust border-rust bg-rust/10',
  }[label] || 'text-ash border-ash';
}

export default function BuilderPage() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState('mSOL Covered Call');
  const [strategy, setStrategy] = useState<StrategyKind>('coveredCall');
  const [status, setStatus] = useState<DeployStatus>({ kind: 'idle' });

  const [apy, setApy] = useState<Record<string, ApyRow> | null>(null);
  const [backtest, setBacktest] = useState<BacktestResult | null>(null);
  const [risk, setRisk] = useState<RiskResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const vp = useVaultProgram();
  const { publicKey } = useWallet();

  useEffect(() => { api.apy().then(setApy).catch(() => {}); }, []);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge({ ...params, animated: true, style: { stroke: '#0E0C0A', strokeWidth: 1 } }, eds)),
    [setEdges],
  );

  const addBlock = useCallback((block: BlockType) => {
    const id = `${Date.now()}`;
    setNodes((nds) => [...nds, {
      id,
      type: 'strategy',
      position: { x: 200 + Math.random() * 200, y: 100 + Math.random() * 200 },
      data: block,
    }]);
  }, [setNodes]);

  const memoizedNodeTypes = useMemo(() => nodeTypes, []);

  const canDeploy = !!publicKey && !!vp?.signed && nodes.length >= 1 && nodes.length <= 5;

  const blocksPayload = useMemo(() => {
    const pcts = splitAllocation(nodes.length);
    return nodes.map((n, i) => ({
      action: n.data.action.replace(/([A-Z])/g, '_$1').toLowerCase(),
      protocol: n.data.protocol,
      allocation_pct: pcts[i],
    }));
  }, [nodes]);

  const runPreview = useCallback(async () => {
    if (nodes.length === 0) return;
    setPreviewLoading(true);
    try {
      const [bt, rk] = await Promise.all([
        api.backtest(blocksPayload, 30, 40, strategy),
        api.risk(blocksPayload, strategy),
      ]);
      setBacktest(bt);
      setRisk(rk);
    } catch (e) {
      console.warn('preview failed:', e);
    } finally {
      setPreviewLoading(false);
    }
  }, [blocksPayload, nodes.length, strategy]);

  const openModal = useCallback(() => {
    setStatus({ kind: 'idle' });
    setBacktest(null);
    setRisk(null);
    setModalOpen(true);
    runPreview();
  }, [runPreview]);

  useEffect(() => {
    if (modalOpen) runPreview();
  }, [strategy, modalOpen]);

  const deploy = useCallback(async () => {
    if (!vp || !publicKey) return;
    setStatus({ kind: 'signing' });
    try {
      const trimmed = name.trim();
      if (!trimmed || trimmed.length > 32) throw new Error('name must be 1–32 chars');
      if (nodes.length === 0 || nodes.length > 5) throw new Error('need 1–5 blocks');

      const pcts = splitAllocation(nodes.length);
      const blocks = nodes.map((n, i) => ({
        action: asEnum(n.data.action),
        protocol: asEnum(n.data.protocol),
        allocationPct: pcts[i],
      }));

      const config = configPda(PROGRAM_ID);
      const cfg: any = await (vp.program.account as any).yieldConfig.fetch(config);
      const nextId = new BN(cfg.totalVaults.toString());
      const vault = vaultPda(PROGRAM_ID, publicKey, nextId);

      const sig = await vp.program.methods
        .createVault(trimmed, asEnum(strategy), blocks)
        .accounts({
          config, vault, creator: publicKey, systemProgram: SYSTEM_PROGRAM,
        })
        .rpc();

      setStatus({ kind: 'ok', sig, vault: vault.toBase58() });
      setModalOpen(false);
    } catch (e: any) {
      setStatus({ kind: 'err', msg: e?.message || 'deploy failed' });
    }
  }, [vp, publicKey, name, strategy, nodes]);

  const sparkline = useMemo(() => {
    if (!backtest?.equity_curve.length) return '';
    const pts = backtest.equity_curve;
    const min = Math.min(...pts), max = Math.max(...pts);
    const range = max - min || 1;
    const w = 360, h = 60;
    return pts.map((v, i) => {
      const x = (i / (pts.length - 1)) * w;
      const y = h - ((v - min) / range) * h;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
  }, [backtest]);

  return (
    <div className="max-w-[1400px] mx-auto px-6 py-6">
      {/* page header */}
      <div className="flex items-baseline justify-between border-b border-ink pb-3 mb-6">
        <div>
          <div className="label mb-1">§ 01 · Composition</div>
          <h1 className="display text-3xl">Strategy canvas</h1>
        </div>
        <div className="font-mono text-xs text-ash">
          Drag blocks from the card index. Wire flow. Sign to underwrite.
        </div>
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* block card index (left) */}
        <aside className="col-span-12 md:col-span-3 space-y-3">
          <div className="label">Primitive index · live APY</div>
          {BLOCKS.map((block) => {
            const live = apy?.[block.protocol];
            return (
              <button
                key={block.label}
                onClick={() => addBlock(block)}
                className="w-full text-left bg-paper border border-ink hover:shadow-[3px_3px_0_#C73F1F] hover:-translate-x-0.5 hover:-translate-y-0.5 transition-all group"
              >
                <div className="flex items-baseline justify-between px-3 py-2 border-b border-ink">
                  <div className="label text-[9px]">{block.protocol}</div>
                  {live && (
                    <div className="flex items-baseline gap-1 font-mono text-[10px]">
                      <span className={`inline-block w-1 h-1 rounded-full ${live.source === 'live' ? 'bg-leaf' : 'bg-amber'}`} />
                      <span className="num">{live.apy.toFixed(2)}%</span>
                    </div>
                  )}
                </div>
                <div className="px-3 py-2.5">
                  <div className="display text-lg leading-tight">{block.label}</div>
                  <div className="h-0.5 w-6 mt-1" style={{ background: block.color }} />
                </div>
              </button>
            );
          })}

          {/* sidebar state */}
          <div className="border-t border-ink pt-3 mt-5">
            <div className="label mb-2">Composition</div>
            <div className="font-mono text-xs space-y-0.5">
              <div><span className="text-ash">blocks</span> · <span className="num">{nodes.length}/5</span></div>
              <div><span className="text-ash">split</span> · <span className="num">{splitAllocation(nodes.length).join(' / ')}</span></div>
            </div>
            <button
              onClick={openModal}
              disabled={!canDeploy}
              className="w-full mt-4 bg-ink text-paper py-3 font-mono text-[11px] uppercase tracking-widest2 hover:bg-rust disabled:bg-rule disabled:text-ash disabled:cursor-not-allowed shadow-[3px_3px_0_#C73F1F] hover:shadow-[5px_5px_0_#C73F1F] hover:-translate-x-0.5 hover:-translate-y-0.5 transition-all"
            >
              {publicKey ? 'Draft prospectus →' : 'Connect wallet'}
            </button>
          </div>
        </aside>

        {/* canvas */}
        <div className="col-span-12 md:col-span-9">
          <div className="border border-ink h-[calc(100vh-14rem)] relative bg-paper">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              nodeTypes={memoizedNodeTypes}
              fitView
            >
              <Background color="#D9D3C6" gap={24} size={1} />
              <Controls showInteractive={false} />
            </ReactFlow>

            {status.kind === 'ok' && (
              <div className="absolute top-4 right-4 bg-paper border border-ink shadow-[3px_3px_0_#1E5A3A] p-4 max-w-sm">
                <div className="label mb-1 text-leaf">Underwritten</div>
                <div className="font-mono text-xs break-all mt-1">{status.vault.slice(0, 22)}…</div>
                <a
                  href={`https://solscan.io/tx/${status.sig}?cluster=devnet`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-block mt-2 font-mono text-[11px] uppercase tracking-widest2 border-b border-ink hover:text-rust"
                >
                  tx on solscan →
                </a>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* prospectus modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-ink/40 backdrop-blur-sm flex items-center justify-center z-50 px-4">
          <div className="bg-paper border border-ink w-[640px] max-h-[90vh] overflow-y-auto shadow-[8px_8px_0_#C73F1F]">
            <div className="border-b border-ink px-6 py-4 flex items-baseline justify-between">
              <div>
                <div className="label mb-1">Prospectus · Draft</div>
                <h2 className="display text-2xl">Underwrite vault</h2>
              </div>
              <button onClick={() => setModalOpen(false)} disabled={status.kind === 'signing'} className="font-mono text-xs text-ash hover:text-rust">close ✕</button>
            </div>

            <div className="p-6 space-y-6">
              {/* name */}
              <div>
                <label className="label block mb-2">Fund title</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={32}
                  className="w-full display text-xl !border-b-2"
                />
              </div>

              {/* strategy */}
              <div>
                <label className="label block mb-2">Thesis · Strategy type</label>
                <div className="grid grid-cols-3 border border-ink divide-x divide-ink">
                  {STRATEGY_KINDS.map((s) => {
                    const active = strategy === s.key;
                    return (
                      <button
                        key={s.key}
                        onClick={() => setStrategy(s.key)}
                        className={`py-3 font-mono text-[11px] uppercase tracking-widest2 transition-colors ${
                          active ? 'bg-ink text-paper' : 'bg-paper text-ash hover:text-ink'
                        }`}
                      >
                        {s.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* abstract */}
              <div>
                <div className="flex items-baseline justify-between mb-2">
                  <label className="label">Abstract · fig. 1 equity curve</label>
                  <button onClick={runPreview} disabled={previewLoading} className="font-mono text-[10px] uppercase tracking-widest2 text-rust border-b border-rust/40 hover:border-rust pb-px disabled:text-ash disabled:border-rule">
                    {previewLoading ? 'running…' : 're-run'}
                  </button>
                </div>

                {!backtest && !previewLoading && (
                  <div className="font-mono text-xs text-ash italic">Aggregator offline. Deploy still works; backtest optional.</div>
                )}

                {backtest && risk && (
                  <div className="border border-ink">
                    <div className="grid grid-cols-4 divide-x divide-ink border-b border-ink">
                      <TableStat label="APY" value={`${backtest.annualized_apy >= 0 ? '+' : ''}${backtest.annualized_apy}%`} color={backtest.annualized_apy >= 0 ? 'leaf' : 'rust'} />
                      <TableStat label="Sharpe" value={backtest.sharpe_ratio.toFixed(2)} color={backtest.sharpe_ratio >= 1 ? 'leaf' : 'ink'} />
                      <TableStat label="Max DD" value={`−${backtest.max_drawdown_pct}%`} color="rust" />
                      <TableStat label="Win" value={`${backtest.win_rate}%`} color="ink" />
                    </div>
                    {sparkline && (
                      <div className="px-3 py-3 border-b border-ink">
                        <svg viewBox="0 0 360 60" className="w-full h-14">
                          <path d={sparkline} fill="none" stroke="#0E0C0A" strokeWidth="1.25" />
                        </svg>
                      </div>
                    )}
                    <div className="px-3 py-2.5 flex items-baseline justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`font-mono text-[10px] uppercase tracking-widest2 border px-1.5 py-0.5 ${riskColor(risk.label)}`}>
                          {risk.label} · {risk.score}
                        </span>
                        <span className="font-mono text-[10px] text-ash">VaR {risk.var_1d_pct}% · β {risk.sol_beta}</span>
                      </div>
                    </div>
                    {risk.notes.length > 0 && (
                      <div className="px-3 py-2 border-t border-rule font-mono text-[10px] text-ash italic">
                        {risk.notes.map((n, i) => <div key={i}>{i + 1}. {n}</div>)}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* composition table */}
              <div>
                <label className="label block mb-2">Allocations</label>
                <table className="w-full border border-ink">
                  <thead>
                    <tr className="border-b border-ink">
                      <th className="label text-left px-3 py-1.5 font-normal">#</th>
                      <th className="label text-left px-3 py-1.5 font-normal">Protocol</th>
                      <th className="label text-left px-3 py-1.5 font-normal">Action</th>
                      <th className="label text-right px-3 py-1.5 font-normal">Weight</th>
                    </tr>
                  </thead>
                  <tbody>
                    {nodes.map((n, i) => (
                      <tr key={n.id} className="border-b border-rule last:border-0">
                        <td className="num px-3 py-2 text-ash">{(i + 1).toString().padStart(2, '0')}</td>
                        <td className="px-3 py-2 font-sans text-sm">{n.data.protocol}</td>
                        <td className="px-3 py-2 font-sans text-sm">{n.data.label}</td>
                        <td className="num px-3 py-2 text-right">{splitAllocation(nodes.length)[i]}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {status.kind === 'err' && (
                <div className="border border-rust text-rust font-mono text-xs px-3 py-2">{status.msg}</div>
              )}
            </div>

            <div className="border-t border-ink px-6 py-4 flex items-baseline justify-between">
              <div className="font-mono text-[10px] text-ash">
                Signing creates a PDA vault. Allocations immutable post-publish.
              </div>
              <div className="flex items-center gap-4">
                <button onClick={() => setModalOpen(false)} disabled={status.kind === 'signing'} className="font-mono text-xs uppercase tracking-widest2 text-ash hover:text-ink">
                  cancel
                </button>
                <button
                  onClick={deploy}
                  disabled={status.kind === 'signing'}
                  className="bg-ink text-paper px-6 py-3 font-mono text-[11px] uppercase tracking-widest2 hover:bg-rust disabled:bg-rule disabled:text-ash shadow-[3px_3px_0_#C73F1F] hover:shadow-[5px_5px_0_#C73F1F] hover:-translate-x-0.5 hover:-translate-y-0.5 transition-all"
                >
                  {status.kind === 'signing' ? 'Signing…' : 'Sign & publish →'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TableStat({ label, value, color }: { label: string; value: string; color: 'leaf' | 'rust' | 'ink' }) {
  const c = color === 'leaf' ? 'text-leaf' : color === 'rust' ? 'text-rust' : 'text-ink';
  return (
    <div className="px-3 py-2.5">
      <div className="label text-[9px] mb-0.5">{label}</div>
      <div className={`num text-xl font-medium ${c}`}>{value}</div>
    </div>
  );
}
