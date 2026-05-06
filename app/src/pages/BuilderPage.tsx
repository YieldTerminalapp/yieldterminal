import { useCallback, useEffect, useMemo, useState } from 'react';
import ReactFlow, {
  addEdge,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
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

// Node with a delete affordance — onDelete is passed via data.
interface NodeDataWithDelete extends BlockNodeData {
  onDelete?: (id: string) => void;
  nodeId?: string;
}

function StrategyNode({ data, id }: { data: NodeDataWithDelete; id: string }) {
  return (
    <div className="bg-onyx border border-steel group relative min-w-[200px]">
      <Handle type="target" position={Position.Top} style={{ background: '#D4FF00', width: 10, height: 10, border: 0, borderRadius: 0 }} />
      <div className="flex items-center justify-between border-b border-steel px-3 py-1.5">
        <div className="font-mono text-[9px] tracking-widest2 text-smoke uppercase">{data.protocol}</div>
        <button
          onClick={(e) => { e.stopPropagation(); data.onDelete?.(id); }}
          className="opacity-0 group-hover:opacity-100 w-4 h-4 flex items-center justify-center text-smoke hover:text-blood text-xs leading-none transition-opacity"
          title="remove block (backspace when selected)"
        >
          ✕
        </button>
      </div>
      <div className="px-3 py-3">
        <div className="font-display text-lg font-black tracking-tight leading-tight">{data.label.toUpperCase()}</div>
        <div className="h-0.5 w-6 mt-1.5 bg-acid" />
      </div>
      <Handle type="source" position={Position.Bottom} style={{ background: '#D4FF00', width: 10, height: 10, border: 0, borderRadius: 0 }} />
    </div>
  );
}

const nodeTypes = { strategy: StrategyNode };

const initialNodes: Node<NodeDataWithDelete>[] = [
  { id: '1', type: 'strategy', position: { x: 140, y: 60 }, data: BLOCKS[0] },
  { id: '2', type: 'strategy', position: { x: 460, y: 60 }, data: BLOCKS[1] },
  { id: '3', type: 'strategy', position: { x: 300, y: 280 }, data: BLOCKS[2] },
];

const initialEdges: Edge[] = [
  { id: 'e1-3', source: '1', target: '3', animated: true, style: { stroke: '#D4FF00', strokeWidth: 1.25 } },
  { id: 'e2-3', source: '2', target: '3', animated: true, style: { stroke: '#D4FF00', strokeWidth: 1.25 } },
];

type DeployStatus =
  | { kind: 'idle' }
  | { kind: 'signing' }
  | { kind: 'ok'; sig: string; vault: string }
  | { kind: 'err'; msg: string };

function riskColor(label: string): string {
  return {
    Conservative: 'text-acid border-acid',
    Moderate:     'text-hazard border-hazard',
    Aggressive:   'text-blood border-blood',
    Speculative:  'text-blood border-blood bg-blood/10',
  }[label] || 'text-smoke border-smoke';
}

function BuilderCanvas() {
  const [nodes, setNodes, onNodesChange] = useNodesState<NodeDataWithDelete>(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const { deleteElements } = useReactFlow();
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

  const removeNode = useCallback((nodeId: string) => {
    deleteElements({ nodes: [{ id: nodeId }] });
  }, [deleteElements]);

  // inject onDelete into every node's data
  useEffect(() => {
    setNodes((nds) => nds.map((n) => n.data.onDelete ? n : { ...n, data: { ...n.data, onDelete: removeNode } }));
  }, [removeNode, setNodes]);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge({ ...params, animated: true, style: { stroke: '#D4FF00', strokeWidth: 1.25 } }, eds)),
    [setEdges],
  );

  const addBlock = useCallback((block: BlockType) => {
    const id = `${Date.now()}`;
    setNodes((nds) => [...nds, {
      id,
      type: 'strategy',
      position: { x: 200 + Math.random() * 220, y: 100 + Math.random() * 200 },
      data: { ...block, onDelete: removeNode },
    }]);
  }, [setNodes, removeNode]);

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
    setBacktest(null); setRisk(null);
    setModalOpen(true);
    runPreview();
  }, [runPreview]);

  useEffect(() => { if (modalOpen) runPreview(); }, [strategy, modalOpen]);

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
        .accounts({ config, vault, creator: publicKey, systemProgram: SYSTEM_PROGRAM })
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
    const w = 420, h = 72;
    return pts.map((v, i) => {
      const x = (i / (pts.length - 1)) * w;
      const y = h - ((v - min) / range) * h;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
  }, [backtest]);

  return (
    <div className="max-w-[1440px] mx-auto px-5 py-5">
      {/* page bar */}
      <div className="flex items-baseline justify-between border-b border-steel pb-3 mb-5">
        <div className="flex items-baseline gap-5">
          <span className="label !text-acid">F1 · BUILD</span>
          <h1 className="font-display text-3xl font-black tracking-tight">STRATEGY CANVAS</h1>
        </div>
        <div className="font-mono text-[10px] text-smoke uppercase tracking-widest2 hidden md:block">
          CLICK PRIMITIVES · WIRE NODES · BACKSPACE TO DELETE
        </div>
      </div>

      <div className="grid grid-cols-12 gap-5">
        {/* primitive rack */}
        <aside className="col-span-12 md:col-span-3 space-y-2">
          <div className="flex items-baseline justify-between mb-2">
            <span className="label">PRIMITIVES</span>
            <span className="label">APY · LIVE</span>
          </div>
          {BLOCKS.map((block) => {
            const live = apy?.[block.protocol];
            return (
              <button
                key={block.label}
                onClick={() => addBlock(block)}
                className="w-full text-left bg-coal border border-steel hover:border-acid hover:bg-graphite transition-all group"
              >
                <div className="flex items-baseline justify-between px-3 py-2 border-b border-steel">
                  <span className="font-mono text-[9px] uppercase tracking-widest2 text-smoke group-hover:text-acid">{block.protocol}</span>
                  {live && (
                    <span className="flex items-baseline gap-1 font-mono text-[10px]">
                      <span className={`inline-block w-1 h-1 ${live.source === 'live' ? 'bg-acid' : 'bg-hazard'}`} />
                      <span className="num text-silver">{live.apy.toFixed(2)}%</span>
                    </span>
                  )}
                </div>
                <div className="px-3 py-2.5">
                  <div className="font-display text-base font-black tracking-tight uppercase">{block.label}</div>
                </div>
              </button>
            );
          })}

          <div className="border-t border-steel pt-4 mt-5 space-y-1.5">
            <div className="flex items-baseline justify-between font-mono text-[10px] uppercase tracking-widest2">
              <span className="text-smoke">BLOCKS</span>
              <span className="num text-silver">{nodes.length}/5</span>
            </div>
            <div className="flex items-baseline justify-between font-mono text-[10px] uppercase tracking-widest2">
              <span className="text-smoke">SPLIT</span>
              <span className="num text-silver">{splitAllocation(nodes.length).join(' / ')}</span>
            </div>
            <button
              onClick={openModal}
              disabled={!canDeploy}
              className="w-full mt-4 bg-acid text-onyx py-3 font-mono text-[11px] uppercase tracking-widest2 font-semibold hover:bg-silver disabled:bg-steel disabled:text-smoke disabled:cursor-not-allowed transition-colors"
            >
              {publicKey ? 'DRAFT PROSPECTUS →' : 'CONNECT WALLET'}
            </button>
          </div>
        </aside>

        {/* canvas */}
        <div className="col-span-12 md:col-span-9">
          <div className="border border-steel h-[calc(100vh-10rem)] relative bg-coal">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              nodeTypes={memoizedNodeTypes}
              deleteKeyCode={['Backspace', 'Delete']}
              fitView
            >
              <Background color="#242424" gap={32} size={1} />
              <Controls showInteractive={false} />
            </ReactFlow>

            {/* keybind hint */}
            <div className="absolute bottom-3 right-3 font-mono text-[9px] uppercase tracking-widest2 text-smoke">
              <span className="border border-steel px-1.5 py-0.5">⌫ DEL</span> <span className="ml-1">to remove selected</span>
            </div>

            {status.kind === 'ok' && (
              <div className="absolute top-4 right-4 bg-onyx border border-acid p-4 max-w-sm">
                <div className="label !text-acid mb-1">FUND UNDERWRITTEN</div>
                <div className="num text-xs text-silver break-all mt-1">{status.vault.slice(0, 24)}…</div>
                <a
                  href={`https://solscan.io/tx/${status.sig}?cluster=devnet`}
                  target="_blank" rel="noreferrer"
                  className="inline-block mt-2 font-mono text-[10px] uppercase tracking-widest2 text-acid border-b border-acid"
                >
                  TX ON SOLSCAN →
                </a>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* PROSPECTUS MODAL */}
      {modalOpen && (
        <div className="fixed inset-0 bg-onyx/80 backdrop-blur flex items-center justify-center z-50 px-4">
          <div className="bg-onyx border border-acid w-[680px] max-h-[90vh] overflow-y-auto">
            <div className="border-b border-steel px-6 py-4 flex items-baseline justify-between">
              <div>
                <div className="label !text-acid mb-1">PROSPECTUS · DRAFT</div>
                <h2 className="font-display text-2xl font-black">UNDERWRITE FUND</h2>
              </div>
              <button onClick={() => setModalOpen(false)} disabled={status.kind === 'signing'} className="font-mono text-xs text-smoke hover:text-blood">
                CLOSE ✕
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* name */}
              <div>
                <label className="label block mb-2">FUND TITLE</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={32}
                  className="!text-2xl font-display font-black"
                />
              </div>

              {/* strategy */}
              <div>
                <label className="label block mb-2">THESIS · STRATEGY TYPE</label>
                <div className="grid grid-cols-3 border border-steel divide-x divide-steel">
                  {STRATEGY_KINDS.map((s) => {
                    const active = strategy === s.key;
                    return (
                      <button
                        key={s.key}
                        onClick={() => setStrategy(s.key)}
                        className={`py-3 font-mono text-[11px] uppercase tracking-widest2 transition-colors ${
                          active ? 'bg-acid text-onyx' : 'bg-onyx text-smoke hover:text-silver'
                        }`}
                      >
                        {s.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* backtest preview */}
              <div>
                <div className="flex items-baseline justify-between mb-2">
                  <label className="label">ABSTRACT · FIG. 1 EQUITY CURVE</label>
                  <button onClick={runPreview} disabled={previewLoading} className="font-mono text-[10px] uppercase tracking-widest2 text-acid hover:text-silver disabled:text-smoke">
                    {previewLoading ? 'RUNNING…' : 'RE-RUN'}
                  </button>
                </div>

                {!backtest && !previewLoading && (
                  <div className="font-mono text-xs text-smoke italic border border-steel p-3">AGGREGATOR OFFLINE. DEPLOY STILL WORKS.</div>
                )}

                {backtest && risk && (
                  <div className="border border-steel">
                    <div className="grid grid-cols-4 divide-x divide-steel border-b border-steel">
                      <TableStat label="APY" value={`${backtest.annualized_apy >= 0 ? '+' : ''}${backtest.annualized_apy}%`} color={backtest.annualized_apy >= 0 ? 'acid' : 'blood'} />
                      <TableStat label="SHARPE" value={backtest.sharpe_ratio.toFixed(2)} color={backtest.sharpe_ratio >= 1 ? 'acid' : 'silver'} />
                      <TableStat label="MAX DD" value={`−${backtest.max_drawdown_pct}%`} color="blood" />
                      <TableStat label="WIN" value={`${backtest.win_rate}%`} color="silver" />
                    </div>
                    {sparkline && (
                      <div className="px-3 py-3 border-b border-steel bg-coal">
                        <svg viewBox="0 0 420 72" className="w-full h-16">
                          <path d={sparkline} fill="none" stroke="#D4FF00" strokeWidth="1.5" />
                        </svg>
                      </div>
                    )}
                    <div className="px-3 py-2.5 flex items-center gap-3 flex-wrap">
                      <span className={`font-mono text-[10px] uppercase tracking-widest2 border px-1.5 py-0.5 ${riskColor(risk.label)}`}>
                        {risk.label.toUpperCase()} · {risk.score}
                      </span>
                      <span className="font-mono text-[10px] text-smoke">VaR {risk.var_1d_pct}% · β {risk.sol_beta}</span>
                    </div>
                    {risk.notes.length > 0 && (
                      <div className="px-3 py-2 border-t border-steel font-mono text-[10px] text-smoke uppercase tracking-wider">
                        {risk.notes.map((n, i) => <div key={i}>[{(i+1).toString().padStart(2,'0')}] {n}</div>)}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* composition */}
              <div>
                <label className="label block mb-2">ALLOCATIONS</label>
                <div className="border border-steel">
                  <div className="grid grid-cols-[50px_1fr_1fr_80px] bg-coal border-b border-steel font-mono text-[10px] uppercase tracking-widest2 text-smoke">
                    <div className="px-3 py-2">#</div>
                    <div className="px-3 py-2">PROTOCOL</div>
                    <div className="px-3 py-2">ACTION</div>
                    <div className="px-3 py-2 text-right">W</div>
                  </div>
                  {nodes.map((n, i) => (
                    <div key={n.id} className="grid grid-cols-[50px_1fr_1fr_80px] border-b border-steel last:border-0">
                      <div className="num px-3 py-2 text-smoke text-sm">{(i+1).toString().padStart(2,'0')}</div>
                      <div className="px-3 py-2 font-sans text-sm">{n.data.protocol}</div>
                      <div className="px-3 py-2 font-sans text-sm text-smoke">{n.data.label}</div>
                      <div className="num px-3 py-2 text-right text-sm text-acid">{splitAllocation(nodes.length)[i]}%</div>
                    </div>
                  ))}
                </div>
              </div>

              {status.kind === 'err' && (
                <div className="border border-blood text-blood font-mono text-xs px-3 py-2">{status.msg}</div>
              )}
            </div>

            <div className="border-t border-steel px-6 py-4 flex items-baseline justify-between">
              <div className="font-mono text-[10px] text-smoke uppercase tracking-widest2">
                SIGNING CREATES A PDA · ALLOCATIONS ARE IMMUTABLE
              </div>
              <div className="flex items-center gap-4">
                <button onClick={() => setModalOpen(false)} disabled={status.kind === 'signing'} className="font-mono text-xs uppercase tracking-widest2 text-smoke hover:text-silver">
                  CANCEL
                </button>
                <button
                  onClick={deploy}
                  disabled={status.kind === 'signing'}
                  className="bg-acid text-onyx px-6 py-3 font-mono text-[11px] uppercase tracking-widest2 font-semibold hover:bg-silver disabled:bg-steel disabled:text-smoke"
                >
                  {status.kind === 'signing' ? 'SIGNING…' : 'SIGN & PUBLISH →'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function BuilderPage() {
  return (
    <ReactFlowProvider>
      <BuilderCanvas />
    </ReactFlowProvider>
  );
}

function TableStat({ label, value, color }: { label: string; value: string; color: 'acid' | 'blood' | 'silver' }) {
  const c = color === 'acid' ? 'text-acid' : color === 'blood' ? 'text-blood' : 'text-silver';
  return (
    <div className="px-3 py-3">
      <div className="label text-[9px] mb-1">{label}</div>
      <div className={`num text-xl font-semibold ${c}`}>{value}</div>
    </div>
  );
}
