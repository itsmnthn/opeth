require("@nomiclabs/hardhat-waffle")
require("@nomiclabs/hardhat-web3")
require("@tenderly/hardhat-tenderly")

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
    solidity: "0.6.10",
    networks: {
        local: {
            url: 'http://localhost:8545'
        },
        // hardhat: {
        //     chainId: 3,
        // }
    },
    mocha: {
        timeout: 0
    },
    tenderly: {
		username: "atvanguard",
		project: "hardhat-debug"
	}
};
