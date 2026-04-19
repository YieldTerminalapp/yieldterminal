import { Routes, Route, Link, useLocation } from 'react-router-dom';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import CoverIssuePage from './pages/CoverIssuePage';
import BuilderPage from './pages/BuilderPage';
import VaultsPage from './pages/VaultsPage';
import BacktestPage from './pages/BacktestPage';

function Masthead() {
  const loc = useLocation();
  const nav = [
    { to: '/app',      label: 'BUILD',    code: 'F1' },
    { to: '/vaults',   label: 'FUNDS',    code: 'F2' },
    { to: '/backtest', label: 'RESEARCH', code: 'F3' },
  ];
  return (
    <header className="border-b border-steel bg-onyx sticky top-0 z-40 backdrop-blur">
      <div className="max-w-[1440px] mx-auto px-5 h-14 flex items-center justify-between gap-8">
        <Link to="/" className="flex items-center gap-3 shrink-0">
          <div className="w-3 h-3 bg-acid pulse-ring" />
          <span className="font-display text-xl font-black tracking-tight">YIELDTERMINAL</span>
          <span className="hidden md:inline label !text-[9px] !text-smoke">DEVNET·v0.3</span>
        </Link>

        <nav className="flex items-stretch h-full">
          {nav.map((n) => {
            const active = loc.pathname === n.to;
            return (
              <Link
                key={n.to}
                to={n.to}
                className={`flex items-center gap-2 px-4 border-x border-steel -mx-px transition-colors ${
                  active ? 'bg-acid text-onyx' : 'text-silver hover:bg-graphite'
                }`}
              >
                <span className={`font-mono text-[9px] tracking-widest3 ${active ? 'text-onyx/60' : 'text-smoke'}`}>{n.code}</span>
                <span className="font-mono text-[11px] tracking-widest2 font-medium">{n.label}</span>
              </Link>
            );
          })}
        </nav>

        <WalletMultiButton />
      </div>
    </header>
  );
}

function Colophon() {
  return (
    <footer className="border-t border-steel bg-onyx">
      <div className="max-w-[1440px] mx-auto px-5 py-12 grid md:grid-cols-12 gap-8">
        <div className="md:col-span-5">
          <div className="font-display text-4xl font-black mb-3">YIELDTERMINAL</div>
          <p className="font-mono text-xs text-smoke leading-relaxed max-w-md uppercase tracking-wider">
            Composable yield strategies on Solana. Built for traders who need evidence, not theses.
          </p>
        </div>
        <div className="md:col-span-3">
          <div className="label mb-3">SOURCE</div>
          <ul className="space-y-1.5 font-mono text-xs">
            <li><a href="https://github.com/max-defi/yieldterminal" className="text-silver hover:text-acid border-b border-steel hover:border-acid">github ↗</a></li>
            <li><a href="#" className="text-smoke hover:text-acid">@yieldterminal</a></li>
          </ul>
        </div>
        <div className="md:col-span-4">
          <div className="label mb-3">ON-CHAIN</div>
          <ul className="space-y-1.5 font-mono text-xs text-silver">
            <li><span className="text-smoke">PROG&nbsp;</span>313NKsMsgi…MW6VL5</li>
            <li><span className="text-smoke">NET &nbsp;</span>solana devnet</li>
            <li><span className="text-smoke">ARCH&nbsp;</span>anchor 1.0 · fastapi 0.115</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-steel">
        <div className="max-w-[1440px] mx-auto px-5 py-3 flex items-center justify-between font-mono text-[10px] text-smoke tracking-widest2 uppercase">
          <span>© 2026 · Not financial advice · audit your own vaults</span>
          <span className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-acid blink" />
            <span>live · devnet · latency 34ms</span>
          </span>
        </div>
      </div>
    </footer>
  );
}

export default function App() {
  const loc = useLocation();
  const isLanding = loc.pathname === '/';
  return (
    <div className="min-h-screen flex flex-col bg-onyx">
      <Masthead />
      <main className="flex-1">
        <Routes>
          <Route path="/"         element={<CoverIssuePage />} />
          <Route path="/app"      element={<BuilderPage />} />
          <Route path="/vaults"   element={<VaultsPage />} />
          <Route path="/backtest" element={<BacktestPage />} />
        </Routes>
      </main>
      {isLanding && <Colophon />}
    </div>
  );
}
