/**
 * Gasless payment, end to end, the way a real app does it:
 *   1. BUYER signs an EIP-3009 ReceiveWithAuthorization (off-chain, free).
 *   2. RELAYER (your backend) submits Checkout.payWithAuthorization and pays the gas.
 *
 *   pnpm example pay-gasless              # pays 1 tUSD8 for a random order id
 *   AMOUNT=2.5 pnpm example pay-gasless
 */
import { createWalletClient, formatUnits, http, keccak256, parseUnits, parseSignature, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { authorizationWindow, checkoutAbi, checkoutTypedData, erc20Abi, txUrl } from "@aevum-kit/aevum";
import { connect, requiredAddress, requiredKey } from "./env";

const { client, chain, rpcUrl } = await connect();
const checkout = requiredAddress("CHECKOUT_ADDRESS");
const buyer = privateKeyToAccount(requiredKey("BUYER_KEY"));
const relayer = createWalletClient({ account: privateKeyToAccount(requiredKey("RELAYER_KEY")), chain, transport: http(rpcUrl) });

const token = await client.readContract({ address: checkout, abi: checkoutAbi, functionName: "token" });
const decimals = await client.readContract({ address: token, abi: erc20Abi, functionName: "decimals" });
const amount = parseUnits(process.env.AMOUNT ?? "1", decimals);
const orderId = keccak256(toHex(`order-${Date.now()}-${Math.random()}`));

// 1. Buyer signs. The nonce ties the signature to this order id.
const nonce = await client.readContract({ address: checkout, abi: checkoutAbi, functionName: "authorizationNonce", args: [orderId] });
const { validAfter, validBefore } = authorizationWindow(600);
const signature = await buyer.signTypedData(
  checkoutTypedData(chain.id, token, { from: buyer.address, to: checkout, value: amount, validAfter, validBefore, nonce }),
);
const { v, r, s } = parseSignature(signature);
console.log(`Buyer ${buyer.address} signed ${formatUnits(amount, decimals)} for order ${orderId}`);

// 2. Relayer submits. Simulate first so a bad signature fails here, not on chain.
const call = {
  account: relayer.account,
  address: checkout,
  abi: checkoutAbi,
  functionName: "payWithAuthorization",
  args: [orderId, buyer.address, amount, validAfter, validBefore, Number(v ?? 27n), r, s],
} as const;
await client.simulateContract(call);
const hash = await relayer.writeContract({ ...call, type: "legacy" });
const receipt = await client.waitForTransactionReceipt({ hash });

console.log(`Relayer ${relayer.account.address} submitted: ${receipt.status} in block ${receipt.blockNumber}`);
console.log(chain.id === 44005 && !/127\.0\.0\.1|localhost/.test(rpcUrl) ? txUrl(hash) : `tx ${hash}`);
