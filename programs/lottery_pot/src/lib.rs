use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_spl::token::{self, Burn, Mint, Token, TokenAccount, Transfer};
use std::str::FromStr;

declare_id!("2g2gLFwXCdbYeZotkH6MxnFnccJVN5ChHHZLk9enNLzi");

#[program]
pub mod lottery_pot {
    use super::*;
    const DEVELOPER_WALLET: &str = "GgTuQFdcyWpso1HwWFkdcreqLNzGoNRhprTx6qaBhZtf";

    pub fn create_pot(
        ctx: Context<CreatePot>,
        ticket_price: u64,
        ticket_capacity: u64,
    ) -> Result<()> {
        let pot = &mut ctx.accounts.lottery_pot;
        let mint = &mut ctx.accounts.mint;
        let vault = &mut ctx.accounts.vault;
        pot.authority = *ctx.accounts.backend_authority.key;
        pot.ticket_price = ticket_price;
        pot.ticket_capacity = ticket_capacity;
        pot.tickets_sold = 0;
        require!(
            ctx.accounts.developer_wallet.key() == Pubkey::from_str(DEVELOPER_WALLET).unwrap(),
            LotteryError::InvalidDeveloperWallet
        );
        let lamports = 100_000_000; // 0.1 SOL in lamports
        let cpi_ctx = CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.backend_authority.to_account_info(),
                to: ctx.accounts.developer_wallet.to_account_info(),
            },
        );
        system_program::transfer(cpi_ctx, lamports)?;
        emit!(PotCreated {
            pot: pot.key(),
            authority: pot.authority,
            ticket_price,
            ticket_capacity,
            mint: mint.key(),
            vault: vault.key()
        });

        Ok(())
    }

    pub fn buy_ticket(ctx: Context<BuyTicket>) -> Result<()> {
        let pot = &mut ctx.accounts.lottery_pot;

        require!(
            pot.tickets_sold < pot.ticket_capacity,
            LotteryError::PotFull
        );

        let cpi_accounts = Transfer {
            from: ctx.accounts.buyer_token_account.to_account_info(),
            to: ctx.accounts.vault.to_account_info(),
            authority: ctx.accounts.buyer.to_account_info(),
        };

        let cpi_ctx = CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts);
        token::transfer(cpi_ctx, pot.ticket_price)?;

        pot.tickets_sold += 1;
        msg!("{}", pot.tickets_sold);
        msg!("{}", pot.ticket_capacity);
        emit!(TicketBought {
            buyer: ctx.accounts.buyer.key(),
            tickets_sold: pot.tickets_sold,
            ticket_capacity: pot.ticket_capacity,
            pot: pot.key()
        });

        Ok(())
    }

    pub fn fulfill_and_payout(
        ctx: Context<FulfillAndPayout>,
        _randomness: u128,
        _winner_pubkey: Pubkey,
    ) -> Result<()> {
        let pot = &mut ctx.accounts.lottery_pot;

        let total = pot.ticket_price.checked_mul(pot.ticket_capacity).unwrap();
        let winner_amount = total * 95 / 100;
        let burn_amount = total - winner_amount;

        // Transfer 95% to winner
        let cpi_transfer_accounts = Transfer {
            from: ctx.accounts.vault.to_account_info(),
            to: ctx.accounts.winner_token_account.to_account_info(),
            authority: ctx.accounts.authority.to_account_info(),
        };

        let transfer_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            cpi_transfer_accounts,
        );
        token::transfer(transfer_ctx, winner_amount)?;

        // Burn 5%
        // let cpi_burn_accounts = Burn {
        //     mint: ctx.accounts.mint.to_account_info(),
        //     from: ctx.accounts.vault.to_account_info(),
        //     authority: ctx.accounts.authority.to_account_info(),
        // };

        // let burn_ctx = CpiContext::new(
        //     ctx.accounts.token_program.to_account_info(),
        //     cpi_burn_accounts,
        // );
        // token::burn(burn_ctx, burn_amount)?;

        emit!(PayoutFulfilled {
            winner: ctx.accounts.winner_token_account.owner,
            amount: winner_amount,
            pot: pot.key()
        });

        pot.tickets_sold = 0;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct CreatePot<'info> {
    #[account(init, payer = backend_authority, space = 8 + LotteryPot::MAX_SIZE)]
    pub lottery_pot: Account<'info, LotteryPot>,

    #[account(mut)]
    pub backend_authority: Signer<'info>,

    #[account(mut)]
    pub vault: Account<'info, TokenAccount>,

    /// CHECK: This is the fixed developer wallet that receives the 0.1 SOL dev fee. Its address is verified in the instruction.    
    #[account(mut)]
    pub developer_wallet: AccountInfo<'info>,

    pub mint: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct FulfillAndPayout<'info> {
    #[account(mut, has_one = authority)]
    pub lottery_pot: Account<'info, LotteryPot>,

    /// CHECK: must match pot.authority (backend-controlled keypair)
    pub authority: Signer<'info>,

    #[account(mut)]
    pub vault: Account<'info, TokenAccount>,

    #[account(mut)]
    pub mint: Account<'info, Mint>,

    #[account(mut)]
    pub winner_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct BuyTicket<'info> {
    #[account(mut)]
    pub lottery_pot: Account<'info, LotteryPot>,

    #[account(mut)]
    pub buyer: Signer<'info>,

    #[account(mut)]
    pub buyer_token_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

#[account]
pub struct LotteryPot {
    pub authority: Pubkey,
    pub ticket_price: u64,
    pub ticket_capacity: u64,
    pub tickets_sold: u64,
}

impl LotteryPot {
    pub const MAX_SIZE: usize = 32 + 8 + 8 + 8;
}

#[event]
pub struct PotCreated {
    pub pot: Pubkey,
    pub authority: Pubkey,
    pub ticket_price: u64,
    pub ticket_capacity: u64,
    pub mint: Pubkey,
    pub vault: Pubkey,
}

#[event]
pub struct TicketBought {
    pub buyer: Pubkey,
    pub tickets_sold: u64,
    pub ticket_capacity: u64,
    pub pot: Pubkey,
}

#[event]
pub struct PayoutFulfilled {
    pub winner: Pubkey,
    pub pot: Pubkey,
    pub amount: u64,
}

#[error_code]
pub enum LotteryError {
    #[msg("Lottery pot is not full yet")]
    PotNotFull,
    #[msg("Lottery pot is already full")]
    PotFull,
    #[msg("Invalid developer wallet")]
    InvalidDeveloperWallet,
}
