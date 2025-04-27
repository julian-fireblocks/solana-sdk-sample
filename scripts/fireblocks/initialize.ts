import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { SimpleToken } from "../../target/types/simple_token";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  clusterApiUrl,
  Commitment,
  sendAndConfirmTransaction,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import fs from "fs";

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

  console.log("Initializing...");

  // Accounts setup
  const initAuthority = new PublicKey(connection.getAccount());
  const targetAccount = Keypair.generate();

  // Save target account to a file
  fs.writeFileSync(
    "./targetAccount.json",
    JSON.stringify(Array.from(targetAccount.secretKey)) 
);

  // OPTION 1: Anchor to serialize the mint
  const initTx = new Transaction().add(
    await program.methods
      .initialize()
      .accounts({
        mint: targetAccount.publicKey,
        user: initAuthority,
      })
      .signers([targetAccount]) // IMPORTANT: The signing order must be maintained
      .instruction()
  );

  initTx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  initTx.feePayer = initAuthority;
  initTx.partialSign(targetAccount);

  const hash = await sendAndConfirmTransaction(connection, initTx, []);
  console.log("Token initialized for:", targetAccount.publicKey.toBase58());
  console.log("Transaction hash:", hash);

  // OPTION 2: Manually serialize the mint
  const manualInitTx = new Transaction().add(
    new TransactionInstruction({
      keys: [
        { pubkey: targetAccount.publicKey, isSigner: true, isWritable: true },
        { pubkey: initAuthority, isSigner: true, isWritable: false },
      ],
      programId: new PublicKey(program.idl.address),
      data: Buffer.from(program.idl.instructions[1].discriminator), // The index or discriminator of the instruction
    })
  );

  manualInitTx.recentBlockhash = (
    await connection.getLatestBlockhash()
  ).blockhash;
  manualInitTx.feePayer = initAuthority;
  manualInitTx.partialSign(targetAccount);

  const manualHash = await sendAndConfirmTransaction(
    connection,
    manualInitTx,
    []
  );
  console.log("Manually initialized at:", targetAccount.publicKey.toBase58());
  console.log("Manual transaction hash:", manualHash);
}

main().catch((err) => {
  console.error(err);
});
