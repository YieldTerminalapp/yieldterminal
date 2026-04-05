import { useState, useEffect } from 'react';
import { useConnection, useAnchorWallet } from '@solana/wallet-adapter-react';
import { AnchorProvider, Program } from '@coral-xyz/anchor';
import { Keypair } from '@solana/web3.js';
import idl from '../idl.json';

export function useVaultProgram() {
  const { connection } = useConnection();
  const anchorWallet = useAnchorWallet();
  const [vault, setVault] = useState<{ program: Program; signed: boolean } | null>(null);

  useEffect(() => {
    const w = anchorWallet ?? {
      publicKey: Keypair.generate().publicKey,
      signTransaction: async (tx: any) => tx,
      signAllTransactions: async (txs: any) => txs,
    };
    const prov = new AnchorProvider(connection, w as any, { commitment: 'confirmed' });
    setVault({ program: new Program(idl as any, prov), signed: !!anchorWallet });
  }, [connection, anchorWallet]);

  return vault;
}
