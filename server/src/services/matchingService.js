const { v4: uuidv4 } = require("uuid");
const db = require("../db");

/**
 * Matching Service - Order matching engine
 * Implements price-time priority matching algorithm
 */

const MATCHING_MODE = {
  CONTINUOUS: "continuous",
  AUCTION: "auction",
  BATCH: "batch",
};

const TRADE_STATUS = {
  PENDING: "pending",
  SETTLED: "settled",
  FAILED: "failed",
  CANCELLED: "cancelled",
};

/**
 * Match incoming order against order book
 */
const matchOrder = async (incomingOrder) => {
  const data = db.read();

  if (!data.trades) {
    data.trades = [];
  }

  const matches = [];
  const orderBook = getOrderBookForMatching(incomingOrder.symbol, data);

  // Determine which side of the book to match against
  const matchAgainst =
    incomingOrder.side === "buy" ? orderBook.asks : orderBook.bids;

  let remainingQuantity = incomingOrder.quantity - (incomingOrder.filledQuantity || 0);

  for (const bookOrder of matchAgainst) {
    if (remainingQuantity <= 0) break;

    // Check price compatibility
    const priceMatch = checkPriceMatch(incomingOrder, bookOrder);
    if (!priceMatch) continue;

    // Skip self-matching
    if (bookOrder.userId === incomingOrder.userId) continue;

    // Calculate match quantity
    const matchQuantity = Math.min(
      remainingQuantity,
      bookOrder.remainingQuantity
    );

    // Determine execution price (price-time priority - use resting order's price)
    const executionPrice = bookOrder.price;

    // Create trade
    const trade = {
      id: uuidv4(),
      symbol: incomingOrder.symbol,
      makerOrderId: bookOrder.id,
      takerOrderId: incomingOrder.id,
      makerUserId: bookOrder.userId,
      takerUserId: incomingOrder.userId,
      side: incomingOrder.side,
      quantity: matchQuantity,
      price: executionPrice,
      notionalValue: matchQuantity * executionPrice,
      makerFee: calculateFee(matchQuantity * executionPrice, "maker"),
      takerFee: calculateFee(matchQuantity * executionPrice, "taker"),
      status: TRADE_STATUS.PENDING,
      matchedAt: new Date().toISOString(),
      settledAt: null,
    };

    matches.push({
      trade,
      makerOrder: bookOrder,
      takerOrder: incomingOrder,
      matchQuantity,
    });

    remainingQuantity -= matchQuantity;
  }

  // Save trades and update orders
  if (matches.length > 0) {
    matches.forEach((match) => {
      data.trades.push(match.trade);
    });
    db.write(data);
  }

  return {
    matches,
    remainingQuantity,
    fullyFilled: remainingQuantity <= 0,
  };
};

/**
 * Get order book sorted for matching
 */
const getOrderBookForMatching = (symbol, data) => {
  const openOrders = (data.orders || []).filter(
    (o) =>
      o.symbol === symbol &&
      (o.status === "open" || o.status === "partially_filled") &&
      o.type === "limit"
  );

  // Bids sorted by price descending, then by time ascending
  const bids = openOrders
    .filter((o) => o.side === "buy")
    .sort((a, b) => {
      if (b.price !== a.price) return b.price - a.price;
      return new Date(a.createdAt) - new Date(b.createdAt);
    });

  // Asks sorted by price ascending, then by time ascending
  const asks = openOrders
    .filter((o) => o.side === "sell")
    .sort((a, b) => {
      if (a.price !== b.price) return a.price - b.price;
      return new Date(a.createdAt) - new Date(b.createdAt);
    });

  return { bids, asks };
};

/**
 * Check if prices are compatible for matching
 */
const checkPriceMatch = (incomingOrder, bookOrder) => {
  if (incomingOrder.type === "market") {
    return true;
  }

  if (incomingOrder.side === "buy") {
    return incomingOrder.price >= bookOrder.price;
  } else {
    return incomingOrder.price <= bookOrder.price;
  }
};

/**
 * Calculate trading fee
 */
const calculateFee = (notionalValue, feeType) => {
  const feeRates = {
    maker: 0.001, // 0.1%
    taker: 0.002, // 0.2%
  };
  return notionalValue * (feeRates[feeType] || 0.002);
};

/**
 * Execute market order
 */
const executeMarketOrder = async (order) => {
  const data = db.read();
  const orderBook = getOrderBookForMatching(order.symbol, data);

  const matchAgainst = order.side === "buy" ? orderBook.asks : orderBook.bids;

  if (matchAgainst.length === 0) {
    return {
      success: false,
      error: "No liquidity available",
      fills: [],
    };
  }

  let remainingQuantity = order.quantity;
  const fills = [];
  let totalCost = 0;
  let totalFees = 0;

  for (const bookOrder of matchAgainst) {
    if (remainingQuantity <= 0) break;

    const fillQuantity = Math.min(remainingQuantity, bookOrder.remainingQuantity);
    const fillPrice = bookOrder.price;
    const fillCost = fillQuantity * fillPrice;
    const fee = calculateFee(fillCost, "taker");

    fills.push({
      orderId: bookOrder.id,
      quantity: fillQuantity,
      price: fillPrice,
      cost: fillCost,
      fee,
    });

    remainingQuantity -= fillQuantity;
    totalCost += fillCost;
    totalFees += fee;
  }

  const averagePrice = totalCost / (order.quantity - remainingQuantity);

  return {
    success: remainingQuantity < order.quantity,
    fills,
    filledQuantity: order.quantity - remainingQuantity,
    remainingQuantity,
    averagePrice,
    totalCost,
    totalFees,
  };
};

/**
 * Run batch auction matching
 */
const runBatchAuction = async (symbol) => {
  const data = db.read();

  if (!data.auctions) {
    data.auctions = [];
  }

  const orderBook = getOrderBookForMatching(symbol, data);
  const { bids, asks } = orderBook;

  if (bids.length === 0 || asks.length === 0) {
    return {
      success: false,
      clearingPrice: null,
      volume: 0,
      trades: [],
    };
  }

  // Find clearing price (price that maximizes volume)
  let bestPrice = null;
  let maxVolume = 0;

  const allPrices = [...new Set([...bids.map((o) => o.price), ...asks.map((o) => o.price)])].sort(
    (a, b) => a - b
  );

  for (const price of allPrices) {
    const buyVolume = bids
      .filter((o) => o.price >= price)
      .reduce((sum, o) => sum + o.remainingQuantity, 0);
    const sellVolume = asks
      .filter((o) => o.price <= price)
      .reduce((sum, o) => sum + o.remainingQuantity, 0);

    const matchedVolume = Math.min(buyVolume, sellVolume);

    if (matchedVolume > maxVolume) {
      maxVolume = matchedVolume;
      bestPrice = price;
    }
  }

  if (!bestPrice || maxVolume === 0) {
    return {
      success: false,
      clearingPrice: null,
      volume: 0,
      trades: [],
    };
  }

  // Execute matches at clearing price
  const eligibleBids = bids.filter((o) => o.price >= bestPrice);
  const eligibleAsks = asks.filter((o) => o.price <= bestPrice);

  const trades = [];
  let remainingBuyVolume = maxVolume;

  for (const bid of eligibleBids) {
    if (remainingBuyVolume <= 0) break;

    for (const ask of eligibleAsks) {
      if (remainingBuyVolume <= 0) break;
      if (ask.remainingQuantity <= 0) continue;

      const matchQuantity = Math.min(
        remainingBuyVolume,
        bid.remainingQuantity,
        ask.remainingQuantity
      );

      if (matchQuantity > 0) {
        const trade = {
          id: uuidv4(),
          symbol,
          makerOrderId: ask.id,
          takerOrderId: bid.id,
          makerUserId: ask.userId,
          takerUserId: bid.userId,
          side: "buy",
          quantity: matchQuantity,
          price: bestPrice,
          notionalValue: matchQuantity * bestPrice,
          makerFee: calculateFee(matchQuantity * bestPrice, "maker"),
          takerFee: calculateFee(matchQuantity * bestPrice, "taker"),
          status: TRADE_STATUS.PENDING,
          auctionId: null,
          matchedAt: new Date().toISOString(),
        };

        trades.push(trade);
        remainingBuyVolume -= matchQuantity;
        bid.remainingQuantity -= matchQuantity;
        ask.remainingQuantity -= matchQuantity;
      }
    }
  }

  // Record auction
  const auction = {
    id: uuidv4(),
    symbol,
    clearingPrice: bestPrice,
    volume: maxVolume,
    tradesCount: trades.length,
    bidsCount: eligibleBids.length,
    asksCount: eligibleAsks.length,
    executedAt: new Date().toISOString(),
  };

  trades.forEach((t) => (t.auctionId = auction.id));

  data.auctions.push(auction);
  trades.forEach((t) => data.trades.push(t));
  db.write(data);

  return {
    success: true,
    clearingPrice: bestPrice,
    volume: maxVolume,
    trades,
    auction,
  };
};

/**
 * Get trade by ID
 */
const getTradeById = async (tradeId) => {
  const data = db.read();
  const trade = (data.trades || []).find((t) => t.id === tradeId);

  if (!trade) {
    throw new Error("Trade not found");
  }

  return trade;
};

/**
 * Get trades by user
 */
const getUserTrades = async (userId, filters = {}) => {
  const data = db.read();
  let trades = (data.trades || []).filter(
    (t) => t.makerUserId === userId || t.takerUserId === userId
  );

  if (filters.symbol) {
    trades = trades.filter((t) => t.symbol === filters.symbol);
  }

  if (filters.status) {
    trades = trades.filter((t) => t.status === filters.status);
  }

  if (filters.startDate) {
    trades = trades.filter(
      (t) => new Date(t.matchedAt) >= new Date(filters.startDate)
    );
  }

  if (filters.endDate) {
    trades = trades.filter(
      (t) => new Date(t.matchedAt) <= new Date(filters.endDate)
    );
  }

  trades.sort((a, b) => new Date(b.matchedAt) - new Date(a.matchedAt));

  const page = filters.page || 1;
  const limit = filters.limit || 20;
  const startIndex = (page - 1) * limit;

  return {
    trades: trades.slice(startIndex, startIndex + limit),
    total: trades.length,
    page,
    totalPages: Math.ceil(trades.length / limit),
  };
};

/**
 * Settle trade
 */
const settleTrade = async (tradeId) => {
  const data = db.read();
  const index = (data.trades || []).findIndex((t) => t.id === tradeId);

  if (index === -1) {
    throw new Error("Trade not found");
  }

  data.trades[index].status = TRADE_STATUS.SETTLED;
  data.trades[index].settledAt = new Date().toISOString();
  db.write(data);

  return data.trades[index];
};

/**
 * Get recent trades for symbol
 */
const getRecentTrades = async (symbol, limit = 50) => {
  const data = db.read();
  const trades = (data.trades || [])
    .filter((t) => t.symbol === symbol)
    .sort((a, b) => new Date(b.matchedAt) - new Date(a.matchedAt))
    .slice(0, limit);

  return trades;
};

/**
 * Get trade statistics
 */
const getTradeStatistics = async (symbol, period = "24h") => {
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

  const trades = (data.trades || []).filter(
    (t) => t.symbol === symbol && new Date(t.matchedAt) >= startTime
  );

  if (trades.length === 0) {
    return {
      symbol,
      period,
      volume: 0,
      tradeCount: 0,
      high: null,
      low: null,
      open: null,
      close: null,
      vwap: null,
    };
  }

  const sortedTrades = trades.sort(
    (a, b) => new Date(a.matchedAt) - new Date(b.matchedAt)
  );

  const volume = trades.reduce((sum, t) => sum + t.quantity, 0);
  const notionalVolume = trades.reduce((sum, t) => sum + t.notionalValue, 0);
  const prices = trades.map((t) => t.price);

  return {
    symbol,
    period,
    volume,
    notionalVolume,
    tradeCount: trades.length,
    high: Math.max(...prices),
    low: Math.min(...prices),
    open: sortedTrades[0].price,
    close: sortedTrades[sortedTrades.length - 1].price,
    vwap: notionalVolume / volume,
  };
};

/**
 * Check for crossed orders (orders that should have matched)
 */
const checkCrossedOrders = async (symbol) => {
  const data = db.read();
  const orderBook = getOrderBookForMatching(symbol, data);

  if (orderBook.bids.length === 0 || orderBook.asks.length === 0) {
    return { crossed: false };
  }

  const bestBid = orderBook.bids[0];
  const bestAsk = orderBook.asks[0];

  if (bestBid.price >= bestAsk.price) {
    return {
      crossed: true,
      bestBid: bestBid.price,
      bestAsk: bestAsk.price,
      spread: bestBid.price - bestAsk.price,
    };
  }

  return {
    crossed: false,
    bestBid: bestBid.price,
    bestAsk: bestAsk.price,
    spread: bestAsk.price - bestBid.price,
  };
};

/**
 * Get matching engine statistics
 */
const getMatchingStatistics = async () => {
  const data = db.read();
  const trades = data.trades || [];
  const orders = data.orders || [];

  const today = new Date().toISOString().split("T")[0];
  const todayTrades = trades.filter((t) => t.matchedAt.startsWith(today));

  return {
    totalTrades: trades.length,
    todayTrades: todayTrades.length,
    todayVolume: todayTrades.reduce((sum, t) => sum + t.notionalValue, 0),
    openOrders: orders.filter(
      (o) => o.status === "open" || o.status === "partially_filled"
    ).length,
    settledTrades: trades.filter((t) => t.status === TRADE_STATUS.SETTLED).length,
    pendingSettlement: trades.filter((t) => t.status === TRADE_STATUS.PENDING).length,
  };
};

module.exports = {
  MATCHING_MODE,
  TRADE_STATUS,
  matchOrder,
  getOrderBookForMatching,
  executeMarketOrder,
  runBatchAuction,
  getTradeById,
  getUserTrades,
  settleTrade,
  getRecentTrades,
  getTradeStatistics,
  checkCrossedOrders,
  getMatchingStatistics,
};
