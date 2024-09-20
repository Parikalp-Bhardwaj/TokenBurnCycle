use anchor_lang::prelude::*;
use anchor_spl::token::{self, TokenAccount, Transfer, Burn, Token, Mint};

declare_id!("FRfRQnN3bouip1RV8Th6fmNzTomUv7ewXkUW4BWQagwr");

#[program]
pub mod token_lock {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, initial_market_cap: u64, quantum: u64) -> Result<()> {
        let global_state = &mut ctx.accounts.global_state;
        global_state.current_cap = initial_market_cap;
        global_state.next_burn_cap = initial_market_cap + quantum;
        global_state.quantum = quantum;
        Ok(())
    }

    pub fn lock_tokens(ctx: Context<LockTokens>, amount: u64) -> Result<()> {
        let user_account = &mut ctx.accounts.user_account;
        let global_state = &mut ctx.accounts.global_state;
    
        let max_lockable_amount = ctx.accounts.user_token_account.amount
            .checked_mul(30)
            .unwrap()
            .checked_div(100)
            .unwrap();
    
        require!(amount <= max_lockable_amount, ErrorCode::InvalidLockAmount);
    
        require!(
            user_account.last_lock_cap < global_state.current_cap,
            ErrorCode::AlreadyLockedInCurrentSlab
        );
    
        user_account.locked_amount = amount;
        user_account.last_lock_cap = global_state.current_cap;
    
        let cpi_accounts = Transfer {
            from: ctx.accounts.user_token_account.to_account_info(),
            to: ctx.accounts.vault_token_account.to_account_info(),
            authority: ctx.accounts.user.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
    
        token::transfer(cpi_ctx, amount)?;
    
        emit!(TokensLocked {
            user: ctx.accounts.user.key(),
            amount,
            lock_cap: global_state.current_cap,
        });
    
        Ok(())
    }
    
    
    

    pub fn burn_tokens(ctx: Context<BurnTokens>, vault_authority_bump: u8) -> Result<()> {
        let global_state = &mut ctx.accounts.global_state;
    
        require!(
            global_state.current_cap >= global_state.next_burn_cap,
            ErrorCode::BurnCycleNotReached
        );
    
        let burn_amount = std::cmp::min(450 * 10_u64.pow(9), ctx.accounts.vault_token_account.amount);  // Burn 450 tokens or less if not available
    
        let seeds = &[b"vault-authority".as_ref(), &[vault_authority_bump]];
        let signer = &[&seeds[..]];
    
        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Burn {
                mint: ctx.accounts.token_mint.to_account_info(),
                from: ctx.accounts.vault_token_account.to_account_info(),
                authority: ctx.accounts.vault_authority.to_account_info(),
            },
            signer
        );
    
        token::burn(cpi_ctx, burn_amount)?;
    
        global_state.next_burn_cap += global_state.quantum;
    
        emit!(TokensBurned {
            amount: burn_amount,
            burn_cap: global_state.current_cap,
        });
    
        Ok(())
    }
    
    

    pub fn update_cap(ctx: Context<UpdateCap>, new_cap: u64) -> Result<()> {
        let global_state = &mut ctx.accounts.global_state;
        global_state.current_cap = new_cap;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(init, payer = admin, space = 8 + 64)]
    pub global_state: Account<'info, GlobalState>,
    #[account(mut)]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct LockTokens<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(
        init_if_needed,
        seeds = [b"user-account", user.key().as_ref()],
        bump,
        payer = user,
        space = 8 + 80
    )]
    pub user_account: Account<'info, UserAccount>,
    #[account(mut)]
    pub user_token_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub vault_token_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
    #[account(mut)]
    pub global_state: Account<'info, GlobalState>,
}

#[derive(Accounts)]
pub struct BurnTokens<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(mut)]
    pub vault_token_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub token_mint: Account<'info, Mint>,
    /// CHECK: 
    #[account(mut, seeds = [b"vault-authority"], bump)]
    pub vault_authority: AccountInfo<'info>,
    pub token_program: Program<'info, Token>,
    #[account(mut)]
    pub global_state: Account<'info, GlobalState>,
}


#[derive(Accounts)]
pub struct UpdateCap<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(mut)]
    pub global_state: Account<'info, GlobalState>,
}

#[account]
pub struct UserAccount {
    pub locked_amount: u64,
    pub unlock_time: i64,
    pub last_lock_cap: u64,
}

#[account]
pub struct GlobalState {
    pub current_cap: u64,
    pub next_burn_cap: u64,
    pub quantum: u64,
}

#[error_code]
pub enum ErrorCode {
    #[msg("Tokens are still locked.")]
    TokensLocked,
    #[msg("Invalid lock amount.")]
    InvalidLockAmount,
    #[msg("User has already locked tokens in the current quantum cap slab.")]
    AlreadyLockedInCurrentSlab,
    #[msg("Burn cycle not reached.")]
    BurnCycleNotReached,
}

#[event]
pub struct TokensLocked {
    pub user: Pubkey,
    pub amount: u64,
    pub lock_cap: u64,
}

#[event]
pub struct TokensBurned {
    pub amount: u64,
    pub burn_cap: u64,
}
