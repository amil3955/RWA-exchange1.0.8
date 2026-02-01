const { v4: uuidv4 } = require("uuid");
const db = require("../db");

/**
 * Intellectual Property Service - Handles IP assets
 * Supports patents, trademarks, copyrights, trade secrets, and licenses
 */

const IP_TYPE = {
  PATENT: "patent",
  TRADEMARK: "trademark",
  COPYRIGHT: "copyright",
  TRADE_SECRET: "trade_secret",
  DESIGN_PATENT: "design_patent",
  UTILITY_MODEL: "utility_model",
  DOMAIN_NAME: "domain_name",
  SOFTWARE_LICENSE: "software_license",
};

const IP_STATUS = {
  PENDING: "pending",
  REGISTERED: "registered",
  GRANTED: "granted",
  ACTIVE: "active",
  EXPIRED: "expired",
  ABANDONED: "abandoned",
  OPPOSED: "opposed",
  CANCELLED: "cancelled",
};

/**
 * Create an IP asset
 */
const createIPAsset = async (ownerId, ipData) => {
  const data = db.read();

  if (!data.intellectualProperty) {
    data.intellectualProperty = [];
  }

  const ipAsset = {
    id: uuidv4(),
    ownerId,
    assetId: ipData.assetId || null,
    ipType: ipData.ipType,
    title: ipData.title,
    description: ipData.description,
    registration: {
      number: ipData.registrationNumber || null,
      applicationNumber: ipData.applicationNumber || null,
      filingDate: ipData.filingDate || null,
      registrationDate: ipData.registrationDate || null,
      expirationDate: ipData.expirationDate || null,
      jurisdiction: ipData.jurisdiction || null,
      office: ipData.registrationOffice || null,
    },
    classification: {
      classes: ipData.classes || [],
      category: ipData.category || null,
      field: ipData.technicalField || null,
    },
    ownership: {
      originalInventor: ipData.inventor || null,
      originalOwner: ipData.originalOwner || null,
      currentOwner: ownerId,
      assignmentHistory: ipData.assignmentHistory || [],
    },
    licensing: {
      licensable: ipData.licensable !== false,
      exclusiveLicenses: [],
      nonExclusiveLicenses: [],
      royaltyRate: ipData.royaltyRate || null,
      minimumGuarantee: ipData.minimumGuarantee || null,
    },
    valuation: {
      currentValue: ipData.currentValue || 0,
      currency: ipData.currency || "USD",
      valuationDate: ipData.valuationDate || null,
      valuationMethod: ipData.valuationMethod || null,
      incomeGenerated: 0,
    },
    maintenance: {
      nextFeeDate: ipData.nextMaintenanceFeeDate || null,
      feeAmount: ipData.maintenanceFeeAmount || null,
      feesPaid: [],
    },
    documents: ipData.documents || [],
    relatedIPs: ipData.relatedIPs || [],
    status: ipData.status || IP_STATUS.PENDING,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  data.intellectualProperty.push(ipAsset);
  db.write(data);

  return ipAsset;
};

/**
 * Get IP asset by ID
 */
const getIPById = async (ipId) => {
  const data = db.read();
  const ipAsset = (data.intellectualProperty || []).find((ip) => ip.id === ipId);

  if (!ipAsset) {
    throw new Error("IP asset not found");
  }

  return ipAsset;
};

/**
 * Get user IP assets
 */
const getUserIPs = async (ownerId, filters = {}) => {
  const data = db.read();
  let ips = (data.intellectualProperty || []).filter((ip) => ip.ownerId === ownerId);

  if (filters.ipType) {
    ips = ips.filter((ip) => ip.ipType === filters.ipType);
  }

  if (filters.status) {
    ips = ips.filter((ip) => ip.status === filters.status);
  }

  if (filters.jurisdiction) {
    ips = ips.filter((ip) => ip.registration.jurisdiction === filters.jurisdiction);
  }

  if (filters.expiringSoon) {
    const days = parseInt(filters.expiringSoon);
    const cutoff = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    ips = ips.filter(
      (ip) => ip.registration.expirationDate && new Date(ip.registration.expirationDate) <= cutoff
    );
  }

  return ips;
};

/**
 * Update IP asset
 */
const updateIPAsset = async (ipId, ownerId, updates) => {
  const data = db.read();
  const index = (data.intellectualProperty || []).findIndex(
    (ip) => ip.id === ipId && ip.ownerId === ownerId
  );

  if (index === -1) {
    throw new Error("IP asset not found or unauthorized");
  }

  const ipAsset = data.intellectualProperty[index];

  if (updates.title) ipAsset.title = updates.title;
  if (updates.description) ipAsset.description = updates.description;
  if (updates.status) ipAsset.status = updates.status;

  if (updates.registration) {
    ipAsset.registration = { ...ipAsset.registration, ...updates.registration };
  }

  if (updates.licensing) {
    ipAsset.licensing = { ...ipAsset.licensing, ...updates.licensing };
  }

  if (updates.documents) {
    ipAsset.documents = [...ipAsset.documents, ...updates.documents];
  }

  ipAsset.updatedAt = new Date().toISOString();
  data.intellectualProperty[index] = ipAsset;
  db.write(data);

  return ipAsset;
};

/**
 * Create license agreement
 */
const createLicense = async (ipId, licenseData) => {
  const data = db.read();
  const index = (data.intellectualProperty || []).findIndex((ip) => ip.id === ipId);

  if (index === -1) {
    throw new Error("IP asset not found");
  }

  const ipAsset = data.intellectualProperty[index];

  if (!ipAsset.licensing.licensable) {
    throw new Error("This IP is not available for licensing");
  }

  const license = {
    id: uuidv4(),
    licenseeId: licenseData.licenseeId,
    licenseeName: licenseData.licenseeName,
    type: licenseData.type || "non_exclusive", // exclusive, non_exclusive, sole
    territory: licenseData.territory || "worldwide",
    field: licenseData.fieldOfUse || null,
    terms: {
      startDate: licenseData.startDate || new Date().toISOString(),
      endDate: licenseData.endDate || null,
      renewable: licenseData.renewable || false,
      autoRenew: licenseData.autoRenew || false,
    },
    financial: {
      upfrontFee: licenseData.upfrontFee || 0,
      royaltyRate: licenseData.royaltyRate || ipAsset.licensing.royaltyRate || 0,
      royaltyBase: licenseData.royaltyBase || "net_sales",
      minimumGuarantee: licenseData.minimumGuarantee || 0,
      paymentFrequency: licenseData.paymentFrequency || "quarterly",
    },
    restrictions: licenseData.restrictions || [],
    sublicensing: licenseData.sublicensingAllowed || false,
    status: "active",
    payments: [],
    createdAt: new Date().toISOString(),
  };

  if (license.type === "exclusive") {
    ipAsset.licensing.exclusiveLicenses.push(license);
  } else {
    ipAsset.licensing.nonExclusiveLicenses.push(license);
  }

  ipAsset.updatedAt = new Date().toISOString();
  data.intellectualProperty[index] = ipAsset;
  db.write(data);

  return license;
};

/**
 * Record royalty payment
 */
const recordRoyaltyPayment = async (ipId, licenseId, paymentData) => {
  const data = db.read();
  const ipIndex = (data.intellectualProperty || []).findIndex((ip) => ip.id === ipId);

  if (ipIndex === -1) {
    throw new Error("IP asset not found");
  }

  const ipAsset = data.intellectualProperty[ipIndex];

  // Find license
  let license = ipAsset.licensing.exclusiveLicenses.find((l) => l.id === licenseId);
  if (!license) {
    license = ipAsset.licensing.nonExclusiveLicenses.find((l) => l.id === licenseId);
  }

  if (!license) {
    throw new Error("License not found");
  }

  const payment = {
    id: uuidv4(),
    period: paymentData.period,
    grossSales: paymentData.grossSales || 0,
    netSales: paymentData.netSales || 0,
    royaltyAmount: paymentData.royaltyAmount,
    paymentDate: paymentData.paymentDate || new Date().toISOString(),
    currency: paymentData.currency || "USD",
    invoiceNumber: paymentData.invoiceNumber || null,
    notes: paymentData.notes || null,
  };

  license.payments.push(payment);

  // Update income generated
  ipAsset.valuation.incomeGenerated += payment.royaltyAmount;

  ipAsset.updatedAt = new Date().toISOString();
  data.intellectualProperty[ipIndex] = ipAsset;
  db.write(data);

  return payment;
};

/**
 * Record maintenance fee payment
 */
const recordMaintenanceFee = async (ipId, feeData) => {
  const data = db.read();
  const index = (data.intellectualProperty || []).findIndex((ip) => ip.id === ipId);

  if (index === -1) {
    throw new Error("IP asset not found");
  }

  const fee = {
    id: uuidv4(),
    amount: feeData.amount,
    currency: feeData.currency || "USD",
    dueDate: feeData.dueDate,
    paidDate: feeData.paidDate || new Date().toISOString(),
    period: feeData.period || null,
    receiptNumber: feeData.receiptNumber || null,
  };

  data.intellectualProperty[index].maintenance.feesPaid.push(fee);
  data.intellectualProperty[index].updatedAt = new Date().toISOString();

  db.write(data);

  return fee;
};

/**
 * Update valuation
 */
const updateValuation = async (ipId, valuationData) => {
  const data = db.read();
  const index = (data.intellectualProperty || []).findIndex((ip) => ip.id === ipId);

  if (index === -1) {
    throw new Error("IP asset not found");
  }

  const ipAsset = data.intellectualProperty[index];

  // Record valuation history
  if (!ipAsset.valuationHistory) {
    ipAsset.valuationHistory = [];
  }

  ipAsset.valuationHistory.push({
    value: ipAsset.valuation.currentValue,
    date: ipAsset.valuation.valuationDate || ipAsset.updatedAt,
    method: ipAsset.valuation.valuationMethod,
  });

  ipAsset.valuation = {
    ...ipAsset.valuation,
    currentValue: valuationData.currentValue,
    valuationDate: new Date().toISOString(),
    valuationMethod: valuationData.method || ipAsset.valuation.valuationMethod,
    appraiser: valuationData.appraiser || null,
    notes: valuationData.notes || null,
  };

  ipAsset.updatedAt = new Date().toISOString();
  data.intellectualProperty[index] = ipAsset;
  db.write(data);

  return ipAsset;
};

/**
 * Get portfolio summary
 */
const getPortfolioSummary = async (ownerId) => {
  const ips = await getUserIPs(ownerId);

  const totalValue = ips.reduce((sum, ip) => sum + (ip.valuation.currentValue || 0), 0);
  const totalIncome = ips.reduce((sum, ip) => sum + (ip.valuation.incomeGenerated || 0), 0);

  const activeLicenses = ips.reduce((sum, ip) => {
    const exclusive = ip.licensing.exclusiveLicenses.filter((l) => l.status === "active").length;
    const nonExclusive = ip.licensing.nonExclusiveLicenses.filter(
      (l) => l.status === "active"
    ).length;
    return sum + exclusive + nonExclusive;
  }, 0);

  const byType = {};
  const byStatus = {};
  const byJurisdiction = {};

  ips.forEach((ip) => {
    byType[ip.ipType] = (byType[ip.ipType] || 0) + 1;
    byStatus[ip.status] = (byStatus[ip.status] || 0) + 1;
    if (ip.registration.jurisdiction) {
      byJurisdiction[ip.registration.jurisdiction] =
        (byJurisdiction[ip.registration.jurisdiction] || 0) + 1;
    }
  });

  const expiringSoon = ips.filter((ip) => {
    if (!ip.registration.expirationDate) return false;
    const daysUntilExpiry =
      (new Date(ip.registration.expirationDate) - Date.now()) / (24 * 60 * 60 * 1000);
    return daysUntilExpiry <= 90 && daysUntilExpiry > 0;
  }).length;

  return {
    ownerId,
    totalIPs: ips.length,
    totalValue,
    totalIncomeGenerated: totalIncome,
    activeLicenses,
    expiringSoon,
    byType,
    byStatus,
    byJurisdiction,
  };
};

/**
 * Get upcoming deadlines
 */
const getUpcomingDeadlines = async (ownerId, days = 90) => {
  const ips = await getUserIPs(ownerId);
  const cutoff = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  const deadlines = [];

  ips.forEach((ip) => {
    // Expiration deadlines
    if (ip.registration.expirationDate) {
      const expDate = new Date(ip.registration.expirationDate);
      if (expDate <= cutoff && expDate > new Date()) {
        deadlines.push({
          ipId: ip.id,
          title: ip.title,
          type: "expiration",
          date: ip.registration.expirationDate,
          daysUntil: Math.ceil((expDate - Date.now()) / (24 * 60 * 60 * 1000)),
        });
      }
    }

    // Maintenance fee deadlines
    if (ip.maintenance.nextFeeDate) {
      const feeDate = new Date(ip.maintenance.nextFeeDate);
      if (feeDate <= cutoff && feeDate > new Date()) {
        deadlines.push({
          ipId: ip.id,
          title: ip.title,
          type: "maintenance_fee",
          date: ip.maintenance.nextFeeDate,
          amount: ip.maintenance.feeAmount,
          daysUntil: Math.ceil((feeDate - Date.now()) / (24 * 60 * 60 * 1000)),
        });
      }
    }
  });

  deadlines.sort((a, b) => new Date(a.date) - new Date(b.date));

  return deadlines;
};

/**
 * Get royalty income report
 */
const getRoyaltyReport = async (ownerId, year = null) => {
  const ips = await getUserIPs(ownerId);
  const targetYear = year || new Date().getFullYear();

  let totalRoyalties = 0;
  const byIP = {};
  const byQuarter = { Q1: 0, Q2: 0, Q3: 0, Q4: 0 };

  ips.forEach((ip) => {
    const allLicenses = [
      ...ip.licensing.exclusiveLicenses,
      ...ip.licensing.nonExclusiveLicenses,
    ];

    let ipRoyalties = 0;

    allLicenses.forEach((license) => {
      license.payments
        .filter((p) => new Date(p.paymentDate).getFullYear() === targetYear)
        .forEach((payment) => {
          ipRoyalties += payment.royaltyAmount;
          totalRoyalties += payment.royaltyAmount;

          const month = new Date(payment.paymentDate).getMonth();
          if (month < 3) byQuarter.Q1 += payment.royaltyAmount;
          else if (month < 6) byQuarter.Q2 += payment.royaltyAmount;
          else if (month < 9) byQuarter.Q3 += payment.royaltyAmount;
          else byQuarter.Q4 += payment.royaltyAmount;
        });
    });

    if (ipRoyalties > 0) {
      byIP[ip.title] = ipRoyalties;
    }
  });

  return {
    ownerId,
    year: targetYear,
    totalRoyalties,
    byIP: Object.entries(byIP).sort((a, b) => b[1] - a[1]),
    byQuarter,
  };
};

module.exports = {
  IP_TYPE,
  IP_STATUS,
  createIPAsset,
  getIPById,
  getUserIPs,
  updateIPAsset,
  createLicense,
  recordRoyaltyPayment,
  recordMaintenanceFee,
  updateValuation,
  getPortfolioSummary,
  getUpcomingDeadlines,
  getRoyaltyReport,
};
