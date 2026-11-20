/**
 * TagihanLink invoice payment, end to end:
 *   1. MERCHANT signs the invoice terms (a "quote") off-chain — order id, amount, expiry.
 *   2. RELAYER registers the invoice on-chain with `createInvoice` (the contract verifies
 *      the merchant's signature; nobody can register terms the merchant didn't sign).
 *   3. BUYER signs an EIP-3009 ReceiveWithAuthorization for exactly the quoted amount.
 *   4. RELAYER submits `payWithAuthorization` and pays the gas. The buyer needs no tQDAY.
 *
 *   pnpm example pay-invoice              # 1 tUSD8 invoice, 1 hour quote
 *   AMOUNT=2.5 QUOTE_TTL=600 pnpm example pay-invoice
 */
import { createWalletClient, formatUnits, http, keccak256, parseUnits, parseSignature, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  aevumTestnet,
  authorizationWindow,
  checkoutTypedData,
  erc20Abi,
  quoteTypedData,
  tagihanLinkAbi,
  txUrl,
} from "@aevum-kit/aevum";
import { connect, requiredAddress, requiredKey } from "./env";

const { client, chain, rpcUrl } = await connect();
const link = requiredAddress("TAGIHANLINK_ADDRESS");
const merchant = privateKeyToAccount(requiredKey("MERCHANT_KEY"));
const buyer = privateKeyToAccount(requiredKey("BUYER_KEY"));
const relayer = createWalletClient({ account: privateKeyToAccount(requiredKey("RELAYER_KEY")), chain, transport: http(rpcUrl) });
const submit = { type: "legacy" } as const; // Aevum (like the kit's flows) uses legacy txs

const token = await client.readContract({ address: link, abi: tagihanLinkAbi, functionName: "token" });
const onChainMerchant = await client.readContract({ address: link, abi: tagihanLinkAbi, functionName: "merchant" });
if (onChainMerchant !== merchant.address) {
  console.error(`MERCHANT_KEY is ${merchant.address} but the contract's merchant is ${onChainMerchant}. Quotes would be rejected.`);
  process.exit(1);
}
const decimals = await client.readContract({ address: token, abi: erc20Abi, functionName: "decimals" });
const amount = parseUnits(process.env.AMOUNT ?? "1", decimals);
const orderId = keccak256(toHex(`invoice-${Date.now()}-${Math.random()}`));
const expiresAt = BigInt(Math.floor(Date.now() / 1000) + Number(process.env.QUOTE_TTL ?? "3600"));

// 1. Merchant signs the quote off-chain (free, no transaction).
const quoteSig = parseSignature(
  await merchant.signTypedData(quoteTypedData(chain.id, link, { orderId, merchant: merchant.address, amount, expiresAt })),
);
console.log(`Merchant ${merchant.address} signed a quote: ${formatUnits(amount, decimals)} tUSD8, order ${orderId}`);

// 2. Relayer registers the invoice. Simulate first so a bad quote fails here, not on chain.
const createCall = {
  account: relayer.account,
  address: link,
  abi: tagihanLinkAbi,
  functionName: "createInvoice",
  args: [orderId, amount, expiresAt, quoteSig.v !== undefined ? Number(quoteSig.v) : 27 + (quoteSig.yParity ?? 0), quoteSig.r, quoteSig.s],
} as const;
await client.simulateContract(createCall);
const createHash = await relayer.writeContract({ ...createCall, ...submit });
await client.waitForTransactionReceipt({ hash: createHash });
console.log(`Invoice registered: ${chain.id === aevumTestnet.id ? txUrl(createHash) : `tx ${createHash}`}`);

// 3. Buyer signs the EIP-3009 authorization for exactly the quoted amount.
const nonce = await client.readContract({ address: link, abi: tagihanLinkAbi, functionName: "authorizationNonce", args: [orderId] });
const { validAfter, validBefore } = authorizationWindow(600);
const authSig = parseSignature(
  await buyer.signTypedData(
    checkoutTypedData(chain.id, token, { from: buyer.address, to: link, value: amount, validAfter, validBefore, nonce }),
  ),
);
console.log(`Buyer ${buyer.address} signed the payment authorization`);

// 4. Relayer submits the payment.
const payCall = {
  account: relayer.account,
  address: link,
  abi: tagihanLinkAbi,
  functionName: "payWithAuthorization",
  args: [orderId, buyer.address, validAfter, validBefore, authSig.v !== undefined ? Number(authSig.v) : 27 + (authSig.yParity ?? 0), authSig.r, authSig.s],
} as const;
await client.simulateContract(payCall);
const payHash = await relayer.writeContract({ ...payCall, ...submit });
const receipt = await client.waitForTransactionReceipt({ hash: payHash });

const invoice = await client.readContract({ address: link, abi: tagihanLinkAbi, functionName: "invoiceOf", args: [orderId] });
const status = ["none", "open", "PAID", "cancelled"][invoice.status] ?? invoice.status;
console.log(`Payment ${receipt.status} in block ${receipt.blockNumber}: ${chain.id === aevumTestnet.id ? txUrl(payHash) : `tx ${payHash}`}`);
console.log(`Invoice status: ${status}; merchant balance: ${formatUnits(await client.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [merchant.address] }), decimals)} tUSD8`);
