const {
  time,
  loadFixture,
} = require("@nomicfoundation/hardhat-network-helpers");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { expect } = require("chai");

describe("Helper", function () {
	const ONE_HOUR_LATER = Math.floor(+new Date() / 1000) + 3600
	const TOKEN_UNIT = 10n**18n

	async function deployRandomcase () {
		/* 
			Deploy : Two ERC20 token,
				UniswapV2 factory / router, 
				then create a pair for thoes tokens

			Setup : Mint / transfer / approve tokens,
				init pool by add liquidity
		*/

		const settings = {
			tokenASymbol : "MAT",
			tokenBSymbol : "MBT",

			poolReserveA : BigInt(Math.floor(Math.random() * 1000000)) * TOKEN_UNIT,
			poolReserveB : BigInt(Math.floor(Math.random() * 1000000)) * TOKEN_UNIT,

			requestQuantity : BigInt(Math.floor(Math.random() * 1000000)) * TOKEN_UNIT,
		}

		const [deployer, tester, stranger] = await ethers.getSigners();

		const ERC20 = await ethers.getContractFactory("MockToken")
		const tokenA = await ERC20.deploy(settings.tokenASymbol, settings.tokenASymbol);
		await tokenA.mint(deployer.address, settings.poolReserveA + settings.requestQuantity)
		await tokenA.connect(deployer).transfer(tester.address, settings.requestQuantity)
		const tokenB = await ERC20.deploy(settings.tokenBSymbol, settings.tokenBSymbol);
		await tokenB.mint(deployer.address, settings.poolReserveB)

		const Factory = await ethers.getContractFactory("UniswapV2Factory")
		const factory = await Factory.deploy(deployer.address)
		const Router = await ethers.getContractFactory("UniswapV2Router")
		const router = await Router.deploy(factory.address, "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2") // input weth address arbitrarily

		await tokenA.connect(deployer).approve(router.address, settings.poolReserveA)
		await tokenB.connect(deployer).approve(router.address, settings.poolReserveB)
		await router.connect(deployer).addLiquidity(tokenA.address, tokenB.address, settings.poolReserveA, settings.poolReserveB, 0, 0, deployer.address, ONE_HOUR_LATER)

		const Pair = await ethers.getContractFactory("UniswapV2Pair")
		const pair = await Pair.attach(await factory.getPair(tokenA.address, tokenB.address))

		const Helper = await ethers.getContractFactory("Helper")
		const helper = await Helper.deploy(router.address)
		await tokenA.connect(tester).approve(helper.address, settings.requestQuantity)

		return { 
			settings, 
			contracts : {tokenA, tokenB, factory, router, pair, helper},
			accounts : {deployer, tester, stranger}
		}
	}

	describe("Deploy (Dependency)", () => {
		it("TokenA supply is equal to settings", async () => {
			const Fixture = await loadFixture(deployRandomcase);

			expect(BigInt(await Fixture.contracts.tokenA.totalSupply())).to.equal(Fixture.settings.poolReserveA + Fixture.settings.requestQuantity)
		})
		it("TokenA balance of tester should be equal to settings", async () => {
			const Fixture = await loadFixture(deployRandomcase);

			expect(
				BigInt(await Fixture.contracts.tokenA.balanceOf(Fixture.accounts.tester.address))
			).to.equal(
				Fixture.settings.requestQuantity
			)
		})
		it("TokenA allowance from tester to helper", async () => {
			const Fixture = await loadFixture(deployRandomcase);

			expect(
				BigInt(await Fixture.contracts.tokenA.allowance(
					Fixture.accounts.tester.address, 
					Fixture.contracts.helper.address
				))
			).to.equal(
				Fixture.settings.requestQuantity
			)
		})
		it("Factory see deployer", async () => {
			const Fixture = await loadFixture(deployRandomcase);

			expect(await Fixture.contracts.factory.feeToSetter()).to.equal(Fixture.accounts.deployer.address)
		})
		it("Router see factory", async () => {
			const Fixture = await loadFixture(deployRandomcase);

			expect(await Fixture.contracts.router.factory()).to.equal(Fixture.contracts.factory.address)
		})
		it("Pair pool token0 see tokenA", async () => {
			const Fixture = await loadFixture(deployRandomcase);

			expect(await Fixture.contracts.pair.token0()).to.equal(Fixture.contracts.tokenA.address)
		})
		it("Pool reserve0 is equal to setting", async () => {
			const Fixture = await loadFixture(deployRandomcase);

			const reserves = await Fixture.contracts.pair.getReserves()

			expect(BigInt(reserves[0])).to.equal(Fixture.settings.poolReserveA)
		})
	})
	describe("Helper", () => {
		describe("Deploy", () => {
			it("Deploy : See router properly", async () => {
				const Fixture = await loadFixture(deployRandomcase);

				expect(await Fixture.contracts.helper.getRouter()).to.equal(Fixture.contracts.router.address)
			})
		});

		describe("determineSwapQuantity", () => {
			it("Test case #1", async () => {
				const Fixture = await loadFixture(deployRandomcase);

				const swapQuantity = BigInt(await Fixture.contracts.helper.determineSwapQuantity(
					156n * TOKEN_UNIT,
					100n * TOKEN_UNIT
				))

				expect(swapQuantity).to.equal(60n * TOKEN_UNIT)
			})
			it("Test case - random", async () => {
				const Fixture = await loadFixture(deployRandomcase);

				const requested = BigInt(Math.floor(Math.random() * 10000)) + 1n
				const reserveA = BigInt(Math.floor(Math.random() * 1000000)) + 1n

				const answer = Formula.sqrtForBigInt(reserveA * requested + reserveA * reserveA) - reserveA; // x = -a + sqrt(ta-a^2)

				const swapQuantity = BigInt(await Fixture.contracts.helper.determineSwapQuantity(
					requested,
					reserveA
				))

				expect(swapQuantity).to.equal(answer)
			})

			// const requested = BigInt(Math.floor(Math.random() * 10000)) * TOKEN_UNIT + 1n
			// const reserveA = BigInt(Math.floor(Math.random() * 1000000)) * TOKEN_UNIT + 1n

			// it("Test V2", async () => {
			// 	const Fixture = await loadFixture(deployRandomcase);

			// 	for(let x = 10n; x <= 30n; x += 5n){
			// 		console.log("--- Case ", x)
			// 		const swapQuantity = Formula.determineSwapQuantityV2WithCustomFee(Fixture.settings.requestQuantity, Fixture.settings.poolReserveA, x)
			// 		console.log("SwapQuantity", swapQuantity)
			// 		const swapOutput = determineSwapOutput(swapQuantity, Fixture.settings.poolReserveA, Fixture.settings.poolReserveB)
			// 		console.log("swapOutput", swapOutput)
			// 		const quoteValue = determineQuoteValue(swapQuantity, swapOutput, Fixture.settings.poolReserveA, Fixture.settings.poolReserveB, x)
			// 		console.log("quoteValue", quoteValue)
			// 		console.log("InputQuantity", swapQuantity + quoteValue)
			// 		// if(swapQuantity + quoteValue > Fixture.settings.requestQuantity){
			// 		// 	console.log("!!!ERROR!!!")
			// 		// }else{}
			// 		console.log("Usage", (swapQuantity + quoteValue) * 1000000n / Fixture.settings.requestQuantity)

			// 	}

			// 	expect(1).to.equal(1)
			// })
		})

		describe("expectQueries", () => {
			it("swapQuantity should be less than input", async () => {
				const Fixture = await loadFixture(deployRandomcase);

				const expectation = await Fixture.contracts.helper.expectQueries(...[
					Fixture.contracts.pair.address,
					Fixture.contracts.tokenA.address,
					Fixture.settings.requestQuantity
				])

				expect(BigInt(expectation.swapQuantity)).to.be.below(BigInt(expectation.inputQuantity))
			})
			it("inputQuantity should be less than requested", async () => {
				const Fixture = await loadFixture(deployRandomcase);

				const expectation = await Fixture.contracts.helper.expectQueries(...[
					Fixture.contracts.pair.address,
					Fixture.contracts.tokenA.address,
					Fixture.settings.requestQuantity
				])

				expect(BigInt(expectation.inputQuantity)).to.be.below(Fixture.settings.requestQuantity)
			})
			it("swapQuantity expected with 99.99% or more accuracy", async () => {
				const Fixture = await loadFixture(deployRandomcase);

				const expectation = await Fixture.contracts.helper.expectQueries(...[
					Fixture.contracts.pair.address,
					Fixture.contracts.tokenA.address,
					Fixture.settings.requestQuantity
				])
				
				const answer = Formula.determineSwapQuantityV2(
					Fixture.settings.requestQuantity,
					Fixture.settings.poolReserveA
				)

				expect(BigInt(expectation.swapQuantity) * 1000000n / answer).to.be.within(999900n, 1000100n)
			})
			it("swapOutput expected with 99.99% or more accuracy", async () => {
				const Fixture = await loadFixture(deployRandomcase);

				const expectation = await Fixture.contracts.helper.expectQueries(...[
					Fixture.contracts.pair.address,
					Fixture.contracts.tokenA.address,
					Fixture.settings.requestQuantity
				])
				
				const answer = Formula.determineSwapOutput(
					Formula.determineSwapQuantityV2(
						Fixture.settings.requestQuantity,
						Fixture.settings.poolReserveA
					),
					Fixture.settings.poolReserveA,
					Fixture.settings.poolReserveB,
				)

				expect(BigInt(expectation.swapOutput) * 1000000n / answer).to.be.within(999900n, 1000100n)
			})
			it("inputQuantity expected with 99.99% or more accuracy", async () => {
				const Fixture = await loadFixture(deployRandomcase);

				const expectation = await Fixture.contracts.helper.expectQueries(...[
					Fixture.contracts.pair.address,
					Fixture.contracts.tokenA.address,
					Fixture.settings.requestQuantity
				])

				const swapQuantity = Formula.determineSwapQuantityV2(
					Fixture.settings.requestQuantity,
					Fixture.settings.poolReserveA
				)
				
				const answer = Formula.determineQuoteValue(
					swapQuantity,
					Formula.determineSwapOutput(
						swapQuantity,
						Fixture.settings.poolReserveA,
						Fixture.settings.poolReserveB,
					),
					Fixture.settings.poolReserveA,
					Fixture.settings.poolReserveB,
				) + swapQuantity

				expect(BigInt(expectation.inputQuantity) * 1000000n / answer).to.be.within(999900n, 1000100n)
			})
		})

		describe("singleTokenAddLiquidity", () => {
			it("Revert expired request", async () => {
				const Fixture = await loadFixture(deployRandomcase);

				testArguments = [
					Fixture.contracts.pair.address,
					Fixture.contracts.tokenA.address,
					Fixture.settings.requestQuantity,
					Fixture.accounts.tester.address,
					0
				]

				await expect(Fixture.contracts.helper.connect(Fixture.accounts.tester).singleTokenAddLiquidity(...testArguments)).to.be.revertedWith(
					"The transaction is outdated"
				);
			})
			it("No remaining token A on helper", async () => {
				const Fixture = await loadFixture(deployRandomcase);

				testArguments = [
					Fixture.contracts.pair.address,
					Fixture.contracts.tokenA.address,
					Fixture.settings.requestQuantity,
					Fixture.accounts.tester.address,
					ONE_HOUR_LATER
				]
				await Fixture.contracts.helper.connect(Fixture.accounts.tester).singleTokenAddLiquidity(...testArguments)

				expect(BigInt(await Fixture.contracts.tokenA.balanceOf(Fixture.contracts.helper.address))).to.equal(0n)
			})
			it("No remaining token B on helper (Error : 1e-18)", async () => {
				const Fixture = await loadFixture(deployRandomcase);

				testArguments = [
					Fixture.contracts.pair.address,
					Fixture.contracts.tokenA.address,
					Fixture.settings.requestQuantity,
					Fixture.accounts.tester.address,
					ONE_HOUR_LATER
				]
				await Fixture.contracts.helper.connect(Fixture.accounts.tester).singleTokenAddLiquidity(...testArguments)

				expect(BigInt(await Fixture.contracts.tokenB.balanceOf(Fixture.contracts.helper.address))).to.be.lte(1)
			})
			it("Spend most of requested quantity (99.9% or more)", async () => {
				const Fixture = await loadFixture(deployRandomcase);

				const balanceBeforeCall = BigInt(await Fixture.contracts.tokenA.balanceOf(Fixture.accounts.tester.address))
				testArguments = [
					Fixture.contracts.pair.address,
					Fixture.contracts.tokenA.address,
					Fixture.settings.requestQuantity,
					Fixture.accounts.tester.address,
					ONE_HOUR_LATER
				]
				await Fixture.contracts.helper.connect(Fixture.accounts.tester).singleTokenAddLiquidity(...testArguments)

				const deltaBalance = balanceBeforeCall - BigInt(await Fixture.contracts.tokenA.balanceOf(Fixture.accounts.tester.address))
				const usagePerMille = deltaBalance * 1000000n / Fixture.settings.requestQuantity
				
				expect(usagePerMille).to.be.within(999000n, 1001000n)
			})
			it("Tester received LP Token at least 1", async () => {
				const Fixture = await loadFixture(deployRandomcase);

				testArguments = [
					Fixture.contracts.pair.address,
					Fixture.contracts.tokenA.address,
					Fixture.settings.requestQuantity,
					Fixture.accounts.tester.address,
					ONE_HOUR_LATER
				]
				await Fixture.contracts.helper.connect(Fixture.accounts.tester).singleTokenAddLiquidity(...testArguments)

				expect(BigInt(await Fixture.contracts.pair.balanceOf(Fixture.accounts.tester.address))).to.be.gte(1n)
			})
			
		})
	})
});
	
const Formula = {
	sqrtForBigInt : x => BigInt(Math.floor(Math.sqrt(Number(x)))),
	
	determineSwapQuantityV2WithCustomFee : (requested, reserveA, feePerTenMille) => Formula.sqrtForBigInt(reserveA * requested + reserveA * reserveA * (20000n - feePerTenMille) * (20000n - feePerTenMille) / (20000n - feePerTenMille * 2n) / (20000n - feePerTenMille * 2n)) * 10000n / (10000n - feePerTenMille) - (20000n - feePerTenMille) * 10000n * reserveA / (20000n - feePerTenMille * 2n) / (10000n - feePerTenMille),
		
	determineSwapQuantityV2 : (requested, reserveA) => {
		const feePerTenMille = 15n
		return Formula.sqrtForBigInt(reserveA * requested + reserveA * reserveA * (20000n - feePerTenMille) * (20000n - feePerTenMille) / (20000n - feePerTenMille * 2n) / (20000n - feePerTenMille * 2n)) * 10000n / (10000n - feePerTenMille) - (20000n - feePerTenMille) * 10000n * reserveA / (20000n - feePerTenMille * 2n) / (10000n - feePerTenMille)
	},
		
	determineSwapOutput : (swapQuantity, reserveA, reserveB) => (reserveB * swapQuantity * 997n / (swapQuantity * 997n + reserveA * 1000n)),
		
	determineQuoteValue : (swapQuantity, swapOutput, reserveA, reserveB) => swapOutput * (reserveA + swapQuantity) / (reserveB - swapOutput)
}