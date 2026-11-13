import { BaseError, ContractFunctionRevertedError, UserRejectedRequestError } from "viem";

/** Turns wallet / RPC / revert errors into one sentence a user can act on. */
export function explain(error: unknown): string {
  if (!(error instanceof Error)) return "Something went wrong. Try again.";
  // MetaMask won't add a network whose RPC URL another saved network already uses.
  const dup = /same RPC endpoint as existing network for chain \w+ \('([^']*)'\)/.exec(fullMessage(error));
  if (dup) return `Your wallet already has a network ("${dup[1]}") using the same RPC address. Edit or remove that network in your wallet, then try again.`;
  if (error instanceof BaseError) {
    if (error.walk((e) => e instanceof UserRejectedRequestError)) return "You cancelled the request in your wallet. Nothing was sent.";
    const revert = error.walk((e) => e instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError) {
      const name = revert.data?.errorName;
      if (name === "AlreadyPaid") return "This order is already paid. Start a new order.";
      if (name === "ZeroAmount") return "The amount must be more than zero.";
      const reason = revert.reason ?? "";
      if (/invalid signature/i.test(reason)) return "The signature doesn't match this order or amount. Sign again.";
      if (/expired/i.test(reason)) return "Your signature expired before it was submitted. Nothing was charged. Sign again.";
      if (/exceeds balance|insufficient/i.test(reason)) return "Not enough tUSD8 in your wallet for this order.";
      if (/allowance/i.test(reason)) return "The approval is lower than the order total. Approve again.";
      if (reason) return reason;
    }
    if (/insufficient funds/i.test(error.message)) return "Not enough tQDAY for gas. Get some from the faucet, or use Gasless mode.";
    return error.shortMessage;
  }
  return error.message;
}

/** Wallet errors often hide the real reason in `cause` or `data.cause`. */
function fullMessage(error: unknown, depth = 0): string {
  if (!error || typeof error !== "object" || depth > 5) return "";
  const e = error as { message?: unknown; details?: unknown; cause?: unknown; data?: { cause?: unknown; message?: unknown } };
  return [e.message, e.details, e.data?.message, fullMessage(e.cause, depth + 1), fullMessage(e.data?.cause, depth + 1)]
    .filter((m) => typeof m === "string" && m)
    .join(" | ");
}
