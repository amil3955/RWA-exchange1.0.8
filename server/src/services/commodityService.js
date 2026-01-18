const { v4: uuidv4 } = require("uuid");
const db = require("../db");

/**
 * Commodity Service - Handles commodity assets
 * Supports precious metals, energy, agricultural products, and industrial metals
 */

const COMMODITY_TYPE = {
  PRECIOUS_METALS: "precious_metals",
  ENERGY: "energy",
  AGRICULTURAL: "agricultural",
  INDUSTRIAL_METALS: "industrial_metals",
  LIVESTOCK: "livestock",
};

const COMMODITY_SYMBOL = {
  // Precious Metals
  GOLD: { symbol: "XAU", name: "Gold", unit: "oz", type: COMMODITY_TYPE.PRECIOUS_METALS },
  SILVER: { symbol: "XAG", name: "Silver", unit: "oz", type: COMMODITY_TYPE.PRECIOUS_METALS },
  PLATINUM: { symbol: "XPT", name: "Platinum", unit: "oz", type: COMMODITY_TYPE.PRECIOUS_METALS },
  PALLADIUM: { symbol: "XPD", name: "Palladium", unit: "oz", type: COMMODITY_TYPE.PRECIOUS_METALS },
  // Energy
  CRUDE_OIL: { symbol: "CL", name: "Crude Oil", unit: "barrel", type: COMMODITY_TYPE.ENERGY },
  NATURAL_GAS: { symbol: "NG", name: "Natural Gas", unit: "mmbtu", type: COMMODITY_TYPE.ENERGY },
  // Agricultural
  WHEAT: { symbol: "ZW", name: "Wheat", unit: "bushel", type: COMMODITY_TYPE.AGRICULTURAL },
  CORN: { symbol: "ZC", name: "Corn", unit: "bushel", type: COMMODITY_TYPE.AGRICULTURAL },
  COFFEE: { symbol: "KC", name: "Coffee", unit: "lb", type: COMMODITY_TYPE.AGRICULTURAL },
  // Industrial Metals
  COPPER: { symbol: "HG", name: "Copper", unit: "lb", type: COMMODITY_TYPE.INDUSTRIAL_METALS },
  ALUMINUM: { symbol: "ALI", name: "Aluminum", unit: "mt", type: COMMODITY_TYPE.INDUSTRIAL_METALS },
};

const STORAGE_TYPE = {
  VAULT: "vault",
  WAREHOUSE: "warehouse",
  ALLOCATED: "allocated",
  UNALLOCATED: "unallocated",
  DELIVERED: "delivered",
};

/**
 * Create a commodity holding
 */
const createHolding = async (ownerId, holdingData) => {
  const data = db.read();

  if (!data.commodityHoldings) {
    data.commodityHoldings = [];
  }

  const commodityInfo = Object.values(COMMODITY_SYMBOL).find(
    (c) => c.symbol === holdingData.symbol
  );

  const holding = {
    id: uuidv4(),
    ownerId,
    assetId: holdingData.assetId || null,
    symbol: holdingData.symbol,
    name: commodityInfo?.name || holdingData.name,
    type: commodityInfo?.type || holdingData.type,
    quantity: holdingData.quantity,
    unit: commodityInfo?.unit || holdingData.unit,
    purity: holdingData.purity || null, // For precious metals (e.g., 0.999)
    storage: {
      type: holdingData.storageType || STORAGE_TYPE.VAULT,
      location: holdingData.storageLocation || null,
      provider: holdingData.storageProvider || null,
      fee: holdingData.storageFee || 0,
      feeFrequency: holdingData.storageFeeFrequency || "monthly",
    },
    acquisition: {
      date: holdingData.acquisitionDate || new Date().toISOString(),
      price: holdingData.acquisitionPrice || 0,
      totalCost: holdingData.totalCost || holdingData.quantity * holdingData.acquisitionPrice,
      source: holdingData.source || null,
    },
    certification: {
      serialNumber: holdingData.serialNumber || null,
      assayReport: holdingData.assayReport || null,
      certifyingBody: holdingData.certifyingBody || null,
      certificationDate: holdingData.certificationDate || null,
    },
    insurance: {
      provider: holdingData.insuranceProvider || null,
      policyNumber: holdingData.insurancePolicyNumber || null,
      coverage: holdingData.insuranceCoverage || 0,
      expiryDate: holdingData.insuranceExpiry || null,
    },
    status: "active",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  data.commodityHoldings.push(holding);
  db.write(data);

  return holding;
};

/**
 * Get holding by ID
 */
const getHoldingById = async (holdingId) => {
  const data = db.read();
  const holding = (data.commodityHoldings || []).find((h) => h.id === holdingId);

  if (!holding) {
    throw new Error("Commodity holding not found");
  }

  return holding;
};

/**
 * Get user holdings
 */
const getUserHoldings = async (ownerId, filters = {}) => {
  const data = db.read();
  let holdings = (data.commodityHoldings || []).filter((h) => h.ownerId === ownerId);

  if (filters.symbol) {
    holdings = holdings.filter((h) => h.symbol === filters.symbol);
  }

  if (filters.type) {
    holdings = holdings.filter((h) => h.type === filters.type);
  }

  if (filters.storageType) {
    holdings = holdings.filter((h) => h.storage.type === filters.storageType);
  }

  return holdings;
};

/**
 * Update holding quantity
 */
const updateQuantity = async (holdingId, ownerId, quantityChange, reason) => {
  const data = db.read();
  const index = (data.commodityHoldings || []).findIndex(
    (h) => h.id === holdingId && h.ownerId === ownerId
  );

  if (index === -1) {
    throw new Error("Holding not found or unauthorized");
  }

  const holding = data.commodityHoldings[index];
  const previousQuantity = holding.quantity;
  holding.quantity += quantityChange;

  if (holding.quantity < 0) {
    throw new Error("Insufficient quantity");
  }

  // Record transaction
  if (!data.commodityTransactions) {
    data.commodityTransactions = [];
  }

  data.commodityTransactions.push({
    id: uuidv4(),
    holdingId,
    ownerId,
    type: quantityChange > 0 ? "addition" : "reduction",
    quantity: Math.abs(quantityChange),
    previousQuantity,
    newQuantity: holding.quantity,
    reason,
    timestamp: new Date().toISOString(),
  });

  holding.updatedAt = new Date().toISOString();
  data.commodityHoldings[index] = holding;
  db.write(data);

  return holding;
};

/**
 * Get current market price (mock)
 */
const getMarketPrice = async (symbol) => {
  const data = db.read();

  // Check price feeds
  const priceFeed = (data.priceFeeds || []).find((p) => p.symbol === symbol);
  if (priceFeed) {
    return {
      symbol,
      price: priceFeed.price,
      change: priceFeed.change || 0,
      changePercent: priceFeed.changePercent || 0,
      timestamp: priceFeed.updatedAt,
    };
  }

  // Mock prices
  const mockPrices = {
    XAU: 1950.50,
    XAG: 24.30,
    XPT: 1020.00,
    XPD: 1450.00,
    CL: 75.50,
    NG: 2.80,
    ZW: 6.25,
    ZC: 4.75,
    KC: 1.85,
    HG: 3.85,
    ALI: 2350.00,
  };

  const price = mockPrices[symbol] || 100;
  const change = (Math.random() - 0.5) * 2;
  const changePercent = (change / price) * 100;

  return {
    symbol,
    price,
    change,
    changePercent,
    timestamp: new Date().toISOString(),
  };
};

/**
 * Calculate holding value
 */
const calculateHoldingValue = async (holdingId) => {
  const holding = await getHoldingById(holdingId);
  const marketPrice = await getMarketPrice(holding.symbol);

  const currentValue = holding.quantity * marketPrice.price;
  const costBasis = holding.acquisition.totalCost;
  const unrealizedPnl = currentValue - costBasis;
  const unrealizedPnlPercent = (unrealizedPnl / costBasis) * 100;

  return {
    holdingId,
    symbol: holding.symbol,
    quantity: holding.quantity,
    unit: holding.unit,
    marketPrice: marketPrice.price,
    currentValue,
    costBasis,
    unrealizedPnl,
    unrealizedPnlPercent,
    priceChange: marketPrice.change,
    priceChangePercent: marketPrice.changePercent,
  };
};

/**
 * Get portfolio valuation
 */
const getPortfolioValuation = async (ownerId) => {
  const holdings = await getUserHoldings(ownerId);

  let totalValue = 0;
  let totalCost = 0;
  const valuations = [];

  for (const holding of holdings) {
    const valuation = await calculateHoldingValue(holding.id);
    valuations.push(valuation);
    totalValue += valuation.currentValue;
    totalCost += valuation.costBasis;
  }

  const byType = {};
  valuations.forEach((v) => {
    const holding = holdings.find((h) => h.id === v.holdingId);
    if (holding) {
      byType[holding.type] = (byType[holding.type] || 0) + v.currentValue;
    }
  });

  return {
    ownerId,
    totalHoldings: holdings.length,
    totalValue,
    totalCost,
    totalUnrealizedPnl: totalValue - totalCost,
    totalUnrealizedPnlPercent: totalCost > 0 ? ((totalValue - totalCost) / totalCost) * 100 : 0,
    byType,
    holdings: valuations,
    valuedAt: new Date().toISOString(),
  };
};

/**
 * Transfer commodity
 */
const transferCommodity = async (holdingId, fromOwnerId, toOwnerId, quantity) => {
  const data = db.read();
  const index = (data.commodityHoldings || []).findIndex(
    (h) => h.id === holdingId && h.ownerId === fromOwnerId
  );

  if (index === -1) {
    throw new Error("Holding not found or unauthorized");
  }

  const holding = data.commodityHoldings[index];

  if (holding.quantity < quantity) {
    throw new Error("Insufficient quantity for transfer");
  }

  // Reduce from sender
  holding.quantity -= quantity;
  holding.updatedAt = new Date().toISOString();

  // Create or update recipient holding
  const recipientHolding = data.commodityHoldings.find(
    (h) => h.ownerId === toOwnerId && h.symbol === holding.symbol
  );

  if (recipientHolding) {
    recipientHolding.quantity += quantity;
    recipientHolding.updatedAt = new Date().toISOString();
  } else {
    const newHolding = {
      ...holding,
      id: uuidv4(),
      ownerId: toOwnerId,
      quantity,
      acquisition: {
        date: new Date().toISOString(),
        price: 0,
        totalCost: 0,
        source: "transfer",
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    data.commodityHoldings.push(newHolding);
  }

  // Record transfer
  if (!data.commodityTransfers) {
    data.commodityTransfers = [];
  }

  data.commodityTransfers.push({
    id: uuidv4(),
    holdingId,
    fromOwnerId,
    toOwnerId,
    symbol: holding.symbol,
    quantity,
    timestamp: new Date().toISOString(),
  });

  db.write(data);

  return { success: true, quantity, symbol: holding.symbol };
};

/**
 * Get commodity market summary
 */
const getMarketSummary = async () => {
  const symbols = Object.values(COMMODITY_SYMBOL).map((c) => c.symbol);
  const prices = [];

  for (const symbol of symbols) {
    const price = await getMarketPrice(symbol);
    const info = Object.values(COMMODITY_SYMBOL).find((c) => c.symbol === symbol);
    prices.push({
      ...price,
      name: info?.name,
      type: info?.type,
      unit: info?.unit,
    });
  }

  const byType = {};
  prices.forEach((p) => {
    if (!byType[p.type]) {
      byType[p.type] = [];
    }
    byType[p.type].push(p);
  });

  return {
    timestamp: new Date().toISOString(),
    commodities: prices,
    byType,
  };
};

/**
 * Update storage information
 */
const updateStorage = async (holdingId, ownerId, storageData) => {
  const data = db.read();
  const index = (data.commodityHoldings || []).findIndex(
    (h) => h.id === holdingId && h.ownerId === ownerId
  );

  if (index === -1) {
    throw new Error("Holding not found or unauthorized");
  }

  data.commodityHoldings[index].storage = {
    ...data.commodityHoldings[index].storage,
    ...storageData,
  };
  data.commodityHoldings[index].updatedAt = new Date().toISOString();

  db.write(data);

  return data.commodityHoldings[index];
};

/**
 * Get storage costs
 */
const calculateStorageCosts = async (ownerId) => {
  const holdings = await getUserHoldings(ownerId);

  let monthlyTotal = 0;
  const costs = [];

  holdings.forEach((h) => {
    const monthlyFee =
      h.storage.feeFrequency === "monthly"
        ? h.storage.fee
        : h.storage.feeFrequency === "annual"
        ? h.storage.fee / 12
        : h.storage.fee;

    monthlyTotal += monthlyFee;
    costs.push({
      holdingId: h.id,
      symbol: h.symbol,
      storageType: h.storage.type,
      provider: h.storage.provider,
      monthlyFee,
    });
  });

  return {
    ownerId,
    monthlyCosts: monthlyTotal,
    annualCosts: monthlyTotal * 12,
    holdings: costs,
  };
};

module.exports = {
  COMMODITY_TYPE,
  COMMODITY_SYMBOL,
  STORAGE_TYPE,
  createHolding,
  getHoldingById,
  getUserHoldings,
  updateQuantity,
  getMarketPrice,
  calculateHoldingValue,
  getPortfolioValuation,
  transferCommodity,
  getMarketSummary,
  updateStorage,
  calculateStorageCosts,
};
