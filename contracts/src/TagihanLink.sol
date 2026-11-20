// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {IERC3009} from "./Checkout.sol";

/// @title TagihanLink
/// @notice Gasless invoice payments for online sellers, hardened against the starter kit
///         Checkout's documented weakness: there, anyone can `pay(orderId, 1)` and fake a
///         paid invoice, because the caller chooses the amount. Here the amount is fixed by
///         the merchant's own EIP-712 signature (a "quote") before any payment can happen:
///
///         1. The merchant signs the invoice terms off-chain (order id, amount, expiry).
///         2. Anyone (seller backend, buyer, relayer) registers the invoice with
///            `createInvoice`, presenting that signature. The contract recovers the signer
///            and only accepts terms the merchant actually signed.
///         3. The buyer pays the registered amount — exactly that amount, never a
///            caller-chosen one — either with `pay` (approve + call) or gaslessly with
///            `payWithAuthorization` (one EIP-3009 signature, a relayer submits it).
///
///         The `Paid` event keeps the same shape as the kit's Checkout, so the kit's
///         receipt tooling keeps working.
contract TagihanLink is EIP712 {
    using SafeERC20 for IERC20;

    enum Status {
        None,
        Open,
        Paid,
        Cancelled
    }

    struct Invoice {
        uint256 amount;
        uint64 expiresAt;
        Status status;
        address payer;
        uint64 paidAt;
    }

    /// @notice EIP-712 type of the merchant-signed quote. The domain (this contract, this
    ///         chain) binds the quote to one TagihanLink deployment.
    bytes32 public constant QUOTE_TYPEHASH =
        keccak256("Quote(bytes32 orderId,address merchant,uint256 amount,uint256 expiresAt)");

    IERC20 public immutable token;
    address public immutable merchant;

    mapping(bytes32 orderId => Invoice) private _invoices;

    event InvoiceCreated(bytes32 indexed orderId, address indexed merchant, uint256 amount, uint64 expiresAt);
    event InvoiceCancelled(bytes32 indexed orderId);
    event Paid(bytes32 indexed orderId, address indexed payer, uint256 amount);

    error AlreadyPaid(bytes32 orderId);
    error InvoiceAlreadyExists(bytes32 orderId);
    error InvoiceNotOpen(bytes32 orderId);
    error InvoiceExpired(bytes32 orderId);
    error InvalidQuoteSignature();
    error QuoteAlreadyExpired();
    error NotMerchant();
    error ZeroAmount();
    error ZeroAddress();

    constructor(IERC20 token_, address merchant_) EIP712("TagihanLink", "1") {
        if (address(token_) == address(0) || merchant_ == address(0)) revert ZeroAddress();
        token = token_;
        merchant = merchant_;
    }

    /// @notice The EIP-712 domain separator a merchant signs quotes against.
    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    /// @notice Register an invoice from a merchant-signed quote. Permissionless: the
    ///         signature is the authorization, so a backend or the buyer can submit it.
    /// @param expiresAt Unix time after which the quote (and the invoice) can no longer be paid.
    function createInvoice(
        bytes32 orderId,
        uint256 amount,
        uint256 expiresAt,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        if (amount == 0) revert ZeroAmount();
        if (_invoices[orderId].status != Status.None) revert InvoiceAlreadyExists(orderId);
        if (expiresAt <= block.timestamp) revert QuoteAlreadyExpired();

        bytes32 structHash = keccak256(abi.encode(QUOTE_TYPEHASH, orderId, merchant, amount, expiresAt));
        if (ECDSA.recover(_hashTypedDataV4(structHash), v, r, s) != merchant) {
            revert InvalidQuoteSignature();
        }

        _invoices[orderId] = Invoice({
            amount: amount,
            expiresAt: uint64(expiresAt),
            status: Status.Open,
            payer: address(0),
            paidAt: 0
        });
        emit InvoiceCreated(orderId, merchant, amount, uint64(expiresAt));
    }

    /// @notice Cancel an open invoice. Only the merchant, and only before it is paid.
    function cancelInvoice(bytes32 orderId) external {
        if (msg.sender != merchant) revert NotMerchant();
        Invoice storage inv = _invoices[orderId];
        if (inv.status == Status.Paid) revert AlreadyPaid(orderId);
        if (inv.status != Status.Open) revert InvoiceNotOpen(orderId);
        inv.status = Status.Cancelled;
        emit InvoiceCancelled(orderId);
    }

    /// @notice Pay a registered invoice with tokens approved to this contract.
    ///         The amount always comes from the merchant-signed quote, never from the caller.
    function pay(bytes32 orderId) external {
        Invoice storage inv = _invoices[orderId];
        uint256 amount = _openAmount(orderId, inv);
        _record(orderId, inv, msg.sender, amount);
        token.safeTransferFrom(msg.sender, merchant, amount);
    }

    /// @notice Pay a registered invoice with an EIP-3009 `ReceiveWithAuthorization` signed
    ///         by `from`. The buyer needs no native gas; anyone may relay the signature.
    /// @dev The signed value must equal the quoted amount and the signed nonce must be
    ///      `authorizationNonce(orderId)`, so the buyer's signature is bound to this
    ///      invoice at this price. `to` in the signed message must be this contract.
    function payWithAuthorization(
        bytes32 orderId,
        address from,
        uint256 validAfter,
        uint256 validBefore,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        Invoice storage inv = _invoices[orderId];
        uint256 amount = _openAmount(orderId, inv);
        _record(orderId, inv, from, amount);
        _settleWithAuthorization(orderId, from, amount, validAfter, validBefore, v, r, s);
    }

    function _settleWithAuthorization(
        bytes32 orderId,
        address from,
        uint256 amount,
        uint256 validAfter,
        uint256 validBefore,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) private {
        IERC3009(address(token)).receiveWithAuthorization(
            from, address(this), amount, validAfter, validBefore, authorizationNonce(orderId), v, r, s
        );
        token.safeTransfer(merchant, amount);
    }

    /// @notice The EIP-3009 nonce a buyer must sign to pay `orderId` through this contract.
    function authorizationNonce(bytes32 orderId) public view returns (bytes32) {
        return keccak256(abi.encode(address(this), orderId));
    }

    function invoiceOf(bytes32 orderId) external view returns (Invoice memory) {
        return _invoices[orderId];
    }

    function statusOf(bytes32 orderId) external view returns (Status) {
        return _invoices[orderId].status;
    }

    function isPaid(bytes32 orderId) external view returns (bool) {
        return _invoices[orderId].status == Status.Paid;
    }

    /// @dev The payable amount of an open, unexpired invoice — always the quoted amount.
    function _openAmount(bytes32 orderId, Invoice storage inv) private view returns (uint256) {
        if (inv.status == Status.Paid) revert AlreadyPaid(orderId);
        if (inv.status != Status.Open) revert InvoiceNotOpen(orderId);
        if (block.timestamp > inv.expiresAt) revert InvoiceExpired(orderId);
        return inv.amount;
    }

    function _record(bytes32 orderId, Invoice storage inv, address payer, uint256 amount) private {
        inv.status = Status.Paid;
        inv.payer = payer;
        inv.paidAt = uint64(block.timestamp);
        emit Paid(orderId, payer, amount);
    }
}
