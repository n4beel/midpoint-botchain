import { describe, expect, it } from "vitest";
import { ZERO_COMMIT, actionsFor, DealState } from "../midpoint";

const H = ("0x" + "ab".repeat(32)) as `0x${string}`;
const base = {
  state: DealState.Open,
  commitBy: 1000n,
  revealBy: 0n,
  sellerCommit: ZERO_COMMIT as `0x${string}`,
  buyerCommit: ZERO_COMMIT as `0x${string}`,
  askRevealed: false,
  bidRevealed: false,
};

describe("which actions the screen offers (mirrors Midpoint.sol)", () => {
  it("fresh deal: commit and cancel, no settle", () => {
    const a = actionsFor(base, 500n);
    expect(a.canCommit).toBe(true);
    expect(a.canCancel).toBe(true);
    expect(a.canSettle).toBe(false);
    expect(a.canReveal).toBe(false);
  });

  it("buyer sealed: seller can no longer cancel", () => {
    const a = actionsFor({ ...base, buyerCommit: H }, 500n);
    expect(a.canCancel).toBe(false);
    expect(a.canSettle).toBe(false);
  });

  it("commit window passed with nobody sealed: closing out is offered, committing is not", () => {
    const a = actionsFor(base, 1000n);
    expect(a.canSettle).toBe(true);
    expect(a.settleKind).toBe("expired");
    expect(a.canCommit).toBe(false);
  });

  it("revealing: reveal yes, settle only once both revealed or the window passed", () => {
    const rev = { ...base, state: DealState.Revealing, sellerCommit: H, buyerCommit: H, revealBy: 2000n };
    expect(actionsFor(rev, 1500n)).toMatchObject({ canReveal: true, canSettle: false, canCancel: false });
    expect(actionsFor({ ...rev, askRevealed: true }, 1500n).canSettle).toBe(false);
    expect(actionsFor({ ...rev, askRevealed: true, bidRevealed: true }, 1500n)).toMatchObject({ canSettle: true, settleKind: "match" });
    expect(actionsFor(rev, 2001n)).toMatchObject({ canReveal: false, canSettle: true, settleKind: "expired" });
    // reveal is still allowed on the last second (contract: block.timestamp > revealBy reverts)
    expect(actionsFor(rev, 2000n).canReveal).toBe(true);
  });

  it("settled and void deals offer nothing", () => {
    for (const state of [DealState.Settled, DealState.Void]) {
      const a = actionsFor({ ...base, state, sellerCommit: H, buyerCommit: H, askRevealed: true, bidRevealed: true }, 5000n);
      expect(a).toMatchObject({ canCommit: false, canReveal: false, canSettle: false, canCancel: false });
    }
  });
});
