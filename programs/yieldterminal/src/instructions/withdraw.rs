use anchor_lang::prelude::*;
use crate::state::*;
use crate::errors::YieldError;
use crate::events::Withdrawn;

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(
        mut,
        seeds = [b"vault", vault.creator.as_ref(), &vault.vault_id.to_le_bytes()],
        bump = vault.bump,
    )]
    pub vault: Account<'info, YieldVault>,
    #[account(
        mut,
        seeds = [b"deposit", vault.key().as_ref(), user.key().as_ref()],
        bump = user_deposit.bump,
        constraint = user_deposit.user == user.key() @ YieldError::Unauthorized,
        constraint = user_deposit.vault == vault.key() @ YieldError::Unauthorized,
    )]
    pub user_deposit: Account<'info, VaultDeposit>,
    #[account(mut)]
    pub user: Signer<'info>,
}

pub fn handler(ctx: Context<Withdraw>, shares: u64) -> Result<()> {
    require!(shares > 0, YieldError::InsufficientShares);

    let deposit = &ctx.accounts.user_deposit;
    let vault = &ctx.accounts.vault;

    require!(deposit.shares >= shares, YieldError::InsufficientShares);
    require!(vault.total_shares > 0, YieldError::MathOverflow);

    // calculate payout proportional to shares
    let payout = shares
        .checked_mul(vault.total_deposits)
        .ok_or(YieldError::MathOverflow)?
        .checked_div(vault.total_shares)
        .ok_or(YieldError::MathOverflow)?;

    require!(payout > 0, YieldError::InvalidAmount);

    // update vault state
    let vault = &mut ctx.accounts.vault;
    vault.total_deposits = vault.total_deposits
        .checked_sub(payout)
        .ok_or(YieldError::MathOverflow)?;
    vault.total_shares = vault.total_shares
        .checked_sub(shares)
        .ok_or(YieldError::MathOverflow)?;

    // update user deposit
    let deposit = &mut ctx.accounts.user_deposit;
    deposit.shares = deposit.shares
        .checked_sub(shares)
        .ok_or(YieldError::MathOverflow)?;

    // transfer lamports from vault to user
    let vault_info = ctx.accounts.vault.to_account_info();
    let user_info = ctx.accounts.user.to_account_info();
    **vault_info.try_borrow_mut_lamports()? = vault_info
        .lamports()
        .checked_sub(payout)
        .ok_or(YieldError::MathOverflow)?;
    **user_info.try_borrow_mut_lamports()? = user_info
        .lamports()
        .checked_add(payout)
        .ok_or(YieldError::MathOverflow)?;

    msg!("withdrew {} for {} shares", payout, shares);

    emit!(Withdrawn {
        vault: ctx.accounts.vault.key(),
        user: ctx.accounts.user.key(),
        payout,
        shares,
        total_deposits: ctx.accounts.vault.total_deposits,
        ts: Clock::get()?.unix_timestamp,
    });

    Ok(())
}
