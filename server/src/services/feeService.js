const { v4: uuidv4 } = require("uuid");
const db = require("../db");

/**
 * Fee Service - Handles fee calculation and management
 * Supports trading fees, platform fees, and custom fee structures
 */

const FEE_TYPE = {
  TRADING: "trading",
  DEPOSIT: "deposit",
  WITHDRAWAL: "withdrawal",
  CUSTODY: "custody",
  PLATFORM: "platform",
  LISTING: "listing",
  TOKENIZATION: "tokenization",
  MANAGEMENT: "management",
  PERFORMANCE: "performance",
};

const FEE_CALCULATION = {
  PERCENTAGE: "percentage",
  FLAT: "flat",
  TIERED: "tiered",
  CUSTOM: "custom",
};

/**
 * Default fee structure
 */
const DEFAULT_FEE_STRUCTURE = {
  trading: {
    maker: 0.001, // 0.1%
    taker: 0.002, // 0.2%
    type: FEE_CALCULATION.PERCENTAGE,
  },
  deposit: {
    card: { percentage: 2.5, fixed: 0 },
    bank: { percentage: 0, fixed: 0 },
    crypto: { percentage: 0, fixed: 0 },
  },
  withdrawal: {
    bank: { percentage: 0.1, fixed: 5 },
    crypto: { percentage: 0, fixed: 0.001 },
  },
  custody: {
    rate: 0.0025, // 0.25% annually
    frequency: "monthly",
  },
  tokenization: {
    base: 5000,
    percentage: 0.5,
  },
};

/**
 * Get fee structure for user
 */
const getFeeStructure = async (userId) => {
  const data = db.read();

  // Check for custom fee structure
  const customStructure = (data.customFeeStructures || []).find(
    (f) => f.userId === userId && f.active
  );

  if (customStructure) {
    return {
      userId,
      type: "custom",
      structure: customStructure.structure,
      discount: customStructure.discount || 0,
    };
  }

  // Get user tier for tiered fees
  const userTier = await getUserTier(userId);

  // Apply tier discount
  const tierDiscounts = {
    standard: 0,
    silver: 0.1,
    gold: 0.2,
    platinum: 0.3,
    vip: 0.5,
  };

  const discount = tierDiscounts[userTier] || 0;

  return {
    userId,
    type: "standard",
    tier: userTier,
    structure: DEFAULT_FEE_STRUCTURE,
    discount,
  };
};

/**
 * Get user tier based on volume
 */
const getUserTier = async (userId) => {
  const data = db.read();

  // Calculate 30-day trading volume
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const trades = (data.trades || []).filter(
    (t) =>
      (t.makerUserId === userId || t.takerUserId === userId) &&
      new Date(t.matchedAt) >= thirtyDaysAgo
  );

  const volume = trades.reduce((sum, t) => sum + t.notionalValue, 0);

  // Tier thresholds
  if (volume >= 10000000) return "vip";
  if (volume >= 1000000) return "platinum";
  if (volume >= 100000) return "gold";
  if (volume >= 10000) return "silver";
  return "standard";
};

/**
 * Calculate trading fee
 */
const calculateTradingFee = async (userId, orderData) => {
  const feeStructure = await getFeeStructure(userId);

  const baseRate = orderData.isMaker
    ? feeStructure.structure.trading.maker
    : feeStructure.structure.trading.taker;

  const discountedRate = baseRate * (1 - feeStructure.discount);
  const notionalValue = orderData.quantity * orderData.price;
  const fee = notionalValue * discountedRate;

  return {
    userId,
    orderType: orderData.isMaker ? "maker" : "taker",
    notionalValue,
    baseRate: baseRate * 100, // Convert to percentage for display
    discount: feeStructure.discount * 100,
    effectiveRate: discountedRate * 100,
    fee: Math.round(fee * 100) / 100,
    tier: feeStructure.tier,
  };
};

/**
 * Calculate deposit fee
 */
const calculateDepositFee = async (method, amount, currency = "USD") => {
  const feeConfig = DEFAULT_FEE_STRUCTURE.deposit[method] || {
    percentage: 0,
    fixed: 0,
  };

  const fee = amount * (feeConfig.percentage / 100) + feeConfig.fixed;

  return {
    method,
    amount,
    currency,
    feePercentage: feeConfig.percentage,
    fixedFee: feeConfig.fixed,
    totalFee: Math.round(fee * 100) / 100,
    netAmount: Math.round((amount - fee) * 100) / 100,
  };
};

/**
 * Calculate withdrawal fee
 */
const calculateWithdrawalFee = async (method, amount, currency = "USD") => {
  const feeConfig = DEFAULT_FEE_STRUCTURE.withdrawal[method] || {
    percentage: 0,
    fixed: 0,
  };

  const fee = amount * (feeConfig.percentage / 100) + feeConfig.fixed;

  return {
    method,
    amount,
    currency,
    feePercentage: feeConfig.percentage,
    fixedFee: feeConfig.fixed,
    totalFee: Math.round(fee * 100) / 100,
    netAmount: Math.round((amount - fee) * 100) / 100,
  };
};

/**
 * Calculate custody fee
 */
const calculateCustodyFee = async (userId, portfolioValue) => {
  const feeStructure = await getFeeStructure(userId);

  const annualRate = DEFAULT_FEE_STRUCTURE.custody.rate;
  const discountedRate = annualRate * (1 - feeStructure.discount);
  const monthlyFee = (portfolioValue * discountedRate) / 12;

  return {
    userId,
    portfolioValue,
    annualRate: annualRate * 100,
    discount: feeStructure.discount * 100,
    effectiveAnnualRate: discountedRate * 100,
    monthlyFee: Math.round(monthlyFee * 100) / 100,
    annualFee: Math.round(portfolioValue * discountedRate * 100) / 100,
  };
};

/**
 * Calculate tokenization fee
 */
const calculateTokenizationFee = async (assetValue) => {
  const baseFee = DEFAULT_FEE_STRUCTURE.tokenization.base;
  const percentageFee = assetValue * (DEFAULT_FEE_STRUCTURE.tokenization.percentage / 100);
  const totalFee = baseFee + percentageFee;

  return {
    assetValue,
    baseFee,
    percentageFee: Math.round(percentageFee * 100) / 100,
    totalFee: Math.round(totalFee * 100) / 100,
    breakdown: {
      platformFee: baseFee,
      valueFee: percentageFee,
    },
  };
};

/**
 * Record fee charge
 */
const recordFeeCharge = async (userId, feeData) => {
  const data = db.read();

  if (!data.feeCharges) {
    data.feeCharges = [];
  }

  const charge = {
    id: uuidv4(),
    userId,
    type: feeData.type,
    amount: feeData.amount,
    currency: feeData.currency || "USD",
    description: feeData.description || null,
    relatedEntity: feeData.relatedEntity || null, // e.g., trade ID, order ID
    status: "charged",
    chargedAt: new Date().toISOString(),
  };

  data.feeCharges.push(charge);
  db.write(data);

  return charge;
};

/**
 * Get fee history for user
 */
const getFeeHistory = async (userId, filters = {}) => {
  const data = db.read();
  let charges = (data.feeCharges || []).filter((f) => f.userId === userId);

  if (filters.type) {
    charges = charges.filter((f) => f.type === filters.type);
  }

  if (filters.startDate) {
    charges = charges.filter(
      (f) => new Date(f.chargedAt) >= new Date(filters.startDate)
    );
  }

  if (filters.endDate) {
    charges = charges.filter(
      (f) => new Date(f.chargedAt) <= new Date(filters.endDate)
    );
  }

  // Sort by date descending
  charges.sort((a, b) => new Date(b.chargedAt) - new Date(a.chargedAt));

  // Pagination
  const page = filters.page || 1;
  const limit = filters.limit || 20;
  const startIndex = (page - 1) * limit;

  return {
    charges: charges.slice(startIndex, startIndex + limit),
    total: charges.length,
    page,
    totalPages: Math.ceil(charges.length / limit),
  };
};

/**
 * Get fee summary
 */
const getFeeSummary = async (userId, period = "30d") => {
  const data = db.read();

  let startDate;
  switch (period) {
    case "7d":
      startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      break;
    case "30d":
      startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      break;
    case "90d":
      startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
      break;
    case "365d":
      startDate = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
      break;
    default:
      startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  }

  const charges = (data.feeCharges || []).filter(
    (f) => f.userId === userId && new Date(f.chargedAt) >= startDate
  );

  const byType = {};
  charges.forEach((c) => {
    byType[c.type] = (byType[c.type] || 0) + c.amount;
  });

  return {
    userId,
    period,
    totalFees: charges.reduce((sum, c) => sum + c.amount, 0),
    transactionCount: charges.length,
    byType,
    averageFee:
      charges.length > 0
        ? charges.reduce((sum, c) => sum + c.amount, 0) / charges.length
        : 0,
  };
};

/**
 * Create custom fee structure
 */
const createCustomFeeStructure = async (userId, customStructure) => {
  const data = db.read();

  if (!data.customFeeStructures) {
    data.customFeeStructures = [];
  }

  // Deactivate existing custom structure
  data.customFeeStructures.forEach((f) => {
    if (f.userId === userId) {
      f.active = false;
    }
  });

  const structure = {
    id: uuidv4(),
    userId,
    structure: customStructure.structure,
    discount: customStructure.discount || 0,
    reason: customStructure.reason || null,
    validFrom: customStructure.validFrom || new Date().toISOString(),
    validUntil: customStructure.validUntil || null,
    active: true,
    createdBy: customStructure.createdBy || null,
    createdAt: new Date().toISOString(),
  };

  data.customFeeStructures.push(structure);
  db.write(data);

  return structure;
};

/**
 * Get platform fee revenue
 */
const getPlatformFeeRevenue = async (period = "30d") => {
  const data = db.read();

  let startDate;
  switch (period) {
    case "7d":
      startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      break;
    case "30d":
      startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      break;
    case "90d":
      startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
      break;
    default:
      startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  }

  const charges = (data.feeCharges || []).filter(
    (f) => new Date(f.chargedAt) >= startDate
  );

  const byType = {};
  const byDay = {};

  charges.forEach((c) => {
    byType[c.type] = (byType[c.type] || 0) + c.amount;

    const day = c.chargedAt.split("T")[0];
    byDay[day] = (byDay[day] || 0) + c.amount;
  });

  return {
    period,
    totalRevenue: charges.reduce((sum, c) => sum + c.amount, 0),
    totalTransactions: charges.length,
    byType,
    dailyRevenue: Object.entries(byDay)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, amount]) => ({ date, amount })),
  };
};

module.exports = {
  FEE_TYPE,
  FEE_CALCULATION,
  getFeeStructure,
  getUserTier,
  calculateTradingFee,
  calculateDepositFee,
  calculateWithdrawalFee,
  calculateCustodyFee,
  calculateTokenizationFee,
  recordFeeCharge,
  getFeeHistory,
  getFeeSummary,
  createCustomFeeStructure,
  getPlatformFeeRevenue,
};
