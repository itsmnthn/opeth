const { BigNumber } = require("@ethersproject/bignumber");
const { expect, assert } = require("chai");
const { network } = require("hardhat");

const {
    constants,
    scale,
    get0xProtocolFee
} = require('../../utils')
const { ZERO } = constants

// Ropsten
const blockNumber = 10008270
const oWETHUSDC = '0xa2df86d4bd5e1b852abb0fe91e4584395217d709' // WETHUSDC 30-April-2021 1760Put USDC Collateral

describe.only('oWETHUSDC Zap', function() {
    before('setup contracts', async function() {
        await network.provider.request({
            method: "hardhat_reset",
            params: [{
                forking: {
                    jsonRpcUrl: `https://eth-ropsten.alchemyapi.io/v2/${process.env.ALCHEMY}`,
                    blockNumber
                }
            }]
        })
        const [ Opeth, OpethOpynZap, signers ] = await Promise.all([
            ethers.getContractFactory('OpethOpyn'),
            ethers.getContractFactory('OpethOpynZap'),
            ethers.getSigners(),
        ])
        alice = signers[0].address

        ;([ weth, usdc, uni, oToken, opeth ] = await Promise.all([
            ethers.getContractAt('IERC20', constants.contracts.ropsten.weth),
            ethers.getContractAt('IERC20', constants.contracts.ropsten.usdc),
            ethers.getContractAt('Uni', constants.contracts.ropsten.uniRouter),
            ethers.getContractAt('IERC20', oWETHUSDC),
            Opeth.deploy(oWETHUSDC, constants.contracts.ropsten.addressBook, 'Opeth', 'OPETH'),
        ]))
        zap = await OpethOpynZap.deploy(
            weth.address,
            usdc.address,
            constants.contracts.ropsten.uniRouter,
            constants.contracts.ropsten.zeroxExchange
        )
    })

    it('mint', async function() {
        const order = {
            "signature": {
                "signatureType": 2,
                "r": "0x98020df031df5371570dfbd0386f6ec5eb51102eca772372bcb27b442a1838a4",
                "s": "0x7ec0825f8364dbe8c48271991c0cf23819b69113790f8d12e3553f936db8cc78",
                "v": 28
            },
            "sender": "0x0000000000000000000000000000000000000000",
            "maker": "0x238238c3398e0116fad7bbfdc323f78187135815",
            "taker": "0x0000000000000000000000000000000000000000",
            "takerTokenFeeAmount": "0",
            "makerAmount": "10000000",
            "takerAmount": "2000000",
            "makerToken": "0xa2df86d4bd5e1b852abb0fe91e4584395217d709",
            "takerToken": "0x8be3a2a5c37b16c6eaa2be6a3fa1cf1e465f8691",
            "salt": "97748820765454588024",
            "verifyingContract": "0xdef1c0ded9bec7f1a1670819833240f027b25eff",
            "feeRecipient": "0x0000000000000000000000000000000000000000",
            "expiry": "1618800825",
            "chainId": 3,
            "pool": "0x0000000000000000000000000000000000000000000000000000000000000000"
        }
        const exchange = await ethers.getContractAt('ZeroXExchangeInterface', constants.contracts.ropsten.zeroxExchange)
        const _0xSwapData = exchange.interface.encodeFunctionData('batchFillLimitOrders', [ [order], [order.signature], ['100000'], true ])

        _oToken = scale(5, 5) // 0.005 * 1e8
        _opeth = scale(_oToken, 10) // 0.005 * 1e18
        _oTokenPayment = '100000' // 0.1 USDC

        // 0.000050150952863591
        const [ _maxPayment ] = await uni.getAmountsIn(_oTokenPayment, [weth.address, usdc.address])

        const gasPrice = scale(1, 9) // 1 gwei
        _0xFee = get0xProtocolFee([order], gasPrice)

        const ethRequired = _opeth.add(_maxPayment).add(_0xFee)

        // sending insufficient ETH will revert
        await expect(
            zap.mint(
                opeth.address,
                _opeth,
                _oTokenPayment,
                _maxPayment,
                _0xFee,
                _0xSwapData,
                { value: ethRequired.sub(1), gasPrice }
            )
        ).to.be.revertedWith('Transaction reverted: function call failed to execute')

        await zap.mint(
            opeth.address,
            _opeth,
            _oTokenPayment,
            _maxPayment,
            _0xFee,
            _0xSwapData,
            { value: ethRequired, gasPrice }
        )

        expect(await opeth.balanceOf(alice)).to.eq(_opeth)
        expect(await oToken.balanceOf(alice)).to.eq(ZERO)
        expect(await usdc.balanceOf(alice)).to.eq(ZERO)

        expect(await opeth.balanceOf(zap.address)).to.eq(ZERO)
        expect(await oToken.balanceOf(zap.address)).to.eq(ZERO)
        expect(await usdc.balanceOf(zap.address)).to.eq(ZERO)
    })

    it('redeem', async function() {
        await opeth.redeem(_opeth)

        expect(await opeth.totalSupply()).to.eq(ZERO)
        expect(await opeth.balanceOf(alice)).to.eq(ZERO)
        expect(await weth.balanceOf(alice)).to.eq(_opeth)
        expect(await oToken.balanceOf(alice)).to.eq(_oToken)
        expect(await usdc.balanceOf(alice)).to.eq(ZERO)
    })

    it('sanity checks', async function() {
        expect(await opeth.proceedsClaimed()).to.be.false
        expect(await opeth.unitPayout()).to.eq(ZERO)
    })
})
