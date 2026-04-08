import { useCallback, useMemo, useState } from 'react';
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

type BlockNodeData = BlockType;

function StrategyNode({ data }: { data: BlockNodeData }) {
  return (
    <div
      className="rounded-lg border px-4 py-3 min-w-[160px] shadow-lg"
      style={{ background: '#1e293b', borderColor: data.color }}
    >
      <Handle type="target" position={Position.Top} style={{ background: data.color }} />
      <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: data.color }}>
        {data.protocol}
      </div>
      <div className="text-sm font-semibold text-white">{data.label}</div>
      <Handle type="source" position={Position.Bottom} style={{ background: data.color }} />
    </div>
  );
}

const nodeTypes = { strategy: StrategyNode };

const initialNodes: Node<BlockNodeData>[] = [
  { id: '1', type: 'strategy', position: { x: 120, y: 80  }, data: BLOCKS[0] },
  { id: '2', type: 'strategy', position: { x: 380, y: 80  }, data: BLOCKS[1] },
  { id: '3', type: 'strategy', position: { x: 250, y: 260 }, data: BLOCKS[2] },
];

const initialEdges: Edge[] = [
  { id: 'e1-3', source: '1', target: '3', animated: true, style: { stroke: '#22c55e' } },
  { id: 'e2-3', source: '2', target: '3', animated: true, style: { stroke: '#a855f7' } },
];

type DeployStatus =
  | { kind: 'idle' }
  | { kind: 'signing' }
  | { kind: 'ok'; sig: string; vault: string }
  | { kind: 'err'; msg: string };

export default function BuilderPage() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState('mSOL Covered Call');
  const [strategy, setStrategy] = useState<StrategyKind>('coveredCall');
  const [status, setStatus] = useState<DeployStatus>({ kind: 'idle' });

  const vp = useVaultProgram();
  const { publicKey } = useWallet();

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge({ ...params, animated: true, style: { stroke: '#475569' } }, eds)),
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
          config,
          vault,
          creator: publicKey,
          systemProgram: SYSTEM_PROGRAM,
        })
        .rpc();

      setStatus({ kind: 'ok', sig, vault: vault.toBase58() });
      setModalOpen(false);
    } catch (e: any) {
      setStatus({ kind: 'err', msg: e?.message || 'deploy failed' });
    }
  }, [vp, publicKey, name, strategy, nodes]);

  return (
    <div className="flex h-[calc(100vh-48px)]">
      {/* sidebar */}
      <div className="w-56 bg-navy-800 border-r border-navy-700 p-4 flex flex-col gap-3">
        <h2 className="text-[10px] text-gray-500 font-bold tracking-widest uppercase">Strategy Blocks</h2>
        {BLOCKS.map((block) => (
          <button
            key={block.label}
            onClick={() => addBlock(block)}
            className="text-left bg-navy-900 border border-navy-700 rounded-lg px-3 py-2.5 hover:border-accent/50 transition-colors"
          >
            <div className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: block.color }}>
              {block.protocol}
            </div>
            <div className="text-sm text-white font-medium">{block.label}</div>
          </button>
        ))}

        <div className="mt-auto pt-4 border-t border-navy-700 flex flex-col gap-2">
          <div className="text-[10px] text-gray-500 tracking-widest">
            BLOCKS: {nodes.length}/5 &middot; SPLIT: {splitAllocation(nodes.length).join('/')}
          </div>
          <button
            onClick={() => { setStatus({ kind: 'idle' }); setModalOpen(true); }}
            disabled={!canDeploy}
            className="bg-accent text-white text-xs font-semibold px-4 py-2 rounded hover:bg-blue-600 disabled:bg-navy-700 disabled:text-gray-500 disabled:cursor-not-allowed"
          >
            {publicKey ? 'Deploy Vault' : 'Connect Wallet'}
          </button>
        </div>
      </div>

      {/* canvas */}
      <div className="flex-1 relative">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={memoizedNodeTypes}
          fitView
          style={{ background: '#0f172a' }}
        >
          <Background color="#1e293b" gap={20} />
          <Controls style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }} />
        </ReactFlow>

        {status.kind === 'ok' && (
          <div className="absolute top-4 right-4 bg-green-900/40 border border-green-500/40 rounded-lg px-4 py-3 max-w-sm text-xs">
            <div className="text-green-300 font-bold mb-1">Vault deployed</div>
            <div className="text-gray-300 font-mono break-all">{status.vault.slice(0, 22)}…</div>
            <a
              href={`https://solscan.io/tx/${status.sig}?cluster=devnet`}
              target="_blank"
              rel="noreferrer"
              className="text-accent hover:underline mt-1 inline-block"
            >
              view tx on solscan ↗
            </a>
          </div>
        )}
      </div>

      {/* deploy modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-navy-800 border border-navy-700 rounded-xl p-6 w-[420px]">
            <h3 className="text-white font-semibold text-sm mb-4">Deploy strategy as vault</h3>

            <label className="text-[10px] text-gray-500 tracking-widest block mb-1">NAME</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={32}
              className="w-full bg-navy-900 border border-navy-700 rounded px-3 py-2 text-sm text-white outline-none focus:border-accent mb-4"
            />

            <label className="text-[10px] text-gray-500 tracking-widest block mb-1">STRATEGY TYPE</label>
            <div className="grid grid-cols-3 gap-2 mb-4">
              {STRATEGY_KINDS.map((s) => (
                <button
                  key={s.key}
                  onClick={() => setStrategy(s.key)}
                  className={`text-xs py-2 rounded border transition-colors ${
                    strategy === s.key
                      ? 'bg-accent/20 border-accent text-accent'
                      : 'bg-navy-900 border-navy-700 text-gray-400 hover:text-white'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>

            <div className="text-[10px] text-gray-500 bg-navy-900 rounded p-3 mb-4 font-mono">
              {nodes.map((n, i) => (
                <div key={n.id}>
                  {splitAllocation(nodes.length)[i]}%  {n.data.protocol}/{n.data.label}
                </div>
              ))}
            </div>

            {status.kind === 'err' && (
              <div className="text-xs text-red-400 bg-red-950/40 border border-red-500/30 rounded px-3 py-2 mb-3">
                {status.msg}
              </div>
            )}

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setModalOpen(false)}
                disabled={status.kind === 'signing'}
                className="text-xs text-gray-400 hover:text-white px-4 py-2"
              >
                Cancel
              </button>
              <button
                onClick={deploy}
                disabled={status.kind === 'signing'}
                className="bg-accent text-white text-xs font-semibold px-5 py-2 rounded hover:bg-blue-600 disabled:bg-navy-700"
              >
                {status.kind === 'signing' ? 'Signing…' : 'Sign & Deploy'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
