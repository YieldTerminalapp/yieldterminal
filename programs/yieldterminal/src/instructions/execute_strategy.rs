use anchor_lang::prelude::*;
use crate::state::*;
use crate::errors::YieldError;
use crate::events::StrategyExecuted;

// Authority-gated crank — bumps vault.performance_bps by delta_bps, accrues earnings net of fee.
#[derive(Accounts)]
pub struct ExecuteStrategy<'info> {
    #[account(
        seeds = [b"yield_config"],
        bump = config.bump,
        has_one = authority @ YieldError::Unauthorized,
    )]
    pub config: Account<'info, YieldConfig>,
    #[account(
        mut,
        seeds = [b"vault", vault.creator.as_ref(), &vault.vault_id.to_le_bytes()],
        bump = vault.bump,
    )]
    pub vault: Account<'info, YieldVault>,
    pub authority: Signer<'info>,
}

pub fn handler(ctx: Context<ExecuteStrategy>, delta_bps: i16) -> Result<()> {
    require!(delta_bps.abs() <= 2000, YieldError::InvalidAmount);

    let vault = &mut ctx.accounts.vault;
    let config = &ctx.accounts.config;

    // accrue earnings into total_deposits (positive delta only, fee-deducted)
    if delta_bps > 0 && vault.total_deposits > 0 {
        let gross = (vault.total_deposits as u128)
            .checked_mul(delta_bps as u128)
            .ok_or(YieldError::MathOverflow)?
            .checked_div(10_000)
            .ok_or(YieldError::MathOverflow)? as u64;
        let fee = (gross as u128)
            .checked_mul(config.performance_fee_bps as u128)
            .ok_or(YieldError::MathOverflow)?
            .checked_div(10_000)
            .ok_or(YieldError::MathOverflow)? as u64;
        let net = gross.checked_sub(fee).ok_or(YieldError::MathOverflow)?;
        vault.total_deposits = vault.total_deposits.checked_add(net).ok_or(YieldError::MathOverflow)?;

        vault.performance_bps = vault.performance_bps.saturating_add(delta_bps);

        emit!(StrategyExecuted {
            vault: vault.key(),
            delta_bps,
            new_performance_bps: vault.performance_bps,
            earnings: net,
            ts: Clock::get()?.unix_timestamp,
        });
    } else {
        // negative delta: shrink performance_bps only (no lamport burn — Tier 3 simplification)
        vault.performance_bps = vault.performance_bps.saturating_add(delta_bps);
        emit!(StrategyExecuted {
            vault: vault.key(),
            delta_bps,
            new_performance_bps: vault.performance_bps,
            earnings: 0,
            ts: Clock::get()?.unix_timestamp,
        });
    }

    Ok(())
}
