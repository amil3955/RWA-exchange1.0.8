const { v4: uuidv4 } = require("uuid");
const db = require("../db");

/**
 * Insurance Service - Handles asset insurance and claims
 * Supports various insurance types for different asset classes
 */

const INSURANCE_TYPE = {
  ASSET: "asset",
  CUSTODY: "custody",
  TRANSACTION: "transaction",
  SMART_CONTRACT: "smart_contract",
  TITLE: "title",
  LIABILITY: "liability",
};

const POLICY_STATUS = {
  QUOTE: "quote",
  PENDING: "pending",
  ACTIVE: "active",
  EXPIRED: "expired",
  CANCELLED: "cancelled",
  CLAIMED: "claimed",
};

const CLAIM_STATUS = {
  SUBMITTED: "submitted",
  UNDER_REVIEW: "under_review",
  APPROVED: "approved",
  REJECTED: "rejected",
  PAID: "paid",
};

/**
 * Create insurance quote
 */
const createQuote = async (quoteData) => {
  const data = db.read();

  if (!data.insurancePolicies) {
    data.insurancePolicies = [];
  }

  // Calculate premium based on asset value and risk
  const premium = calculatePremium(quoteData);

  const quote = {
    id: uuidv4(),
    userId: quoteData.userId,
    type: quoteData.type || INSURANCE_TYPE.ASSET,
    coverage: {
      assetId: quoteData.assetId,
      assetType: quoteData.assetType,
      assetValue: quoteData.assetValue,
      coverageAmount: quoteData.coverageAmount || quoteData.assetValue,
      deductible: quoteData.deductible || quoteData.assetValue * 0.01,
    },
    terms: {
      startDate: quoteData.startDate || new Date().toISOString(),
      endDate: quoteData.endDate || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      periodMonths: quoteData.periodMonths || 12,
    },
    premium: {
      annual: premium.annual,
      monthly: premium.monthly,
      total: premium.total,
      currency: quoteData.currency || "USD",
    },
    risks: quoteData.risks || ["theft", "damage", "loss"],
    exclusions: quoteData.exclusions || [],
    status: POLICY_STATUS.QUOTE,
    validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  data.insurancePolicies.push(quote);
  db.write(data);

  return quote;
};

/**
 * Calculate insurance premium
 */
const calculatePremium = (quoteData) => {
  const baseRate = 0.015; // 1.5% base rate
  const assetValue = quoteData.assetValue || 0;

  // Risk multipliers
  let riskMultiplier = 1;

  switch (quoteData.assetType) {
    case "art":
    case "jewelry":
      riskMultiplier = 1.5;
      break;
    case "real_estate":
      riskMultiplier = 0.8;
      break;
    case "vehicle":
      riskMultiplier = 1.3;
      break;
    case "commodity":
      riskMultiplier = 0.9;
      break;
    default:
      riskMultiplier = 1;
  }

  // Coverage amount multiplier
  const coverageRatio = (quoteData.coverageAmount || assetValue) / assetValue;
  const coverageMultiplier = coverageRatio > 1 ? coverageRatio : 1;

  // Deductible discount
  const deductibleRate = (quoteData.deductible || assetValue * 0.01) / assetValue;
  const deductibleDiscount = 1 - deductibleRate * 2;

  const annualPremium =
    assetValue * baseRate * riskMultiplier * coverageMultiplier * Math.max(0.5, deductibleDiscount);

  const periodMonths = quoteData.periodMonths || 12;
  const totalPremium = (annualPremium / 12) * periodMonths;

  return {
    annual: Math.round(annualPremium * 100) / 100,
    monthly: Math.round((annualPremium / 12) * 100) / 100,
    total: Math.round(totalPremium * 100) / 100,
  };
};

/**
 * Purchase insurance policy
 */
const purchasePolicy = async (policyId, userId, paymentData) => {
  const data = db.read();
  const index = (data.insurancePolicies || []).findIndex(
    (p) => p.id === policyId && p.userId === userId
  );

  if (index === -1) {
    throw new Error("Policy not found or unauthorized");
  }

  const policy = data.insurancePolicies[index];

  if (policy.status !== POLICY_STATUS.QUOTE) {
    throw new Error("Policy is not a valid quote");
  }

  if (new Date(policy.validUntil) < new Date()) {
    throw new Error("Quote has expired");
  }

  policy.status = POLICY_STATUS.ACTIVE;
  policy.policyNumber = `POL-${Date.now()}-${Math.random().toString(36).substring(7).toUpperCase()}`;
  policy.payment = {
    method: paymentData.method,
    reference: paymentData.reference,
    amount: policy.premium.total,
    paidAt: new Date().toISOString(),
  };
  policy.terms.startDate = new Date().toISOString();
  policy.terms.endDate = new Date(
    Date.now() + policy.terms.periodMonths * 30 * 24 * 60 * 60 * 1000
  ).toISOString();
  policy.updatedAt = new Date().toISOString();

  data.insurancePolicies[index] = policy;
  db.write(data);

  return policy;
};

/**
 * Get policy by ID
 */
const getPolicyById = async (policyId) => {
  const data = db.read();
  const policy = (data.insurancePolicies || []).find((p) => p.id === policyId);

  if (!policy) {
    throw new Error("Policy not found");
  }

  return policy;
};

/**
 * Get user policies
 */
const getUserPolicies = async (userId, filters = {}) => {
  const data = db.read();
  let policies = (data.insurancePolicies || []).filter((p) => p.userId === userId);

  if (filters.status) {
    policies = policies.filter((p) => p.status === filters.status);
  }

  if (filters.type) {
    policies = policies.filter((p) => p.type === filters.type);
  }

  if (filters.assetId) {
    policies = policies.filter((p) => p.coverage.assetId === filters.assetId);
  }

  return policies;
};

/**
 * File insurance claim
 */
const fileClaim = async (policyId, userId, claimData) => {
  const data = db.read();
  const policyIndex = (data.insurancePolicies || []).findIndex(
    (p) => p.id === policyId && p.userId === userId
  );

  if (policyIndex === -1) {
    throw new Error("Policy not found or unauthorized");
  }

  const policy = data.insurancePolicies[policyIndex];

  if (policy.status !== POLICY_STATUS.ACTIVE) {
    throw new Error("Policy is not active");
  }

  if (!data.insuranceClaims) {
    data.insuranceClaims = [];
  }

  const claim = {
    id: uuidv4(),
    policyId,
    policyNumber: policy.policyNumber,
    userId,
    claimNumber: `CLM-${Date.now()}-${Math.random().toString(36).substring(7).toUpperCase()}`,
    incidentDate: claimData.incidentDate,
    incidentType: claimData.incidentType,
    description: claimData.description,
    claimedAmount: claimData.claimedAmount,
    evidence: claimData.evidence || [],
    status: CLAIM_STATUS.SUBMITTED,
    statusHistory: [
      {
        status: CLAIM_STATUS.SUBMITTED,
        timestamp: new Date().toISOString(),
      },
    ],
    assessment: null,
    payout: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  data.insuranceClaims.push(claim);
  db.write(data);

  return claim;
};

/**
 * Get claim by ID
 */
const getClaimById = async (claimId) => {
  const data = db.read();
  const claim = (data.insuranceClaims || []).find((c) => c.id === claimId);

  if (!claim) {
    throw new Error("Claim not found");
  }

  return claim;
};

/**
 * Get user claims
 */
const getUserClaims = async (userId, filters = {}) => {
  const data = db.read();
  let claims = (data.insuranceClaims || []).filter((c) => c.userId === userId);

  if (filters.status) {
    claims = claims.filter((c) => c.status === filters.status);
  }

  if (filters.policyId) {
    claims = claims.filter((c) => c.policyId === filters.policyId);
  }

  return claims;
};

/**
 * Update claim status
 */
const updateClaimStatus = async (claimId, newStatus, details = {}) => {
  const data = db.read();
  const index = (data.insuranceClaims || []).findIndex((c) => c.id === claimId);

  if (index === -1) {
    throw new Error("Claim not found");
  }

  const claim = data.insuranceClaims[index];

  claim.status = newStatus;
  claim.statusHistory.push({
    status: newStatus,
    details,
    timestamp: new Date().toISOString(),
  });

  if (newStatus === CLAIM_STATUS.APPROVED) {
    claim.assessment = {
      assessedBy: details.assessedBy,
      approvedAmount: details.approvedAmount,
      notes: details.notes,
      assessedAt: new Date().toISOString(),
    };
  }

  if (newStatus === CLAIM_STATUS.PAID) {
    claim.payout = {
      amount: details.amount,
      method: details.method,
      reference: details.reference,
      paidAt: new Date().toISOString(),
    };
  }

  if (newStatus === CLAIM_STATUS.REJECTED) {
    claim.rejection = {
      reason: details.reason,
      rejectedBy: details.rejectedBy,
      rejectedAt: new Date().toISOString(),
    };
  }

  claim.updatedAt = new Date().toISOString();
  data.insuranceClaims[index] = claim;
  db.write(data);

  return claim;
};

/**
 * Renew policy
 */
const renewPolicy = async (policyId, userId) => {
  const data = db.read();
  const index = (data.insurancePolicies || []).findIndex(
    (p) => p.id === policyId && p.userId === userId
  );

  if (index === -1) {
    throw new Error("Policy not found or unauthorized");
  }

  const policy = data.insurancePolicies[index];

  // Create renewal quote
  const renewalQuote = await createQuote({
    userId,
    type: policy.type,
    assetId: policy.coverage.assetId,
    assetType: policy.coverage.assetType,
    assetValue: policy.coverage.assetValue,
    coverageAmount: policy.coverage.coverageAmount,
    deductible: policy.coverage.deductible,
    periodMonths: policy.terms.periodMonths,
    risks: policy.risks,
    exclusions: policy.exclusions,
    startDate: policy.terms.endDate,
  });

  return renewalQuote;
};

/**
 * Cancel policy
 */
const cancelPolicy = async (policyId, userId, reason) => {
  const data = db.read();
  const index = (data.insurancePolicies || []).findIndex(
    (p) => p.id === policyId && p.userId === userId
  );

  if (index === -1) {
    throw new Error("Policy not found or unauthorized");
  }

  const policy = data.insurancePolicies[index];

  if (policy.status !== POLICY_STATUS.ACTIVE) {
    throw new Error("Only active policies can be cancelled");
  }

  // Calculate refund (pro-rated)
  const startDate = new Date(policy.terms.startDate);
  const endDate = new Date(policy.terms.endDate);
  const now = new Date();
  const totalDays = (endDate - startDate) / (24 * 60 * 60 * 1000);
  const usedDays = (now - startDate) / (24 * 60 * 60 * 1000);
  const remainingDays = totalDays - usedDays;
  const refundAmount = (policy.premium.total / totalDays) * remainingDays * 0.9; // 10% cancellation fee

  policy.status = POLICY_STATUS.CANCELLED;
  policy.cancellation = {
    reason,
    cancelledAt: new Date().toISOString(),
    refundAmount: Math.max(0, Math.round(refundAmount * 100) / 100),
  };
  policy.updatedAt = new Date().toISOString();

  data.insurancePolicies[index] = policy;
  db.write(data);

  return policy;
};

/**
 * Get insurance statistics
 */
const getInsuranceStatistics = async () => {
  const data = db.read();
  const policies = data.insurancePolicies || [];
  const claims = data.insuranceClaims || [];

  const activePolicies = policies.filter((p) => p.status === POLICY_STATUS.ACTIVE);
  const totalCoverage = activePolicies.reduce(
    (sum, p) => sum + p.coverage.coverageAmount,
    0
  );
  const totalPremiums = activePolicies.reduce((sum, p) => sum + p.premium.total, 0);

  const approvedClaims = claims.filter((c) => c.status === CLAIM_STATUS.APPROVED || c.status === CLAIM_STATUS.PAID);
  const totalPaidClaims = claims
    .filter((c) => c.status === CLAIM_STATUS.PAID)
    .reduce((sum, c) => sum + (c.payout?.amount || 0), 0);

  return {
    policies: {
      total: policies.length,
      active: activePolicies.length,
      totalCoverage,
      totalPremiums,
    },
    claims: {
      total: claims.length,
      pending: claims.filter((c) => c.status === CLAIM_STATUS.SUBMITTED || c.status === CLAIM_STATUS.UNDER_REVIEW).length,
      approved: approvedClaims.length,
      rejected: claims.filter((c) => c.status === CLAIM_STATUS.REJECTED).length,
      totalPaid: totalPaidClaims,
    },
    lossRatio: totalPremiums > 0 ? (totalPaidClaims / totalPremiums) * 100 : 0,
  };
};

module.exports = {
  INSURANCE_TYPE,
  POLICY_STATUS,
  CLAIM_STATUS,
  createQuote,
  calculatePremium,
  purchasePolicy,
  getPolicyById,
  getUserPolicies,
  fileClaim,
  getClaimById,
  getUserClaims,
  updateClaimStatus,
  renewPolicy,
  cancelPolicy,
  getInsuranceStatistics,
};
