import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { SimpleToken } from "../target/types/simple_token";
import { Connection, Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import fs from "fs";

require("dotenv").config();

// Load the Anchor workspace
const provider = anchor.AnchorProvider.env();
anchor.setProvider(provider);
console.log("Provider set:", anchor.getProvider().connection.rpcEndpoint);
console.log(
  "Provider wallet public key:",
  anchor.getProvider().publicKey.toBase58()
);
console.log("Cluster URL:", provider.connection.rpcEndpoint);

// Setup program client
const program = anchor.workspace.SimpleToken as Program<SimpleToken>;

// Owner of the mint
const mintAuthority = provider.wallet.publicKey;

async function main() {
  console.log("Initializing...");

  const mint = Keypair.generate();

  await program.methods
    .initialize()
    .accounts({
      mint: mint.publicKey,
      user: mintAuthority,
    })
    .signers([mint])
    .rpc();

  console.log("Mint initialized at:", mint.publicKey.toBase58());
}

main().catch((err) => {
  console.error(err);
});
