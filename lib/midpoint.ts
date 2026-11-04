import {
  encodeAbiParameters,
  keccak256,
  parseEther,
  formatEther,
  type Address,
  type Hex,
} from "viem";

export const MAX_TITLE_BYTES = 64;
export const MAX_TERMS_BYTES = 300;
export const MIN_CEILING = parseEther("0.01");
export const MAX_CEILING = parseEther("100000");
export const MIN_WINDOW = 3600n; // 1 hours
export const MAX_WINDOW = 604800n; // 7 days
export const MAX_PAGE = 50;

export enum DealState {
  Open = 0,
  Revealing = 1,
  Settled = 2,
  Void = 3,
}

export interface Deal {
  id: bigint;
  seller: Address;
  buyer: Address;
  state: DealState;
  commitBy: bigint;
  revealBy: bigint;
  revealSecs: number;
  termsBlock: number;
  ceiling: bigint;
  sellerCommit: Hex;
  buyerCommit: Hex;
  ask: bigint;
  bid: bigint;
  askRevealed: boolean;
  bidRevealed: boolean;
  price: bigint;
  title: string;
}

export interface SaltFilePayload {
  dealId: string;
  role: "seller" | "buyer";
  address: string;
  price: string;
  salt: string;
  commitment: string;
  savedAt: string;
}

/**
 * Calculates the deterministic commitment hash according to:
 * keccak256(abi.encode(id, msg.sender, price, salt))
 */
export function commitment(
  id: bigint,
  who: Address,
  price: bigint,
  salt: Hex
): Hex {
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

/**
 * Pure calculation of trade matching and midpoint price.
 */
export function quotePrice(
  ask: bigint,
  bid: bigint
): { traded: boolean; price: bigint } {
  if (bid >= ask) {
    return {
      traded: true,
      price: (ask + bid) / 2n,
    };
  }
  return {
    traded: false,
    price: 0n,
  };
}

/**
 * Generates a cryptographically random 32-byte salt as a hex string.
 */
export function randomSalt(): Hex {
  const bytes = new Uint8Array(32);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    // Fallback for non-browser / node test environments if needed
    const nodeCrypto = require("crypto");
    const buf = nodeCrypto.randomBytes(32);
    return `0x${buf.toString("hex")}` as Hex;
  }
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `0x${hex}` as Hex;
}

/**
 * Creates downloadable salt file payload as JSON string.
 */
export function saltFile(
  dealId: bigint,
  role: "seller" | "buyer",
  address: Address,
  price: bigint,
  salt: Hex,
  commitHash: Hex
): string {
  const payload: SaltFilePayload = {
    dealId: dealId.toString(),
    role,
    address,
    price: formatEther(price),
    salt,
    commitment: commitHash,
    savedAt: new Date().toISOString(),
  };
  return JSON.stringify(payload, null, 2);
}

/**
 * Safely parses and validates a downloaded salt file.
 */
export function parseSaltFile(jsonStr: string): {
  ok: boolean;
  data?: {
    dealId: bigint;
    role: "seller" | "buyer";
    address: Address;
    price: bigint;
    salt: Hex;
    commitment: Hex;
  };
  error?: string;
} {
  try {
    const obj = JSON.parse(jsonStr);
    if (!obj.dealId || !obj.role || !obj.address || !obj.price || !obj.salt) {
      return { ok: false, error: "Missing required fields in salt file." };
    }
    const dealId = BigInt(obj.dealId);
    const price = parseEther(obj.price);
    const salt = obj.salt as Hex;
    const address = obj.address as Address;
    const role = obj.role === "seller" ? "seller" : "buyer";
    const commitHash =
      obj.commitment ?? commitment(dealId, address, price, salt);

    return {
      ok: true,
      data: {
        dealId,
        role,
        address,
        price,
        salt,
        commitment: commitHash,
      },
    };
  } catch (err) {
    return { ok: false, error: "Invalid JSON format." };
  }
}

/**
 * Storage helpers for remembering salt locally if the user chooses.
 */
const STORAGE_PREFIX = "midpoint_deal_salt_";

export function storeSaltLocally(
  dealId: bigint,
  address: Address,
  price: bigint,
  salt: Hex
): boolean {
  try {
    if (typeof window === "undefined" || !window.localStorage) return false;
    const key = `${STORAGE_PREFIX}${dealId.toString()}_${address.toLowerCase()}`;
    const val = JSON.stringify({
      price: formatEther(price),
      salt,
    });
    localStorage.setItem(key, val);
    return true;
  } catch {
    return false;
  }
}

export function getStoredSaltLocally(
  dealId: bigint,
  address: Address
): { price: bigint; salt: Hex } | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    const key = `${STORAGE_PREFIX}${dealId.toString()}_${address.toLowerCase()}`;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return {
      price: parseEther(parsed.price),
      salt: parsed.salt as Hex,
    };
  } catch {
    return null;
  }
}

export function clearStoredSaltLocally(dealId: bigint, address: Address): void {
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    const key = `${STORAGE_PREFIX}${dealId.toString()}_${address.toLowerCase()}`;
    localStorage.removeItem(key);
  } catch {}
}
