use anchor_lang::prelude::*;
use crate::state::*;
use crate::errors::YieldError;
use crate::events::SharesTransferred;

// Move shares between depositor PDAs. `to` can be init_if_needed.
#[derive(Accounts)]
pub struct TransferShares<'info> {
    #[account(
        seeds = [b"vault", vault.creator.as_ref(), &vault.vault_id.to_le_bytes()],
        bump = vault.bump,
    )]
    pub vault: Account<'info, YieldVault>,
    #[account(
        mut,
        seeds = [b"deposit", vault.key().as_ref(), from.key().as_ref()],
        bump = from_deposit.bump,
        constraint = from_deposit.user == from.key() @ YieldError::Unauthorized,
        constraint = from_deposit.vault == vault.key() @ YieldError::Unauthorized,
    )]
    pub from_deposit: Account<'info, VaultDeposit>,
    #[account(
        init_if_needed,
        payer = from,
        space = 8 + VaultDeposit::INIT_SPACE,
        seeds = [b"deposit", vault.key().as_ref(), to_pubkey.key().as_ref()],
        bump,
    )]
    pub to_deposit: Account<'info, VaultDeposit>,
    /// CHECK: recipient pubkey — only used as seed + event data
    pub to_pubkey: UncheckedAccount<'info>,
    #[account(mut)]
    pub from: Signer<'info>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<TransferShares>, shares: u64) -> Result<()> {
    require!(shares > 0, YieldError::InsufficientShares);
    let from_dep = &mut ctx.accounts.from_deposit;
    require!(from_dep.shares >= shares, YieldError::InsufficientShares);

    from_dep.shares = from_dep.shares.checked_sub(shares).ok_or(YieldError::MathOverflow)?;

    let to_dep = &mut ctx.accounts.to_deposit;
    let now = Clock::get()?.unix_timestamp;
    if to_dep.deposited_at == 0 {
        to_dep.user = ctx.accounts.to_pubkey.key();
        to_dep.vault = ctx.accounts.vault.key();
        to_dep.shares = shares;
        to_dep.deposited_amount = 0; // transferred shares have no principal basis
        to_dep.bump = ctx.bumps.to_deposit;
    } else {
        to_dep.shares = to_dep.shares.checked_add(shares).ok_or(YieldError::MathOverflow)?;
    }
    to_dep.deposited_at = now;

    emit!(SharesTransferred {
        vault: ctx.accounts.vault.key(),
        from: ctx.accounts.from.key(),
        to: ctx.accounts.to_pubkey.key(),
        shares,
        ts: now,
    });

    Ok(())
}
