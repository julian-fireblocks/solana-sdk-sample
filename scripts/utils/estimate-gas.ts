import { Connection, PublicKey, clusterApiUrl, ParsedTransactionWithMeta, VersionedTransactionResponse, Message, MessageCompiledInstruction } from "@solana/web3.js";
import * as FireblocksSDK from "../fireblocks/lib";

const fireblocksConnectionConfig: FireblocksSDK.FireblocksConnectionAdapterConfig = {
    apiKey: process.env.FIREBLOCKS_API_KEY || "",
    apiSecretPath: process.env.FIREBLOCKS_SECRET_KEY_PATH || "",
    vaultAccountId: process.env.MINTER_VAULT_ACCOUNT_ID || "",
    feeLevel: FireblocksSDK.FeeLevel.HIGH,
    silent: false,
    devnet: true,
};

interface TransactionGasInfo {
    signature: string;
    computeUnitsConsumed: number | null;
    computeUnitsRequested: number | null;
    computeUnitPrice: number | null;
    totalFee: number;
    success: boolean;
    blockTime: number | null;
    slot: number;
}

async function getTransactionGasInfo(signature: string): Promise<TransactionGasInfo | null> {
    const connection = await FireblocksSDK.FireblocksConnectionAdapter.create(
        clusterApiUrl("devnet"),
        fireblocksConnectionConfig,
        "confirmed"
    );

    try {
        console.log(`Fetching transaction details for: ${signature}`);
        
        // Get the transaction with metadata
        const transaction = await connection.getTransaction(signature, {
            maxSupportedTransactionVersion: 0,
            commitment: "confirmed"
        });

        if (!transaction) {
            console.log("Transaction not found");
            return null;
        }

        let computeUnitsRequested: number | null = null;
        let computeUnitPrice: number | null = null;

        // Note: We don't extract computeUnitsConsumed from logs because:
        // 1. Logs only show individual program consumption, not total transaction consumption
        // 2. Multiple programs can be invoked in a single transaction
        // 3. The total compute units consumed is not directly available in transaction logs

        // Check for compute budget instructions to get the requested limit and price
        if (transaction.transaction) {
            const keys = (transaction.transaction.message instanceof Message) ? transaction.transaction.message.accountKeys : transaction.transaction.message.staticAccountKeys;
            const computeBudgetProgramId = new PublicKey("ComputeBudget111111111111111111111111111111");
            const computeBudgetKeyIndex = keys.findIndex(key => key.equals(computeBudgetProgramId));
            
            const instructions: MessageCompiledInstruction[] = (transaction.transaction.message instanceof Message) ? transaction.transaction.message.compiledInstructions : transaction.transaction.message.compiledInstructions;
            for (const instruction of instructions) {
                try {
                    // Check if this is a compute budget instruction
                    const key = keys[instruction.programIdIndex];

                    // Compute Budget Program ID: ComputeBudget111111111111111111111111111111
                    if (key.equals(computeBudgetProgramId)) {
                        const data = instruction.data;
                        
                        // Parse compute budget instructions
                        if (data.length >= 5) {
                            const buffer = Buffer.from(data);
                            const instructionType = buffer.readUInt8(0);
                            
                            // SetComputeUnitLimit instruction (type 2)
                            if (instructionType === 2 && buffer.length >= 5) {
                                computeUnitsRequested = buffer.readUInt32LE(1);
                            }
                            
                            // SetComputeUnitPrice instruction (type 3)
                            if (instructionType === 3 && buffer.length >= 9) {
                                computeUnitPrice = Number(buffer.readBigUInt64LE(1));
                            }
                        }
                    }
                } catch (error) {
                    // Skip instruction parsing errors
                    continue;
                }
            }
        }

        const gasInfo: TransactionGasInfo = {
            signature,
            computeUnitsConsumed: null, // Not available from transaction logs
            computeUnitsRequested,
            computeUnitPrice,
            totalFee: transaction.meta?.fee || 0,
            success: transaction.meta?.err === null,
            blockTime: transaction.blockTime,
            slot: transaction.slot
        };

        return gasInfo;

    } catch (error) {
        console.error("Error fetching transaction gas info:", error);
        throw error;
    }
}

async function analyzeMultipleTransactions(signatures: string[]): Promise<void> {
    console.log(`\n=== Analyzing ${signatures.length} Transactions ===\n`);
    
    const results: TransactionGasInfo[] = [];
    
    for (const signature of signatures) {
        try {
            const gasInfo = await getTransactionGasInfo(signature);
            if (gasInfo) {
                results.push(gasInfo);
                
                console.log(`Transaction: ${signature}`);
                console.log(`  Status: ${gasInfo.success ? 'SUCCESS' : 'FAILED'}`);
                console.log(`  Compute Units Consumed: ${gasInfo.computeUnitsConsumed || 'N/A'}`);
                console.log(`  Compute Units Requested: ${gasInfo.computeUnitsRequested || 'N/A'}`);
                console.log(`  Compute Unit Price: ${gasInfo.computeUnitPrice ? `${gasInfo.computeUnitPrice} micro-lamports` : 'N/A'}`);
                console.log(`  Total Fee: ${gasInfo.totalFee} lamports (${gasInfo.totalFee / 1e9} SOL)`);
                console.log(`  Block Time: ${gasInfo.blockTime ? new Date(gasInfo.blockTime * 1000).toISOString() : 'N/A'}`);
                console.log(`  Slot: ${gasInfo.slot}`);
                console.log('');
                
                // Add small delay to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        } catch (error) {
            console.error(`Failed to analyze transaction ${signature}:`, error);
        }
    }
    
    // Summary statistics
    if (results.length > 0) {
        console.log("=== Summary Statistics ===");
        
        const successfulTxs = results.filter(r => r.success);
        
        console.log(`Total Transactions: ${results.length}`);
        console.log(`Successful Transactions: ${successfulTxs.length}`);
        
        const totalFees = results.reduce((sum, r) => sum + r.totalFee, 0);
        console.log(`Total Fees: ${totalFees} lamports (${totalFees / 1e9} SOL)`);
    }
}

async function estimateGasForTransaction(signature: string): Promise<void> {
    console.log("=== Transaction Gas Analysis ===\n");
    
    try {
        const gasInfo = await getTransactionGasInfo(signature);
        
        if (!gasInfo) {
            console.log("Transaction not found or could not be analyzed");
            return;
        }
        
        console.log("📊 Gas Analysis Results:");
        console.log(`Signature: ${gasInfo.signature}`);
        console.log(`Status: ${gasInfo.success ? '✅ SUCCESS' : '❌ FAILED'}`);
        console.log(`Compute Units Consumed: Not available from logs (multiple programs involved)`);
        console.log(`Compute Units Requested: ${gasInfo.computeUnitsRequested || 'Default (200k)'}`);
        
        if (gasInfo.computeUnitPrice) {
            console.log(`Compute Unit Price: ${gasInfo.computeUnitPrice} micro-lamports`);
        }
        
        console.log(`Total Transaction Fee: ${gasInfo.totalFee} lamports (${gasInfo.totalFee / 1e9} SOL)`);
        console.log(`Block Time: ${gasInfo.blockTime ? new Date(gasInfo.blockTime * 1000).toISOString() : 'Unknown'}`);
        console.log(`Slot: ${gasInfo.slot}`);
        
    } catch (error) {
        console.error("Failed to estimate gas:", error);
    }
}

async function main() {
    // Example usage - replace with actual transaction signatures
    const sampleTransactionSignature = "<SOME TRANSACTION HASH>";
    
    // Option 1: Analyze a single transaction
    await estimateGasForTransaction(sampleTransactionSignature);
    
    // Option 2: Analyze multiple transactions
    // const multipleSignatures = [
    //     "signature1",
    //     "signature2", 
    //     "signature3"
    // ];
    // await analyzeMultipleTransactions(multipleSignatures);
}

// Export functions for use in other scripts
export { getTransactionGasInfo, estimateGasForTransaction, analyzeMultipleTransactions };

main().catch(console.error);