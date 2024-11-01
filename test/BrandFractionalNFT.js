const { ethers } = require("hardhat")
const { expect } = require("chai")

describe("BrandFractionalNFT", function () {
	let contract
	let owner
	let user

	beforeEach(async function () {
		const signers = await ethers.getSigners()
		owner = signers[0]
		user = signers[1]

		const Contract = await ethers.getContractFactory("BrandFractionalNFT")
		contract = await Contract.deploy("BrandFractionalNFT", "FNFT", 10000)
	})

	it("Should have correct initial values", async function () {
		expect(await contract.name()).to.equal("BrandFractionalNFT")
		expect(await contract.symbol()).to.equal("FNFT")
		expect(await contract.totalSupply()).to.equal(10000)
		expect(await contract.balanceOf(owner.address)).to.equal(10000)
	})

	it("Should not allow non-owner to mint tokens", async function () {
		await expect(contract.connect(user).mint(user.address, 10000))
		expect(await contract.balanceOf(user.address)).to.equal(0)
	})
})
