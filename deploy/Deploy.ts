import { DeployFunction } from "hardhat-deploy/types"
import { ethers } from "hardhat"
import { HardhatRuntimeEnvironment } from "hardhat/types"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
	const [deployer] = await ethers.getSigners()

	console.log("Deployer", deployer.address)

	await hre.deployments.deploy("BrandNFT", {
		from: deployer.address,
		args: ["BrandNFT", "BRDF"],
		log: true,
	})
}
export default func
func.tags = ["main"]
