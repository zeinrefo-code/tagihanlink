// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {TagihanLink} from "../src/TagihanLink.sol";
import {MockUSD8} from "../src/mocks/MockUSD8.sol";
import {Signing} from "./Signing.sol";
import {QuoteSigning} from "./QuoteSigning.sol";

contract TagihanLinkTest is Test {
    MockUSD8 token;
    TagihanLink link;

    address merchant;
    uint256 merchantKey;
    address buyer;
    uint256 buyerKey;
    address relayer = makeAddr("relayer");
    address stranger;
    uint256 strangerKey;

    bytes32 constant ORDER = keccak256("invoice-0001");
    uint256 constant PRICE = 25e6; // 25 tUSD8

    function setUp() public {
        (merchant, merchantKey) = makeAddrAndKey("merchant");
        (buyer, buyerKey) = makeAddrAndKey("buyer");
        (stranger, strangerKey) = makeAddrAndKey("stranger");
        token = new MockUSD8();
        link = new TagihanLink(IERC20(address(token)), merchant);
        token.mint(buyer, 1_000e6);
    }

    // ---------- helpers ----------

    function _expiry() internal view returns (uint256) {
        return block.timestamp + 1 days;
    }

    function _create(bytes32 orderId, uint256 amount, uint256 expiresAt) internal {
        (uint8 v, bytes32 r, bytes32 s) =
            QuoteSigning.signQuote(vm, merchantKey, link.domainSeparator(), orderId, merchant, amount, expiresAt);
        link.createInvoice(orderId, amount, expiresAt, v, r, s);
    }

    function _signAuth(bytes32 orderId, uint256 value, uint256 validBefore)
        internal
        view
        returns (uint8 v, bytes32 r, bytes32 s)
    {
        Signing.Auth memory a = Signing.Auth({
            from: buyer,
            to: address(link),
            value: value,
            validAfter: 0,
            validBefore: validBefore,
            nonce: link.authorizationNonce(orderId)
        });
        return Signing.signReceive(vm, buyerKey, token.DOMAIN_SEPARATOR(), a);
    }

    // ---------- invoice creation ----------

    function test_createInvoice_registersQuotedTerms() public {
        uint256 exp = _expiry();
        vm.expectEmit(true, true, false, true, address(link));
        emit TagihanLink.InvoiceCreated(ORDER, merchant, PRICE, uint64(exp));
        _create(ORDER, PRICE, exp);

        TagihanLink.Invoice memory inv = link.invoiceOf(ORDER);
        assertEq(inv.amount, PRICE);
        assertEq(inv.expiresAt, exp);
        assertEq(uint256(inv.status), uint256(TagihanLink.Status.Open));
        assertFalse(link.isPaid(ORDER));
    }

    function test_createInvoice_anyoneCanSubmitMerchantQuote() public {
        // Registration is permissionless: a relayer submits, the signature authorizes.
        uint256 exp = _expiry();
        (uint8 v, bytes32 r, bytes32 s) =
            QuoteSigning.signQuote(vm, merchantKey, link.domainSeparator(), ORDER, merchant, PRICE, exp);
        vm.prank(relayer);
        link.createInvoice(ORDER, PRICE, exp, v, r, s);
        assertEq(uint256(link.statusOf(ORDER)), uint256(TagihanLink.Status.Open));
    }

    function test_createInvoice_rejectsForgedQuote() public {
        // Attack path: a stranger signs the terms with their own key (self-issued quote).
        uint256 exp = _expiry();
        (uint8 v, bytes32 r, bytes32 s) =
            QuoteSigning.signQuote(vm, strangerKey, link.domainSeparator(), ORDER, merchant, PRICE, exp);
        vm.expectRevert(TagihanLink.InvalidQuoteSignature.selector);
        link.createInvoice(ORDER, PRICE, exp, v, r, s);
        assertEq(uint256(link.statusOf(ORDER)), uint256(TagihanLink.Status.None));
    }

    function test_createInvoice_rejectsTamperedAmount() public {
        // Attack path: the merchant signed 25 tUSD8, the submitter presents 1 wei of terms.
        uint256 exp = _expiry();
        (uint8 v, bytes32 r, bytes32 s) =
            QuoteSigning.signQuote(vm, merchantKey, link.domainSeparator(), ORDER, merchant, PRICE, exp);
        vm.expectRevert(TagihanLink.InvalidQuoteSignature.selector);
        link.createInvoice(ORDER, 1, exp, v, r, s);
    }

    function test_createInvoice_rejectsTamperedOrderId() public {
        uint256 exp = _expiry();
        (uint8 v, bytes32 r, bytes32 s) =
            QuoteSigning.signQuote(vm, merchantKey, link.domainSeparator(), ORDER, merchant, PRICE, exp);
        vm.expectRevert(TagihanLink.InvalidQuoteSignature.selector);
        link.createInvoice(keccak256("invoice-0002"), PRICE, exp, v, r, s);
    }

    function test_createInvoice_rejectsExpiredQuote() public {
        uint256 exp = block.timestamp; // already over by the time it is registered
        (uint8 v, bytes32 r, bytes32 s) =
            QuoteSigning.signQuote(vm, merchantKey, link.domainSeparator(), ORDER, merchant, PRICE, exp);
        vm.expectRevert(TagihanLink.QuoteAlreadyExpired.selector);
        link.createInvoice(ORDER, PRICE, exp, v, r, s);
    }

    function test_createInvoice_rejectsDuplicateAndZeroAmount() public {
        _create(ORDER, PRICE, _expiry());
        (uint8 v, bytes32 r, bytes32 s) =
            QuoteSigning.signQuote(vm, merchantKey, link.domainSeparator(), ORDER, merchant, PRICE, _expiry());
        vm.expectRevert(abi.encodeWithSelector(TagihanLink.InvoiceAlreadyExists.selector, ORDER));
        link.createInvoice(ORDER, PRICE, _expiry(), v, r, s);

        (uint8 v2, bytes32 r2, bytes32 s2) = QuoteSigning.signQuote(
            vm, merchantKey, link.domainSeparator(), keccak256("invoice-zero"), merchant, 0, _expiry()
        );
        vm.expectRevert(TagihanLink.ZeroAmount.selector);
        link.createInvoice(keccak256("invoice-zero"), 0, _expiry(), v2, r2, s2);
    }

    // ---------- happy path: gasless payment of a signed quote ----------

    function test_payWithAuthorization_happyPath() public {
        _create(ORDER, PRICE, _expiry());
        uint256 deadline = block.timestamp + 1 hours;
        (uint8 v, bytes32 r, bytes32 s) = _signAuth(ORDER, PRICE, deadline);

        vm.expectEmit(true, true, false, true, address(link));
        emit TagihanLink.Paid(ORDER, buyer, PRICE);
        vm.prank(relayer); // buyer never sends a transaction and needs no gas token
        link.payWithAuthorization(ORDER, buyer, 0, deadline, v, r, s);

        assertEq(token.balanceOf(merchant), PRICE);
        assertEq(token.balanceOf(buyer), 1_000e6 - PRICE);
        assertEq(token.balanceOf(address(link)), 0);
        assertTrue(link.isPaid(ORDER));
        TagihanLink.Invoice memory inv = link.invoiceOf(ORDER);
        assertEq(inv.payer, buyer);
        assertEq(inv.paidAt, block.timestamp);
    }

    function test_pay_approvePathUsesQuotedAmount() public {
        _create(ORDER, PRICE, _expiry());
        vm.startPrank(buyer);
        token.approve(address(link), PRICE);
        link.pay(ORDER);
        vm.stopPrank();
        assertEq(token.balanceOf(merchant), PRICE);
        assertTrue(link.isPaid(ORDER));
    }

    // ---------- attack paths (the kit weakness, fixed) ----------

    function test_kitAttack_fakePayOneWei_isImpossible() public {
        // Kit Checkout: pay(orderId, 1) marks the order paid for 0.000001 tUSD8.
        // Here there is no caller-chosen amount at all: paying an unregistered
        // invoice reverts, and paying a registered one always moves the full quote.
        vm.startPrank(stranger);
        token.mint(stranger, 10e6);
        token.approve(address(link), 10e6);
        vm.expectRevert(abi.encodeWithSelector(TagihanLink.InvoiceNotOpen.selector, ORDER));
        link.pay(ORDER);
        vm.stopPrank();

        _create(ORDER, PRICE, _expiry());
        vm.startPrank(stranger);
        vm.expectRevert(); // stranger approved only 10 tUSD8 < 25 tUSD8 quote; cannot underpay
        link.pay(ORDER);
        vm.stopPrank();
        assertFalse(link.isPaid(ORDER));
        assertEq(token.balanceOf(merchant), 0);
    }

    function test_payWithAuthorization_wrongAmountSignature_rejected() public {
        // Buyer (or a malicious app) signs an authorization for 1 unit instead of the quote.
        _create(ORDER, PRICE, _expiry());
        uint256 deadline = block.timestamp + 1 hours;
        (uint8 v, bytes32 r, bytes32 s) = _signAuth(ORDER, 1, deadline);
        vm.prank(relayer);
        vm.expectRevert(MockUSD8.InvalidSignature.selector);
        link.payWithAuthorization(ORDER, buyer, 0, deadline, v, r, s);
        assertFalse(link.isPaid(ORDER));
    }

    function test_payWithAuthorization_signatureBoundToInvoice() public {
        _create(ORDER, PRICE, _expiry());
        bytes32 other = keccak256("invoice-0002");
        _create(other, PRICE, _expiry());
        uint256 deadline = block.timestamp + 1 hours;
        (uint8 v, bytes32 r, bytes32 s) = _signAuth(ORDER, PRICE, deadline);
        vm.prank(relayer);
        vm.expectRevert(MockUSD8.InvalidSignature.selector);
        link.payWithAuthorization(other, buyer, 0, deadline, v, r, s);
    }

    // ---------- expiry & double payment ----------

    function test_pay_revertsAfterQuoteExpiry() public {
        uint256 exp = block.timestamp + 1 hours;
        _create(ORDER, PRICE, exp);
        vm.warp(exp + 1);
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(TagihanLink.InvoiceExpired.selector, ORDER));
        link.pay(ORDER);
    }

    function test_payWithAuthorization_revertsAfterQuoteExpiry() public {
        uint256 exp = block.timestamp + 1 hours;
        _create(ORDER, PRICE, exp);
        uint256 deadline = exp + 1 hours; // the EIP-3009 window itself is still valid
        (uint8 v, bytes32 r, bytes32 s) = _signAuth(ORDER, PRICE, deadline);
        vm.warp(exp + 1);
        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(TagihanLink.InvoiceExpired.selector, ORDER));
        link.payWithAuthorization(ORDER, buyer, 0, deadline, v, r, s);
    }

    function test_doublePayment_revertsOnBothPaths() public {
        _create(ORDER, PRICE, _expiry());
        vm.startPrank(buyer);
        token.approve(address(link), 2 * PRICE);
        link.pay(ORDER);
        vm.expectRevert(abi.encodeWithSelector(TagihanLink.AlreadyPaid.selector, ORDER));
        link.pay(ORDER);
        vm.stopPrank();

        uint256 deadline = block.timestamp + 1 hours;
        (uint8 v, bytes32 r, bytes32 s) = _signAuth(ORDER, PRICE, deadline);
        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(TagihanLink.AlreadyPaid.selector, ORDER));
        link.payWithAuthorization(ORDER, buyer, 0, deadline, v, r, s);
        assertEq(token.balanceOf(merchant), PRICE); // exactly one payment ever landed
    }

    // ---------- cancellation / status tracking ----------

    function test_cancelInvoice_merchantOnlyAndTerminal() public {
        _create(ORDER, PRICE, _expiry());
        vm.prank(stranger);
        vm.expectRevert(TagihanLink.NotMerchant.selector);
        link.cancelInvoice(ORDER);

        vm.prank(merchant);
        link.cancelInvoice(ORDER);
        assertEq(uint256(link.statusOf(ORDER)), uint256(TagihanLink.Status.Cancelled));

        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(TagihanLink.InvoiceNotOpen.selector, ORDER));
        link.pay(ORDER);
    }

    function test_constructor_rejectsZeroAddress() public {
        vm.expectRevert(TagihanLink.ZeroAddress.selector);
        new TagihanLink(IERC20(address(0)), merchant);
        vm.expectRevert(TagihanLink.ZeroAddress.selector);
        new TagihanLink(IERC20(address(token)), address(0));
    }
}
