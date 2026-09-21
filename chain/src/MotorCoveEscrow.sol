// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.24;

import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IMotorCoveEscrow} from "./interfaces/IMotorCoveEscrow.sol";

contract MotorCoveEscrow is IMotorCoveEscrow, IERC721Receiver, ReentrancyGuard {
    error ZeroAddress();
    error InvalidDeploymentId();
    error InvalidFundingPeriod();
    error SaleNotFound(uint256 saleId);
    error InvalidSaleState(uint256 saleId, SaleStatus expected, SaleStatus actual);
    error NotTokenOwner(uint256 tokenId, address caller);
    error InvalidPrice();
    error TokenAlreadyInCustody(uint256 tokenId, uint256 saleId);
    error SellerCannotBuy();
    error IncorrectPayment(uint256 expected, uint256 actual);
    error Unauthorized(address caller);
    error DeadlinePassed(uint64 expiresAt);
    error DeadlineNotReached(uint64 expiresAt);
    error InvalidRecipient();
    error ClaimNotAvailable(uint256 saleId);
    error PaymentTransferFailed();
    error UnexpectedNftTransfer();
    error LiabilityInvariantBroken();

    IERC721 public immutable nft;
    uint64 public immutable override fundingPeriodSeconds;
    bytes32 public immutable override deploymentId;
    uint256 public override saleCount;
    uint256 public override totalLiability;

    mapping(uint256 => Sale) private _sales;
    mapping(uint256 => PaymentClaim) private _claims;
    mapping(uint256 => uint256) public override custodySaleId;

    struct PendingReceipt {
        address seller;
        uint256 tokenId;
        bool active;
    }
    PendingReceipt private _pendingReceipt;

    constructor(address nftAddress, uint64 periodSeconds, bytes32 identity) {
        if (nftAddress == address(0)) revert ZeroAddress();
        if (periodSeconds == 0) revert InvalidFundingPeriod();
        if (identity == bytes32(0)) revert InvalidDeploymentId();
        nft = IERC721(nftAddress);
        fundingPeriodSeconds = periodSeconds;
        deploymentId = identity;
    }

    function createSale(uint256 tokenId, uint256 priceWei) external nonReentrant returns (uint256 saleId) {
        if (priceWei == 0) revert InvalidPrice();
        if (nft.ownerOf(tokenId) != msg.sender) revert NotTokenOwner(tokenId, msg.sender);
        uint256 existing = custodySaleId[tokenId];
        if (existing != 0) revert TokenAlreadyInCustody(tokenId, existing);

        _pendingReceipt = PendingReceipt({seller: msg.sender, tokenId: tokenId, active: true});
        nft.safeTransferFrom(msg.sender, address(this), tokenId);
        if (_pendingReceipt.active) revert UnexpectedNftTransfer();

        saleId = ++saleCount;
        _sales[saleId] = Sale(tokenId, msg.sender, address(0), priceWei, 0, 0, SaleStatus.LISTED, false);
        custodySaleId[tokenId] = saleId;
        emit SaleCreated(saleId, tokenId, msg.sender, priceWei);
    }

    function fundSale(uint256 saleId) external payable nonReentrant {
        Sale storage sale = _requireSale(saleId);
        _requireState(saleId, sale, SaleStatus.LISTED);
        if (msg.sender == sale.seller) revert SellerCannotBuy();
        if (msg.value != sale.priceWei) revert IncorrectPayment(sale.priceWei, msg.value);
        uint64 fundedAt = uint64(block.timestamp);
        uint64 expiresAt = fundedAt + fundingPeriodSeconds;
        sale.buyer = msg.sender;
        sale.fundedAt = fundedAt;
        sale.expiresAt = expiresAt;
        sale.status = SaleStatus.FUNDED;
        totalLiability += msg.value;
        emit SaleFunded(saleId, msg.sender, msg.value, fundedAt, expiresAt);
        _checkLiability();
    }

    function completeSale(uint256 saleId) external nonReentrant {
        Sale storage sale = _requireSale(saleId);
        _requireState(saleId, sale, SaleStatus.FUNDED);
        if (msg.sender != sale.buyer) revert Unauthorized(msg.sender);
        if (block.timestamp >= sale.expiresAt) revert DeadlinePassed(sale.expiresAt);
        sale.status = SaleStatus.COMPLETED;
        custodySaleId[sale.tokenId] = 0;
        _claims[saleId] = PaymentClaim(sale.seller, sale.priceWei, ClaimKind.SELLER_PROCEEDS, ClaimStatus.CLAIMABLE);
        emit SaleCompleted(saleId, sale.tokenId, sale.buyer);
        emit PaymentClaimCreated(saleId, sale.seller, sale.priceWei, ClaimKind.SELLER_PROCEEDS);
        nft.safeTransferFrom(address(this), sale.buyer, sale.tokenId);
        _checkLiability();
    }

    function cancelSale(uint256 saleId) external nonReentrant {
        Sale storage sale = _requireSale(saleId);
        _requireState(saleId, sale, SaleStatus.LISTED);
        if (msg.sender != sale.seller) revert Unauthorized(msg.sender);
        sale.status = SaleStatus.CANCELLED;
        emit SaleCancelled(saleId, sale.tokenId, sale.seller);
    }

    function expireSale(uint256 saleId) external nonReentrant {
        Sale storage sale = _requireSale(saleId);
        _requireState(saleId, sale, SaleStatus.FUNDED);
        if (block.timestamp < sale.expiresAt) revert DeadlineNotReached(sale.expiresAt);
        sale.status = SaleStatus.EXPIRED;
        _claims[saleId] = PaymentClaim(sale.buyer, sale.priceWei, ClaimKind.BUYER_REFUND, ClaimStatus.CLAIMABLE);
        emit SaleExpired(saleId, sale.tokenId, sale.buyer);
        emit PaymentClaimCreated(saleId, sale.buyer, sale.priceWei, ClaimKind.BUYER_REFUND);
        _checkLiability();
    }

    function withdrawPayment(uint256 saleId, address payable recipient) external nonReentrant {
        PaymentClaim storage claim = _claims[saleId];
        if (claim.status != ClaimStatus.CLAIMABLE) revert ClaimNotAvailable(saleId);
        if (msg.sender != claim.beneficiary) revert Unauthorized(msg.sender);
        if (recipient == address(0) || recipient == address(this)) revert InvalidRecipient();
        claim.status = ClaimStatus.WITHDRAWN;
        totalLiability -= claim.amountWei;
        (bool success,) = recipient.call{value: claim.amountWei}("");
        if (!success) revert PaymentTransferFailed();
        emit PaymentWithdrawn(saleId, claim.beneficiary, recipient, claim.amountWei, claim.kind);
        _checkLiability();
    }

    function reclaimToken(uint256 saleId, address recipient) external nonReentrant {
        Sale storage sale = _requireSale(saleId);
        if (msg.sender != sale.seller) revert Unauthorized(msg.sender);
        if (sale.status != SaleStatus.CANCELLED && sale.status != SaleStatus.EXPIRED) {
            revert InvalidSaleState(saleId, SaleStatus.CANCELLED, sale.status);
        }
        if (sale.tokenReclaimed) revert TokenAlreadyInCustody(sale.tokenId, 0);
        if (recipient == address(0) || recipient == address(this)) revert InvalidRecipient();
        sale.tokenReclaimed = true;
        custodySaleId[sale.tokenId] = 0;
        nft.safeTransferFrom(address(this), recipient, sale.tokenId);
        emit TokenReclaimed(saleId, sale.tokenId, recipient);
    }

    function onERC721Received(address operator, address from, uint256 tokenId, bytes calldata)
        external
        returns (bytes4)
    {
        PendingReceipt memory expected = _pendingReceipt;
        if (
            msg.sender != address(nft) || operator != address(this) || !expected.active || from != expected.seller
                || tokenId != expected.tokenId
        ) revert UnexpectedNftTransfer();
        delete _pendingReceipt;
        return IERC721Receiver.onERC721Received.selector;
    }

    function getSale(uint256 saleId) external view returns (Sale memory) {
        return _requireSaleView(saleId);
    }

    function getPaymentClaim(uint256 saleId) external view returns (PaymentClaim memory) {
        _requireSaleView(saleId);
        return _claims[saleId];
    }

    function _requireSale(uint256 saleId) private view returns (Sale storage sale) {
        sale = _sales[saleId];
        if (sale.status == SaleStatus.NONE) revert SaleNotFound(saleId);
    }

    function _requireSaleView(uint256 saleId) private view returns (Sale memory sale) {
        sale = _sales[saleId];
        if (sale.status == SaleStatus.NONE) revert SaleNotFound(saleId);
    }

    function _requireState(uint256 saleId, Sale storage sale, SaleStatus expected) private view {
        if (sale.status != expected) revert InvalidSaleState(saleId, expected, sale.status);
    }

    function _checkLiability() private view {
        if (address(this).balance < totalLiability) revert LiabilityInvariantBroken();
    }
}
