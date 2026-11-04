import { spawn, execSync, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  parseEther,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { midpointAbi } from "@/lib/botchain/abi";
import { commitment, quotePrice } from "@/lib/midpoint";

const PORT = 8651;
const RPC = `http://127.0.0.1:${PORT}`;
const CHAIN_ID = 968;

const localChain = defineChain({
  id: CHAIN_ID,
  name: "anvil",
  nativeCurrency: { name: "Test BOT", symbol: "tBOT", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
});

const ACCOUNTS = [
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80", // 0: Seller (Alice)
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d", // 1: Buyer (Bob)
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a", // 2: Stranger / Observer (Charlie)
].map((k) => privateKeyToAccount(k as Hex));

describe("Midpoint On-Chain Integration Tests", () => {
  let anvil: ChildProcess;
  let contractAddress: Address;

  const publicClient = createPublicClient({
    chain: localChain,
    transport: http(RPC),
  });

  const [seller, buyer, stranger] = ACCOUNTS.map((account) =>
    createWalletClient({
      account,
      chain: localChain,
      transport: http(RPC),
    })
  );

  async function mineBlock() {
    await publicClient.request({
      method: "evm_mine" as any,
      params: [] as any,
    });
  }

  async function advanceTime(seconds: number) {
    await publicClient.request({
      method: "evm_increaseTime" as any,
      params: [seconds] as any,
    });
    await mineBlock();
  }

  beforeAll(async () => {
    try {
      execSync(`fuser -k ${PORT}/tcp 2>/dev/null || true`);
    } catch {}

    anvil = spawn("anvil", [
      "--port",
      String(PORT),
      "--chain-id",
      String(CHAIN_ID),
      "--silent",
    ]);

    for (let i = 0; i < 30; i++) {
      try {
        await publicClient.getBlockNumber();
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 100));
      }
    }

    const artifactPath = join(
      process.cwd(),
      "contracts",
      "out",
      "Midpoint.sol",
      "Midpoint.json"
    );
    const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
    const bytecode = artifact.bytecode.object as Hex;

    const deployHash = await seller.deployContract({
      abi: midpointAbi,
      bytecode,
    });
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: deployHash,
    });
    contractAddress = receipt.contractAddress!;
  });

  afterAll(() => {
    if (anvil) anvil.kill();
  });

  it("client commitment matches contract commitment hashing for fixed vector", async () => {
    const id = 1n;
    const who = seller.account.address;
    const price = parseEther("0.5");
    const salt: Hex =
      "0x1111111111111111111111111111111111111111111111111111111111111111";

    const clientHash = commitment(id, who, price, salt);

    // Open deal 1 to set seller and commit
    const openTx = await seller.writeContract({
      address: contractAddress,
      abi: midpointAbi,
      functionName: "open",
      args: [buyer.account.address, "Deal 1", "Terms", parseEther("1"), 3600n, 3600],
    });
    await publicClient.waitForTransactionReceipt({ hash: openTx });

    const commitTx = await seller.writeContract({
      address: contractAddress,
      abi: midpointAbi,
      functionName: "commit",
      args: [id, clientHash],
    });
    await publicClient.waitForTransactionReceipt({ hash: commitTx });

    const onChainCommitment = await publicClient.readContract({
      address: contractAddress,
      abi: midpointAbi,
      functionName: "commitmentOf",
      args: [id, who],
    });

    expect(onChainCommitment).toBe(clientHash);
  });

  it("quotePrice client matches contract quotePrice view", async () => {
    const ask = parseEther("0.4");
    const bid = parseEther("0.8");

    const [tradedContract, priceContract] = await publicClient.readContract({
      address: contractAddress,
      abi: midpointAbi,
      functionName: "quotePrice",
      args: [ask, bid],
    });

    const clientRes = quotePrice(ask, bid);
    expect(tradedContract).toBe(clientRes.traded);
    expect(priceContract).toBe(clientRes.price);
  });

  it("runs full lifecycle: open -> commit both -> reveal both -> settle -> withdraw", async () => {
    const ceiling = parseEther("2");
    const ask = parseEther("1.2");
    const bid = parseEther("1.6");
    const saltS: Hex =
      "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const saltB: Hex =
      "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

    // 1. Seller opens deal 2
    const openTx = await seller.writeContract({
      address: contractAddress,
      abi: midpointAbi,
      functionName: "open",
      args: [buyer.account.address, "Watch Deal", "Mint condition", ceiling, 3600n, 3600],
    });
    await publicClient.waitForTransactionReceipt({ hash: openTx });
    const id = 2n;

    // 2. Both commit
    const cs = commitment(id, seller.account.address, ask, saltS);
    const cb = commitment(id, buyer.account.address, bid, saltB);

    await seller.writeContract({
      address: contractAddress,
      abi: midpointAbi,
      functionName: "commit",
      args: [id, cs],
    });

    await buyer.writeContract({
      address: contractAddress,
      abi: midpointAbi,
      functionName: "commit",
      args: [id, cb],
      value: ceiling,
    });

    // 3. Both reveal
    await seller.writeContract({
      address: contractAddress,
      abi: midpointAbi,
      functionName: "reveal",
      args: [id, ask, saltS],
    });

    await buyer.writeContract({
      address: contractAddress,
      abi: midpointAbi,
      functionName: "reveal",
      args: [id, bid, saltB],
    });

    // 4. Stranger settles
    const settleTx = await stranger.writeContract({
      address: contractAddress,
      abi: midpointAbi,
      functionName: "settle",
      args: [id],
    });
    await publicClient.waitForTransactionReceipt({ hash: settleTx });

    const deal = await publicClient.readContract({
      address: contractAddress,
      abi: midpointAbi,
      functionName: "dealOf",
      args: [id],
    });

    const expectedPrice = parseEther("1.4"); // (1.2 + 1.6) / 2
    expect(deal.state).toBe(2); // Settled
    expect(deal.price).toBe(expectedPrice);

    const pendingSeller = await publicClient.readContract({
      address: contractAddress,
      abi: midpointAbi,
      functionName: "pending",
      args: [seller.account.address],
    });
    const pendingBuyer = await publicClient.readContract({
      address: contractAddress,
      abi: midpointAbi,
      functionName: "pending",
      args: [buyer.account.address],
    });

    expect(pendingSeller).toBe(expectedPrice);
    expect(pendingBuyer).toBe(ceiling - expectedPrice); // 2.0 - 1.4 = 0.6

    // 5. Withdrawals
    const sellerBalBefore = await publicClient.getBalance({
      address: seller.account.address,
    });
    const w1 = await seller.writeContract({
      address: contractAddress,
      abi: midpointAbi,
      functionName: "withdraw",
    });
    const r1 = await publicClient.waitForTransactionReceipt({ hash: w1 });
    const sellerGas = r1.gasUsed * r1.effectiveGasPrice;
    const sellerBalAfter = await publicClient.getBalance({
      address: seller.account.address,
    });

    expect(sellerBalAfter + sellerGas - sellerBalBefore).toBe(expectedPrice);

    const w2 = await buyer.writeContract({
      address: contractAddress,
      abi: midpointAbi,
      functionName: "withdraw",
    });
    await publicClient.waitForTransactionReceipt({ hash: w2 });

    const pendingBuyerAfter = await publicClient.readContract({
      address: contractAddress,
      abi: midpointAbi,
      functionName: "pending",
      args: [buyer.account.address],
    });
    expect(pendingBuyerAfter).toBe(0n);
  });

  describe("Custom errors verification", () => {
    it("reverts BadBuyer when buyer is zero or seller", async () => {
      await expect(
        publicClient.simulateContract({
          account: seller.account,
          address: contractAddress,
          abi: midpointAbi,
          functionName: "open",
          args: [seller.account.address, "Self", "Terms", parseEther("1"), 3600n, 3600],
        })
      ).rejects.toThrow("BadBuyer");
    });

    it("reverts WrongPayment when buyer sends wrong amount", async () => {
      const openTx = await seller.writeContract({
        address: contractAddress,
        abi: midpointAbi,
        functionName: "open",
        args: [buyer.account.address, "Deal 3", "Terms", parseEther("1"), 3600n, 3600],
      });
      await publicClient.waitForTransactionReceipt({ hash: openTx });
      const id = 3n;

      await expect(
        publicClient.simulateContract({
          account: buyer.account,
          address: contractAddress,
          abi: midpointAbi,
          functionName: "commit",
          args: [id, "0x1111111111111111111111111111111111111111111111111111111111111111"],
          value: parseEther("0.5"),
        })
      ).rejects.toThrow("WrongPayment");
    });

    it("reverts BadReveal when salt or price does not match", async () => {
      const id = 3n;
      const saltS: Hex =
        "0x1212121212121212121212121212121212121212121212121212121212121212";
      const saltB: Hex =
        "0x3434343434343434343434343434343434343434343434343434343434343434";

      const cs = commitment(id, seller.account.address, parseEther("0.5"), saltS);
      const cb = commitment(id, buyer.account.address, parseEther("0.8"), saltB);

      await seller.writeContract({
        address: contractAddress,
        abi: midpointAbi,
        functionName: "commit",
        args: [id, cs],
      });

      await buyer.writeContract({
        address: contractAddress,
        abi: midpointAbi,
        functionName: "commit",
        args: [id, cb],
        value: parseEther("1"),
      });

      // Try revealing with incorrect price
      await expect(
        publicClient.simulateContract({
          account: seller.account,
          address: contractAddress,
          abi: midpointAbi,
          functionName: "reveal",
          args: [id, parseEther("0.55"), saltS],
        })
      ).rejects.toThrow("BadReveal");
    });

    it("reverts NothingToWithdraw when pending is 0", async () => {
      await expect(
        publicClient.simulateContract({
          account: stranger.account,
          address: contractAddress,
          abi: midpointAbi,
          functionName: "withdraw",
        })
      ).rejects.toThrow("NothingToWithdraw");
    });
  });
});
