import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as midpoint from "../midpoint";

const SRC = join(__dirname, "..", "..", "contracts", "src");

function solidityConstants(): Map<string, bigint> {
  const found = new Map<string, bigint>();
  for (const file of readdirSync(SRC).filter((f) => f.endsWith(".sol"))) {
    const src = readFileSync(join(SRC, file), "utf8");
    // Plain integer constants
    for (const m of src.matchAll(/constant\s+([A-Z][A-Z0-9_]*)\s*=\s*(\d+)\s*;/g)) {
      found.set(m[1], BigInt(m[2]));
    }
  }
  return found;
}

describe("the contract's limits and this app's copy of them", () => {
  const onChain = solidityConstants();

  it("found constants in the contract to check against", () => {
    expect(onChain.size).toBeGreaterThan(0);
  });

  it("agrees on MAX_TITLE_BYTES, MAX_TERMS_BYTES, and MAX_PAGE", () => {
    expect(BigInt(midpoint.MAX_TITLE_BYTES)).toBe(onChain.get("MAX_TITLE_BYTES"));
    expect(BigInt(midpoint.MAX_TERMS_BYTES)).toBe(onChain.get("MAX_TERMS_BYTES"));
    expect(BigInt(midpoint.MAX_PAGE)).toBe(onChain.get("MAX_PAGE"));
  });

  it("agrees on ceiling and window bounds", () => {
    expect(midpoint.MIN_CEILING).toBe(10000000000000000n); // 0.01 ether
    expect(midpoint.MAX_CEILING).toBe(100000000000000000000000n); // 100,000 ether
    expect(midpoint.MIN_WINDOW).toBe(3600n);
    expect(midpoint.MAX_WINDOW).toBe(604800n);
  });
});
