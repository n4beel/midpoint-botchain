import { formatEther } from "viem";

/**
 * Human-readable error messages for Midpoint contract custom errors and client errors.
 */
export function describeError(err: unknown): string {
  if (!err) return "An unknown error occurred.";

  const errStr = typeof err === "object" ? JSON.stringify(err) : String(err);
  const msg = err instanceof Error ? err.message : String(err);

  // User rejected in wallet
  if (
    msg.includes("User rejected") ||
    msg.includes("User denied") ||
    errStr.includes("UserRejectedRequestError")
  ) {
    return "Transaction cancelled in wallet.";
  }

  // Network mismatch
  if (
    msg.includes("ConnectorChainMismatchError") ||
    errStr.includes("ConnectorChainMismatchError") ||
    msg.includes("chain mismatch")
  ) {
    return "Your wallet is on a different network. Switch it to BOT Chain, then try again.";
  }

  // Custom errors from Midpoint contract
  if (msg.includes("BadBuyer") || errStr.includes("BadBuyer")) {
    return "The buyer address is invalid or cannot be yourself.";
  }
  if (msg.includes("BadText") || errStr.includes("BadText")) {
    return "The title or terms exceed the maximum allowed length.";
  }
  if (msg.includes("BadParams") || errStr.includes("BadParams")) {
    return "The ceiling or window durations are outside allowable limits.";
  }
  if (msg.includes("NotFound") || errStr.includes("NotFound")) {
    return "Deal not found.";
  }
  if (msg.includes("CommitClosed") || errStr.includes("CommitClosed")) {
    return "The commitment window for this deal is closed.";
  }
  if (msg.includes("NotAParty") || errStr.includes("NotAParty")) {
    return "You are not a party (seller or buyer) to this deal.";
  }
  if (msg.includes("AlreadyCommitted") || errStr.includes("AlreadyCommitted")) {
    return "You have already committed a sealed price.";
  }
  if (msg.includes("ZeroCommitment") || errStr.includes("ZeroCommitment")) {
    return "Commitment hash cannot be zero.";
  }
  if (msg.includes("WrongPayment") || errStr.includes("WrongPayment")) {
    // Try to extract expected amount if present
    const match =
      msg.match(/expected:\s*(\d+)/i) ||
      msg.match(/WrongPayment\((\d+)\)/i) ||
      errStr.match(/"expected":\s*"?(\d+)"?/i) ||
      errStr.match(/WrongPayment\((\d+)\)/i);
    if (match && (match[1] || match[2])) {
      const valStr = match[1] || match[2];
      const ethVal = formatEther(BigInt(valStr));
      return `The buyer locks the ceiling: ${ethVal} BOT.`;
    }
    return "Payment amount does not match the required escrow.";
  }
  if (msg.includes("RevealClosed") || errStr.includes("RevealClosed")) {
    return "The reveal window is closed.";
  }
  if (msg.includes("AlreadyRevealed") || errStr.includes("AlreadyRevealed")) {
    return "You have already revealed your price.";
  }
  if (msg.includes("BadReveal") || errStr.includes("BadReveal")) {
    return "That price and salt don't match what you sealed.";
  }
  if (msg.includes("AboveCeiling") || errStr.includes("AboveCeiling")) {
    const match =
      msg.match(/ceiling:\s*(\d+)/i) ||
      msg.match(/AboveCeiling\((\d+)\)/i) ||
      errStr.match(/"ceiling":\s*"?(\d+)"?/i) ||
      errStr.match(/AboveCeiling\((\d+)\)/i);
    if (match && (match[1] || match[2])) {
      const valStr = match[1] || match[2];
      const ethVal = formatEther(BigInt(valStr));
      return `A price can be at most ${ethVal} BOT.`;
    }
    return "A price can be at most the deal ceiling.";
  }
  if (msg.includes("BuyerCommitted") || errStr.includes("BuyerCommitted")) {
    return "The buyer has already committed; the deal cannot be cancelled.";
  }
  if (msg.includes("NotSeller") || errStr.includes("NotSeller")) {
    return "Only the seller can cancel this deal.";
  }
  if (msg.includes("NotSettleable") || errStr.includes("NotSettleable")) {
    return "This deal is not ready to settle yet.";
  }
  if (msg.includes("AlreadySettled") || errStr.includes("AlreadySettled")) {
    return "This deal has already settled.";
  }
  if (msg.includes("NothingToWithdraw") || errStr.includes("NothingToWithdraw")) {
    return "You have no pending balance to withdraw.";
  }
  if (msg.includes("TransferFailed") || errStr.includes("TransferFailed")) {
    return "BOT transfer failed.";
  }
  if (msg.includes("ReentrancyGuard") || errStr.includes("ReentrancyGuard")) {
    return "Reentrant call blocked.";
  }

  // Fallback for short error string
  const shortMsg = (err as any).shortMessage || msg.slice(0, 100);
  return `The network refused this transaction. ${shortMsg}`;
}
