use anchor_lang::prelude::*;

// DeFi terms — vault shares, strategy blocks, performance fees
#[account]
#[derive(InitSpace)]
pub struct YieldConfig {
    pub authority: Pubkey,
    pub treasury: Pubkey,
    pub performance_fee_bps: u16,
    pub total_vaults: u64,
    pub bump: u8,
}
