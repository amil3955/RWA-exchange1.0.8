const { v4: uuidv4 } = require("uuid");
const db = require("../db");

/**
 * Equity Service - Handles equity/stock assets
 * Supports public stocks, private equity, and ownership stakes
 */

const EQUITY_TYPE = {
  COMMON_STOCK: "common_stock",
  PREFERRED_STOCK: "preferred_stock",
  PRIVATE_EQUITY: "private_equity",
  VENTURE_CAPITAL: "venture_capital",
  REIT: "reit",
  ETF: "etf",
  ADR: "adr",
  RESTRICTED_STOCK: "restricted_stock",
};

const DIVIDEND_FREQUENCY = {
  MONTHLY: "monthly",
  QUARTERLY: "quarterly",
  SEMI_ANNUAL: "semi_annual",
  ANNUAL: "annual",
  NONE: "none",
};

/**
 * Create an equity holding
 */
const createEquityHolding = async (ownerId, equityData) => {
  const data = db.read();

  if (!data.equityHoldings) {
    data.equityHoldings = [];
  }

  const holding = {
    id: uuidv4(),
    ownerId,
    assetId: equityData.assetId || null,
    symbol: equityData.symbol,
    name: equityData.name,
    equityType: equityData.equityType || EQUITY_TYPE.COMMON_STOCK,
    company: {
      name: equityData.companyName,
      sector: equityData.sector || null,
      industry: equityData.industry || null,
      country: equityData.country || null,
      exchange: equityData.exchange || null,
    },
    shares: equityData.shares,
    costBasis: {
      averageCost: equityData.averageCost || equityData.purchasePrice,
      totalCost: equityData.shares * (equityData.averageCost || equityData.purchasePrice),
      purchaseDate: equityData.purchaseDate || new Date().toISOString(),
    },
    dividend: {
      frequency: equityData.dividendFrequency || DIVIDEND_FREQUENCY.QUARTERLY,
      yield: equityData.dividendYield || 0,
      annualAmount: equityData.annualDividend || 0,
      reinvest: equityData.reinvestDividends || false,
      lastPayment: null,
    },
    restrictions: {
      lockupPeriod: equityData.lockupPeriod || null,
      lockupEndDate: equityData.lockupEndDate || null,
      restricted: equityData.restricted || false,
      vestingSchedule: equityData.vestingSchedule || null,
    },
    lots: [
      {
        id: uuidv4(),
        shares: equityData.shares,
        purchasePrice: equityData.purchasePrice || equityData.averageCost,
        purchaseDate: equityData.purchaseDate || new Date().toISOString(),
        lotType: "purchase",
      },
    ],
    dividendHistory: [],
    currency: equityData.currency || "USD",
    status: "active",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  data.equityHoldings.push(holding);
  db.write(data);

  return holding;
};

/**
 * Get equity holding by ID
 */
const getEquityById = async (equityId) => {
  const data = db.read();
  const holding = (data.equityHoldings || []).find((e) => e.id === equityId);

  if (!holding) {
    throw new Error("Equity holding not found");
  }

  return holding;
};

/**
 * Get user equity holdings
 */
const getUserEquities = async (ownerId, filters = {}) => {
  const data = db.read();
  let holdings = (data.equityHoldings || []).filter((e) => e.ownerId === ownerId);

  if (filters.symbol) {
    holdings = holdings.filter((e) => e.symbol === filters.symbol);
  }

  if (filters.equityType) {
    holdings = holdings.filter((e) => e.equityType === filters.equityType);
  }

  if (filters.sector) {
    holdings = holdings.filter((e) => e.company.sector === filters.sector);
  }

  if (filters.exchange) {
    holdings = holdings.filter((e) => e.company.exchange === filters.exchange);
  }

  return holdings;
};

/**
 * Add shares to holding (new purchase)
 */
const addShares = async (equityId, ownerId, purchaseData) => {
  const data = db.read();
  const index = (data.equityHoldings || []).findIndex(
    (e) => e.id === equityId && e.ownerId === ownerId
  );

  if (index === -1) {
    throw new Error("Equity holding not found or unauthorized");
  }

  const holding = data.equityHoldings[index];

  const newLot = {
    id: uuidv4(),
    shares: purchaseData.shares,
    purchasePrice: purchaseData.purchasePrice,
    purchaseDate: purchaseData.purchaseDate || new Date().toISOString(),
    lotType: purchaseData.lotType || "purchase",
    notes: purchaseData.notes || null,
  };

  holding.lots.push(newLot);

  // Recalculate totals
  const totalShares = holding.lots.reduce((sum, lot) => sum + lot.shares, 0);
  const totalCost = holding.lots.reduce(
    (sum, lot) => sum + lot.shares * lot.purchasePrice,
    0
  );

  holding.shares = totalShares;
  holding.costBasis.totalCost = totalCost;
  holding.costBasis.averageCost = totalCost / totalShares;
  holding.updatedAt = new Date().toISOString();

  data.equityHoldings[index] = holding;
  db.write(data);

  return holding;
};

/**
 * Sell shares (FIFO method by default)
 */
const sellShares = async (equityId, ownerId, saleData) => {
  const data = db.read();
  const index = (data.equityHoldings || []).findIndex(
    (e) => e.id === equityId && e.ownerId === ownerId
  );

  if (index === -1) {
    throw new Error("Equity holding not found or unauthorized");
  }

  const holding = data.equityHoldings[index];

  if (saleData.shares > holding.shares) {
    throw new Error("Insufficient shares to sell");
  }

  let remainingToSell = saleData.shares;
  let totalCostBasis = 0;
  const soldLots = [];

  // Sort lots by date (FIFO)
  const sortedLots = [...holding.lots].sort(
    (a, b) => new Date(a.purchaseDate) - new Date(b.purchaseDate)
  );

  for (const lot of sortedLots) {
    if (remainingToSell <= 0) break;

    const sharesToSellFromLot = Math.min(remainingToSell, lot.shares);
    const costBasisFromLot = sharesToSellFromLot * lot.purchasePrice;

    totalCostBasis += costBasisFromLot;
    lot.shares -= sharesToSellFromLot;
    remainingToSell -= sharesToSellFromLot;

    soldLots.push({
      lotId: lot.id,
      shares: sharesToSellFromLot,
      costBasis: costBasisFromLot,
      purchaseDate: lot.purchaseDate,
    });
  }

  // Remove empty lots
  holding.lots = holding.lots.filter((lot) => lot.shares > 0);

  // Calculate gain/loss
  const saleProceeds = saleData.shares * saleData.salePrice;
  const realizedGainLoss = saleProceeds - totalCostBasis;

  // Record sale
  if (!data.equitySales) {
    data.equitySales = [];
  }

  const sale = {
    id: uuidv4(),
    equityId,
    ownerId,
    symbol: holding.symbol,
    shares: saleData.shares,
    salePrice: saleData.salePrice,
    saleDate: saleData.saleDate || new Date().toISOString(),
    saleProceeds,
    costBasis: totalCostBasis,
    realizedGainLoss,
    lots: soldLots,
    fees: saleData.fees || 0,
    netProceeds: saleProceeds - (saleData.fees || 0),
  };

  data.equitySales.push(sale);

  // Update holding
  holding.shares = holding.lots.reduce((sum, lot) => sum + lot.shares, 0);
  holding.costBasis.totalCost = holding.lots.reduce(
    (sum, lot) => sum + lot.shares * lot.purchasePrice,
    0
  );
  holding.costBasis.averageCost =
    holding.shares > 0 ? holding.costBasis.totalCost / holding.shares : 0;
  holding.updatedAt = new Date().toISOString();

  if (holding.shares === 0) {
    holding.status = "closed";
  }

  data.equityHoldings[index] = holding;
  db.write(data);

  return { sale, holding };
};

/**
 * Record dividend payment
 */
const recordDividend = async (equityId, dividendData) => {
  const data = db.read();
  const index = (data.equityHoldings || []).findIndex((e) => e.id === equityId);

  if (index === -1) {
    throw new Error("Equity holding not found");
  }

  const holding = data.equityHoldings[index];

  const dividend = {
    id: uuidv4(),
    paymentDate: dividendData.paymentDate || new Date().toISOString(),
    exDividendDate: dividendData.exDividendDate || null,
    recordDate: dividendData.recordDate || null,
    amountPerShare: dividendData.amountPerShare,
    sharesHeld: dividendData.sharesHeld || holding.shares,
    totalAmount: dividendData.amountPerShare * (dividendData.sharesHeld || holding.shares),
    taxWithheld: dividendData.taxWithheld || 0,
    netAmount:
      dividendData.amountPerShare * (dividendData.sharesHeld || holding.shares) -
      (dividendData.taxWithheld || 0),
    reinvested: dividendData.reinvested || false,
    reinvestedShares: dividendData.reinvestedShares || 0,
    recordedAt: new Date().toISOString(),
  };

  holding.dividendHistory.push(dividend);
  holding.dividend.lastPayment = dividend.paymentDate;
  holding.updatedAt = new Date().toISOString();

  // If reinvesting, add new lot
  if (dividend.reinvested && dividend.reinvestedShares > 0) {
    holding.lots.push({
      id: uuidv4(),
      shares: dividend.reinvestedShares,
      purchasePrice: dividendData.reinvestPrice || dividendData.amountPerShare,
      purchaseDate: dividend.paymentDate,
      lotType: "drip",
    });

    // Recalculate totals
    holding.shares = holding.lots.reduce((sum, lot) => sum + lot.shares, 0);
    holding.costBasis.totalCost = holding.lots.reduce(
      (sum, lot) => sum + lot.shares * lot.purchasePrice,
      0
    );
    holding.costBasis.averageCost = holding.costBasis.totalCost / holding.shares;
  }

  data.equityHoldings[index] = holding;
  db.write(data);

  return dividend;
};

/**
 * Calculate unrealized gain/loss
 */
const calculateUnrealizedGainLoss = async (equityId, currentPrice) => {
  const holding = await getEquityById(equityId);

  const currentValue = holding.shares * currentPrice;
  const costBasis = holding.costBasis.totalCost;
  const unrealizedGainLoss = currentValue - costBasis;
  const unrealizedGainLossPercent = (unrealizedGainLoss / costBasis) * 100;

  return {
    equityId,
    symbol: holding.symbol,
    shares: holding.shares,
    currentPrice,
    currentValue,
    costBasis,
    averageCost: holding.costBasis.averageCost,
    unrealizedGainLoss,
    unrealizedGainLossPercent,
  };
};

/**
 * Get portfolio summary
 */
const getPortfolioSummary = async (ownerId, prices = {}) => {
  const holdings = await getUserEquities(ownerId);

  let totalCost = 0;
  let totalValue = 0;
  let totalDividends = 0;

  const holdingsSummary = holdings.map((h) => {
    const currentPrice = prices[h.symbol] || h.costBasis.averageCost;
    const currentValue = h.shares * currentPrice;
    const gainLoss = currentValue - h.costBasis.totalCost;
    const dividendsReceived = h.dividendHistory.reduce((sum, d) => sum + d.netAmount, 0);

    totalCost += h.costBasis.totalCost;
    totalValue += currentValue;
    totalDividends += dividendsReceived;

    return {
      equityId: h.id,
      symbol: h.symbol,
      name: h.name,
      shares: h.shares,
      costBasis: h.costBasis.totalCost,
      currentValue,
      gainLoss,
      gainLossPercent: (gainLoss / h.costBasis.totalCost) * 100,
      dividendsReceived,
    };
  });

  const bySector = {};
  const byType = {};

  holdings.forEach((h) => {
    const currentPrice = prices[h.symbol] || h.costBasis.averageCost;
    const value = h.shares * currentPrice;

    if (h.company.sector) {
      bySector[h.company.sector] = (bySector[h.company.sector] || 0) + value;
    }
    byType[h.equityType] = (byType[h.equityType] || 0) + value;
  });

  return {
    ownerId,
    totalHoldings: holdings.length,
    totalCost,
    totalValue,
    totalUnrealizedGainLoss: totalValue - totalCost,
    totalUnrealizedGainLossPercent: ((totalValue - totalCost) / totalCost) * 100,
    totalDividendsReceived: totalDividends,
    yieldOnCost: totalCost > 0 ? (totalDividends / totalCost) * 100 : 0,
    bySector,
    byType,
    holdings: holdingsSummary,
  };
};

/**
 * Get dividend income summary
 */
const getDividendSummary = async (ownerId, year = null) => {
  const holdings = await getUserEquities(ownerId);
  const targetYear = year || new Date().getFullYear();

  let totalDividends = 0;
  let totalTaxWithheld = 0;
  const byMonth = {};
  const bySymbol = {};

  holdings.forEach((h) => {
    h.dividendHistory
      .filter((d) => new Date(d.paymentDate).getFullYear() === targetYear)
      .forEach((d) => {
        totalDividends += d.totalAmount;
        totalTaxWithheld += d.taxWithheld;

        const month = new Date(d.paymentDate).getMonth() + 1;
        byMonth[month] = (byMonth[month] || 0) + d.totalAmount;

        bySymbol[h.symbol] = (bySymbol[h.symbol] || 0) + d.totalAmount;
      });
  });

  return {
    ownerId,
    year: targetYear,
    totalDividends,
    totalTaxWithheld,
    netDividends: totalDividends - totalTaxWithheld,
    byMonth,
    bySymbol: Object.entries(bySymbol).sort((a, b) => b[1] - a[1]),
  };
};

/**
 * Get realized gains/losses
 */
const getRealizedGains = async (ownerId, year = null) => {
  const data = db.read();
  const targetYear = year || new Date().getFullYear();

  const sales = (data.equitySales || []).filter(
    (s) =>
      s.ownerId === ownerId &&
      new Date(s.saleDate).getFullYear() === targetYear
  );

  const shortTerm = sales.filter((s) => {
    const holdingPeriod =
      (new Date(s.saleDate) - new Date(s.lots[0]?.purchaseDate || s.saleDate)) /
      (24 * 60 * 60 * 1000);
    return holdingPeriod <= 365;
  });

  const longTerm = sales.filter((s) => {
    const holdingPeriod =
      (new Date(s.saleDate) - new Date(s.lots[0]?.purchaseDate || s.saleDate)) /
      (24 * 60 * 60 * 1000);
    return holdingPeriod > 365;
  });

  return {
    ownerId,
    year: targetYear,
    totalSales: sales.length,
    totalProceeds: sales.reduce((sum, s) => sum + s.saleProceeds, 0),
    totalCostBasis: sales.reduce((sum, s) => sum + s.costBasis, 0),
    totalRealizedGainLoss: sales.reduce((sum, s) => sum + s.realizedGainLoss, 0),
    shortTermGainLoss: shortTerm.reduce((sum, s) => sum + s.realizedGainLoss, 0),
    longTermGainLoss: longTerm.reduce((sum, s) => sum + s.realizedGainLoss, 0),
    sales: sales.map((s) => ({
      symbol: s.symbol,
      shares: s.shares,
      saleDate: s.saleDate,
      proceeds: s.saleProceeds,
      gainLoss: s.realizedGainLoss,
    })),
  };
};

module.exports = {
  EQUITY_TYPE,
  DIVIDEND_FREQUENCY,
  createEquityHolding,
  getEquityById,
  getUserEquities,
  addShares,
  sellShares,
  recordDividend,
  calculateUnrealizedGainLoss,
  getPortfolioSummary,
  getDividendSummary,
  getRealizedGains,
};
