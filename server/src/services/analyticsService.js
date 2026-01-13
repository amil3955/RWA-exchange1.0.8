const { v4: uuidv4 } = require("uuid");
const db = require("../db");

/**
 * Analytics Service - Handles platform analytics and reporting
 * Provides insights on trading, users, assets, and platform performance
 */

/**
 * Get trading analytics
 */
const getTradingAnalytics = async (period = "30d") => {
  const data = db.read();

  let startDate;
  switch (period) {
    case "24h":
      startDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
      break;
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

  const trades = (data.trades || []).filter(
    (t) => new Date(t.matchedAt) >= startDate
  );

  const orders = (data.orders || []).filter(
    (o) => new Date(o.createdAt) >= startDate
  );

  const totalVolume = trades.reduce((sum, t) => sum + t.notionalValue, 0);
  const totalTrades = trades.length;

  // Volume by day
  const volumeByDay = {};
  trades.forEach((t) => {
    const day = t.matchedAt.split("T")[0];
    volumeByDay[day] = (volumeByDay[day] || 0) + t.notionalValue;
  });

  // Top traded symbols
  const volumeBySymbol = {};
  trades.forEach((t) => {
    volumeBySymbol[t.symbol] = (volumeBySymbol[t.symbol] || 0) + t.notionalValue;
  });

  const topSymbols = Object.entries(volumeBySymbol)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([symbol, volume]) => ({ symbol, volume }));

  // Order fill rate
  const filledOrders = orders.filter((o) => o.status === "filled").length;
  const cancelledOrders = orders.filter((o) => o.status === "cancelled").length;

  return {
    period,
    trading: {
      totalVolume,
      totalTrades,
      averageTradeSize: totalTrades > 0 ? totalVolume / totalTrades : 0,
      tradesPerDay: totalTrades / (parseInt(period) || 30),
    },
    orders: {
      total: orders.length,
      filled: filledOrders,
      cancelled: cancelledOrders,
      fillRate: orders.length > 0 ? (filledOrders / orders.length) * 100 : 0,
    },
    topSymbols,
    volumeByDay: Object.entries(volumeByDay)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, volume]) => ({ date, volume })),
  };
};

/**
 * Get user analytics
 */
const getUserAnalytics = async (period = "30d") => {
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

  const users = data.users || [];
  const newUsers = users.filter((u) => new Date(u.createdAt) >= startDate);

  // Active users (users with trades)
  const trades = (data.trades || []).filter(
    (t) => new Date(t.matchedAt) >= startDate
  );
  const activeUserIds = new Set([
    ...trades.map((t) => t.makerUserId),
    ...trades.map((t) => t.takerUserId),
  ]);

  // KYC status
  const kycRecords = data.kycRecords || [];
  const kycApproved = kycRecords.filter((k) => k.status === "approved").length;
  const kycPending = kycRecords.filter((k) => k.status === "pending").length;

  // User registrations by day
  const registrationsByDay = {};
  newUsers.forEach((u) => {
    const day = u.createdAt.split("T")[0];
    registrationsByDay[day] = (registrationsByDay[day] || 0) + 1;
  });

  return {
    period,
    users: {
      total: users.length,
      newUsers: newUsers.length,
      activeUsers: activeUserIds.size,
      activeRate: users.length > 0 ? (activeUserIds.size / users.length) * 100 : 0,
    },
    kyc: {
      approved: kycApproved,
      pending: kycPending,
      approvalRate: kycRecords.length > 0 ? (kycApproved / kycRecords.length) * 100 : 0,
    },
    registrationsByDay: Object.entries(registrationsByDay)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, count]) => ({ date, count })),
  };
};

/**
 * Get asset analytics
 */
const getAssetAnalytics = async () => {
  const data = db.read();

  const assets = data.assets || [];
  const tokenizations = data.tokenizations || [];

  // Assets by type
  const byType = {};
  assets.forEach((a) => {
    byType[a.type] = (byType[a.type] || 0) + 1;
  });

  // Assets by status
  const byStatus = {};
  assets.forEach((a) => {
    byStatus[a.status] = (byStatus[a.status] || 0) + 1;
  });

  // Total valuation
  const totalValuation = assets.reduce(
    (sum, a) => sum + (a.valuation?.amount || 0),
    0
  );

  // Tokenization stats
  const tokenizedAssets = tokenizations.filter((t) => t.status === "active");
  const totalTokenizedValue = tokenizedAssets.reduce(
    (sum, t) => sum + t.totalSupply * t.pricePerToken,
    0
  );

  // Top assets by value
  const topAssets = [...assets]
    .sort((a, b) => (b.valuation?.amount || 0) - (a.valuation?.amount || 0))
    .slice(0, 10)
    .map((a) => ({
      id: a.id,
      name: a.name,
      type: a.type,
      valuation: a.valuation?.amount || 0,
      status: a.status,
    }));

  return {
    assets: {
      total: assets.length,
      totalValuation,
      averageValuation: assets.length > 0 ? totalValuation / assets.length : 0,
    },
    byType,
    byStatus,
    tokenization: {
      tokenizedCount: tokenizedAssets.length,
      totalTokenizedValue,
      tokenizationRate:
        assets.length > 0 ? (tokenizedAssets.length / assets.length) * 100 : 0,
    },
    topAssets,
  };
};

/**
 * Get revenue analytics
 */
const getRevenueAnalytics = async (period = "30d") => {
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

  const feeCharges = (data.feeCharges || []).filter(
    (f) => new Date(f.chargedAt) >= startDate
  );

  const totalRevenue = feeCharges.reduce((sum, f) => sum + f.amount, 0);

  // Revenue by type
  const byType = {};
  feeCharges.forEach((f) => {
    byType[f.type] = (byType[f.type] || 0) + f.amount;
  });

  // Revenue by day
  const byDay = {};
  feeCharges.forEach((f) => {
    const day = f.chargedAt.split("T")[0];
    byDay[day] = (byDay[day] || 0) + f.amount;
  });

  // Compare to previous period
  const periodDays = parseInt(period) || 30;
  const previousStartDate = new Date(startDate.getTime() - periodDays * 24 * 60 * 60 * 1000);
  const previousFees = (data.feeCharges || []).filter(
    (f) =>
      new Date(f.chargedAt) >= previousStartDate &&
      new Date(f.chargedAt) < startDate
  );
  const previousRevenue = previousFees.reduce((sum, f) => sum + f.amount, 0);

  const revenueGrowth =
    previousRevenue > 0
      ? ((totalRevenue - previousRevenue) / previousRevenue) * 100
      : 0;

  return {
    period,
    revenue: {
      total: totalRevenue,
      previousPeriod: previousRevenue,
      growth: revenueGrowth,
      dailyAverage: totalRevenue / periodDays,
    },
    byType: Object.entries(byType)
      .sort((a, b) => b[1] - a[1])
      .map(([type, amount]) => ({ type, amount })),
    byDay: Object.entries(byDay)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, amount]) => ({ date, amount })),
  };
};

/**
 * Get platform metrics dashboard
 */
const getDashboardMetrics = async () => {
  const data = db.read();

  const now = new Date();
  const today = now.toISOString().split("T")[0];
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];

  // Today's metrics
  const todayTrades = (data.trades || []).filter((t) =>
    t.matchedAt.startsWith(today)
  );
  const todayVolume = todayTrades.reduce((sum, t) => sum + t.notionalValue, 0);

  const yesterdayTrades = (data.trades || []).filter((t) =>
    t.matchedAt.startsWith(yesterday)
  );
  const yesterdayVolume = yesterdayTrades.reduce((sum, t) => sum + t.notionalValue, 0);

  const todayNewUsers = (data.users || []).filter((u) =>
    u.createdAt.startsWith(today)
  ).length;

  const todayFees = (data.feeCharges || [])
    .filter((f) => f.chargedAt.startsWith(today))
    .reduce((sum, f) => sum + f.amount, 0);

  // Active orders
  const activeOrders = (data.orders || []).filter(
    (o) => o.status === "open" || o.status === "partially_filled"
  ).length;

  // Pending settlements
  const pendingSettlements = (data.settlements || []).filter(
    (s) => s.status === "pending" || s.status === "processing"
  ).length;

  return {
    timestamp: now.toISOString(),
    today: {
      volume: todayVolume,
      volumeChange:
        yesterdayVolume > 0
          ? ((todayVolume - yesterdayVolume) / yesterdayVolume) * 100
          : 0,
      trades: todayTrades.length,
      newUsers: todayNewUsers,
      revenue: todayFees,
    },
    realtime: {
      activeOrders,
      pendingSettlements,
      totalUsers: (data.users || []).length,
      totalAssets: (data.assets || []).length,
    },
  };
};

/**
 * Get user portfolio analytics
 */
const getUserPortfolioAnalytics = async (userId) => {
  const data = db.read();

  // Get user holdings across different asset types
  const equityHoldings = (data.equityHoldings || []).filter(
    (h) => h.ownerId === userId
  );
  const bondHoldings = (data.bondHoldings || []).filter(
    (h) => h.ownerId === userId
  );
  const commodityHoldings = (data.commodityHoldings || []).filter(
    (h) => h.ownerId === userId
  );
  const realEstateProperties = (data.realEstateProperties || []).filter(
    (p) => p.ownerId === userId
  );

  // Calculate total values
  const equityValue = equityHoldings.reduce(
    (sum, h) => sum + h.shares * h.costBasis.averageCost,
    0
  );
  const bondValue = bondHoldings.reduce((sum, h) => sum + h.totalFaceValue, 0);
  const commodityValue = commodityHoldings.reduce(
    (sum, h) => sum + h.quantity * (h.acquisition.price || 0),
    0
  );
  const realEstateValue = realEstateProperties.reduce(
    (sum, p) => sum + (p.valuation?.currentValue || 0),
    0
  );

  const totalValue = equityValue + bondValue + commodityValue + realEstateValue;

  return {
    userId,
    portfolio: {
      totalValue,
      allocation: {
        equities: { value: equityValue, percentage: totalValue > 0 ? (equityValue / totalValue) * 100 : 0 },
        bonds: { value: bondValue, percentage: totalValue > 0 ? (bondValue / totalValue) * 100 : 0 },
        commodities: { value: commodityValue, percentage: totalValue > 0 ? (commodityValue / totalValue) * 100 : 0 },
        realEstate: { value: realEstateValue, percentage: totalValue > 0 ? (realEstateValue / totalValue) * 100 : 0 },
      },
      holdings: {
        equities: equityHoldings.length,
        bonds: bondHoldings.length,
        commodities: commodityHoldings.length,
        realEstate: realEstateProperties.length,
      },
    },
    calculatedAt: new Date().toISOString(),
  };
};

/**
 * Get market overview
 */
const getMarketOverview = async () => {
  const data = db.read();

  const priceFeeds = data.priceFeeds || [];
  const trades = data.trades || [];

  // Recent price changes
  const priceChanges = priceFeeds.map((p) => ({
    symbol: p.symbol,
    price: p.price,
    change: p.change || 0,
    changePercent: p.changePercent || 0,
  }));

  // Top gainers and losers
  const sorted = [...priceChanges].sort(
    (a, b) => b.changePercent - a.changePercent
  );
  const topGainers = sorted.filter((p) => p.changePercent > 0).slice(0, 5);
  const topLosers = sorted.filter((p) => p.changePercent < 0).slice(-5).reverse();

  // Most traded
  const tradeVolume = {};
  trades.forEach((t) => {
    tradeVolume[t.symbol] = (tradeVolume[t.symbol] || 0) + t.notionalValue;
  });

  const mostTraded = Object.entries(tradeVolume)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([symbol, volume]) => ({ symbol, volume }));

  return {
    timestamp: new Date().toISOString(),
    totalSymbols: priceFeeds.length,
    topGainers,
    topLosers,
    mostTraded,
    marketSentiment:
      priceChanges.filter((p) => p.changePercent > 0).length > priceChanges.length / 2
        ? "bullish"
        : "bearish",
  };
};

/**
 * Record analytics event
 */
const recordEvent = async (eventData) => {
  const data = db.read();

  if (!data.analyticsEvents) {
    data.analyticsEvents = [];
  }

  const event = {
    id: uuidv4(),
    name: eventData.name,
    category: eventData.category,
    userId: eventData.userId || null,
    properties: eventData.properties || {},
    timestamp: new Date().toISOString(),
  };

  data.analyticsEvents.push(event);

  // Keep only last 50,000 events
  if (data.analyticsEvents.length > 50000) {
    data.analyticsEvents = data.analyticsEvents.slice(-50000);
  }

  db.write(data);

  return event;
};

module.exports = {
  getTradingAnalytics,
  getUserAnalytics,
  getAssetAnalytics,
  getRevenueAnalytics,
  getDashboardMetrics,
  getUserPortfolioAnalytics,
  getMarketOverview,
  recordEvent,
};
