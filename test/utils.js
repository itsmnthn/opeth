const { BigNumber } = require('@ethersproject/bignumber')

const wethWhale = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'

function getWethContract() {
    return ethers.getContractAt('IERC20', '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2')
}

function getUSDCContract() {
    return ethers.getContractAt('IERC20', '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48')
}

async function getWeth(account, amount) {
    const weth = await getWethContract()
    await impersonateAccount(wethWhale)
    return weth.connect(ethers.provider.getSigner(wethWhale)).transfer(account, amount)
}

function impersonateAccount(account) {
    return network.provider.request({
        method: 'hardhat_impersonateAccount',
        params: [ account ]
    })
}

module.exports = {
    getWethContract,
    getUSDCContract,
    getWeth,
    impersonateAccount,
    constants: {
        _1e18: ethers.constants.WeiPerEther,
        _1e8: BigNumber.from(10).pow(8),
        ZERO: BigNumber.from(0),
    }
}
