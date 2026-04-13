use anchor_lang::prelude::*;
use crate::state::YieldConfig;

#[derive(Accounts)]
pub struct InitializeConfig<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + YieldConfig::INIT_SPACE,
        seeds = [b"yield_config"],
        bump,
    )]
    pub config: Account<'info, YieldConfig>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<InitializeConfig>, performance_fee_bps: u16) -> Result<()> {
    let config = &mut ctx.accounts.config;
    config.authority = ctx.accounts.authority.key();
    config.treasury = ctx.accounts.authority.key();
    config.performance_fee_bps = performance_fee_bps;
    config.total_vaults = 0;
    config.bump = ctx.bumps.config;
    Ok(())
}
