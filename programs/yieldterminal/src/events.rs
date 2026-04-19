use anchor_lang::prelude::*;

#[event]
pub struct VaultCreated {
    pub vault: Pubkey,
    pub creator: Pubkey,
    pub vault_id: u64,
    pub blocks: u8,
    pub ts: i64,
}

#[event]
pub struct Deposited {
    pub vault: Pubkey,
    pub user: Pubkey,
    pub amount: u64,
    pub shares: u64,
    pub total_deposits: u64,
    pub ts: i64,
}

#[event]
pub struct Withdrawn {
    pub vault: Pubkey,
    pub user: Pubkey,
    pub payout: u64,
    pub shares: u64,
    pub total_deposits: u64,
    pub ts: i64,
}

#[event]
pub struct StrategyExecuted {
    pub vault: Pubkey,
    pub delta_bps: i16,
    pub new_performance_bps: i16,
    pub earnings: u64,
    pub ts: i64,
}

#[event]
pub struct VaultClosed {
    pub vault: Pubkey,
    pub creator: Pubkey,
    pub ts: i64,
}

#[event]
pub struct SharesTransferred {
    pub vault: Pubkey,
    pub from: Pubkey,
    pub to: Pubkey,
    pub shares: u64,
    pub ts: i64,
}
