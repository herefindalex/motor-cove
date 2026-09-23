// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.24;

interface IMotorCoveEscrow {
    enum SaleStatus {
        NONE,
        LISTED,
        FUNDED,
        COMPLETED,
        CANCELLED,
        EXPIRED
    }
    enum ClaimKind {
        NONE,
        SELLER_PROCEEDS,
        BUYER_REFUND
    }
    enum ClaimStatus {
        NONE,
        CLAIMABLE,
        WITHDRAWN
    }

    struct Sale {
        uint256 tokenId;
        address seller;
        address allowedBuyer;
        address buyer;
        uint256 priceWei;
        uint64 fundedAt;
        uint64 expiresAt;
        SaleStatus status;
        bool tokenReclaimed;
    }

    struct PaymentClaim {
        address beneficiary;
        uint256 amountWei;
        ClaimKind kind;
        ClaimStatus status;
    }

    event SaleCreated(
        uint256 indexed saleId,
        uint256 indexed tokenId,
        address indexed seller,
        address allowedBuyer,
        uint256 priceWei
    );
    event SaleFunded(
        uint256 indexed saleId, address indexed buyer, uint256 amountWei, uint64 fundedAt, uint64 expiresAt
    );
    event SaleCompleted(uint256 indexed saleId, uint256 indexed tokenId, address indexed buyer);
    event SaleCancelled(uint256 indexed saleId, uint256 indexed tokenId, address indexed seller);
    event SaleExpired(uint256 indexed saleId, uint256 indexed tokenId, address indexed buyer);
    event PaymentClaimCreated(uint256 indexed saleId, address indexed beneficiary, uint256 amountWei, ClaimKind kind);
    event PaymentWithdrawn(
        uint256 indexed saleId,
        address indexed beneficiary,
        address indexed recipient,
        uint256 amountWei,
        ClaimKind kind
    );
    event TokenReclaimed(uint256 indexed saleId, uint256 indexed tokenId, address indexed recipient);

    function createSale(uint256 tokenId, uint256 priceWei, address allowedBuyer) external returns (uint256 saleId);
    function fundSale(uint256 saleId) external payable;
    function completeSale(uint256 saleId) external;
    function cancelSale(uint256 saleId) external;
    function expireSale(uint256 saleId) external;
    function withdrawPayment(uint256 saleId, address payable recipient) external;
    function reclaimToken(uint256 saleId, address recipient) external;

    function deploymentId() external view returns (bytes32);
    function fundingPeriodSeconds() external view returns (uint64);
    function saleCount() external view returns (uint256);
    function getSale(uint256 saleId) external view returns (Sale memory);
    function getPaymentClaim(uint256 saleId) external view returns (PaymentClaim memory);
    function custodySaleId(uint256 tokenId) external view returns (uint256);
    function totalLiability() external view returns (uint256);
}
