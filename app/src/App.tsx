import { Routes, Route, Link, useLocation } from 'react-router-dom';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import LandingPage from './pages/LandingPage';
import BuilderPage from './pages/BuilderPage';
import VaultsPage from './pages/VaultsPage';
import BacktestPage from './pages/BacktestPage';

function Masthead() {
  const loc = useLocation();
  const nav = [
    { to: '/app',      label: 'Build',    num: '§ 01' },
    { to: '/vaults',   label: 'Funds',    num: '§ 02' },
    { to: '/backtest', label: 'Research', num: '§ 03' },
  ];
  return (
    <header className="border-b border-ink bg-paper sticky top-0 z-40">
      <div className="max-w-[1400px] mx-auto px-6 py-4 flex items-baseline justify-between gap-8">
        <Link to="/" className="flex items-baseline gap-3 shrink-0">
          <span className="display text-2xl font-light">Yield<span className="italic">terminal</span></span>
          <span className="label hidden md:inline">— Research Terminal · v0.2 · devnet</span>
        </Link>
        <nav className="flex items-baseline gap-7 text-sm">
          {nav.map((n) => {
            const active = loc.pathname === n.to;
            return (
              <Link
                key={n.to}
                to={n.to}
                className={`flex items-baseline gap-1.5 pb-0.5 border-b transition-colors ${
                  active ? 'border-rust text-ink' : 'border-transparent text-ash hover:text-ink'
                }`}
              >
                <span className="num text-[9px] text-ash">{n.num}</span>
                <span className="font-mono uppercase tracking-widest2 text-[11px]">{n.label}</span>
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
    <footer className="border-t border-ink bg-paper mt-16">
      <div className="max-w-[1400px] mx-auto px-6 py-10 grid md:grid-cols-4 gap-8 text-sm">
        <div className="md:col-span-2">
          <div className="display text-xl mb-2">Yieldterminal</div>
          <p className="text-ash font-mono text-xs leading-relaxed max-w-md">
            A research terminal for on-chain yield strategies. Compose yield primitives from Marinade, Kamino, Drift, and Jupiter into an auditable, tradable vault on Solana.
          </p>
        </div>
        <div>
          <div className="label mb-3">Source</div>
          <ul className="space-y-1.5 font-mono text-xs">
            <li><a href="https://github.com/max-defi/yieldterminal" className="border-b border-rule hover:border-ink">github.com/max-defi/yieldterminal</a></li>
            <li><span className="text-ash">twitter · pending</span></li>
          </ul>
        </div>
        <div>
          <div className="label mb-3">On chain</div>
          <ul className="space-y-1.5 font-mono text-xs">
            <li><span className="text-ash block">program</span><span className="break-all">313NKsMsgi…MW6VL5</span></li>
            <li><span className="text-ash">cluster</span> <span>devnet</span></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-rule">
        <div className="max-w-[1400px] mx-auto px-6 py-4 flex items-baseline justify-between text-[10px] font-mono text-ash">
          <span>© MMXXVI · Yieldterminal — All vaults are auditable on-chain. Not financial advice.</span>
          <span>Printed on Solana devnet</span>
        </div>
      </div>
    </footer>
  );
}

export default function App() {
  const loc = useLocation();
  const isLanding = loc.pathname === '/';
  return (
    <div className="min-h-screen flex flex-col">
      <Masthead />
      <main className="flex-1">
        <Routes>
          <Route path="/"         element={<LandingPage />} />
          <Route path="/app"      element={<BuilderPage />} />
          <Route path="/vaults"   element={<VaultsPage />} />
          <Route path="/backtest" element={<BacktestPage />} />
        </Routes>
      </main>
      {isLanding && <Colophon />}
    </div>
  );
}
