const { expect } = require('chai')

const {
    constants,
    getWeth,
    impersonateAccount
} = require('../../utils')
const { _1e18, _1e8, ZERO } = constants

const blockNumber = 12106275
const oWETHUSDC = '0x58cea0b182381cde8c38cb16bf7f8260cba9997f' // oWETHUSDC/USDC-26MAR21-800P
const oTokenWhale = '0xca2DB2d21BC1AF848DA2b7CD423a29802371F399'

describe('oToken isSettlementAllowed=false', function() {
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
        const [ Opeth, signers ] = await Promise.all([
            ethers.getContractFactory('OpethOpyn'),
            ethers.getSigners(),
            impersonateAccount(oTokenWhale)
        ])
        alice = signers[0].address

        wethAmount = _1e18.mul(2)
        opethAmount = _1e18.mul(2)
        oTokenAmount = _1e8.mul(2)
        ;([ weth, usdc, oToken, opyn ] = await Promise.all([
            ethers.getContractAt('IERC20', constants.contracts.mainnet.weth),
            ethers.getContractAt('IERC20', constants.contracts.mainnet.usdc),
            ethers.getContractAt('IERC20', oWETHUSDC),
            Opeth.deploy(oWETHUSDC, constants.contracts.mainnet.addressBook, 'Opeth', 'OPETH'),
        ]))
        await getWeth(alice, wethAmount)
        const controller = await ethers.getContractAt('ControllerInterface', await opyn.controller())
        expect(await controller.isSettlementAllowed(oToken.address)).to.be.false

        await oToken.connect(ethers.provider.getSigner(oTokenWhale)).transfer(alice, oTokenAmount)
    })

    it('mint', async function() {
        await weth.approve(opyn.address, wethAmount)
        await oToken.approve(opyn.address, opethAmount)

        await opyn.mint(opethAmount)

        expect(await opyn.totalSupply()).to.eq(opethAmount)
        expect(await opyn.balanceOf(alice)).to.eq(opethAmount)
        expect(await weth.balanceOf(alice)).to.eq(ZERO)
        expect(await oToken.balanceOf(alice)).to.eq(ZERO)
        expect(await usdc.balanceOf(alice)).to.eq(ZERO)
    })

    it('redeem', async function() {
        await opyn.redeem(opethAmount)

        expect(await opyn.totalSupply()).to.eq(ZERO)
        expect(await opyn.balanceOf(alice)).to.eq(ZERO)
        expect(await weth.balanceOf(alice)).to.eq(wethAmount)
        expect(await oToken.balanceOf(alice)).to.eq(oTokenAmount)
        expect(await usdc.balanceOf(alice)).to.eq(ZERO)
    })

    it('sanity checks', async function() {
        expect(await opyn.proceedsClaimed()).to.be.false
        expect(await opyn.unitPayout()).to.eq(ZERO)
    })
})

