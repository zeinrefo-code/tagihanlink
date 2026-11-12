// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Checkout} from "../src/Checkout.sol";
import {MockUSD8} from "../src/mocks/MockUSD8.sol";
import {Signing} from "./Signing.sol";

contract CheckoutTest is Test {
    MockUSD8 token;
    Checkout checkout;
    address merchant = makeAddr("merchant");
    address buyer;
    uint256 buyerKey;
    address relayer = makeAddr("relayer");

    bytes32 constant ORDER = keccak256("order-1");
    uint256 constant PRICE = 5e6; // 5 tUSD8

    function setUp() public {
        (buyer, buyerKey) = makeAddrAndKey("buyer");
        token = new MockUSD8();
        checkout = new Checkout(IERC20(address(token)), merchant);
        token.mint(buyer, 100e6);
    }

    // ---------- pay (approve + call) ----------

    function test_pay_movesFundsAndRecords() public {
        vm.startPrank(buyer);
        token.approve(address(checkout), PRICE);
        vm.expectEmit(true, true, false, true, address(checkout));
        emit Checkout.Paid(ORDER, buyer, PRICE);
        checkout.pay(ORDER, PRICE);
        vm.stopPrank();

        assertEq(token.balanceOf(merchant), PRICE);
        assertEq(token.balanceOf(address(checkout)), 0);
        assertTrue(checkout.isPaid(ORDER));
        Checkout.Payment memory p = checkout.paymentOf(ORDER);
        assertEq(p.payer, buyer);
        assertEq(p.amount, PRICE);
        assertEq(p.paidAt, block.timestamp);
    }

    function test_pay_revertsOnSecondPayment() public {
        vm.startPrank(buyer);
        token.approve(address(checkout), 2 * PRICE);
        checkout.pay(ORDER, PRICE);
        vm.expectRevert(abi.encodeWithSelector(Checkout.AlreadyPaid.selector, ORDER));
        checkout.pay(ORDER, PRICE);
        vm.stopPrank();
    }

    function test_pay_revertsOnZeroAmount() public {
        vm.prank(buyer);
        vm.expectRevert(Checkout.ZeroAmount.selector);
        checkout.pay(ORDER, 0);
    }

    function test_pay_revertsWithoutApproval() public {
        vm.prank(buyer);
        vm.expectRevert();
        checkout.pay(ORDER, PRICE);
        assertFalse(checkout.isPaid(ORDER));
    }

    // ---------- payWithAuthorization (EIP-3009, gasless for the buyer) ----------

    function _sign(bytes32 orderId, uint256 value, uint256 validBefore)
        internal
        view
        returns (uint8 v, bytes32 r, bytes32 s)
    {
        Signing.Auth memory a = Signing.Auth({
            from: buyer,
            to: address(checkout),
            value: value,
            validAfter: 0,
            validBefore: validBefore,
            nonce: checkout.authorizationNonce(orderId)
        });
        return Signing.signReceive(vm, buyerKey, token.DOMAIN_SEPARATOR(), a);
    }

    function test_payWithAuthorization_relayerSubmits() public {
        uint256 deadline = block.timestamp + 1 hours;
        (uint8 v, bytes32 r, bytes32 s) = _sign(ORDER, PRICE, deadline);

        vm.prank(relayer); // the buyer never sends a transaction
        checkout.payWithAuthorization(ORDER, buyer, PRICE, 0, deadline, v, r, s);

        assertEq(token.balanceOf(merchant), PRICE);
        assertEq(token.balanceOf(buyer), 95e6);
        assertEq(checkout.paymentOf(ORDER).payer, buyer);
    }

    function test_payWithAuthorization_signatureIsBoundToOrder() public {
        uint256 deadline = block.timestamp + 1 hours;
        (uint8 v, bytes32 r, bytes32 s) = _sign(ORDER, PRICE, deadline);

        // Same signature, different order id: the nonce no longer matches, so it fails.
        vm.prank(relayer);
        vm.expectRevert(MockUSD8.InvalidSignature.selector);
        checkout.payWithAuthorization(keccak256("order-2"), buyer, PRICE, 0, deadline, v, r, s);
    }

    function test_payWithAuthorization_cannotChangeAmount() public {
        uint256 deadline = block.timestamp + 1 hours;
        (uint8 v, bytes32 r, bytes32 s) = _sign(ORDER, PRICE, deadline);

        vm.prank(relayer);
        vm.expectRevert(MockUSD8.InvalidSignature.selector);
        checkout.payWithAuthorization(ORDER, buyer, PRICE + 1, 0, deadline, v, r, s);
    }

    function test_payWithAuthorization_expired() public {
        uint256 deadline = block.timestamp + 1 hours;
        (uint8 v, bytes32 r, bytes32 s) = _sign(ORDER, PRICE, deadline);
        vm.warp(deadline);

        vm.expectRevert(MockUSD8.AuthorizationExpired.selector);
        checkout.payWithAuthorization(ORDER, buyer, PRICE, 0, deadline, v, r, s);
    }

    function test_payWithAuthorization_noReplay() public {
        uint256 deadline = block.timestamp + 1 hours;
        (uint8 v, bytes32 r, bytes32 s) = _sign(ORDER, PRICE, deadline);
        checkout.payWithAuthorization(ORDER, buyer, PRICE, 0, deadline, v, r, s);

        vm.expectRevert(abi.encodeWithSelector(Checkout.AlreadyPaid.selector, ORDER));
        checkout.payWithAuthorization(ORDER, buyer, PRICE, 0, deadline, v, r, s);
    }

    function test_constructor_rejectsZeroAddress() public {
        vm.expectRevert(Checkout.ZeroAddress.selector);
        new Checkout(IERC20(address(0)), merchant);
        vm.expectRevert(Checkout.ZeroAddress.selector);
        new Checkout(IERC20(address(token)), address(0));
    }

    function testFuzz_pay(bytes32 orderId, uint256 amount) public {
        amount = bound(amount, 1, 100e6);
        vm.startPrank(buyer);
        token.approve(address(checkout), amount);
        checkout.pay(orderId, amount);
        vm.stopPrank();
        assertEq(token.balanceOf(merchant), amount);
        assertEq(checkout.paymentOf(orderId).amount, amount);
    }
}
