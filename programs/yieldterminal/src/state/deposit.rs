use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct VaultDeposit {
    pub user: Pubkey,
    pub vault: Pubkey,
    pub shares: u64,
    pub deposited_amount: u64,
    pub deposited_at: i64,
    pub bump: u8,
}
