import type { Address, Hex } from "viem";
import { tusd8Domain } from "./contracts";

/** EIP-712 types for the message a buyer signs to pay `Checkout.payWithAuthorization`. */
export const receiveWithAuthorizationTypes = {
  ReceiveWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;

export interface CheckoutAuthorization {
  from: Address;
  /** Must be the Checkout contract. */
  to: Address;
  value: bigint;
  validAfter: bigint;
  validBefore: bigint;
  /** Must be `Checkout.authorizationNonce(orderId)`. */
  nonce: Hex;
}

/**
 * Typed data for `signTypedData` (viem / wagmi). Pass the result straight to the wallet.
 *
 *   const sig = await walletClient.signTypedData({ account, ...checkoutTypedData(...) })
 */
export function checkoutTypedData(chainId: number, token: Address, message: CheckoutAuthorization) {
  return {
    domain: tusd8Domain(chainId, token),
    types: receiveWithAuthorizationTypes,
    primaryType: "ReceiveWithAuthorization" as const,
    message,
  };
}

/** A signature window that starts now (with a little clock slack) and lasts `seconds`. */
export function authorizationWindow(seconds = 600, nowMs = Date.now()) {
  const now = BigInt(Math.floor(nowMs / 1000));
  return { validAfter: 0n, validBefore: now + BigInt(seconds) };
}
