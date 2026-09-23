// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.24;

import {MotorCoveEscrow} from "../../src/MotorCoveEscrow.sol";
import {VehicleNFT} from "../../src/VehicleNFT.sol";
import {IMotorCoveEscrow} from "../../src/interfaces/IMotorCoveEscrow.sol";
import {TestBase} from "../TestBase.sol";

contract RejectEtherReceiver {
    receive() external payable {
        revert("ETH_REJECTED");
    }
}

contract RejectNftBuyer {
    function fund(MotorCoveEscrow escrow, uint256 saleId) external payable {
        escrow.fundSale{value: msg.value}(saleId);
    }

    function complete(MotorCoveEscrow escrow, uint256 saleId) external {
        escrow.completeSale(saleId);
    }

    function withdrawRefund(MotorCoveEscrow escrow, uint256 saleId, address payable recipient) external {
        escrow.withdrawPayment(saleId, recipient);
    }

    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        revert("NFT_REJECTED");
    }
}

contract MotorCoveEscrowTest is TestBase {
    VehicleNFT internal nft;
    MotorCoveEscrow internal escrow;
    address internal seller;
    address internal buyer;
    address internal outsider;
    uint256 internal tokenId;
    uint256 internal constant PRICE = 2 ether;

    function setUp() public {
        seller = vm.addr(2);
        buyer = vm.addr(3);
        outsider = vm.addr(4);
        vm.deal(buyer, 20 ether);
        nft = new VehicleNFT(address(this));
        escrow = new MotorCoveEscrow(address(nft), 300, keccak256("deployment-test"));
        nft.setEscrow(address(escrow));
        tokenId = nft.mint(seller);
    }

    function _list() internal returns (uint256 saleId) {
        vm.startPrank(seller);
        nft.approve(address(escrow), tokenId);
        saleId = escrow.createSale(tokenId, PRICE, buyer);
        vm.stopPrank();
    }

    function testReservedBuyerOnlyCanFund() public {
        vm.prank(seller);
        nft.approve(address(escrow), tokenId);
        vm.prank(seller);
        uint256 saleId = escrow.createSale(tokenId, PRICE, buyer);

        IMotorCoveEscrow.Sale memory sale = escrow.getSale(saleId);
        assertEq(sale.allowedBuyer, buyer, "reservation recorded");
        assertEq(sale.buyer, address(0), "actual buyer absent before funding");

        vm.deal(outsider, PRICE);
        vm.prank(outsider);
        vm.expectRevert(abi.encodeWithSelector(MotorCoveEscrow.NotAllowedBuyer.selector, outsider, buyer));
        escrow.fundSale{value: PRICE}(saleId);

        vm.prank(buyer);
        escrow.fundSale{value: PRICE}(saleId);
        sale = escrow.getSale(saleId);
        assertEq(sale.buyer, sale.allowedBuyer, "actual buyer matches reservation");
    }

    function testReservedBuyerMustBeNonzeroAndDifferentFromSeller() public {
        vm.prank(seller);
        nft.approve(address(escrow), tokenId);
        vm.prank(seller);
        vm.expectRevert(MotorCoveEscrow.ZeroAddress.selector);
        escrow.createSale(tokenId, PRICE, address(0));

        vm.prank(seller);
        vm.expectRevert(MotorCoveEscrow.SellerCannotBuy.selector);
        escrow.createSale(tokenId, PRICE, seller);
        assertEq(escrow.saleCount(), 0, "invalid reservation cannot list");
        assertEq(nft.ownerOf(tokenId), seller, "invalid reservation keeps seller custody");
    }

    function _fund(uint256 saleId) internal {
        vm.prank(buyer);
        escrow.fundSale{value: PRICE}(saleId);
    }

    function testSale001ApproveAndListMovesNftIntoEscrow() public {
        vm.prank(seller);
        nft.approve(address(escrow), tokenId);
        assertEq(nft.ownerOf(tokenId), seller, "approval is not custody");
        vm.prank(seller);
        uint256 saleId = escrow.createSale(tokenId, PRICE, buyer);
        assertEq(nft.ownerOf(tokenId), address(escrow), "listing takes custody");
        assertEq(escrow.custodySaleId(tokenId), saleId, "custody lock");
    }

    function testCannotListWithoutApproval() public {
        vm.prank(seller);
        vm.expectRevert();
        escrow.createSale(tokenId, PRICE, buyer);
    }

    function testCannotListZeroPrice() public {
        vm.prank(seller);
        nft.approve(address(escrow), tokenId);
        vm.prank(seller);
        vm.expectRevert(MotorCoveEscrow.InvalidPrice.selector);
        escrow.createSale(tokenId, 0, buyer);
    }

    function testSale002RequiresExactPaymentAndRejectsSeller() public {
        uint256 saleId = _list();
        vm.prank(buyer);
        vm.expectRevert();
        escrow.fundSale{value: PRICE - 1}(saleId);
        vm.prank(buyer);
        vm.expectRevert();
        escrow.fundSale{value: PRICE + 1}(saleId);
        vm.deal(seller, PRICE);
        vm.prank(seller);
        vm.expectRevert(MotorCoveEscrow.SellerCannotBuy.selector);
        escrow.fundSale{value: PRICE}(saleId);
        _fund(saleId);
        assertEq(escrow.totalLiability(), PRICE, "funded principal liability");
        vm.prank(outsider);
        vm.expectRevert();
        escrow.fundSale{value: PRICE}(saleId);
    }

    function testSale003CompleteCreatesClaimAndWithdraws() public {
        uint256 saleId = _list();
        _fund(saleId);
        vm.prank(buyer);
        escrow.completeSale(saleId);
        assertEq(nft.ownerOf(tokenId), buyer, "buyer receives NFT");
        IMotorCoveEscrow.PaymentClaim memory claim = escrow.getPaymentClaim(saleId);
        assertEq(claim.beneficiary, seller, "seller beneficiary");
        assertEq(claim.amountWei, PRICE, "seller proceeds");
        uint256 beforeBalance = seller.balance;
        vm.prank(seller);
        escrow.withdrawPayment(saleId, payable(seller));
        assertEq(seller.balance, beforeBalance + PRICE, "seller withdrawal");
        vm.prank(seller);
        vm.expectRevert();
        escrow.withdrawPayment(saleId, payable(seller));
    }

    function testSale004CancelAndReclaimAreSeparate() public {
        uint256 saleId = _list();
        vm.prank(seller);
        escrow.cancelSale(saleId);
        assertEq(nft.ownerOf(tokenId), address(escrow), "cancel keeps custody until reclaim");
        vm.prank(outsider);
        vm.expectRevert();
        escrow.reclaimToken(saleId, outsider);
        vm.prank(seller);
        escrow.reclaimToken(saleId, seller);
        assertEq(nft.ownerOf(tokenId), seller, "seller reclaims");
    }

    function testSale005DeadlineEqualityExpiresRefundsAndReclaims() public {
        uint256 saleId = _list();
        _fund(saleId);
        IMotorCoveEscrow.Sale memory sale = escrow.getSale(saleId);
        vm.warp(sale.expiresAt);
        vm.prank(buyer);
        vm.expectRevert();
        escrow.completeSale(saleId);
        vm.prank(outsider);
        escrow.expireSale(saleId);
        assertEq(nft.ownerOf(tokenId), address(escrow), "expiry does not force NFT delivery");
        uint256 buyerBefore = buyer.balance;
        vm.prank(buyer);
        escrow.withdrawPayment(saleId, payable(buyer));
        assertEq(buyer.balance, buyerBefore + PRICE, "buyer refund");
        vm.prank(seller);
        escrow.reclaimToken(saleId, seller);
        assertEq(nft.ownerOf(tokenId), seller, "seller reclaims expired NFT");
        assertEq(escrow.totalLiability(), 0, "all liabilities settled");
    }

    function testBeforeDeadlineCannotExpire() public {
        uint256 saleId = _list();
        _fund(saleId);
        vm.expectRevert();
        escrow.expireSale(saleId);
    }

    function testRejectingEthRecipientKeepsClaimRetryable() public {
        uint256 saleId = _list();
        _fund(saleId);
        vm.prank(buyer);
        escrow.completeSale(saleId);

        RejectEtherReceiver rejector = new RejectEtherReceiver();
        vm.prank(seller);
        vm.expectRevert(MotorCoveEscrow.PaymentTransferFailed.selector);
        escrow.withdrawPayment(saleId, payable(address(rejector)));

        IMotorCoveEscrow.PaymentClaim memory claim = escrow.getPaymentClaim(saleId);
        assertEq(uint256(claim.status), uint256(IMotorCoveEscrow.ClaimStatus.CLAIMABLE), "claim remains retryable");
        assertEq(escrow.totalLiability(), PRICE, "failed transfer preserves liability");

        vm.prank(seller);
        escrow.withdrawPayment(saleId, payable(seller));
        assertEq(escrow.totalLiability(), 0, "retry settles liability");
    }

    function testRejectingNftBuyerCanExpireAndRecoverFunds() public {
        RejectNftBuyer rejectingBuyer = new RejectNftBuyer();
        vm.prank(seller);
        nft.approve(address(escrow), tokenId);
        vm.prank(seller);
        uint256 saleId = escrow.createSale(tokenId, PRICE, address(rejectingBuyer));
        vm.deal(address(rejectingBuyer), PRICE);
        rejectingBuyer.fund{value: PRICE}(escrow, saleId);

        vm.expectRevert();
        rejectingBuyer.complete(escrow, saleId);
        IMotorCoveEscrow.Sale memory sale = escrow.getSale(saleId);
        assertEq(
            uint256(sale.status),
            uint256(IMotorCoveEscrow.SaleStatus.FUNDED),
            "failed NFT delivery rolls back completion"
        );
        assertEq(nft.ownerOf(tokenId), address(escrow), "escrow retains NFT after failed delivery");

        vm.warp(sale.expiresAt);
        escrow.expireSale(saleId);
        uint256 buyerBefore = buyer.balance;
        rejectingBuyer.withdrawRefund(escrow, saleId, payable(buyer));
        assertEq(buyer.balance, buyerBefore + PRICE, "buyer contract can recover refund");
    }

    function testDirectSafeTransferIsRejected() public {
        vm.prank(seller);
        vm.expectRevert(abi.encodeWithSelector(VehicleNFT.UnauthorizedEscrowTransfer.selector, seller));
        nft.safeTransferFrom(seller, address(escrow), tokenId);
    }

    function testDirectUnsafeTransferIsRejectedWithoutStrandingToken() public {
        vm.prank(seller);
        vm.expectRevert(abi.encodeWithSelector(VehicleNFT.UnauthorizedEscrowTransfer.selector, seller));
        nft.transferFrom(seller, address(escrow), tokenId);

        assertEq(nft.ownerOf(tokenId), seller, "seller retains rejected direct transfer");
        assertEq(escrow.custodySaleId(tokenId), 0, "no untracked custody entry");
    }

    function testOrdinaryTransferOutsideEscrowRemainsAvailable() public {
        vm.prank(seller);
        nft.transferFrom(seller, outsider, tokenId);
        assertEq(nft.ownerOf(tokenId), outsider, "ordinary transfer reaches recipient");
    }

    function testUnexpectedReceiverCallbackRemainsRejected() public {
        vm.expectRevert(MotorCoveEscrow.UnexpectedNftTransfer.selector);
        escrow.onERC721Received(address(escrow), seller, tokenId, "");
    }

    function testEscrowBindingCannotBeChanged() public {
        vm.expectRevert(VehicleNFT.EscrowAlreadyBound.selector);
        nft.setEscrow(outsider);
        assertEq(nft.motorCoveEscrow(), address(escrow), "escrow binding remains final");
    }

    function testFuzzFundedBalanceCoversLiability(uint96 rawPrice) public {
        uint256 price = uint256(rawPrice) + 1;
        vm.startPrank(seller);
        nft.approve(address(escrow), tokenId);
        uint256 saleId = escrow.createSale(tokenId, price, buyer);
        vm.stopPrank();
        vm.deal(buyer, price);
        vm.prank(buyer);
        escrow.fundSale{value: price}(saleId);
        assertTrue(address(escrow).balance >= escrow.totalLiability(), "solvent after funding");
    }
}
