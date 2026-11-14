import type { Metadata } from "next";
import { links, TUSD8_ADDRESS } from "@aevum-kit/aevum";
import { repoUrl } from "@/lib/env";

export const metadata: Metadata = { title: "Docs" };

const HACKATHON_URL = "https://dorahacks.io/hackathon/qday/detail";

const sections = [
  { id: "challenge", label: "The challenge" },
  { id: "quickstart", label: "Quickstart" },
  { id: "network", label: "Network details" },
  { id: "tokens", label: "Get test tokens" },
  { id: "deploy", label: "Deploy to Aevum" },
  { id: "checkout", label: "How the checkout works" },
  { id: "differences", label: "Differences from Ethereum" },
  { id: "commands", label: "Commands" },
  { id: "submitting", label: "Submitting your project" },
  { id: "judging", label: "Judging" },
  { id: "faq", label: "FAQ" },
];

function Code({ children }: { children: string }) {
  return (
    <pre className="code">
      <code>{children.trim()}</code>
    </pre>
  );
}

export default function DocsPage() {
  return (
    <main className="shell">
      <div className="page-head">
        <div>
          <p className="eyebrow">Docs</p>
          <h1>Build on Aevum testnet</h1>
          <p className="lede">
            Everything in this kit, on one page: run it locally, deploy to chain 44005, and the few places where Aevum behaves differently
            from Ethereum.
          </p>
        </div>
      </div>

      <div className="notice warn">
        <strong>Judging counts activity on Aevum.</strong>
        <span>Contracts, payments and transfers must happen on Aevum testnet. Settling only on another chain (for example x402 on Base) doesn&apos;t count.</span>
      </div>

      <div className="docs">
        <nav className="docs-toc" aria-label="On this page">
          <p className="docs-toc-title">On this page</p>
          {sections.map((s) => (
            <a key={s.id} href={`#${s.id}`}>
              {s.label}
            </a>
          ))}
        </nav>

        <article className="docs-body">
          <section id="challenge">
            <h2>Aevum Builder Challenge #1</h2>
            <p>
              Build a payment app with the <strong>tUSD8</strong> stablecoin on Aevum testnet. Fully online, solo or teams of 2 to 4. Every
              line of code must be written during the build window, and every contract runs on Aevum testnet with test tokens only.
            </p>
            <div className="table-wrap">
              <table className="data docs-table">
                <tbody>
                  <tr><th scope="row">Kickoff</th><td>16 Nov 2026, 14:00 HKT (06:00 UTC)</td></tr>
                  <tr><th scope="row">Submission deadline</th><td>11 Dec 2026, 16:00 HKT (08:00 UTC). Late submissions aren&apos;t accepted.</td></tr>
                  <tr><th scope="row">Judging</th><td>12 to 14 Dec 2026</td></tr>
                  <tr><th scope="row">Winners</th><td>15 Dec 2026, 14:00 HKT (06:00 UTC)</td></tr>
                  <tr><th scope="row">Prizes</th><td>$1,500 in USDT: 1st $800, 2nd $500, 3rd $200</td></tr>
                  <tr><th scope="row">Submit at</th><td><a href={HACKATHON_URL} target="_blank" rel="noreferrer">dorahacks.io/hackathon/qday</a></td></tr>
                </tbody>
              </table>
            </div>
            <h3>Tracks</h3>
            <div className="table-wrap">
              <table className="data docs-table wide">
                <thead>
                  <tr><th>Track</th><th>Where this kit helps</th></tr>
                </thead>
                <tbody>
                  <tr><td><strong>Invoice Payments</strong></td><td>An order id is an invoice id. <code>Checkout.paymentOf(orderId)</code> tells you if it&apos;s paid; the <code>Paid</code> event is the receipt.</td></tr>
                  <tr><td><strong>Payroll and Vesting</strong></td><td>Reuse the tUSD8 setup, the chunked event reader and the relayer. Streaming and schedules are yours to build.</td></tr>
                  <tr><td><strong>Crowdfunding</strong></td><td>Pledges are payments to a campaign contract. Start from <code>Checkout.sol</code> and add goals, deadlines and refunds.</td></tr>
                  <tr><td><strong>Confirmation of Payee</strong></td><td>Check who you&apos;re paying before you sign. Aevum testnet has an ERC-8004-style identity registry you can look up.</td></tr>
                  <tr><td><strong>Decentralized Payments</strong></td><td>Gasless checkout (EIP-3009 + relayer) works today. Account abstraction is on its way to this kit.</td></tr>
                  <tr><td><strong>Digital Ownership</strong></td><td>Pay in tUSD8, then mint or transfer the asset in the same contract call.</td></tr>
                  <tr><td><strong>Native AI Assistants</strong></td><td><code>examples/pay-gasless</code> shows a script that signs and pays without a browser, the starting point for an agent.</td></tr>
                  <tr><td><strong>Other business payment tools</strong></td><td>Anything that moves tUSD8 on Aevum for a real business need.</td></tr>
                </tbody>
              </table>
            </div>
            <p>
              Full rules: <a href={HACKATHON_URL} target="_blank" rel="noreferrer">the DoraHacks challenge page</a>. They win over anything on
              this page.
            </p>
          </section>

          <section id="quickstart">
            <h2>Quickstart</h2>
            <p>
              Five minutes, no funds needed. You need Node 22+, pnpm and Foundry (<code>foundryup</code>).
            </p>
            <Code>{`
git clone --recursive ${repoUrl}.git
cd aevum-starter-kit
make install          # Solidity libs + JS packages
make check            # build, Shanghai opcode check, unit tests, fork tests
`}</Code>
            <p>Run the whole app against a local copy of Aevum, with the real tUSD8 and free test balances:</p>
            <Code>{`
# terminal 1: local copy of Aevum testnet on 127.0.0.1:8555 (chain 440050)
make fork

# terminal 2: deploy Checkout and give yourself test money
make deploy-fork                      # prints the Checkout address
make deal TO=<your wallet address>    # 100 tUSD8 + 10 tQDAY, on the fork only

cp web/.env.example web/.env.local
#   NEXT_PUBLIC_NETWORKS=fork,aevum
#   NEXT_PUBLIC_CHECKOUT_FORK=<address from deploy-fork>
#   RELAYER_PRIVATE_KEY=<an anvil test key>   (optional: enables gasless mode)
make dev
`}</Code>
            <p>
              Use the <strong>Local fork / Aevum testnet</strong> switcher in the header. The first time you pick the fork, your wallet offers to
              add &quot;Aevum fork (local)&quot; as a new network. After that, switching is one click, and your real testnet network stays
              untouched.
            </p>
            <div className="card info">
              <h3>Why the fork has its own chain ID (440050)</h3>
              <p className="sub">
                It copies Aevum&apos;s state (accounts, balances, tUSD8), but anything you sign there, such as an EIP-3009 authorization or a
                permit, can&apos;t be replayed on the real testnet, and wallets never mix the two up. <code>make deploy-fork</code> also deploys
                from a random address nobody has the key to, so its contract addresses can&apos;t be claimed on the real testnet.
              </p>
            </div>
            <p>
              Any of anvil&apos;s default accounts works as a local relayer. Those keys are public: use them on local chains only. Want an empty
              chain instead? <code>make anvil</code> + <code>make deploy-local</code> deploys a <code>MockUSD8</code> that anyone can mint with{" "}
              <code>make mint</code>.
            </p>
          </section>

          <section id="network">
            <h2>Network details</h2>
            <div className="table-wrap">
              <table className="data docs-table">
                <tbody>
                  <tr><th scope="row">Network</th><td>QDay Aevum Testnet</td></tr>
                  <tr><th scope="row">Chain ID</th><td><code>44005</code></td></tr>
                  <tr><th scope="row">RPC</th><td><code>https://rpc-test.qday.info</code> (HTTPS only, no WebSocket)</td></tr>
                  <tr><th scope="row">Explorer</th><td><a href={links.explorer} target="_blank" rel="noreferrer">{links.explorer.replace("https://", "")}</a></td></tr>
                  <tr><th scope="row">Gas token</th><td>tQDAY (18 decimals), about 1 gwei. 1 tQDAY covers hundreds of contract calls.</td></tr>
                  <tr><th scope="row">EVM version</th><td><strong>Shanghai</strong></td></tr>
                  <tr><th scope="row">tUSD8</th><td><code className="wrap">{TUSD8_ADDRESS}</code><br />6 decimals, USDC-style: EIP-2612 <code>permit</code>, EIP-3009 signed transfers. EIP-712 domain <code>name: &quot;tUSD8&quot;</code>, <code>version: &quot;2&quot;</code>.</td></tr>
                  <tr><th scope="row">Multicall3</th><td><code className="wrap">0xcA11bde05977b3631167028862bE2a173976CA11</code></td></tr>
                </tbody>
              </table>
            </div>
            <p>
              All of this is exported from <code>@aevum-kit/aevum</code> (<code>packages/aevum/src/chain.ts</code> and <code>contracts.ts</code>).
            </p>
          </section>

          <section id="tokens">
            <h2>Get test tokens</h2>
            <ul>
              <li>
                <strong>Discord faucet (Builder Challenge participants):</strong> in the QDay Discord, verify, then run{" "}
                <code>/faucet &lt;your address&gt;</code> in <code>#faucet</code>. You get 1 tQDAY + 5 tUSD8, once per Discord account.
              </li>
              <li>
                <strong>Web faucet:</strong>{" "}
                <a href={links.faucetWeb} target="_blank" rel="noreferrer">faucet.qday.info</a>. Check the page for its rules.
              </li>
              <li>
                <strong>Local fork:</strong> <code>make deal TO=&lt;address&gt;</code> for unlimited test balances. Nothing leaves your machine.
              </li>
            </ul>
            <p>1 tQDAY is plenty: deploying <code>Checkout</code> costs well under 0.01 tQDAY.</p>
          </section>

          <section id="deploy">
            <h2>Deploy to Aevum testnet</h2>
            <p>Keep your deployer key out of files and shell history. Foundry&apos;s encrypted keystore asks for the key once and a password each time:</p>
            <Code>{`
cast wallet import aevum-deployer --interactive   # paste the key of a TEST wallet
cast wallet address --account aevum-deployer      # fund this address from the faucet

make deploy-aevum ACCOUNT=aevum-deployer          # MERCHANT defaults to the deployer
MERCHANT=0x... make deploy-aevum ACCOUNT=aevum-deployer
`}</Code>
            <p>
              Then set <code>NEXT_PUBLIC_CHECKOUT_AEVUM</code> in <code>web/.env.local</code> and add <code>aevum</code> to{" "}
              <code>NEXT_PUBLIC_NETWORKS</code>.
            </p>
            <div className="notice bad">
              <strong>Use a wallet made only for testing.</strong>
              <span>Never paste a private key into chat, an issue, or a committed file.</span>
            </div>
            <p>
              <strong>Contract verification</strong> on the explorer isn&apos;t working yet, so <code>forge verify-contract</code> fails for now.
              Put your contract addresses and a link to the exact commit in your README and submission instead.
            </p>
          </section>

          <section id="checkout">
            <h2>How the checkout works</h2>
            <p>
              <code>Checkout</code> takes one token and one merchant address. Each <code>orderId</code> (any <code>bytes32</code>) can be paid
              once. The money goes straight to the merchant, and the <code>Paid(orderId, payer, amount)</code> event is the receipt.
            </p>
            <div className="grid-2">
              <div className="card">
                <h3>Standard</h3>
                <p className="sub">Two transactions. The buyer pays gas.</p>
                <Code>{`
buyer → approve(Checkout, amount) → tUSD8
buyer → pay(orderId, amount)      → Checkout
        Checkout → transferFrom   → merchant
`}</Code>
              </div>
              <div className="card">
                <h3>Gasless</h3>
                <p className="sub">One signature. The buyer needs no tQDAY.</p>
                <Code>{`
buyer   signs ReceiveWithAuthorization (off-chain)
relayer → payWithAuthorization(...) → Checkout
          Checkout → receiveWithAuthorization
          tUSD8 → Checkout → merchant
`}</Code>
              </div>
            </div>
            <p>Design choices worth keeping:</p>
            <ul>
              <li>
                The signed <code>nonce</code> must equal <code>Checkout.authorizationNonce(orderId)</code>. That binds the signature to one order, so
                a relayer can&apos;t reuse it to mark a different order as paid.
              </li>
              <li>
                <code>receiveWithAuthorization</code> (not <code>transferWithAuthorization</code>) means only the Checkout can pull the funds, so
                nobody can front-run the signature into a plain transfer.
              </li>
              <li>
                The relayer (<code>web/src/app/api/relay/route.ts</code>) only calls <code>payWithAuthorization</code> on your Checkout, simulates
                first, caps the signature window at 1 hour, and rate-limits per IP.
              </li>
              <li>
                The contract doesn&apos;t know prices. Your app decides what an order costs and checks <code>paymentOf(orderId)</code> before
                delivering.
              </li>
            </ul>
            <p>Code to read, in order:</p>
            <ol>
              <li><code>contracts/src/Checkout.sol</code></li>
              <li><code>contracts/test/Checkout.t.sol</code>: every rule above as a test</li>
              <li><code>contracts/test/fork/AevumFork.t.sol</code>: the same flows against the real tUSD8</li>
              <li><code>examples/src/pay-gasless.ts</code>: sign and relay in about 40 lines</li>
              <li><code>web/src/app/checkout/page.tsx</code>: both modes in the UI</li>
            </ol>
          </section>

          <section id="differences">
            <h2>Differences from Ethereum</h2>
            <div className="table-wrap">
              <table className="data docs-table wide">
                <thead>
                  <tr><th>Topic</th><th>What happens</th><th>What to do</th></tr>
                </thead>
                <tbody>
                  <tr>
                    <td><strong>Shanghai EVM</strong></td>
                    <td>Cancun opcodes (<code>MCOPY</code>, <code>TSTORE</code>/<code>TLOAD</code>, blob ops) don&apos;t exist. Cancun bytecode deploys, then reverts with <code>invalid opcode</code>.</td>
                    <td>Keep <code>evm_version = &quot;shanghai&quot;</code>. <code>make build</code> runs <code>tools/check-shanghai.mjs</code>. Avoid OpenZeppelin&apos;s <code>*Transient</code> contracts.</td>
                  </tr>
                  <tr>
                    <td><strong>anvil hides it</strong></td>
                    <td>Plain <code>anvil --fork-url</code> runs Cancun, so bad bytecode passes local tests.</td>
                    <td>Always add <code>--hardfork shanghai</code> (the Makefile does).</td>
                  </tr>
                  <tr>
                    <td><strong>1,000-block log limit</strong></td>
                    <td><code>eth_getLogs</code> over more than 1,000 blocks fails.</td>
                    <td>Use <code>getLogsChunked</code> from <code>@aevum-kit/aevum</code>, starting from your deploy block.</td>
                  </tr>
                  <tr>
                    <td><strong>No WebSocket RPC</strong></td>
                    <td><code>watchContractEvent</code> over WS won&apos;t connect.</td>
                    <td>Poll over HTTPS (viem&apos;s default for <code>http()</code>).</td>
                  </tr>
                  <tr>
                    <td><strong>Explorer verification</strong></td>
                    <td>Not working yet.</td>
                    <td>Share addresses and the exact commit instead.</td>
                  </tr>
                  <tr>
                    <td><strong>Legacy transactions</strong></td>
                    <td>The kit&apos;s scripts and relayer send legacy (type 0) transactions, like QDay&apos;s own faucet.</td>
                    <td><code>--legacy</code> in <code>forge script</code>, <code>type: &quot;legacy&quot;</code> in viem.</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section id="commands">
            <h2>Commands</h2>
            <Code>{`
make install        Fetch Solidity libs and JS packages
make build          Compile contracts and check they are Shanghai-safe
make test           Unit tests (local, no network)
make test-fork      Tests against the real tUSD8 on a local fork of Aevum
make check          Everything CI runs
make anvil          Empty local chain (31337) with Aevum's EVM rules
make fork           Local copy of Aevum testnet on 127.0.0.1:8555 (chain 440050)
make deploy-local   Deploy MockUSD8 + Checkout to \`make anvil\`
make deploy-fork    Deploy Checkout (real tUSD8) to \`make fork\`
make deploy-aevum   Deploy Checkout to Aevum testnet (ACCOUNT=<keystore>)
make mint           \`make anvil\` only: mint MockUSD8 (TO=, CHECKOUT=, AMOUNT=)
make deal           \`make fork\` only: give TO tUSD8 and tQDAY
make dev            Start the web app
`}</Code>
            <p>
              Examples (copy <code>examples/.env.example</code> to <code>examples/.env</code> first):
            </p>
            <Code>{`
pnpm example check-setup      # chain, block, gas price and balances of ADDRESS
pnpm example pay-gasless      # BUYER_KEY signs, RELAYER_KEY submits
pnpm example read-payments    # every Paid event, 1,000 blocks at a time
`}</Code>
          </section>

          <section id="submitting">
            <h2>Submitting your project</h2>
            <p>What the challenge asks for:</p>
            <ul>
              <li><strong>Open-source code:</strong> a public GitHub repository with clean, readable code.</li>
              <li><strong>Aevum integration:</strong> evidence that your app runs on QDay infrastructure, for example your contracts, ERC-8004 identities or QDay dapps.</li>
              <li><strong>Live deployment:</strong> a working demo, a prototype interface, or a Docker image that runs the app.</li>
              <li><strong>Documentation:</strong> the problem you solve, your architecture, the core workflows, and the technologies you used.</li>
              <li><strong>Demo:</strong> the top 5 projects present a 3 to 5 minute live walkthrough on a video call.</li>
            </ul>
            <p>Make it easy for judges to check your on-chain activity:</p>
            <ul>
              <li>Contract addresses on Aevum testnet (<code>44005</code>), with explorer links.</li>
              <li>A link to the exact commit you deployed.</li>
              <li>A few transaction hashes that show your app working. The receipt and activity pages show them.</li>
            </ul>
            <h3>Before you submit</h3>
            <ul className="checklist">
              <li>Submitted before the deadline. Submit early; the portal gets slow at the end.</li>
              <li>The repo is public and opens in a logged-out browser.</li>
              <li>No private keys, <code>.env</code> files or API keys in the repo or its commit history.</li>
              <li>A stranger can run the project from your README.</li>
              <li>Contracts and payments are on Aevum testnet, not another network.</li>
              <li>The demo link works without logging in.</li>
              <li>Every team member is listed and registered.</li>
            </ul>
          </section>

          <section id="judging">
            <h2>Judging</h2>
            <p>What judges look at. The DoraHacks page has the current list and weights.</p>
            <div className="table-wrap">
              <table className="data docs-table wide">
                <thead>
                  <tr><th>Criterion</th><th>What it means</th></tr>
                </thead>
                <tbody>
                  <tr><td><strong>Innovation</strong></td><td>A new idea, architecture or business model that goes beyond templates (this kit included). Creative use of agents and agentic payments.</td></tr>
                  <tr><td><strong>Technical quality</strong></td><td>Deep, correct platform use (smart accounts, scoped sessions, budgets, expiry). Tested code that handles retries, idempotency and async failures.</td></tr>
                  <tr><td><strong>Real-world utility</strong></td><td>A real problem for a clear audience that would pay. A believable path to merchants, agents and mainnet.</td></tr>
                  <tr><td><strong>User experience</strong></td><td>Fast onboarding, clear status and error messages, works across devices. A pitch that explains the problem.</td></tr>
                  <tr><td><strong>Demo</strong></td><td>A reliable testnet demo with live on-chain activity, showing the main flow and how failures are handled.</td></tr>
                  <tr><td><strong>Documentation</strong></td><td>Setup steps, an architecture diagram, API references, integrations, assumptions, limitations and a roadmap.</td></tr>
                  <tr><td><strong>Safety and controls</strong></td><td>Least-privilege sessions, budget caps, safe key storage, injection protection, audit trails, verifiable receipts, easy revoke.</td></tr>
                </tbody>
              </table>
            </div>
          </section>

          <section id="faq">
            <h2>FAQ</h2>
            <dl className="faq">
              <dt>Do I have to use Checkout?</dt>
              <dd>No. It&apos;s an example. Keep the parts you need (<code>packages/aevum</code>, the chunked log reader, the setup checker) and replace the rest.</dd>
              <dt>Can I use account abstraction?</dt>
              <dd>Aevum has an ERC-4337 bundler (EntryPoint v0.7) and Kernel v3.1 accounts. A smart-account example is coming to this kit.</dd>
              <dt>Can I use Hardhat?</dt>
              <dd>Yes. Set <code>evmVersion: &quot;shanghai&quot;</code> in the Solidity settings, and <code>hardfork: &quot;shanghai&quot;</code> for the Hardhat network.</dd>
              <dt>My transaction fails with invalid opcode.</dt>
              <dd>You compiled for Cancun. See <a href="#differences">Differences from Ethereum</a>.</dd>
              <dt>eth_getLogs errors on a big range.</dt>
              <dd>Split it into 1,000-block chunks with <code>getLogsChunked</code>.</dd>
              <dt>Can I deploy to Sepolia or another testnet?</dt>
              <dd>Not for the challenge. Contracts and payments must be on Aevum testnet (<code>44005</code>).</dd>
              <dt>Can I pay gas in tUSD8?</dt>
              <dd>Not out of the box: there&apos;s no public paymaster that takes tUSD8 yet. Gasless checkout (a relayer pays the tQDAY) is the way to spare users gas today.</dd>
              <dt>Which explorer?</dt>
              <dd><a href={links.explorer} target="_blank" rel="noreferrer">{links.explorer.replace("https://", "")}</a>. explorer.qday.io is mainnet.</dd>
              <dt>Where do I ask for help?</dt>
              <dd>In the QDay Discord&apos;s Builder Challenge channels. The team answers Monday to Friday, 10:00 to 18:00 HKT (02:00 to 10:00 UTC).</dd>
            </dl>
          </section>

          <p className="fine">
            Source and full README: <a href={repoUrl} target="_blank" rel="noreferrer">{repoUrl.replace("https://", "")}</a>. QDay&apos;s general
            guide: <a href={links.docs} target="_blank" rel="noreferrer">{links.docs.replace("https://", "")}</a>.
          </p>
        </article>
      </div>
    </main>
  );
}
