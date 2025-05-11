import * as anchor from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import fs from "fs";
import path from "path";

async function sendChunks(connection, wallet, programBinary, programId) {
  const CHUNK_SIZE = 1000; // Each chunk is 1000 bytes (adjust as needed)
  const chunks = [];
  for (let i = 0; i < programBinary.length; i += CHUNK_SIZE) {
    chunks.push(programBinary.slice(i, i + CHUNK_SIZE));
  }

  console.log(`Program binary split into ${chunks.length} chunks.`);

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const tx = new Transaction().add(
      new TransactionInstruction({
        keys: [{ pubkey: programId, isSigner: true, isWritable: true }],
        programId: SystemProgram.programId,
        data: chunk, // Send the current chunk
      })
    );

    tx.feePayer = wallet.publicKey;
    tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

    const signature = await connection.sendTransaction(tx, [wallet]);
    console.log(
      `Chunk ${i + 1}/${chunks.length} sent. Signature: ${signature}`
    );
    await connection.confirmTransaction(signature, "confirmed");
  }

  console.log("All chunks sent successfully.");
}

async function main() {
  // Load environment variables
  require("dotenv").config();

  // Set up the connection to the Solana cluster
  const connection = new Connection(
    process.env.ANCHOR_PROVIDER_URL || "https://api.devnet.solana.com",
    "confirmed"
  );

  // Load the wallet keypair
  const walletPath = process.env.ANCHOR_WALLET || "~/.config/solana/id.json";
  const walletKeypair = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(walletPath, "utf8")))
  );

  // Set up the Anchor provider
  const provider = new anchor.AnchorProvider(
    connection,
    new anchor.Wallet(walletKeypair),
    {
      preflightCommitment: "confirmed",
    }
  );
  anchor.setProvider(provider);

  // Load the compiled program binary
  const programBinaryPath = path.resolve(
    __dirname,
    "../target/deploy/simple_token.so"
  );
  const programBinary = fs.readFileSync(programBinaryPath);

  // Generate a new program ID (public key) for deployment
  const programKeypair = Keypair.generate();
  console.log("Program ID:", programKeypair.publicKey.toBase58());

  // Deploy the program
  const tx = await connection.requestAirdrop(
    walletKeypair.publicKey,
    2 * anchor.web3.LAMPORTS_PER_SOL
  ); // Ensure sufficient SOL
  await connection.confirmTransaction(tx, "confirmed");

  const programId = programKeypair.publicKey;
  const transaction = await connection.sendTransaction(
    new anchor.web3.Transaction().add(
      SystemProgram.createAccount({
        fromPubkey: walletKeypair.publicKey,
        newAccountPubkey: programId,
        lamports: await connection.getMinimumBalanceForRentExemption(
          programBinary.length
        ),
        space: programBinary.length,
        programId: SystemProgram.programId,
      }),
      new anchor.web3.TransactionInstruction({
        keys: [{ pubkey: programId, isSigner: true, isWritable: true }],
        programId: SystemProgram.programId,
        data: programBinary,
      })
    ),
    [walletKeypair, programKeypair]
  );

  console.log("Program deployed successfully. Transaction:", transaction);
}

main().catch((err) => {
  console.error(err);
});
