import { Buffer } from 'buffer';
// Solana web3.js + Anchor rely on Node's Buffer. Browsers don't ship it.
(globalThis as any).Buffer = Buffer;

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { SolanaProviders } from './WalletProvider';
import VaultGuard from './components/VaultGuard';
import App from './App';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <VaultGuard>
      <BrowserRouter>
        <SolanaProviders>
          <App />
        </SolanaProviders>
      </BrowserRouter>
    </VaultGuard>
  </StrictMode>
);
