const { v4: uuidv4 } = require("uuid");
const db = require("../db");

/**
 * Settlement Service - Handles trade settlement and clearing
 * Supports T+0, T+1, T+2 settlement cycles
 */

const SETTLEMENT_STATUS = {
  PENDING: "pending",
  PROCESSING: "processing",
  SETTLED: "settled",
  FAILED: "failed",
  CANCELLED: "cancelled",
  DISPUTED: "disputed",
};

const SETTLEMENT_TYPE = {
  TRADE: "trade",
  DIVIDEND: "dividend",
  INTEREST: "interest",
  REDEMPTION: "redemption",
  CORPORATE_ACTION: "corporate_action",
};

const SETTLEMENT_CYCLE = {
  T0: 0,
  T1: 1,
  T2: 2,
  T3: 3,
};

/**
 * Create settlement instruction
 */
const createSettlement = async (settlementData) => {
  const data = db.read();

  if (!data.settlements) {
    data.settlements = [];
  }

  const tradeDate = settlementData.tradeDate || new Date().toISOString();
  const cycle = settlementData.cycle || SETTLEMENT_CYCLE.T2;
  const settlementDate = calculateSettlementDate(tradeDate, cycle);

  const settlement = {
    id: uuidv4(),
    type: settlementData.type || SETTLEMENT_TYPE.TRADE,
    tradeId: settlementData.tradeId || null,
    buyerId: settlementData.buyerId,
    sellerId: settlementData.sellerId,
    asset: {
      type: settlementData.assetType,
      id: settlementData.assetId,
      symbol: settlementData.symbol,
      quantity: settlementData.quantity,
    },
    payment: {
      amount: settlementData.amount,
      currency: settlementData.currency || "USD",
      method: settlementData.paymentMethod || "wallet",
    },
    dates: {
      tradeDate,
      settlementDate,
      cycle,
    },
    status: SETTLEMENT_STATUS.PENDING,
    statusHistory: [
      {
        status: SETTLEMENT_STATUS.PENDING,
        timestamp: new Date().toISOString(),
      },
    ],
    instructions: {
      buyer: settlementData.buyerInstructions || null,
      seller: settlementData.sellerInstructions || null,
    },
    confirmations: {
      buyer: false,
      seller: false,
      custodian: false,
    },
    fees: {
      settlementFee: settlementData.settlementFee || 0,
      custodianFee: settlementData.custodianFee || 0,
      totalFees: (settlementData.settlementFee || 0) + (settlementData.custodianFee || 0),
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  data.settlements.push(settlement);
  db.write(data);

  return settlement;
};

/**
 * Calculate settlement date
 */
const calculateSettlementDate = (tradeDate, cycle) => {
  const date = new Date(tradeDate);
  let daysToAdd = cycle;

  // Skip weekends
  while (daysToAdd > 0) {
    date.setDate(date.getDate() + 1);
    const dayOfWeek = date.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      daysToAdd--;
    }
  }

  return date.toISOString();
};

/**
 * Get settlement by ID
 */
const getSettlementById = async (settlementId) => {
  const data = db.read();
  const settlement = (data.settlements || []).find((s) => s.id === settlementId);

  if (!settlement) {
    throw new Error("Settlement not found");
  }

  return settlement;
};

/**
 * Get settlements for user
 */
const getUserSettlements = async (userId, filters = {}) => {
  const data = db.read();
  let settlements = (data.settlements || []).filter(
    (s) => s.buyerId === userId || s.sellerId === userId
  );

  if (filters.status) {
    settlements = settlements.filter((s) => s.status === filters.status);
  }

  if (filters.type) {
    settlements = settlements.filter((s) => s.type === filters.type);
  }

  if (filters.role === "buyer") {
    settlements = settlements.filter((s) => s.buyerId === userId);
  } else if (filters.role === "seller") {
    settlements = settlements.filter((s) => s.sellerId === userId);
  }

  if (filters.startDate) {
    settlements = settlements.filter(
      (s) => new Date(s.dates.tradeDate) >= new Date(filters.startDate)
    );
  }

  if (filters.endDate) {
    settlements = settlements.filter(
      (s) => new Date(s.dates.tradeDate) <= new Date(filters.endDate)
    );
  }

  // Sort by settlement date
  settlements.sort((a, b) => new Date(a.dates.settlementDate) - new Date(b.dates.settlementDate));

  return settlements;
};

/**
 * Update settlement status
 */
const updateSettlementStatus = async (settlementId, newStatus, reason = null) => {
  const data = db.read();
  const index = (data.settlements || []).findIndex((s) => s.id === settlementId);

  if (index === -1) {
    throw new Error("Settlement not found");
  }

  if (!Object.values(SETTLEMENT_STATUS).includes(newStatus)) {
    throw new Error("Invalid settlement status");
  }

  const settlement = data.settlements[index];

  settlement.status = newStatus;
  settlement.statusHistory.push({
    status: newStatus,
    reason,
    timestamp: new Date().toISOString(),
  });
  settlement.updatedAt = new Date().toISOString();

  if (newStatus === SETTLEMENT_STATUS.SETTLED) {
    settlement.settledAt = new Date().toISOString();
  }

  data.settlements[index] = settlement;
  db.write(data);

  return settlement;
};

/**
 * Confirm settlement (buyer/seller/custodian)
 */
const confirmSettlement = async (settlementId, party, userId) => {
  const data = db.read();
  const index = (data.settlements || []).findIndex((s) => s.id === settlementId);

  if (index === -1) {
    throw new Error("Settlement not found");
  }

  const settlement = data.settlements[index];

  // Verify party authorization
  if (party === "buyer" && settlement.buyerId !== userId) {
    throw new Error("Unauthorized to confirm as buyer");
  }
  if (party === "seller" && settlement.sellerId !== userId) {
    throw new Error("Unauthorized to confirm as seller");
  }

  settlement.confirmations[party] = true;
  settlement.confirmations[`${party}ConfirmedAt`] = new Date().toISOString();
  settlement.updatedAt = new Date().toISOString();

  // Check if all confirmations received
  const allConfirmed =
    settlement.confirmations.buyer &&
    settlement.confirmations.seller &&
    (settlement.type !== SETTLEMENT_TYPE.TRADE || settlement.confirmations.custodian);

  if (allConfirmed && settlement.status === SETTLEMENT_STATUS.PENDING) {
    settlement.status = SETTLEMENT_STATUS.PROCESSING;
    settlement.statusHistory.push({
      status: SETTLEMENT_STATUS.PROCESSING,
      reason: "All parties confirmed",
      timestamp: new Date().toISOString(),
    });
  }

  data.settlements[index] = settlement;
  db.write(data);

  return settlement;
};

/**
 * Process pending settlements
 */
const processPendingSettlements = async () => {
  const data = db.read();
  const now = new Date();
  let processedCount = 0;
  let failedCount = 0;

  const pendingSettlements = (data.settlements || []).filter(
    (s) =>
      s.status === SETTLEMENT_STATUS.PROCESSING &&
      new Date(s.dates.settlementDate) <= now
  );

  for (const settlement of pendingSettlements) {
    const index = data.settlements.findIndex((s) => s.id === settlement.id);

    // Verify balances and complete settlement (mock)
    const settlementResult = await executeSettlement(settlement);

    if (settlementResult.success) {
      settlement.status = SETTLEMENT_STATUS.SETTLED;
      settlement.settledAt = new Date().toISOString();
      settlement.settlementDetails = settlementResult.details;
      processedCount++;
    } else {
      settlement.status = SETTLEMENT_STATUS.FAILED;
      settlement.failureReason = settlementResult.error;
      failedCount++;
    }

    settlement.statusHistory.push({
      status: settlement.status,
      reason: settlementResult.success ? "Settlement completed" : settlementResult.error,
      timestamp: new Date().toISOString(),
    });
    settlement.updatedAt = new Date().toISOString();

    data.settlements[index] = settlement;
  }

  if (pendingSettlements.length > 0) {
    db.write(data);
  }

  return {
    processed: processedCount,
    failed: failedCount,
    total: pendingSettlements.length,
  };
};

/**
 * Execute settlement (mock)
 */
const executeSettlement = async (settlement) => {
  // In production, this would:
  // 1. Verify buyer has sufficient funds
  // 2. Verify seller has the assets
  // 3. Transfer funds from buyer to seller
  // 4. Transfer assets from seller to buyer
  // 5. Update ownership records

  // Mock implementation - 98% success rate
  if (Math.random() < 0.98) {
    return {
      success: true,
      details: {
        fundsTransferred: settlement.payment.amount,
        assetsTransferred: settlement.asset.quantity,
        executedAt: new Date().toISOString(),
        transactionId: `STL-${Date.now()}`,
      },
    };
  }

  return {
    success: false,
    error: "Insufficient funds or assets",
  };
};

/**
 * Get settlement queue
 */
const getSettlementQueue = async (date = null) => {
  const data = db.read();
  const targetDate = date || new Date().toISOString().split("T")[0];

  const settlements = (data.settlements || []).filter(
    (s) =>
      s.dates.settlementDate.startsWith(targetDate) &&
      s.status !== SETTLEMENT_STATUS.SETTLED &&
      s.status !== SETTLEMENT_STATUS.CANCELLED
  );

  return {
    date: targetDate,
    total: settlements.length,
    pending: settlements.filter((s) => s.status === SETTLEMENT_STATUS.PENDING).length,
    processing: settlements.filter((s) => s.status === SETTLEMENT_STATUS.PROCESSING).length,
    failed: settlements.filter((s) => s.status === SETTLEMENT_STATUS.FAILED).length,
    settlements: settlements.map((s) => ({
      id: s.id,
      type: s.type,
      symbol: s.asset.symbol,
      quantity: s.asset.quantity,
      amount: s.payment.amount,
      status: s.status,
      settlementDate: s.dates.settlementDate,
    })),
  };
};

/**
 * Get settlement statistics
 */
const getSettlementStatistics = async (period = "30d") => {
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

  const settlements = (data.settlements || []).filter(
    (s) => new Date(s.createdAt) >= startDate
  );

  const settled = settlements.filter((s) => s.status === SETTLEMENT_STATUS.SETTLED);
  const failed = settlements.filter((s) => s.status === SETTLEMENT_STATUS.FAILED);

  const totalValue = settled.reduce((sum, s) => sum + s.payment.amount, 0);
  const totalFees = settled.reduce((sum, s) => sum + s.fees.totalFees, 0);

  // Calculate average settlement time
  const settlementTimes = settled
    .filter((s) => s.settledAt && s.createdAt)
    .map((s) => new Date(s.settledAt) - new Date(s.createdAt));

  const avgSettlementTime =
    settlementTimes.length > 0
      ? settlementTimes.reduce((a, b) => a + b, 0) / settlementTimes.length
      : 0;

  return {
    period,
    total: settlements.length,
    settled: settled.length,
    pending: settlements.filter((s) => s.status === SETTLEMENT_STATUS.PENDING).length,
    processing: settlements.filter((s) => s.status === SETTLEMENT_STATUS.PROCESSING).length,
    failed: failed.length,
    settlementRate: settlements.length > 0 ? (settled.length / settlements.length) * 100 : 0,
    failureRate: settlements.length > 0 ? (failed.length / settlements.length) * 100 : 0,
    totalValue,
    totalFees,
    averageSettlementTimeMs: avgSettlementTime,
    averageSettlementTimeHours: avgSettlementTime / (1000 * 60 * 60),
  };
};

/**
 * Cancel settlement
 */
const cancelSettlement = async (settlementId, reason) => {
  const data = db.read();
  const index = (data.settlements || []).findIndex((s) => s.id === settlementId);

  if (index === -1) {
    throw new Error("Settlement not found");
  }

  const settlement = data.settlements[index];

  if (settlement.status === SETTLEMENT_STATUS.SETTLED) {
    throw new Error("Cannot cancel settled settlement");
  }

  settlement.status = SETTLEMENT_STATUS.CANCELLED;
  settlement.cancellationReason = reason;
  settlement.cancelledAt = new Date().toISOString();
  settlement.statusHistory.push({
    status: SETTLEMENT_STATUS.CANCELLED,
    reason,
    timestamp: new Date().toISOString(),
  });
  settlement.updatedAt = new Date().toISOString();

  data.settlements[index] = settlement;
  db.write(data);

  return settlement;
};

/**
 * Get netting summary (for batch settlements)
 */
const getNettingSummary = async (date = null) => {
  const data = db.read();
  const targetDate = date || new Date().toISOString().split("T")[0];

  const settlements = (data.settlements || []).filter(
    (s) =>
      s.dates.settlementDate.startsWith(targetDate) &&
      s.status === SETTLEMENT_STATUS.PENDING
  );

  // Calculate net positions per user
  const netPositions = {};

  settlements.forEach((s) => {
    // Buyer pays, receives assets
    if (!netPositions[s.buyerId]) {
      netPositions[s.buyerId] = { cashOut: 0, cashIn: 0, assets: {} };
    }
    netPositions[s.buyerId].cashOut += s.payment.amount;

    if (!netPositions[s.buyerId].assets[s.asset.symbol]) {
      netPositions[s.buyerId].assets[s.asset.symbol] = 0;
    }
    netPositions[s.buyerId].assets[s.asset.symbol] += s.asset.quantity;

    // Seller receives cash, delivers assets
    if (!netPositions[s.sellerId]) {
      netPositions[s.sellerId] = { cashOut: 0, cashIn: 0, assets: {} };
    }
    netPositions[s.sellerId].cashIn += s.payment.amount;

    if (!netPositions[s.sellerId].assets[s.asset.symbol]) {
      netPositions[s.sellerId].assets[s.asset.symbol] = 0;
    }
    netPositions[s.sellerId].assets[s.asset.symbol] -= s.asset.quantity;
  });

  return {
    date: targetDate,
    settlementCount: settlements.length,
    netPositions: Object.entries(netPositions).map(([userId, position]) => ({
      userId,
      netCash: position.cashIn - position.cashOut,
      assets: position.assets,
    })),
  };
};

module.exports = {
  SETTLEMENT_STATUS,
  SETTLEMENT_TYPE,
  SETTLEMENT_CYCLE,
  createSettlement,
  getSettlementById,
  getUserSettlements,
  updateSettlementStatus,
  confirmSettlement,
  processPendingSettlements,
  getSettlementQueue,
  getSettlementStatistics,
  cancelSettlement,
  getNettingSummary,
};
