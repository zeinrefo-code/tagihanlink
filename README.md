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

<!-- PHASE 2: fill in after testnet deployment (see DEPLOY-RUNBOOK.md). -->
- TagihanLink contract (chain 44005): _TBD — address + explorer link_
- Token: tUSD8 `0x456569838f1d43009A91ebA4263147Afd7233483`
- Deployed from commit: _TBD — commit link_
- Sample transactions: _TBD — createInvoice tx, payWithAuthorization tx (explorer links)_

## Tech

Solidity 0.8.24 (Shanghai EVM target — Aevum has no Cancun opcodes), Foundry,
OpenZeppelin (EIP-712/ECDSA/SafeERC20), EIP-3009 signed transfers, TypeScript + viem
for the seller/relayer scripts. Testnet only; all demo wallets are throwaways and no
private keys are in this repo.

## License

MIT (same as the starter kit). Solo entry by Muhammad Refo Zein for the Aevum Builder
Challenge #1 on DoraHacks.
