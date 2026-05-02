/**
 * composition helpers — pure functions that operate on a sequence of
 * strategy blocks plus their per-block weights.
 *
 * a composition's weights must sum to 1.0 (within 0.005 tolerance).
 */

export interface Block {
  id: string
  type: 'liquid_stake' | 'covered_call' | 'delta_neutral' | 'leveraged_stake'
       | 'basis_trade' | 'yield_farming' | 'cash_carry'
  weight: number          // 0..1
  apy?: number            // annual yield, decimal (0.06 = 6%)
  apySource?: 'live' | 'estimate'
}

export interface Composition {
  blocks: Block[]
  label?: string
}

const TOL = 0.005

export function isValid(c: Composition): boolean {
  if (c.blocks.length === 0) return false
  const sum = c.blocks.reduce((a, b) => a + b.weight, 0)
  return Math.abs(sum - 1.0) < TOL
}

export function blendedApy(c: Composition): number {
  return c.blocks.reduce((a, b) => a + b.weight * (b.apy ?? 0), 0)
}

export function dominantBlock(c: Composition): Block | undefined {
  return [...c.blocks].sort((a, b) => b.weight - a.weight)[0]
}

export function riskLabel(c: Composition): 'conservative' | 'balanced' | 'aggressive' | 'speculative' {
  // Heuristic risk score — full impl in /risk endpoint
  const risk = c.blocks.reduce((a, b) => {
    const m = {
      liquid_stake: 0.1,
      cash_carry: 0.15,
      delta_neutral: 0.25,
      basis_trade: 0.30,
      covered_call: 0.40,
      yield_farming: 0.65,
      leveraged_stake: 0.85,
    }
    return a + b.weight * m[b.type]
  }, 0)
  if (risk < 0.30) return 'conservative'
  if (risk < 0.55) return 'balanced'
  if (risk < 0.80) return 'aggressive'
  return 'speculative'
}

export function rebalance(c: Composition): Composition {
  // Scale weights to sum to 1.0
  const sum = c.blocks.reduce((a, b) => a + b.weight, 0)
  if (sum === 0) return c
  return {
    ...c,
    blocks: c.blocks.map((b) => ({ ...b, weight: b.weight / sum })),
  }
}
