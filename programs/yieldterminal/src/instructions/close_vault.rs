use anchor_lang::prelude::*;
use crate::state::*;
use crate::errors::YieldError;
use crate::events::VaultClosed;

#[derive(Accounts)]
pub struct CloseVault<'info> {
    #[account(
        mut,
        seeds = [b"vault", vault.creator.as_ref(), &vault.vault_id.to_le_bytes()],
        bump = vault.bump,
        close = creator,
        constraint = vault.creator == creator.key() @ YieldError::Unauthorized,
        constraint = vault.total_deposits == 0 @ YieldError::VaultNotEmpty,
        constraint = vault.total_shares == 0 @ YieldError::VaultNotEmpty,
    )]
    pub vault: Account<'info, YieldVault>,
    #[account(mut)]
    pub creator: Signer<'info>,
}

pub fn handler(ctx: Context<CloseVault>) -> Result<()> {
    emit!(VaultClosed {
        vault: ctx.accounts.vault.key(),
        creator: ctx.accounts.creator.key(),
        ts: Clock::get()?.unix_timestamp,
    });
    Ok(())
}
