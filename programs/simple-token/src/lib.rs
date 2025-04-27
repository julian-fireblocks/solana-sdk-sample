use anchor_lang::prelude::*;

declare_id!("GxmyTejTzDhDH7E3dT29reeNMetmkTQsaJYFswMyZE39");

#[program]
pub mod simple_token {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        ctx.accounts.mint.amount = 0;
        Ok(())
    }

    pub fn mint(ctx: Context<Mint>, amount: u64) -> Result<()> {
        ctx.accounts.mint.amount += amount;
        Ok(())
    }

    pub fn burn(ctx: Context<Burn>, amount: u64) -> Result<()> {
        require!(ctx.accounts.mint.amount >= amount, ErrorCode::InsufficientFunds);
        ctx.accounts.mint.amount -= amount;
        Ok(())
    }

    pub fn transfer(ctx: Context<Transfer>, amount: u64) -> Result<()> {
        require!(ctx.accounts.from.amount >= amount, ErrorCode::InsufficientFunds);
        ctx.accounts.from.amount -= amount;
        ctx.accounts.to.amount += amount;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(init, payer = user, space = 8 + 8)]
    pub mint: Account<'info, TokenAccount>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Mint<'info> {
    #[account(mut)]
    pub mint: Account<'info, TokenAccount>,
}

#[derive(Accounts)]
pub struct Burn<'info> {
    #[account(mut)]
    pub mint: Account<'info, TokenAccount>,
}

#[derive(Accounts)]
pub struct Transfer<'info> {
    #[account(mut)]
    pub from: Account<'info, TokenAccount>,
    #[account(mut)]
    pub to: Account<'info, TokenAccount>,
}

#[account]
pub struct TokenAccount {
    pub amount: u64,
}

#[error_code]
pub enum ErrorCode {
    #[msg("Insufficient funds.")]
    InsufficientFunds,
}