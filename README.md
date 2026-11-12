# Aevum Starter Kit

Everything you need to build and demo a stablecoin app on **QDay Aevum testnet** (chain `44005`):

- **Contracts (Foundry):** `Checkout.sol`, a minimal pay-per-order contract with two payment modes, plus tests that run against the real tUSD8 on a local fork.
- **Web app (Next.js):** a setup checker, a checkout with standard and gasless payments, on-chain receipts and an activity feed. Connect with MetaMask, Rabby, any browser wallet, or WalletConnect.
- **TypeScript examples:** sign and relay a gasless payment, read events past the 1,000-block log limit, and check a wallet's setup.
- **`@aevum-kit/aevum`:** chain config, ABIs and helpers shared by all of the above. Import it in your own code.

Fork it, rename `Checkout` into whatever you're building (an invoice, a ticket, payroll, a pledge), and keep the plumbing.

> **Judging counts activity on Aevum.** Contracts, payments and transfers must happen on Aevum testnet. Settling only on another chain (for example x402 on Base) doesn't count.

---

## Contents

- [Quickstart (5 minutes, no funds needed)](#quickstart-5-minutes-no-funds-needed)
- [Network details](#network-details)
- [Get test tokens](#get-test-tokens)
- [Deploy to Aevum testnet](#deploy-to-aevum-testnet)
- [How the checkout works](#how-the-checkout-works)
- [Things that differ from Ethereum](#things-that-differ-from-ethereum)
- [Project layout](#project-layout)
- [Commands](#commands)
- [Submitting your project](#submitting-your-project)
- [FAQ](#faq)

---

## Quickstart (5 minutes, no funds needed)

You need [Node 22+](https://nodejs.org), [pnpm](https://pnpm.io/installation) and [Foundry](https://book.getfoundry.sh/getting-started/installation) (`foundryup`).

```bash
git clone --recursive https://github.com/qday-io/aevum-starter-kit.git
cd aevum-starter-kit
make install          # Solidity libs + JS packages
make check            # build, Shanghai opcode check, unit tests, fork tests
```

Run the whole app against a **local copy of Aevum**, with the real tUSD8 and free test balances:

```bash
# terminal 1: local fork of Aevum testnet on 127.0.0.1:8545
make fork

# terminal 2: deploy Checkout and give yourself test money
make deploy-fork                      # prints the Checkout address
make deal TO=<your wallet address>    # 100 tUSD8 + 10 tQDAY, on the fork only

cp web/.env.example web/.env.local
#   NEXT_PUBLIC_CHAIN=fork
#   NEXT_PUBLIC_CHECKOUT_ADDRESS=<address from deploy-fork>
#   RELAYER_PRIVATE_KEY=<a test key, see below>   (optional: enables gasless mode)
make dev                              # http://localhost:3000
```

In your wallet, add a network with RPC `http://127.0.0.1:8545` and chain ID `44005` (the app's **Switch network** button does this for you).

For a local relayer, any of anvil's [default test accounts](https://book.getfoundry.sh/anvil/#getting-started) works. Those keys are public: use them on local chains only.

Want an empty chain instead of a fork? `make anvil` + `make deploy-local` deploys a `MockUSD8` (same decimals, EIP-712 domain and EIP-3009 functions as tUSD8) that anyone can mint with `make mint`.

---

## Network details

| | |
|---|---|
| Network | QDay Aevum Testnet |
| Chain ID | `44005` |
| RPC | `https://rpc-test.qday.info` (HTTPS only, no WebSocket) |
| Explorer | https://explorer-test.qday.info |
| Gas token | tQDAY (18 decimals) |
| Gas price | about 1 gwei. 1 tQDAY covers hundreds of contract calls. |
| EVM version | **Shanghai** |
| tUSD8 | [`0x456569838f1d43009A91ebA4263147Afd7233483`](https://explorer-test.qday.info/address/0x456569838f1d43009A91ebA4263147Afd7233483), 6 decimals, USDC-style (EIP-2612 `permit`, EIP-3009 signed transfers), EIP-712 domain `name: "tUSD8"`, `version: "2"` |
| Multicall3 | `0xcA11bde05977b3631167028862bE2a173976CA11` |

All of this is in [`packages/aevum/src/chain.ts`](packages/aevum/src/chain.ts) and [`contracts.ts`](packages/aevum/src/contracts.ts).

---

## Get test tokens

- **Discord faucet (for Builder Challenge participants):** in the QDay Discord, verify, then run `/faucet <your address>` in `#faucet`. You get **1 tQDAY + 5 tUSD8**, once per Discord account.
- **Web faucet:** https://faucet.qday.info. Check the page for its rules.
- **Local fork:** `make deal TO=<address>` for unlimited test balances. Nothing leaves your machine.

1 tQDAY is plenty for development: deploying `Checkout` costs well under 0.01 tQDAY.

---

## Deploy to Aevum testnet

Keep your deployer key out of files and shell history. Foundry's encrypted keystore asks for the key once and a password each time:

```bash
cast wallet import aevum-deployer --interactive   # paste the key of a TEST wallet
cast wallet address --account aevum-deployer      # fund this address from the faucet

make deploy-aevum ACCOUNT=aevum-deployer          # uses real tUSD8; MERCHANT defaults to the deployer
# MERCHANT=0x... make deploy-aevum ACCOUNT=aevum-deployer   to send payments elsewhere
```

Then set `NEXT_PUBLIC_CHAIN=aevum` and `NEXT_PUBLIC_CHECKOUT_ADDRESS` in `web/.env.local`.

> Use a wallet made only for testing. Never paste a private key into chat, an issue, or a committed file.

**Contract verification:** the explorer's verifier isn't working yet, so `forge verify-contract` will fail for now. Put your contract addresses and a link to the source (the exact commit) in your README and submission instead. The command, for when it's back:

```bash
forge verify-contract <address> src/Checkout.sol:Checkout --chain-id 44005 \
  --verifier blockscout --verifier-url https://explorer-test.qday.info/api/
```

---

## How the checkout works

`Checkout` takes one token and one merchant address. Each `orderId` (any `bytes32`) can be paid once; the money goes straight to the merchant and the `Paid(orderId, payer, amount)` event is the receipt.

**Standard** (two transactions, buyer pays gas):

```
buyer ── approve(Checkout, amount) ──▶ tUSD8
buyer ── pay(orderId, amount) ───────▶ Checkout ── transferFrom ──▶ merchant
```

**Gasless** (one signature, the buyer needs no tQDAY):

```
buyer  ── signs ReceiveWithAuthorization(from, to=Checkout, value, validBefore, nonce) ── off-chain
relayer ── payWithAuthorization(orderId, from, amount, …, v, r, s) ──▶ Checkout
           Checkout ── receiveWithAuthorization ──▶ tUSD8 ──▶ Checkout ──▶ merchant
```

Design choices you can reuse:

- The signed `nonce` must equal `Checkout.authorizationNonce(orderId)`. That binds the signature to one order, so a relayer can't reuse it to mark a different order as paid.
- `receiveWithAuthorization` (not `transferWithAuthorization`) means only the Checkout can pull the funds, so nobody can front-run the signature into a plain transfer.
- The web relayer ([`web/src/app/api/relay/route.ts`](web/src/app/api/relay/route.ts)) only calls `payWithAuthorization` on your Checkout, simulates first, caps the signature window at 1 hour, and rate-limits per IP. Keep those rails if you build on it.
- The contract doesn't know prices. Your app decides what an order costs and checks `paymentOf(orderId)` before delivering.

Code to read, in order:

1. [`contracts/src/Checkout.sol`](contracts/src/Checkout.sol)
2. [`contracts/test/Checkout.t.sol`](contracts/test/Checkout.t.sol): every rule above as a test
3. [`contracts/test/fork/AevumFork.t.sol`](contracts/test/fork/AevumFork.t.sol): the same flows against the real tUSD8
4. [`examples/src/pay-gasless.ts`](examples/src/pay-gasless.ts): sign + relay in about 40 lines
5. [`web/src/app/checkout/page.tsx`](web/src/app/checkout/page.tsx): both modes in the UI

---

## Things that differ from Ethereum

| | What happens | What to do |
|---|---|---|
| **Shanghai EVM** | Cancun opcodes (`MCOPY`, `TSTORE`/`TLOAD`, blob ops) don't exist. Code compiled for Cancun deploys fine, then reverts with `invalid opcode`. | Keep `evm_version = "shanghai"` in `foundry.toml` (already set). `make build` runs [`tools/check-shanghai.mjs`](tools/check-shanghai.mjs) to catch it. Don't use OpenZeppelin's `*Transient` contracts. |
| **anvil hides it** | A plain `anvil --fork-url` runs Cancun, so bad bytecode passes local tests. | Always add `--hardfork shanghai` (the Makefile does). |
| **1,000-block log limit** | `eth_getLogs` over more than 1,000 blocks fails. | Use `getLogsChunked` from `@aevum-kit/aevum`. Store your deploy block and start from there. |
| **No WebSocket RPC** | `watchContractEvent` over WS won't connect. | Poll over HTTPS (viem's default for `http()` transports). |
| **Explorer verification** | Not working yet. | See [Deploy](#deploy-to-aevum-testnet). |
| **Legacy transactions** | The kit's scripts and relayer send legacy (type 0) transactions, the same as QDay's own faucet. | `--legacy` in `forge script`, `type: "legacy"` in viem. |

---

## Project layout

```
contracts/            Foundry project
  src/Checkout.sol      the example contract
  src/mocks/MockUSD8.sol  local tUSD8 stand-in (anyone can mint)
  test/                 unit tests + test/fork (real tUSD8 on a fork)
  script/Deploy.s.sol   deploys to anvil, a fork or Aevum
packages/aevum/       chain config, ABIs, EIP-3009 typed data, getLogsChunked
web/                  Next.js app (wagmi + RainbowKit)
  src/app/page.tsx        Setup check
  src/app/checkout/       standard + gasless checkout
  src/app/receipts/       receipt read from the chain
  src/app/activity/       Paid events, read in 1,000-block chunks
  src/app/api/relay/      gasless relayer (server-side)
  src/app/globals.css     every color and font; edit to rebrand
examples/             runnable TypeScript scripts
tools/check-shanghai.mjs  fails the build on Cancun-only opcodes
```

---

## Commands

```
make install        Fetch Solidity libs and JS packages
make build          Compile contracts and check they are Shanghai-safe
make test           Unit tests (local, no network)
make test-fork      Tests against the real tUSD8 on a local fork of Aevum
make check          Everything CI runs
make anvil          Empty local chain (31337) with Aevum's EVM rules
make fork           Local copy of Aevum testnet (44005) on 127.0.0.1:8545
make deploy-local   Deploy MockUSD8 + Checkout to `make anvil`
make deploy-fork    Deploy Checkout (real tUSD8) to `make fork`
make deploy-aevum   Deploy Checkout to Aevum testnet (ACCOUNT=<keystore>)
make mint           `make anvil` only: mint MockUSD8 (TO=, CHECKOUT=, AMOUNT=)
make deal           `make fork` only: give TO tUSD8 and tQDAY
make dev            Start the web app on http://localhost:3000
```

Examples (copy `examples/.env.example` to `examples/.env` first):

```bash
pnpm example check-setup      # chain, block, gas price and balances of ADDRESS
pnpm example pay-gasless      # BUYER_KEY signs, RELAYER_KEY submits
pnpm example read-payments    # every Paid event, 1,000 blocks at a time
```

---

## Submitting your project

Make it easy for judges to check your on-chain activity:

- Contract addresses on Aevum testnet (`44005`), with explorer links.
- A link to the exact commit you deployed.
- A few transaction hashes that show your app working (the receipt page and the activity page show them).
- A short demo video or a live URL.

Read the official rules on the DoraHacks challenge page. They win over anything here.

---

## FAQ

**Do I have to use `Checkout`?** No. It's an example. Keep the parts you need (`packages/aevum`, the chunked log reader, the setup checker) and replace the rest.

**Can I use account abstraction?** Aevum has an ERC-4337 bundler (EntryPoint v0.7) and Kernel v3.1 accounts. A smart-account example is coming to this kit.

**Can I use Hardhat?** Yes. Set `evmVersion: "shanghai"` in the Solidity settings, and `hardfork: "shanghai"` for the Hardhat network.

**My transaction fails with `invalid opcode`.** You compiled for Cancun. See [Things that differ from Ethereum](#things-that-differ-from-ethereum).

**`eth_getLogs` errors on a big range.** Split it into 1,000-block chunks with `getLogsChunked`.

**Where do I ask for help?** In the QDay Discord's Builder Challenge channels.

---

MIT licensed. See [LICENSE](LICENSE).
