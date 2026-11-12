// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @notice EIP-3009 (USDC-style) signed transfers. tUSD8 on Aevum implements this.
interface IERC3009 {
    function receiveWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;
}

/// @title Checkout
/// @notice A minimal stablecoin checkout. Each order id can be paid once; the money goes
///         straight to the merchant and a `Paid` event is the receipt.
/// @dev Two ways to pay:
///      1. `pay`: the buyer approves this contract, then calls `pay` (two transactions, buyer pays gas).
///      2. `payWithAuthorization`: the buyer signs an EIP-3009 message off-chain and anyone
///         (your backend, a relayer, the merchant) submits it. The buyer needs no native gas.
///      The contract never decides the price. Your app must check that `amount` matches the order.
contract Checkout {
    using SafeERC20 for IERC20;

    struct Payment {
        address payer;
        uint64 paidAt;
        uint256 amount;
    }

    IERC20 public immutable token;
    address public immutable merchant;

    mapping(bytes32 orderId => Payment) private _payments;

    event Paid(bytes32 indexed orderId, address indexed payer, uint256 amount);

    error AlreadyPaid(bytes32 orderId);
    error ZeroAmount();
    error ZeroAddress();

    constructor(IERC20 token_, address merchant_) {
        if (address(token_) == address(0) || merchant_ == address(0)) revert ZeroAddress();
        token = token_;
        merchant = merchant_;
    }

    /// @notice Pay for `orderId` with tokens you have approved to this contract.
    function pay(bytes32 orderId, uint256 amount) external {
        _record(orderId, msg.sender, amount);
        token.safeTransferFrom(msg.sender, merchant, amount);
    }

    /// @notice Pay for `orderId` with an EIP-3009 `ReceiveWithAuthorization` signed by `from`.
    /// @dev The signed nonce must be `authorizationNonce(orderId)`. That ties the signature to
    ///      this order, so a relayer can't reuse it to mark a different order as paid.
    ///      `to` in the signed message must be this contract.
    function payWithAuthorization(
        bytes32 orderId,
        address from,
        uint256 amount,
        uint256 validAfter,
        uint256 validBefore,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        _record(orderId, from, amount);
        IERC3009(address(token)).receiveWithAuthorization(
            from, address(this), amount, validAfter, validBefore, authorizationNonce(orderId), v, r, s
        );
        token.safeTransfer(merchant, amount);
    }

    /// @notice The EIP-3009 nonce a buyer must sign to pay `orderId` through this contract.
    function authorizationNonce(bytes32 orderId) public view returns (bytes32) {
        return keccak256(abi.encode(address(this), orderId));
    }

    function paymentOf(bytes32 orderId) external view returns (Payment memory) {
        return _payments[orderId];
    }

    function isPaid(bytes32 orderId) external view returns (bool) {
        return _payments[orderId].payer != address(0);
    }

    function _record(bytes32 orderId, address payer, uint256 amount) private {
        if (amount == 0) revert ZeroAmount();
        if (_payments[orderId].payer != address(0)) revert AlreadyPaid(orderId);
        _payments[orderId] = Payment({payer: payer, paidAt: uint64(block.timestamp), amount: amount});
        emit Paid(orderId, payer, amount);
    }
}
