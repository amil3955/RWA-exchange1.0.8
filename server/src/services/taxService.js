const { v4: uuidv4 } = require("uuid");
const db = require("../db");

/**
 * Tax Service - Handles tax calculations and reporting
 * Supports capital gains, income, and withholding tax calculations
 */

const TAX_TYPE = {
  CAPITAL_GAINS: "capital_gains",
  DIVIDEND: "dividend",
  INTEREST: "interest",
  RENTAL: "rental",
  ROYALTY: "royalty",
  WITHHOLDING: "withholding",
};

const TAX_TREATMENT = {
  SHORT_TERM: "short_term",
  LONG_TERM: "long_term",
  QUALIFIED: "qualified",
  ORDINARY: "ordinary",
};

/**
 * Calculate capital gains tax
 */
const calculateCapitalGains = async (userId, year = null) => {
  const data = db.read();
  const targetYear = year || new Date().getFullYear();

  // Get equity sales
  const sales = (data.equitySales || []).filter(
    (s) => s.ownerId === userId && new Date(s.saleDate).getFullYear() === targetYear
  );

  let shortTermGains = 0;
  let shortTermLosses = 0;
  let longTermGains = 0;
  let longTermLosses = 0;
  const transactions = [];

  sales.forEach((sale) => {
    const holdingPeriod = sale.lots[0]
      ? (new Date(sale.saleDate) - new Date(sale.lots[0].purchaseDate)) / (24 * 60 * 60 * 1000)
      : 0;

    const isLongTerm = holdingPeriod > 365;
    const gainLoss = sale.realizedGainLoss;

    if (isLongTerm) {
      if (gainLoss > 0) {
        longTermGains += gainLoss;
      } else {
        longTermLosses += Math.abs(gainLoss);
      }
    } else {
      if (gainLoss > 0) {
        shortTermGains += gainLoss;
      } else {
        shortTermLosses += Math.abs(gainLoss);
      }
    }

    transactions.push({
      saleId: sale.id,
      symbol: sale.symbol,
      saleDate: sale.saleDate,
      proceeds: sale.saleProceeds,
      costBasis: sale.costBasis,
      gainLoss,
      treatment: isLongTerm ? TAX_TREATMENT.LONG_TERM : TAX_TREATMENT.SHORT_TERM,
      holdingPeriodDays: holdingPeriod,
    });
  });

  // Net gains/losses
  const netShortTerm = shortTermGains - shortTermLosses;
  const netLongTerm = longTermGains - longTermLosses;

  // Apply loss limitations (simplified)
  const totalNetGainLoss = netShortTerm + netLongTerm;
  const deductibleLoss = totalNetGainLoss < 0 ? Math.min(Math.abs(totalNetGainLoss), 3000) : 0;
  const carryoverLoss = totalNetGainLoss < -3000 ? Math.abs(totalNetGainLoss) - 3000 : 0;

  return {
    userId,
    year: targetYear,
    shortTerm: {
      gains: shortTermGains,
      losses: shortTermLosses,
      net: netShortTerm,
    },
    longTerm: {
      gains: longTermGains,
      losses: longTermLosses,
      net: netLongTerm,
    },
    totalNetGainLoss,
    deductibleLoss,
    carryoverLoss,
    transactions,
    transactionCount: transactions.length,
  };
};

/**
 * Calculate dividend tax
 */
const calculateDividendTax = async (userId, year = null) => {
  const data = db.read();
  const targetYear = year || new Date().getFullYear();

  const dividends = [];
  let qualifiedDividends = 0;
  let ordinaryDividends = 0;

  // Get dividends from equity holdings
  (data.equityHoldings || [])
    .filter((h) => h.ownerId === userId)
    .forEach((holding) => {
      (holding.dividendHistory || [])
        .filter((d) => new Date(d.paymentDate).getFullYear() === targetYear)
        .forEach((d) => {
          // Simplified: assume qualified if held > 60 days
          const isQualified = true; // Would check holding period in production

          if (isQualified) {
            qualifiedDividends += d.totalAmount;
          } else {
            ordinaryDividends += d.totalAmount;
          }

          dividends.push({
            symbol: holding.symbol,
            paymentDate: d.paymentDate,
            amount: d.totalAmount,
            taxWithheld: d.taxWithheld || 0,
            treatment: isQualified ? TAX_TREATMENT.QUALIFIED : TAX_TREATMENT.ORDINARY,
          });
        });
    });

  return {
    userId,
    year: targetYear,
    qualifiedDividends,
    ordinaryDividends,
    totalDividends: qualifiedDividends + ordinaryDividends,
    taxWithheld: dividends.reduce((sum, d) => sum + (d.taxWithheld || 0), 0),
    dividends,
    dividendCount: dividends.length,
  };
};

/**
 * Calculate interest income tax
 */
const calculateInterestTax = async (userId, year = null) => {
  const data = db.read();
  const targetYear = year || new Date().getFullYear();

  let taxableInterest = 0;
  let taxExemptInterest = 0;
  const interestPayments = [];

  // Get interest from bond holdings
  (data.bondHoldings || [])
    .filter((h) => h.ownerId === userId)
    .forEach((bond) => {
      (bond.couponPayments || [])
        .filter((p) => new Date(p.date).getFullYear() === targetYear)
        .forEach((payment) => {
          // Check if municipal bond (tax-exempt)
          const isTaxExempt = bond.bondType === "municipal";

          if (isTaxExempt) {
            taxExemptInterest += payment.amount;
          } else {
            taxableInterest += payment.amount;
          }

          interestPayments.push({
            bondName: bond.name,
            bondType: bond.bondType,
            paymentDate: payment.date,
            amount: payment.amount,
            taxExempt: isTaxExempt,
          });
        });
    });

  return {
    userId,
    year: targetYear,
    taxableInterest,
    taxExemptInterest,
    totalInterest: taxableInterest + taxExemptInterest,
    interestPayments,
    paymentCount: interestPayments.length,
  };
};

/**
 * Generate tax summary
 */
const generateTaxSummary = async (userId, year = null) => {
  const targetYear = year || new Date().getFullYear();

  const capitalGains = await calculateCapitalGains(userId, targetYear);
  const dividends = await calculateDividendTax(userId, targetYear);
  const interest = await calculateInterestTax(userId, targetYear);

  // Estimate taxes (simplified - using rough US federal rates)
  const shortTermRate = 0.32; // Assumes 32% bracket
  const longTermRate = 0.15; // 15% for most long-term gains
  const qualifiedDividendRate = 0.15;
  const ordinaryIncomeRate = 0.32;

  const estimatedTax = {
    shortTermCapitalGains: Math.max(0, capitalGains.shortTerm.net) * shortTermRate,
    longTermCapitalGains: Math.max(0, capitalGains.longTerm.net) * longTermRate,
    qualifiedDividends: dividends.qualifiedDividends * qualifiedDividendRate,
    ordinaryDividends: dividends.ordinaryDividends * ordinaryIncomeRate,
    taxableInterest: interest.taxableInterest * ordinaryIncomeRate,
  };

  const totalEstimatedTax = Object.values(estimatedTax).reduce((sum, t) => sum + t, 0);
  const totalWithheld = dividends.taxWithheld;

  return {
    userId,
    year: targetYear,
    income: {
      capitalGains: capitalGains.totalNetGainLoss,
      dividends: dividends.totalDividends,
      interest: interest.totalInterest,
      total:
        capitalGains.totalNetGainLoss +
        dividends.totalDividends +
        interest.taxableInterest,
    },
    estimatedTax,
    totalEstimatedTax,
    taxWithheld: totalWithheld,
    estimatedOwed: totalEstimatedTax - totalWithheld,
    disclaimer:
      "This is an estimate only. Please consult a tax professional for accurate calculations.",
    generatedAt: new Date().toISOString(),
  };
};

/**
 * Record tax lot
 */
const recordTaxLot = async (userId, lotData) => {
  const data = db.read();

  if (!data.taxLots) {
    data.taxLots = [];
  }

  const lot = {
    id: uuidv4(),
    userId,
    symbol: lotData.symbol,
    shares: lotData.shares,
    purchaseDate: lotData.purchaseDate,
    purchasePrice: lotData.purchasePrice,
    costBasis: lotData.shares * lotData.purchasePrice,
    adjustments: lotData.adjustments || [],
    status: "open",
    createdAt: new Date().toISOString(),
  };

  data.taxLots.push(lot);
  db.write(data);

  return lot;
};

/**
 * Get tax lots for symbol
 */
const getTaxLots = async (userId, symbol = null) => {
  const data = db.read();
  let lots = (data.taxLots || []).filter((l) => l.userId === userId);

  if (symbol) {
    lots = lots.filter((l) => l.symbol === symbol);
  }

  return lots;
};

/**
 * Calculate wash sale adjustment
 */
const checkWashSale = async (userId, symbol, saleDate, lossAmount) => {
  const data = db.read();

  // Check for purchases within 30 days before or after sale
  const saleDateObj = new Date(saleDate);
  const windowStart = new Date(saleDateObj.getTime() - 30 * 24 * 60 * 60 * 1000);
  const windowEnd = new Date(saleDateObj.getTime() + 30 * 24 * 60 * 60 * 1000);

  const taxLots = (data.taxLots || []).filter(
    (l) =>
      l.userId === userId &&
      l.symbol === symbol &&
      new Date(l.purchaseDate) >= windowStart &&
      new Date(l.purchaseDate) <= windowEnd &&
      new Date(l.purchaseDate).getTime() !== saleDateObj.getTime()
  );

  if (taxLots.length > 0 && lossAmount < 0) {
    return {
      isWashSale: true,
      disallowedLoss: Math.abs(lossAmount),
      replacementShares: taxLots.reduce((sum, l) => sum + l.shares, 0),
      message: "Loss may be disallowed due to wash sale rule",
    };
  }

  return {
    isWashSale: false,
    disallowedLoss: 0,
    message: "No wash sale detected",
  };
};

/**
 * Get tax documents
 */
const getTaxDocuments = async (userId, year = null) => {
  const data = db.read();
  const targetYear = year || new Date().getFullYear();

  // Generate list of available tax documents
  const documents = [
    {
      type: "1099-B",
      description: "Proceeds from Broker Transactions",
      available: true,
      year: targetYear,
    },
    {
      type: "1099-DIV",
      description: "Dividends and Distributions",
      available: true,
      year: targetYear,
    },
    {
      type: "1099-INT",
      description: "Interest Income",
      available: true,
      year: targetYear,
    },
    {
      type: "Summary Report",
      description: "Annual Tax Summary",
      available: true,
      year: targetYear,
    },
  ];

  return {
    userId,
    year: targetYear,
    documents,
  };
};

/**
 * Estimate quarterly tax payment
 */
const estimateQuarterlyPayment = async (userId, quarter, year = null) => {
  const targetYear = year || new Date().getFullYear();
  const summary = await generateTaxSummary(userId, targetYear);

  // Divide annual estimate by 4 for quarterly
  const quarterlyPayment = summary.totalEstimatedTax / 4;

  const quarterDueDates = {
    1: `${targetYear}-04-15`,
    2: `${targetYear}-06-15`,
    3: `${targetYear}-09-15`,
    4: `${targetYear + 1}-01-15`,
  };

  return {
    userId,
    year: targetYear,
    quarter,
    estimatedPayment: quarterlyPayment,
    dueDate: quarterDueDates[quarter],
    ytdIncome: summary.income.total,
    ytdEstimatedTax: summary.totalEstimatedTax,
  };
};

module.exports = {
  TAX_TYPE,
  TAX_TREATMENT,
  calculateCapitalGains,
  calculateDividendTax,
  calculateInterestTax,
  generateTaxSummary,
  recordTaxLot,
  getTaxLots,
  checkWashSale,
  getTaxDocuments,
  estimateQuarterlyPayment,
};
