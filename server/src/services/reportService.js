const { v4: uuidv4 } = require("uuid");
const db = require("../db");

/**
 * Report Service - Generates various reports
 * Supports financial reports, transaction reports, tax reports, and custom reports
 */

const REPORT_TYPE = {
  TRANSACTION: "transaction",
  PORTFOLIO: "portfolio",
  TAX: "tax",
  PERFORMANCE: "performance",
  COMPLIANCE: "compliance",
  AUDIT: "audit",
  CUSTOM: "custom",
};

const REPORT_STATUS = {
  PENDING: "pending",
  GENERATING: "generating",
  COMPLETED: "completed",
  FAILED: "failed",
};

const REPORT_FORMAT = {
  JSON: "json",
  CSV: "csv",
  PDF: "pdf",
  EXCEL: "excel",
};

/**
 * Create a report request
 */
const createReport = async (userId, reportData) => {
  const data = db.read();

  if (!data.reports) {
    data.reports = [];
  }

  const report = {
    id: uuidv4(),
    userId,
    type: reportData.type,
    name: reportData.name || `${reportData.type}_report_${Date.now()}`,
    parameters: {
      startDate: reportData.startDate,
      endDate: reportData.endDate,
      filters: reportData.filters || {},
      options: reportData.options || {},
    },
    format: reportData.format || REPORT_FORMAT.JSON,
    status: REPORT_STATUS.PENDING,
    result: null,
    error: null,
    createdAt: new Date().toISOString(),
    completedAt: null,
  };

  data.reports.push(report);
  db.write(data);

  // Generate report asynchronously
  generateReport(report.id);

  return report;
};

/**
 * Generate report
 */
const generateReport = async (reportId) => {
  const data = db.read();
  const index = data.reports.findIndex((r) => r.id === reportId);

  if (index === -1) return;

  const report = data.reports[index];
  report.status = REPORT_STATUS.GENERATING;
  db.write(data);

  try {
    let result;

    switch (report.type) {
      case REPORT_TYPE.TRANSACTION:
        result = await generateTransactionReport(report.userId, report.parameters);
        break;
      case REPORT_TYPE.PORTFOLIO:
        result = await generatePortfolioReport(report.userId, report.parameters);
        break;
      case REPORT_TYPE.TAX:
        result = await generateTaxReport(report.userId, report.parameters);
        break;
      case REPORT_TYPE.PERFORMANCE:
        result = await generatePerformanceReport(report.userId, report.parameters);
        break;
      case REPORT_TYPE.COMPLIANCE:
        result = await generateComplianceReport(report.parameters);
        break;
      default:
        throw new Error("Unknown report type");
    }

    report.result = result;
    report.status = REPORT_STATUS.COMPLETED;
    report.completedAt = new Date().toISOString();
  } catch (error) {
    report.status = REPORT_STATUS.FAILED;
    report.error = error.message;
  }

  data.reports[index] = report;
  db.write(data);

  return report;
};

/**
 * Generate transaction report
 */
const generateTransactionReport = async (userId, parameters) => {
  const data = db.read();
  const startDate = new Date(parameters.startDate);
  const endDate = new Date(parameters.endDate);

  // Get all user transactions
  const trades = (data.trades || []).filter(
    (t) =>
      (t.makerUserId === userId || t.takerUserId === userId) &&
      new Date(t.matchedAt) >= startDate &&
      new Date(t.matchedAt) <= endDate
  );

  const payments = (data.payments || []).filter(
    (p) =>
      p.userId === userId &&
      new Date(p.createdAt) >= startDate &&
      new Date(p.createdAt) <= endDate
  );

  // Calculate summaries
  const tradeSummary = {
    totalTrades: trades.length,
    totalVolume: trades.reduce((sum, t) => sum + t.notionalValue, 0),
    totalFees: trades.reduce((sum, t) => {
      if (t.makerUserId === userId) return sum + t.makerFee;
      return sum + t.takerFee;
    }, 0),
    buyTrades: trades.filter(
      (t) =>
        (t.takerUserId === userId && t.side === "buy") ||
        (t.makerUserId === userId && t.side === "sell")
    ).length,
    sellTrades: trades.filter(
      (t) =>
        (t.takerUserId === userId && t.side === "sell") ||
        (t.makerUserId === userId && t.side === "buy")
    ).length,
  };

  const paymentSummary = {
    totalDeposits: payments
      .filter((p) => p.type === "deposit" && p.status === "completed")
      .reduce((sum, p) => sum + p.amount, 0),
    totalWithdrawals: payments
      .filter((p) => p.type === "withdrawal" && p.status === "completed")
      .reduce((sum, p) => sum + p.amount, 0),
    totalFees: payments.reduce((sum, p) => sum + (p.fee || 0), 0),
  };

  return {
    reportType: REPORT_TYPE.TRANSACTION,
    period: { startDate: parameters.startDate, endDate: parameters.endDate },
    tradeSummary,
    paymentSummary,
    trades: trades.map((t) => ({
      id: t.id,
      symbol: t.symbol,
      side: t.side,
      quantity: t.quantity,
      price: t.price,
      value: t.notionalValue,
      fee: t.makerUserId === userId ? t.makerFee : t.takerFee,
      date: t.matchedAt,
    })),
    payments: payments.map((p) => ({
      id: p.id,
      type: p.type,
      amount: p.amount,
      currency: p.currency,
      fee: p.fee,
      status: p.status,
      date: p.createdAt,
    })),
    generatedAt: new Date().toISOString(),
  };
};

/**
 * Generate portfolio report
 */
const generatePortfolioReport = async (userId, parameters) => {
  const data = db.read();

  // Get all holdings
  const equityHoldings = (data.equityHoldings || []).filter(
    (h) => h.ownerId === userId && h.status === "active"
  );
  const bondHoldings = (data.bondHoldings || []).filter(
    (h) => h.ownerId === userId && h.status === "active"
  );
  const commodityHoldings = (data.commodityHoldings || []).filter(
    (h) => h.ownerId === userId && h.status === "active"
  );
  const realEstateProperties = (data.realEstateProperties || []).filter(
    (p) => p.ownerId === userId
  );
  const artPieces = (data.artPieces || []).filter(
    (a) => a.ownerId === userId && a.status === "owned"
  );

  // Calculate values
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
  const artValue = artPieces.reduce(
    (sum, a) => sum + (a.valuation?.estimatedValue || 0),
    0
  );

  const totalValue = equityValue + bondValue + commodityValue + realEstateValue + artValue;

  return {
    reportType: REPORT_TYPE.PORTFOLIO,
    asOfDate: parameters.endDate || new Date().toISOString(),
    summary: {
      totalValue,
      allocation: {
        equities: { value: equityValue, percentage: (equityValue / totalValue) * 100 || 0 },
        bonds: { value: bondValue, percentage: (bondValue / totalValue) * 100 || 0 },
        commodities: { value: commodityValue, percentage: (commodityValue / totalValue) * 100 || 0 },
        realEstate: { value: realEstateValue, percentage: (realEstateValue / totalValue) * 100 || 0 },
        art: { value: artValue, percentage: (artValue / totalValue) * 100 || 0 },
      },
    },
    holdings: {
      equities: equityHoldings.map((h) => ({
        symbol: h.symbol,
        name: h.name,
        shares: h.shares,
        averageCost: h.costBasis.averageCost,
        totalCost: h.costBasis.totalCost,
      })),
      bonds: bondHoldings.map((h) => ({
        name: h.name,
        issuer: h.issuer.name,
        faceValue: h.totalFaceValue,
        couponRate: h.coupon.rate,
        maturityDate: h.dates.maturityDate,
      })),
      commodities: commodityHoldings.map((h) => ({
        symbol: h.symbol,
        name: h.name,
        quantity: h.quantity,
        unit: h.unit,
      })),
      realEstate: realEstateProperties.map((p) => ({
        name: p.name,
        type: p.propertyType,
        location: `${p.address.city}, ${p.address.state}`,
        value: p.valuation?.currentValue,
      })),
      art: artPieces.map((a) => ({
        title: a.title,
        artist: a.artist.name,
        category: a.category,
        value: a.valuation?.estimatedValue,
      })),
    },
    generatedAt: new Date().toISOString(),
  };
};

/**
 * Generate tax report
 */
const generateTaxReport = async (userId, parameters) => {
  const data = db.read();
  const year = parameters.filters?.year || new Date().getFullYear();
  const startDate = new Date(`${year}-01-01`);
  const endDate = new Date(`${year}-12-31`);

  // Realized gains from equity sales
  const equitySales = (data.equitySales || []).filter(
    (s) =>
      s.ownerId === userId &&
      new Date(s.saleDate) >= startDate &&
      new Date(s.saleDate) <= endDate
  );

  const realizedGains = equitySales.reduce((sum, s) => sum + s.realizedGainLoss, 0);
  const shortTermGains = equitySales
    .filter((s) => {
      const holdingDays =
        (new Date(s.saleDate) - new Date(s.lots[0]?.purchaseDate || s.saleDate)) /
        (24 * 60 * 60 * 1000);
      return holdingDays <= 365;
    })
    .reduce((sum, s) => sum + s.realizedGainLoss, 0);
  const longTermGains = realizedGains - shortTermGains;

  // Dividend income
  const dividendIncome = (data.equityHoldings || [])
    .filter((h) => h.ownerId === userId)
    .flatMap((h) => h.dividendHistory || [])
    .filter(
      (d) =>
        new Date(d.paymentDate) >= startDate && new Date(d.paymentDate) <= endDate
    )
    .reduce((sum, d) => sum + d.totalAmount, 0);

  // Interest income from bonds
  const interestIncome = (data.bondHoldings || [])
    .filter((h) => h.ownerId === userId)
    .flatMap((h) => h.couponPayments || [])
    .filter(
      (p) => new Date(p.date) >= startDate && new Date(p.date) <= endDate
    )
    .reduce((sum, p) => sum + p.amount, 0);

  // Fees paid
  const feesPaid = (data.feeCharges || [])
    .filter(
      (f) =>
        f.userId === userId &&
        new Date(f.chargedAt) >= startDate &&
        new Date(f.chargedAt) <= endDate
    )
    .reduce((sum, f) => sum + f.amount, 0);

  return {
    reportType: REPORT_TYPE.TAX,
    taxYear: year,
    capitalGains: {
      total: realizedGains,
      shortTerm: shortTermGains,
      longTerm: longTermGains,
      transactions: equitySales.map((s) => ({
        symbol: s.symbol,
        shares: s.shares,
        saleDate: s.saleDate,
        proceeds: s.saleProceeds,
        costBasis: s.costBasis,
        gainLoss: s.realizedGainLoss,
      })),
    },
    income: {
      dividends: dividendIncome,
      interest: interestIncome,
      total: dividendIncome + interestIncome,
    },
    deductions: {
      tradingFees: feesPaid,
      total: feesPaid,
    },
    summary: {
      totalIncome: dividendIncome + interestIncome + Math.max(0, realizedGains),
      totalDeductions: feesPaid,
      netTaxableAmount: dividendIncome + interestIncome + realizedGains - feesPaid,
    },
    disclaimer:
      "This report is for informational purposes only and should not be considered tax advice. Please consult a tax professional.",
    generatedAt: new Date().toISOString(),
  };
};

/**
 * Generate performance report
 */
const generatePerformanceReport = async (userId, parameters) => {
  const data = db.read();
  const startDate = new Date(parameters.startDate);
  const endDate = new Date(parameters.endDate);

  // Get trades in period
  const trades = (data.trades || []).filter(
    (t) =>
      (t.makerUserId === userId || t.takerUserId === userId) &&
      new Date(t.matchedAt) >= startDate &&
      new Date(t.matchedAt) <= endDate
  );

  // Calculate trading metrics
  const totalTrades = trades.length;
  const totalVolume = trades.reduce((sum, t) => sum + t.notionalValue, 0);
  const totalFees = trades.reduce((sum, t) => {
    if (t.makerUserId === userId) return sum + t.makerFee;
    return sum + t.takerFee;
  }, 0);

  // Win rate from closed positions
  const closedPositions = (data.closedPositions || []).filter(
    (p) =>
      p.userId === userId &&
      new Date(p.closedAt) >= startDate &&
      new Date(p.closedAt) <= endDate
  );

  const winningTrades = closedPositions.filter((p) => p.realizedPnl > 0).length;
  const losingTrades = closedPositions.filter((p) => p.realizedPnl < 0).length;
  const winRate = closedPositions.length > 0 ? (winningTrades / closedPositions.length) * 100 : 0;

  const totalRealizedPnl = closedPositions.reduce((sum, p) => sum + p.realizedPnl, 0);

  return {
    reportType: REPORT_TYPE.PERFORMANCE,
    period: { startDate: parameters.startDate, endDate: parameters.endDate },
    trading: {
      totalTrades,
      totalVolume,
      totalFees,
      averageTradeSize: totalTrades > 0 ? totalVolume / totalTrades : 0,
    },
    performance: {
      closedPositions: closedPositions.length,
      winningTrades,
      losingTrades,
      winRate,
      totalRealizedPnl,
      averagePnl: closedPositions.length > 0 ? totalRealizedPnl / closedPositions.length : 0,
    },
    profitFactor:
      losingTrades > 0
        ? Math.abs(
            closedPositions.filter((p) => p.realizedPnl > 0).reduce((sum, p) => sum + p.realizedPnl, 0) /
            closedPositions.filter((p) => p.realizedPnl < 0).reduce((sum, p) => sum + p.realizedPnl, 0)
          )
        : 0,
    generatedAt: new Date().toISOString(),
  };
};

/**
 * Generate compliance report
 */
const generateComplianceReport = async (parameters) => {
  const data = db.read();
  const startDate = new Date(parameters.startDate);
  const endDate = new Date(parameters.endDate);

  // KYC status
  const kycRecords = data.kycRecords || [];
  const kycByStatus = {};
  kycRecords.forEach((k) => {
    kycByStatus[k.status] = (kycByStatus[k.status] || 0) + 1;
  });

  // Compliance alerts
  const alerts = (data.complianceAlerts || []).filter(
    (a) =>
      new Date(a.createdAt) >= startDate && new Date(a.createdAt) <= endDate
  );

  const alertsByStatus = {};
  const alertsBySeverity = {};
  alerts.forEach((a) => {
    alertsByStatus[a.status] = (alertsByStatus[a.status] || 0) + 1;
    alertsBySeverity[a.severity] = (alertsBySeverity[a.severity] || 0) + 1;
  });

  // SAR reports
  const sarReports = (data.sarReports || []).filter(
    (s) =>
      new Date(s.createdAt) >= startDate && new Date(s.createdAt) <= endDate
  );

  return {
    reportType: REPORT_TYPE.COMPLIANCE,
    period: { startDate: parameters.startDate, endDate: parameters.endDate },
    kyc: {
      total: kycRecords.length,
      byStatus: kycByStatus,
    },
    alerts: {
      total: alerts.length,
      byStatus: alertsByStatus,
      bySeverity: alertsBySeverity,
    },
    sarReports: {
      total: sarReports.length,
      filed: sarReports.filter((s) => s.status === "filed").length,
      pending: sarReports.filter((s) => s.status === "draft").length,
    },
    generatedAt: new Date().toISOString(),
  };
};

/**
 * Get report by ID
 */
const getReportById = async (reportId) => {
  const data = db.read();
  const report = (data.reports || []).find((r) => r.id === reportId);

  if (!report) {
    throw new Error("Report not found");
  }

  return report;
};

/**
 * Get user reports
 */
const getUserReports = async (userId, filters = {}) => {
  const data = db.read();
  let reports = (data.reports || []).filter((r) => r.userId === userId);

  if (filters.type) {
    reports = reports.filter((r) => r.type === filters.type);
  }

  if (filters.status) {
    reports = reports.filter((r) => r.status === filters.status);
  }

  reports.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return reports;
};

/**
 * Delete report
 */
const deleteReport = async (reportId, userId) => {
  const data = db.read();
  const index = (data.reports || []).findIndex(
    (r) => r.id === reportId && r.userId === userId
  );

  if (index === -1) {
    throw new Error("Report not found");
  }

  data.reports.splice(index, 1);
  db.write(data);

  return { success: true };
};

module.exports = {
  REPORT_TYPE,
  REPORT_STATUS,
  REPORT_FORMAT,
  createReport,
  generateReport,
  getReportById,
  getUserReports,
  deleteReport,
  generateTransactionReport,
  generatePortfolioReport,
  generateTaxReport,
  generatePerformanceReport,
  generateComplianceReport,
};
