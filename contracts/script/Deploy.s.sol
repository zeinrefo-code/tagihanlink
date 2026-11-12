// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Checkout} from "../src/Checkout.sol";
import {MockUSD8} from "../src/mocks/MockUSD8.sol";

/// @notice Deploys Checkout.
///   - On Aevum testnet (44005) it uses the real tUSD8.
///   - Anywhere else (local anvil) it deploys MockUSD8 first and mints 1,000 to the deployer.
///   MERCHANT (optional env) receives payments; defaults to the deployer.
///
///   make deploy-local                         # anvil on 127.0.0.1:8545
///   make deploy-aevum ACCOUNT=deployer        # uses a keystore made with `cast wallet import`
contract Deploy is Script {
    address constant AEVUM_TUSD8 = 0x456569838f1d43009A91ebA4263147Afd7233483;
    uint256 constant AEVUM_TESTNET = 44005;

    function run() external returns (Checkout checkout, address token) {
        vm.startBroadcast();
        (, address deployer,) = vm.readCallers();
        address merchant = vm.envOr("MERCHANT", deployer);

        if (block.chainid == AEVUM_TESTNET) {
            token = AEVUM_TUSD8;
        } else {
            MockUSD8 mock = new MockUSD8();
            mock.mint(deployer, 1_000e6);
            token = address(mock);
        }
        checkout = new Checkout(IERC20(token), merchant);
        vm.stopBroadcast();

        console.log("chainId  ", block.chainid);
        console.log("token    ", token);
        console.log("merchant ", merchant);
        console.log("Checkout ", address(checkout));
    }
}
