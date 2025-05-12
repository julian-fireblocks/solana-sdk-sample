import { Transaction } from "@solana/web3.js";

const base64 = "<RAW_DATA>"
const rawBytes = Buffer.from(base64, "base64");
console.log(rawBytes);

const transaction = Transaction.from(rawBytes);
console.log(JSON.stringify(transaction, null, 2));