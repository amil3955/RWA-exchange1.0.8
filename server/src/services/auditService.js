const { v4: uuidv4 } = require("uuid");
const db = require("../db");

/**
 * Audit Service - Handles audit logging and compliance tracking
 * Provides comprehensive activity logging for regulatory compliance
 */

const AUDIT_ACTION = {
  CREATE: "create",
  READ: "read",
  UPDATE: "update",
  DELETE: "delete",
  LOGIN: "login",
  LOGOUT: "logout",
  FAILED_LOGIN: "failed_login",
  PASSWORD_CHANGE: "password_change",
  PERMISSION_CHANGE: "permission_change",
  EXPORT: "export",
  IMPORT: "import",
  APPROVE: "approve",
  REJECT: "reject",
  TRANSFER: "transfer",
  TRADE: "trade",
  WITHDRAWAL: "withdrawal",
  DEPOSIT: "deposit",
};

const AUDIT_CATEGORY = {
  AUTHENTICATION: "authentication",
  USER_MANAGEMENT: "user_management",
  ASSET_MANAGEMENT: "asset_management",
  TRADING: "trading",
  PAYMENT: "payment",
  KYC: "kyc",
  COMPLIANCE: "compliance",
  SYSTEM: "system",
  ADMIN: "admin",
  API: "api",
};

const AUDIT_SEVERITY = {
  INFO: "info",
  WARNING: "warning",
  ERROR: "error",
  CRITICAL: "critical",
};

/**
 * Create audit log entry
 */
const createAuditLog = async (auditData) => {
  const data = db.read();

  if (!data.auditLogs) {
    data.auditLogs = [];
  }

  const auditLog = {
    id: uuidv4(),
    userId: auditData.userId || null,
    action: auditData.action,
    category: auditData.category || AUDIT_CATEGORY.SYSTEM,
    severity: auditData.severity || AUDIT_SEVERITY.INFO,
    resource: {
      type: auditData.resourceType || null,
      id: auditData.resourceId || null,
      name: auditData.resourceName || null,
    },
    details: auditData.details || {},
    changes: auditData.changes || null, // For update actions: { before, after }
    metadata: {
      ipAddress: auditData.ipAddress || null,
      userAgent: auditData.userAgent || null,
      sessionId: auditData.sessionId || null,
      requestId: auditData.requestId || null,
      endpoint: auditData.endpoint || null,
      method: auditData.method || null,
    },
    result: {
      success: auditData.success !== false,
      errorCode: auditData.errorCode || null,
      errorMessage: auditData.errorMessage || null,
    },
    timestamp: new Date().toISOString(),
  };

  data.auditLogs.push(auditLog);

  // Keep only last 100,000 audit logs
  if (data.auditLogs.length > 100000) {
    data.auditLogs = data.auditLogs.slice(-100000);
  }

  db.write(data);

  return auditLog;
};

/**
 * Get audit logs with filters
 */
const getAuditLogs = async (filters = {}) => {
  const data = db.read();
  let logs = data.auditLogs || [];

  if (filters.userId) {
    logs = logs.filter((l) => l.userId === filters.userId);
  }

  if (filters.action) {
    logs = logs.filter((l) => l.action === filters.action);
  }

  if (filters.category) {
    logs = logs.filter((l) => l.category === filters.category);
  }

  if (filters.severity) {
    logs = logs.filter((l) => l.severity === filters.severity);
  }

  if (filters.resourceType) {
    logs = logs.filter((l) => l.resource.type === filters.resourceType);
  }

  if (filters.resourceId) {
    logs = logs.filter((l) => l.resource.id === filters.resourceId);
  }

  if (filters.success !== undefined) {
    logs = logs.filter((l) => l.result.success === filters.success);
  }

  if (filters.startDate) {
    logs = logs.filter((l) => new Date(l.timestamp) >= new Date(filters.startDate));
  }

  if (filters.endDate) {
    logs = logs.filter((l) => new Date(l.timestamp) <= new Date(filters.endDate));
  }

  if (filters.ipAddress) {
    logs = logs.filter((l) => l.metadata.ipAddress === filters.ipAddress);
  }

  if (filters.search) {
    const searchTerm = filters.search.toLowerCase();
    logs = logs.filter(
      (l) =>
        l.action.toLowerCase().includes(searchTerm) ||
        (l.resource.name && l.resource.name.toLowerCase().includes(searchTerm)) ||
        JSON.stringify(l.details).toLowerCase().includes(searchTerm)
    );
  }

  // Sort by timestamp descending
  logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  // Pagination
  const page = filters.page || 1;
  const limit = filters.limit || 50;
  const startIndex = (page - 1) * limit;

  return {
    logs: logs.slice(startIndex, startIndex + limit),
    total: logs.length,
    page,
    totalPages: Math.ceil(logs.length / limit),
  };
};

/**
 * Get audit log by ID
 */
const getAuditLogById = async (logId) => {
  const data = db.read();
  const log = (data.auditLogs || []).find((l) => l.id === logId);

  if (!log) {
    throw new Error("Audit log not found");
  }

  return log;
};

/**
 * Get user activity history
 */
const getUserActivity = async (userId, days = 30) => {
  const data = db.read();
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const logs = (data.auditLogs || [])
    .filter((l) => l.userId === userId && new Date(l.timestamp) >= startDate)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  // Group by day
  const byDay = {};
  logs.forEach((log) => {
    const day = log.timestamp.split("T")[0];
    if (!byDay[day]) {
      byDay[day] = [];
    }
    byDay[day].push(log);
  });

  // Get summary
  const actionCounts = {};
  const categoryCounts = {};

  logs.forEach((log) => {
    actionCounts[log.action] = (actionCounts[log.action] || 0) + 1;
    categoryCounts[log.category] = (categoryCounts[log.category] || 0) + 1;
  });

  return {
    userId,
    period: `${days} days`,
    totalActivities: logs.length,
    byDay,
    actionCounts,
    categoryCounts,
    recentActivity: logs.slice(0, 20),
  };
};

/**
 * Get security audit report
 */
const getSecurityAuditReport = async (startDate, endDate) => {
  const data = db.read();

  const start = new Date(startDate);
  const end = new Date(endDate);

  const logs = (data.auditLogs || []).filter(
    (l) => new Date(l.timestamp) >= start && new Date(l.timestamp) <= end
  );

  const securityLogs = logs.filter(
    (l) =>
      l.category === AUDIT_CATEGORY.AUTHENTICATION ||
      l.severity === AUDIT_SEVERITY.WARNING ||
      l.severity === AUDIT_SEVERITY.ERROR ||
      l.severity === AUDIT_SEVERITY.CRITICAL
  );

  const failedLogins = logs.filter((l) => l.action === AUDIT_ACTION.FAILED_LOGIN);
  const successfulLogins = logs.filter(
    (l) => l.action === AUDIT_ACTION.LOGIN && l.result.success
  );
  const passwordChanges = logs.filter((l) => l.action === AUDIT_ACTION.PASSWORD_CHANGE);
  const permissionChanges = logs.filter((l) => l.action === AUDIT_ACTION.PERMISSION_CHANGE);

  // Detect suspicious patterns
  const suspiciousActivity = [];

  // Multiple failed logins from same IP
  const failedLoginsByIP = {};
  failedLogins.forEach((l) => {
    if (l.metadata.ipAddress) {
      if (!failedLoginsByIP[l.metadata.ipAddress]) {
        failedLoginsByIP[l.metadata.ipAddress] = [];
      }
      failedLoginsByIP[l.metadata.ipAddress].push(l);
    }
  });

  Object.entries(failedLoginsByIP).forEach(([ip, attempts]) => {
    if (attempts.length >= 5) {
      suspiciousActivity.push({
        type: "multiple_failed_logins",
        ipAddress: ip,
        count: attempts.length,
        timestamps: attempts.map((a) => a.timestamp),
      });
    }
  });

  return {
    period: { startDate, endDate },
    summary: {
      totalEvents: logs.length,
      securityEvents: securityLogs.length,
      criticalEvents: logs.filter((l) => l.severity === AUDIT_SEVERITY.CRITICAL).length,
      failedLogins: failedLogins.length,
      successfulLogins: successfulLogins.length,
      passwordChanges: passwordChanges.length,
      permissionChanges: permissionChanges.length,
    },
    suspiciousActivity,
    criticalEvents: logs.filter((l) => l.severity === AUDIT_SEVERITY.CRITICAL),
  };
};

/**
 * Get compliance audit trail
 */
const getComplianceAuditTrail = async (resourceType, resourceId) => {
  const data = db.read();

  const logs = (data.auditLogs || [])
    .filter(
      (l) => l.resource.type === resourceType && l.resource.id === resourceId
    )
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  return {
    resourceType,
    resourceId,
    totalEvents: logs.length,
    timeline: logs.map((l) => ({
      id: l.id,
      action: l.action,
      userId: l.userId,
      changes: l.changes,
      timestamp: l.timestamp,
      success: l.result.success,
    })),
    firstEvent: logs[0]?.timestamp || null,
    lastEvent: logs[logs.length - 1]?.timestamp || null,
  };
};

/**
 * Export audit logs
 */
const exportAuditLogs = async (filters = {}, format = "json") => {
  const { logs } = await getAuditLogs({ ...filters, limit: 100000 });

  // Record export action
  await createAuditLog({
    action: AUDIT_ACTION.EXPORT,
    category: AUDIT_CATEGORY.ADMIN,
    resourceType: "audit_logs",
    details: {
      filters,
      format,
      count: logs.length,
    },
  });

  if (format === "csv") {
    // Convert to CSV format
    const headers = [
      "id",
      "timestamp",
      "userId",
      "action",
      "category",
      "severity",
      "resourceType",
      "resourceId",
      "success",
      "ipAddress",
    ];
    const rows = logs.map((l) =>
      [
        l.id,
        l.timestamp,
        l.userId || "",
        l.action,
        l.category,
        l.severity,
        l.resource.type || "",
        l.resource.id || "",
        l.result.success,
        l.metadata.ipAddress || "",
      ].join(",")
    );
    return [headers.join(","), ...rows].join("\n");
  }

  return logs;
};

/**
 * Get audit statistics
 */
const getAuditStatistics = async (period = "24h") => {
  const data = db.read();

  let startDate;
  switch (period) {
    case "1h":
      startDate = new Date(Date.now() - 60 * 60 * 1000);
      break;
    case "24h":
      startDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
      break;
    case "7d":
      startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      break;
    case "30d":
      startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      break;
    default:
      startDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
  }

  const logs = (data.auditLogs || []).filter(
    (l) => new Date(l.timestamp) >= startDate
  );

  const byAction = {};
  const byCategory = {};
  const bySeverity = {};
  const byHour = {};

  logs.forEach((l) => {
    byAction[l.action] = (byAction[l.action] || 0) + 1;
    byCategory[l.category] = (byCategory[l.category] || 0) + 1;
    bySeverity[l.severity] = (bySeverity[l.severity] || 0) + 1;

    const hour = l.timestamp.substring(0, 13);
    byHour[hour] = (byHour[hour] || 0) + 1;
  });

  const uniqueUsers = new Set(logs.filter((l) => l.userId).map((l) => l.userId));
  const uniqueIPs = new Set(
    logs.filter((l) => l.metadata.ipAddress).map((l) => l.metadata.ipAddress)
  );

  return {
    period,
    totalEvents: logs.length,
    successfulEvents: logs.filter((l) => l.result.success).length,
    failedEvents: logs.filter((l) => !l.result.success).length,
    uniqueUsers: uniqueUsers.size,
    uniqueIPs: uniqueIPs.size,
    byAction: Object.entries(byAction).sort((a, b) => b[1] - a[1]),
    byCategory,
    bySeverity,
    hourlyDistribution: Object.entries(byHour).sort((a, b) => a[0].localeCompare(b[0])),
  };
};

/**
 * Cleanup old audit logs
 */
const cleanupAuditLogs = async (retentionDays = 365) => {
  const data = db.read();
  const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

  const before = (data.auditLogs || []).length;
  data.auditLogs = (data.auditLogs || []).filter(
    (l) => new Date(l.timestamp) >= cutoffDate
  );

  const deleted = before - data.auditLogs.length;

  if (deleted > 0) {
    db.write(data);

    // Log the cleanup action
    await createAuditLog({
      action: AUDIT_ACTION.DELETE,
      category: AUDIT_CATEGORY.SYSTEM,
      resourceType: "audit_logs",
      details: {
        retentionDays,
        deletedCount: deleted,
        cutoffDate: cutoffDate.toISOString(),
      },
    });
  }

  return { deleted, remaining: data.auditLogs.length };
};

module.exports = {
  AUDIT_ACTION,
  AUDIT_CATEGORY,
  AUDIT_SEVERITY,
  createAuditLog,
  getAuditLogs,
  getAuditLogById,
  getUserActivity,
  getSecurityAuditReport,
  getComplianceAuditTrail,
  exportAuditLogs,
  getAuditStatistics,
  cleanupAuditLogs,
};
