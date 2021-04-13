pragma solidity 0.6.10;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20, SafeMath} from "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

contract OpethOpynZap {
    using SafeMath for uint;
    using SafeERC20 for IERC20;

    IERC20 public immutable weth;
    IERC20 public immutable usdc;
    Uni public immutable uni;

    address payable exchange;

    constructor(
        IERC20 _weth,
        IERC20 _usdc,
        Uni _uni,
        address payable _exchange
    ) public {
        weth = _weth;
        usdc = _usdc;
        uni = _uni;
        exchange = _exchange;
    }

    /**
    * @param _opeth Opeth amount to mint
    * @param _oTokenPayment USDC required for purchasing oTokens
    * @param _maxPayment in ETH for purchasing USDC; caps slippage
    * @param _0xFee 0x protocol fee. Any extra is refunded
    * @param _0xSwapData 0x swap encoded data
    */
    function mint(
        IOpeth opeth,
        uint _opeth,
        uint _oTokenPayment,
        uint _maxPayment,
        uint _0xFee,
        bytes calldata _0xSwapData
    ) external payable {
        // Swap ETH for USDC (for purchasing oToken)
        address[] memory path = new address[](2);
        path[0] = address(weth);
        path[1] = address(usdc);
        Uni(uni).swapETHForExactTokens{value: _maxPayment}(
            _oTokenPayment,
            path,
            address(this),
            now
        );

        // Purchase oToken
        usdc.safeApprove(exchange, _oTokenPayment);
        (bool success,) = exchange.call{value: _0xFee}(_0xSwapData);
        require(success, "SWAP_CALL_FAILED");

        // Mint Opeth
        WETH9(address(weth)).deposit{value: _opeth}();
        weth.safeApprove(address(opeth), _opeth);

        IERC20 oToken = IERC20(opeth.oToken());
        oToken.safeApprove(address(opeth), _opeth.div(1e10));

        opeth.mintFor(msg.sender, _opeth);

        // refund dust eth, if any
        safeTransferETH(msg.sender, address(this).balance);
    }

    function safeTransferETH(address to, uint value) internal {
        (bool success,) = to.call{value:value}(new bytes(0));
        require(success, 'ETH_TRANSFER_FAILED');
    }

    receive() external payable {
        require(
            msg.sender == address(uni) || msg.sender == exchange,
            "Cannot receive ETH"
        );
    }

    // Cannot receive ETH with calldata that doesnt match any function
    fallback() external payable {
        revert("Cannot receive ETH");
    }
}

interface Uni {
    function swapETHForExactTokens(
        uint amountOut,
        address[] calldata path,
        address to,
        uint deadline
    ) external payable returns (uint[] memory amounts);

    function getAmountsIn(uint amountOut, address[] calldata path) external view returns (uint[] memory amounts);
}

interface WETH9 {
    function deposit() external payable;
    function withdraw(uint) external;
}

interface IOpeth {
    function mintFor(address _destination, uint _amount) external;
    function oToken() external view returns(address);
}

