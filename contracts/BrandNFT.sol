// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { ERC721 } from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import { Strings } from "@openzeppelin/contracts/utils/Strings.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { SafeMath } from "./openzeppelin/math/SafeMath.sol";
import { BrandFractionalNFT } from "./BrandFractionalNFT.sol";

contract BrandNFT is ERC721, Ownable, ReentrancyGuard {
	using SafeMath for uint256;
	uint256 private _nextTokenId;

	mapping(address => uint256) public Track;

	enum FractionalState {
		INACTIVE,
		FOR_SELL,
		SOLD_OUT
	}

	struct NFT {
		uint256 tokenID;
		address payable owner;
		uint256 price;
		uint256 sharesAmount;
		uint256 shareValue;
		FractionalState state;
	}

	mapping(address => mapping(uint256 => uint256)) private _userTokenPurchase;

	mapping(uint256 => uint256) private _totalPurchasedShares;
	mapping(uint256 => NFT) public tokenIdToNFT;
	mapping(uint256 => BrandFractionalNFT) public tokenIdToShare;

	event FractionalSharesBought(
		address indexed buyer,
		uint256 indexed tokenId,
		uint256 totalSharesBought,
		uint256 totalPricePaid
	);

	constructor(
		string memory _name,
		string memory _symbol
	) ERC721(_name, _symbol) Ownable(msg.sender) {
		_nextTokenId = 1;
		_baseTokenURI = "";
	}

	function _create(address receiver) internal returns (uint256) {
		uint256 tokenId = _nextTokenId++;
		_safeMint(receiver, tokenId);
		Track[receiver] = tokenId;
		return tokenId;
	}

	string private _baseTokenURI;

	function _baseURI() internal view virtual override returns (string memory) {
		return _baseTokenURI;
	}

	function setBaseURI(string calldata baseURI) external onlyOwner {
		_baseTokenURI = baseURI;
	}

	function _transferNFT(
		address _sender,
		address _receiver,
		uint256 _tokenId
	) internal {
		_transfer(_sender, _receiver, _tokenId);
		delete Track[_sender];
		Track[_receiver] = _tokenId;
	}

	// create NFT from fractional contract
	function mintNFT(uint256 _price) public onlyOwner nonReentrant {
		uint256 _tokenId = _create(msg.sender);
		tokenIdToNFT[_tokenId] = NFT(
			_tokenId,
			payable(msg.sender),
			_price,
			0,
			0,
			FractionalState.INACTIVE
		);
	}

	function createFractionalNFT(
		uint256 _tokenId,
		uint256 _sharesAmount
	) public onlyOwner nonReentrant {
		require(
			address(tokenIdToShare[_tokenId]) == address(0),
			"NFT with this ID is already locked"
		);
		string memory _tokenName = "Brand Fractional NFT";
		string memory _tokenSymbol = "BRDFN";

		string memory tokenID = Strings.toString(_tokenId);
		string memory tokenName = string(abi.encodePacked(_tokenName, tokenID));
		string memory tokenSymbol = string(
			abi.encodePacked(_tokenSymbol, tokenID)
		);
		_transferNFT(msg.sender, address(this), _tokenId);
		BrandFractionalNFT fToken = new BrandFractionalNFT(
			tokenName,
			tokenSymbol,
			_sharesAmount
		);
		fToken.transfer(address(this), _sharesAmount);
		tokenIdToShare[_tokenId] = fToken;
		tokenIdToNFT[_tokenId].sharesAmount = _sharesAmount;
		tokenIdToNFT[_tokenId].shareValue = tokenIdToNFT[_tokenId].price.div(
			_toEther(_sharesAmount)
		);
		tokenIdToNFT[_tokenId].state = FractionalState.FOR_SELL;
	}

	function buyFractionalShares(
		uint256 _tokenId,
		uint256 _totalShares
	) public payable nonReentrant {
		require(
			address(tokenIdToShare[_tokenId]) != address(0),
			"Token does not exist"
		);
		uint256 totalShares = _toEther(_totalShares);
		uint256 shareValue = tokenIdToNFT[_tokenId].shareValue;
		uint256 requiredAmount = shareValue.mul(totalShares);
		require(msg.value >= requiredAmount, "Insufficient funds");

		uint256 totalSharesAvailable = tokenSharesAvailable(_tokenId);
		require(
			_totalShares <= totalSharesAvailable,
			"Exceeds available shares"
		);

		address payable nftOwner = tokenIdToNFT[_tokenId].owner;
		(bool success, ) = payable(nftOwner).call{ value: requiredAmount }("");
		require(success, "Transfer failed");

		if (msg.value > requiredAmount) {
			payable(msg.sender).transfer(msg.value - requiredAmount);
		}

		// Transfer fractional shares to buyer
		tokenIdToShare[_tokenId].transfer(msg.sender, _totalShares);
		// Update purchase and total shares
		_userTokenPurchase[msg.sender][_tokenId] += _totalShares;
		_totalPurchasedShares[_tokenId] += _totalShares;

		if (tokenSharesAvailable(_tokenId) == 0) {
			tokenIdToNFT[_tokenId].state = FractionalState.SOLD_OUT;
		}
		emit FractionalSharesBought(
			msg.sender,
			_tokenId,
			_totalShares,
			shareValue
		);
	}

	function fractions() public view returns (NFT[] memory) {
		uint256 totalItemCount = _nextTokenId - 1;
		NFT[] memory items = new NFT[](totalItemCount);

		for (uint256 i = 0; i < totalItemCount; i++) {
			uint256 currentId = i + 1;
			NFT storage currentItem = tokenIdToNFT[currentId];
			items[i] = currentItem;
		}
		return items;
	}

	function getCount() public view returns (uint256) {
		return _nextTokenId - 1;
	}

	function userTokenShares(
		address _user
	) public view returns (uint256[] memory tokenIds, uint256[] memory shares) {
		uint256 totalTokenCount = _nextTokenId - 1;
		uint256[] memory userTokenIds = new uint256[](totalTokenCount);
		uint256[] memory userShares = new uint256[](totalTokenCount);

		uint256 userTokenCount = 0;

		for (uint256 i = 1; i <= totalTokenCount; i++) {
			uint256 tokenId = i;
			if (_userTokenPurchase[_user][tokenId] > 0) {
				userTokenIds[userTokenCount] = tokenId;
				userShares[userTokenCount] = _userTokenPurchase[_user][tokenId];
				userTokenCount++;
			}
		}
		assembly {
			mstore(tokenIds, userTokenCount)
			mstore(shares, userTokenCount)
		}
		return (userTokenIds, userShares);
	}

	function tokenSharesAvailable(
		uint256 _tokenId
	) public view returns (uint256) {
		require(
			address(tokenIdToShare[_tokenId]) != address(0),
			"Token does not exist"
		);
		return
			tokenIdToShare[_tokenId].totalSupply() -
			_totalPurchasedShares[_tokenId];
	}

	function disableFractionalNFTSale(uint256 _tokenId) public onlyOwner {
		require(
			tokenIdToNFT[_tokenId].owner == msg.sender,
			"You are not the owner"
		);
		tokenIdToNFT[_tokenId].state = FractionalState.INACTIVE;
	}

	function _toEther(uint256 weiAmount) internal pure returns (uint256) {
		return weiAmount / 1 ether;
	}
}
