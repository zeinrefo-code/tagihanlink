import { keccak256, toHex, type Hex } from "viem";

/**
 * The demo order. Rename it into an invoice, a ticket, a pledge… The contract only sees
 * `orderId` and `amount`; everything else lives in your app.
 */
export const demoOrder = {
  lines: [
    { label: "Sample item", amount: "1.00" },
    { label: "Service fee", amount: "0.05" },
  ],
  total: "1.05",
};

export function newOrderId(): Hex {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return keccak256(toHex(bytes));
}

/** Short, human-friendly label for a bytes32 order id. */
export function orderLabel(orderId: Hex): string {
  return `#${orderId.slice(2, 6).toUpperCase()}-${orderId.slice(-4).toUpperCase()}`;
}

export function short(value: string, head = 6, tail = 4): string {
  return value.length > head + tail + 1 ? `${value.slice(0, head)}…${value.slice(-tail)}` : value;
}
