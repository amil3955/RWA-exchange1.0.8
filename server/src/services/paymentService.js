const { v4: uuidv4 } = require("uuid");
const db = require("../db");

/**
 * Payment Service - Handles payment processing
 * Supports multiple payment methods and currencies
 */

const PAYMENT_METHOD = {
  CARD: "card",
  BANK_TRANSFER: "bank_transfer",
  WIRE: "wire",
  CRYPTO: "crypto",
  WALLET: "wallet",
  ACH: "ach",
  SEPA: "sepa",
};

const PAYMENT_STATUS = {
  PENDING: "pending",
  PROCESSING: "processing",
  COMPLETED: "completed",
  FAILED: "failed",
  CANCELLED: "cancelled",
  REFUNDED: "refunded",
  PARTIALLY_REFUNDED: "partially_refunded",
};

const PAYMENT_TYPE = {
  DEPOSIT: "deposit",
  WITHDRAWAL: "withdrawal",
  PURCHASE: "purchase",
  SALE: "sale",
  FEE: "fee",
  REFUND: "refund",
  DIVIDEND: "dividend",
  INTEREST: "interest",
};

/**
 * Create a payment
 */
const createPayment = async (userId, paymentData) => {
  const data = db.read();

  if (!data.payments) {
    data.payments = [];
  }

  const payment = {
    id: uuidv4(),
    userId,
    type: paymentData.type,
    method: paymentData.method,
    amount: paymentData.amount,
    currency: paymentData.currency || "USD",
    fee: paymentData.fee || 0,
    netAmount: paymentData.amount - (paymentData.fee || 0),
    exchangeRate: paymentData.exchangeRate || 1,
    description: paymentData.description || null,
    reference: paymentData.reference || uuidv4().substring(0, 8).toUpperCase(),
    source: {
      type: paymentData.sourceType || null,
      id: paymentData.sourceId || null,
      last4: paymentData.sourceLast4 || null,
    },
    destination: {
      type: paymentData.destinationType || null,
      id: paymentData.destinationId || null,
      last4: paymentData.destinationLast4 || null,
    },
    metadata: paymentData.metadata || {},
    status: PAYMENT_STATUS.PENDING,
    statusHistory: [
      {
        status: PAYMENT_STATUS.PENDING,
        timestamp: new Date().toISOString(),
      },
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  data.payments.push(payment);
  db.write(data);

  return payment;
};

/**
 * Get payment by ID
 */
const getPaymentById = async (paymentId) => {
  const data = db.read();
  const payment = (data.payments || []).find((p) => p.id === paymentId);

  if (!payment) {
    throw new Error("Payment not found");
  }

  return payment;
};

/**
 * Get payment by reference
 */
const getPaymentByReference = async (reference) => {
  const data = db.read();
  const payment = (data.payments || []).find((p) => p.reference === reference);

  return payment || null;
};

/**
 * Get user payments
 */
const getUserPayments = async (userId, filters = {}) => {
  const data = db.read();
  let payments = (data.payments || []).filter((p) => p.userId === userId);

  if (filters.type) {
    payments = payments.filter((p) => p.type === filters.type);
  }

  if (filters.method) {
    payments = payments.filter((p) => p.method === filters.method);
  }

  if (filters.status) {
    payments = payments.filter((p) => p.status === filters.status);
  }

  if (filters.startDate) {
    payments = payments.filter(
      (p) => new Date(p.createdAt) >= new Date(filters.startDate)
    );
  }

  if (filters.endDate) {
    payments = payments.filter(
      (p) => new Date(p.createdAt) <= new Date(filters.endDate)
    );
  }

  if (filters.minAmount) {
    payments = payments.filter((p) => p.amount >= filters.minAmount);
  }

  if (filters.maxAmount) {
    payments = payments.filter((p) => p.amount <= filters.maxAmount);
  }

  // Sort by date descending
  payments.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  // Pagination
  const page = filters.page || 1;
  const limit = filters.limit || 20;
  const startIndex = (page - 1) * limit;

  return {
    payments: payments.slice(startIndex, startIndex + limit),
    total: payments.length,
    page,
    totalPages: Math.ceil(payments.length / limit),
  };
};

/**
 * Update payment status
 */
const updatePaymentStatus = async (paymentId, newStatus, reason = null) => {
  const data = db.read();
  const index = (data.payments || []).findIndex((p) => p.id === paymentId);

  if (index === -1) {
    throw new Error("Payment not found");
  }

  if (!Object.values(PAYMENT_STATUS).includes(newStatus)) {
    throw new Error("Invalid payment status");
  }

  const payment = data.payments[index];

  payment.status = newStatus;
  payment.statusHistory.push({
    status: newStatus,
    reason,
    timestamp: new Date().toISOString(),
  });
  payment.updatedAt = new Date().toISOString();

  if (newStatus === PAYMENT_STATUS.COMPLETED) {
    payment.completedAt = new Date().toISOString();
  }

  data.payments[index] = payment;
  db.write(data);

  return payment;
};

/**
 * Process payment (mock)
 */
const processPayment = async (paymentId) => {
  const data = db.read();
  const index = (data.payments || []).findIndex((p) => p.id === paymentId);

  if (index === -1) {
    throw new Error("Payment not found");
  }

  const payment = data.payments[index];

  if (payment.status !== PAYMENT_STATUS.PENDING) {
    throw new Error("Payment cannot be processed in current status");
  }

  // Update to processing
  payment.status = PAYMENT_STATUS.PROCESSING;
  payment.statusHistory.push({
    status: PAYMENT_STATUS.PROCESSING,
    timestamp: new Date().toISOString(),
  });

  // Simulate processing (in production, would call payment gateway)
  const success = Math.random() > 0.05; // 95% success rate

  if (success) {
    payment.status = PAYMENT_STATUS.COMPLETED;
    payment.completedAt = new Date().toISOString();
    payment.transactionId = `TXN-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  } else {
    payment.status = PAYMENT_STATUS.FAILED;
    payment.failureReason = "Payment declined by processor";
  }

  payment.statusHistory.push({
    status: payment.status,
    timestamp: new Date().toISOString(),
  });
  payment.updatedAt = new Date().toISOString();

  data.payments[index] = payment;
  db.write(data);

  return payment;
};

/**
 * Refund payment
 */
const refundPayment = async (paymentId, refundData = {}) => {
  const data = db.read();
  const index = (data.payments || []).findIndex((p) => p.id === paymentId);

  if (index === -1) {
    throw new Error("Payment not found");
  }

  const payment = data.payments[index];

  if (payment.status !== PAYMENT_STATUS.COMPLETED) {
    throw new Error("Only completed payments can be refunded");
  }

  const refundAmount = refundData.amount || payment.amount;

  if (refundAmount > payment.amount) {
    throw new Error("Refund amount cannot exceed payment amount");
  }

  // Create refund record
  const refund = {
    id: uuidv4(),
    originalPaymentId: paymentId,
    userId: payment.userId,
    amount: refundAmount,
    currency: payment.currency,
    reason: refundData.reason || null,
    status: PAYMENT_STATUS.COMPLETED,
    createdAt: new Date().toISOString(),
  };

  if (!data.refunds) {
    data.refunds = [];
  }
  data.refunds.push(refund);

  // Update original payment
  payment.status =
    refundAmount === payment.amount
      ? PAYMENT_STATUS.REFUNDED
      : PAYMENT_STATUS.PARTIALLY_REFUNDED;

  payment.refundedAmount = (payment.refundedAmount || 0) + refundAmount;
  payment.statusHistory.push({
    status: payment.status,
    reason: `Refunded ${refundAmount} ${payment.currency}`,
    timestamp: new Date().toISOString(),
  });
  payment.updatedAt = new Date().toISOString();

  data.payments[index] = payment;
  db.write(data);

  return { refund, payment };
};

/**
 * Get payment statistics
 */
const getPaymentStatistics = async (userId, period = "30d") => {
  const data = db.read();
  let payments = (data.payments || []).filter((p) => p.userId === userId);

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
    case "365d":
      startDate = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
      break;
    default:
      startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  }

  payments = payments.filter((p) => new Date(p.createdAt) >= startDate);

  const completed = payments.filter((p) => p.status === PAYMENT_STATUS.COMPLETED);

  const deposits = completed.filter((p) => p.type === PAYMENT_TYPE.DEPOSIT);
  const withdrawals = completed.filter((p) => p.type === PAYMENT_TYPE.WITHDRAWAL);

  return {
    userId,
    period,
    totalPayments: payments.length,
    completedPayments: completed.length,
    failedPayments: payments.filter((p) => p.status === PAYMENT_STATUS.FAILED).length,
    totalDeposited: deposits.reduce((sum, p) => sum + p.amount, 0),
    totalWithdrawn: withdrawals.reduce((sum, p) => sum + p.amount, 0),
    totalFees: completed.reduce((sum, p) => sum + (p.fee || 0), 0),
    averagePaymentAmount:
      completed.length > 0
        ? completed.reduce((sum, p) => sum + p.amount, 0) / completed.length
        : 0,
    byMethod: payments.reduce((acc, p) => {
      acc[p.method] = (acc[p.method] || 0) + 1;
      return acc;
    }, {}),
    byType: payments.reduce((acc, p) => {
      acc[p.type] = (acc[p.type] || 0) + 1;
      return acc;
    }, {}),
  };
};

/**
 * Calculate payment fees
 */
const calculateFees = (method, amount, currency = "USD") => {
  const feeStructure = {
    [PAYMENT_METHOD.CARD]: { percentage: 2.9, fixed: 0.3 },
    [PAYMENT_METHOD.BANK_TRANSFER]: { percentage: 0.5, fixed: 0 },
    [PAYMENT_METHOD.WIRE]: { percentage: 0, fixed: 25 },
    [PAYMENT_METHOD.CRYPTO]: { percentage: 1, fixed: 0 },
    [PAYMENT_METHOD.WALLET]: { percentage: 0, fixed: 0 },
    [PAYMENT_METHOD.ACH]: { percentage: 0.8, fixed: 0 },
    [PAYMENT_METHOD.SEPA]: { percentage: 0.3, fixed: 0.35 },
  };

  const fees = feeStructure[method] || { percentage: 0, fixed: 0 };
  const calculatedFee = (amount * fees.percentage) / 100 + fees.fixed;

  return {
    method,
    amount,
    currency,
    feePercentage: fees.percentage,
    fixedFee: fees.fixed,
    totalFee: Math.round(calculatedFee * 100) / 100,
    netAmount: Math.round((amount - calculatedFee) * 100) / 100,
  };
};

/**
 * Get daily settlement summary
 */
const getDailySettlement = async (date = null) => {
  const data = db.read();
  const targetDate = date || new Date().toISOString().split("T")[0];

  const payments = (data.payments || []).filter(
    (p) =>
      p.status === PAYMENT_STATUS.COMPLETED &&
      p.completedAt &&
      p.completedAt.startsWith(targetDate)
  );

  const deposits = payments.filter((p) => p.type === PAYMENT_TYPE.DEPOSIT);
  const withdrawals = payments.filter((p) => p.type === PAYMENT_TYPE.WITHDRAWAL);

  return {
    date: targetDate,
    totalTransactions: payments.length,
    deposits: {
      count: deposits.length,
      total: deposits.reduce((sum, p) => sum + p.amount, 0),
    },
    withdrawals: {
      count: withdrawals.length,
      total: withdrawals.reduce((sum, p) => sum + p.amount, 0),
    },
    netSettlement:
      deposits.reduce((sum, p) => sum + p.amount, 0) -
      withdrawals.reduce((sum, p) => sum + p.amount, 0),
    totalFees: payments.reduce((sum, p) => sum + (p.fee || 0), 0),
    byMethod: payments.reduce((acc, p) => {
      if (!acc[p.method]) {
        acc[p.method] = { count: 0, amount: 0 };
      }
      acc[p.method].count++;
      acc[p.method].amount += p.amount;
      return acc;
    }, {}),
  };
};

/**
 * Validate payment method
 */
const validatePaymentMethod = async (userId, method, sourceId) => {
  const data = db.read();

  switch (method) {
    case PAYMENT_METHOD.CARD:
      const card = (data.cards || []).find(
        (c) => c.id === sourceId && c.holder_id === userId
      );
      if (!card) {
        return { valid: false, error: "Card not found" };
      }
      // Check expiry
      const now = new Date();
      if (
        card.exp_year < now.getFullYear() ||
        (card.exp_year === now.getFullYear() && card.exp_month < now.getMonth() + 1)
      ) {
        return { valid: false, error: "Card expired" };
      }
      return { valid: true, card };

    case PAYMENT_METHOD.BANK_TRANSFER:
    case PAYMENT_METHOD.ACH:
      const bank = (data.banks || []).find(
        (b) => b.id === sourceId && b.holder_id === userId
      );
      if (!bank) {
        return { valid: false, error: "Bank account not found" };
      }
      return { valid: true, bank };

    case PAYMENT_METHOD.WALLET:
      const wallet = (data.wallets || []).find(
        (w) => w.id === sourceId && w.userId === userId
      );
      if (!wallet) {
        return { valid: false, error: "Wallet not found" };
      }
      return { valid: true, wallet };

    default:
      return { valid: true };
  }
};

module.exports = {
  PAYMENT_METHOD,
  PAYMENT_STATUS,
  PAYMENT_TYPE,
  createPayment,
  getPaymentById,
  getPaymentByReference,
  getUserPayments,
  updatePaymentStatus,
  processPayment,
  refundPayment,
  getPaymentStatistics,
  calculateFees,
  getDailySettlement,
  validatePaymentMethod,
};
