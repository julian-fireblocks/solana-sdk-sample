import { 
    clusterApiUrl, 
    Commitment, 
    ComputeBudgetProgram, 
    PublicKey, 
    sendAndConfirmTransaction, 
    Transaction,
    StakeProgram,
    Authorized,
    Lockup,
    LAMPORTS_PER_SOL,
    Keypair
} from "@solana/web3.js";
import * as FireblocksSDK from "./fireblocks/lib";

require("dotenv").config();

const fireblocksConnectionConfig: FireblocksSDK.FireblocksConnectionAdapterConfig = {
    apiKey: process.env.FIREBLOCKS_API_KEY || "",
    apiSecretPath: process.env.FIREBLOCKS_SECRET_KEY_PATH || "",
    vaultAccountId: process.env.STAKER_VAULT_ACCOUNT_ID || "",
    feeLevel: FireblocksSDK.FeeLevel.HIGH,
    silent: false,
    devnet: true,
};

interface StakeParams {
    amount: number; // in SOL
    validatorVoteAccount: string;
}

async function createStakeAccount(params: StakeParams) {
    console.log("=== Creating Stake Account ===\n");
    
    const validatorVoteAccount = new PublicKey(params.validatorVoteAccount);
    const amountInLamports = params.amount * LAMPORTS_PER_SOL;

    // Create Fireblocks connection
    const connection = await FireblocksSDK.FireblocksConnectionAdapter.create(
        clusterApiUrl("devnet"),
        fireblocksConnectionConfig,
        "confirmed" as Commitment
    );

    const fireblocksAccount = connection.getAccount();
    const fireblocksAccountPubkey = new PublicKey(fireblocksAccount);
    
    console.log("Configuration:");
    console.log(`  Fireblocks Account (Staker): ${fireblocksAccountPubkey.toBase58()}`);
    console.log(`  Validator Vote Account: ${validatorVoteAccount.toBase58()}`);
    console.log(`  Amount: ${params.amount} SOL (${amountInLamports} lamports)\n`);

    try {
        // Generate a new keypair for the stake account
        const stakeAccount = Keypair.generate();
        console.log(`Stake Account: ${stakeAccount.publicKey.toBase58()}\n`);

        // Get minimum balance for rent exemption
        const minRent = await connection.getMinimumBalanceForRentExemption(
            StakeProgram.space
        );
        console.log(`Minimum rent: ${minRent / LAMPORTS_PER_SOL} SOL\n`);

        // Create stake account instruction
        const createAccountIx = StakeProgram.createAccount({
            fromPubkey: fireblocksAccountPubkey,  // Fireblocks account pays for creation
            stakePubkey: stakeAccount.publicKey,   // New stake account address
            authorized: new Authorized(fireblocksAccountPubkey, fireblocksAccountPubkey), // Fireblocks authorizes
            lockup: new Lockup(0, 0, fireblocksAccountPubkey), // No lockup
            lamports: amountInLamports,
        });

        // Delegate stake instruction
        const delegateIx = StakeProgram.delegate({
            stakePubkey: stakeAccount.publicKey,
            authorizedPubkey: fireblocksAccountPubkey,  // Fireblocks authorizes delegation
            votePubkey: validatorVoteAccount,
        });

        // Add compute budget instructions
        const computeBudgetIx = ComputeBudgetProgram.setComputeUnitLimit({
            units: 400000,
        });

        const computePriceIx = ComputeBudgetProgram.setComputeUnitPrice({
            microLamports: 10,
        });

        // Create transaction with all instructions
        const tx = new Transaction().add(
            computeBudgetIx,
            computePriceIx,
            createAccountIx,
            delegateIx
        );

        console.log("Sending stake transaction...\n");

        // Send and confirm transaction (stakeAccount needs to sign as well)
        const signature = await sendAndConfirmTransaction(
            connection,
            tx,
            [stakeAccount] // Stake account must sign
        );

        console.log("✅ Stake account created and delegated successfully!\n");
        console.log("Transaction Details:");
        console.log(`  Signature: ${signature}`);
        console.log(`  Explorer: https://explorer.solana.com/tx/${signature}?cluster=devnet`);
        console.log(`  Stake Account: ${stakeAccount.publicKey.toBase58()}\n`);

        // Fetch and display stake account info
        const stakeAccountInfo = await connection.getStakeActivation(stakeAccount.publicKey);
        console.log("Stake Account Status:");
        console.log(`  State: ${stakeAccountInfo.state}`);
        console.log(`  Active: ${stakeAccountInfo.active / LAMPORTS_PER_SOL} SOL`);
        console.log(`  Inactive: ${stakeAccountInfo.inactive / LAMPORTS_PER_SOL} SOL\n`);

        return {
            signature,
            stakeAccount: stakeAccount.publicKey.toBase58(),
            amount: params.amount,
            validator: validatorVoteAccount.toBase58()
        };

    } catch (error) {
        console.error("❌ Stake transaction failed:", error);
        
        if (error instanceof Error) {
            console.error("Error message:", error.message);
            
            if (error.message.includes("insufficient funds")) {
                console.error("\n💡 Tip: Make sure the staker account has enough SOL for staking and rent.");
            }
        }
        
        throw error;
    }
}

async function deactivateStake(stakeAccountAddress: string) {
    console.log("=== Deactivating Stake ===\n");
    
    const stakeAccountPubkey = new PublicKey(stakeAccountAddress);

    const connection = await FireblocksSDK.FireblocksConnectionAdapter.create(
        clusterApiUrl("devnet"),
        fireblocksConnectionConfig,
        "confirmed" as Commitment
    );

    const fireblocksAccount = connection.getAccount();
    const fireblocksAccountPubkey = new PublicKey(fireblocksAccount);
    
    console.log("Configuration:");
    console.log(`  Fireblocks Account (Authority): ${fireblocksAccountPubkey.toBase58()}`);
    console.log(`  Stake Account: ${stakeAccountPubkey.toBase58()}\n`);

    try {
        // Fetch current stake info
        const stakeActivation = await connection.getStakeActivation(stakeAccountPubkey);
        console.log("Current Stake Status:");
        console.log(`  State: ${stakeActivation.state}`);
        console.log(`  Active: ${stakeActivation.active / LAMPORTS_PER_SOL} SOL`);
        console.log(`  Inactive: ${stakeActivation.inactive / LAMPORTS_PER_SOL} SOL\n`);

        // Deactivate stake instruction
        const deactivateIx = StakeProgram.deactivate({
            stakePubkey: stakeAccountPubkey,
            authorizedPubkey: fireblocksAccountPubkey,
        });

        // Add compute budget instructions
        const computeBudgetIx = ComputeBudgetProgram.setComputeUnitLimit({
            units: 400000,
        });

        const computePriceIx = ComputeBudgetProgram.setComputeUnitPrice({
            microLamports: 10,
        });

        const tx = new Transaction().add(
            computeBudgetIx,
            computePriceIx,
            deactivateIx
        );

        console.log("Sending deactivate transaction...\n");

        const signature = await sendAndConfirmTransaction(
            connection,
            tx,
            []
        );

        console.log("✅ Stake deactivated successfully!\n");
        console.log("Transaction Details:");
        console.log(`  Signature: ${signature}`);
        console.log(`  Explorer: https://explorer.solana.com/tx/${signature}?cluster=devnet`);
        console.log("\n💡 Note: Stake will be fully deactivated after the current epoch ends.\n");

        return {
            signature,
            stakeAccount: stakeAccountPubkey.toBase58()
        };

    } catch (error) {
        console.error("❌ Deactivate transaction failed:", error);
        throw error;
    }
}

async function withdrawStake(stakeAccountAddress: string, amount?: number) {
    console.log("=== Withdrawing Stake ===\n");
    
    const stakeAccountPubkey = new PublicKey(stakeAccountAddress);

    const connection = await FireblocksSDK.FireblocksConnectionAdapter.create(
        clusterApiUrl("devnet"),
        fireblocksConnectionConfig,
        "confirmed" as Commitment
    );

    const fireblocksAccount = connection.getAccount();
    const fireblocksAccountPubkey = new PublicKey(fireblocksAccount);
    
    console.log("Configuration:");
    console.log(`  Fireblocks Account (Withdrawer): ${fireblocksAccountPubkey.toBase58()}`);
    console.log(`  Stake Account: ${stakeAccountPubkey.toBase58()}\n`);

    try {
        // Get stake account balance
        const balance = await connection.getBalance(stakeAccountPubkey);
        const stakeActivation = await connection.getStakeActivation(stakeAccountPubkey);
        
        console.log("Stake Account Info:");
        console.log(`  Balance: ${balance / LAMPORTS_PER_SOL} SOL`);
        console.log(`  State: ${stakeActivation.state}`);
        console.log(`  Active: ${stakeActivation.active / LAMPORTS_PER_SOL} SOL`);
        console.log(`  Inactive: ${stakeActivation.inactive / LAMPORTS_PER_SOL} SOL\n`);

        if (stakeActivation.state !== "inactive") {
            console.error("❌ Cannot withdraw: stake is not fully inactive.");
            console.error("💡 Tip: Deactivate the stake first and wait for the epoch to end.\n");
            return;
        }

        const withdrawAmount = amount ? amount * LAMPORTS_PER_SOL : balance;

        // Withdraw instruction
        const withdrawIx = StakeProgram.withdraw({
            stakePubkey: stakeAccountPubkey,
            authorizedPubkey: fireblocksAccountPubkey,
            toPubkey: fireblocksAccountPubkey,
            lamports: withdrawAmount,
        });

        // Add compute budget instructions
        const computeBudgetIx = ComputeBudgetProgram.setComputeUnitLimit({
            units: 400000,
        });

        const computePriceIx = ComputeBudgetProgram.setComputeUnitPrice({
            microLamports: 10,
        });

        const tx = new Transaction().add(
            computeBudgetIx,
            computePriceIx,
            withdrawIx
        );

        console.log(`Withdrawing ${withdrawAmount / LAMPORTS_PER_SOL} SOL...\n`);

        const signature = await sendAndConfirmTransaction(
            connection,
            tx,
            []
        );

        console.log("✅ Withdrawal successful!\n");
        console.log("Transaction Details:");
        console.log(`  Signature: ${signature}`);
        console.log(`  Explorer: https://explorer.solana.com/tx/${signature}?cluster=devnet\n`);

        return {
            signature,
            amount: withdrawAmount / LAMPORTS_PER_SOL
        };

    } catch (error) {
        console.error("❌ Withdraw transaction failed:", error);
        throw error;
    }
}

// async function getStakeInfo(stakeAccountAddress: string) {
//     console.log("=== Stake Account Information ===\n");
    
//     const stakeAccountPubkey = new PublicKey(stakeAccountAddress);
//     console.log(`Stake Account: ${stakeAccountPubkey.toBase58()}\n`);

//     const connection = await FireblocksSDK.FireblocksConnectionAdapter.create(
//         clusterApiUrl("devnet"),
//         fireblocksConnectionConfig,
//         "confirmed" as Commitment
//     );

//     try {
//         // Get account balance
//         const balance = await connection.getBalance(stakeAccountPubkey);
        
//         // Get stake activation info
//         const stakeActivation = await connection.getStakeActivation(stakeAccountPubkey);
        
//         // Get full account info for detailed stake data
//         const accountInfo = await connection.getAccountInfo(stakeAccountPubkey);
        
//         if (!accountInfo) {
//             console.error("❌ Stake account not found");
//             return;
//         }

//         console.log("Balance:");
//         console.log(`  Total: ${balance / LAMPORTS_PER_SOL} SOL`);
//         console.log();

//         console.log("Stake Status:");
//         console.log(`  State: ${stakeActivation.state}`);
//         console.log(`  Active: ${stakeActivation.active / LAMPORTS_PER_SOL} SOL`);
//         console.log(`  Inactive: ${stakeActivation.inactive / LAMPORTS_PER_SOL} SOL`);
//         console.log();

//         // Parse stake account data to get additional details
//         const stakeAccountData = StakeProgram.decode(accountInfo.data);
        
//         if (stakeAccountData) {
//             console.log("Account Details:");
//             console.log(`  Type: ${stakeAccountData.type}`);
            
//             if ('meta' in stakeAccountData) {
//                 const meta = stakeAccountData.meta;
//                 console.log(`  Rent Exempt Reserve: ${meta.rentExemptReserve / LAMPORTS_PER_SOL} SOL`);
//                 console.log(`  Authorized Staker: ${meta.authorized.staker.toBase58()}`);
//                 console.log(`  Authorized Withdrawer: ${meta.authorized.withdrawer.toBase58()}`);
//                 console.log(`  Lockup Unix Timestamp: ${meta.lockup.unixTimestamp}`);
//                 console.log(`  Lockup Epoch: ${meta.lockup.epoch}`);
//                 console.log(`  Lockup Custodian: ${meta.lockup.custodian.toBase58()}`);
//             }

//             if ('stake' in stakeAccountData && stakeAccountData.stake) {
//                 const stake = stakeAccountData.stake;
//                 console.log();
//                 console.log("Delegation Info:");
//                 console.log(`  Voter: ${stake.delegation.voter.toBase58()}`);
//                 console.log(`  Stake: ${stake.delegation.stake / LAMPORTS_PER_SOL} SOL`);
//                 console.log(`  Activation Epoch: ${stake.delegation.activationEpoch}`);
//                 console.log(`  Deactivation Epoch: ${stake.delegation.deactivationEpoch}`);
//             }
//         }
        
//         console.log();

//         return {
//             address: stakeAccountPubkey.toBase58(),
//             balance: balance / LAMPORTS_PER_SOL,
//             state: stakeActivation.state,
//             active: stakeActivation.active / LAMPORTS_PER_SOL,
//             inactive: stakeActivation.inactive / LAMPORTS_PER_SOL
//         };

//     } catch (error) {
//         console.error("❌ Failed to fetch stake info:", error);
//         throw error;
//     }
// }

async function main() {
    const args = process.argv.slice(2);
    const command = args[0];

    if (!command) {
        console.log("Usage:");
        console.log("  ts-node stake.ts create <amount_in_sol> <validator_pubkey>  - Create and delegate stake");
        console.log("  ts-node stake.ts deactivate <stake_account>                 - Deactivate stake");
        console.log("  ts-node stake.ts withdraw <stake_account> [amount]          - Withdraw stake");
        console.log("  ts-node stake.ts info <stake_account>                       - Get stake info");
        console.log("\nExamples:");
        console.log("  ts-node stake.ts create 1 CertusDeBmqN8ZawdkxK5kFGMwBXdudvWHYwtNgNhvLu");
        console.log("  ts-node stake.ts deactivate 5j2VbJcc138m5RJZTa7uuaVaeDoUihPmog1maxA9xMtF");
        console.log("  ts-node stake.ts withdraw 5j2VbJcc138m5RJZTa7uuaVaeDoUihPmog1maxA9xMtF");
        console.log("  ts-node stake.ts info 5j2VbJcc138m5RJZTa7uuaVaeDoUihPmog1maxA9xMtF");
        return;
    }

    try {
        switch (command) {
            case "create":
                if (args.length < 3) {
                    console.error("❌ Error: Missing arguments");
                    console.log("Usage: ts-node stake.ts create <amount_in_sol> <validator_pubkey>");
                    process.exit(1);
                }
                const amount = parseFloat(args[1]);
                const validatorVoteAccount = args[2];
                
                if (isNaN(amount) || amount <= 0) {
                    console.error("❌ Error: Invalid amount");
                    process.exit(1);
                }
                
                await createStakeAccount({amount, validatorVoteAccount});
                break;

            case "deactivate":
                if (args.length < 2) {
                    console.error("❌ Error: Missing stake account address");
                    console.log("Usage: ts-node stake.ts deactivate <stake_account>");
                    process.exit(1);
                }
                await deactivateStake(args[1]);
                break;

            case "withdraw":
                if (args.length < 2) {
                    console.error("❌ Error: Missing stake account address");
                    console.log("Usage: ts-node stake.ts withdraw <stake_account> [amount]");
                    process.exit(1);
                }
                const withdrawAmount = args[2] ? parseFloat(args[2]) : undefined;
                await withdrawStake(args[1], withdrawAmount);
                break;

            case "info":
                if (args.length < 2) {
                    console.error("❌ Error: Missing stake account address");
                    console.log("Usage: ts-node stake.ts info <stake_account>");
                    process.exit(1);
                }
                // await getStakeInfo(args[1]);
                break;

            default:
                console.error(`❌ Unknown command: ${command}`);
                console.log("\nAvailable commands: create, deactivate, withdraw, info");
                process.exit(1);
        }
    } catch (error) {
        console.error("Error:", error);
        process.exit(1);
    }
}

main().catch(console.error);