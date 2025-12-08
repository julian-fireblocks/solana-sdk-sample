import { 
    createThawAccountInstruction,
    createTransferCheckedInstruction,
    createFreezeAccountInstruction,
    TOKEN_2022_PROGRAM_ID 
} from "@solana/spl-token";
import { clusterApiUrl, Commitment, ComputeBudgetProgram, PublicKey, sendAndConfirmTransaction, Transaction } from "@solana/web3.js";
import * as FireblocksSDK from "../fireblocks/lib";

const fireblocksConnectionConfig: FireblocksSDK.FireblocksConnectionAdapterConfig =
    {
        apiKey: process.env.FIREBLOCKS_API_KEY || "",
        apiSecretPath: process.env.FIREBLOCKS_SECRET_KEY_PATH || "",
        vaultAccountId: process.env.MINTER_VAULT_ACCOUNT_ID || "",
        feeLevel: FireblocksSDK.FeeLevel.HIGH,
        silent: false,
        devnet: true,
    };

async function main() {
    // Configurable parameters
    const mint = new PublicKey("5j2VbJcc138m5RJZTa7uuaVaeDoUihPmog1maxA9xMtF"); // Token mint
    const freezeAuthority = new PublicKey("9UmWNnN7fQ58KHtkganDJfHVwA3EkTcWAUgF5CZarsZt"); // Authority account
    const sourceAccount = new PublicKey("SOURCE_TOKEN_ACCOUNT_PUBKEY"); // Replace with actual source token account
    const destinationAccount = new PublicKey("DESTINATION_TOKEN_ACCOUNT_PUBKEY"); // Replace with actual destination token account
    const owner = freezeAuthority; // Assuming the freeze authority is also the owner
    const amount = BigInt(1000000); // Amount to transfer (in smallest units)
    const decimals = 6; // Token decimals

    const connection = await FireblocksSDK.FireblocksConnectionAdapter.create(
        clusterApiUrl("devnet"),
        fireblocksConnectionConfig,
        "confirmed" as Commitment
    );

    // Instruction 1: Thaw the source account
    const thawInstruction = createThawAccountInstruction(
        sourceAccount,       // Token account to thaw
        mint,               // Token mint
        freezeAuthority,    // Freeze authority
        [],                 // Multistore signers (empty for single signer)
        TOKEN_2022_PROGRAM_ID
    );

    // Instruction 2: Transfer tokens from source to destination
    const transferInstruction = createTransferCheckedInstruction(
        sourceAccount,      // Source token account
        mint,              // Token mint
        destinationAccount, // Destination token account
        owner,             // Owner of the source account
        amount,            // Amount to transfer
        decimals,          // Number of decimals
        [],                // Multistore signers (empty for single signer)
        TOKEN_2022_PROGRAM_ID
    );

    // Instruction 3: Freeze the source account again
    const freezeInstruction = createFreezeAccountInstruction(
        sourceAccount,      // Token account to freeze
        mint,              // Token mint
        freezeAuthority,   // Freeze authority
        [],                // Multistore signers (empty for single signer)
        TOKEN_2022_PROGRAM_ID
    );

    const computeBudgetIx = ComputeBudgetProgram.setComputeUnitLimit({
        units: 400000, // Adjust as necessary
    });

    const computeLimitIx = ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: 10, // Adjust as necessary
    });

    // Create transaction with all three instructions
    const tx = new Transaction().add(
        computeBudgetIx,
        computeLimitIx,
        thawInstruction,
        transferInstruction,
        freezeInstruction
    );

    try {
        const signature = await sendAndConfirmTransaction(connection, tx, []);
        console.log("Transaction successful!");
        console.log("Signature:", signature);
        console.log(`View on Solana Explorer: https://explorer.solana.com/tx/${signature}?cluster=devnet`);
    } catch (error) {
        console.error("Transaction failed:", error);
    }
}

main().catch(e => {
    console.log(`Error: ${e}`);
});
    