// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract VehicleNFT is ERC721, Ownable {
    uint256 public nextTokenId = 1;

    constructor(address developmentOwner) ERC721("MotorCove Vehicle", "MCV") Ownable(developmentOwner) {
        if (developmentOwner == address(0)) revert OwnableInvalidOwner(address(0));
    }

    function mint(address recipient) external onlyOwner returns (uint256 tokenId) {
        if (recipient == address(0)) revert ERC721InvalidReceiver(address(0));
        tokenId = nextTokenId++;
        _safeMint(recipient, tokenId);
    }
}
