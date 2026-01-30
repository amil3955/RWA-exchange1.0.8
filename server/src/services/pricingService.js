const { v4: uuidv4 } = require("uuid");
const db = require("../db");

/**
 * Pricing Service - Handles price feeds, calculations, and oracles
 * Provides pricing data for assets, tokens, and trading pairs
 */

const PRICE_SOURCE = {
  INTERNAL: "internal",
  ORACLE: "oracle",
  AGGREGATED: "aggregated",
  MANUAL: "manual",
};

const PRICE_STATUS = {
  ACTIVE: "active",
  STALE: "stale",
  INVALID: "invalid",
};

/**
 * Get current price for a symbol
 */
const getPrice = async (symbol) => {
  const data = db.read();

  // Check price feeds first
  const priceFeed = (data.priceFeeds || []).find((p) => p.symbol === symbol);
  if (priceFeed && isPriceValid(priceFeed)) {
    return {
      symbol,
      price: priceFeed.price,
      source: priceFeed.source,
      timestamp: priceFeed.updatedAt,
      status: PRICE_STATUS.ACTIVE,
    };
  }

  // Fall back to last trade price
  const trades = (data.trades || [])
    .filter((t) => t.symbol === symbol)
    .sort((a, b) => new Date(b.matchedAt) - new Date(a.matchedAt));

  if (trades.length > 0) {
    return {
      symbol,
      price: trades[0].price,
      source: PRICE_SOURCE.INTERNAL,
      timestamp: trades[0].matchedAt,
      status: isPriceStale(trades[0].matchedAt) ? PRICE_STATUS.STALE : PRICE_STATUS.ACTIVE,
    };
  }

  // Fall back to market data
  const marketData = (data.marketData || []).find((m) => m.symbol === symbol);
  if (marketData) {
    return {
      symbol,
      price: marketData.price,
      source: PRICE_SOURCE.INTERNAL,
      timestamp: marketData.updatedAt || new Date().toISOString(),
      status: PRICE_STATUS.ACTIVE,
    };
  }

  return null;
};

/**
 * Check if price is valid (not stale)
 */
const isPriceValid = (priceFeed) => {
  const maxAge = 5 * 60 * 1000; // 5 minutes
  return Date.now() - new Date(priceFeed.updatedAt).getTime() < maxAge;
};

/**
 * Check if price is stale
 */
const isPriceStale = (timestamp) => {
  const staleThreshold = 30 * 60 * 1000; // 30 minutes
  return Date.now() - new Date(timestamp).getTime() > staleThreshold;
};

/**
 * Update price feed
 */
const updatePriceFeed = async (symbol, price, source = PRICE_SOURCE.INTERNAL) => {
  const data = db.read();

  if (!data.priceFeeds) {
    data.priceFeeds = [];
  }

  const index = data.priceFeeds.findIndex((p) => p.symbol === symbol);

  const priceFeed = {
    symbol,
    price,
    source,
    previousPrice: index !== -1 ? data.priceFeeds[index].price : price,
    change: index !== -1 ? price - data.priceFeeds[index].price : 0,
    changePercent: index !== -1
      ? ((price - data.priceFeeds[index].price) / data.priceFeeds[index].price) * 100
      : 0,
    updatedAt: new Date().toISOString(),
  };

  if (index !== -1) {
    data.priceFeeds[index] = priceFeed;
  } else {
    data.priceFeeds.push(priceFeed);
  }

  // Record price history
  if (!data.priceHistory) {
    data.priceHistory = [];
  }

  data.priceHistory.push({
    id: uuidv4(),
    symbol,
    price,
    source,
    timestamp: new Date().toISOString(),
  });

  // Keep only last 1000 price points per symbol
  const symbolHistory = data.priceHistory.filter((p) => p.symbol === symbol);
  if (symbolHistory.length > 1000) {
    const oldestToKeep = symbolHistory[symbolHistory.length - 1000].id;
    data.priceHistory = data.priceHistory.filter(
      (p) => p.symbol !== symbol || p.id >= oldestToKeep
    );
  }

  db.write(data);

  return priceFeed;
};

/**
 * Get price history
 */
const getPriceHistory = async (symbol, period = "24h") => {
  const data = db.read();

  let startTime;
  switch (period) {
    case "1h":
      startTime = new Date(Date.now() - 60 * 60 * 1000);
      break;
    case "24h":
      startTime = new Date(Date.now() - 24 * 60 * 60 * 1000);
      break;
    case "7d":
      startTime = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      break;
    case "30d":
      startTime = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      break;
    default:
      startTime = new Date(Date.now() - 24 * 60 * 60 * 1000);
  }

  const history = (data.priceHistory || [])
    .filter(
      (p) => p.symbol === symbol && new Date(p.timestamp) >= startTime
    )
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  if (history.length === 0) {
    return {
      symbol,
      period,
      prices: [],
      stats: null,
    };
  }

  const prices = history.map((p) => p.price);

  return {
    symbol,
    period,
    prices: history,
    stats: {
      open: prices[0],
      close: prices[prices.length - 1],
      high: Math.max(...prices),
      low: Math.min(...prices),
      change: prices[prices.length - 1] - prices[0],
      changePercent: ((prices[prices.length - 1] - prices[0]) / prices[0]) * 100,
      average: prices.reduce((a, b) => a + b, 0) / prices.length,
      dataPoints: prices.length,
    },
  };
};

/**
 * Calculate VWAP (Volume Weighted Average Price)
 */
const calculateVWAP = async (symbol, period = "24h") => {
  const data = db.read();

  let startTime;
  switch (period) {
    case "1h":
      startTime = new Date(Date.now() - 60 * 60 * 1000);
      break;
    case "24h":
      startTime = new Date(Date.now() - 24 * 60 * 60 * 1000);
      break;
    default:
      startTime = new Date(Date.now() - 24 * 60 * 60 * 1000);
  }

  const trades = (data.trades || []).filter(
    (t) => t.symbol === symbol && new Date(t.matchedAt) >= startTime
  );

  if (trades.length === 0) {
    return null;
  }

  const totalNotional = trades.reduce((sum, t) => sum + t.price * t.quantity, 0);
  const totalVolume = trades.reduce((sum, t) => sum + t.quantity, 0);

  return {
    symbol,
    vwap: totalNotional / totalVolume,
    volume: totalVolume,
    trades: trades.length,
    period,
    calculatedAt: new Date().toISOString(),
  };
};

/**
 * Calculate TWAP (Time Weighted Average Price)
 */
const calculateTWAP = async (symbol, period = "24h") => {
  const priceHistory = await getPriceHistory(symbol, period);

  if (!priceHistory.prices || priceHistory.prices.length === 0) {
    return null;
  }

  const prices = priceHistory.prices;
  let weightedSum = 0;
  let totalTime = 0;

  for (let i = 1; i < prices.length; i++) {
    const timeDiff =
      new Date(prices[i].timestamp).getTime() -
      new Date(prices[i - 1].timestamp).getTime();
    weightedSum += prices[i - 1].price * timeDiff;
    totalTime += timeDiff;
  }

  return {
    symbol,
    twap: totalTime > 0 ? weightedSum / totalTime : prices[0].price,
    period,
    dataPoints: prices.length,
    calculatedAt: new Date().toISOString(),
  };
};

/**
 * Get all price feeds
 */
const getAllPriceFeeds = async () => {
  const data = db.read();
  const feeds = data.priceFeeds || [];

  return feeds.map((feed) => ({
    ...feed,
    status: isPriceValid(feed) ? PRICE_STATUS.ACTIVE : PRICE_STATUS.STALE,
  }));
};

/**
 * Calculate asset valuation
 */
const calculateAssetValuation = async (assetId) => {
  const data = db.read();

  const asset = (data.assets || []).find((a) => a.id === assetId);
  if (!asset) {
    throw new Error("Asset not found");
  }

  // Get tokenization if exists
  const tokenization = (data.tokenizations || []).find(
    (t) => t.assetId === assetId
  );

  let marketValue = null;
  if (tokenization) {
    const priceData = await getPrice(tokenization.tokenSymbol);
    if (priceData) {
      marketValue = priceData.price * tokenization.totalSupply;
    }
  }

  return {
    assetId,
    assetName: asset.name,
    declaredValuation: asset.valuation.amount,
    valuationCurrency: asset.valuation.currency,
    valuationDate: asset.valuation.date,
    marketValue,
    tokenization: tokenization
      ? {
          tokenSymbol: tokenization.tokenSymbol,
          pricePerToken: tokenization.pricePerToken,
          totalSupply: tokenization.totalSupply,
        }
      : null,
    calculatedAt: new Date().toISOString(),
  };
};

/**
 * Get market summary
 */
const getMarketSummary = async () => {
  const data = db.read();

  const feeds = data.priceFeeds || [];
  const trades = data.trades || [];

  const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const trades24h = trades.filter((t) => new Date(t.matchedAt) >= last24h);

  const gainers = feeds
    .filter((f) => f.changePercent > 0)
    .sort((a, b) => b.changePercent - a.changePercent)
    .slice(0, 5);

  const losers = feeds
    .filter((f) => f.changePercent < 0)
    .sort((a, b) => a.changePercent - b.changePercent)
    .slice(0, 5);

  return {
    totalSymbols: feeds.length,
    activeFeeds: feeds.filter((f) => isPriceValid(f)).length,
    staleFeeds: feeds.filter((f) => !isPriceValid(f)).length,
    volume24h: trades24h.reduce((sum, t) => sum + t.notionalValue, 0),
    trades24h: trades24h.length,
    topGainers: gainers.map((g) => ({
      symbol: g.symbol,
      price: g.price,
      changePercent: g.changePercent,
    })),
    topLosers: losers.map((l) => ({
      symbol: l.symbol,
      price: l.price,
      changePercent: l.changePercent,
    })),
    updatedAt: new Date().toISOString(),
  };
};

/**
 * Calculate price impact for order
 */
const calculatePriceImpact = async (symbol, side, quantity) => {
  const data = db.read();

  // Get order book
  const orders = (data.orders || []).filter(
    (o) =>
      o.symbol === symbol &&
      (o.status === "open" || o.status === "partially_filled") &&
      o.type === "limit"
  );

  const book = side === "buy"
    ? orders.filter((o) => o.side === "sell").sort((a, b) => a.price - b.price)
    : orders.filter((o) => o.side === "buy").sort((a, b) => b.price - a.price);

  if (book.length === 0) {
    return {
      symbol,
      side,
      quantity,
      priceImpact: null,
      error: "No liquidity available",
    };
  }

  const currentPrice = book[0].price;
  let remainingQty = quantity;
  let totalCost = 0;

  for (const order of book) {
    if (remainingQty <= 0) break;
    const fillQty = Math.min(remainingQty, order.remainingQuantity);
    totalCost += fillQty * order.price;
    remainingQty -= fillQty;
  }

  if (remainingQty > 0) {
    return {
      symbol,
      side,
      quantity,
      priceImpact: null,
      error: "Insufficient liquidity for full order",
      fillableQuantity: quantity - remainingQty,
    };
  }

  const avgPrice = totalCost / quantity;
  const priceImpact = ((avgPrice - currentPrice) / currentPrice) * 100;

  return {
    symbol,
    side,
    quantity,
    currentPrice,
    avgExecutionPrice: avgPrice,
    priceImpact: side === "buy" ? priceImpact : -priceImpact,
    totalCost,
  };
};

/**
 * Register price oracle
 */
const registerOracle = async (oracleData) => {
  const data = db.read();

  if (!data.priceOracles) {
    data.priceOracles = [];
  }

  const oracle = {
    id: uuidv4(),
    name: oracleData.name,
    type: oracleData.type || "external",
    endpoint: oracleData.endpoint,
    symbols: oracleData.symbols || [],
    priority: oracleData.priority || 1,
    active: true,
    lastUpdate: null,
    errorCount: 0,
    createdAt: new Date().toISOString(),
  };

  data.priceOracles.push(oracle);
  db.write(data);

  return oracle;
};

/**
 * Get aggregated price from multiple sources
 */
const getAggregatedPrice = async (symbol) => {
  const data = db.read();

  const sources = [];

  // Internal price
  const internalPrice = await getPrice(symbol);
  if (internalPrice) {
    sources.push({
      source: "internal",
      price: internalPrice.price,
      weight: 1,
    });
  }

  // Oracle prices (mock)
  const oracles = (data.priceOracles || []).filter(
    (o) => o.active && o.symbols.includes(symbol)
  );

  oracles.forEach((oracle) => {
    // Mock oracle price (would call external API in production)
    const variation = (Math.random() - 0.5) * 0.02; // ±1% variation
    if (internalPrice) {
      sources.push({
        source: oracle.name,
        price: internalPrice.price * (1 + variation),
        weight: oracle.priority,
      });
    }
  });

  if (sources.length === 0) {
    return null;
  }

  // Calculate weighted average
  const totalWeight = sources.reduce((sum, s) => sum + s.weight, 0);
  const weightedPrice =
    sources.reduce((sum, s) => sum + s.price * s.weight, 0) / totalWeight;

  return {
    symbol,
    aggregatedPrice: weightedPrice,
    sources,
    sourceCount: sources.length,
    calculatedAt: new Date().toISOString(),
  };
};

/**
 * Get price volatility
 */
const getVolatility = async (symbol, period = "24h") => {
  const history = await getPriceHistory(symbol, period);

  if (!history.prices || history.prices.length < 2) {
    return null;
  }

  const prices = history.prices.map((p) => p.price);
  const returns = [];

  for (let i = 1; i < prices.length; i++) {
    returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
  }

  const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance =
    returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) /
    returns.length;
  const stdDev = Math.sqrt(variance);

  // Annualized volatility
  const periodsPerYear = period === "1h" ? 8760 : period === "24h" ? 365 : 52;
  const annualizedVolatility = stdDev * Math.sqrt(periodsPerYear);

  return {
    symbol,
    period,
    volatility: stdDev * 100, // Percentage
    annualizedVolatility: annualizedVolatility * 100,
    dataPoints: prices.length,
    calculatedAt: new Date().toISOString(),
  };
};

module.exports = {
  PRICE_SOURCE,
  PRICE_STATUS,
  getPrice,
  updatePriceFeed,
  getPriceHistory,
  calculateVWAP,
  calculateTWAP,
  getAllPriceFeeds,
  calculateAssetValuation,
  getMarketSummary,
  calculatePriceImpact,
  registerOracle,
  getAggregatedPrice,
  getVolatility,
};
