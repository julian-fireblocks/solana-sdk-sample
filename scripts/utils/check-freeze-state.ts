import { Commitment, Connection, PublicKey, clusterApiUrl } from "@solana/web3.js";
import { getAccount, TOKEN_2022_PROGRAM_ID, AccountState } from "@solana/spl-token";
import * as FireblocksSDK from "../fireblocks/lib";
import { token } from "@coral-xyz/anchor/dist/cjs/utils";

const fireblocksConnectionConfig: FireblocksSDK.FireblocksConnectionAdapterConfig =
    {
        apiKey: process.env.FIREBLOCKS_API_KEY || "",
        apiSecretPath: process.env.FIREBLOCKS_SECRET_KEY_PATH || "",
        vaultAccountId: process.env.MINTER_VAULT_ACCOUNT_ID || "",
        feeLevel: FireblocksSDK.FeeLevel.HIGH,
        silent: false,
        devnet: true,
    };

async function checkFreezeState(tokenAccountAddress: PublicKey) {
    // Configuration - replace with your actual values

    const connection = await FireblocksSDK.FireblocksConnectionAdapter.create(
        clusterApiUrl("devnet"),
        fireblocksConnectionConfig,
        "confirmed" as Commitment
    );
    
    try {
        console.log("Checking freeze state for account:", tokenAccountAddress.toBase58());
        
        // Fetch the token account information
        const tokenAccount = await getAccount(
            connection,
            tokenAccountAddress,
            "confirmed",
            TOKEN_2022_PROGRAM_ID // Use TOKEN_PROGRAM_ID for original SPL tokens
        );
        
        // Check the account state
        console.log("Account State:", tokenAccount.isFrozen);
        console.log("Account Owner:", tokenAccount.owner.toBase58());
        console.log("Account Mint:", tokenAccount.mint.toBase58());
        console.log("Account Balance:", tokenAccount.amount.toString());
        
        // Determine freeze state
        let freezeStatus: string;
        
        console.log("Freeze Status:", tokenAccount.isFrozen ? "Frozen" : "Unfrozen");
        
        return {
            address: tokenAccountAddress.toBase58(),
            state: tokenAccount.isFrozen,
            freezeStatus: tokenAccount.isFrozen ? "Frozen" : "Unfrozen",
            owner: tokenAccount.owner.toBase58(),
            mint: tokenAccount.mint.toBase58(),
            balance: tokenAccount.amount.toString(),
            isFrozen: tokenAccount.isFrozen
        };
        
    } catch (error) {
        console.error("Error checking freeze state:", error);
        
        // Handle specific error cases
        if (error instanceof Error) {
            if (error.message.includes("could not find account")) {
                console.log("Token account does not exist");
            } else if (error.message.includes("Invalid account owner")) {
                console.log("Account is not a valid token account");
            }
        }
        
        throw error;
    }
}

// Alternative method using raw account data
async function checkFreezeStateRaw(tokenAccountAddress: PublicKey) {

    const connection = await FireblocksSDK.FireblocksConnectionAdapter.create(
        clusterApiUrl("devnet"),
        fireblocksConnectionConfig,
        "confirmed" as Commitment
    );
    
    
    try {
        // Get raw account info
        const accountInfo = await connection.getAccountInfo(tokenAccountAddress, "confirmed");
        
        if (!accountInfo) {
            console.log("Account does not exist");
            return null;
        }
        
        console.log("Raw account data length:", accountInfo.data.length);
        console.log("Account owner:", accountInfo.owner.toBase58());
        
        // For SPL Token accounts, the state is at offset 108 (1 byte)
        // Account layout: mint(32) + owner(32) + amount(8) + delegate_option(36) + state(1) + ...
        if (accountInfo.data.length >= 109) {
            const state = accountInfo.data[108];
            
            let stateDescription: string;
            switch (state) {
                case 0:
                    stateDescription = "Uninitialized";
                    break;
                case 1:
                    stateDescription = "Initialized (Unfrozen)";
                    break;
                case 2:
                    stateDescription = "Frozen";
                    break;
                default:
                    stateDescription = `Unknown (${state})`;
            }
            
            console.log("Account state (raw):", state);
            console.log("State description:", stateDescription);
            
            return {
                exists: true,
                state,
                stateDescription,
                isFrozen: state === 2
            };
        } else {
            console.log("Account data is too short to be a valid token account");
            return null;
        }
        
    } catch (error) {
        console.error("Error checking freeze state (raw):", error);
        throw error;
    }
}

// Main execution
async function main() {
    console.log("=== Checking Token Account Freeze State ===\n");
    const tokenAccountAddress = new PublicKey("2HhdGUfoPiggf4BRRuBaBLeNMiiHv4a3oQWBXA7Gbfqk");

    try {
        // Method 1: Using SPL Token library (recommended)
        console.log("Method 1: Using SPL Token library");
        const result1 = await checkFreezeState(tokenAccountAddress);
        console.log("Result:", result1);
        
        console.log("\n" + "=".repeat(50) + "\n");
        
        // Method 2: Using raw account data
        console.log("Method 2: Using raw account data");
        const result2 = await checkFreezeStateRaw(tokenAccountAddress);
        console.log("Result:", result2);
        
    } catch (error) {
        console.error("Failed to check freeze state:", error);
    }
}

main().catch(console.error);