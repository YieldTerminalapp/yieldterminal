// strategy block catalog + PDA helpers. matches programs/yieldterminal state enums.
import { PublicKey, SystemProgram } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';

export interface BlockType {
  label: string;
  action: 'stake' | 'lpProvide' | 'sellCall' | 'sellPut' | 'lend' | 'hedge';
  protocol: 'marinade' | 'kamino' | 'drift' | 'jupiter';
  color: string;
}

// Drift had the Apr 1 exploit; keep listed for strategy diversity — vault is stateful only.
export const BLOCKS: BlockType[] = [
  { label: 'Stake',        action: 'stake',     protocol: 'marinade', color: '#22c55e' },
  { label: 'LP Provide',   action: 'lpProvide', protocol: 'kamino',   color: '#a855f7' },
  { label: 'Covered Call', action: 'sellCall',  protocol: 'drift',    color: '#f59e0b' },
  { label: 'Lend',         action: 'lend',      protocol: 'kamino',   color: '#06b6d4' },
  { label: 'Hedge',        action: 'hedge',     protocol: 'drift',    color: '#ef4444' },
];

export type StrategyKind = 'coveredCall' | 'deltaNeutral' | 'yieldFarm';

export const STRATEGY_KINDS: { key: StrategyKind; label: string }[] = [
  { key: 'coveredCall',  label: 'Covered Call' },
  { key: 'deltaNeutral', label: 'Delta Neutral' },
  { key: 'yieldFarm',    label: 'Yield Farm' },
];

// Distribute 100 across n blocks; residual (0..n-1) goes into last block to hit exactly 100.
export function splitAllocation(n: number): number[] {
  if (n <= 0) return [];
  const base = Math.floor(100 / n);
  const out = Array(n).fill(base);
  out[n - 1] = 100 - base * (n - 1);
  return out;
}

export function configPda(programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from('yield_config')], programId)[0];
}

export function vaultPda(programId: PublicKey, creator: PublicKey, vaultId: BN): PublicKey {
  const idBuf = vaultId.toArrayLike(Buffer, 'le', 8);
  return PublicKey.findProgramAddressSync(
    [Buffer.from('vault'), creator.toBuffer(), idBuf],
    programId,
  )[0];
}

export function depositPda(programId: PublicKey, vault: PublicKey, user: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('deposit'), vault.toBuffer(), user.toBuffer()],
    programId,
  )[0];
}

export const SYSTEM_PROGRAM = SystemProgram.programId;

// anchor camelCase enum variant → {variant: {}} rust-side ser repr
export const asEnum = <T extends string>(v: T) => ({ [v]: {} });
