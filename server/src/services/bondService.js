const { v4: uuidv4 } = require("uuid");
const db = require("../db");

/**
 * Bond Service - Handles bond and fixed income assets
 * Supports government bonds, corporate bonds, municipal bonds, and more
 */

const BOND_TYPE = {
  GOVERNMENT: "government",
  CORPORATE: "corporate",
  MUNICIPAL: "municipal",
  TREASURY: "treasury",
  AGENCY: "agency",
  CONVERTIBLE: "convertible",
  ZERO_COUPON: "zero_coupon",
  FLOATING_RATE: "floating_rate",
  INFLATION_LINKED: "inflation_linked",
};

const BOND_RATING = {
  AAA: "AAA",
  AA_PLUS: "AA+",
  AA: "AA",
  AA_MINUS: "AA-",
  A_PLUS: "A+",
  A: "A",
  A_MINUS: "A-",
  BBB_PLUS: "BBB+",
  BBB: "BBB",
  BBB_MINUS: "BBB-",
  BB_PLUS: "BB+",
  BB: "BB",
  BB_MINUS: "BB-",
  B_PLUS: "B+",
  B: "B",
  B_MINUS: "B-",
  CCC: "CCC",
  CC: "CC",
  C: "C",
  D: "D",
};

const COUPON_FREQUENCY = {
  ANNUAL: "annual",
  SEMI_ANNUAL: "semi_annual",
  QUARTERLY: "quarterly",
  MONTHLY: "monthly",
  ZERO: "zero",
};

/**
 * Create a bond holding
 */
const createBondHolding = async (ownerId, bondData) => {
  const data = db.read();

  if (!data.bondHoldings) {
    data.bondHoldings = [];
  }

  const bond = {
    id: uuidv4(),
    ownerId,
    assetId: bondData.assetId || null,
    isin: bondData.isin || null,
    cusip: bondData.cusip || null,
    name: bondData.name,
    issuer: {
      name: bondData.issuerName,
      type: bondData.issuerType || "corporate",
      country: bondData.issuerCountry || null,
      sector: bondData.issuerSector || null,
    },
    bondType: bondData.bondType || BOND_TYPE.CORPORATE,
    faceValue: bondData.faceValue,
    quantity: bondData.quantity || 1,
    totalFaceValue: bondData.faceValue * (bondData.quantity || 1),
    coupon: {
      rate: bondData.couponRate, // Annual coupon rate as decimal (e.g., 0.05 for 5%)
      frequency: bondData.couponFrequency || COUPON_FREQUENCY.SEMI_ANNUAL,
      nextPaymentDate: bondData.nextCouponDate || null,
      dayCountConvention: bondData.dayCountConvention || "30/360",
    },
    dates: {
      issueDate: bondData.issueDate,
      maturityDate: bondData.maturityDate,
      firstCouponDate: bondData.firstCouponDate || null,
      callDate: bondData.callDate || null,
      putDate: bondData.putDate || null,
    },
    rating: {
      moodys: bondData.moodysRating || null,
      sp: bondData.spRating || null,
      fitch: bondData.fitchRating || null,
    },
    purchase: {
      date: bondData.purchaseDate || new Date().toISOString(),
      price: bondData.purchasePrice, // As percentage of face value (e.g., 98.5)
      yield: bondData.purchaseYield || null,
      accruedInterest: bondData.accruedInterest || 0,
      totalCost: calculateTotalCost(bondData),
    },
    features: {
      callable: bondData.callable || false,
      callPrice: bondData.callPrice || null,
      puttable: bondData.puttable || false,
      putPrice: bondData.putPrice || null,
      convertible: bondData.convertible || false,
      conversionRatio: bondData.conversionRatio || null,
      sinkingFund: bondData.sinkingFund || false,
    },
    currency: bondData.currency || "USD",
    status: "active",
    couponPayments: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  data.bondHoldings.push(bond);
  db.write(data);

  return bond;
};

/**
 * Calculate total cost including accrued interest
 */
const calculateTotalCost = (bondData) => {
  const faceValue = bondData.faceValue * (bondData.quantity || 1);
  const purchasePrice = faceValue * (bondData.purchasePrice / 100);
  const accruedInterest = bondData.accruedInterest || 0;
  return purchasePrice + accruedInterest;
};

/**
 * Get bond holding by ID
 */
const getBondById = async (bondId) => {
  const data = db.read();
  const bond = (data.bondHoldings || []).find((b) => b.id === bondId);

  if (!bond) {
    throw new Error("Bond holding not found");
  }

  return bond;
};

/**
 * Get user bond holdings
 */
const getUserBonds = async (ownerId, filters = {}) => {
  const data = db.read();
  let bonds = (data.bondHoldings || []).filter((b) => b.ownerId === ownerId);

  if (filters.bondType) {
    bonds = bonds.filter((b) => b.bondType === filters.bondType);
  }

  if (filters.issuer) {
    bonds = bonds.filter((b) =>
      b.issuer.name.toLowerCase().includes(filters.issuer.toLowerCase())
    );
  }

  if (filters.minRating) {
    // Simplified rating filter
    bonds = bonds.filter((b) => b.rating.sp && b.rating.sp <= filters.minRating);
  }

  if (filters.maturing) {
    const days = parseInt(filters.maturing);
    const cutoffDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    bonds = bonds.filter((b) => new Date(b.dates.maturityDate) <= cutoffDate);
  }

  return bonds;
};

/**
 * Calculate yield to maturity
 */
const calculateYTM = async (bondId, currentPrice) => {
  const bond = await getBondById(bondId);

  const faceValue = bond.faceValue;
  const couponRate = bond.coupon.rate;
  const yearsToMaturity =
    (new Date(bond.dates.maturityDate) - new Date()) / (365.25 * 24 * 60 * 60 * 1000);
  const price = currentPrice || bond.purchase.price;

  // Simplified YTM approximation
  const annualCoupon = faceValue * couponRate;
  const capitalGain = (faceValue - price * faceValue / 100) / yearsToMaturity;
  const averagePrice = (faceValue + price * faceValue / 100) / 2;

  const ytm = ((annualCoupon + capitalGain) / averagePrice) * 100;

  return {
    bondId,
    bondName: bond.name,
    currentPrice: price,
    faceValue,
    couponRate: couponRate * 100,
    yearsToMaturity: Math.round(yearsToMaturity * 100) / 100,
    ytm: Math.round(ytm * 1000) / 1000,
    calculatedAt: new Date().toISOString(),
  };
};

/**
 * Calculate current yield
 */
const calculateCurrentYield = async (bondId, currentPrice) => {
  const bond = await getBondById(bondId);

  const annualCoupon = bond.faceValue * bond.coupon.rate;
  const marketPrice = (currentPrice / 100) * bond.faceValue;
  const currentYield = (annualCoupon / marketPrice) * 100;

  return {
    bondId,
    annualCoupon,
    marketPrice,
    currentYield: Math.round(currentYield * 1000) / 1000,
  };
};

/**
 * Calculate duration (Macaulay)
 */
const calculateDuration = async (bondId, yieldRate) => {
  const bond = await getBondById(bondId);

  const couponRate = bond.coupon.rate;
  const yearsToMaturity =
    (new Date(bond.dates.maturityDate) - new Date()) / (365.25 * 24 * 60 * 60 * 1000);
  const y = yieldRate || couponRate;

  // Simplified Macaulay duration calculation
  const periodsPerYear = bond.coupon.frequency === COUPON_FREQUENCY.SEMI_ANNUAL ? 2 : 1;
  const periods = Math.floor(yearsToMaturity * periodsPerYear);

  let duration = 0;
  let totalPV = 0;

  for (let t = 1; t <= periods; t++) {
    const cashFlow = bond.faceValue * (couponRate / periodsPerYear);
    const pv = cashFlow / Math.pow(1 + y / periodsPerYear, t);
    duration += (t / periodsPerYear) * pv;
    totalPV += pv;
  }

  // Add final principal payment
  const principalPV = bond.faceValue / Math.pow(1 + y / periodsPerYear, periods);
  duration += yearsToMaturity * principalPV;
  totalPV += principalPV;

  const macaulayDuration = duration / totalPV;
  const modifiedDuration = macaulayDuration / (1 + y / periodsPerYear);

  return {
    bondId,
    macaulayDuration: Math.round(macaulayDuration * 1000) / 1000,
    modifiedDuration: Math.round(modifiedDuration * 1000) / 1000,
    yieldUsed: y * 100,
  };
};

/**
 * Record coupon payment
 */
const recordCouponPayment = async (bondId, paymentData) => {
  const data = db.read();
  const index = (data.bondHoldings || []).findIndex((b) => b.id === bondId);

  if (index === -1) {
    throw new Error("Bond not found");
  }

  const payment = {
    id: uuidv4(),
    date: paymentData.date || new Date().toISOString(),
    amount: paymentData.amount,
    taxWithheld: paymentData.taxWithheld || 0,
    netAmount: paymentData.amount - (paymentData.taxWithheld || 0),
    recordedAt: new Date().toISOString(),
  };

  data.bondHoldings[index].couponPayments.push(payment);
  data.bondHoldings[index].updatedAt = new Date().toISOString();
  db.write(data);

  return payment;
};

/**
 * Get upcoming coupon payments
 */
const getUpcomingCoupons = async (ownerId, days = 90) => {
  const bonds = await getUserBonds(ownerId);
  const cutoffDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  const upcoming = [];

  bonds.forEach((bond) => {
    if (bond.coupon.nextPaymentDate && new Date(bond.coupon.nextPaymentDate) <= cutoffDate) {
      const couponAmount = (bond.totalFaceValue * bond.coupon.rate) / 
        (bond.coupon.frequency === COUPON_FREQUENCY.SEMI_ANNUAL ? 2 : 
         bond.coupon.frequency === COUPON_FREQUENCY.QUARTERLY ? 4 : 1);

      upcoming.push({
        bondId: bond.id,
        bondName: bond.name,
        issuer: bond.issuer.name,
        paymentDate: bond.coupon.nextPaymentDate,
        couponAmount,
        currency: bond.currency,
      });
    }
  });

  upcoming.sort((a, b) => new Date(a.paymentDate) - new Date(b.paymentDate));

  return upcoming;
};

/**
 * Get portfolio summary
 */
const getPortfolioSummary = async (ownerId) => {
  const bonds = await getUserBonds(ownerId);

  const totalFaceValue = bonds.reduce((sum, b) => sum + b.totalFaceValue, 0);
  const totalCost = bonds.reduce((sum, b) => sum + b.purchase.totalCost, 0);

  const annualIncome = bonds.reduce(
    (sum, b) => sum + b.totalFaceValue * b.coupon.rate,
    0
  );

  const averageCoupon =
    bonds.length > 0
      ? bonds.reduce((sum, b) => sum + b.coupon.rate, 0) / bonds.length
      : 0;

  // Calculate weighted average maturity
  const totalWeightedMaturity = bonds.reduce((sum, b) => {
    const yearsToMaturity =
      (new Date(b.dates.maturityDate) - new Date()) / (365.25 * 24 * 60 * 60 * 1000);
    return sum + yearsToMaturity * b.totalFaceValue;
  }, 0);

  const weightedAverageMaturity =
    totalFaceValue > 0 ? totalWeightedMaturity / totalFaceValue : 0;

  const byType = {};
  const byRating = {};
  const byIssuer = {};

  bonds.forEach((b) => {
    byType[b.bondType] = (byType[b.bondType] || 0) + b.totalFaceValue;
    if (b.rating.sp) {
      byRating[b.rating.sp] = (byRating[b.rating.sp] || 0) + b.totalFaceValue;
    }
    byIssuer[b.issuer.name] = (byIssuer[b.issuer.name] || 0) + b.totalFaceValue;
  });

  return {
    ownerId,
    totalBonds: bonds.length,
    totalFaceValue,
    totalCost,
    annualCouponIncome: annualIncome,
    averageCouponRate: averageCoupon * 100,
    weightedAverageMaturity: Math.round(weightedAverageMaturity * 100) / 100,
    yieldOnCost: totalCost > 0 ? (annualIncome / totalCost) * 100 : 0,
    byType,
    byRating,
    topIssuers: Object.entries(byIssuer)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5),
  };
};

/**
 * Get maturing bonds
 */
const getMaturingBonds = async (ownerId, days = 365) => {
  const bonds = await getUserBonds(ownerId);
  const cutoffDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

  const maturing = bonds
    .filter((b) => new Date(b.dates.maturityDate) <= cutoffDate)
    .map((b) => ({
      bondId: b.id,
      bondName: b.name,
      maturityDate: b.dates.maturityDate,
      faceValue: b.totalFaceValue,
      daysToMaturity: Math.ceil(
        (new Date(b.dates.maturityDate) - new Date()) / (24 * 60 * 60 * 1000)
      ),
    }))
    .sort((a, b) => a.daysToMaturity - b.daysToMaturity);

  return {
    count: maturing.length,
    totalValue: maturing.reduce((sum, b) => sum + b.faceValue, 0),
    bonds: maturing,
  };
};

/**
 * Update bond price
 */
const updateBondPrice = async (bondId, currentPrice) => {
  const data = db.read();
  const index = (data.bondHoldings || []).findIndex((b) => b.id === bondId);

  if (index === -1) {
    throw new Error("Bond not found");
  }

  data.bondHoldings[index].currentPrice = currentPrice;
  data.bondHoldings[index].currentMarketValue =
    (currentPrice / 100) * data.bondHoldings[index].totalFaceValue;
  data.bondHoldings[index].priceUpdatedAt = new Date().toISOString();
  data.bondHoldings[index].updatedAt = new Date().toISOString();

  db.write(data);

  return data.bondHoldings[index];
};

module.exports = {
  BOND_TYPE,
  BOND_RATING,
  COUPON_FREQUENCY,
  createBondHolding,
  getBondById,
  getUserBonds,
  calculateYTM,
  calculateCurrentYield,
  calculateDuration,
  recordCouponPayment,
  getUpcomingCoupons,
  getPortfolioSummary,
  getMaturingBonds,
  updateBondPrice,
};
