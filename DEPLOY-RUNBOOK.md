# TagihanLink — Phase 2 deploy runbook (Aevum testnet)

Everything here is **testnet only** (QDay Aevum, chain ID **44005**, RPC
`https://rpc-test.qday.info`, explorer `https://explorer-test.qday.info`). No real funds
exist anywhere in this flow. Deadline: submit by **Fri 11 Dec 2026, 15:00 WIB**
(internal target 10 Dec).

**Build wallet (deployer + merchant + relayer):**
`0xb064e0f111d3F925104eF3BE4D49e89Fa7dbda33`
Its private key lives ONLY in
`~/workspace/goals/aevum-builder-challenge-entry/hidden_files/build-wallet.txt`
(mode 600). Never paste it into chat, a repo, or a screenshot.

---

## Step 0 — Muhammad claims the Discord faucet (his step, ~3 minutes)

The build wallet starts empty. The Discord faucet gives **1 tQDAY + 5 tUSD8**, once per
Discord account AND once per address — use the exact address above.

1. Join the QDay Discord (invite linked from the starter-kit docs / DoraHacks page).
2. In `#verify`, react ✅ to get the Verified role.
3. In the faucet channel, run `/faucet` with the build wallet address:
   `0xb064e0f111d3F925104eF3BE4D49e89Fa7dbda33`
4. Tell Muse it's done (a screenshot of the faucet confirmation is enough).

(The web faucet at faucet.qday.info is the fallback, but it appears to check for an
Ethereum mainnet balance, which this fresh wallet does not have — Discord is the
reliable route.)

## Step 1 — Verify the claim landed

```bash
export PATH="$HOME/workspace/tools/foundry/bin:$PATH"
RPC=https://rpc-test.qday.info
BW=0xb064e0f111d3F925104eF3BE4D49e89Fa7dbda33
TUSD8=0x456569838f1d43009A91ebA4263147Afd7233483

cast balance $BW --rpc-url $RPC                       # expect ~1 tQDAY (1e18)
cast call $TUSD8 "balanceOf(address)(uint256)" $BW --rpc-url $RPC   # expect 5000000 (5 tUSD8)
```

If both are zero, the faucet claim didn't land — go back to Step 0; do not proceed.

## Step 2 — Deploy TagihanLink to Aevum testnet

The build wallet is deployer **and** merchant (it signs the demo quotes and receives the
demo payments — simplest correct setup for a single-seller demo).

```bash
cd ~/workspace/aevum-tagihanlink/contracts
KEY=$(awk -F'\t' '{print $2}' ~/workspace/goals/aevum-builder-challenge-entry/hidden_files/build-wallet.txt)  # file format: address<TAB>key
forge script script/DeployTagihanLink.s.sol \
  --rpc-url https://rpc-test.qday.info \
  --broadcast --legacy --private-key "$KEY"
unset KEY
```

Notes:
- `--legacy` is required (same as the kit's `make deploy-aevum`).
- `evm_version` is locked to `shanghai` in `contracts/foundry.toml` — never raise it;
  Cancun bytecode reverts on Aevum. `node tools/check-shanghai.mjs contracts/out`
  re-verifies the compiled output.
- Record from the output: **TagihanLink address**, deploy tx hash, and the explorer
  links. Deployment costs <0.01 tQDAY.
- Sanity-check the deployment:
  `cast call <TAGIHANLINK> "merchant()(address)" --rpc-url $RPC` → the build wallet.

## Step 3 — Create and fund a demo buyer wallet

```bash
cast wallet new > ~/workspace/goals/aevum-builder-challenge-entry/hidden_files/buyer-wallet.txt
chmod 600 ~/workspace/goals/aevum-builder-challenge-entry/hidden_files/buyer-wallet.txt
BUYER=$(awk -F'\t' '{print $1}' ~/workspace/goals/aevum-builder-challenge-entry/hidden_files/buyer-wallet.txt)  # file format: address<TAB>key
# Send the buyer 2 tUSD8 from the build wallet (it holds the 5 tUSD8 faucet claim).
KEY=$(awk -F'\t' '{print $2}' ~/workspace/goals/aevum-builder-challenge-entry/hidden_files/build-wallet.txt)  # file format: address<TAB>key
cast send $TUSD8 "transfer(address,uint256)" $BUYER 2000000 \
  --rpc-url $RPC --legacy --private-key "$KEY"
unset KEY
```

The buyer needs **no tQDAY** — the payment is gasless (EIP-3009); the relayer
(the build wallet) pays gas.

## Step 4 — Run the live invoice flow (the demo)

```bash
cd ~/workspace/aevum-tagihanlink
# examples/.env (gitignored — never commit it):
#   RPC_URL=https://rpc-test.qday.info
#   TAGIHANLINK_ADDRESS=<address from Step 2>
#   MERCHANT_KEY=<build wallet key>   (signs the quote)
#   BUYER_KEY=<buyer wallet key>      (signs the EIP-3009 authorization)
#   RELAYER_KEY=<build wallet key>    (submits both transactions, pays gas)
npx -y pnpm@10.8.1 --filter examples pay-invoice        # AMOUNT=1 by default
```

Capture for the submission evidence section:
- `createInvoice` tx hash + explorer link
- `payWithAuthorization` tx hash + explorer link
- Final `invoiceOf` status (PAID) and merchant tUSD8 balance from the script output

Optionally also demo the approve+`pay` path and a cancelled invoice for the video;
the flow above is the required one.

## Step 5 — Submission packaging (before 11 Dec 15:00 WIB)

1. Push this repo (phase-2 commit) as the **public** submission repo (MIT license kept).
   Verify no `.env`, key files, or `hidden_files` content is included — keys live outside
   the repo by design.
2. Fill the "Aevum integration evidence" section of `README.md`: TagihanLink address,
   explorer links, the exact deployed commit link, the Step 4 tx hashes.
3. Record the demo video (merchant signs quote → buyer pays gaslessly → receipt shows
   PAID; show the fake-payment fix: an invoice cannot be paid for less than the quote).
4. Muhammad submits the BUIDL on DoraHacks (hackathon/qday) with the repo + video.
5. If shortlisted Top 5: Muhammad presents live 3–5 min on the Demo Day video call,
   **Tue 15 Dec 2026, 13:00 WIB** (script/talking points prepped by Muse beforehand).

## Troubleshooting

- **Deploy reverts / "Cancun" opcodes:** `evm_version` drifted — check `foundry.toml`
  says `shanghai` and rerun `node tools/check-shanghai.mjs contracts/out`.
- **Faucet gave nothing:** one claim per Discord account AND per address — a second
  claim to the same address silently does nothing. Use a fresh address only if the
  first claim truly failed, and tell Muhammad (his one Discord claim is precious).
- **Explorer shows no verified source:** expected — QDay explorer verification is not
  working yet; the submission standard is addresses + explorer links + commit + tx hashes.
- **Quote rejected (`InvalidQuoteSignature`):** MERCHANT_KEY in `examples/.env` is not
  the contract's merchant, or the quote was signed against a different contract/chain.
