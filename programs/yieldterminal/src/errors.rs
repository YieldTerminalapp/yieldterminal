use anchor_lang::prelude::*;

#[error_code]
pub enum YieldError {
    #[msg("Vault capacity exceeded")]
    VaultFull,
    #[msg("Insufficient shares for withdrawal")]
    InsufficientShares,
    #[msg("Strategy allocation must sum to 100%")]
    InvalidAllocation,
    #[msg("Unauthorized vault operation")]
    Unauthorized,
    #[msg("Arithmetic overflow in share calculation")]
    MathOverflow,
    #[msg("Vault deposits are paused")]
    VaultPaused,
    #[msg("Invalid amount for operation")]
    InvalidAmount,
    #[msg("Vault still has deposits or shares outstanding")]
    VaultNotEmpty,
    #[msg("Withdrawal would leave vault below rent-exempt minimum")]
    InsufficientBalance,
}
