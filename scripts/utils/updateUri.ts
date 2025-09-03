import { createUpdateFieldInstruction } from "@solana/spl-token-metadata";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { clusterApiUrl, Commitment, PublicKey, sendAndConfirmTransaction, Transaction } from "@solana/web3.js";
import { publicKey } from "@coral-xyz/anchor/dist/cjs/utils";
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

    const connection = await FireblocksSDK.FireblocksConnectionAdapter.create(
        clusterApiUrl("devnet"),
        fireblocksConnectionConfig,
        "confirmed" as Commitment
    );

    const updateUriIx = createUpdateFieldInstruction({
        programId: TOKEN_2022_PROGRAM_ID,
        metadata: new PublicKey("5j2VbJcc138m5RJZTa7uuaVaeDoUihPmog1maxA9xMtF"), // The mint's public key as the metadata account
        updateAuthority: new PublicKey(
            "9UmWNnN7fQ58KHtkganDJfHVwA3EkTcWAUgF5CZarsZt"
        ),
        field: "uri", // Name of the field to update
        value: "https://path.to/new/metadata.json", // New value for the URI
    });

    const tx = new Transaction().add(
        updateUriIx
    )
    await sendAndConfirmTransaction(connection, tx, []);
}

main().catch(e => {
    console.log(`Error: ${e}`);
});

