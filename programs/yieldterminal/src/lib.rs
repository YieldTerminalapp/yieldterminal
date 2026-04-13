use anchor_lang::prelude::*;

pub mod errors;
pub mod instructions;
pub mod state;
// no constants module — all values inline

use instructions::*;
use state::{StrategyType, StrategyBlock};

declare_id!("313NKsMsgiA8uLp6y2dnfP1QzCQmZu9xkaaHSkMW6VL5");

#[program]
pub mod yieldterminal {
    use super::*;

    pub fn initialize_config(ctx: Context<InitializeConfig>, performance_fee_bps: u16) -> Result<()> {
        super::instructions::initialize_config::handler(ctx, performance_fee_bps)
    }

    pub fn create_vault(ctx: Context<CreateVault>, name: String, strategy_type: StrategyType, blocks: Vec<StrategyBlock>) -> Result<()> {
        super::instructions::create_vault::handler(ctx, name, strategy_type, blocks)
    }

    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        super::instructions::deposit::handler(ctx, amount)
    }

    pub fn withdraw(ctx: Context<Withdraw>, shares: u64) -> Result<()> {
        super::instructions::withdraw::handler(ctx, shares)
    }
}
