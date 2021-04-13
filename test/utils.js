const { BigNumber } = require('@ethersproject/bignumber')

const constants = {
    _1e18: ethers.constants.WeiPerEther,
    _1e8: BigNumber.from(10).pow(8),
    ZERO: BigNumber.from(0),
    contracts: {
        mainnet: {
            weth: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
            usdc: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
            controller: '0x4ccc2339F87F6c59c6893E1A678c2266cA58dC72',
            factory: '0x7C06792Af1632E77cb27a558Dc0885338F4Bdf8E',
            addressBook: '0x1E31F2DCBad4dc572004Eae6355fB18F9615cBe4',
            pool: '0x5934807cC0654d46755eBd2848840b616256C6Ef',
            whitelist: '0xa5EA18ac6865f315ff5dD9f1a7fb1d41A30a6779',
            zeroxExchange: '0xdef1c0ded9bec7f1a1670819833240f027b25eff',
        },
        ropsten: {
            weth: '0xc778417E063141139Fce010982780140Aa0cD5Ab',
            usdc: '0x8be3a2a5c37b16c6eaa2be6a3fa1cf1e465f8691',
            uniRouter: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D',
            controller: '0x7e9beaccdccee88558aaa2dc121e52ec6226864e',
            factory: '0x8d6994b701f480c27757c5fe2bd93d5352160081',
            addressBook: '0xe71417eefc794c9b83fc494861981721e26db0e9',
            pool: '0x3C325EeBB64495665F5376930d30151C1075bFD8',
            whitelist: '0x5faCA6DF39c897802d752DfCb8c02Ea6959245Fc',
            zeroxExchange: '0xdef1c0ded9bec7f1a1670819833240f027b25eff', // v4
        }
    }
}

async function getWeth(account, amount) {
    const wethWhale = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'
    const weth = await ethers.getContractAt('IERC20', constants.contracts.mainnet.weth)
    await impersonateAccount(wethWhale)
    return weth.connect(ethers.provider.getSigner(wethWhale)).transfer(account, amount)
}

function impersonateAccount(account) {
    return network.provider.request({
        method: 'hardhat_impersonateAccount',
        params: [ account ]
    })
}

function scale(num, decimals) {
    return BigNumber.from(num).mul(BigNumber.from(10).pow(decimals))
}

function get0xProtocolFee(orders, gasPrice) { // in wei
    const FEE_PER_WEI = BigNumber.from(7e4)
    return FEE_PER_WEI.mul(orders.length).mul(gasPrice)
}

module.exports = {
    constants,
    getWeth,
    impersonateAccount,
    scale,
    get0xProtocolFee
}
