const { v4: uuidv4 } = require("uuid");
const db = require("../db");

/**
 * Market Maker Service - Automated market making operations
 * Provides liquidity and maintains spreads
 */

const MM_STATUS = {
  ACTIVE: "active",
  PAUSED: "paused",
  STOPPED: "stopped",
  ERROR: "error",
};

const MM_STRATEGY = {
  BASIC: "basic",
  AGGRESSIVE: "aggressive",
  CONSERVATIVE: "conservative",
  DYNAMIC: "dynamic",
};

/**
 * Create market maker configuration
 */
const createMarketMaker = async (userId, config) => {
  const data = db.read();

  if (!data.marketMakers) {
    data.marketMakers = [];
  }

  const marketMaker = {
    id: uuidv4(),
    userId,
    symbol: config.symbol,
    strategy: config.strategy || MM_STRATEGY.BASIC,
    status: MM_STATUS.PAUSED,
    parameters: {
      spreadBps: config.spreadBps || 50, // 0.5% spread
      orderSize: config.orderSize || 100,
      numLevels: config.numLevels || 5,
      levelSpacing: config.levelSpacing || 10, // bps between levels
      maxPosition: config.maxPosition || 10000,
      minPosition: config.minPosition || -10000,
      inventoryTarget: config.inventoryTarget || 0,
      rebalanceThreshold: config.rebalanceThreshold || 0.1,
      maxOrderValue: config.maxOrderValue || 100000,
      refreshInterval: config.refreshInterval || 5000, // ms
    },
    state: {
      currentPosition: 0,
      activeOrders: [],
      totalVolume: 0,
      totalPnl: 0,
      lastQuoteTime: null,
    },
    statistics: {
      quotesProvided: 0,
      tradesExecuted: 0,
      averageSpread: 0,
      uptimePercent: 100,
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  data.marketMakers.push(marketMaker);
  db.write(data);

  return marketMaker;
};

/**
 * Get market maker by ID
 */
const getMarketMakerById = async (marketMakerId) => {
  const data = db.read();
  const mm = (data.marketMakers || []).find((m) => m.id === marketMakerId);

  if (!mm) {
    throw new Error("Market maker not found");
  }

  return mm;
};

/**
 * Get market makers by user
 */
const getUserMarketMakers = async (userId) => {
  const data = db.read();
  return (data.marketMakers || []).filter((m) => m.userId === userId);
};

/**
 * Update market maker parameters
 */
const updateParameters = async (marketMakerId, userId, parameters) => {
  const data = db.read();
  const index = (data.marketMakers || []).findIndex(
    (m) => m.id === marketMakerId && m.userId === userId
  );

  if (index === -1) {
    throw new Error("Market maker not found or unauthorized");
  }

  data.marketMakers[index].parameters = {
    ...data.marketMakers[index].parameters,
    ...parameters,
  };
  data.marketMakers[index].updatedAt = new Date().toISOString();

  db.write(data);

  return data.marketMakers[index];
};

/**
 * Start market maker
 */
const startMarketMaker = async (marketMakerId, userId) => {
  const data = db.read();
  const index = (data.marketMakers || []).findIndex(
    (m) => m.id === marketMakerId && m.userId === userId
  );

  if (index === -1) {
    throw new Error("Market maker not found or unauthorized");
  }

  data.marketMakers[index].status = MM_STATUS.ACTIVE;
  data.marketMakers[index].state.startedAt = new Date().toISOString();
  data.marketMakers[index].updatedAt = new Date().toISOString();

  db.write(data);

  return data.marketMakers[index];
};

/**
 * Stop market maker
 */
const stopMarketMaker = async (marketMakerId, userId) => {
  const data = db.read();
  const index = (data.marketMakers || []).findIndex(
    (m) => m.id === marketMakerId && m.userId === userId
  );

  if (index === -1) {
    throw new Error("Market maker not found or unauthorized");
  }

  data.marketMakers[index].status = MM_STATUS.STOPPED;
  data.marketMakers[index].state.stoppedAt = new Date().toISOString();
  data.marketMakers[index].state.activeOrders = [];
  data.marketMakers[index].updatedAt = new Date().toISOString();

  db.write(data);

  return data.marketMakers[index];
};

/**
 * Generate quotes for market maker
 */
const generateQuotes = async (marketMakerId) => {
  const data = db.read();
  const mm = (data.marketMakers || []).find((m) => m.id === marketMakerId);

  if (!mm) {
    throw new Error("Market maker not found");
  }

  if (mm.status !== MM_STATUS.ACTIVE) {
    throw new Error("Market maker is not active");
  }

  // Get current market price (mock)
  const midPrice = await getMidPrice(mm.symbol, data);
  if (!midPrice) {
    return { error: "Unable to determine mid price" };
  }

  const spreadBps = mm.parameters.spreadBps;
  const halfSpread = midPrice * (spreadBps / 10000 / 2);

  const quotes = [];

  // Generate bid quotes
  for (let i = 0; i < mm.parameters.numLevels; i++) {
    const levelOffset = i * mm.parameters.levelSpacing / 10000 * midPrice;
    const bidPrice = midPrice - halfSpread - levelOffset;
    const size = calculateOrderSize(mm, "buy", i);

    quotes.push({
      side: "buy",
      price: Math.round(bidPrice * 100) / 100,
      quantity: size,
      level: i + 1,
    });
  }

  // Generate ask quotes
  for (let i = 0; i < mm.parameters.numLevels; i++) {
    const levelOffset = i * mm.parameters.levelSpacing / 10000 * midPrice;
    const askPrice = midPrice + halfSpread + levelOffset;
    const size = calculateOrderSize(mm, "sell", i);

    quotes.push({
      side: "sell",
      price: Math.round(askPrice * 100) / 100,
      quantity: size,
      level: i + 1,
    });
  }

  return {
    marketMakerId,
    symbol: mm.symbol,
    midPrice,
    spread: halfSpread * 2,
    spreadBps,
    quotes,
    generatedAt: new Date().toISOString(),
  };
};

/**
 * Get mid price for symbol
 */
const getMidPrice = async (symbol, data) => {
  // Try to get from recent trades
  const trades = (data.trades || [])
    .filter((t) => t.symbol === symbol)
    .sort((a, b) => new Date(b.matchedAt) - new Date(a.matchedAt));

  if (trades.length > 0) {
    return trades[0].price;
  }

  // Fallback to market data if available
  const marketData = (data.marketData || []).find((m) => m.symbol === symbol);
  if (marketData) {
    return marketData.price;
  }

  // Default price for mock
  return 100;
};

/**
 * Calculate order size based on inventory
 */
const calculateOrderSize = (mm, side, level) => {
  const baseSize = mm.parameters.orderSize;
  const position = mm.state.currentPosition;
  const inventoryTarget = mm.parameters.inventoryTarget;

  // Reduce size for levels further from best
  const levelMultiplier = 1 / (1 + level * 0.2);

  // Adjust for inventory
  let inventoryMultiplier = 1;
  if (side === "buy" && position > inventoryTarget) {
    inventoryMultiplier = Math.max(0.1, 1 - (position - inventoryTarget) / mm.parameters.maxPosition);
  } else if (side === "sell" && position < inventoryTarget) {
    inventoryMultiplier = Math.max(0.1, 1 - (inventoryTarget - position) / Math.abs(mm.parameters.minPosition));
  }

  return Math.round(baseSize * levelMultiplier * inventoryMultiplier);
};

/**
 * Update market maker state
 */
const updateState = async (marketMakerId, stateUpdate) => {
  const data = db.read();
  const index = (data.marketMakers || []).findIndex((m) => m.id === marketMakerId);

  if (index === -1) {
    throw new Error("Market maker not found");
  }

  data.marketMakers[index].state = {
    ...data.marketMakers[index].state,
    ...stateUpdate,
  };
  data.marketMakers[index].updatedAt = new Date().toISOString();

  db.write(data);

  return data.marketMakers[index];
};

/**
 * Record market maker trade
 */
const recordTrade = async (marketMakerId, tradeData) => {
  const data = db.read();
  const index = (data.marketMakers || []).findIndex((m) => m.id === marketMakerId);

  if (index === -1) {
    throw new Error("Market maker not found");
  }

  const mm = data.marketMakers[index];

  // Update position
  const positionDelta = tradeData.side === "buy" ? tradeData.quantity : -tradeData.quantity;
  mm.state.currentPosition += positionDelta;

  // Update volume
  mm.state.totalVolume += tradeData.quantity * tradeData.price;

  // Update PnL (simplified)
  const pnlDelta = tradeData.side === "buy"
    ? -tradeData.quantity * tradeData.price
    : tradeData.quantity * tradeData.price;
  mm.state.totalPnl += pnlDelta;

  // Update statistics
  mm.statistics.tradesExecuted++;

  mm.updatedAt = new Date().toISOString();
  data.marketMakers[index] = mm;
  db.write(data);

  return mm;
};

/**
 * Get market maker performance
 */
const getPerformance = async (marketMakerId) => {
  const data = db.read();
  const mm = (data.marketMakers || []).find((m) => m.id === marketMakerId);

  if (!mm) {
    throw new Error("Market maker not found");
  }

  const startTime = mm.state.startedAt ? new Date(mm.state.startedAt) : new Date(mm.createdAt);
  const runningTime = Date.now() - startTime.getTime();
  const runningHours = runningTime / (1000 * 60 * 60);

  return {
    marketMakerId,
    symbol: mm.symbol,
    status: mm.status,
    currentPosition: mm.state.currentPosition,
    totalVolume: mm.state.totalVolume,
    totalPnl: mm.state.totalPnl,
    tradesExecuted: mm.statistics.tradesExecuted,
    quotesProvided: mm.statistics.quotesProvided,
    volumePerHour: runningHours > 0 ? mm.state.totalVolume / runningHours : 0,
    tradesPerHour: runningHours > 0 ? mm.statistics.tradesExecuted / runningHours : 0,
    runningTime: runningTime,
    runningHours: Math.round(runningHours * 100) / 100,
    calculatedAt: new Date().toISOString(),
  };
};

/**
 * Get all active market makers
 */
const getActiveMarketMakers = async () => {
  const data = db.read();
  return (data.marketMakers || []).filter((m) => m.status === MM_STATUS.ACTIVE);
};

/**
 * Calculate optimal spread
 */
const calculateOptimalSpread = async (symbol) => {
  const data = db.read();

  // Get recent trades for volatility
  const trades = (data.trades || [])
    .filter((t) => t.symbol === symbol)
    .sort((a, b) => new Date(b.matchedAt) - new Date(a.matchedAt))
    .slice(0, 100);

  if (trades.length < 10) {
    return { spreadBps: 50, reason: "insufficient_data" };
  }

  // Calculate volatility
  const prices = trades.map((t) => t.price);
  const returns = [];
  for (let i = 1; i < prices.length; i++) {
    returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
  }

  const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
  const volatility = Math.sqrt(variance);

  // Higher volatility = wider spread
  const baseSpread = 30; // bps
  const volatilityMultiplier = 1 + volatility * 100;
  const optimalSpread = Math.round(baseSpread * volatilityMultiplier);

  return {
    spreadBps: Math.min(optimalSpread, 200), // Cap at 2%
    volatility,
    sampleSize: trades.length,
    reason: "volatility_based",
  };
};

/**
 * Get inventory risk
 */
const getInventoryRisk = async (marketMakerId) => {
  const data = db.read();
  const mm = (data.marketMakers || []).find((m) => m.id === marketMakerId);

  if (!mm) {
    throw new Error("Market maker not found");
  }

  const position = mm.state.currentPosition;
  const maxPosition = mm.parameters.maxPosition;
  const minPosition = mm.parameters.minPosition;

  let riskLevel = "low";
  let utilizationPercent = 0;

  if (position > 0) {
    utilizationPercent = (position / maxPosition) * 100;
  } else {
    utilizationPercent = (position / minPosition) * 100;
  }

  if (utilizationPercent > 80) {
    riskLevel = "critical";
  } else if (utilizationPercent > 60) {
    riskLevel = "high";
  } else if (utilizationPercent > 40) {
    riskLevel = "medium";
  }

  return {
    marketMakerId,
    currentPosition: position,
    maxPosition,
    minPosition,
    utilizationPercent: Math.abs(utilizationPercent),
    riskLevel,
    recommendedAction:
      riskLevel === "critical"
        ? "reduce_position_immediately"
        : riskLevel === "high"
        ? "reduce_quoting_size"
        : "continue_normal_operation",
  };
};

/**
 * Delete market maker
 */
const deleteMarketMaker = async (marketMakerId, userId) => {
  const data = db.read();
  const index = (data.marketMakers || []).findIndex(
    (m) => m.id === marketMakerId && m.userId === userId
  );

  if (index === -1) {
    throw new Error("Market maker not found or unauthorized");
  }

  if (data.marketMakers[index].status === MM_STATUS.ACTIVE) {
    throw new Error("Cannot delete active market maker. Stop it first.");
  }

  data.marketMakers.splice(index, 1);
  db.write(data);

  return { success: true, message: "Market maker deleted" };
};

/**
 * Get market maker statistics summary
 */
const getStatisticsSummary = async () => {
  const data = db.read();
  const marketMakers = data.marketMakers || [];

  const active = marketMakers.filter((m) => m.status === MM_STATUS.ACTIVE);
  const totalVolume = marketMakers.reduce((sum, m) => sum + m.state.totalVolume, 0);
  const totalPnl = marketMakers.reduce((sum, m) => sum + m.state.totalPnl, 0);
  const totalTrades = marketMakers.reduce((sum, m) => sum + m.statistics.tradesExecuted, 0);

  return {
    totalMarketMakers: marketMakers.length,
    activeMarketMakers: active.length,
    symbolsCovered: [...new Set(active.map((m) => m.symbol))].length,
    totalVolume,
    totalPnl,
    totalTrades,
  };
};

module.exports = {
  MM_STATUS,
  MM_STRATEGY,
  createMarketMaker,
  getMarketMakerById,
  getUserMarketMakers,
  updateParameters,
  startMarketMaker,
  stopMarketMaker,
  generateQuotes,
  updateState,
  recordTrade,
  getPerformance,
  getActiveMarketMakers,
  calculateOptimalSpread,
  getInventoryRisk,
  deleteMarketMaker,
  getStatisticsSummary,
};
