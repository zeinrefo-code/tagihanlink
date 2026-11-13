/**
 * Prints what you need to know before building: chain, head block, and the balances of ADDRESS.
 *   pnpm example check-setup
 */
import { formatEther, formatUnits } from "viem";
import { aevumFork, aevumTestnet, erc20Abi, TUSD8_ADDRESS, TUSD8_DECIMALS } from "@aevum-kit/aevum";
import { connect, requiredAddress } from "./env";

const { client, chain, rpcUrl } = await connect();
const address = requiredAddress("ADDRESS");

const [block, gasPrice, native] = await Promise.all([
  client.getBlockNumber(),
  client.getGasPrice(),
  client.getBalance({ address }),
]);

console.log(`Network   ${chain.name} (chain ${chain.id})`);
console.log(`RPC       ${rpcUrl}`);
console.log(`Block     ${block}`);
console.log(`Gas price ${formatUnits(gasPrice, 9)} gwei`);
console.log(`Address   ${address}`);
console.log(`Gas       ${formatEther(native)} ${chain.nativeCurrency.symbol}`);

if (chain.id === aevumTestnet.id || chain.id === aevumFork.id) {
  const tusd8 = await client.readContract({ address: TUSD8_ADDRESS, abi: erc20Abi, functionName: "balanceOf", args: [address] });
  console.log(`tUSD8     ${formatUnits(tusd8, TUSD8_DECIMALS)}`);
  if (native === 0n) console.log("\n→ No gas yet. Get tQDAY from the faucet (see README › Get test tokens).");
  if (tusd8 === 0n) console.log("→ No tUSD8 yet. Use /faucet in the QDay Discord, or `make fork` and deal yourself some.");
}
