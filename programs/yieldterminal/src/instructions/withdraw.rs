use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct Withdraw<'info> {
    pub user: Signer<'info>,
}

pub fn handler(_ctx: Context<Withdraw>, _shares: u64) -> Result<()> {
    // TODO: burn shares, calculate payout, transfer from vault to user
    Ok(())
}
