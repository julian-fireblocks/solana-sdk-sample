import {
    Keypair,
    LAMPORTS_PER_SOL,
    PublicKey,
    sendAndConfirmTransaction,
    Transaction,
    clusterApiUrl,
    SystemProgram,
    TransactionInstruction,
    SYSVAR_RENT_PUBKEY,
    SYSVAR_CLOCK_PUBKEY,
    Commitment,
} from "@solana/web3.js";

import { Connection as PublicConnection } from "@solana/web3.js"; 

import {
    FireblocksConnectionAdapter,
    FireblocksConnectionAdapterConfig,
    FeeLevel,
} from "../fireblocks/lib/index";
import fs from "fs";

require("dotenv").config();

const BPF_LOADER_UPGRADEABLE_ID = "BPFLoaderUpgradeab1e11111111111111111111111";
const PROGRAM_ACCOUNT_SPACE = 44;// 44 bytes for program account, prevously 36
const secretKeyFile = Uint8Array.from(JSON.parse(fs.readFileSync(process.env.LOCAL_SECRET_PAYER, "utf8")));
const secretKey = Keypair.fromSecretKey(secretKeyFile);

const bufferAccountKeypair = Uint8Array.from(
    JSON.parse(fs.readFileSync(process.env.BUFFER_ACCOUNT, "utf8"))
);
const bufferKeypair = Keypair.fromSecretKey(bufferAccountKeypair);

const programAccountKeypairFile = Uint8Array.from(
    JSON.parse(fs.readFileSync(process.env.PROGRAM_ACCOUNT, "utf8"))
);
const programAccountKeypair = Keypair.fromSecretKey(programAccountKeypairFile);


const publicConnection = new PublicConnection(
    clusterApiUrl("devnet"),
    "confirmed" as Commitment
);

// BPF Function 1
// updated for correct padding/ serialization
function encodeWriteInstruction(offset: number, data: Buffer): Buffer {
    // Use u32 little-endian discriminator for Write instruction (1)
    const discriminator = Buffer.from([1, 0, 0, 0]); // Write enum variant as little-endian u32
    
    // Serialize the offset as u32 little-endian
    const offsetBuffer = Buffer.alloc(4);
    offsetBuffer.writeUInt32LE(offset, 0);
    
    // Serialize the data length as u64 little-endian
    const dataLenBuffer = Buffer.alloc(8);
    dataLenBuffer.writeBigUInt64LE(BigInt(data.length), 0);
    
    // Combine all parts
    return Buffer.concat([
        discriminator,  // 4 bytes
        offsetBuffer,   // 4 bytes
        dataLenBuffer,  // 8 bytes
        data            // variable length
    ]);
}

const encodeDeployWithMaxDataLenInstruction = (bufferSize: number) => {
    // Discriminator for DeployWithMaxDataLen (2) as u32 LE
    const discriminator = Buffer.from([2, 0, 0, 0]);
    
    // // max_data_len as BigInt (u64/usize on 64-bit)
    const maxDataLenBuffer = Buffer.alloc(8);
    maxDataLenBuffer.writeBigUInt64LE(BigInt(bufferSize), 0);
    
    // Combine both parts (12 bytes total)
    return Buffer.concat([discriminator, maxDataLenBuffer]);
};

async function deployProgram() {
    console.log("Starting Solana program deployment...");
    console.log("apiKey:", process.env.FIREBLOCKS_API_KEY);
    console.log("apiSecretPath:", process.env.FIREBLOCKS_SECRET_KEY_PATH);
    console.log("vaultAccountId:", process.env.ADMIN_VAULT_ACCOUNT_ID);

    // Configure Fireblocks connection
    const fireblocksConnectionConfig: FireblocksConnectionAdapterConfig = {
        apiKey: process.env.FIREBLOCKS_API_KEY || "",
        apiSecretPath: process.env.FIREBLOCKS_SECRET_KEY_PATH || "",
        vaultAccountId: process.env.ADMIN_VAULT_ACCOUNT_ID || "",
        feeLevel: FeeLevel.HIGH, // Use high fee level for deployment transactions
        silent: false,
        devnet: true, // Set to true for devnet, false for mainnet
    };

    // Create connection to Solana devnet
    const connection = await FireblocksConnectionAdapter.create(
        clusterApiUrl("devnet"),
        fireblocksConnectionConfig,
        "confirmed" as Commitment
    );

    // Get the account public key from the Fireblocks vault
    const payerPublicKey = new PublicKey(connection.getAccount());
    console.log("Deployer account:", payerPublicKey.toBase58());

    // Create a new keypair for the program account
    // TODO: Move to same transaction as deployWithMaxDataLen
    console.log("Program Account:", programAccountKeypair.publicKey.toBase58());
    console.log(
        "Program Account Secret Key (json):",
        JSON.stringify(Array.from(programAccountKeypair.secretKey))
    );
    // Path to the compiled program (replace with your actual program path)
    // Note: You need to compile your Solana program using the Solana CLI before running this script
    // Example: solana-test-validator
    // In another terminal: cargo build-bpf --manifest-path=./path/to/program/Cargo.toml

    const programPath = process.env.FIREBLOCKS_DEPLOY_FILE || "";

    // For this example, we'll check if the file exists
    if (!fs.existsSync(programPath)) {
        console.error(`Program file not found at ${programPath}`);
        console.error(
            "Please compile your Solana program before running this script"
        );
        console.error(
            "Example: cargo build-bpf --manifest-path=./path/to/program/Cargo.toml"
        );
        return;
    }

    // Read the program file
    const programData = fs.readFileSync(programPath);
    console.log(`Program size: ${programData.length} bytes`);

    // Set transaction note
    connection.setTxNote(
        "Deploying Solana program with Fireblocks Connection Adapter"
    );

    try {
        const bufferLamports = 0.1 * LAMPORTS_PER_SOL; // 0.1 SOL buffer
        // Calculate minimum balance for rent exemption
        const minimumBalanceForRentExemption =
            await connection.getMinimumBalanceForRentExemption(
                programData.length
            ) + bufferLamports;
        console.log(
            `Minimum balance for rent exemption: ${
                minimumBalanceForRentExemption / LAMPORTS_PER_SOL
            } SOL`
        );

        // Deploy the program
        console.log("Deploying program...");

        // 1. Create program account
        const firstBlockhash = await connection.getLatestBlockhash({commitment: "confirmed"});
        const createAccountTransaction = new Transaction();
        createAccountTransaction.feePayer = payerPublicKey;
        createAccountTransaction.recentBlockhash = firstBlockhash.blockhash;
        createAccountTransaction.add(
            SystemProgram.createAccount({
                fromPubkey: payerPublicKey,
                newAccountPubkey: programAccountKeypair.publicKey,
                lamports: await connection.getMinimumBalanceForRentExemption(
                    PROGRAM_ACCOUNT_SPACE
                ),
                space: PROGRAM_ACCOUNT_SPACE,
                programId: new PublicKey(BPF_LOADER_UPGRADEABLE_ID),
            })
        );

        // Sign and send the create account transaction
        // Note: We need to sign with both the payer and the program account keypair
        createAccountTransaction.partialSign(programAccountKeypair);

        // Serialize the transaction with verifySignatures set to false
        const serializedTx = createAccountTransaction.serialize({
            verifySignatures: false,
        });
        console.log("Serialized transaction:", serializedTx.toString("base64"));

        const createAccountTxHash = await sendAndConfirmTransaction(
            connection,
            createAccountTransaction,
            [] // Empty array since Fireblocks will handle the payer signature
        );
        console.log(
            `Program account created: https://explorer.solana.com/tx/${createAccountTxHash}?cluster=devnet`
        );

        // 1b. Create buffer account
        console.log("Buffer Keypair:", bufferKeypair.publicKey.toBase58());

        console.log(
            "Buffer Keypair Secret Key (json):",
            JSON.stringify(Array.from(bufferKeypair.secretKey))
        );

        const bufferSize = Math.ceil((programData.length + 33) / 1024) * 1024; // 33 Bytes, 1 for state variable, 32 for authority
        // Round up to the nearest 1024 bytes

        const createBufferAccountTransaction = new Transaction();
        createBufferAccountTransaction.feePayer = payerPublicKey;
        const secondBlockhash = await connection.getLatestBlockhash({commitment: "confirmed"});
        createBufferAccountTransaction.recentBlockhash = secondBlockhash.blockhash;
        createBufferAccountTransaction.add(
            SystemProgram.createAccount({
                fromPubkey: payerPublicKey,
                newAccountPubkey: bufferKeypair.publicKey,
                lamports: await connection.getMinimumBalanceForRentExemption(
                    bufferSize
                ),
                space: bufferSize,
                programId: new PublicKey(BPF_LOADER_UPGRADEABLE_ID),
            })
        );

        createBufferAccountTransaction.partialSign(bufferKeypair);
        const createBufferAccountTxHash = await sendAndConfirmTransaction(
            connection,
            createBufferAccountTransaction,
            [] // Empty array since Fireblocks will handle the payer signature
        );
        console.log(
            `Buffer account created: https://explorer.solana.com/tx/${createBufferAccountTxHash}?cluster=devnet`
        );

        const createBufferTransaction = new Transaction();
        createBufferTransaction.feePayer = payerPublicKey;
        const thirdBlockhash = await connection.getLatestBlockhash({commitment: "confirmed"});
        createBufferTransaction.recentBlockhash = thirdBlockhash.blockhash; 
        createBufferTransaction.add(
            //  https://github.com/solana-labs/solana/blob/master/sdk/program/src/loader_upgradeable_instruction.rs#L23
            new TransactionInstruction({
                programId: new PublicKey(BPF_LOADER_UPGRADEABLE_ID),
                keys: [
                    {
                        pubkey: bufferKeypair.publicKey,
                        isSigner: false,
                        isWritable: true,
                    },
                    {
                        pubkey: payerPublicKey,
                        isSigner: false,
                        isWritable: false,
                    },
                ],
                data: Buffer.from([0, 0, 0, 0]) // Discriminator for Buffer (0) - Initialize Buffer
            })
        );

        // Sign and send the create buffer transaction using fireblocks
        const serializedBufferTx = createBufferTransaction.serialize({
            verifySignatures: false,
            requireAllSignatures: false,
        });
        console.log(
            "Serialized buffer transaction:",
            serializedBufferTx.toString("base64")
        );
        console.log("Buffer keypair:", bufferKeypair.publicKey.toBase58());


        const createBufferTxHash = await sendAndConfirmTransaction(
            connection,
            createBufferTransaction,
            []
        );
        console.log(
            `Buffer account created: https://explorer.solana.com/tx/${createBufferTxHash}?cluster=devnet`
        );

        console.log("Forcing sleep until transaction is confirmed...");
        // Wait for the transaction to be confirmed
        await connection.confirmTransaction(createBufferTxHash, "confirmed");

        while (true) {
            const transactionDetails = await connection.getTransaction(
                createBufferTxHash,
                {
                    commitment: "confirmed",
                }
            );

            if (transactionDetails && transactionDetails.slot > 0) {
                console.log("Transaction confirmed!");
                break;
            } else {
                console.log("Waiting for transaction confirmation...");
                await new Promise((resolve) => setTimeout(resolve, 10000)); // Wait for 10 seconds
            }
        }

        // 2. Write program data in chunks
        console.log(
            "Transaction confirmed, proceeding to write program data..."
        );

        // Calculate optimal chunk size to ensure it doesn't exceed transaction size limit
        const calculateOptimalChunkSize = (dataLength: number) => {
            // Transaction size limit is 1232 bytes
            const MAX_TRANSACTION_SIZE = 1232;
            // Estimated transaction metadata size (including signatures, headers, etc.)
            // Increased metadata size estimate for safety
            const TRANSACTION_METADATA_SIZE = 400; // Increased to 400 to provide more safety margin
            // Instruction header size (instruction type 1 byte + offset 4 bytes)
            const INSTRUCTION_HEADER_SIZE = 5;
            // Additional safety margin
            const SAFETY_MARGIN = 150; // Increased safety margin

            // Calculate maximum bytes available for data
            const maxDataSize =
                MAX_TRANSACTION_SIZE -
                TRANSACTION_METADATA_SIZE -
                INSTRUCTION_HEADER_SIZE -
                SAFETY_MARGIN;

            // Set a very conservative initial chunk size
            let chunkSize = Math.min(maxDataSize, 600); // Reduced to 600 bytes

            // Calculate total chunks needed with current chunk size
            let totalChunks = Math.ceil(dataLength / chunkSize);

            return { chunkSize, totalChunks };
        };

        // Dynamically calculate optimal chunk size
        const { chunkSize, totalChunks } = calculateOptimalChunkSize(
            programData.length
        );

        console.log(`Optimal chunk size: ${chunkSize} bytes`);
        console.log(`Total chunks needed: ${totalChunks}`);
        let chunkTxHash = ""; // Declare variable outside loop

        for (let i = 38; i < totalChunks; i++) {
            const offset = i * chunkSize;
            let chunk = programData.slice(offset, offset + chunkSize);

            console.log(
                `Writing chunk ${i + 1}/${totalChunks} (${
                    chunk.length
                } bytes) at offset ${offset}...`
            );

            const chunkTransaction = new Transaction();
            chunkTransaction.feePayer = payerPublicKey;
            chunkTransaction.recentBlockhash = (
                await connection.getLatestBlockhash({commitment: "confirmed"})
            ).blockhash;

            // Optimize instruction data structure - use let declaration for possible later modifications
            let currentChunk = chunk;
            let data = encodeWriteInstruction(offset, currentChunk); // enum 0
            chunkTransaction.add(
                new TransactionInstruction({
                    programId: new PublicKey(BPF_LOADER_UPGRADEABLE_ID),
                    keys: [
                        {
                            pubkey: bufferKeypair.publicKey,
                            isSigner: false,
                            isWritable: true,
                        },
                        {
                            pubkey: payerPublicKey,
                            isSigner: true,
                            isWritable: false,
                        },
                    ],
                    data,
                })
            );

            try {
                console.log("Signing chunk transaction...");

                // fee estimation
                const feeCalculator = await connection.getFeeForMessage(
                    chunkTransaction.compileMessage()
                );
                if (feeCalculator.value !== null) {
                    console.log(
                        `Estimated fee: ${feeCalculator.value} lamports`
                    );
                } else {
                    console.error("Failed to calculate transaction fee.");
                }

                const chunkTxHash = await sendAndConfirmTransaction(
                    connection,
                    chunkTransaction,
                    [] // Empty array since Fireblocks will handle the payer signature
                );

                console.log(
                    `Chunk ${
                        i + 1
                    }/${totalChunks} written: https://explorer.solana.com/tx/${chunkTxHash}?cluster=devnet`
                );

                // wait for the transaction to be confirmed
                await connection.confirmTransaction(chunkTxHash, "confirmed");
                console.log("Chunk transaction confirmed!");
                while (true) {
                    const transactionDetails = await connection.getTransaction(
                        chunkTxHash,
                        {
                            commitment: "confirmed",
                        }
                    );

                    if (transactionDetails && transactionDetails.slot > 0) {
                        console.log("Transaction confirmed!");
                        break;
                    } else {
                        console.log("Waiting for transaction confirmation...");
                        await new Promise((resolve) =>
                            setTimeout(resolve, 10000)
                        ); // Wait for 10 seconds
                    }
                }
            } catch (chunkError) {
                // retry logic for chunk transaction
                let retries = 0;
                const maxRetries = 3;
                let retryDelay = 1000; // Initial delay of 1 second
                let chunkTxHash = "";
                while (retries < maxRetries) {
                    console.log(
                        `Retrying chunk transaction ${i + 1}/${totalChunks} (${
                            retries + 1
                        }/${maxRetries})...`
                    );
                    try {
                        chunkTxHash = await sendAndConfirmTransaction(
                            connection,
                            chunkTransaction,
                            [] // Empty array since Fireblocks will handle the payer signature
                        );
                        console.log(
                            `Chunk ${
                                i + 1
                            }/${totalChunks} written: https://explorer.solana.com/tx/${chunkTxHash}?cluster=devnet`
                        );
                        break; // Exit retry loop on success
                    } catch (retryError) {
                        console.error("Retry error:", retryError);
                        retries++;
                        if (retries < maxRetries) {
                            console.log(
                                `Retrying in ${retryDelay / 1000} seconds...`
                            );
                            await new Promise((resolve) =>
                                setTimeout(resolve, retryDelay)
                            );
                            retryDelay *= 2; // Exponential backoff
                        }
                        if (retries === maxRetries) {
                            console.error(
                                `Max retries reached for chunk ${
                                    i + 1
                                }/${totalChunks}`
                            );
                            console.error("Final error:", retryError);
                            throw retryError; // Rethrow the error after max retries
                        }
                    }
                }
            }
        }

        const writeTxHash = chunkTxHash; // Use last chunk's hash as the writeTxHash
        console.log(
            `Wrote entire program data: https://explorer.solana.com/tx/${writeTxHash}?cluster=devnet`
        );

        // 3. Finalize the program
        // Get the program data address
        const programDataAddress = PublicKey.findProgramAddressSync(
            [programAccountKeypair.publicKey.toBuffer()],
            new PublicKey(BPF_LOADER_UPGRADEABLE_ID)
        );

        const finalizeTransaction = new Transaction();
        finalizeTransaction.feePayer = payerPublicKey;
        finalizeTransaction.recentBlockhash = (
            await connection.getLatestBlockhash({commitment: "confirmed"})
        ).blockhash;

        finalizeTransaction.add(
            new TransactionInstruction({
                programId: new PublicKey(BPF_LOADER_UPGRADEABLE_ID), // The BPF loader program ID
                keys: [
                    {
                        pubkey: payerPublicKey,
                        isSigner: true,
                        isWritable: true,
                    }, // Payer for rent
                    {
                        pubkey: programDataAddress[0],
                        isSigner: false,
                        isWritable: true,
                    }, // Data account for program
                    {
                        pubkey: programAccountKeypair.publicKey,
                        isSigner: false,
                        isWritable: true,
                    }, // Program account
                    {
                        pubkey: bufferKeypair.publicKey,
                        isSigner: false,
                        isWritable: true,
                    }, // Buffer account
                    {
                        pubkey: SYSVAR_RENT_PUBKEY,
                        isSigner: false,
                        isWritable: false,
                    },
                    {
                        pubkey: SYSVAR_CLOCK_PUBKEY,
                        isSigner: false,
                        isWritable: false,
                    },
                    {
                        pubkey: SystemProgram.programId,
                        isSigner: false,
                        isWritable: false,
                    },
                    {
                        pubkey: payerPublicKey,
                        isSigner: true,
                        isWritable: false,
                    }, // Upgrade authority
                ],
                data: encodeDeployWithMaxDataLenInstruction(bufferSize), // Pass the buffer size
            })
        );

        // Sign with program keypair since it's a required signer
        let finalizeTxHash;
        try {
            console.log("Signing finalize transaction...");

            finalizeTxHash = await sendAndConfirmTransaction(
                connection,
                finalizeTransaction,
                [] // Empty array since Fireblocks will handle the payer signature
            );
        } catch (finalizeSignError) {
            console.error(
                "Error signing finalize transaction:",
                finalizeSignError
            );
            throw finalizeSignError;
        }

        console.log(
            `Program finalized: https://explorer.solana.com/tx/${finalizeTxHash}?cluster=devnet`
        );
        console.log("Program deployment completed successfully!");
        console.log(
            `Program ID: ${programAccountKeypair.publicKey.toBase58()}`
        );
        console.log(
            `Verify your program at: https://explorer.solana.com/address/${programAccountKeypair.publicKey.toBase58()}?cluster=devnet`
        );
    } catch (error) {
        console.error("Error deploying program:", error);
    }
}

deployProgram();
