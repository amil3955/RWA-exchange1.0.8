const { v4: uuidv4 } = require("uuid");
const db = require("../db");

/**
 * Escrow Service - Handles escrow accounts and transactions
 * Supports secure holding of funds and assets during transactions
 */

const ESCROW_STATUS = {
  CREATED: "created",
  FUNDED: "funded",
  PARTIALLY_FUNDED: "partially_funded",
  PENDING_RELEASE: "pending_release",
  RELEASED: "released",
  DISPUTED: "disputed",
  REFUNDED: "refunded",
  CANCELLED: "cancelled",
  EXPIRED: "expired",
};

const ESCROW_TYPE = {
  ASSET_PURCHASE: "asset_purchase",
  TOKEN_SALE: "token_sale",
  P2P_TRADE: "p2p_trade",
  SERVICE_PAYMENT: "service_payment",
  MILESTONE_BASED: "milestone_based",
};

/**
 * Create an escrow
 */
const createEscrow = async (escrowData) => {
  const data = db.read();

  if (!data.escrows) {
    data.escrows = [];
  }

  const escrow = {
    id: uuidv4(),
    type: escrowData.type || ESCROW_TYPE.ASSET_PURCHASE,
    buyerId: escrowData.buyerId,
    sellerId: escrowData.sellerId,
    description: escrowData.description,
    terms: {
      amount: escrowData.amount,
      currency: escrowData.currency || "USD",
      assetId: escrowData.assetId || null,
      assetQuantity: escrowData.assetQuantity || null,
      conditions: escrowData.conditions || [],
    },
    milestones: escrowData.milestones || [],
    funding: {
      required: escrowData.amount,
      received: 0,
      source: null,
    },
    fees: {
      escrowFee: escrowData.escrowFee || escrowData.amount * 0.01, // 1% default
      buyerFee: escrowData.buyerFee || 0,
      sellerFee: escrowData.sellerFee || 0,
    },
    timeline: {
      createdAt: new Date().toISOString(),
      fundingDeadline: escrowData.fundingDeadline || null,
      releaseDeadline: escrowData.releaseDeadline || null,
      expiresAt: escrowData.expiresAt || null,
    },
    status: ESCROW_STATUS.CREATED,
    statusHistory: [
      {
        status: ESCROW_STATUS.CREATED,
        timestamp: new Date().toISOString(),
      },
    ],
    transactions: [],
    dispute: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  data.escrows.push(escrow);
  db.write(data);

  return escrow;
};

/**
 * Get escrow by ID
 */
const getEscrowById = async (escrowId) => {
  const data = db.read();
  const escrow = (data.escrows || []).find((e) => e.id === escrowId);

  if (!escrow) {
    throw new Error("Escrow not found");
  }

  return escrow;
};

/**
 * Get user escrows
 */
const getUserEscrows = async (userId, filters = {}) => {
  const data = db.read();
  let escrows = (data.escrows || []).filter(
    (e) => e.buyerId === userId || e.sellerId === userId
  );

  if (filters.status) {
    escrows = escrows.filter((e) => e.status === filters.status);
  }

  if (filters.type) {
    escrows = escrows.filter((e) => e.type === filters.type);
  }

  if (filters.role === "buyer") {
    escrows = escrows.filter((e) => e.buyerId === userId);
  } else if (filters.role === "seller") {
    escrows = escrows.filter((e) => e.sellerId === userId);
  }

  // Sort by date descending
  escrows.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return escrows;
};

/**
 * Fund escrow
 */
const fundEscrow = async (escrowId, fundingData) => {
  const data = db.read();
  const index = (data.escrows || []).findIndex((e) => e.id === escrowId);

  if (index === -1) {
    throw new Error("Escrow not found");
  }

  const escrow = data.escrows[index];

  if (![ESCROW_STATUS.CREATED, ESCROW_STATUS.PARTIALLY_FUNDED].includes(escrow.status)) {
    throw new Error("Escrow cannot be funded in current status");
  }

  // Record funding transaction
  const transaction = {
    id: uuidv4(),
    type: "funding",
    amount: fundingData.amount,
    currency: escrow.terms.currency,
    fromUserId: fundingData.fromUserId,
    paymentMethod: fundingData.paymentMethod,
    paymentReference: fundingData.paymentReference || null,
    timestamp: new Date().toISOString(),
  };

  escrow.transactions.push(transaction);
  escrow.funding.received += fundingData.amount;
  escrow.funding.source = fundingData.paymentMethod;

  // Update status based on funding
  if (escrow.funding.received >= escrow.funding.required) {
    escrow.status = ESCROW_STATUS.FUNDED;
    escrow.timeline.fundedAt = new Date().toISOString();
  } else {
    escrow.status = ESCROW_STATUS.PARTIALLY_FUNDED;
  }

  escrow.statusHistory.push({
    status: escrow.status,
    amount: fundingData.amount,
    timestamp: new Date().toISOString(),
  });
  escrow.updatedAt = new Date().toISOString();

  data.escrows[index] = escrow;
  db.write(data);

  return escrow;
};

/**
 * Request release
 */
const requestRelease = async (escrowId, requesterId) => {
  const data = db.read();
  const index = (data.escrows || []).findIndex((e) => e.id === escrowId);

  if (index === -1) {
    throw new Error("Escrow not found");
  }

  const escrow = data.escrows[index];

  if (escrow.status !== ESCROW_STATUS.FUNDED) {
    throw new Error("Escrow must be fully funded before requesting release");
  }

  if (requesterId !== escrow.sellerId) {
    throw new Error("Only seller can request release");
  }

  escrow.status = ESCROW_STATUS.PENDING_RELEASE;
  escrow.releaseRequest = {
    requestedBy: requesterId,
    requestedAt: new Date().toISOString(),
    confirmedBy: null,
    confirmedAt: null,
  };

  escrow.statusHistory.push({
    status: ESCROW_STATUS.PENDING_RELEASE,
    requestedBy: requesterId,
    timestamp: new Date().toISOString(),
  });
  escrow.updatedAt = new Date().toISOString();

  data.escrows[index] = escrow;
  db.write(data);

  return escrow;
};

/**
 * Confirm and release escrow
 */
const releaseEscrow = async (escrowId, confirmerId) => {
  const data = db.read();
  const index = (data.escrows || []).findIndex((e) => e.id === escrowId);

  if (index === -1) {
    throw new Error("Escrow not found");
  }

  const escrow = data.escrows[index];

  if (escrow.status !== ESCROW_STATUS.PENDING_RELEASE) {
    throw new Error("Escrow is not pending release");
  }

  if (confirmerId !== escrow.buyerId) {
    throw new Error("Only buyer can confirm release");
  }

  // Calculate final amounts
  const sellerPayout = escrow.funding.received - escrow.fees.escrowFee - escrow.fees.sellerFee;

  // Record release transaction
  const transaction = {
    id: uuidv4(),
    type: "release",
    amount: sellerPayout,
    currency: escrow.terms.currency,
    toUserId: escrow.sellerId,
    timestamp: new Date().toISOString(),
  };

  escrow.transactions.push(transaction);
  escrow.status = ESCROW_STATUS.RELEASED;
  escrow.releaseRequest.confirmedBy = confirmerId;
  escrow.releaseRequest.confirmedAt = new Date().toISOString();
  escrow.timeline.releasedAt = new Date().toISOString();
  escrow.payout = {
    amount: sellerPayout,
    recipient: escrow.sellerId,
    releasedAt: new Date().toISOString(),
  };

  escrow.statusHistory.push({
    status: ESCROW_STATUS.RELEASED,
    confirmedBy: confirmerId,
    timestamp: new Date().toISOString(),
  });
  escrow.updatedAt = new Date().toISOString();

  data.escrows[index] = escrow;
  db.write(data);

  return escrow;
};

/**
 * Refund escrow
 */
const refundEscrow = async (escrowId, reason) => {
  const data = db.read();
  const index = (data.escrows || []).findIndex((e) => e.id === escrowId);

  if (index === -1) {
    throw new Error("Escrow not found");
  }

  const escrow = data.escrows[index];

  if ([ESCROW_STATUS.RELEASED, ESCROW_STATUS.REFUNDED].includes(escrow.status)) {
    throw new Error("Escrow cannot be refunded in current status");
  }

  const refundAmount = escrow.funding.received - escrow.fees.escrowFee;

  // Record refund transaction
  const transaction = {
    id: uuidv4(),
    type: "refund",
    amount: refundAmount,
    currency: escrow.terms.currency,
    toUserId: escrow.buyerId,
    reason,
    timestamp: new Date().toISOString(),
  };

  escrow.transactions.push(transaction);
  escrow.status = ESCROW_STATUS.REFUNDED;
  escrow.refund = {
    amount: refundAmount,
    recipient: escrow.buyerId,
    reason,
    refundedAt: new Date().toISOString(),
  };

  escrow.statusHistory.push({
    status: ESCROW_STATUS.REFUNDED,
    reason,
    timestamp: new Date().toISOString(),
  });
  escrow.updatedAt = new Date().toISOString();

  data.escrows[index] = escrow;
  db.write(data);

  return escrow;
};

/**
 * Open dispute
 */
const openDispute = async (escrowId, disputeData) => {
  const data = db.read();
  const index = (data.escrows || []).findIndex((e) => e.id === escrowId);

  if (index === -1) {
    throw new Error("Escrow not found");
  }

  const escrow = data.escrows[index];

  if (![ESCROW_STATUS.FUNDED, ESCROW_STATUS.PENDING_RELEASE].includes(escrow.status)) {
    throw new Error("Dispute cannot be opened in current status");
  }

  escrow.status = ESCROW_STATUS.DISPUTED;
  escrow.dispute = {
    id: uuidv4(),
    openedBy: disputeData.openedBy,
    reason: disputeData.reason,
    description: disputeData.description,
    evidence: disputeData.evidence || [],
    status: "open",
    openedAt: new Date().toISOString(),
    resolution: null,
  };

  escrow.statusHistory.push({
    status: ESCROW_STATUS.DISPUTED,
    openedBy: disputeData.openedBy,
    timestamp: new Date().toISOString(),
  });
  escrow.updatedAt = new Date().toISOString();

  data.escrows[index] = escrow;
  db.write(data);

  return escrow;
};

/**
 * Resolve dispute
 */
const resolveDispute = async (escrowId, resolutionData) => {
  const data = db.read();
  const index = (data.escrows || []).findIndex((e) => e.id === escrowId);

  if (index === -1) {
    throw new Error("Escrow not found");
  }

  const escrow = data.escrows[index];

  if (escrow.status !== ESCROW_STATUS.DISPUTED) {
    throw new Error("Escrow is not in disputed status");
  }

  escrow.dispute.status = "resolved";
  escrow.dispute.resolution = {
    decision: resolutionData.decision, // release_to_seller, refund_to_buyer, split
    splitRatio: resolutionData.splitRatio || null,
    reason: resolutionData.reason,
    resolvedBy: resolutionData.resolvedBy,
    resolvedAt: new Date().toISOString(),
  };

  // Execute resolution
  if (resolutionData.decision === "release_to_seller") {
    escrow.status = ESCROW_STATUS.RELEASED;
    escrow.payout = {
      amount: escrow.funding.received - escrow.fees.escrowFee,
      recipient: escrow.sellerId,
      releasedAt: new Date().toISOString(),
    };
  } else if (resolutionData.decision === "refund_to_buyer") {
    escrow.status = ESCROW_STATUS.REFUNDED;
    escrow.refund = {
      amount: escrow.funding.received - escrow.fees.escrowFee,
      recipient: escrow.buyerId,
      refundedAt: new Date().toISOString(),
    };
  } else if (resolutionData.decision === "split") {
    const buyerAmount =
      (escrow.funding.received - escrow.fees.escrowFee) * resolutionData.splitRatio.buyer;
    const sellerAmount =
      (escrow.funding.received - escrow.fees.escrowFee) * resolutionData.splitRatio.seller;

    escrow.status = ESCROW_STATUS.RELEASED;
    escrow.splitPayout = {
      buyer: { amount: buyerAmount, recipient: escrow.buyerId },
      seller: { amount: sellerAmount, recipient: escrow.sellerId },
      releasedAt: new Date().toISOString(),
    };
  }

  escrow.statusHistory.push({
    status: escrow.status,
    resolution: resolutionData.decision,
    timestamp: new Date().toISOString(),
  });
  escrow.updatedAt = new Date().toISOString();

  data.escrows[index] = escrow;
  db.write(data);

  return escrow;
};

/**
 * Complete milestone
 */
const completeMilestone = async (escrowId, milestoneId, completionData) => {
  const data = db.read();
  const index = (data.escrows || []).findIndex((e) => e.id === escrowId);

  if (index === -1) {
    throw new Error("Escrow not found");
  }

  const escrow = data.escrows[index];
  const milestoneIndex = escrow.milestones.findIndex((m) => m.id === milestoneId);

  if (milestoneIndex === -1) {
    throw new Error("Milestone not found");
  }

  escrow.milestones[milestoneIndex].status = "completed";
  escrow.milestones[milestoneIndex].completedAt = new Date().toISOString();
  escrow.milestones[milestoneIndex].completionEvidence = completionData.evidence || null;

  // Release milestone payment if buyer confirms
  if (completionData.confirmedByBuyer) {
    const milestoneAmount = escrow.milestones[milestoneIndex].amount;
    escrow.transactions.push({
      id: uuidv4(),
      type: "milestone_release",
      milestoneId,
      amount: milestoneAmount,
      toUserId: escrow.sellerId,
      timestamp: new Date().toISOString(),
    });
  }

  escrow.updatedAt = new Date().toISOString();
  data.escrows[index] = escrow;
  db.write(data);

  return escrow;
};

/**
 * Get escrow statistics
 */
const getEscrowStatistics = async () => {
  const data = db.read();
  const escrows = data.escrows || [];

  const totalValue = escrows.reduce((sum, e) => sum + e.terms.amount, 0);
  const activeValue = escrows
    .filter((e) =>
      [ESCROW_STATUS.FUNDED, ESCROW_STATUS.PENDING_RELEASE].includes(e.status)
    )
    .reduce((sum, e) => sum + e.funding.received, 0);

  return {
    total: escrows.length,
    byStatus: escrows.reduce((acc, e) => {
      acc[e.status] = (acc[e.status] || 0) + 1;
      return acc;
    }, {}),
    totalValue,
    activeValue,
    releasedValue: escrows
      .filter((e) => e.status === ESCROW_STATUS.RELEASED)
      .reduce((sum, e) => sum + e.funding.received, 0),
    refundedValue: escrows
      .filter((e) => e.status === ESCROW_STATUS.REFUNDED)
      .reduce((sum, e) => sum + e.funding.received, 0),
    disputeRate:
      escrows.length > 0
        ? (escrows.filter((e) => e.dispute !== null).length / escrows.length) * 100
        : 0,
  };
};

module.exports = {
  ESCROW_STATUS,
  ESCROW_TYPE,
  createEscrow,
  getEscrowById,
  getUserEscrows,
  fundEscrow,
  requestRelease,
  releaseEscrow,
  refundEscrow,
  openDispute,
  resolveDispute,
  completeMilestone,
  getEscrowStatistics,
};
