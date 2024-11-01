const { ethers } = require("hardhat")
const { expect } = require("chai")

describe("BrandNFT", function () {
	let contract
	let owner
	let user
	const tokenURI = "https://tokenURI.com"
	const intSharesAmount = 100
	const sharesAmount = ethers.parseEther(`${intSharesAmount}`)
	const intTotalSharesToBuy = 10
	const totalSharesToBuy = ethers.parseEther(`${intTotalSharesToBuy}`)
	const NFTPrice = ethers.parseEther("1")
	const tokenPrice = ethers.parseEther("0.01")

	beforeEach(async function () {
		const signers = await ethers.getSigners()
		owner = signers[0]
		user = signers[1]

		const Contract = await ethers.getContractFactory("BrandNFT")
		contract = await Contract.deploy("BrandNFT", "BRDF")
		await contract.setBaseURI(tokenURI)
	})

	it("should create NFT and set the price", async function () {
		await contract.connect(owner).mintNFT(NFTPrice)
		expect(await contract.ownerOf(1)).to.equal(owner)
		expect((await contract.tokenIdToNFT(1)).price).to.equal(NFTPrice)
		expect(await contract.Track(owner)).to.equal(1)
	})

	it("should lock NFT and create BrandFractionalNFT", async function () {
		await contract.connect(owner).mintNFT(NFTPrice)

		await contract.connect(owner).createFractionalNFT(1, sharesAmount)
		const BrandFractionalNFTAddress = await contract.tokenIdToShare(1)
		const BrandFractionalNFT = await ethers.getContractAt(
			"BrandFractionalNFT",
			BrandFractionalNFTAddress
		)
		expect(await BrandFractionalNFT.balanceOf(contract)).to.equal(sharesAmount)
	})

	it("should allow buying BrandFractionalNFT shares", async function () {
		await contract.connect(owner).mintNFT(NFTPrice)
		await contract.connect(owner).createFractionalNFT(1, sharesAmount)
		const BrandFractionalNFTAddress = await contract.tokenIdToShare(1)
		const BrandFractionalNFT = await ethers.getContractAt(
			"BrandFractionalNFT",
			BrandFractionalNFTAddress
		)
		const initialTokenBalance = await BrandFractionalNFT.balanceOf(user)
		expect(initialTokenBalance).to.equal(0)
		await expect(() =>
			contract.connect(user).buyFractionalShares(1, totalSharesToBuy, {
				value: tokenPrice * BigInt(intTotalSharesToBuy),
			})
		).to.changeEtherBalance(owner, ethers.parseEther("0.1"))
		const finalTokenBalance = await BrandFractionalNFT.balanceOf(user)
		expect(finalTokenBalance).to.equal(totalSharesToBuy)
	})

	it("should revert buying BrandFractionalNFT shares with insufficient funds", async function () {
		await contract.connect(owner).mintNFT(NFTPrice)
		await contract.connect(owner).createFractionalNFT(1, sharesAmount)

		await expect(
			contract.connect(user).buyFractionalShares(1, totalSharesToBuy, {
				value: ethers.parseEther("0.05"),
			})
		).to.be.revertedWith("Insufficient funds")
	})

	it("should check sender NFTs", async function () {
		await contract.connect(owner).mintNFT(NFTPrice)
		await contract.connect(owner).createFractionalNFT(1, sharesAmount)

		// Check sender NFTs
		const fractions = await contract.connect(owner).fractions()
		expect(fractions.length).to.equal(1)
		expect(fractions[0].tokenID).to.equal(1)
	})

	it("should return the correct count of NFTs", async () => {
		let initialCount = await contract.getCount()
		expect(initialCount).to.equal(0)

		// Mint some NFTs
		await contract.mintNFT(NFTPrice)
		await contract.mintNFT(NFTPrice)

		// Get the updated count of NFTs
		let updatedCount = await contract.getCount()
		expect(updatedCount).to.equal(2)
	})

	it("should lock NFT with correct price and amount", async () => {
		// Define parameters
		await contract.connect(owner).mintNFT(NFTPrice)
		await contract.connect(owner).createFractionalNFT(1, sharesAmount)

		const token = await contract.tokenIdToNFT(1)
		const _shareValue = (await contract.tokenIdToNFT(1)).shareValue
		const _sharesAmount = (await contract.tokenIdToNFT(1)).sharesAmount

		expect(token.owner).to.equal(owner)
		expect(token.price).to.equal(NFTPrice) // Check if the price matches the original price
		expect(_shareValue).to.equal(tokenPrice) // Check if the share value is calculated correctly
		expect(_sharesAmount).to.equal(sharesAmount) // Check if the share value is calculated correctly

		let initialNFTState = (await contract.tokenIdToNFT(1)).state
		expect(Number(initialNFTState)).to.equal(1)
	})

	it("should return total shares available for a token", async () => {
		await contract.connect(owner).mintNFT(NFTPrice)
		await expect(contract.tokenSharesAvailable(1)).to.be.revertedWith("Token does not exist")
		await contract.connect(owner).createFractionalNFT(1, sharesAmount)
		const tokenSharesAvailable = await contract.tokenSharesAvailable(1)
		expect(tokenSharesAvailable).to.equal(sharesAmount)

		await contract.connect(user).buyFractionalShares(1, totalSharesToBuy, {
			value: tokenPrice * BigInt(intTotalSharesToBuy),
		})
		const tokenSharesAfterBuy = await contract.tokenSharesAvailable(1)
		expect(tokenSharesAfterBuy).to.equal(sharesAmount - totalSharesToBuy)
	})

	it("should block purchase if total shares exceed available shares", async () => {
		const intTotalSharesRequested = 150
		const totalSharesRequested = ethers.parseEther(`${intTotalSharesRequested}`) // Exceeds available shares
		await contract.connect(owner).mintNFT(NFTPrice)
		await contract.connect(owner).createFractionalNFT(1, sharesAmount)
		await expect(
			contract.connect(user).buyFractionalShares(1, totalSharesRequested, {
				value: tokenPrice * BigInt(intTotalSharesRequested),
			})
		).to.be.revertedWith("Exceeds available shares")
	})

	it("should change NFT state if sold out", async () => {
		await contract.connect(owner).mintNFT(NFTPrice)
		await contract.connect(owner).createFractionalNFT(1, sharesAmount)
		await contract.connect(user).buyFractionalShares(1, sharesAmount, {
			value: tokenPrice * BigInt(intSharesAmount),
		})
		expect(await contract.tokenSharesAvailable(1)).to.equal(0)
		let updatedNFTState = (await contract.tokenIdToNFT(1)).state
		expect(updatedNFTState).to.equal(2)
	})

	it("should disable fractional sale of NFT by the owner", async () => {
		await contract.connect(owner).mintNFT(NFTPrice)
		let initialNFTState = (await contract.tokenIdToNFT(1)).state
		expect(Number(initialNFTState)).to.equal(0)
		await contract.connect(owner).disableFractionalNFTSale(1)
		let updatedNFTState = (await contract.tokenIdToNFT(1)).state
		expect(updatedNFTState).to.equal(0)
	})

	it("should refund excess payment when buying shares", async () => {
		await contract.connect(owner).mintNFT(NFTPrice)
		await contract.connect(owner).createFractionalNFT(1, sharesAmount)

		const excessPayment = ethers.parseEther("1") // Excess payment of 0.5 ETH

		const initialUserBalance = await ethers.provider.getBalance(user)
		await contract.connect(user).buyFractionalShares(1, totalSharesToBuy, {
			value: tokenPrice * BigInt(intTotalSharesToBuy) + excessPayment,
		})
		const finalUserBalance = await ethers.provider.getBalance(user)
		expect(finalUserBalance).to.be.greaterThan(initialUserBalance - excessPayment)
	})
})
