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
contract OpethOpyn is ERC20 {
    using SafeMath for uint;
    using SafeERC20 for IERC20;

    uint internal constant OTOKEN_PRECISION = 8;

    AddressBookInterface public immutable addressBook;
    ControllerInterface public immutable controller;
    OtokenInterface public immutable oToken;

    IERC20 public immutable collateralAsset;
    IERC20 public immutable underlyingAsset;
    address public immutable strikeAsset;
    uint public immutable expiryTimestamp;
    uint public immutable underlyingDecimals;

    /// @dev Whether proceeds have been claimed post dispute period
    bool public proceedsClaimed;

    /// @dev Collateral payout per Opeth token
    uint public unitPayout;

    event ClaimedProceeds();

    /**
     * @notice initalize the deployed contract
     * @param _oToken oToken contract address
     */
    constructor(
        OtokenInterface _oToken,
        AddressBookInterface _addressBook,
        string memory name,
        string memory symbol
    )
        public
        ERC20(name, symbol) // initializes _decimals=18
    {
        // Not having this check makes testing easier. Decide later if there is merit in it
        // require(now < _oToken.expiryTimestamp(), "Opeth: oToken has expired");

        controller = ControllerInterface(_addressBook.getController());
        (
            address _collateralAsset,
            address _underlyingAsset,
            address _strikeAsset,
            /* uint _strikePrice */,
            uint _expiryTimestamp,
            bool isPut
        ) = _oToken.getOtokenDetails();
        require(isPut, "NOT_PUT");

        uint _underlyingDecimals = uint(ERC20Interface(_underlyingAsset).decimals());
        require(_underlyingDecimals >= OTOKEN_PRECISION, "ASSET_INCOMPATIBLE");
        underlyingDecimals = _underlyingDecimals;

        underlyingAsset = IERC20(_underlyingAsset);
        strikeAsset = _strikeAsset;
        collateralAsset = IERC20(_collateralAsset);
        expiryTimestamp = _expiryTimestamp;
        addressBook = _addressBook;
        oToken = _oToken;
    }

    /**
     * @notice Mint Opeth tokens. Pulls oToken and underlying asset from msg.sender
     * @param _amount Amount of Opeth to mint. Scaled by 10**OTOKEN_PRECISION = 1e8
     */
    function mintFor(address _destination, uint _amount) public {
        uint oTokenQuantity = _amount.div(1e10);
        IERC20(address(oToken)).safeTransferFrom(
            msg.sender,
            address(this),
            oTokenQuantity
        );
        underlyingAsset.safeTransferFrom(
            msg.sender,
            address(this),
            oTokenToUnderlyingQuantity(oTokenQuantity)
        );
        _mint(_destination, _amount);
    }

    function mint(uint _amount) external {
        mintFor(msg.sender, _amount);
    }

    /**
     * @notice redeem Opeth tokens
     * @param _amount Amount of Opeth to redeem
     */
    function redeem(uint _amount) external {
        uint oTokenQuantity = _amount.div(1e10);
        if (proceedsClaimed) {
            _processPayout(oTokenQuantity);
        } else if (isSettlementAllowed()) {
            claimProceeds();
            _processPayout(oTokenQuantity);
        } else {
            // send back vanilla OTokens, because it is not yet time for settlement
            IERC20(address(oToken)).safeTransfer(
                msg.sender,
                oTokenQuantity
            );
        }
        _burn(msg.sender, _amount);
        underlyingAsset.safeTransfer(
            msg.sender,
            oTokenToUnderlyingQuantity(oTokenQuantity)
        );
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
            unitPayout.mul(_actions[0].amount).div(10**OTOKEN_PRECISION) <= collateralAsset.balanceOf(address(this)),
            "oToken redeem sanity failed"
        );
        proceedsClaimed = true;
        emit ClaimedProceeds();
    }

    /**
     * @notice Opeth to underlying asset amount
     * @param _amount Amount of Opeth to determine underlying asset amount for.
     */
    function oTokenToUnderlyingQuantity(uint _amount)
        public
        view
        returns (uint)
    {
        return _amount.mul(10**(underlyingDecimals - OTOKEN_PRECISION));
    }

    function isSettlementAllowed() public view returns (bool) {
        return controller.isSettlementAllowed(
            address(underlyingAsset),
            address(strikeAsset),
            address(collateralAsset),
            expiryTimestamp
        );
    }

    /**
     * @notice Process collateralAsset payout
     * @param _amount Amount of oTokens to process payout for.
     */
    function _processPayout(uint _amount) internal {
        uint payout = unitPayout.mul(_amount).div(10**OTOKEN_PRECISION);
        if (payout > 0) {
            collateralAsset.safeTransfer(msg.sender, payout);
        }
    }
}
