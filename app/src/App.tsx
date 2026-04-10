import { Routes, Route, Link, useLocation } from 'react-router-dom';
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
            <button className="bg-navy-700 border border-navy-600 text-xs text-gray-300 px-4 py-1.5 rounded hover:border-gray-500">
              Connect Wallet
            </button>
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
