// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

interface ISicherTestToken {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 value) external returns (bool);
}

/// @title Sicher Test Return Helper
/// @notice Test-only infrastructure for returning the two experiment transfers to one fixed subject.
/// @dev It is not part of the Sicher protocol and holds testnet-only STEST temporarily.
contract SicherTestReturnHelper {
    uint256 public constant RETURN_AMOUNT = 85_000 * 10 ** 18;

    ISicherTestToken public immutable token;
    address public immutable subject;
    bool public restored;

    error Unauthorized();
    error AlreadyRestored();
    error InsufficientHelperBalance(uint256 actual, uint256 required);
    error TransferFailed();
    error ZeroAddress();

    constructor(address token_, address subject_) {
        if (token_ == address(0) || subject_ == address(0)) revert ZeroAddress();
        token = ISicherTestToken(token_);
        subject = subject_;
    }

    /// @notice Returns exactly 85,000 STEST after both planned deposits have reached this helper.
    /// @dev Only the existing subject wallet can authorize restoration; no second key or admin exists.
    function restore() external {
        if (msg.sender != subject) revert Unauthorized();
        if (restored) revert AlreadyRestored();

        uint256 balance = token.balanceOf(address(this));
        if (balance < RETURN_AMOUNT) revert InsufficientHelperBalance(balance, RETURN_AMOUNT);

        restored = true;
        if (!token.transfer(subject, RETURN_AMOUNT)) revert TransferFailed();
    }
}
