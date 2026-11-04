/**
 * Local stack runner and seeder for Midpoint (Archetype BD · Two envelopes).
 *
 * Spawns anvil on port 8751 with chain id 968, deploys Midpoint, and seeds state per spec §5:
 * - Deal 1: Opened (no commitments yet)
 * - Deal 2: With the seller committed
 * - Deal 3: With both committed (reveal open)
 * - Deal 4: With one reveal in (seller revealed, buyer pending)
 * - Deal 5: Settled with a trade (odd midpoint, rounding visible)
 * - Deal 6: Settled with no deal (bid below ask)
 * - Deal 7: Void (no reveal within window)
 * - Deal 8: Cancelled
 *
 * Usage:
 *   node scripts/local-stack.mjs
 */

import { spawn, execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  encodeAbiParameters,
  formatEther,
  http,
  keccak256,
  parseEther,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const PORT = 8751;
const RPC = `http://127.0.0.1:${PORT}`;
const CHAIN_ID = 968;

const KEYS = [
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80", // 0: Seller (Alice)
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d", // 1: Buyer (Bob)
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a", // 2: Outsider (Charlie)
];

const accounts = KEYS.map((k) => privateKeyToAccount(k));

const local = defineChain({
  id: CHAIN_ID,
  name: "anvil",
  nativeCurrency: { name: "Test BOT", symbol: "tBOT", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
});

try {
  execSync(`fuser -k ${PORT}/tcp 2>/dev/null || true`);
} catch {}

console.log(`Starting anvil on port ${PORT}...`);
spawn(
  "anvil",
  [
    "--port",
    String(PORT),
    "--chain-id",
    String(CHAIN_ID),
    "--accounts",
    "10",
    "--balance",
    "1000",
    "--silent",
  ],
  { detached: true, stdio: "ignore" }
).unref();

const pub = createPublicClient({ chain: local, transport: http() });

for (let i = 0; i < 40; i++) {
  try {
    await pub.getBlockNumber();
    break;
  } catch {
    await new Promise((r) => setTimeout(r, 100));
  }
}

const [alice, bob, charlie] = accounts.map((acc) =>
  createWalletClient({ account: acc, chain: local, transport: http() })
);

const artifact = JSON.parse(
  readFileSync("contracts/out/Midpoint.sol/Midpoint.json", "utf8")
);

console.log("Deploying Midpoint contract...");
const deployTx = await alice.deployContract({
  abi: artifact.abi,
  bytecode: artifact.bytecode.object,
});
const deployReceipt = await pub.waitForTransactionReceipt({ hash: deployTx });
const contractAddress = deployReceipt.contractAddress;

function commitment(id, who, price, salt) {
  return keccak256(
    encodeAbiParameters(
      [
        { name: "id", type: "uint256" },
        { name: "who", type: "address" },
        { name: "price", type: "uint128" },
        { name: "salt", type: "bytes32" },
      ],
      [id, who, price, salt]
    )
  );
}

async function advanceTime(seconds) {
  await pub.request({
    method: "evm_increaseTime",
    params: [seconds],
  });
  await pub.request({
    method: "evm_mine",
    params: [],
  });
}

console.log("Seeding 8 deals per spec §5...");

const saltS = "0x1111111111111111111111111111111111111111111111111111111111111111";
const saltB = "0x2222222222222222222222222222222222222222222222222222222222222222";

// Deal 5: Settled with a trade (odd midpoint, rounding visible)
console.log("- Deal 5: Settled with trade (odd midpoint rounding visible)");
const txD5 = await alice.writeContract({
  address: contractAddress,
  abi: artifact.abi,
  functionName: "open",
  args: [bob.account.address, "1972 Vintage Leica M5", "Excellent mechanics and viewfinder", parseEther("3"), 3600n, 3600],
});
await pub.waitForTransactionReceipt({ hash: txD5 });
const id5 = 1n; // first created

const ask5 = 1000000000000000001n; // 1.000000000000000001 BOT
const bid5 = 2000000000000000000n; // 2.000000000000000000 BOT
await alice.writeContract({
  address: contractAddress,
  abi: artifact.abi,
  functionName: "commit",
  args: [id5, commitment(id5, alice.account.address, ask5, saltS)],
});
await bob.writeContract({
  address: contractAddress,
  abi: artifact.abi,
  functionName: "commit",
  args: [id5, commitment(id5, bob.account.address, bid5, saltB)],
  value: parseEther("3"),
});
await alice.writeContract({
  address: contractAddress,
  abi: artifact.abi,
  functionName: "reveal",
  args: [id5, ask5, saltS],
});
await bob.writeContract({
  address: contractAddress,
  abi: artifact.abi,
  functionName: "reveal",
  args: [id5, bid5, saltB],
});
await charlie.writeContract({
  address: contractAddress,
  abi: artifact.abi,
  functionName: "settle",
  args: [id5],
});

// Deal 6: Settled with no deal (bid below ask)
console.log("- Deal 6: Settled with no deal (bid below ask)");
const txD6 = await alice.writeContract({
  address: contractAddress,
  abi: artifact.abi,
  functionName: "open",
  args: [bob.account.address, "Rare Signed Lithograph", "Numbered 12/50", parseEther("5"), 3600n, 3600],
});
await pub.waitForTransactionReceipt({ hash: txD6 });
const id6 = 2n;

const ask6 = parseEther("4");
const bid6 = parseEther("2.5");
await alice.writeContract({
  address: contractAddress,
  abi: artifact.abi,
  functionName: "commit",
  args: [id6, commitment(id6, alice.account.address, ask6, saltS)],
});
await bob.writeContract({
  address: contractAddress,
  abi: artifact.abi,
  functionName: "commit",
  args: [id6, commitment(id6, bob.account.address, bid6, saltB)],
  value: parseEther("5"),
});
await alice.writeContract({
  address: contractAddress,
  abi: artifact.abi,
  functionName: "reveal",
  args: [id6, ask6, saltS],
});
await bob.writeContract({
  address: contractAddress,
  abi: artifact.abi,
  functionName: "reveal",
  args: [id6, bid6, saltB],
});
await charlie.writeContract({
  address: contractAddress,
  abi: artifact.abi,
  functionName: "settle",
  args: [id6],
});

// Deal 7: Void (no reveal within window)
console.log("- Deal 7: Void (no reveal within window)");
const txD7 = await alice.writeContract({
  address: contractAddress,
  abi: artifact.abi,
  functionName: "open",
  args: [bob.account.address, "Antique Brass Telescope", "19th century maritime instrument", parseEther("2"), 3600n, 3600],
});
await pub.waitForTransactionReceipt({ hash: txD7 });
const id7 = 3n;

await alice.writeContract({
  address: contractAddress,
  abi: artifact.abi,
  functionName: "commit",
  args: [id7, commitment(id7, alice.account.address, parseEther("1.2"), saltS)],
});
await bob.writeContract({
  address: contractAddress,
  abi: artifact.abi,
  functionName: "commit",
  args: [id7, commitment(id7, bob.account.address, parseEther("1.8"), saltB)],
  value: parseEther("2"),
});
// Advance past reveal window (3601s)
await advanceTime(3605);
await charlie.writeContract({
  address: contractAddress,
  abi: artifact.abi,
  functionName: "settle",
  args: [id7],
});

// Deal 8: Cancelled
console.log("- Deal 8: Cancelled");
const txD8 = await alice.writeContract({
  address: contractAddress,
  abi: artifact.abi,
  functionName: "open",
  args: [bob.account.address, "Withdrawn Studio Monitor Pair", "Original packaging intact", parseEther("1.5"), 86400n, 86400],
});
await pub.waitForTransactionReceipt({ hash: txD8 });
const id8 = 4n;

await alice.writeContract({
  address: contractAddress,
  abi: artifact.abi,
  functionName: "cancel",
  args: [id8],
});

// Deal 4: With one reveal in (seller revealed, buyer pending)
console.log("- Deal 4: Reveal in progress (seller revealed, buyer pending)");
const txD4 = await alice.writeContract({
  address: contractAddress,
  abi: artifact.abi,
  functionName: "open",
  args: [bob.account.address, "Mechanical Keyboard Custom CNC", "Lubed switches and brass weight", parseEther("1"), 86400n, 86400],
});
await pub.waitForTransactionReceipt({ hash: txD4 });
const id4 = 5n;

const ask4 = parseEther("0.6");
const bid4 = parseEther("0.85");
await alice.writeContract({
  address: contractAddress,
  abi: artifact.abi,
  functionName: "commit",
  args: [id4, commitment(id4, alice.account.address, ask4, saltS)],
});
await bob.writeContract({
  address: contractAddress,
  abi: artifact.abi,
  functionName: "commit",
  args: [id4, commitment(id4, bob.account.address, bid4, saltB)],
  value: parseEther("1"),
});
await alice.writeContract({
  address: contractAddress,
  abi: artifact.abi,
  functionName: "reveal",
  args: [id4, ask4, saltS],
});

// Deal 3: Both committed (reveal open, neither revealed)
console.log("- Deal 3: Both committed (reveal open)");
const txD3 = await alice.writeContract({
  address: contractAddress,
  abi: artifact.abi,
  functionName: "open",
  args: [bob.account.address, "1st Edition Architecture Folio", "Complete with plates", parseEther("2.5"), 86400n, 86400],
});
await pub.waitForTransactionReceipt({ hash: txD3 });
const id3 = 6n;

await alice.writeContract({
  address: contractAddress,
  abi: artifact.abi,
  functionName: "commit",
  args: [id3, commitment(id3, alice.account.address, parseEther("1.5"), saltS)],
});
await bob.writeContract({
  address: contractAddress,
  abi: artifact.abi,
  functionName: "commit",
  args: [id3, commitment(id3, bob.account.address, parseEther("2.1"), saltB)],
  value: parseEther("2.5"),
});

// Deal 2: With seller committed
console.log("- Deal 2: Seller committed (waiting for buyer)");
const txD2 = await alice.writeContract({
  address: contractAddress,
  abi: artifact.abi,
  functionName: "open",
  args: [bob.account.address, "Handcrafted Oak Drafting Table", "Restored condition", parseEther("4"), 86400n, 86400],
});
await pub.waitForTransactionReceipt({ hash: txD2 });
const id2 = 7n;

await alice.writeContract({
  address: contractAddress,
  abi: artifact.abi,
  functionName: "commit",
  args: [id2, commitment(id2, alice.account.address, parseEther("2.8"), saltS)],
});

// Deal 1: Opened (no commitments yet)
console.log("- Deal 1: Opened (no commitments yet)");
const txD1 = await alice.writeContract({
  address: contractAddress,
  abi: artifact.abi,
  functionName: "open",
  args: [bob.account.address, "Vintage Solid State Amplifier", "Tested working, warm sound", parseEther("1.2"), 86400n, 86400],
});
await pub.waitForTransactionReceipt({ hash: txD1 });
const id1 = 8n;

console.log("\n=======================================================");
console.log("            MIDPOINT LOCAL STACK READY                 ");
console.log("=======================================================");
console.log(`Contract: ${contractAddress}`);
console.log(`RPC:      ${RPC}`);
console.log(`Chain ID: ${CHAIN_ID}`);
console.log("-------------------------------------------------------");
console.log("Role Table (Labelled Wallets):");
console.log(`  Seller (Alice):   ${alice.account.address}`);
console.log(`  Buyer (Bob):      ${bob.account.address}`);
console.log(`  Outsider (Charlie):${charlie.account.address}`);
console.log("-------------------------------------------------------");
console.log("Test Salt Files for Committed Deals:");
console.log(`  Seller Salt (Alice): ${saltS}`);
console.log(`  Buyer Salt (Bob):    ${saltB}`);
console.log("-------------------------------------------------------");
console.log("Deals Seeded:");
console.log("  Deal 1 (ID 8): Opened (no commitments yet)");
console.log("  Deal 2 (ID 7): Seller committed (waiting for buyer)");
console.log("  Deal 3 (ID 6): Both committed (reveal open)");
console.log("  Deal 4 (ID 5): One reveal in (seller revealed ask 0.6 BOT, buyer pending)");
console.log("  Deal 5 (ID 1): Settled with trade at midpoint (rounding visible)");
console.log("  Deal 6 (ID 2): Settled with no deal (ask 4.0 > bid 2.5)");
console.log("  Deal 7 (ID 3): Void (reveal window missed)");
console.log("  Deal 8 (ID 4): Cancelled");
console.log("=======================================================\n");

const envContent = `NEXT_PUBLIC_BOTCHAIN_NETWORK=testnet
NEXT_PUBLIC_BOHR_RPC=${RPC}
NEXT_PUBLIC_CONTRACT_968=${contractAddress}
NEXT_PUBLIC_CONTRACT_ADDRESS=${contractAddress}
NEXT_PUBLIC_DEPLOY_BLOCK_968=1
NEXT_PUBLIC_CHAIN_ID=${CHAIN_ID}
NEXT_PUBLIC_RPC_URL=${RPC}
`;
writeFileSync(".env.local", envContent);
console.log("Wrote .env.local with deployed contract address.");
process.exit(0);
