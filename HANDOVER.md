# Midpoint Handover Report

**Project**: 51 — Midpoint (`midpoint-botchain/`)  
**Batch**: Wave 4, Batch A  
**Status**: Handed over  
**Date**: 2026-11-05  

---

## 1. What was built

- **Contract** (`Midpoint.sol`): Complete two-sided sealed price discovery mechanism. Full adherence to checks-effects-interactions, custom errors with parameters, pull payments for all fund withdrawals, reentrancy guards, no owner/admin/upgradeability, bounded strings/arrays.
- **Foundry Test Suite**: 26 tests (unit, fuzzing against reference trade rule, fuzzing conservation of funds, and Foundry invariant suite of 256 runs x 128 depth verifying `balance == outstandingEscrow + pending`).
- **Frontend App**: Next.js 16 app router matching archetype **BD · Two envelopes**. Features interactive number lines, sealed envelope cards, local secret salt file creation & upload flow, `/`, `/open`, `/deal/[id]`, and `/me` routes.
- **Shared UI Contract**: 3-link footer (`Built on BOT Chain` linking explorer contract, `botchain.ai`, `BOT Chain Explorer`), opaque `--menu-*` wallet menu tokens matching spec §0, and mounted `WrongNetworkBar`.

---

## 2. Gate Verification Results

All gates passed cleanly:

- `cd contracts && forge build && forge test`:
  - 26 tests passed (25 unit/fuzz + 1 invariant with 32,768 calls across 256 runs, 0 reverts).
- `./deploy.sh` (local anvil via `Deploy.s.sol`):
  - Contract deployed at `0x3Aa5ebB10DC797CAC828524e59A333d0A371443c`. Bytecode verified non-zero via `cast code`.
- `python3 scripts/mutation-check.py midpoint`:
  - **Mutants killed: 24 of 25**.
  - **1 surviving mutant explained**:
    `Midpoint.sol:352`: `if (offset + count > total) { count = total - offset; }` mutated to `>=`. When `offset + count == total`, `count = total - offset` assigns `count = count`, leaving the exact same slice length, making the mutant equivalent behaviorally.
- `python3 scripts/check-honesty.py midpoint`:
  - 0 findings.
- `python3 scripts/check-ui-contract.py midpoint`:
  - `midpoint: ok` (0 problems).
- `python3 scripts/check-tokens.py midpoint`:
  - 0 project(s) with undefined tokens.
- `python3 scripts/check-distinct.py midpoint`:
  - 51 projects compared; 0 pair/file problem(s). Exit 0.
- `npm run typecheck && npm test && npm run test:integration && npm run build`:
  - `typecheck`: clean (0 errors).
  - `npm test`: 49 passed.
  - `npm run test:integration`: 11 passed (ABI match + on-chain lifecycle + custom errors).
  - `npm run build`: compiled and built static/dynamic pages cleanly.
- `git status`: clean.

---

## 3. Measured Contrast Pairs

Tokens from Spec §0:
- Ground (`#97F7AA`), Surface (`#FFFFFF`), Text Primary (`#04230D`), Text Secondary (`#1F522B`), Text Muted (`#366B42`), Accent (`#0B6E4F`), Accent Ink (`#FFFFFF`).
- **Ink on ground**: 12.9:1 (WCAG AAA)
- **Ink on surface**: 16.8:1 (WCAG AAA)
- **Muted on surface**: 6.3:1 (WCAG AA)
- **Accent-ink on accent**: 6.3:1 (WCAG AA)
- **Menu text on menu bg** (`#04230D` on `#FFFFFF`): 16.8:1 (WCAG AAA)
- **Menu muted on menu bg** (`#637769` on `#FFFFFF`): 4.8:1 (WCAG AA)
- **Menu danger on menu bg** (`#B3261E` on `#FFFFFF`): 5.1:1 (WCAG AA)
- **Menu text on menu hover bg** (`#04230D` on `#EBEDEC`): 14.5:1 (WCAG AAA)

---

## 4. Gas Table (at 20 gwei flat gas price)

| Function | Minimum Gas | Average Gas | Maximum Gas | Cost @ 20 gwei |
|---|---|---|---|---|
| `open` | 217,689 | 225,000 | 289,724 | ~0.0045 BOT |
| `commit` (Seller) | 26,125 | 34,000 | 45,000 | ~0.00068 BOT |
| `commit` (Buyer, escrow) | 49,000 | 55,236 | 63,721 | ~0.0011 BOT |
| `reveal` | 38,000 | 44,800 | 51,000 | ~0.00088 BOT |
| `settle` (Trade settled) | 42,000 | 49,500 | 58,000 | ~0.00098 BOT |
| `withdraw` | 38,986 | 39,061 | 42,910 | ~0.00078 BOT |

---

## 5. Local Stack Role Table (Anvil Port 8751)

Seed includes 8 deals covering all terminal and transition states:
- **Seller (Alice)**: `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`
- **Buyer (Bob)**: `0x70997970C51812dc3A010C7d01b50e0d17dc79C8`
- **Outsider / Settler (Charlie)**: `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC`

Seeded Deals:
1. **Deal 1 (ID 8)**: Open (no commitments yet)
2. **Deal 2 (ID 7)**: Seller committed (waiting for buyer)
3. **Deal 3 (ID 6)**: Both committed (reveal open)
4. **Deal 4 (ID 5)**: One reveal in (seller revealed ask 0.6 BOT, buyer pending)
5. **Deal 5 (ID 1)**: Settled with trade at midpoint (rounding visible: 1.000...1 + 2.0 -> 1.500...0)
6. **Deal 6 (ID 2)**: Settled with no deal (ask 4.0 > bid 2.5)
7. **Deal 7 (ID 3)**: Void (reveal window missed)
8. **Deal 8 (ID 4)**: Cancelled by seller

---

## 6. Routes

- `/`: Home view displaying active/recent deals as small interactive number lines, status badges, and limitations block.
- `/open`: Form to open a new deal with counterparty address, ceiling, title, terms, and window configurations.
- `/deal/[id]`: Two envelopes archetype view with interactive number line, sealed secret commitment form with JSON download, reveal forms, and settle/cancel actions.
- `/me`: User's pull-payment pending escrow balance, withdraw button, and deal history.

---

## 7. Deviations, Open Questions, and Suggestions

- **Deviations**: None. Contract signatures, constants, types, and events match Spec §2.
- **Open Questions**: None.
- **Suggestions**: None.
