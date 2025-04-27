import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { SimpleToken } from "../target/types/simple_token";
import { Keypair, PublicKey } from "@solana/web3.js";
import fs from "fs";

// Setup provider
require("dotenv").config();
const provider = anchor.AnchorProvider.env();
anchor.setProvider(provider);

// Load the wallet keypair
const walletPath = process.env.ANCHOR_WALLET || "~/.config/solana/id.json";
const walletKeypair = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(fs.readFileSync(walletPath, "utf8")))
);

const program = anchor.workspace.SimpleToken as Program<SimpleToken>;
async function main() {
  console.log("Minting...");

  // Replace with your actual mint account public key
  const mintPublicKey = new PublicKey(
    "3hnPCrdVLSkrdM1AcAsvSjB4sjpbfy7KbX4Kv2jdFoEj"
  );

  // Amount to mint (e.g., 1,000 tokens)
  const amount = 1_000;

  // Call the mint function in the program
  const tx = await program.methods
    .mint(new anchor.BN(amount)) // Pass the amount as a BN
    .accounts({
      mint: mintPublicKey,
    })
    .transaction();

    const sig = await provider.sendAndConfirm(tx, [
        walletKeypair
    ]);
    console.log("Minted successfully:", tx);
}

main().catch((err) => {
  console.error(err);
});
