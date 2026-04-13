use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, InitSpace)]
pub enum StrategyType {
    CoveredCall,
    DeltaNeutral,
    YieldFarm,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, InitSpace)]
pub enum StrategyAction {
    Lend,
    Stake,
    LPProvide,
    SellCall,
    SellPut,
    Hedge,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, InitSpace)]
pub enum Protocol {
    Drift,
    Kamino,
    Jupiter,
    Marinade,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, InitSpace)]
pub struct StrategyBlock {
    pub action: StrategyAction,
    pub protocol: Protocol,
    pub allocation_pct: u8,
}

#[account]
#[derive(InitSpace)]
pub struct YieldVault {
    pub creator: Pubkey,
    pub vault_id: u64,
    #[max_len(32)]
    pub name: String,
    pub strategy_type: StrategyType,
    pub risk_level: u8,
    pub total_deposits: u64,
    pub total_shares: u64,
    pub performance_bps: i16,
    pub is_public: bool,
    pub max_capacity: u64,
    #[max_len(5)]
    pub strategy_blocks: Vec<StrategyBlock>,
    pub created_at: i64,
    pub bump: u8,
}
