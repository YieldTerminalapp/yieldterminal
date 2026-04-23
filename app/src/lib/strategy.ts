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

export const STRATEGY_KINDS: { key: StrategyKind; label: string; tooltip: string }[] = [
  {
    key: 'coveredCall',
    label: 'Covered Call',
    tooltip:
      'Hold the underlying, sell weekly out-of-the-money calls. Adds a flat option-premium yield (~3-7% APY overlay) at the cost of capping upside above strike.',
  },
  {
    key: 'deltaNeutral',
    label: 'Delta Neutral',
    tooltip:
      'Long collateral hedged with a perp short. Vol damper of ~0.55× — flatter equity curve, smaller drawdowns, lower APY ceiling. Funding costs net into yield.',
  },
  {
    key: 'yieldFarm',
    label: 'Yield Farm',
    tooltip:
      'Stake / LP across protocols, no hedging. Vol amplifier ~1.15× — fattest mean APY, also the most exposed to drawdowns and IL.',
  },
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
