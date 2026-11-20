// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Vm} from "forge-std/Vm.sol";

/// @dev Builds EIP-712 `Quote` signatures for TagihanLink, the same way a merchant's
///      backend or wallet would sign invoice terms off-chain.
library QuoteSigning {
    bytes32 internal constant QUOTE_TYPEHASH =
        keccak256("Quote(bytes32 orderId,address merchant,uint256 amount,uint256 expiresAt)");

    function signQuote(
        Vm vm,
        uint256 pk,
        bytes32 domainSeparator,
        bytes32 orderId,
        address merchant,
        uint256 amount,
        uint256 expiresAt
    ) internal pure returns (uint8 v, bytes32 r, bytes32 s) {
        bytes32 structHash = keccak256(abi.encode(QUOTE_TYPEHASH, orderId, merchant, amount, expiresAt));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
        return vm.sign(pk, digest);
    }
}
