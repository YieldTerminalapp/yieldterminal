use anchor_lang::prelude::*;
use crate::state::*;

#[derive(Accounts)]
pub struct CreateVault<'info> {
    pub creator: Signer<'info>,
}

pub fn handler(_ctx: Context<CreateVault>, _name: String, _strategy_type: StrategyType, _blocks: Vec<StrategyBlock>) -> Result<()> {
    // TODO: create vault PDA, set strategy blocks, increment config counter
    Ok(())
}
