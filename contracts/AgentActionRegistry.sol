// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

/// @notice Event-first audit layer for agent game actions and rationale hashes.
contract AgentActionRegistry {
    event GameCreated(bytes32 indexed gameId, address indexed creator, bytes32 metadataHash);
    event AgentActionRecorded(
        bytes32 indexed gameId,
        bytes32 indexed agentId,
        bytes32 indexed phase,
        bytes32 actionType,
        bytes32 actionHash,
        bytes32 rationaleHash,
        bytes32 stateHash,
        bytes32 modelHash
    );
    event GameFinalized(bytes32 indexed gameId, bytes32 winningTeam, bytes32 summaryHash, bytes32 reputationRoot);

    mapping(bytes32 => bool) public gameExists;
    mapping(bytes32 => bool) public gameFinalized;

    function createGame(bytes32 gameId, bytes32 metadataHash) external {
        require(gameId != bytes32(0), "BAD_GAME_ID");
        require(!gameExists[gameId], "GAME_EXISTS");
        gameExists[gameId] = true;
        emit GameCreated(gameId, msg.sender, metadataHash);
    }

    function recordAgentAction(
        bytes32 gameId,
        bytes32 agentId,
        bytes32 phase,
        bytes32 actionType,
        bytes32 actionHash,
        bytes32 rationaleHash,
        bytes32 stateHash,
        bytes32 modelHash
    ) external {
        require(gameExists[gameId], "GAME_NOT_FOUND");
        require(!gameFinalized[gameId], "GAME_FINALIZED");
        emit AgentActionRecorded(gameId, agentId, phase, actionType, actionHash, rationaleHash, stateHash, modelHash);
    }

    function finalizeGame(bytes32 gameId, bytes32 winningTeam, bytes32 summaryHash, bytes32 reputationRoot) external {
        require(gameExists[gameId], "GAME_NOT_FOUND");
        require(!gameFinalized[gameId], "GAME_FINALIZED");
        gameFinalized[gameId] = true;
        emit GameFinalized(gameId, winningTeam, summaryHash, reputationRoot);
    }
}
