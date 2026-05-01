import { useState } from 'react';

interface Vault {
  id: string;
  name: string;
  strategy: string;
  tvl: number;
  apy: number;
  blocks: string[];
  depositors: number;
}

const VAULTS: Vault[] = [
  { id: '1', name: 'mSOL Delta Neutral', strategy: 'DeltaNeutral', tvl: 145000, apy: 14.2, blocks: ['Stake', 'LP', 'Hedge'], depositors: 23 },
  { id: '2', name: 'SOL Covered Call', strategy: 'CoveredCall', tvl: 89000, apy: 18.5, blocks: ['Stake', 'Sell Call'], depositors: 15 },
  { id: '3', name: 'Stablecoin Yield', strategy: 'YieldFarm', tvl: 310000, apy: 8.7, blocks: ['Lend', 'LP'], depositors: 67 },
];

export default function VaultsPage() {
  const [depositVault, setDepositVault] = useState<string | null>(null);
  const [amount, setAmount] = useState('');

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-xs text-gray-500 font-bold tracking-widest mb-4">VAULT EXPLORER</h1>

      <div className="space-y-3">
        {VAULTS.map((vault) => (
          <div key={vault.id} className="bg-navy-800 border border-navy-700 rounded-xl p-5">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="text-white font-semibold">{vault.name}</h3>
                <p className="text-xs text-gray-500 mt-0.5">{vault.strategy} &middot; {vault.depositors} depositors</p>
              </div>
              <div className="text-right">
                <div className="text-accent font-bold text-lg">{vault.apy}%</div>
                <div className="text-[10px] text-gray-500">APY</div>
              </div>
            </div>

            <div className="flex gap-1.5 mb-3">
              {vault.blocks.map((b) => (
                <span key={b} className="text-[10px] bg-navy-900 border border-navy-700 px-2 py-0.5 rounded text-gray-400">
                  {b}
                </span>
              ))}
            </div>

            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">TVL: ${vault.tvl.toLocaleString()}</span>
              {depositVault === vault.id ? (
                <div className="flex gap-2 items-center">
                  <input
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="Amount"
                    type="number"
                    className="bg-navy-900 border border-navy-700 rounded px-3 py-1.5 text-sm w-28 outline-none text-white"
                  />
                  <button className="bg-accent text-white text-xs font-semibold px-4 py-1.5 rounded hover:bg-blue-600">
                    Deposit
                  </button>
                  <button onClick={() => setDepositVault(null)} className="text-xs text-gray-500 hover:text-gray-300">
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setDepositVault(vault.id)}
                  className="bg-accent/10 text-accent text-xs font-semibold px-4 py-1.5 rounded hover:bg-accent/20"
                >
                  Deposit
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
