import { Routes, Route, Link, useLocation } from 'react-router-dom';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import BuilderPage from './pages/BuilderPage';
import VaultsPage from './pages/VaultsPage';
import BacktestPage from './pages/BacktestPage';

export default function App() {
  const loc = useLocation();
  const navLinks = [
    { to: '/', label: 'Builder' },
    { to: '/vaults', label: 'Vaults' },
    { to: '/backtest', label: 'Backtest' },
  ];

  return (
    <div className="min-h-screen">
      <header className="bg-navy-800 border-b border-navy-700 h-12 flex items-center px-4 sticky top-0 z-50">
        <div className="flex items-center gap-6 w-full">
          <h1 className="text-sm font-bold tracking-wide text-white">
            Yield<span className="text-accent">Terminal</span>
          </h1>
          <nav className="flex gap-1 text-xs">
            {navLinks.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                className={`px-3 py-1.5 rounded transition-colors ${
                  loc.pathname === l.to ? 'bg-accent/20 text-accent' : 'text-gray-400 hover:text-white'
                }`}
              >
                {l.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto">
            <WalletMultiButton style={{
              backgroundColor: '#1e293b',
              border: '1px solid #334155',
              borderRadius: '6px',
              fontSize: '12px',
              height: '32px',
              padding: '0 14px',
              fontFamily: 'DM Sans, sans-serif',
            }} />
          </div>
        </div>
      </header>

      <Routes>
        <Route path="/" element={<BuilderPage />} />
        <Route path="/vaults" element={<VaultsPage />} />
        <Route path="/backtest" element={<BacktestPage />} />
      </Routes>
    </div>
  );
}
