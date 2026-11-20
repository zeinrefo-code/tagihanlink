# TagihanLink — gasless invoice payments for online sellers

**Aevum Builder Challenge #1 · Invoice Payments track · QDay Aevum testnet (chain 44005)**

TagihanLink lets an online seller send a payment link for a fixed tUSD8 amount. The buyer
pays with **one signature and no gas token** (EIP-3009 via a relayer), and the seller can
trust the "PAID" status — because the price was fixed by the seller's own signature
before the invoice existed on-chain.

Built on the official [Aevum starter kit](https://github.com/qday-io/aevum-starter-kit)
(MIT) — its `Checkout` contract, relayer pattern and web tooling are the foundation; the
kit's original README is preserved as [KIT-README.md](KIT-README.md).

## The problem with the obvious approach

The kit's `Checkout` deliberately "never decides the price": anyone can call
`pay(orderId, 1)` and mark an invoice as paid for 0.000001 tUSD8, front-running the real
buyer (whose payment then reverts with `AlreadyPaid`). The kit's README names this as
its first known limit and suggests the production fix: **have the merchant sign each
quote**. TagihanLink is that fix, implemented as a contract — not just an app-side check
that a compromised or careless front end could skip.

## How it works

```
1. SIGN      Merchant signs a Quote off-chain (EIP-712):
             { orderId, merchant, amount, expiresAt }          — no transaction, no gas
2. REGISTER  Anyone submits createInvoice(orderId, amount, expiresAt, signature).
             The contract recovers the signer and stores the invoice ONLY if the
             merchant signed exactly those terms.        → status: Open
3. PAY       Buyer signs an EIP-3009 ReceiveWithAuthorization for exactly the quoted
             amount (nonce bound to the order id); a relayer submits
             payWithAuthorization. Buyer needs no tQDAY.  → status: Paid
             …or the buyer pays with approve + pay(orderId) — the amount still comes
             from the signed quote, never from the caller.
4. RECEIPT   The Paid(orderId, payer, amount) event (same shape as the kit's Checkout)
             plus invoiceOf(orderId) give an auditable receipt.
```

Security properties, all enforced on-chain and covered by tests:

- **No fake payments.** There is no caller-chosen amount anywhere. Paying an
  unregistered invoice reverts; paying a registered one always moves the full quote.
- **No forged or tampered quotes.** A quote signed by anyone but the merchant, or
  presented with altered amount/order/expiry, fails signature recovery.
- **Quotes expire.** An expired quote can't be registered, and an open invoice can't be
  paid after its expiry.
- **No double payment.** A paid invoice is terminal; both payment paths revert, and the
  buyer's EIP-3009 nonce is bound to the order id so signatures can't be replayed
  across invoices.
- **Merchant can cancel** an open invoice (`cancelInvoice`, merchant only).

## Repository layout

| Path | What |
| --- | --- |
| `contracts/src/TagihanLink.sol` | The invoice contract (quote registry + both payment paths) |
| `contracts/src/Checkout.sol` | The kit's original checkout, kept for comparison |
| `contracts/test/TagihanLink.t.sol` | 17 tests: happy paths, the kit attack, forgery/tampering, expiry, replay |
| `contracts/script/DeployTagihanLink.s.sol` | Deploy script (anvil / fork / Aevum testnet) |
| `packages/aevum/src/quotes.ts` | EIP-712 quote typed data + TagihanLink ABI for apps |
| `examples/src/pay-invoice.ts` | Scripted end-to-end flow: sign quote → register → gasless pay |
| `DEPLOY-RUNBOOK.md` | Step-by-step testnet deployment + demo + submission checklist |
| `web/`, `packages/aevum/` | The kit's Next.js app and chain helpers (foundation) |

## Run it locally

Prereqs: Foundry, Node ≥ 22, pnpm.

```bash
git submodule update --init --recursive

# Contracts: build + full test suite (28 tests, incl. the kit's)
cd contracts && forge build && forge test --no-match-path 'test/fork/*'

# Scripted flow against a local chain:
make anvil                                            # terminal 1 (Shanghai anvil)
cd contracts && forge script script/DeployTagihanLink.s.sol \
  --rpc-url http://127.0.0.1:8545 --broadcast --unlocked \
  --sender 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266   # terminal 2
# then fund a buyer with MockUSD8 and run examples/src/pay-invoice.ts
# with the local .env shown in DEPLOY-RUNBOOK.md / examples/.env.example
```

Verified locally (20 Nov 2026): `forge test` 28/28 pass; bytecode checked Shanghai-safe
(`tools/check-shanghai.mjs`); the scripted flow ran end-to-end on a local anvil —
quote signed → invoice registered → gasless payment → status **PAID**.

## Aevum integration evidence

Deployed and exercised live on QDay Aevum testnet on 20 Nov 2026.

- **TagihanLink contract (chain 44005):**
  [`0x886Cd3bbc06FE895Aaa25350cd58a1ac935850E4`](https://explorer-test.qday.info/address/0x886Cd3bbc06FE895Aaa25350cd58a1ac935850E4)
  — deploy tx
  [`0x1a05c44c…eea99c1`](https://explorer-test.qday.info/tx/0x1a05c44c727dd4d2718b7cbaf018e0f53ab9499dd91c0b709fc779c34eea99c1)
- Token: tUSD8 `0x456569838f1d43009A91ebA4263147Afd7233483`
- Deployed from commit: `a3125327ca97fae02df7fa8bb63245c25fa3fed3`
  ("TagihanLink phase 1: merchant-signed quote invoice payments")
- Merchant / relayer (demo wallet): `0xb064e0f111d3F925104eF3BE4D49e89Fa7dbda33`
  (funded by the QDay Discord faucet:
  [tQDAY](https://explorer-test.qday.info/tx/0xac29fd9895e7dd163797bd0cec78906182ac1aa74a5a56402a7905fb284d4ed6),
  [tUSD8](https://explorer-test.qday.info/tx/0x40cf2253ca622629c1f7c3a192c71e9e5c3cf82d3e0bbdfc8f4def7c009e0fc9))
- Demo buyer (fresh throwaway wallet): `0x57d47A14ea184a561658b7B8D3e5F33BFD1437C2`,
  funded with 2 tUSD8 by the merchant —
  [tx](https://explorer-test.qday.info/tx/0xb858a87d6208a4db1bb5260869e0a9b274c9e220eb0fbb4fa0f16a38ecd86514)

**Live invoice flow** — order `0x6d896e383bba6912a1bfb34356a747f532daf0c68bb97fd104fa22f8a060c68c`,
1 tUSD8:

1. Merchant signed the quote off-chain (no transaction).
2. `createInvoice` (relayer submitted) —
   [tx](https://explorer-test.qday.info/tx/0x2505ff71e053635c0487df43a6c0911038e04e5623ee1fb6afb440403cd89e4d)
3. `payWithAuthorization` (buyer's EIP-3009 signature, relayer paid the gas; the buyer
   holds no tQDAY) —
   [tx](https://explorer-test.qday.info/tx/0xb423b55056c28b1481a8eef94406de810cb78b0d4e02cbbc0b34045bc2b4673c)
4. Readback: `invoiceOf` → amount 1 tUSD8, status **PAID**; `isPaid` → `true`;
   merchant tUSD8 balance 3 → 4, buyer 2 → 1.

**Live attack check:** a registration presenting the merchant's 1 tUSD8 quote with the
amount tampered to 2 tUSD8 was broadcast on purpose — it reverted on-chain with
`InvalidQuoteSignature` and no invoice was created —
[tx](https://explorer-test.qday.info/tx/0x324e5fb519718a53eca75eefbbfa2df796351bd892a19a2d3dde7823a759e170)

## Tech

Solidity 0.8.24 (Shanghai EVM target — Aevum has no Cancun opcodes), Foundry,
OpenZeppelin (EIP-712/ECDSA/SafeERC20), EIP-3009 signed transfers, TypeScript + viem
for the seller/relayer scripts. Testnet only; all demo wallets are throwaways and no
private keys are in this repo.

## License

MIT (same as the starter kit). Solo entry by Muhammad Refo Zein for the Aevum Builder
Challenge #1 on DoraHacks.
