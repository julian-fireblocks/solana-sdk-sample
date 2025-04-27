import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { SimpleToken } from "../target/types/simple_token";
import { Connection, Keypair, PublicKey, SystemProgram } from "@solana/web3.js";

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

async function main() {
  console.log("Getting balances...");

  // Replace with your actual mint account public key
  const mintPublicKey = new PublicKey(
    "2b7D3jFfEFj8MyXMktP7DtSTeL36EamAsDqV36FfeMgf"
  );
  // Fetch the mint account info
  const accountData = await program.account.tokenAccount.fetch(mintPublicKey);
  console.log("Mint account data:", accountData);
}

main().catch((err) => {
  console.error(err);
});
