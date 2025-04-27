import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { SimpleToken } from "../../target/types/simple_token";
import { clusterApiUrl, Commitment, Connection, Keypair, PublicKey, sendAndConfirmTransaction, Transaction } from "@solana/web3.js";
import fs from "fs";

// Setup provider
require("dotenv").config();

// FIREBLOCKS SDK SPECIFIC
import * as FireblocksSDK from "./lib/index";

const fireblocksConnectionConfig: FireblocksSDK.FireblocksConnectionAdapterConfig =
  {
    apiKey: process.env.FIREBLOCKS_API_KEY || "",
    apiSecretPath: process.env.FIREBLOCKS_SECRET_KEY_PATH || "",
    vaultAccountId: process.env.MINTER_VAULT_ACCOUNT_ID || "",
    feeLevel: FireblocksSDK.FeeLevel.HIGH,
    silent: false,
    devnet: true,
  };

// Setup program client
const program = anchor.workspace.SimpleToken as Program<SimpleToken>;

async function main() {
    // Fireblocks Specific
    const connection = await FireblocksSDK.FireblocksConnectionAdapter.create(
      clusterApiUrl("devnet"),
      fireblocksConnectionConfig,
      "confirmed" as Commitment
    );

  console.log("Minting...");

  // Replace with your actual mint account public key
  const mintAuthority = new PublicKey(connection.getAccount());
  const targetAccount = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync("./targetAccount.json", "utf8")))
  );

  // Amount to mint (e.g., 1,000 tokens)
  const amount = 1_000;

  // Call the mint function in the program
  const tx = new Transaction().add(
    await program.methods
      .mint(new anchor.BN(amount)) // Pass the amount as a BN
      .accounts({
        mint: targetAccount.publicKey,
      })
      .instruction()
  );

  tx.feePayer = mintAuthority;
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

  const hash = await sendAndConfirmTransaction(connection,tx, []); 
  console.log("Minted successfully:", tx);
}

main().catch((err) => {
  console.error(err);
});
