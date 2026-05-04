use anchor_lang::prelude::*;
use anchor_lang::system_program;
use crate::state::*;
use crate::errors::YieldError;
use crate::events::Deposited;

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(
        mut,
        seeds = [b"vault", vault.creator.as_ref(), &vault.vault_id.to_le_bytes()],
        bump = vault.bump,
    )]
    pub vault: Account<'info, YieldVault>,
    #[account(
        init_if_needed,
        payer = user,
        space = 8 + VaultDeposit::INIT_SPACE,
        seeds = [b"deposit", vault.key().as_ref(), user.key().as_ref()],
        bump,
    )]
    pub user_deposit: Account<'info, VaultDeposit>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<Deposit>, amount: u64) -> Result<()> {
    require!(amount > 0, YieldError::InvalidAmount);

    let clock = Clock::get()?;
    let vault = &mut ctx.accounts.vault;

    // capacity check including new deposit
    require!(
        vault.total_deposits.checked_add(amount).ok_or(YieldError::MathOverflow)? <= vault.max_capacity,
        YieldError::VaultFull
    );

    // share calculation: first deposit 1:1, later proportional
    let shares = if vault.total_shares == 0 || vault.total_deposits == 0 {
        amount
    } else {
        amount
            .checked_mul(vault.total_shares)
            .ok_or(YieldError::MathOverflow)?
            .checked_div(vault.total_deposits)
            .ok_or(YieldError::MathOverflow)?
    };

    require!(shares > 0, YieldError::MathOverflow);

    vault.total_deposits = vault.total_deposits
        .checked_add(amount)
        .ok_or(YieldError::MathOverflow)?;
    vault.total_shares = vault.total_shares
        .checked_add(shares)
        .ok_or(YieldError::MathOverflow)?;

    let deposit = &mut ctx.accounts.user_deposit;
    // Only set user/vault on first deposit (init path)
    if deposit.deposited_at == 0 {
        deposit.user = ctx.accounts.user.key();
        deposit.vault = ctx.accounts.vault.key();
        deposit.shares = shares;
        deposit.deposited_amount = amount;
    } else {
        // top-up path
        deposit.shares = deposit.shares
            .checked_add(shares)
            .ok_or(YieldError::MathOverflow)?;
        deposit.deposited_amount = deposit.deposited_amount
            .checked_add(amount)
            .ok_or(YieldError::MathOverflow)?;
    }
    deposit.deposited_at = clock.unix_timestamp;
    deposit.bump = ctx.bumps.user_deposit;

    // transfer SOL from user to vault
    system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.key(),
            system_program::Transfer {
                from: ctx.accounts.user.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
            },
        ),
        amount,
    )?;

    emit!(Deposited {
        vault: ctx.accounts.vault.key(),
        user: ctx.accounts.user.key(),
        amount,
        shares,
        total_deposits: ctx.accounts.vault.total_deposits,
        ts: clock.unix_timestamp,
    });

    Ok(())
}
