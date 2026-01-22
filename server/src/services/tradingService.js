const { v4: uuidv4 } = require("uuid");
const db = require("../db");
const orderService = require("./orderService");
const matchingService = require("./matchingService");

/**
 * Trading Service - High-level trading operations
 * Coordinates order placement, matching, and execution
 */

const TRADING_STATUS = {
  ENABLED: "enabled",
  DISABLED: "disabled",
  MAINTENANCE: "maintenance",
  HALTED: "halted",
};

const POSITION_SIDE = {
  LONG: "long",
  SHORT: "short",
};

/**
 * Place a trade order
 */
const placeOrder = async (userId, orderData) => {
  // Check trading status
  const tradingStatus = await getTradingStatus(orderData.symbol);
  if (tradingStatus.status !== TRADING_STATUS.ENABLED) {
    throw new Error(`Trading is ${tradingStatus.status} for ${orderData.symbol}`);
  }

  // Check user trading permissions
  const permissions = await checkTradingPermissions(userId);
  if (!permissions.canTrade) {
    throw new Error(permissions.reason);
  }

  // Validate order
  const validation = await validateTrade(userId, orderData);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  // Create order
  const order = await orderService.createOrder(userId, orderData);

  // Update order status to open
  await orderService.updateOrderStatus(order.id, orderService.ORDER_STATUS.OPEN);

  // Try to match immediately if market order or limit order that can cross
  if (orderData.type === "market" || shouldAttemptMatch(orderData)) {
    const matchResult = await matchingService.matchOrder(order);

    if (matchResult.matches.length > 0) {
      // Process matches
      for (const match of matchResult.matches) {
        await orderService.addFill(order.id, {
          quantity: match.matchQuantity,
          price: match.trade.price,
          fee: match.trade.takerFee,
          tradeId: match.trade.id,
        });

        await orderService.addFill(match.makerOrder.id, {
          quantity: match.matchQuantity,
          price: match.trade.price,
          fee: match.trade.makerFee,
          tradeId: match.trade.id,
        });
      }
    }

    // Get updated order
    const updatedOrder = await orderService.getOrderById(order.id);
    return {
      order: updatedOrder,
      matches: matchResult.matches,
      fullyFilled: matchResult.fullyFilled,
    };
  }

  return {
    order,
    matches: [],
    fullyFilled: false,
  };
};

/**
 * Check if order should attempt immediate matching
 */
const shouldAttemptMatch = (orderData) => {
  return orderData.type === "market" || orderData.type === "limit";
};

/**
 * Check trading permissions for user
 */
const checkTradingPermissions = async (userId) => {
  const data = db.read();

  // Check if user is blocked
  const blockedUser = (data.blockedUsers || []).find((b) => b.userId === userId);
  if (blockedUser) {
    return {
      canTrade: false,
      reason: "User is blocked from trading",
    };
  }

  // Check KYC status
  const kycRecord = (data.kycRecords || []).find((k) => k.userId === userId);
  if (!kycRecord || kycRecord.status !== "approved") {
    return {
      canTrade: false,
      reason: "KYC verification required",
    };
  }

  return {
    canTrade: true,
    kycLevel: kycRecord.level,
  };
};

/**
 * Validate trade
 */
const validateTrade = async (userId, orderData) => {
  const data = db.read();

  // Check minimum order size
  const minOrderSize = 0.0001;
  if (orderData.quantity < minOrderSize) {
    return {
      valid: false,
      error: `Minimum order size is ${minOrderSize}`,
    };
  }

  // Check maximum order size
  const maxOrderSize = 1000000;
  if (orderData.quantity > maxOrderSize) {
    return {
      valid: false,
      error: `Maximum order size is ${maxOrderSize}`,
    };
  }

  // Check price limits for limit orders
  if (orderData.type === "limit" && orderData.price) {
    const marketData = await getMarketData(orderData.symbol);
    if (marketData.lastPrice) {
      const priceDiffPercent =
        Math.abs(orderData.price - marketData.lastPrice) / marketData.lastPrice;
      if (priceDiffPercent > 0.5) {
        return {
          valid: false,
          error: "Order price is too far from market price",
        };
      }
    }
  }

  return { valid: true };
};

/**
 * Get trading status for symbol
 */
const getTradingStatus = async (symbol) => {
  const data = db.read();

  const tradingPair = (data.tradingPairs || []).find((p) => p.symbol === symbol);

  if (!tradingPair) {
    // Default to enabled if pair not found
    return {
      symbol,
      status: TRADING_STATUS.ENABLED,
      reason: null,
    };
  }

  return {
    symbol,
    status: tradingPair.status || TRADING_STATUS.ENABLED,
    reason: tradingPair.statusReason || null,
    since: tradingPair.statusSince || null,
  };
};

/**
 * Get market data for symbol
 */
const getMarketData = async (symbol) => {
  const data = db.read();

  const trades = (data.trades || [])
    .filter((t) => t.symbol === symbol)
    .sort((a, b) => new Date(b.matchedAt) - new Date(a.matchedAt));

  const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const trades24h = trades.filter((t) => new Date(t.matchedAt) >= last24h);

  if (trades.length === 0) {
    return {
      symbol,
      lastPrice: null,
      volume24h: 0,
      high24h: null,
      low24h: null,
      change24h: null,
      changePercent24h: null,
    };
  }

  const lastPrice = trades[0].price;
  const prices24h = trades24h.map((t) => t.price);
  const volume24h = trades24h.reduce((sum, t) => sum + t.quantity, 0);

  const sortedTrades24h = trades24h.sort(
    (a, b) => new Date(a.matchedAt) - new Date(b.matchedAt)
  );
  const openPrice24h =
    sortedTrades24h.length > 0 ? sortedTrades24h[0].price : lastPrice;
  const change24h = lastPrice - openPrice24h;
  const changePercent24h = openPrice24h ? (change24h / openPrice24h) * 100 : 0;

  return {
    symbol,
    lastPrice,
    volume24h,
    high24h: prices24h.length > 0 ? Math.max(...prices24h) : null,
    low24h: prices24h.length > 0 ? Math.min(...prices24h) : null,
    change24h,
    changePercent24h,
    updatedAt: new Date().toISOString(),
  };
};

/**
 * Get user positions
 */
const getUserPositions = async (userId) => {
  const data = db.read();

  if (!data.positions) {
    data.positions = [];
  }

  const positions = data.positions.filter((p) => p.userId === userId);

  // Calculate unrealized P&L for each position
  const enrichedPositions = await Promise.all(
    positions.map(async (position) => {
      const marketData = await getMarketData(position.symbol);
      const currentPrice = marketData.lastPrice || position.averageEntryPrice;
      const unrealizedPnl =
        (currentPrice - position.averageEntryPrice) *
        position.quantity *
        (position.side === POSITION_SIDE.LONG ? 1 : -1);

      return {
        ...position,
        currentPrice,
        unrealizedPnl,
        unrealizedPnlPercent: (unrealizedPnl / position.cost) * 100,
      };
    })
  );

  return enrichedPositions;
};

/**
 * Update user position
 */
const updatePosition = async (userId, symbol, positionUpdate) => {
  const data = db.read();

  if (!data.positions) {
    data.positions = [];
  }

  const index = data.positions.findIndex(
    (p) => p.userId === userId && p.symbol === symbol
  );

  if (index === -1) {
    // Create new position
    const newPosition = {
      id: uuidv4(),
      userId,
      symbol,
      side: positionUpdate.side,
      quantity: positionUpdate.quantity,
      averageEntryPrice: positionUpdate.price,
      cost: positionUpdate.quantity * positionUpdate.price,
      realizedPnl: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    data.positions.push(newPosition);
    db.write(data);

    return newPosition;
  }

  const position = data.positions[index];

  if (positionUpdate.action === "add") {
    // Adding to position
    const newQuantity = position.quantity + positionUpdate.quantity;
    const newCost = position.cost + positionUpdate.quantity * positionUpdate.price;
    position.averageEntryPrice = newCost / newQuantity;
    position.quantity = newQuantity;
    position.cost = newCost;
  } else if (positionUpdate.action === "reduce") {
    // Reducing position
    const reduceQuantity = Math.min(positionUpdate.quantity, position.quantity);
    const realizedPnl =
      (positionUpdate.price - position.averageEntryPrice) *
      reduceQuantity *
      (position.side === POSITION_SIDE.LONG ? 1 : -1);

    position.quantity -= reduceQuantity;
    position.cost = position.quantity * position.averageEntryPrice;
    position.realizedPnl += realizedPnl;

    if (position.quantity <= 0) {
      // Close position
      data.positions.splice(index, 1);

      if (!data.closedPositions) {
        data.closedPositions = [];
      }
      data.closedPositions.push({
        ...position,
        closedAt: new Date().toISOString(),
        closingPrice: positionUpdate.price,
      });

      db.write(data);
      return { closed: true, realizedPnl };
    }
  }

  position.updatedAt = new Date().toISOString();
  data.positions[index] = position;
  db.write(data);

  return position;
};

/**
 * Get trading pair info
 */
const getTradingPair = async (symbol) => {
  const data = db.read();
  const pair = (data.tradingPairs || []).find((p) => p.symbol === symbol);

  if (!pair) {
    // Return default pair info
    return {
      symbol,
      baseAsset: symbol.split("/")[0] || symbol,
      quoteAsset: symbol.split("/")[1] || "USD",
      status: TRADING_STATUS.ENABLED,
      minQuantity: 0.0001,
      maxQuantity: 1000000,
      minPrice: 0.0001,
      maxPrice: 1000000,
      tickSize: 0.01,
      stepSize: 0.0001,
      makerFee: 0.001,
      takerFee: 0.002,
    };
  }

  return pair;
};

/**
 * Get all trading pairs
 */
const getTradingPairs = async () => {
  const data = db.read();
  return data.tradingPairs || [];
};

/**
 * Calculate portfolio value
 */
const calculatePortfolioValue = async (userId) => {
  const positions = await getUserPositions(userId);

  const totalValue = positions.reduce(
    (sum, p) => sum + p.quantity * p.currentPrice,
    0
  );

  const totalCost = positions.reduce((sum, p) => sum + p.cost, 0);

  const totalUnrealizedPnl = positions.reduce(
    (sum, p) => sum + p.unrealizedPnl,
    0
  );

  return {
    userId,
    positions: positions.length,
    totalValue,
    totalCost,
    totalUnrealizedPnl,
    totalUnrealizedPnlPercent: totalCost ? (totalUnrealizedPnl / totalCost) * 100 : 0,
    calculatedAt: new Date().toISOString(),
  };
};

/**
 * Get trade history for user
 */
const getTradeHistory = async (userId, filters = {}) => {
  return matchingService.getUserTrades(userId, filters);
};

/**
 * Get OHLCV candles
 */
const getOHLCV = async (symbol, interval = "1h", limit = 100) => {
  const data = db.read();
  const trades = (data.trades || [])
    .filter((t) => t.symbol === symbol)
    .sort((a, b) => new Date(a.matchedAt) - new Date(b.matchedAt));

  if (trades.length === 0) {
    return [];
  }

  const intervalMs = {
    "1m": 60 * 1000,
    "5m": 5 * 60 * 1000,
    "15m": 15 * 60 * 1000,
    "1h": 60 * 60 * 1000,
    "4h": 4 * 60 * 60 * 1000,
    "1d": 24 * 60 * 60 * 1000,
  };

  const bucketSize = intervalMs[interval] || intervalMs["1h"];
  const candles = [];
  let currentBucket = null;
  let bucketTrades = [];

  trades.forEach((trade) => {
    const tradeTime = new Date(trade.matchedAt).getTime();
    const bucketStart = Math.floor(tradeTime / bucketSize) * bucketSize;

    if (currentBucket !== bucketStart) {
      if (bucketTrades.length > 0) {
        candles.push(createCandle(currentBucket, bucketTrades));
      }
      currentBucket = bucketStart;
      bucketTrades = [];
    }

    bucketTrades.push(trade);
  });

  if (bucketTrades.length > 0) {
    candles.push(createCandle(currentBucket, bucketTrades));
  }

  return candles.slice(-limit);
};

/**
 * Create OHLCV candle from trades
 */
const createCandle = (timestamp, trades) => {
  const prices = trades.map((t) => t.price);
  const volume = trades.reduce((sum, t) => sum + t.quantity, 0);

  return {
    timestamp,
    open: prices[0],
    high: Math.max(...prices),
    low: Math.min(...prices),
    close: prices[prices.length - 1],
    volume,
    trades: trades.length,
  };
};

/**
 * Get spread for symbol
 */
const getSpread = async (symbol) => {
  const orderBook = await orderService.getOrderBook(symbol, 1);

  if (orderBook.bids.length === 0 || orderBook.asks.length === 0) {
    return {
      symbol,
      bid: null,
      ask: null,
      spread: null,
      spreadPercent: null,
    };
  }

  const bid = orderBook.bids[0].price;
  const ask = orderBook.asks[0].price;
  const spread = ask - bid;
  const midPrice = (bid + ask) / 2;

  return {
    symbol,
    bid,
    ask,
    spread,
    spreadPercent: (spread / midPrice) * 100,
    midPrice,
  };
};

/**
 * Get trading statistics for user
 */
const getUserTradingStats = async (userId) => {
  const data = db.read();

  const trades = (data.trades || []).filter(
    (t) => t.makerUserId === userId || t.takerUserId === userId
  );

  const orders = (data.orders || []).filter((o) => o.userId === userId);
  const closedPositions = (data.closedPositions || []).filter(
    (p) => p.userId === userId
  );

  const totalVolume = trades.reduce((sum, t) => sum + t.notionalValue, 0);
  const totalFees = trades.reduce((sum, t) => {
    if (t.makerUserId === userId) return sum + t.makerFee;
    return sum + t.takerFee;
  }, 0);

  const totalRealizedPnl = closedPositions.reduce(
    (sum, p) => sum + p.realizedPnl,
    0
  );

  return {
    userId,
    totalTrades: trades.length,
    totalOrders: orders.length,
    filledOrders: orders.filter((o) => o.status === "filled").length,
    cancelledOrders: orders.filter((o) => o.status === "cancelled").length,
    totalVolume,
    totalFees,
    totalRealizedPnl,
    winRate:
      closedPositions.length > 0
        ? (closedPositions.filter((p) => p.realizedPnl > 0).length /
            closedPositions.length) *
          100
        : 0,
  };
};

module.exports = {
  TRADING_STATUS,
  POSITION_SIDE,
  placeOrder,
  checkTradingPermissions,
  validateTrade,
  getTradingStatus,
  getMarketData,
  getUserPositions,
  updatePosition,
  getTradingPair,
  getTradingPairs,
  calculatePortfolioValue,
  getTradeHistory,
  getOHLCV,
  getSpread,
  getUserTradingStats,
};
