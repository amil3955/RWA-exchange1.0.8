const { v4: uuidv4 } = require("uuid");
const db = require("../db");

/**
 * Blockchain Service - Handles blockchain interactions
 * Supports multiple chains: Ethereum, Polygon, BSC, etc.
 */

const SUPPORTED_CHAINS = {
  ETHEREUM: {
    id: 1,
    name: "Ethereum Mainnet",
    symbol: "ETH",
    rpcUrl: "https://mainnet.infura.io/v3/",
    explorer: "https://etherscan.io",
    type: "evm",
  },
  POLYGON: {
    id: 137,
    name: "Polygon Mainnet",
    symbol: "MATIC",
    rpcUrl: "https://polygon-rpc.com",
    explorer: "https://polygonscan.com",
    type: "evm",
  },
  BSC: {
    id: 56,
    name: "BNB Smart Chain",
    symbol: "BNB",
    rpcUrl: "https://bsc-dataseed.binance.org",
    explorer: "https://bscscan.com",
    type: "evm",
  },
  ARBITRUM: {
    id: 42161,
    name: "Arbitrum One",
    symbol: "ETH",
    rpcUrl: "https://arb1.arbitrum.io/rpc",
    explorer: "https://arbiscan.io",
    type: "evm",
  },
  OPTIMISM: {
    id: 10,
    name: "Optimism",
    symbol: "ETH",
    rpcUrl: "https://mainnet.optimism.io",
    explorer: "https://optimistic.etherscan.io",
    type: "evm",
  },
  AVALANCHE: {
    id: 43114,
    name: "Avalanche C-Chain",
    symbol: "AVAX",
    rpcUrl: "https://api.avax.network/ext/bc/C/rpc",
    explorer: "https://snowtrace.io",
    type: "evm",
  },
};

const TX_STATUS = {
  PENDING: "pending",
  CONFIRMED: "confirmed",
  FAILED: "failed",
  DROPPED: "dropped",
};

/**
 * Get supported chains
 */
const getSupportedChains = () => {
  return Object.values(SUPPORTED_CHAINS);
};

/**
 * Get chain by ID
 */
const getChainById = (chainId) => {
  return Object.values(SUPPORTED_CHAINS).find((chain) => chain.id === chainId);
};

/**
 * Record a blockchain transaction
 */
const recordTransaction = async (txData) => {
  const data = db.read();

  if (!data.blockchainTransactions) {
    data.blockchainTransactions = [];
  }

  const transaction = {
    id: uuidv4(),
    txHash: txData.txHash,
    chainId: txData.chainId,
    from: txData.from,
    to: txData.to,
    value: txData.value || "0",
    data: txData.data || null,
    gasUsed: txData.gasUsed || null,
    gasPrice: txData.gasPrice || null,
    nonce: txData.nonce || null,
    blockNumber: txData.blockNumber || null,
    status: txData.status || TX_STATUS.PENDING,
    type: txData.type || "transfer",
    metadata: txData.metadata || {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  data.blockchainTransactions.push(transaction);
  db.write(data);

  return transaction;
};

/**
 * Get transaction by hash
 */
const getTransactionByHash = async (txHash) => {
  const data = db.read();
  const tx = (data.blockchainTransactions || []).find(
    (t) => t.txHash === txHash
  );

  return tx || null;
};

/**
 * Update transaction status
 */
const updateTransactionStatus = async (txHash, status, additionalData = {}) => {
  const data = db.read();
  const index = (data.blockchainTransactions || []).findIndex(
    (t) => t.txHash === txHash
  );

  if (index === -1) {
    throw new Error("Transaction not found");
  }

  data.blockchainTransactions[index] = {
    ...data.blockchainTransactions[index],
    status,
    ...additionalData,
    updatedAt: new Date().toISOString(),
  };

  db.write(data);

  return data.blockchainTransactions[index];
};

/**
 * Get transactions by address
 */
const getTransactionsByAddress = async (address, filters = {}) => {
  const data = db.read();
  let transactions = (data.blockchainTransactions || []).filter(
    (t) =>
      t.from.toLowerCase() === address.toLowerCase() ||
      t.to.toLowerCase() === address.toLowerCase()
  );

  if (filters.chainId) {
    transactions = transactions.filter((t) => t.chainId === filters.chainId);
  }

  if (filters.status) {
    transactions = transactions.filter((t) => t.status === filters.status);
  }

  if (filters.type) {
    transactions = transactions.filter((t) => t.type === filters.type);
  }

  // Sort by date descending
  transactions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return transactions;
};

/**
 * Record contract deployment
 */
const recordContractDeployment = async (deploymentData) => {
  const data = db.read();

  if (!data.contractDeployments) {
    data.contractDeployments = [];
  }

  const deployment = {
    id: uuidv4(),
    contractAddress: deploymentData.contractAddress,
    txHash: deploymentData.txHash,
    chainId: deploymentData.chainId,
    deployer: deploymentData.deployer,
    contractName: deploymentData.contractName,
    contractType: deploymentData.contractType,
    abi: deploymentData.abi || null,
    bytecode: deploymentData.bytecode || null,
    constructorArgs: deploymentData.constructorArgs || [],
    verified: false,
    metadata: deploymentData.metadata || {},
    createdAt: new Date().toISOString(),
  };

  data.contractDeployments.push(deployment);
  db.write(data);

  return deployment;
};

/**
 * Get contract deployment by address
 */
const getContractByAddress = async (contractAddress, chainId) => {
  const data = db.read();
  const contract = (data.contractDeployments || []).find(
    (c) =>
      c.contractAddress.toLowerCase() === contractAddress.toLowerCase() &&
      c.chainId === chainId
  );

  return contract || null;
};

/**
 * Mark contract as verified
 */
const markContractVerified = async (contractAddress, chainId) => {
  const data = db.read();
  const index = (data.contractDeployments || []).findIndex(
    (c) =>
      c.contractAddress.toLowerCase() === contractAddress.toLowerCase() &&
      c.chainId === chainId
  );

  if (index === -1) {
    throw new Error("Contract not found");
  }

  data.contractDeployments[index].verified = true;
  data.contractDeployments[index].verifiedAt = new Date().toISOString();
  db.write(data);

  return data.contractDeployments[index];
};

/**
 * Simulate transaction (mock for development)
 */
const simulateTransaction = async (txData) => {
  // In production, this would interact with the actual blockchain
  const simulation = {
    success: true,
    estimatedGas: Math.floor(21000 + Math.random() * 100000),
    estimatedCost: {
      wei: "0",
      gwei: "0",
      eth: "0",
    },
    warnings: [],
    errors: [],
  };

  // Add some mock validations
  if (!txData.to) {
    simulation.errors.push("Missing recipient address");
    simulation.success = false;
  }

  if (txData.value && parseFloat(txData.value) < 0) {
    simulation.errors.push("Invalid value: must be positive");
    simulation.success = false;
  }

  return simulation;
};

/**
 * Get gas prices for a chain
 */
const getGasPrices = async (chainId) => {
  // Mock gas prices - in production, fetch from chain or gas oracle
  const baseFee = Math.floor(20 + Math.random() * 30);

  return {
    chainId,
    baseFee: baseFee,
    slow: {
      maxFeePerGas: baseFee + 1,
      maxPriorityFeePerGas: 1,
      estimatedTime: "5+ minutes",
    },
    standard: {
      maxFeePerGas: baseFee + 2,
      maxPriorityFeePerGas: 2,
      estimatedTime: "1-3 minutes",
    },
    fast: {
      maxFeePerGas: baseFee + 5,
      maxPriorityFeePerGas: 5,
      estimatedTime: "< 30 seconds",
    },
    instant: {
      maxFeePerGas: baseFee + 10,
      maxPriorityFeePerGas: 10,
      estimatedTime: "< 15 seconds",
    },
    timestamp: new Date().toISOString(),
  };
};

/**
 * Get block information
 */
const getBlockInfo = async (chainId, blockNumber = "latest") => {
  // Mock block info
  return {
    chainId,
    blockNumber: blockNumber === "latest" ? 18500000 + Math.floor(Math.random() * 1000) : blockNumber,
    timestamp: new Date().toISOString(),
    transactions: Math.floor(100 + Math.random() * 200),
    gasUsed: Math.floor(15000000 + Math.random() * 5000000),
    gasLimit: 30000000,
    baseFeePerGas: Math.floor(20 + Math.random() * 30),
  };
};

/**
 * Validate wallet address
 */
const validateAddress = (address) => {
  // Basic Ethereum address validation
  const ethAddressRegex = /^0x[a-fA-F0-9]{40}$/;

  if (!ethAddressRegex.test(address)) {
    return {
      valid: false,
      error: "Invalid Ethereum address format",
    };
  }

  return {
    valid: true,
    checksumAddress: address, // In production, would return checksum address
  };
};

/**
 * Get network status
 */
const getNetworkStatus = async (chainId) => {
  const chain = getChainById(chainId);

  if (!chain) {
    throw new Error("Unsupported chain");
  }

  // Mock network status
  return {
    chain: chain.name,
    chainId,
    isHealthy: true,
    latestBlock: 18500000 + Math.floor(Math.random() * 1000),
    pendingTransactions: Math.floor(Math.random() * 50000),
    gasPrice: Math.floor(20 + Math.random() * 30),
    syncStatus: "synced",
    peerCount: Math.floor(50 + Math.random() * 100),
    timestamp: new Date().toISOString(),
  };
};

/**
 * Estimate contract call gas
 */
const estimateContractCallGas = async (callData) => {
  // Mock gas estimation
  const baseGas = 21000;
  const dataGas = callData.data ? (callData.data.length - 2) / 2 * 16 : 0;
  const executionGas = Math.floor(50000 + Math.random() * 100000);

  return {
    estimatedGas: baseGas + dataGas + executionGas,
    breakdown: {
      baseGas,
      dataGas,
      executionGas,
    },
  };
};

/**
 * Get token balance (mock)
 */
const getTokenBalance = async (tokenAddress, walletAddress, chainId) => {
  // Mock token balance
  return {
    tokenAddress,
    walletAddress,
    chainId,
    balance: (Math.random() * 10000).toFixed(4),
    decimals: 18,
    symbol: "TOKEN",
    name: "Mock Token",
  };
};

/**
 * Get native balance (mock)
 */
const getNativeBalance = async (walletAddress, chainId) => {
  const chain = getChainById(chainId);

  return {
    walletAddress,
    chainId,
    balance: (Math.random() * 10).toFixed(6),
    symbol: chain?.symbol || "ETH",
  };
};

/**
 * Get pending transactions for address
 */
const getPendingTransactions = async (address) => {
  const data = db.read();
  const transactions = (data.blockchainTransactions || []).filter(
    (t) =>
      t.status === TX_STATUS.PENDING &&
      (t.from.toLowerCase() === address.toLowerCase() ||
        t.to.toLowerCase() === address.toLowerCase())
  );

  return transactions;
};

/**
 * Record event log
 */
const recordEventLog = async (eventData) => {
  const data = db.read();

  if (!data.eventLogs) {
    data.eventLogs = [];
  }

  const event = {
    id: uuidv4(),
    txHash: eventData.txHash,
    logIndex: eventData.logIndex,
    contractAddress: eventData.contractAddress,
    chainId: eventData.chainId,
    eventName: eventData.eventName,
    args: eventData.args || {},
    blockNumber: eventData.blockNumber,
    createdAt: new Date().toISOString(),
  };

  data.eventLogs.push(event);
  db.write(data);

  return event;
};

/**
 * Get event logs by contract
 */
const getEventLogsByContract = async (contractAddress, chainId, filters = {}) => {
  const data = db.read();
  let events = (data.eventLogs || []).filter(
    (e) =>
      e.contractAddress.toLowerCase() === contractAddress.toLowerCase() &&
      e.chainId === chainId
  );

  if (filters.eventName) {
    events = events.filter((e) => e.eventName === filters.eventName);
  }

  if (filters.fromBlock) {
    events = events.filter((e) => e.blockNumber >= filters.fromBlock);
  }

  if (filters.toBlock) {
    events = events.filter((e) => e.blockNumber <= filters.toBlock);
  }

  return events;
};

module.exports = {
  SUPPORTED_CHAINS,
  TX_STATUS,
  getSupportedChains,
  getChainById,
  recordTransaction,
  getTransactionByHash,
  updateTransactionStatus,
  getTransactionsByAddress,
  recordContractDeployment,
  getContractByAddress,
  markContractVerified,
  simulateTransaction,
  getGasPrices,
  getBlockInfo,
  validateAddress,
  getNetworkStatus,
  estimateContractCallGas,
  getTokenBalance,
  getNativeBalance,
  getPendingTransactions,
  recordEventLog,
  getEventLogsByContract,
};
