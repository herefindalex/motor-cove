// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract VehicleNFT is ERC721, Ownable {
    error InvalidEscrow();
    error EscrowAlreadyBound();
    error UnauthorizedEscrowTransfer(address operator);

    uint256 public nextTokenId = 1;
    address public motorCoveEscrow;

    constructor(address developmentOwner) ERC721("MotorCove Vehicle", "MCV") Ownable(developmentOwner) {
        if (developmentOwner == address(0)) revert OwnableInvalidOwner(address(0));
    }

    function mint(address recipient) external onlyOwner returns (uint256 tokenId) {
        if (recipient == address(0)) revert ERC721InvalidReceiver(address(0));
        tokenId = nextTokenId++;
        _safeMint(recipient, tokenId);
    }

    function setEscrow(address escrow) external onlyOwner {
        if (escrow == address(0)) revert InvalidEscrow();
        if (motorCoveEscrow != address(0)) revert EscrowAlreadyBound();
        motorCoveEscrow = escrow;
    }

    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        if (motorCoveEscrow != address(0) && to == motorCoveEscrow && auth != motorCoveEscrow) {
            revert UnauthorizedEscrowTransfer(auth);
        }
        return super._update(to, tokenId, auth);
    }
}
