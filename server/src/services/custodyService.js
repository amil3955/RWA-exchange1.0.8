const { v4: uuidv4 } = require("uuid");
const db = require("../db");

/**
 * Custody Service - Handles asset custody and safekeeping
 * Supports institutional-grade custody for various asset types
 */

const CUSTODY_TYPE = {
  SELF_CUSTODY: "self_custody",
  THIRD_PARTY: "third_party",
  MULTI_SIG: "multi_sig",
  COLD_STORAGE: "cold_storage",
  HOT_WALLET: "hot_wallet",
  INSTITUTIONAL: "institutional",
};

const CUSTODY_STATUS = {
  ACTIVE: "active",
  PENDING: "pending",
  SUSPENDED: "suspended",
  CLOSED: "closed",
};

/**
 * Create custody account
 */
const createCustodyAccount = async (userId, accountData) => {
  const data = db.read();

  if (!data.custodyAccounts) {
    data.custodyAccounts = [];
  }

  const account = {
    id: uuidv4(),
    userId,
    accountNumber: `CUST-${Date.now()}-${Math.random().toString(36).substring(7).toUpperCase()}`,
    type: accountData.type || CUSTODY_TYPE.THIRD_PARTY,
    custodian: accountData.custodian || "RWA Exchange Custody",
    assets: [],
    balances: {},
    settings: {
      whitelistEnabled: accountData.whitelistEnabled || false,
      whitelist: [],
      requireMultiSig: accountData.requireMultiSig || false,
      signaturesRequired: accountData.signaturesRequired || 1,
      withdrawalDelay: accountData.withdrawalDelay || 0, // hours
      dailyLimit: accountData.dailyLimit || null,
    },
    insurance: {
      covered: accountData.insuranceCovered || true,
      coverage: accountData.insuranceCoverage || 0,
      provider: accountData.insuranceProvider || null,
    },
    fees: {
      custodyFee: accountData.custodyFee || 0.0025, // 0.25% annual
      withdrawalFee: accountData.withdrawalFee || 0,
      depositFee: accountData.depositFee || 0,
    },
    status: CUSTODY_STATUS.ACTIVE,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  data.custodyAccounts.push(account);
  db.write(data);

  return account;
};

/**
 * Get custody account by ID
 */
const getCustodyAccountById = async (accountId) => {
  const data = db.read();
  const account = (data.custodyAccounts || []).find((a) => a.id === accountId);

  if (!account) {
    throw new Error("Custody account not found");
  }

  return account;
};

/**
 * Get user custody accounts
 */
const getUserCustodyAccounts = async (userId) => {
  const data = db.read();
  return (data.custodyAccounts || []).filter((a) => a.userId === userId);
};

/**
 * Deposit asset to custody
 */
const depositToCustody = async (accountId, depositData) => {
  const data = db.read();
  const index = (data.custodyAccounts || []).findIndex((a) => a.id === accountId);

  if (index === -1) {
    throw new Error("Custody account not found");
  }

  const account = data.custodyAccounts[index];

  if (account.status !== CUSTODY_STATUS.ACTIVE) {
    throw new Error("Account is not active");
  }

  const deposit = {
    id: uuidv4(),
    assetType: depositData.assetType,
    assetId: depositData.assetId || null,
    symbol: depositData.symbol || null,
    quantity: depositData.quantity,
    value: depositData.value || null,
    source: depositData.source,
    depositedAt: new Date().toISOString(),
  };

  account.assets.push(deposit);

  // Update balances
  const balanceKey = depositData.symbol || depositData.assetType;
  account.balances[balanceKey] = (account.balances[balanceKey] || 0) + depositData.quantity;

  account.updatedAt = new Date().toISOString();
  data.custodyAccounts[index] = account;

  // Record transaction
  if (!data.custodyTransactions) {
    data.custodyTransactions = [];
  }

  data.custodyTransactions.push({
    id: uuidv4(),
    accountId,
    type: "deposit",
    ...deposit,
  });

  db.write(data);

  return deposit;
};

/**
 * Withdraw from custody
 */
const withdrawFromCustody = async (accountId, userId, withdrawData) => {
  const data = db.read();
  const index = (data.custodyAccounts || []).findIndex(
    (a) => a.id === accountId && a.userId === userId
  );

  if (index === -1) {
    throw new Error("Custody account not found or unauthorized");
  }

  const account = data.custodyAccounts[index];

  if (account.status !== CUSTODY_STATUS.ACTIVE) {
    throw new Error("Account is not active");
  }

  const balanceKey = withdrawData.symbol || withdrawData.assetType;
  const currentBalance = account.balances[balanceKey] || 0;

  if (currentBalance < withdrawData.quantity) {
    throw new Error("Insufficient balance");
  }

  // Check whitelist if enabled
  if (account.settings.whitelistEnabled && withdrawData.destination) {
    if (!account.settings.whitelist.includes(withdrawData.destination)) {
      throw new Error("Destination not whitelisted");
    }
  }

  // Check daily limit
  if (account.settings.dailyLimit) {
    const today = new Date().toISOString().split("T")[0];
    const todayWithdrawals = (data.custodyTransactions || [])
      .filter(
        (t) =>
          t.accountId === accountId &&
          t.type === "withdrawal" &&
          t.withdrawnAt?.startsWith(today)
      )
      .reduce((sum, t) => sum + (t.value || 0), 0);

    if (todayWithdrawals + (withdrawData.value || 0) > account.settings.dailyLimit) {
      throw new Error("Daily withdrawal limit exceeded");
    }
  }

  const withdrawal = {
    id: uuidv4(),
    assetType: withdrawData.assetType,
    assetId: withdrawData.assetId || null,
    symbol: withdrawData.symbol || null,
    quantity: withdrawData.quantity,
    value: withdrawData.value || null,
    destination: withdrawData.destination,
    status: account.settings.withdrawalDelay > 0 ? "pending" : "completed",
    availableAt: account.settings.withdrawalDelay > 0
      ? new Date(Date.now() + account.settings.withdrawalDelay * 60 * 60 * 1000).toISOString()
      : new Date().toISOString(),
    withdrawnAt: new Date().toISOString(),
  };

  // Update balances
  account.balances[balanceKey] -= withdrawData.quantity;
  account.updatedAt = new Date().toISOString();
  data.custodyAccounts[index] = account;

  // Record transaction
  if (!data.custodyTransactions) {
    data.custodyTransactions = [];
  }

  data.custodyTransactions.push({
    id: withdrawal.id,
    accountId,
    type: "withdrawal",
    ...withdrawal,
  });

  db.write(data);

  return withdrawal;
};

/**
 * Get custody balances
 */
const getCustodyBalances = async (accountId) => {
  const account = await getCustodyAccountById(accountId);
  return {
    accountId,
    balances: account.balances,
    assets: account.assets,
  };
};

/**
 * Get custody transactions
 */
const getCustodyTransactions = async (accountId, filters = {}) => {
  const data = db.read();
  let transactions = (data.custodyTransactions || []).filter(
    (t) => t.accountId === accountId
  );

  if (filters.type) {
    transactions = transactions.filter((t) => t.type === filters.type);
  }

  if (filters.startDate) {
    transactions = transactions.filter(
      (t) =>
        new Date(t.depositedAt || t.withdrawnAt) >= new Date(filters.startDate)
    );
  }

  transactions.sort(
    (a, b) =>
      new Date(b.depositedAt || b.withdrawnAt) - new Date(a.depositedAt || a.withdrawnAt)
  );

  return transactions;
};

/**
 * Update custody settings
 */
const updateCustodySettings = async (accountId, userId, settings) => {
  const data = db.read();
  const index = (data.custodyAccounts || []).findIndex(
    (a) => a.id === accountId && a.userId === userId
  );

  if (index === -1) {
    throw new Error("Custody account not found or unauthorized");
  }

  const account = data.custodyAccounts[index];

  if (settings.whitelistEnabled !== undefined) {
    account.settings.whitelistEnabled = settings.whitelistEnabled;
  }

  if (settings.whitelist) {
    account.settings.whitelist = settings.whitelist;
  }

  if (settings.dailyLimit !== undefined) {
    account.settings.dailyLimit = settings.dailyLimit;
  }

  if (settings.withdrawalDelay !== undefined) {
    account.settings.withdrawalDelay = settings.withdrawalDelay;
  }

  account.updatedAt = new Date().toISOString();
  data.custodyAccounts[index] = account;
  db.write(data);

  return account;
};

/**
 * Add to whitelist
 */
const addToWhitelist = async (accountId, userId, address) => {
  const data = db.read();
  const index = (data.custodyAccounts || []).findIndex(
    (a) => a.id === accountId && a.userId === userId
  );

  if (index === -1) {
    throw new Error("Custody account not found or unauthorized");
  }

  if (!data.custodyAccounts[index].settings.whitelist.includes(address)) {
    data.custodyAccounts[index].settings.whitelist.push(address);
    data.custodyAccounts[index].updatedAt = new Date().toISOString();
    db.write(data);
  }

  return data.custodyAccounts[index].settings.whitelist;
};

/**
 * Calculate custody fees
 */
const calculateCustodyFees = async (accountId) => {
  const account = await getCustodyAccountById(accountId);

  // Calculate total value under custody
  let totalValue = 0;
  for (const asset of account.assets) {
    totalValue += asset.value || 0;
  }

  const annualFee = totalValue * account.fees.custodyFee;
  const monthlyFee = annualFee / 12;

  return {
    accountId,
    totalValueUnderCustody: totalValue,
    feeRate: account.fees.custodyFee,
    annualFee,
    monthlyFee,
    currency: "USD",
  };
};

/**
 * Get custody statistics
 */
const getCustodyStatistics = async () => {
  const data = db.read();
  const accounts = data.custodyAccounts || [];

  const activeAccounts = accounts.filter((a) => a.status === CUSTODY_STATUS.ACTIVE);
  let totalAssetsUnderCustody = 0;

  activeAccounts.forEach((account) => {
    account.assets.forEach((asset) => {
      totalAssetsUnderCustody += asset.value || 0;
    });
  });

  return {
    totalAccounts: accounts.length,
    activeAccounts: activeAccounts.length,
    totalAssetsUnderCustody,
    byType: accounts.reduce((acc, a) => {
      acc[a.type] = (acc[a.type] || 0) + 1;
      return acc;
    }, {}),
  };
};

module.exports = {
  CUSTODY_TYPE,
  CUSTODY_STATUS,
  createCustodyAccount,
  getCustodyAccountById,
  getUserCustodyAccounts,
  depositToCustody,
  withdrawFromCustody,
  getCustodyBalances,
  getCustodyTransactions,
  updateCustodySettings,
  addToWhitelist,
  calculateCustodyFees,
  getCustodyStatistics,
};
