# Midpoint Architecture Decisions

## 1. Context and Problem Statement
Midpoint is a two-sided sealed price discovery mechanism on BOT Chain. A seller opens a deal for a buyer specifying a public ceiling price, and both parties seal their prices in hash commitments (`keccak256(abi.encode(id, msg.sender, price, salt))`). When both parties commit, both reveal. If buyer's bid >= seller's ask, the transaction settles at the floor midpoint: `(ask + bid) / 2`.

## 2. Key Design Decisions

### 2.1 Why the Buyer Escrows the Full Ceiling Up Front
- **Decision**: The buyer is required to send `deal.ceiling` in native BOT when calling `commit()`.
- **Alternative Considered**: Buyer escrows only their secret bid amount when committing.
- **Why Escrow Full Ceiling**: If the buyer only escrowed their bid, the commitment would leak information about the buyer's bid on-chain via `msg.value` before the reveal phase, defeating the sealed bid privacy guarantee. By locking the fixed public ceiling, no price information is leaked. If the settled price is lower than the ceiling, the excess `(ceiling - price)` is refunded in full to the buyer. If the deal voids or does not trade, the full ceiling is refunded.

### 2.2 Pull Payment Escrow Model
- **Decision**: All payouts and refunds credit `pending[address]`, and parties withdraw via `withdraw()`.
- **Alternative Considered**: Direct transfer of BOT to seller and buyer during `settle()`.
- **Why Pull Payments**: Prevents reentrancy and ensures that any malicious contract (reverting on receive or running out of gas) cannot block `settle()` for the other party. Following CEI and checks, pull payments isolate external transfers completely.

### 2.3 Single Fixed Entry Contract Without Upgradeability or Admin
- **Decision**: No owner, pause, proxy, or admin roles exist in `Midpoint.sol`.
- **Why**: Behavior is immutable and trustless.

### 2.4 Struct Packing
- Packed storage variables into explicit slots (addresses with uint32/bool/enums, uint64 timestamps with uint128 prices) to save storage slots on EVM writes.

## 3. Risks Accepted & Mitigations
- **Unrevealed party**: If either party fails to reveal before `revealBy`, the deal cannot trade and voids. The buyer is refunded their escrowed ceiling.
- **Shading behavior**: As stated in the limitations block, honest prices are not game-theoretically enforced; parties may shade bids around expected distributions.
