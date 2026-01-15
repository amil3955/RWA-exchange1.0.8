const { v4: uuidv4 } = require("uuid");
const db = require("../db");

/**
 * Portfolio Service - Unified portfolio management
 * Aggregates all asset types and provides portfolio analytics
 */

const REBALANCE_STRATEGY = {
  THRESHOLD: "threshold",
  CALENDAR: "calendar",
  TACTICAL: "tactical",
};

/**
 * Get complete portfolio
 */
const getPortfolio = async (userId) => {
  const data = db.read();

  const portfolio = {
    userId,
    holdings: {
      equities: (data.equityHoldings || []).filter((h) => h.ownerId === userId && h.status === "active"),
      bonds: (data.bondHoldings || []).filter((h) => h.ownerId === userId && h.status === "active"),
      commodities: (data.commodityHoldings || []).filter((h) => h.ownerId === userId && h.status === "active"),
      realEstate: (data.realEstateProperties || []).filter((p) => p.ownerId === userId),
      art: (data.artPieces || []).filter((a) => a.ownerId === userId && a.status === "owned"),
      vehicles: (data.vehicles || []).filter((v) => v.ownerId === userId && v.status === "owned"),
      intellectualProperty: (data.intellectualProperty || []).filter((ip) => ip.ownerId === userId),
      tokens: [],
    },
    wallets: (data.wallets || []).filter((w) => w.userId === userId && w.status === "active"),
    calculatedAt: new Date().toISOString(),
  };

  // Get tokenized asset holdings
  const tokenizations = data.tokenizations || [];
  tokenizations.forEach((t) => {
    const holder = t.holders.find((h) => h.userId === userId);
    if (holder && holder.balance > 0) {
      portfolio.holdings.tokens.push({
        tokenizationId: t.id,
        assetId: t.assetId,
        symbol: t.tokenSymbol,
        balance: holder.balance,
        pricePerToken: t.pricePerToken,
        value: holder.balance * t.pricePerToken,
      });
    }
  });

  return portfolio;
};

/**
 * Calculate portfolio value
 */
const calculatePortfolioValue = async (userId) => {
  const portfolio = await getPortfolio(userId);

  const values = {
    equities: portfolio.holdings.equities.reduce(
      (sum, h) => sum + h.shares * h.costBasis.averageCost,
      0
    ),
    bonds: portfolio.holdings.bonds.reduce((sum, h) => sum + h.totalFaceValue, 0),
    commodities: portfolio.holdings.commodities.reduce(
      (sum, h) => sum + h.quantity * (h.acquisition?.price || 0),
      0
    ),
    realEstate: portfolio.holdings.realEstate.reduce(
      (sum, p) => sum + (p.valuation?.currentValue || 0),
      0
    ),
    art: portfolio.holdings.art.reduce(
      (sum, a) => sum + (a.valuation?.estimatedValue || 0),
      0
    ),
    vehicles: portfolio.holdings.vehicles.reduce(
      (sum, v) => sum + (v.valuation?.currentValue || 0),
      0
    ),
    intellectualProperty: portfolio.holdings.intellectualProperty.reduce(
      (sum, ip) => sum + (ip.valuation?.currentValue || 0),
      0
    ),
    tokens: portfolio.holdings.tokens.reduce((sum, t) => sum + t.value, 0),
  };

  const totalValue = Object.values(values).reduce((sum, v) => sum + v, 0);

  return {
    userId,
    totalValue,
    byAssetClass: values,
    allocation: Object.entries(values).reduce((acc, [key, value]) => {
      acc[key] = {
        value,
        percentage: totalValue > 0 ? (value / totalValue) * 100 : 0,
      };
      return acc;
    }, {}),
    calculatedAt: new Date().toISOString(),
  };
};

/**
 * Get portfolio performance
 */
const getPortfolioPerformance = async (userId, period = "30d") => {
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
    case "1y":
      startDate = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
      break;
    default:
      startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  }

  // Get current value
  const currentValue = await calculatePortfolioValue(userId);

  // Get trades and calculate realized P&L
  const trades = (data.trades || []).filter(
    (t) =>
      (t.makerUserId === userId || t.takerUserId === userId) &&
      new Date(t.matchedAt) >= startDate
  );

  const closedPositions = (data.closedPositions || []).filter(
    (p) => p.userId === userId && new Date(p.closedAt) >= startDate
  );

  const realizedPnl = closedPositions.reduce((sum, p) => sum + p.realizedPnl, 0);

  // Get dividends and interest
  const dividends = (data.equityHoldings || [])
    .filter((h) => h.ownerId === userId)
    .flatMap((h) => h.dividendHistory || [])
    .filter((d) => new Date(d.paymentDate) >= startDate)
    .reduce((sum, d) => sum + d.totalAmount, 0);

  const interest = (data.bondHoldings || [])
    .filter((h) => h.ownerId === userId)
    .flatMap((h) => h.couponPayments || [])
    .filter((p) => new Date(p.date) >= startDate)
    .reduce((sum, p) => sum + p.amount, 0);

  return {
    userId,
    period,
    currentValue: currentValue.totalValue,
    realizedPnl,
    dividendIncome: dividends,
    interestIncome: interest,
    totalIncome: dividends + interest,
    tradesCount: trades.length,
    tradingVolume: trades.reduce((sum, t) => sum + t.notionalValue, 0),
    calculatedAt: new Date().toISOString(),
  };
};

/**
 * Get target allocation
 */
const getTargetAllocation = async (userId) => {
  const data = db.read();

  const target = (data.portfolioTargets || []).find((t) => t.userId === userId);

  if (!target) {
    // Return default conservative allocation
    return {
      userId,
      type: "default",
      allocation: {
        equities: 40,
        bonds: 30,
        commodities: 10,
        realEstate: 15,
        cash: 5,
      },
    };
  }

  return target;
};

/**
 * Set target allocation
 */
const setTargetAllocation = async (userId, allocation) => {
  const data = db.read();

  if (!data.portfolioTargets) {
    data.portfolioTargets = [];
  }

  const total = Object.values(allocation).reduce((sum, v) => sum + v, 0);
  if (Math.abs(total - 100) > 0.01) {
    throw new Error("Allocation percentages must sum to 100");
  }

  const index = data.portfolioTargets.findIndex((t) => t.userId === userId);

  const target = {
    userId,
    allocation,
    updatedAt: new Date().toISOString(),
  };

  if (index !== -1) {
    data.portfolioTargets[index] = target;
  } else {
    data.portfolioTargets.push(target);
  }

  db.write(data);

  return target;
};

/**
 * Calculate rebalancing needs
 */
const calculateRebalancing = async (userId) => {
  const currentValue = await calculatePortfolioValue(userId);
  const targetAllocation = await getTargetAllocation(userId);

  const rebalancing = [];

  Object.entries(targetAllocation.allocation).forEach(([assetClass, targetPercent]) => {
    const current = currentValue.allocation[assetClass] || { value: 0, percentage: 0 };
    const deviation = current.percentage - targetPercent;
    const targetValue = (currentValue.totalValue * targetPercent) / 100;
    const difference = targetValue - current.value;

    if (Math.abs(deviation) > 1) {
      // Only if deviation > 1%
      rebalancing.push({
        assetClass,
        currentValue: current.value,
        currentPercentage: current.percentage,
        targetPercentage: targetPercent,
        targetValue,
        deviation,
        action: difference > 0 ? "buy" : "sell",
        amount: Math.abs(difference),
      });
    }
  });

  return {
    userId,
    portfolioValue: currentValue.totalValue,
    rebalancingNeeded: rebalancing.length > 0,
    actions: rebalancing.sort((a, b) => Math.abs(b.deviation) - Math.abs(a.deviation)),
    calculatedAt: new Date().toISOString(),
  };
};

/**
 * Get portfolio risk metrics
 */
const getRiskMetrics = async (userId) => {
  const currentValue = await calculatePortfolioValue(userId);
  const allocation = currentValue.allocation;

  // Calculate concentration risk
  const maxAllocation = Math.max(
    ...Object.values(allocation).map((a) => a.percentage)
  );
  const concentrationRisk = maxAllocation > 50 ? "high" : maxAllocation > 30 ? "medium" : "low";

  // Asset class diversification
  const assetClassCount = Object.values(allocation).filter((a) => a.value > 0).length;
  const diversificationScore = Math.min(100, assetClassCount * 15);

  // Liquidity risk (simplified)
  const illiquidAssets =
    (allocation.realEstate?.value || 0) +
    (allocation.art?.value || 0) +
    (allocation.vehicles?.value || 0) +
    (allocation.intellectualProperty?.value || 0);
  const liquidityRisk =
    currentValue.totalValue > 0
      ? illiquidAssets / currentValue.totalValue > 0.5
        ? "high"
        : illiquidAssets / currentValue.totalValue > 0.25
        ? "medium"
        : "low"
      : "low";

  return {
    userId,
    portfolioValue: currentValue.totalValue,
    riskMetrics: {
      concentrationRisk,
      maxAllocationPercentage: maxAllocation,
      diversificationScore,
      assetClassCount,
      liquidityRisk,
      illiquidPercentage:
        currentValue.totalValue > 0
          ? (illiquidAssets / currentValue.totalValue) * 100
          : 0,
    },
    calculatedAt: new Date().toISOString(),
  };
};

/**
 * Get portfolio history snapshots
 */
const getPortfolioHistory = async (userId, period = "30d") => {
  const data = db.read();

  const snapshots = (data.portfolioSnapshots || [])
    .filter((s) => s.userId === userId)
    .sort((a, b) => new Date(a.date) - new Date(b.date));

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
    case "1y":
      startDate = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
      break;
    default:
      startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  }

  const filteredSnapshots = snapshots.filter(
    (s) => new Date(s.date) >= startDate
  );

  return {
    userId,
    period,
    snapshots: filteredSnapshots,
    change:
      filteredSnapshots.length >= 2
        ? filteredSnapshots[filteredSnapshots.length - 1].totalValue -
          filteredSnapshots[0].totalValue
        : 0,
  };
};

/**
 * Record portfolio snapshot
 */
const recordSnapshot = async (userId) => {
  const data = db.read();
  const currentValue = await calculatePortfolioValue(userId);

  if (!data.portfolioSnapshots) {
    data.portfolioSnapshots = [];
  }

  const snapshot = {
    id: uuidv4(),
    userId,
    date: new Date().toISOString().split("T")[0],
    totalValue: currentValue.totalValue,
    allocation: currentValue.allocation,
    recordedAt: new Date().toISOString(),
  };

  // Remove existing snapshot for today
  data.portfolioSnapshots = data.portfolioSnapshots.filter(
    (s) => !(s.userId === userId && s.date === snapshot.date)
  );

  data.portfolioSnapshots.push(snapshot);
  db.write(data);

  return snapshot;
};

/**
 * Get income summary
 */
const getIncomeSummary = async (userId, year = null) => {
  const data = db.read();
  const targetYear = year || new Date().getFullYear();

  // Dividends
  const dividends = (data.equityHoldings || [])
    .filter((h) => h.ownerId === userId)
    .flatMap((h) => h.dividendHistory || [])
    .filter((d) => new Date(d.paymentDate).getFullYear() === targetYear);

  // Coupon payments
  const coupons = (data.bondHoldings || [])
    .filter((h) => h.ownerId === userId)
    .flatMap((h) => h.couponPayments || [])
    .filter((p) => new Date(p.date).getFullYear() === targetYear);

  // Rental income
  const rentalIncome = (data.realEstateProperties || [])
    .filter((p) => p.ownerId === userId)
    .reduce((sum, p) => sum + (p.financials?.monthlyRent || 0) * 12, 0);

  // Royalties
  const royalties = (data.intellectualProperty || [])
    .filter((ip) => ip.ownerId === userId)
    .reduce((sum, ip) => sum + (ip.valuation?.incomeGenerated || 0), 0);

  return {
    userId,
    year: targetYear,
    income: {
      dividends: dividends.reduce((sum, d) => sum + d.totalAmount, 0),
      interest: coupons.reduce((sum, c) => sum + c.amount, 0),
      rental: rentalIncome,
      royalties: royalties,
    },
    total:
      dividends.reduce((sum, d) => sum + d.totalAmount, 0) +
      coupons.reduce((sum, c) => sum + c.amount, 0) +
      rentalIncome +
      royalties,
    breakdown: {
      dividends: dividends.length,
      couponPayments: coupons.length,
    },
  };
};

module.exports = {
  REBALANCE_STRATEGY,
  getPortfolio,
  calculatePortfolioValue,
  getPortfolioPerformance,
  getTargetAllocation,
  setTargetAllocation,
  calculateRebalancing,
  getRiskMetrics,
  getPortfolioHistory,
  recordSnapshot,
  getIncomeSummary,
};
