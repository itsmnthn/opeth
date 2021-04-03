const { BigNumber } = require('@ethersproject/bignumber')
const { expect } = require('chai')

const {
    getWethContract,
    getUSDCContract,
    getWeth,
    impersonateAccount,
    constants: { _1e18, _1e8, ZERO }
} = require('../../utils')

const blockNumber = 12113560
const oWETHUSDC = '0xCf16d3fC24b152b4371042C890EB3E35A2b2BD7e' // oWETHUSDC/USDC-12MAR21-1800P
const oTokenWhale = '0x1e6424a481e6404ed2858d540aec37399671f5e0'

describe('oToken settles In-The-Money', function() {
    before('setup contracts', async function() {
        await network.provider.request({
            method: "hardhat_reset",
            params: [{
                forking: {
                    jsonRpcUrl: `https://eth-mainnet.alchemyapi.io/v2/${process.env.ALCHEMY}`,
                    blockNumber
                }
            }]
        })
        const [ Opyn, signers ] = await Promise.all([
            ethers.getContractFactory('Opyn'),
            ethers.getSigners(),
            impersonateAccount(oTokenWhale)
        ])
        alice = signers[0].address

        wethAmount = _1e18.mul(2)
        opethAmount = _1e18.mul(2)
        oTokenAmount = _1e8.mul(2)
        unitPayout = BigNumber.from('5817378') // per OToken
        ;([ weth, usdc, oToken, opyn ] = await Promise.all([
            getWethContract(),
            getUSDCContract(),
            ethers.getContractAt('IERC20', oWETHUSDC),
            Opyn.deploy(oWETHUSDC, 'Opeth', 'OPETH'),
            getWeth(alice, wethAmount)
        ]))
        const controller = await ethers.getContractAt('ControllerInterface', await opyn.controller())
        expect(await controller.isSettlementAllowed(oToken.address)).to.be.true

        await web3.eth.sendTransaction({ from: alice, to: oTokenWhale, value: _1e18 })
        await oToken.connect(ethers.provider.getSigner(oTokenWhale)).transfer(alice, oTokenAmount)
    })

    it('mint', async function() {
        await weth.approve(opyn.address, wethAmount)
        await oToken.approve(opyn.address, opethAmount)

        await opyn.mint(opethAmount)

        expect(await opyn.totalSupply()).to.eq(opethAmount)
        expect(await opyn.balanceOf(alice)).to.eq(opethAmount)

        expect(await oToken.balanceOf(opyn.address)).to.eq(oTokenAmount)
        expect(await weth.balanceOf(opyn.address)).to.eq(wethAmount)

        expect(await weth.balanceOf(alice)).to.eq(ZERO)
        expect(await oToken.balanceOf(alice)).to.eq(ZERO)
        expect(await usdc.balanceOf(alice)).to.eq(ZERO)
    })

    it('redeem', async function() {
        await opyn.redeem(opethAmount)

        expect(await opyn.totalSupply()).to.eq(ZERO)
        expect(await opyn.balanceOf(alice)).to.eq(ZERO)
        expect(await weth.balanceOf(alice)).to.eq(wethAmount)
        expect(await oToken.balanceOf(alice)).to.eq(ZERO)
        expect(await usdc.balanceOf(alice)).to.eq(unitPayout.mul(2)) // unit payout for OToken
    })

    it('sanity checks', async function() {
        expect(await opyn.proceedsClaimed()).to.be.true
        expect(await opyn.unitPayout()).to.eq(unitPayout)
    })
})

