// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

/// @title SicherCommitmentProof
/// @notice Minimal experiment for permanently anchoring a commitment definition.
/// @dev The intended observation window is inclusive:
///      startBlock <= observedBlock <= endBlock.
///      This contract records terms only; it does not verify historical balances.
contract SicherCommitmentProof {
    struct Commitment {
        uint256 id;
        address creator;
        address subject;
        address token;
        uint256 minimumBalance;
        uint256 startBlock;
        uint256 endBlock;
    }

    /// @notice IDs begin at 1 and increase by one for every successful creation.
    uint256 public nextCommitmentId = 1;

    mapping(uint256 id => Commitment commitment) public commitments;

    event CommitmentCreated(
        uint256 indexed id,
        address indexed creator,
        address indexed subject,
        address token,
        uint256 minimumBalance,
        uint256 startBlock,
        uint256 endBlock
    );

    error ZeroSubject();
    error ZeroToken();
    error ZeroMinimumBalance();
    error InvalidBlockWindow();

    function createCommitment(
        address subject,
        address token,
        uint256 minimumBalance,
        uint256 startBlock,
        uint256 endBlock
    ) external returns (uint256 id) {
        if (subject == address(0)) revert ZeroSubject();
        if (token == address(0)) revert ZeroToken();
        if (minimumBalance == 0) revert ZeroMinimumBalance();
        if (endBlock <= startBlock) revert InvalidBlockWindow();

        id = nextCommitmentId++;
        commitments[id] = Commitment({
            id: id,
            creator: msg.sender,
            subject: subject,
            token: token,
            minimumBalance: minimumBalance,
            startBlock: startBlock,
            endBlock: endBlock
        });

        emit CommitmentCreated(
            id,
            msg.sender,
            subject,
            token,
            minimumBalance,
            startBlock,
            endBlock
        );
    }
}
