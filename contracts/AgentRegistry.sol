// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

/// @notice Persistent agent identity and lightweight reputation for Turing MindGames Arena.
contract AgentRegistry {
    struct AgentProfile {
        address controller;
        string metadataURI;
        bytes32 personaHash;
        bytes32 modelHash;
        uint64 gamesPlayed;
        uint64 wins;
        int256 reputationScore;
        bool active;
    }

    mapping(bytes32 => AgentProfile) public agents;

    event AgentRegistered(bytes32 indexed agentId, address indexed controller, string metadataURI, bytes32 personaHash, bytes32 modelHash);
    event AgentStatusUpdated(bytes32 indexed agentId, bool active);
    event AgentReputationUpdated(bytes32 indexed agentId, int256 delta, int256 newScore, bool won);

    modifier onlyController(bytes32 agentId) {
        require(agents[agentId].controller == msg.sender, "NOT_CONTROLLER");
        _;
    }

    function registerAgent(bytes32 agentId, string calldata metadataURI, bytes32 personaHash, bytes32 modelHash) external {
        require(agentId != bytes32(0), "BAD_AGENT_ID");
        require(agents[agentId].controller == address(0), "AGENT_EXISTS");
        agents[agentId] = AgentProfile({
            controller: msg.sender,
            metadataURI: metadataURI,
            personaHash: personaHash,
            modelHash: modelHash,
            gamesPlayed: 0,
            wins: 0,
            reputationScore: 0,
            active: true
        });
        emit AgentRegistered(agentId, msg.sender, metadataURI, personaHash, modelHash);
    }

    function setAgentStatus(bytes32 agentId, bool active) external onlyController(agentId) {
        agents[agentId].active = active;
        emit AgentStatusUpdated(agentId, active);
    }

    function recordResult(bytes32 agentId, bool won, int256 reputationDelta) external {
        // MVP: callable by demo settlement operator. Production version should restrict this to the settlement vault.
        AgentProfile storage agent = agents[agentId];
        require(agent.controller != address(0), "AGENT_NOT_FOUND");
        agent.gamesPlayed += 1;
        if (won) agent.wins += 1;
        agent.reputationScore += reputationDelta;
        emit AgentReputationUpdated(agentId, reputationDelta, agent.reputationScore, won);
    }
}
