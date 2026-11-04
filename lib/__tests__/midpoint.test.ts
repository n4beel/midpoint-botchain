import { describe, expect, it } from "vitest";
import { parseEther, type Address, type Hex } from "viem";
import {
  commitment,
  quotePrice,
  randomSalt,
  saltFile,
  parseSaltFile,
} from "../midpoint";
import { describeError } from "../errors";

describe("midpoint pure logic unit tests", () => {
  const seller: Address = "0x1111111111111111111111111111111111111111";
  const buyer: Address = "0x2222222222222222222222222222222222222222";
  const fixedSalt: Hex =
    "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";

  it("calculates deterministic commitment hash", () => {
    const hash1 = commitment(1n, seller, parseEther("0.5"), fixedSalt);
    const hash2 = commitment(1n, seller, parseEther("0.5"), fixedSalt);
    expect(hash1).toBe(hash2);
    expect(hash1.startsWith("0x")).toBe(true);
    expect(hash1.length).toBe(66);

    // Differentiates party, price, deal id
    const hashDiffParty = commitment(1n, buyer, parseEther("0.5"), fixedSalt);
    const hashDiffPrice = commitment(1n, seller, parseEther("0.6"), fixedSalt);
    const hashDiffDeal = commitment(2n, seller, parseEther("0.5"), fixedSalt);

    expect(hash1).not.toBe(hashDiffParty);
    expect(hash1).not.toBe(hashDiffPrice);
    expect(hash1).not.toBe(hashDiffDeal);
  });

  it("quotePrice calculates midpoint and trade condition", () => {
    // Bid < ask -> no trade
    const noDeal = quotePrice(parseEther("0.7"), parseEther("0.5"));
    expect(noDeal.traded).toBe(false);
    expect(noDeal.price).toBe(0n);

    // Bid == ask -> trade at exact price
    const exact = quotePrice(parseEther("0.5"), parseEther("0.5"));
    expect(exact.traded).toBe(true);
    expect(exact.price).toBe(parseEther("0.5"));

    // Bid > ask -> trade at midpoint
    const trade = quotePrice(parseEther("0.4"), parseEther("0.8"));
    expect(trade.traded).toBe(true);
    expect(trade.price).toBe(parseEther("0.6"));

    // Midpoint rounds down on odd sum
    const odd = quotePrice(101n, 102n);
    expect(odd.traded).toBe(true);
    expect(odd.price).toBe(101n);
  });

  it("generates a random 32-byte salt", () => {
    const s1 = randomSalt();
    const s2 = randomSalt();
    expect(s1.startsWith("0x")).toBe(true);
    expect(s1.length).toBe(66);
    expect(s2.startsWith("0x")).toBe(true);
    expect(s1).not.toBe(s2);
  });

  it("encodes and parses saltFile correctly", () => {
    const price = parseEther("0.75");
    const commitHash = commitment(42n, buyer, price, fixedSalt);
    const jsonStr = saltFile(42n, "buyer", buyer, price, fixedSalt, commitHash);

    const parsed = parseSaltFile(jsonStr);
    expect(parsed.ok).toBe(true);
    expect(parsed.data?.dealId).toBe(42n);
    expect(parsed.data?.role).toBe("buyer");
    expect(parsed.data?.address).toBe(buyer);
    expect(parsed.data?.price).toBe(price);
    expect(parsed.data?.salt).toBe(fixedSalt);
    expect(parsed.data?.commitment).toBe(commitHash);
  });

  it("handles corrupted or invalid salt files gracefully", () => {
    expect(parseSaltFile("not json").ok).toBe(false);
    expect(parseSaltFile("{}").ok).toBe(false);
    expect(parseSaltFile(JSON.stringify({ dealId: "1" })).ok).toBe(false);
  });

  it("describeError translates custom errors into clear sentences", () => {
    expect(describeError(new Error("BadBuyer()"))).toBe(
      "The buyer address is invalid or cannot be yourself."
    );
    expect(describeError(new Error("BadReveal()"))).toBe(
      "That price and salt don't match what you sealed."
    );
    expect(describeError(new Error("WrongPayment(1000000000000000000)"))).toBe(
      "The buyer locks the ceiling: 1 BOT."
    );
    expect(describeError(new Error("AboveCeiling(1000000000000000000)"))).toBe(
      "A price can be at most 1 BOT."
    );
    expect(describeError(new Error("User rejected the request"))).toBe(
      "Transaction cancelled in wallet."
    );
  });
});
