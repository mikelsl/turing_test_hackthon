// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

/// @notice Performance-bond settlement vault for benchmark games. Testnet/demo first; not a casino contract.
contract GameSettlementVault {
    struct Pool {
        uint256 totalBond;
        bool finalized;
        bytes32 winningTeam;
        address[] participants;
        mapping(address => uint256) bondOf;
        mapping(address => bool) winner;
        mapping(address => bool) claimed;
    }

    address public owner;
    mapping(address => bool) public authorizedSettlers;
    mapping(bytes32 => Pool) private pools;

    event BondDeposited(bytes32 indexed gameId, address indexed participant, uint256 amount);
    event GameSettled(bytes32 indexed gameId, bytes32 winningTeam, uint256 totalBond, bytes32 summaryHash);
    event RewardClaimed(bytes32 indexed gameId, address indexed participant, uint256 amount);
    event SettlerUpdated(address indexed settler, bool authorized);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    modifier onlyOwner() {
        require(msg.sender == owner, "NOT_OWNER");
        _;
    }

    modifier onlySettler() {
        require(msg.sender == owner || authorizedSettlers[msg.sender], "NOT_SETTLER");
        _;
    }

    constructor() {
        owner = msg.sender;
        authorizedSettlers[msg.sender] = true;
        emit OwnershipTransferred(address(0), msg.sender);
        emit SettlerUpdated(msg.sender, true);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "BAD_OWNER");
        address previousOwner = owner;
        owner = newOwner;
        authorizedSettlers[newOwner] = true;
        emit OwnershipTransferred(previousOwner, newOwner);
        emit SettlerUpdated(newOwner, true);
    }

    function setSettler(address settler, bool authorized) external onlyOwner {
        require(settler != address(0), "BAD_SETTLER");
        authorizedSettlers[settler] = authorized;
        emit SettlerUpdated(settler, authorized);
    }

    function depositBond(bytes32 gameId) external payable {
        require(gameId != bytes32(0), "BAD_GAME_ID");
        require(msg.value > 0, "NO_BOND");
        Pool storage pool = pools[gameId];
        require(!pool.finalized, "FINALIZED");
        if (pool.bondOf[msg.sender] == 0) pool.participants.push(msg.sender);
        pool.bondOf[msg.sender] += msg.value;
        pool.totalBond += msg.value;
        emit BondDeposited(gameId, msg.sender, msg.value);
    }

    function settle(bytes32 gameId, bytes32 winningTeam, address[] calldata winners, bytes32 summaryHash) external onlySettler {
        Pool storage pool = pools[gameId];
        require(!pool.finalized, "FINALIZED");
        require(pool.totalBond > 0, "EMPTY_POOL");
        require(winners.length > 0, "NO_WINNERS");
        pool.finalized = true;
        pool.winningTeam = winningTeam;
        for (uint256 i = 0; i < winners.length; i++) pool.winner[winners[i]] = true;
        emit GameSettled(gameId, winningTeam, pool.totalBond, summaryHash);
    }

    function claim(bytes32 gameId) external {
        Pool storage pool = pools[gameId];
        require(pool.finalized, "NOT_FINALIZED");
        require(pool.winner[msg.sender], "NOT_WINNER");
        require(!pool.claimed[msg.sender], "CLAIMED");
        uint256 winnerCount = 0;
        for (uint256 i = 0; i < pool.participants.length; i++) {
            if (pool.winner[pool.participants[i]]) winnerCount++;
        }
        require(winnerCount > 0, "NO_WINNERS");
        uint256 amount = pool.totalBond / winnerCount;
        pool.claimed[msg.sender] = true;
        (bool ok, ) = msg.sender.call{value: amount}("");
        require(ok, "TRANSFER_FAILED");
        emit RewardClaimed(gameId, msg.sender, amount);
    }

    function bondOf(bytes32 gameId, address participant) external view returns (uint256) {
        return pools[gameId].bondOf[participant];
    }

    function isWinner(bytes32 gameId, address participant) external view returns (bool) {
        return pools[gameId].winner[participant];
    }

    function isClaimed(bytes32 gameId, address participant) external view returns (bool) {
        return pools[gameId].claimed[participant];
    }

    function poolInfo(bytes32 gameId) external view returns (uint256 totalBond, bool finalized, bytes32 winningTeam, uint256 participantCount) {
        Pool storage pool = pools[gameId];
        return (pool.totalBond, pool.finalized, pool.winningTeam, pool.participants.length);
    }
}
