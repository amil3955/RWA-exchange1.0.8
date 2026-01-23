const { v4: uuidv4 } = require("uuid");
const db = require("../db");

/**
 * Token Service - Handles tokenization of Real World Assets
 * Manages token creation, transfer, and lifecycle
 */

const TOKEN_STATUS = {
  PENDING: "pending",
  MINTING: "minting",
  ACTIVE: "active",
  PAUSED: "paused",
  BURNED: "burned",
  EXPIRED: "expired",
};

const TOKEN_STANDARDS = {
  ERC20: "ERC20",
  ERC721: "ERC721",
  ERC1155: "ERC1155",
  ERC3643: "ERC3643", // Security token standard
};

/**
 * Create tokenization request for an asset
 */
const createTokenization = async (assetId, tokenData) => {
  const data = db.read();

  if (!data.tokenizations) {
    data.tokenizations = [];
  }

  const tokenization = {
    id: uuidv4(),
    assetId,
    tokenSymbol: tokenData.symbol,
    tokenName: tokenData.name,
    standard: tokenData.standard || TOKEN_STANDARDS.ERC3643,
    totalSupply: tokenData.totalSupply,
    decimals: tokenData.decimals || 18,
    pricePerToken: tokenData.pricePerToken,
    currency: tokenData.currency || "USD",
    minInvestment: tokenData.minInvestment || 1,
    maxInvestment: tokenData.maxInvestment || null,
    contractAddress: null,
    blockchain: tokenData.blockchain || "ethereum",
    status: TOKEN_STATUS.PENDING,
    holders: [],
    transfers: [],
    dividends: [],
    compliance: {
      whitelistEnabled: true,
      maxHolders: tokenData.maxHolders || 500,
      lockupPeriod: tokenData.lockupPeriod || 0,
      transferRestrictions: tokenData.transferRestrictions || [],
    },
    metadata: {
      description: tokenData.description || "",
      image: tokenData.image || null,
      externalUrl: tokenData.externalUrl || null,
      attributes: tokenData.attributes || [],
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  data.tokenizations.push(tokenization);
  db.write(data);

  return tokenization;
};

/**
 * Get tokenization by ID
 */
const getTokenizationById = async (tokenizationId) => {
  const data = db.read();
  const tokenization = (data.tokenizations || []).find(
    (t) => t.id === tokenizationId
  );

  if (!tokenization) {
    throw new Error("Tokenization not found");
  }

  return tokenization;
};

/**
 * Get tokenization by asset ID
 */
const getTokenizationByAssetId = async (assetId) => {
  const data = db.read();
  const tokenization = (data.tokenizations || []).find(
    (t) => t.assetId === assetId
  );

  return tokenization || null;
};

/**
 * Update tokenization status
 */
const updateTokenizationStatus = async (tokenizationId, newStatus) => {
  const data = db.read();
  const index = (data.tokenizations || []).findIndex(
    (t) => t.id === tokenizationId
  );

  if (index === -1) {
    throw new Error("Tokenization not found");
  }

  if (!Object.values(TOKEN_STATUS).includes(newStatus)) {
    throw new Error("Invalid token status");
  }

  data.tokenizations[index].status = newStatus;
  data.tokenizations[index].updatedAt = new Date().toISOString();
  db.write(data);

  return data.tokenizations[index];
};

/**
 * Set contract address after deployment
 */
const setContractAddress = async (tokenizationId, contractAddress) => {
  const data = db.read();
  const index = (data.tokenizations || []).findIndex(
    (t) => t.id === tokenizationId
  );

  if (index === -1) {
    throw new Error("Tokenization not found");
  }

  data.tokenizations[index].contractAddress = contractAddress;
  data.tokenizations[index].status = TOKEN_STATUS.ACTIVE;
  data.tokenizations[index].mintedAt = new Date().toISOString();
  data.tokenizations[index].updatedAt = new Date().toISOString();
  db.write(data);

  return data.tokenizations[index];
};

/**
 * Add token holder
 */
const addHolder = async (tokenizationId, holderData) => {
  const data = db.read();
  const index = (data.tokenizations || []).findIndex(
    (t) => t.id === tokenizationId
  );

  if (index === -1) {
    throw new Error("Tokenization not found");
  }

  const tokenization = data.tokenizations[index];

  // Check max holders limit
  if (
    tokenization.compliance.maxHolders &&
    tokenization.holders.length >= tokenization.compliance.maxHolders
  ) {
    throw new Error("Maximum number of holders reached");
  }

  const existingHolder = tokenization.holders.find(
    (h) => h.userId === holderData.userId
  );

  if (existingHolder) {
    existingHolder.balance += holderData.amount;
    existingHolder.updatedAt = new Date().toISOString();
  } else {
    tokenization.holders.push({
      userId: holderData.userId,
      walletAddress: holderData.walletAddress,
      balance: holderData.amount,
      purchasePrice: holderData.purchasePrice,
      whitelisted: true,
      lockedUntil: tokenization.compliance.lockupPeriod
        ? new Date(
            Date.now() + tokenization.compliance.lockupPeriod * 24 * 60 * 60 * 1000
          ).toISOString()
        : null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  data.tokenizations[index].updatedAt = new Date().toISOString();
  db.write(data);

  return tokenization.holders.find((h) => h.userId === holderData.userId);
};

/**
 * Record token transfer
 */
const recordTransfer = async (tokenizationId, transferData) => {
  const data = db.read();
  const index = (data.tokenizations || []).findIndex(
    (t) => t.id === tokenizationId
  );

  if (index === -1) {
    throw new Error("Tokenization not found");
  }

  const tokenization = data.tokenizations[index];

  // Validate sender has enough balance
  const senderHolder = tokenization.holders.find(
    (h) => h.userId === transferData.fromUserId
  );

  if (!senderHolder || senderHolder.balance < transferData.amount) {
    throw new Error("Insufficient token balance");
  }

  // Check lockup period
  if (senderHolder.lockedUntil && new Date(senderHolder.lockedUntil) > new Date()) {
    throw new Error("Tokens are still locked");
  }

  const transfer = {
    id: uuidv4(),
    fromUserId: transferData.fromUserId,
    toUserId: transferData.toUserId,
    amount: transferData.amount,
    price: transferData.price || null,
    txHash: transferData.txHash || null,
    status: "completed",
    createdAt: new Date().toISOString(),
  };

  // Update balances
  senderHolder.balance -= transferData.amount;
  senderHolder.updatedAt = new Date().toISOString();

  const recipientHolder = tokenization.holders.find(
    (h) => h.userId === transferData.toUserId
  );

  if (recipientHolder) {
    recipientHolder.balance += transferData.amount;
    recipientHolder.updatedAt = new Date().toISOString();
  } else {
    tokenization.holders.push({
      userId: transferData.toUserId,
      walletAddress: transferData.toWalletAddress,
      balance: transferData.amount,
      purchasePrice: transferData.price,
      whitelisted: true,
      lockedUntil: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  tokenization.transfers.push(transfer);
  data.tokenizations[index].updatedAt = new Date().toISOString();
  db.write(data);

  return transfer;
};

/**
 * Get token holders
 */
const getHolders = async (tokenizationId) => {
  const data = db.read();
  const tokenization = (data.tokenizations || []).find(
    (t) => t.id === tokenizationId
  );

  if (!tokenization) {
    throw new Error("Tokenization not found");
  }

  return tokenization.holders;
};

/**
 * Get holder balance
 */
const getHolderBalance = async (tokenizationId, userId) => {
  const data = db.read();
  const tokenization = (data.tokenizations || []).find(
    (t) => t.id === tokenizationId
  );

  if (!tokenization) {
    throw new Error("Tokenization not found");
  }

  const holder = tokenization.holders.find((h) => h.userId === userId);

  return {
    balance: holder?.balance || 0,
    lockedUntil: holder?.lockedUntil || null,
    whitelisted: holder?.whitelisted || false,
  };
};

/**
 * Distribute dividends to token holders
 */
const distributeDividends = async (tokenizationId, dividendData) => {
  const data = db.read();
  const index = (data.tokenizations || []).findIndex(
    (t) => t.id === tokenizationId
  );

  if (index === -1) {
    throw new Error("Tokenization not found");
  }

  const tokenization = data.tokenizations[index];
  const totalSupply = tokenization.totalSupply;

  const dividend = {
    id: uuidv4(),
    totalAmount: dividendData.totalAmount,
    currency: dividendData.currency || "USD",
    perTokenAmount: dividendData.totalAmount / totalSupply,
    recordDate: dividendData.recordDate || new Date().toISOString(),
    paymentDate: dividendData.paymentDate,
    status: "pending",
    distributions: [],
    createdAt: new Date().toISOString(),
  };

  // Calculate distribution for each holder
  tokenization.holders.forEach((holder) => {
    if (holder.balance > 0) {
      dividend.distributions.push({
        userId: holder.userId,
        tokenBalance: holder.balance,
        amount: holder.balance * dividend.perTokenAmount,
        status: "pending",
      });
    }
  });

  tokenization.dividends.push(dividend);
  data.tokenizations[index].updatedAt = new Date().toISOString();
  db.write(data);

  return dividend;
};

/**
 * Get token transfer history
 */
const getTransferHistory = async (tokenizationId, filters = {}) => {
  const data = db.read();
  const tokenization = (data.tokenizations || []).find(
    (t) => t.id === tokenizationId
  );

  if (!tokenization) {
    throw new Error("Tokenization not found");
  }

  let transfers = tokenization.transfers || [];

  if (filters.userId) {
    transfers = transfers.filter(
      (t) => t.fromUserId === filters.userId || t.toUserId === filters.userId
    );
  }

  if (filters.startDate) {
    transfers = transfers.filter(
      (t) => new Date(t.createdAt) >= new Date(filters.startDate)
    );
  }

  if (filters.endDate) {
    transfers = transfers.filter(
      (t) => new Date(t.createdAt) <= new Date(filters.endDate)
    );
  }

  return transfers;
};

/**
 * Get all tokenizations with filters
 */
const getTokenizations = async (filters = {}) => {
  const data = db.read();
  let tokenizations = data.tokenizations || [];

  if (filters.status) {
    tokenizations = tokenizations.filter((t) => t.status === filters.status);
  }

  if (filters.blockchain) {
    tokenizations = tokenizations.filter((t) => t.blockchain === filters.blockchain);
  }

  if (filters.standard) {
    tokenizations = tokenizations.filter((t) => t.standard === filters.standard);
  }

  return tokenizations;
};

/**
 * Burn tokens
 */
const burnTokens = async (tokenizationId, userId, amount) => {
  const data = db.read();
  const index = (data.tokenizations || []).findIndex(
    (t) => t.id === tokenizationId
  );

  if (index === -1) {
    throw new Error("Tokenization not found");
  }

  const tokenization = data.tokenizations[index];
  const holder = tokenization.holders.find((h) => h.userId === userId);

  if (!holder || holder.balance < amount) {
    throw new Error("Insufficient token balance");
  }

  holder.balance -= amount;
  tokenization.totalSupply -= amount;

  const burnRecord = {
    id: uuidv4(),
    userId,
    amount,
    reason: "burn",
    createdAt: new Date().toISOString(),
  };

  tokenization.burns = tokenization.burns || [];
  tokenization.burns.push(burnRecord);

  data.tokenizations[index].updatedAt = new Date().toISOString();
  db.write(data);

  return burnRecord;
};

/**
 * Get token statistics
 */
const getTokenStatistics = async (tokenizationId) => {
  const data = db.read();
  const tokenization = (data.tokenizations || []).find(
    (t) => t.id === tokenizationId
  );

  if (!tokenization) {
    throw new Error("Tokenization not found");
  }

  const totalHolders = tokenization.holders.filter((h) => h.balance > 0).length;
  const totalTransfers = tokenization.transfers?.length || 0;
  const totalVolume = (tokenization.transfers || []).reduce(
    (sum, t) => sum + (t.price || 0) * t.amount,
    0
  );

  return {
    tokenizationId,
    symbol: tokenization.tokenSymbol,
    totalSupply: tokenization.totalSupply,
    circulatingSupply: tokenization.holders.reduce((sum, h) => sum + h.balance, 0),
    totalHolders,
    totalTransfers,
    totalVolume,
    marketCap: tokenization.totalSupply * tokenization.pricePerToken,
    pricePerToken: tokenization.pricePerToken,
    status: tokenization.status,
  };
};

module.exports = {
  TOKEN_STATUS,
  TOKEN_STANDARDS,
  createTokenization,
  getTokenizationById,
  getTokenizationByAssetId,
  updateTokenizationStatus,
  setContractAddress,
  addHolder,
  recordTransfer,
  getHolders,
  getHolderBalance,
  distributeDividends,
  getTransferHistory,
  getTokenizations,
  burnTokens,
  getTokenStatistics,
};
