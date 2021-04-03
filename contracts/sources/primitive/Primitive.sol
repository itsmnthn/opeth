/**
 * SPDX-License-Identifier: UNLICENSED
 */
pragma solidity 0.6.10;

pragma experimental ABIEncoderV2;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {SafeERC20, SafeMath} from "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/math/Math.sol";

import {ERC20Interface} from "../../interfaces/ERC20Interface.sol";
import { IOption, ITrader } from "./Interfaces.sol";

/**
 * @title Opeth
 * @notice Contract that let's one enter tokenized hedged positions
 */
contract Primitive is ERC20 {
    using SafeMath for uint;
    using SafeERC20 for IERC20;

    IOption public immutable oToken;
    ITrader public immutable trader;

    IERC20 public immutable underlyingAsset;
    IERC20 public immutable collateralAsset;

    /// @dev Precision for Primitive optionTokens
    uint internal constant OTOKEN_PRECISION = 18;

    bool public proceedsClaimed;

    /// @dev Collateral payout per Opeth token
    uint public unitPayout;

    /**
     * @notice initalize the deployed contract
     * @param _oToken oToken contract address
     */
    constructor(IOption _oToken, ITrader _trader)
        public
        ERC20("yo", "yo") // initializes _decimals=18
    {
        (address _collateralAsset, address _underlyingAsset,) = _oToken.getAssetAddresses();
        collateralAsset = IERC20(_collateralAsset);
        underlyingAsset = IERC20(_underlyingAsset);
        oToken = _oToken;
        trader = _trader;
    }

    /**
     * @notice Mint Opeth tokens
     * @param _amount Amount of Opeth to mint and pull oTokens and corresponding amount of underlyingAsset
     */
    function mint(uint _amount) external {
        IERC20(address(oToken)).safeTransferFrom(
            msg.sender,
            address(this),
            _amount
        );
        underlyingAsset.safeTransferFrom(
            msg.sender,
            address(this),
            oTokenToUnderlyingAssetQuantity(_amount)
        );
        _mint(msg.sender, _amount);
    }

    /**
     * @notice redeem Opeth tokens
     * @param _amount Amount of Opeth to redeem
     */
    function redeem(uint _amount) external {
        if (proceedsClaimed) {
            _processPayout(_amount);
        } else if (isSettlementAllowed()) {
            claimProceeds();
            _processPayout(_amount);
        } else {
            // send back vanilla OTokens, because it is not yet time for settlement
            IERC20(address(oToken)).safeTransfer(msg.sender, _amount);
        }
        _burn(msg.sender, _amount);
        underlyingAsset.safeTransfer(
            msg.sender,
            oTokenToUnderlyingAssetQuantity(_amount)
        );
    }

    /**
     * @notice Process collateralAsset payout
     * @param _amount Amount of OTokens to process payout for
     */
    function _processPayout(uint _amount) internal {
        uint payout = unitPayout.mul(_amount).div(1e18);
        if (payout > 0) {
            collateralAsset.safeTransfer(msg.sender, payout);
        }
    }

    /**
     * @notice OToken to underlying asset amount
     * @param _amount Amount of OTokens to determine underlying asset amount for
     */
    function oTokenToUnderlyingAssetQuantity(uint _amount) public view returns (uint) {
        return _amount
            .mul(oToken.getQuoteValue())
            .div(oToken.getBaseValue());
    }

    /**
     * @notice Redeem OTokens for payout, if any
     * @dev This function is internal because, Primitive options can be settled anytime.
     * But we only want to allow settlement when option is ITM
     */
    function claimProceeds() internal {
        uint exerciseQuantity = oToken.balanceOf(address(this));
        uint outStrikes = oTokenToUnderlyingAssetQuantity(exerciseQuantity);
        underlyingAsset.safeApprove(address(trader), outStrikes);
        trader.safeExercise(
            oToken,
            exerciseQuantity,
            address(this) // receiver
        );
        // will also include any extra collateralAsset asset tokens sent to this contract by an adversary/friend
        unitPayout = collateralAsset.balanceOf(address(this))
            .mul(1e18)
            .div(totalSupply());
        proceedsClaimed = true;
    }

    /**
    * @dev return true only when option is ITM
    */
    function isSettlementAllowed() public pure returns(bool) {
        return true;
    }

    receive() external payable {
        revert("Cannot receive ETH");
    }

    fallback() external payable {
        revert("Cannot receive ETH");
    }
}

