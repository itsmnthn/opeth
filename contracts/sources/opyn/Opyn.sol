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
import {
    Actions,
    AddressBookInterface,
    ControllerInterface,
    MarginCalculatorInterface,
    OtokenInterface
} from "./Interfaces.sol";

/**
 * @title Opeth coins based on Opyn oTokens
 * @notice Contract that let's one enter tokenized hedged positions
 */
contract Opyn is ERC20 {
    using SafeMath for uint;
    using SafeERC20 for IERC20;

    AddressBookInterface public immutable addressBook;
    ControllerInterface public immutable controller;
    OtokenInterface public immutable oToken;
    IERC20 public immutable underlyingAsset;
    IERC20 public immutable collateralAsset;

    uint internal constant OPETH_PRECISION = 18;

    /// @dev Precision for both Otokens and Opeth
    uint internal constant OTOKEN_PRECISION = 8;

    /// @dev Whether proceeds have been claimed post dispute period
    bool public proceedsClaimed;

    /// @dev Collateral payout per Opeth token
    uint public unitPayout;

    /// @dev Underlying asset precision decimals
    uint internal underlyingDecimals;

    /**
     * @notice initalize the deployed contract
     * @param _oToken oToken contract address
     */
    constructor(OtokenInterface _oToken, string memory name, string memory symbol)
        public
        ERC20(name, symbol) // initializes _decimals=18
    {
        // Not having this check makes testing easier. Decide later if there is merit in it
        // require(now < _oToken.expiryTimestamp(), "Opeth: oToken has expired");

        AddressBookInterface _addressBook = AddressBookInterface(_oToken.addressBook());

        address _underlyingAsset = _oToken.underlyingAsset();
        underlyingDecimals = uint(ERC20Interface(_underlyingAsset).decimals());
        underlyingAsset = IERC20(_underlyingAsset);

        controller = ControllerInterface(_addressBook.getController());
        collateralAsset = IERC20(_oToken.collateralAsset());
        oToken = _oToken;
        addressBook = _addressBook;
    }

    /**
     * @notice Mint Opeth tokens. Pulls oToken and underlying asset from msg.sender
     * @param _amount Amount of Opeth to mint. Scaled by 10**OPETH_PRECISION = 1e18
     */
    function mint(uint _amount) external {
        IERC20(address(oToken)).safeTransferFrom(
            msg.sender,
            address(this),
            _amount.mul(10**OTOKEN_PRECISION).div(10**OPETH_PRECISION)
        );
        underlyingAsset.safeTransferFrom(
            msg.sender,
            address(this),
            opethToUnderlyingAssetQuantity(_amount, true)
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
        } else if (controller.isSettlementAllowed(address(oToken))) {
            claimProceeds();
            _processPayout(_amount);
        } else {
            // send back vanilla OTokens, because it is not yet time for settlement
            IERC20(address(oToken)).safeTransfer(
                msg.sender,
                _amount.mul(10**OTOKEN_PRECISION).div(1e18)
            );
        }
        _burn(msg.sender, _amount);
        underlyingAsset.safeTransfer(
            msg.sender,
            opethToUnderlyingAssetQuantity(_amount, false)
        );
    }

    /**
     * @notice Opeth to underlying asset amount
     * @param _amount Amount of Opeth to determine underlying asset amount for.
     */
    function opethToUnderlyingAssetQuantity(uint _amount, bool _roundUp)
        public
        view
        returns (uint)
    {
        if (underlyingDecimals == OPETH_PRECISION) {
            return _amount;
        }
        if (underlyingDecimals > OPETH_PRECISION) {
            return _amount.mul(10**(underlyingDecimals - OPETH_PRECISION));
        }
        uint amount = _amount.div(10**(OPETH_PRECISION - underlyingDecimals));
        if (_roundUp) {
            return amount.add(1);
        }
        return amount;
    }

    /**
     * @notice Redeem OTokens for payout, if any
     */
    function claimProceeds() public {
        Actions.ActionArgs[] memory _actions = new Actions.ActionArgs[](1);
        _actions[0].actionType = Actions.ActionType.Redeem;
        _actions[0].secondAddress = address(this);
        _actions[0].asset = address(oToken);
        _actions[0].amount = IERC20(address(oToken)).balanceOf(address(this));

        controller.operate(_actions);

        unitPayout = MarginCalculatorInterface(addressBook.getMarginCalculator()).getExpiredPayoutRate(address(oToken));
        require(
            unitPayout.mul(totalSupply()).div(10**OPETH_PRECISION) <= collateralAsset.balanceOf(address(this)),
            "oToken redeem sanity failed"
        );
        proceedsClaimed = true;
    }

    /**
     * @notice Process collateralAsset payout
     * @param _amount Amount of Opeth to process payout for
     */
    function _processPayout(uint _amount) internal {
        uint payout = unitPayout.mul(_amount).div(10**OPETH_PRECISION);
        if (payout > 0) {
            collateralAsset.safeTransfer(msg.sender, payout);
        }
    }

    receive() external payable {
        revert("Cannot receive ETH");
    }

    fallback() external payable {
        revert("Cannot receive ETH");
    }
}

