const { v4: uuidv4 } = require("uuid");
const db = require("../db");

/**
 * Compliance Service - Handles regulatory compliance and AML
 * Supports transaction monitoring, sanctions screening, and regulatory reporting
 */

const COMPLIANCE_STATUS = {
  COMPLIANT: "compliant",
  NON_COMPLIANT: "non_compliant",
  PENDING_REVIEW: "pending_review",
  UNDER_INVESTIGATION: "under_investigation",
  CLEARED: "cleared",
  BLOCKED: "blocked",
};

const ALERT_SEVERITY = {
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
  CRITICAL: "critical",
};

const ALERT_TYPE = {
  TRANSACTION_PATTERN: "transaction_pattern",
  SANCTIONS_MATCH: "sanctions_match",
  PEP_MATCH: "pep_match",
  VELOCITY: "velocity",
  STRUCTURING: "structuring",
  LARGE_TRANSACTION: "large_transaction",
  UNUSUAL_BEHAVIOR: "unusual_behavior",
  GEOGRAPHIC_RISK: "geographic_risk",
  DOCUMENT_FRAUD: "document_fraud",
};

/**
 * Screen entity against sanctions lists
 */
const screenSanctions = async (entityData) => {
  const data = db.read();

  if (!data.sanctionsScreenings) {
    data.sanctionsScreenings = [];
  }

  // Mock sanctions lists checked
  const sanctionsLists = [
    "OFAC SDN",
    "UN Consolidated",
    "EU Consolidated",
    "UK HMT",
    "FATF",
    "Interpol",
  ];

  // Mock screening logic - in production, would call actual sanctions API
  const screening = {
    id: uuidv4(),
    entityType: entityData.type || "individual",
    entityId: entityData.entityId,
    name: entityData.name,
    dateOfBirth: entityData.dateOfBirth || null,
    nationality: entityData.nationality || null,
    address: entityData.address || null,
    listsChecked: sanctionsLists,
    results: {
      matchFound: false,
      potentialMatches: [],
      confidence: 0,
    },
    status: "clear",
    screenedAt: new Date().toISOString(),
  };

  // Simulate potential match (for demo)
  if (entityData.name && entityData.name.toLowerCase().includes("test")) {
    screening.results.potentialMatches.push({
      list: "OFAC SDN",
      matchedName: "Test Entity",
      matchScore: 75,
      matchType: "name_similarity",
    });
    screening.results.matchFound = true;
    screening.results.confidence = 75;
    screening.status = "potential_match";
  }

  data.sanctionsScreenings.push(screening);
  db.write(data);

  return screening;
};

/**
 * Monitor transaction for compliance
 */
const monitorTransaction = async (transactionData) => {
  const data = db.read();

  if (!data.complianceChecks) {
    data.complianceChecks = [];
  }

  const alerts = [];
  const rules = getComplianceRules();

  // Check each rule
  rules.forEach((rule) => {
    const result = evaluateRule(rule, transactionData, data);
    if (result.triggered) {
      alerts.push({
        id: uuidv4(),
        ruleId: rule.id,
        ruleName: rule.name,
        type: rule.type,
        severity: rule.severity,
        description: result.description,
        details: result.details,
        createdAt: new Date().toISOString(),
      });
    }
  });

  const complianceCheck = {
    id: uuidv4(),
    transactionId: transactionData.transactionId,
    userId: transactionData.userId,
    amount: transactionData.amount,
    currency: transactionData.currency,
    type: transactionData.type,
    alerts,
    status: alerts.length === 0 ? COMPLIANCE_STATUS.COMPLIANT : COMPLIANCE_STATUS.PENDING_REVIEW,
    riskScore: calculateRiskScore(alerts),
    checkedAt: new Date().toISOString(),
  };

  data.complianceChecks.push(complianceCheck);

  // Create alerts if any
  if (alerts.length > 0) {
    if (!data.complianceAlerts) {
      data.complianceAlerts = [];
    }
    alerts.forEach((alert) => {
      data.complianceAlerts.push({
        ...alert,
        transactionId: transactionData.transactionId,
        userId: transactionData.userId,
        status: "open",
        assignedTo: null,
        resolution: null,
      });
    });
  }

  db.write(data);

  return complianceCheck;
};

/**
 * Get compliance rules
 */
const getComplianceRules = () => {
  return [
    {
      id: "rule_large_tx",
      name: "Large Transaction",
      type: ALERT_TYPE.LARGE_TRANSACTION,
      severity: ALERT_SEVERITY.MEDIUM,
      threshold: 10000,
      condition: "amount_exceeds",
    },
    {
      id: "rule_velocity",
      name: "High Velocity",
      type: ALERT_TYPE.VELOCITY,
      severity: ALERT_SEVERITY.HIGH,
      threshold: 5,
      timeWindow: 3600000, // 1 hour
      condition: "tx_count_exceeds",
    },
    {
      id: "rule_structuring",
      name: "Potential Structuring",
      type: ALERT_TYPE.STRUCTURING,
      severity: ALERT_SEVERITY.HIGH,
      threshold: 9000,
      range: 500,
      condition: "amount_near_threshold",
    },
    {
      id: "rule_geographic",
      name: "High Risk Geography",
      type: ALERT_TYPE.GEOGRAPHIC_RISK,
      severity: ALERT_SEVERITY.MEDIUM,
      highRiskCountries: ["IR", "KP", "SY", "CU", "VE"],
      condition: "high_risk_country",
    },
  ];
};

/**
 * Evaluate compliance rule
 */
const evaluateRule = (rule, transaction, data) => {
  switch (rule.condition) {
    case "amount_exceeds":
      if (transaction.amount > rule.threshold) {
        return {
          triggered: true,
          description: `Transaction amount ${transaction.amount} exceeds threshold ${rule.threshold}`,
          details: { amount: transaction.amount, threshold: rule.threshold },
        };
      }
      break;

    case "tx_count_exceeds":
      const recentTxs = getRecentTransactions(
        transaction.userId,
        rule.timeWindow,
        data
      );
      if (recentTxs.length >= rule.threshold) {
        return {
          triggered: true,
          description: `User has ${recentTxs.length} transactions in the time window`,
          details: { count: recentTxs.length, threshold: rule.threshold },
        };
      }
      break;

    case "amount_near_threshold":
      if (
        transaction.amount >= rule.threshold - rule.range &&
        transaction.amount <= rule.threshold
      ) {
        return {
          triggered: true,
          description: `Transaction amount ${transaction.amount} is suspiciously close to reporting threshold`,
          details: { amount: transaction.amount, reportingThreshold: rule.threshold },
        };
      }
      break;

    case "high_risk_country":
      if (
        transaction.country &&
        rule.highRiskCountries.includes(transaction.country)
      ) {
        return {
          triggered: true,
          description: `Transaction involves high-risk country: ${transaction.country}`,
          details: { country: transaction.country },
        };
      }
      break;
  }

  return { triggered: false };
};

/**
 * Get recent transactions for velocity check
 */
const getRecentTransactions = (userId, timeWindow, data) => {
  const cutoff = Date.now() - timeWindow;
  return (data.transactions || []).filter(
    (t) => t.user_id === userId && new Date(t.createdAt).getTime() > cutoff
  );
};

/**
 * Calculate risk score from alerts
 */
const calculateRiskScore = (alerts) => {
  if (alerts.length === 0) return 0;

  const severityScores = {
    [ALERT_SEVERITY.LOW]: 10,
    [ALERT_SEVERITY.MEDIUM]: 25,
    [ALERT_SEVERITY.HIGH]: 50,
    [ALERT_SEVERITY.CRITICAL]: 100,
  };

  const totalScore = alerts.reduce(
    (sum, alert) => sum + (severityScores[alert.severity] || 10),
    0
  );

  return Math.min(totalScore, 100);
};

/**
 * Get compliance alerts
 */
const getAlerts = async (filters = {}) => {
  const data = db.read();
  let alerts = data.complianceAlerts || [];

  if (filters.status) {
    alerts = alerts.filter((a) => a.status === filters.status);
  }

  if (filters.severity) {
    alerts = alerts.filter((a) => a.severity === filters.severity);
  }

  if (filters.type) {
    alerts = alerts.filter((a) => a.type === filters.type);
  }

  if (filters.userId) {
    alerts = alerts.filter((a) => a.userId === filters.userId);
  }

  if (filters.assignedTo) {
    alerts = alerts.filter((a) => a.assignedTo === filters.assignedTo);
  }

  // Sort by severity and date
  alerts.sort((a, b) => {
    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
    if (severityDiff !== 0) return severityDiff;
    return new Date(b.createdAt) - new Date(a.createdAt);
  });

  return alerts;
};

/**
 * Update alert status
 */
const updateAlertStatus = async (alertId, statusUpdate) => {
  const data = db.read();
  const index = (data.complianceAlerts || []).findIndex((a) => a.id === alertId);

  if (index === -1) {
    throw new Error("Alert not found");
  }

  data.complianceAlerts[index] = {
    ...data.complianceAlerts[index],
    status: statusUpdate.status,
    assignedTo: statusUpdate.assignedTo || data.complianceAlerts[index].assignedTo,
    resolution: statusUpdate.resolution || data.complianceAlerts[index].resolution,
    updatedAt: new Date().toISOString(),
  };

  db.write(data);

  return data.complianceAlerts[index];
};

/**
 * Generate Suspicious Activity Report (SAR)
 */
const generateSAR = async (alertId, reportData) => {
  const data = db.read();

  if (!data.sarReports) {
    data.sarReports = [];
  }

  const alert = (data.complianceAlerts || []).find((a) => a.id === alertId);
  if (!alert) {
    throw new Error("Alert not found");
  }

  const sar = {
    id: uuidv4(),
    alertId,
    referenceNumber: `SAR-${Date.now()}`,
    filingType: reportData.filingType || "initial",
    subjectInfo: {
      type: reportData.subjectType,
      name: reportData.subjectName,
      address: reportData.subjectAddress,
      identifiers: reportData.identifiers || [],
    },
    suspiciousActivity: {
      type: alert.type,
      dateRange: {
        start: reportData.activityStartDate,
        end: reportData.activityEndDate,
      },
      amount: reportData.totalAmount,
      description: reportData.narrative,
    },
    reportingInstitution: {
      name: "RWA Exchange",
      identifier: "RWA-001",
      contactPerson: reportData.contactPerson,
    },
    status: "draft",
    filedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  data.sarReports.push(sar);
  db.write(data);

  return sar;
};

/**
 * File SAR report
 */
const fileSAR = async (sarId) => {
  const data = db.read();
  const index = (data.sarReports || []).findIndex((s) => s.id === sarId);

  if (index === -1) {
    throw new Error("SAR report not found");
  }

  data.sarReports[index].status = "filed";
  data.sarReports[index].filedAt = new Date().toISOString();
  data.sarReports[index].updatedAt = new Date().toISOString();

  db.write(data);

  return data.sarReports[index];
};

/**
 * Check user compliance status
 */
const checkUserCompliance = async (userId) => {
  const data = db.read();

  const openAlerts = (data.complianceAlerts || []).filter(
    (a) => a.userId === userId && a.status === "open"
  );

  const recentChecks = (data.complianceChecks || [])
    .filter((c) => c.userId === userId)
    .sort((a, b) => new Date(b.checkedAt) - new Date(a.checkedAt))
    .slice(0, 10);

  const avgRiskScore =
    recentChecks.length > 0
      ? recentChecks.reduce((sum, c) => sum + c.riskScore, 0) / recentChecks.length
      : 0;

  return {
    userId,
    status: openAlerts.length > 0 ? COMPLIANCE_STATUS.PENDING_REVIEW : COMPLIANCE_STATUS.COMPLIANT,
    openAlerts: openAlerts.length,
    averageRiskScore: avgRiskScore,
    lastChecked: recentChecks[0]?.checkedAt || null,
    restrictions: openAlerts.length > 3 ? ["withdrawal_blocked", "trading_limited"] : [],
  };
};

/**
 * Get compliance statistics
 */
const getComplianceStatistics = async () => {
  const data = db.read();

  const alerts = data.complianceAlerts || [];
  const checks = data.complianceChecks || [];
  const sarReports = data.sarReports || [];

  const today = new Date().toISOString().split("T")[0];
  const todayAlerts = alerts.filter((a) => a.createdAt.startsWith(today));
  const todayChecks = checks.filter((c) => c.checkedAt.startsWith(today));

  return {
    totalAlerts: alerts.length,
    openAlerts: alerts.filter((a) => a.status === "open").length,
    alertsBySeverity: {
      critical: alerts.filter((a) => a.severity === ALERT_SEVERITY.CRITICAL).length,
      high: alerts.filter((a) => a.severity === ALERT_SEVERITY.HIGH).length,
      medium: alerts.filter((a) => a.severity === ALERT_SEVERITY.MEDIUM).length,
      low: alerts.filter((a) => a.severity === ALERT_SEVERITY.LOW).length,
    },
    totalChecks: checks.length,
    sarReports: {
      total: sarReports.length,
      pending: sarReports.filter((s) => s.status === "draft").length,
      filed: sarReports.filter((s) => s.status === "filed").length,
    },
    today: {
      alerts: todayAlerts.length,
      checks: todayChecks.length,
    },
  };
};

/**
 * Block user transactions
 */
const blockUser = async (userId, reason) => {
  const data = db.read();

  if (!data.blockedUsers) {
    data.blockedUsers = [];
  }

  const existing = data.blockedUsers.find((b) => b.userId === userId);
  if (existing) {
    throw new Error("User is already blocked");
  }

  const block = {
    id: uuidv4(),
    userId,
    reason,
    blockedAt: new Date().toISOString(),
    blockedBy: "compliance_system",
  };

  data.blockedUsers.push(block);
  db.write(data);

  return block;
};

/**
 * Unblock user
 */
const unblockUser = async (userId, reason) => {
  const data = db.read();

  const index = (data.blockedUsers || []).findIndex((b) => b.userId === userId);
  if (index === -1) {
    throw new Error("User is not blocked");
  }

  const unblockRecord = {
    ...data.blockedUsers[index],
    unblockedAt: new Date().toISOString(),
    unblockReason: reason,
  };

  data.blockedUsers.splice(index, 1);

  if (!data.unblockHistory) {
    data.unblockHistory = [];
  }
  data.unblockHistory.push(unblockRecord);

  db.write(data);

  return { success: true, message: "User unblocked successfully" };
};

/**
 * Check if user is blocked
 */
const isUserBlocked = async (userId) => {
  const data = db.read();
  const blocked = (data.blockedUsers || []).find((b) => b.userId === userId);

  return {
    blocked: !!blocked,
    reason: blocked?.reason || null,
    blockedAt: blocked?.blockedAt || null,
  };
};

module.exports = {
  COMPLIANCE_STATUS,
  ALERT_SEVERITY,
  ALERT_TYPE,
  screenSanctions,
  monitorTransaction,
  getComplianceRules,
  getAlerts,
  updateAlertStatus,
  generateSAR,
  fileSAR,
  checkUserCompliance,
  getComplianceStatistics,
  blockUser,
  unblockUser,
  isUserBlocked,
};
