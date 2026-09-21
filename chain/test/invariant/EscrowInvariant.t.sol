// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.24;

import {MotorCoveEscrow} from "../../src/MotorCoveEscrow.sol";
import {VehicleNFT} from "../../src/VehicleNFT.sol";
import {IMotorCoveEscrow} from "../../src/interfaces/IMotorCoveEscrow.sol";
import {TestBase, Vm} from "../TestBase.sol";

contract EscrowHandler {
    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    VehicleNFT internal immutable nft;
    MotorCoveEscrow internal immutable escrow;
    address internal immutable seller;
    address internal immutable buyer;
    uint256 internal immutable tokenId;

    uint256 public currentSaleId;
    uint256 public calls;

    constructor(VehicleNFT nft_, MotorCoveEscrow escrow_, address seller_, address buyer_, uint256 tokenId_) {
        nft = nft_;
        escrow = escrow_;
        seller = seller_;
        buyer = buyer_;
        tokenId = tokenId_;
    }

    function list(uint96 rawPrice) external {
        calls += 1;
        if (nft.ownerOf(tokenId) != seller || escrow.custodySaleId(tokenId) != 0) return;
        uint256 price = uint256(rawPrice) + 1;
        vm.prank(seller);
        nft.approve(address(escrow), tokenId);
        vm.prank(seller);
        currentSaleId = escrow.createSale(tokenId, price);
    }

    function fund() external {
        calls += 1;
        if (currentSaleId == 0) return;
        IMotorCoveEscrow.Sale memory sale = escrow.getSale(currentSaleId);
        if (sale.status != IMotorCoveEscrow.SaleStatus.LISTED) return;
        vm.deal(buyer, sale.priceWei);
        vm.prank(buyer);
        escrow.fundSale{value: sale.priceWei}(currentSaleId);
    }

    function complete() external {
        calls += 1;
        if (currentSaleId == 0) return;
        IMotorCoveEscrow.Sale memory sale = escrow.getSale(currentSaleId);
        if (sale.status != IMotorCoveEscrow.SaleStatus.FUNDED || block.timestamp >= sale.expiresAt) return;
        vm.prank(buyer);
        escrow.completeSale(currentSaleId);
    }

    function cancel() external {
        calls += 1;
        if (currentSaleId == 0) return;
        IMotorCoveEscrow.Sale memory sale = escrow.getSale(currentSaleId);
        if (sale.status != IMotorCoveEscrow.SaleStatus.LISTED) return;
        vm.prank(seller);
        escrow.cancelSale(currentSaleId);
    }

    function expire() external {
        calls += 1;
        if (currentSaleId == 0) return;
        IMotorCoveEscrow.Sale memory sale = escrow.getSale(currentSaleId);
        if (sale.status != IMotorCoveEscrow.SaleStatus.FUNDED) return;
        vm.warp(sale.expiresAt);
        escrow.expireSale(currentSaleId);
    }

    function withdraw() external {
        calls += 1;
        if (currentSaleId == 0) return;
        IMotorCoveEscrow.PaymentClaim memory claim = escrow.getPaymentClaim(currentSaleId);
        if (claim.status != IMotorCoveEscrow.ClaimStatus.CLAIMABLE) return;
        vm.prank(claim.beneficiary);
        escrow.withdrawPayment(currentSaleId, payable(claim.beneficiary));
    }

    function reclaim() external {
        calls += 1;
        if (currentSaleId == 0) return;
        IMotorCoveEscrow.Sale memory sale = escrow.getSale(currentSaleId);
        if (
            (sale.status != IMotorCoveEscrow.SaleStatus.CANCELLED && sale.status != IMotorCoveEscrow.SaleStatus.EXPIRED)
                || sale.tokenReclaimed
        ) return;
        vm.prank(seller);
        escrow.reclaimToken(currentSaleId, seller);
    }
}

contract EscrowInvariantTest is TestBase {
    MotorCoveEscrow internal escrow;
    EscrowHandler internal handler;
    address[] internal invariantTargets;

    function setUp() public {
        address seller = vm.addr(10);
        address buyer = vm.addr(11);
        VehicleNFT nft = new VehicleNFT(address(this));
        escrow = new MotorCoveEscrow(address(nft), 300, keccak256("invariant-deployment"));
        uint256 tokenId = nft.mint(seller);
        handler = new EscrowHandler(nft, escrow, seller, buyer, tokenId);
        invariantTargets.push(address(handler));
    }

    function targetContracts() public view returns (address[] memory) {
        return invariantTargets;
    }

    function invariantBalanceAlwaysCoversRecordedLiability() public view {
        require(address(escrow).balance >= escrow.totalLiability(), "insolvent escrow");
    }
}
