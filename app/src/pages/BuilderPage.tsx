import { useCallback, useMemo } from 'react';
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

function StrategyNode({ data }: { data: { label: string; protocol: string; color: string } }) {
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

const initialNodes: Node[] = [
  { id: '1', type: 'strategy', position: { x: 250, y: 50 }, data: { label: 'Deposit SOL', protocol: 'Marinade', color: '#22c55e' } },
  { id: '2', type: 'strategy', position: { x: 100, y: 200 }, data: { label: 'Stake mSOL', protocol: 'Marinade', color: '#22c55e' } },
  { id: '3', type: 'strategy', position: { x: 400, y: 200 }, data: { label: 'LP mSOL/SOL', protocol: 'Kamino', color: '#a855f7' } },
  { id: '4', type: 'strategy', position: { x: 250, y: 350 }, data: { label: 'Sell Covered Call', protocol: 'Drift', color: '#f59e0b' } },
];

const initialEdges: Edge[] = [
  { id: 'e1-2', source: '1', target: '2', animated: true, style: { stroke: '#22c55e' } },
  { id: 'e1-3', source: '1', target: '3', animated: true, style: { stroke: '#a855f7' } },
  { id: 'e3-4', source: '3', target: '4', animated: true, style: { stroke: '#f59e0b' } },
];

const BLOCK_TYPES = [
  { label: 'Stake', protocol: 'Marinade', color: '#22c55e' },
  { label: 'LP Provide', protocol: 'Kamino', color: '#a855f7' },
  { label: 'Covered Call', protocol: 'Drift', color: '#f59e0b' },
  { label: 'Swap', protocol: 'Jupiter', color: '#3b82f6' },
  { label: 'Lend', protocol: 'Kamino', color: '#06b6d4' },
  { label: 'Hedge', protocol: 'Drift', color: '#ef4444' },
];

export default function BuilderPage() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge({ ...params, animated: true, style: { stroke: '#475569' } }, eds)),
    [setEdges]
  );

  const addBlock = useCallback(
    (block: typeof BLOCK_TYPES[number]) => {
      const id = `${Date.now()}`;
      const newNode: Node = {
        id,
        type: 'strategy',
        position: { x: 200 + Math.random() * 200, y: 100 + Math.random() * 200 },
        data: { label: block.label, protocol: block.protocol, color: block.color },
      };
      setNodes((nds) => [...nds, newNode]);
    },
    [setNodes]
  );

  const memoizedNodeTypes = useMemo(() => nodeTypes, []);

  return (
    <div className="flex h-[calc(100vh-48px)]">
      {/* Sidebar */}
      <div className="w-56 bg-navy-800 border-r border-navy-700 p-4 flex flex-col gap-3">
        <h2 className="text-[10px] text-gray-500 font-bold tracking-widest uppercase">Strategy Blocks</h2>
        {BLOCK_TYPES.map((block) => (
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
      </div>

      {/* Canvas */}
      <div className="flex-1">
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
          <Controls
            style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
          />
        </ReactFlow>
      </div>
    </div>
  );
}
