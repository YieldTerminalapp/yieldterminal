use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct Deposit<'info> {
    pub user: Signer<'info>,
}

pub fn handler(_ctx: Context<Deposit>, _amount: u64) -> Result<()> {
    // TODO: calculate shares, transfer SOL/tokens to vault, mint shares
    Ok(())
}
