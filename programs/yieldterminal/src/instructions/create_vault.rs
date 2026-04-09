use anchor_lang::prelude::*;
use crate::state::*;
use crate::errors::YieldError;
use crate::events::VaultCreated;

#[derive(Accounts)]
pub struct CreateVault<'info> {
    #[account(
        mut,
        seeds = [b"yield_config"],
        bump = config.bump,
    )]
    pub config: Account<'info, YieldConfig>,
    #[account(
        init,
        payer = creator,
        space = 8 + YieldVault::INIT_SPACE,
        seeds = [b"vault", creator.key().as_ref(), &config.total_vaults.to_le_bytes()],
        bump,
    )]
    pub vault: Account<'info, YieldVault>,
    #[account(mut)]
    pub creator: Signer<'info>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<CreateVault>, name: String, strategy_type: StrategyType, blocks: Vec<StrategyBlock>) -> Result<()> {
    require!(!name.is_empty() && name.len() <= 32, YieldError::InvalidAmount);
    require!(!blocks.is_empty() && blocks.len() <= 5, YieldError::InvalidAllocation);

    // allocation percentages must sum to exactly 100
    let total_alloc: u16 = blocks.iter()
        .map(|b| b.allocation_pct as u16)
        .sum();
    require!(total_alloc == 100, YieldError::InvalidAllocation);

    let clock = Clock::get()?;
    let vault = &mut ctx.accounts.vault;
    vault.creator = ctx.accounts.creator.key();
    vault.vault_id = ctx.accounts.config.total_vaults;
    vault.name = name;
    vault.strategy_type = strategy_type;
    vault.risk_level = 1;
    vault.total_deposits = 0;
    vault.total_shares = 0;
    vault.performance_bps = 0;
    vault.is_public = true;
    vault.max_capacity = u64::MAX;
    vault.strategy_blocks = blocks;
    vault.created_at = clock.unix_timestamp;
    vault.bump = ctx.bumps.vault;

    let config = &mut ctx.accounts.config;
    config.total_vaults = config.total_vaults
        .checked_add(1)
        .ok_or(YieldError::MathOverflow)?;

    msg!("vault #{} created", vault.vault_id);

    emit!(VaultCreated {
        vault: vault.key(),
        creator: vault.creator,
        vault_id: vault.vault_id,
        blocks: vault.strategy_blocks.len() as u8,
        ts: clock.unix_timestamp,
    });

    Ok(())
}
