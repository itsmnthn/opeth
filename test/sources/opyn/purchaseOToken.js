const { BigNumber } = require("@ethersproject/bignumber");
const { expect } = require("chai");
const { network } = require("hardhat");

// Ropsten
const blockNumber = 10003148

const USDC = '0x8be3a2a5c37b16c6eaa2be6a3fa1cf1e465f8691'
const oWETHUSDC = '0xa2df86d4bd5e1b852abb0fe91e4584395217d709' // WETHUSDC 30-April-2021 1760Put USDC Collateral
const ZeroEx = '0xDef1C0ded9bec7F1a1670819833240f027b25EfF'

// has provided Opyn approval to ZeroEx to transfer opyn usdc
const account = '0xdB22e9523cbf69912Eec3e6AD4B57a5bfa8CA587'
const signer = ethers.provider.getSigner(account)

const ZERO = BigNumber.from(0)

describe('Purchase OToken from 0x exchange', function() {
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
        await impersonateAccount(account)
        oToken = await ethers.getContractAt('IERC20', oWETHUSDC)
        usdc = await ethers.getContractAt('IERC20', USDC)
    })


    it('raw web3 call', async function() {
        expect(await oToken.balanceOf(account)).to.eq(ZERO)
        expect(await usdc.balanceOf(account)).to.eq(BigNumber.from(2e8)) // 200
        const tx = {
            from: account,
            to: ZeroEx,
            value: web3.utils.toWei('0.00609'),
            gas: 3000000,
            data: '0x1baaa00b0000000000000000000000000000000000000000000000000000000000000080000000000000000000000000000000000000000000000000000000000000022000000000000000000000000000000000000000000000000000000000000002c000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001000000000000000000000000a2df86d4bd5e1b852abb0fe91e4584395217d7090000000000000000000000008be3a2a5c37b16c6eaa2be6a3fa1cf1e465f8691000000000000000000000000000000000000000000000000000000000098968000000000000000000000000000000000000000000000000000000000001e84800000000000000000000000000000000000000000000000000000000000000000000000000000000000000000238238c3398e0116fad7bbfdc323f78187135815000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000607cf0b90000000000000000000000000000000000000000000000054c8992973a3f587800000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000001c98020df031df5371570dfbd0386f6ec5eb51102eca772372bcb27b442a1838a47ec0825f8364dbe8c48271991c0cf23819b69113790f8d12e3553f936db8cc78000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000186a0'
        }
        await web3.eth.sendTransaction(tx)
        expect(await oToken.balanceOf(account)).to.eq(BigNumber.from(5e5)) // 0.005 * 1e8
        expect(await usdc.balanceOf(account)).to.eq(BigNumber.from(1999).mul(1e5)) // 199.9
    })

    it('exchange.batchFillLimitOrders', async function() {
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
        const exchange = await ethers.getContractAt('ZeroXExchangeInterface', ZeroEx)
        await exchange
            .connect(signer)
            .batchFillLimitOrders([order], [order.signature], ['100000'] /* usdc */, true, { value: web3.utils.toWei('0.0069') })
        expect(await oToken.balanceOf(account)).to.eq(BigNumber.from(1e6)) // 0.005 * 2 * 1e8
        expect(await usdc.balanceOf(account)).to.eq(BigNumber.from(1998).mul(1e5)) // 199.8
    })
})

function impersonateAccount(account) {
    return network.provider.request({
        method: 'hardhat_impersonateAccount',
        params: [ account ]
    })
}
