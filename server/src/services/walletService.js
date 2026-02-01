const { v4: uuidv4 } = require("uuid");
const db = require("../db");

/**
 * Wallet Service - Handles wallet management and operations
 * Supports multiple wallet types and blockchain addresses
 */

const WALLET_TYPE = {
  CUSTODIAL: "custodial",
  NON_CUSTODIAL: "non_custodial",
  MULTISIG: "multisig",
  HARDWARE: "hardware",
  SMART_CONTRACT: "smart_contract",
};

const WALLET_STATUS = {
  ACTIVE: "active",
  INACTIVE: "inactive",
  SUSPENDED: "suspended",
  PENDING_VERIFICATION: "pending_verification",
};

/**
 * Create a new wallet for user
 */
const createWallet = async (userId, walletData) => {
  const data = db.read();

  if (!data.wallets) {
    data.wallets = [];
  }

  // Check if wallet address already exists
  const existingWallet = data.wallets.find(
    (w) => w.address.toLowerCase() === walletData.address.toLowerCase()
  );

  if (existingWallet) {
    throw new Error("Wallet address already registered");
  }

  const wallet = {
    id: uuidv4(),
    userId,
    address: walletData.address,
    name: walletData.name || "My Wallet",
    type: walletData.type || WALLET_TYPE.NON_CUSTODIAL,
    chainId: walletData.chainId || 1,
    isDefault: walletData.isDefault || false,
    status: WALLET_STATUS.ACTIVE,
    balances: {},
    nonce: 0,
    metadata: {
      provider: walletData.provider || null,
      label: walletData.label || null,
      color: walletData.color || "#6366f1",
    },
    security: {
      twoFactorEnabled: false,
      whitelistOnly: false,
      dailyLimit: walletData.dailyLimit || null,
      transactionLimit: walletData.transactionLimit || null,
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // If this is the first wallet or set as default, make it default
  const userWallets = data.wallets.filter((w) => w.userId === userId);
  if (userWallets.length === 0 || wallet.isDefault) {
    // Reset other wallets' default status
    data.wallets.forEach((w) => {
      if (w.userId === userId) {
        w.isDefault = false;
      }
    });
    wallet.isDefault = true;
  }

  data.wallets.push(wallet);
  db.write(data);

  return wallet;
};

/**
 * Get wallet by ID
 */
const getWalletById = async (walletId) => {
  const data = db.read();
  const wallet = (data.wallets || []).find((w) => w.id === walletId);

  if (!wallet) {
    throw new Error("Wallet not found");
  }

  return wallet;
};

/**
 * Get wallet by address
 */
const getWalletByAddress = async (address) => {
  const data = db.read();
  const wallet = (data.wallets || []).find(
    (w) => w.address.toLowerCase() === address.toLowerCase()
  );

  return wallet || null;
};

/**
 * Get all wallets for a user
 */
const getUserWallets = async (userId) => {
  const data = db.read();
  const wallets = (data.wallets || []).filter((w) => w.userId === userId);

  return wallets;
};

/**
 * Update wallet details
 */
const updateWallet = async (walletId, userId, updates) => {
  const data = db.read();
  const index = (data.wallets || []).findIndex(
    (w) => w.id === walletId && w.userId === userId
  );

  if (index === -1) {
    throw new Error("Wallet not found or unauthorized");
  }

  const allowedUpdates = ["name", "chainId", "metadata"];
  const wallet = data.wallets[index];

  allowedUpdates.forEach((field) => {
    if (updates[field] !== undefined) {
      if (field === "metadata") {
        wallet.metadata = { ...wallet.metadata, ...updates[field] };
      } else {
        wallet[field] = updates[field];
      }
    }
  });

  wallet.updatedAt = new Date().toISOString();
  data.wallets[index] = wallet;
  db.write(data);

  return wallet;
};

/**
 * Set wallet as default
 */
const setDefaultWallet = async (walletId, userId) => {
  const data = db.read();

  // Reset all user wallets to non-default
  data.wallets.forEach((w) => {
    if (w.userId === userId) {
      w.isDefault = false;
    }
  });

  const index = (data.wallets || []).findIndex(
    (w) => w.id === walletId && w.userId === userId
  );

  if (index === -1) {
    throw new Error("Wallet not found or unauthorized");
  }

  data.wallets[index].isDefault = true;
  data.wallets[index].updatedAt = new Date().toISOString();
  db.write(data);

  return data.wallets[index];
};

/**
 * Update wallet balance
 */
const updateBalance = async (walletId, tokenAddress, balance) => {
  const data = db.read();
  const index = (data.wallets || []).findIndex((w) => w.id === walletId);

  if (index === -1) {
    throw new Error("Wallet not found");
  }

  if (!data.wallets[index].balances) {
    data.wallets[index].balances = {};
  }

  data.wallets[index].balances[tokenAddress] = {
    balance,
    updatedAt: new Date().toISOString(),
  };

  data.wallets[index].updatedAt = new Date().toISOString();
  db.write(data);

  return data.wallets[index];
};

/**
 * Get wallet balances
 */
const getWalletBalances = async (walletId) => {
  const data = db.read();
  const wallet = (data.wallets || []).find((w) => w.id === walletId);

  if (!wallet) {
    throw new Error("Wallet not found");
  }

  return wallet.balances || {};
};

/**
 * Update wallet security settings
 */
const updateSecuritySettings = async (walletId, userId, securitySettings) => {
  const data = db.read();
  const index = (data.wallets || []).findIndex(
    (w) => w.id === walletId && w.userId === userId
  );

  if (index === -1) {
    throw new Error("Wallet not found or unauthorized");
  }

  data.wallets[index].security = {
    ...data.wallets[index].security,
    ...securitySettings,
  };

  data.wallets[index].updatedAt = new Date().toISOString();
  db.write(data);

  return data.wallets[index];
};

/**
 * Add address to whitelist
 */
const addToWhitelist = async (walletId, userId, whitelistAddress, label = null) => {
  const data = db.read();
  const index = (data.wallets || []).findIndex(
    (w) => w.id === walletId && w.userId === userId
  );

  if (index === -1) {
    throw new Error("Wallet not found or unauthorized");
  }

  if (!data.wallets[index].whitelist) {
    data.wallets[index].whitelist = [];
  }

  const existing = data.wallets[index].whitelist.find(
    (w) => w.address.toLowerCase() === whitelistAddress.toLowerCase()
  );

  if (existing) {
    throw new Error("Address already whitelisted");
  }

  data.wallets[index].whitelist.push({
    address: whitelistAddress,
    label,
    addedAt: new Date().toISOString(),
  });

  data.wallets[index].updatedAt = new Date().toISOString();
  db.write(data);

  return data.wallets[index].whitelist;
};

/**
 * Remove address from whitelist
 */
const removeFromWhitelist = async (walletId, userId, whitelistAddress) => {
  const data = db.read();
  const index = (data.wallets || []).findIndex(
    (w) => w.id === walletId && w.userId === userId
  );

  if (index === -1) {
    throw new Error("Wallet not found or unauthorized");
  }

  if (!data.wallets[index].whitelist) {
    return [];
  }

  data.wallets[index].whitelist = data.wallets[index].whitelist.filter(
    (w) => w.address.toLowerCase() !== whitelistAddress.toLowerCase()
  );

  data.wallets[index].updatedAt = new Date().toISOString();
  db.write(data);

  return data.wallets[index].whitelist;
};

/**
 * Check if address is whitelisted
 */
const isWhitelisted = async (walletId, address) => {
  const data = db.read();
  const wallet = (data.wallets || []).find((w) => w.id === walletId);

  if (!wallet) {
    throw new Error("Wallet not found");
  }

  if (!wallet.security.whitelistOnly) {
    return true;
  }

  if (!wallet.whitelist) {
    return false;
  }

  return wallet.whitelist.some(
    (w) => w.address.toLowerCase() === address.toLowerCase()
  );
};

/**
 * Record wallet activity
 */
const recordActivity = async (walletId, activityData) => {
  const data = db.read();

  if (!data.walletActivities) {
    data.walletActivities = [];
  }

  const activity = {
    id: uuidv4(),
    walletId,
    type: activityData.type,
    description: activityData.description,
    txHash: activityData.txHash || null,
    amount: activityData.amount || null,
    token: activityData.token || null,
    counterparty: activityData.counterparty || null,
    metadata: activityData.metadata || {},
    createdAt: new Date().toISOString(),
  };

  data.walletActivities.push(activity);
  db.write(data);

  return activity;
};

/**
 * Get wallet activity history
 */
const getActivityHistory = async (walletId, filters = {}) => {
  const data = db.read();
  let activities = (data.walletActivities || []).filter(
    (a) => a.walletId === walletId
  );

  if (filters.type) {
    activities = activities.filter((a) => a.type === filters.type);
  }

  if (filters.startDate) {
    activities = activities.filter(
      (a) => new Date(a.createdAt) >= new Date(filters.startDate)
    );
  }

  if (filters.endDate) {
    activities = activities.filter(
      (a) => new Date(a.createdAt) <= new Date(filters.endDate)
    );
  }

  // Sort by date descending
  activities.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  // Pagination
  const page = filters.page || 1;
  const limit = filters.limit || 20;
  const startIndex = (page - 1) * limit;

  return {
    activities: activities.slice(startIndex, startIndex + limit),
    total: activities.length,
    page,
    totalPages: Math.ceil(activities.length / limit),
  };
};

/**
 * Delete wallet (soft delete)
 */
const deleteWallet = async (walletId, userId) => {
  const data = db.read();
  const index = (data.wallets || []).findIndex(
    (w) => w.id === walletId && w.userId === userId
  );

  if (index === -1) {
    throw new Error("Wallet not found or unauthorized");
  }

  data.wallets[index].status = WALLET_STATUS.INACTIVE;
  data.wallets[index].deletedAt = new Date().toISOString();
  data.wallets[index].updatedAt = new Date().toISOString();
  db.write(data);

  return { success: true, message: "Wallet deleted successfully" };
};

/**
 * Verify wallet ownership (signature verification mock)
 */
const verifyOwnership = async (address, message, signature) => {
  // In production, this would verify the signature cryptographically
  // For now, mock successful verification
  return {
    verified: true,
    address,
    message,
    timestamp: new Date().toISOString(),
  };
};

/**
 * Get wallet statistics
 */
const getWalletStatistics = async (walletId) => {
  const data = db.read();
  const wallet = (data.wallets || []).find((w) => w.id === walletId);

  if (!wallet) {
    throw new Error("Wallet not found");
  }

  const activities = (data.walletActivities || []).filter(
    (a) => a.walletId === walletId
  );

  const totalTransactions = activities.length;
  const uniqueCounterparties = new Set(
    activities.filter((a) => a.counterparty).map((a) => a.counterparty)
  ).size;

  return {
    walletId,
    address: wallet.address,
    totalTransactions,
    uniqueCounterparties,
    createdAt: wallet.createdAt,
    lastActivity: activities[0]?.createdAt || null,
    tokenCount: Object.keys(wallet.balances || {}).length,
  };
};

/**
 * Check transaction limits
 */
const checkTransactionLimits = async (walletId, amount) => {
  const data = db.read();
  const wallet = (data.wallets || []).find((w) => w.id === walletId);

  if (!wallet) {
    throw new Error("Wallet not found");
  }

  const result = {
    allowed: true,
    reasons: [],
  };

  // Check transaction limit
  if (wallet.security.transactionLimit && amount > wallet.security.transactionLimit) {
    result.allowed = false;
    result.reasons.push(`Amount exceeds transaction limit of ${wallet.security.transactionLimit}`);
  }

  // Check daily limit
  if (wallet.security.dailyLimit) {
    const today = new Date().toISOString().split("T")[0];
    const activities = (data.walletActivities || []).filter(
      (a) =>
        a.walletId === walletId &&
        a.createdAt.startsWith(today) &&
        a.amount
    );

    const dailyTotal = activities.reduce((sum, a) => sum + (a.amount || 0), 0);

    if (dailyTotal + amount > wallet.security.dailyLimit) {
      result.allowed = false;
      result.reasons.push(`Would exceed daily limit of ${wallet.security.dailyLimit}`);
    }
  }

  return result;
};

module.exports = {
  WALLET_TYPE,
  WALLET_STATUS,
  createWallet,
  getWalletById,
  getWalletByAddress,
  getUserWallets,
  updateWallet,
  setDefaultWallet,
  updateBalance,
  getWalletBalances,
  updateSecuritySettings,
  addToWhitelist,
  removeFromWhitelist,
  isWhitelisted,
  recordActivity,
  getActivityHistory,
  deleteWallet,
  verifyOwnership,
  getWalletStatistics,
  checkTransactionLimits,
};
