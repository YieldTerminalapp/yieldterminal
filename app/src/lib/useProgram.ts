import { useMemo } from 'react';
import { useConnection, useAnchorWallet } from '@solana/wallet-adapter-react';
import { AnchorProvider, Program } from '@coral-xyz/anchor';
import { Keypair } from '@solana/web3.js';
import idl from '../idl.json';

export function useProgram() {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();

  const provider = useMemo(() => {
    if (!wallet) return null;
    return new AnchorProvider(connection, wallet, { commitment: 'confirmed' });
  }, [connection, wallet]);

  const program = useMemo(() => {
    if (!provider) return null;
    return new Program(idl as any, provider);
  }, [provider]);

  return { program, provider, connection };
}

export function useReadonlyProgram() {
  const { connection } = useConnection();

  const program = useMemo(() => {
    const kp = Keypair.generate();
    const w = { publicKey: kp.publicKey, signTransaction: async (tx: any) => tx, signAllTransactions: async (txs: any) => txs };
    const p = new AnchorProvider(connection, w as any, { commitment: 'confirmed' });
    return new Program(idl as any, p);
  }, [connection]);

  return { program, connection };
}
