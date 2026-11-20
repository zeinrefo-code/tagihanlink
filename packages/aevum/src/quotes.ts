import type { Address, Hex } from "viem";

/** EIP-712 domain of a TagihanLink deployment (contracts/src/TagihanLink.sol). */
export function tagihanLinkDomain(chainId: number, verifyingContract: Address) {
  return { name: "TagihanLink", version: "1", chainId, verifyingContract } as const;
}

/** EIP-712 types for the quote a merchant signs to fix an invoice's terms off-chain. */
export const quoteTypes = {
  Quote: [
    { name: "orderId", type: "bytes32" },
    { name: "merchant", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "expiresAt", type: "uint256" },
  ],
} as const;

export interface InvoiceQuote {
  orderId: Hex;
  /** Must be the TagihanLink contract's merchant; the contract rejects any other signer. */
  merchant: Address;
  amount: bigint;
  /** Unix seconds. After this, the quote cannot be registered and the invoice cannot be paid. */
  expiresAt: bigint;
}

/**
 * Typed data for `signTypedData` (viem / wagmi). The merchant signs once per invoice;
 * anyone can then register the invoice on-chain with `TagihanLink.createInvoice`.
 *
 *   const sig = await walletClient.signTypedData({ account, ...quoteTypedData(chain.id, tagihanLink, quote) })
 */
export function quoteTypedData(chainId: number, tagihanLink: Address, message: InvoiceQuote) {
  return {
    domain: tagihanLinkDomain(chainId, tagihanLink),
    types: quoteTypes,
    primaryType: "Quote" as const,
    message,
  };
}
