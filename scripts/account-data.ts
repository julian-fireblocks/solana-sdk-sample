import { Connection, PublicKey, clusterApiUrl } from "@solana/web3.js";

async function fetchAccountData(connection: Connection, accountPubkey: PublicKey) {
  // Fetch account info
  const accountInfo = await connection.getAccountInfo(accountPubkey);
  if (!accountInfo) {
    console.log("Account not found");
    return;
  }

  // Raw data buffer
  const data = accountInfo.data;

  console.log("Account data (hex):", Buffer.from(data).toString("hex"));
  console.log("Account data (base64):", Buffer.from(data).toString("base64"));

  // For Upgradeable Loader buffer account, first byte(s) indicate state discriminator
  // You can inspect first byte(s) to determine account state

  const discriminator = data[0];
  console.log("State discriminator (first byte):", discriminator);

  // You can compare discriminator with known states:
  // 0 = Uninitialized
  // 1 = Buffer
  // 2 = Program
  // 3 = ProgramData
}

(async () => {
  const connection = new Connection(clusterApiUrl("devnet"),"confirmed");
  const bufferPubkey = new PublicKey("5vvemG8ZTLaD93nQex7DwX82zsoK8DZbEdrQzuX5xFgf");

  await fetchAccountData(connection, bufferPubkey);
})();