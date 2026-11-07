# Midpoint

Both name a price in secret. If they overlap, split the difference.

Midpoint is a peer-to-peer price discovery mechanism on BOT Chain. A seller opens a deal for a designated buyer with a maximum price ceiling. Both parties seal their secret prices off-chain and commit cryptographic hashes on-chain. When both have committed, both reveal. If the buyer's bid meets or exceeds the seller's ask, the transaction settles at the exact midpoint `floor((ask + bid) / 2)`, and any remainder of the buyer's escrowed ceiling is refunded. If the bid is below the ask, the deal voids and escrow is refunded in full.

## What It Cannot Do

- **It moves money only.** It does not check that goods exist, are shipped, or are handed over.
- **Honest prices are not guaranteed.** Both sides can shade their numbers; the midpoint rule does not remove that incentive.
- **With no deal, both numbers become public.** If one party fails to reveal before the reveal window expires, no trade occurs.

## Contract Limits & Constants

All limits are enforced on-chain by `contracts/src/Midpoint.sol`:
- `MAX_TITLE_BYTES = 64`: Deal title length limit in bytes.
- `MAX_TERMS_BYTES = 300`: Terms description limit in bytes.
- `MIN_CEILING = 0.01 ether`: Minimum deal ceiling in BOT.
- `MAX_CEILING = 100_000 ether`: Maximum deal ceiling in BOT.
- `MIN_WINDOW = 1 hours`: Minimum duration for commit and reveal windows.
- `MAX_WINDOW = 7 days`: Maximum duration for commit and reveal windows.
- `MAX_PAGE = 50`: Maximum results per pagination query.

## Gas Table (at 20 gwei flat gas price)

| Function | Gas (Average) | BOT Cost @ 20 gwei |
|---|---|---|
| `open` | ~225,000 | ~0.0045 BOT |
| `commit` (Seller) | ~34,000 | ~0.00068 BOT |
| `commit` (Buyer, with escrow) | ~55,000 | ~0.0011 BOT |
| `reveal` | ~44,000 | ~0.00088 BOT |
| `settle` (Trade settled) | ~49,000 | ~0.00098 BOT |
| `withdraw` | ~39,000 | ~0.00078 BOT |

## Running Locally

1. Start the local stack with anvil and seed states:
```bash
node scripts/local-stack.mjs
```

2. Start the development server:
```bash
npm run dev
```

Visit `http://localhost:3000` to interact with seeded deals.

## Contract Deployments

- **Bohr Testnet (Chain ID 968)**: `0xe3a3A33A0125474eDa5108451a4F89623033355F`
- **BOT Chain Explorer**: [https://scan.botchain.ai](https://scan.botchain.ai)
