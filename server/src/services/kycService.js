const { v4: uuidv4 } = require("uuid");
const db = require("../db");

/**
 * KYC Service - Handles Know Your Customer verification
 * Supports individual and corporate verification
 */

const KYC_STATUS = {
  NOT_STARTED: "not_started",
  PENDING: "pending",
  IN_REVIEW: "in_review",
  APPROVED: "approved",
  REJECTED: "rejected",
  EXPIRED: "expired",
  SUSPENDED: "suspended",
};

const KYC_LEVEL = {
  NONE: 0,
  BASIC: 1,
  INTERMEDIATE: 2,
  ADVANCED: 3,
  INSTITUTIONAL: 4,
};

const DOCUMENT_TYPE = {
  PASSPORT: "passport",
  NATIONAL_ID: "national_id",
  DRIVERS_LICENSE: "drivers_license",
  RESIDENCE_PERMIT: "residence_permit",
  UTILITY_BILL: "utility_bill",
  BANK_STATEMENT: "bank_statement",
  TAX_RETURN: "tax_return",
  CORPORATE_REGISTRATION: "corporate_registration",
  ARTICLES_OF_INCORPORATION: "articles_of_incorporation",
  SHAREHOLDER_REGISTRY: "shareholder_registry",
  PROOF_OF_ADDRESS: "proof_of_address",
  SELFIE: "selfie",
};

const VERIFICATION_TYPE = {
  INDIVIDUAL: "individual",
  CORPORATE: "corporate",
};

/**
 * Initialize KYC for a user
 */
const initializeKyc = async (userId, verificationType = VERIFICATION_TYPE.INDIVIDUAL) => {
  const data = db.read();

  if (!data.kycRecords) {
    data.kycRecords = [];
  }

  // Check if user already has KYC record
  const existing = data.kycRecords.find((k) => k.userId === userId);
  if (existing) {
    return existing;
  }

  const kycRecord = {
    id: uuidv4(),
    userId,
    verificationType,
    status: KYC_STATUS.NOT_STARTED,
    level: KYC_LEVEL.NONE,
    personalInfo: null,
    documents: [],
    verificationChecks: [],
    riskAssessment: null,
    notes: [],
    expiresAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  data.kycRecords.push(kycRecord);
  db.write(data);

  return kycRecord;
};

/**
 * Get KYC record by user ID
 */
const getKycByUserId = async (userId) => {
  const data = db.read();
  const kycRecord = (data.kycRecords || []).find((k) => k.userId === userId);

  return kycRecord || null;
};

/**
 * Get KYC record by ID
 */
const getKycById = async (kycId) => {
  const data = db.read();
  const kycRecord = (data.kycRecords || []).find((k) => k.id === kycId);

  if (!kycRecord) {
    throw new Error("KYC record not found");
  }

  return kycRecord;
};

/**
 * Submit personal information
 */
const submitPersonalInfo = async (userId, personalInfo) => {
  const data = db.read();
  const index = (data.kycRecords || []).findIndex((k) => k.userId === userId);

  if (index === -1) {
    throw new Error("KYC record not found. Please initialize KYC first.");
  }

  const kycRecord = data.kycRecords[index];

  kycRecord.personalInfo = {
    firstName: personalInfo.firstName,
    lastName: personalInfo.lastName,
    middleName: personalInfo.middleName || null,
    dateOfBirth: personalInfo.dateOfBirth,
    nationality: personalInfo.nationality,
    countryOfResidence: personalInfo.countryOfResidence,
    address: {
      street: personalInfo.street,
      city: personalInfo.city,
      state: personalInfo.state || null,
      postalCode: personalInfo.postalCode,
      country: personalInfo.country,
    },
    phone: personalInfo.phone,
    email: personalInfo.email,
    taxId: personalInfo.taxId || null,
    occupation: personalInfo.occupation || null,
    employer: personalInfo.employer || null,
    sourceOfFunds: personalInfo.sourceOfFunds || null,
    submittedAt: new Date().toISOString(),
  };

  kycRecord.status = KYC_STATUS.PENDING;
  kycRecord.updatedAt = new Date().toISOString();

  data.kycRecords[index] = kycRecord;
  db.write(data);

  return kycRecord;
};

/**
 * Submit corporate information
 */
const submitCorporateInfo = async (userId, corporateInfo) => {
  const data = db.read();
  const index = (data.kycRecords || []).findIndex((k) => k.userId === userId);

  if (index === -1) {
    throw new Error("KYC record not found. Please initialize KYC first.");
  }

  const kycRecord = data.kycRecords[index];

  kycRecord.corporateInfo = {
    companyName: corporateInfo.companyName,
    registrationNumber: corporateInfo.registrationNumber,
    incorporationDate: corporateInfo.incorporationDate,
    incorporationCountry: corporateInfo.incorporationCountry,
    legalStructure: corporateInfo.legalStructure,
    businessType: corporateInfo.businessType,
    industry: corporateInfo.industry,
    website: corporateInfo.website || null,
    registeredAddress: {
      street: corporateInfo.street,
      city: corporateInfo.city,
      state: corporateInfo.state || null,
      postalCode: corporateInfo.postalCode,
      country: corporateInfo.country,
    },
    directors: corporateInfo.directors || [],
    beneficialOwners: corporateInfo.beneficialOwners || [],
    authorizedSignatories: corporateInfo.authorizedSignatories || [],
    annualRevenue: corporateInfo.annualRevenue || null,
    employeeCount: corporateInfo.employeeCount || null,
    submittedAt: new Date().toISOString(),
  };

  kycRecord.status = KYC_STATUS.PENDING;
  kycRecord.verificationType = VERIFICATION_TYPE.CORPORATE;
  kycRecord.updatedAt = new Date().toISOString();

  data.kycRecords[index] = kycRecord;
  db.write(data);

  return kycRecord;
};

/**
 * Upload KYC document
 */
const uploadDocument = async (userId, documentData) => {
  const data = db.read();
  const index = (data.kycRecords || []).findIndex((k) => k.userId === userId);

  if (index === -1) {
    throw new Error("KYC record not found");
  }

  const document = {
    id: uuidv4(),
    type: documentData.type,
    documentNumber: documentData.documentNumber || null,
    issuingCountry: documentData.issuingCountry || null,
    issueDate: documentData.issueDate || null,
    expiryDate: documentData.expiryDate || null,
    frontUrl: documentData.frontUrl,
    backUrl: documentData.backUrl || null,
    status: "pending",
    verificationResult: null,
    uploadedAt: new Date().toISOString(),
  };

  data.kycRecords[index].documents.push(document);
  data.kycRecords[index].updatedAt = new Date().toISOString();
  db.write(data);

  return document;
};

/**
 * Verify document (admin action)
 */
const verifyDocument = async (kycId, documentId, verificationResult) => {
  const data = db.read();
  const kycIndex = (data.kycRecords || []).findIndex((k) => k.id === kycId);

  if (kycIndex === -1) {
    throw new Error("KYC record not found");
  }

  const docIndex = data.kycRecords[kycIndex].documents.findIndex(
    (d) => d.id === documentId
  );

  if (docIndex === -1) {
    throw new Error("Document not found");
  }

  data.kycRecords[kycIndex].documents[docIndex].status = verificationResult.approved
    ? "approved"
    : "rejected";
  data.kycRecords[kycIndex].documents[docIndex].verificationResult = {
    approved: verificationResult.approved,
    verifiedBy: verificationResult.verifiedBy,
    notes: verificationResult.notes || null,
    verifiedAt: new Date().toISOString(),
  };

  data.kycRecords[kycIndex].updatedAt = new Date().toISOString();
  db.write(data);

  return data.kycRecords[kycIndex].documents[docIndex];
};

/**
 * Run verification check
 */
const runVerificationCheck = async (kycId, checkType) => {
  const data = db.read();
  const kycIndex = (data.kycRecords || []).findIndex((k) => k.id === kycId);

  if (kycIndex === -1) {
    throw new Error("KYC record not found");
  }

  const check = {
    id: uuidv4(),
    type: checkType,
    status: "completed",
    result: {
      passed: Math.random() > 0.1, // Mock: 90% pass rate
      score: Math.floor(70 + Math.random() * 30),
      details: {},
    },
    performedAt: new Date().toISOString(),
  };

  // Add specific details based on check type
  switch (checkType) {
    case "identity":
      check.result.details = {
        nameMatch: true,
        dobMatch: true,
        addressMatch: Math.random() > 0.2,
      };
      break;
    case "sanctions":
      check.result.details = {
        sanctionsListChecked: ["OFAC", "UN", "EU"],
        matchesFound: 0,
      };
      break;
    case "pep":
      check.result.details = {
        isPep: false,
        relatedToPep: false,
      };
      break;
    case "aml":
      check.result.details = {
        riskLevel: "low",
        suspiciousActivity: false,
      };
      break;
    case "document":
      check.result.details = {
        authenticity: "verified",
        tampering: false,
        expired: false,
      };
      break;
  }

  data.kycRecords[kycIndex].verificationChecks.push(check);
  data.kycRecords[kycIndex].updatedAt = new Date().toISOString();
  db.write(data);

  return check;
};

/**
 * Update KYC status
 */
const updateKycStatus = async (kycId, newStatus, reason = null) => {
  const data = db.read();
  const index = (data.kycRecords || []).findIndex((k) => k.id === kycId);

  if (index === -1) {
    throw new Error("KYC record not found");
  }

  if (!Object.values(KYC_STATUS).includes(newStatus)) {
    throw new Error("Invalid KYC status");
  }

  const kycRecord = data.kycRecords[index];
  const previousStatus = kycRecord.status;

  kycRecord.status = newStatus;
  kycRecord.statusHistory = kycRecord.statusHistory || [];
  kycRecord.statusHistory.push({
    from: previousStatus,
    to: newStatus,
    reason,
    timestamp: new Date().toISOString(),
  });

  // Set expiry date if approved
  if (newStatus === KYC_STATUS.APPROVED) {
    kycRecord.approvedAt = new Date().toISOString();
    kycRecord.expiresAt = new Date(
      Date.now() + 365 * 24 * 60 * 60 * 1000
    ).toISOString(); // 1 year expiry
  }

  kycRecord.updatedAt = new Date().toISOString();
  data.kycRecords[index] = kycRecord;
  db.write(data);

  return kycRecord;
};

/**
 * Update KYC level
 */
const updateKycLevel = async (kycId, newLevel) => {
  const data = db.read();
  const index = (data.kycRecords || []).findIndex((k) => k.id === kycId);

  if (index === -1) {
    throw new Error("KYC record not found");
  }

  if (!Object.values(KYC_LEVEL).includes(newLevel)) {
    throw new Error("Invalid KYC level");
  }

  data.kycRecords[index].level = newLevel;
  data.kycRecords[index].updatedAt = new Date().toISOString();
  db.write(data);

  return data.kycRecords[index];
};

/**
 * Perform risk assessment
 */
const performRiskAssessment = async (kycId) => {
  const data = db.read();
  const kycIndex = (data.kycRecords || []).findIndex((k) => k.id === kycId);

  if (kycIndex === -1) {
    throw new Error("KYC record not found");
  }

  const kycRecord = data.kycRecords[kycIndex];

  // Calculate risk score based on various factors
  let riskScore = 0;
  const riskFactors = [];

  // Country risk
  const highRiskCountries = ["IR", "KP", "SY", "CU"];
  if (
    kycRecord.personalInfo?.countryOfResidence &&
    highRiskCountries.includes(kycRecord.personalInfo.countryOfResidence)
  ) {
    riskScore += 30;
    riskFactors.push("High-risk country of residence");
  }

  // PEP check
  const pepCheck = kycRecord.verificationChecks.find((c) => c.type === "pep");
  if (pepCheck?.result?.details?.isPep) {
    riskScore += 25;
    riskFactors.push("Politically exposed person");
  }

  // Occupation risk
  const highRiskOccupations = ["politician", "casino", "money_services"];
  if (
    kycRecord.personalInfo?.occupation &&
    highRiskOccupations.includes(kycRecord.personalInfo.occupation.toLowerCase())
  ) {
    riskScore += 15;
    riskFactors.push("High-risk occupation");
  }

  // Document verification failures
  const rejectedDocs = kycRecord.documents.filter((d) => d.status === "rejected");
  if (rejectedDocs.length > 0) {
    riskScore += 10 * rejectedDocs.length;
    riskFactors.push(`${rejectedDocs.length} rejected document(s)`);
  }

  const riskAssessment = {
    score: Math.min(riskScore, 100),
    level: riskScore < 25 ? "low" : riskScore < 50 ? "medium" : riskScore < 75 ? "high" : "critical",
    factors: riskFactors,
    recommendation:
      riskScore < 50 ? "approve" : riskScore < 75 ? "enhanced_due_diligence" : "reject",
    assessedAt: new Date().toISOString(),
  };

  data.kycRecords[kycIndex].riskAssessment = riskAssessment;
  data.kycRecords[kycIndex].updatedAt = new Date().toISOString();
  db.write(data);

  return riskAssessment;
};

/**
 * Add note to KYC record
 */
const addNote = async (kycId, noteContent, author) => {
  const data = db.read();
  const index = (data.kycRecords || []).findIndex((k) => k.id === kycId);

  if (index === -1) {
    throw new Error("KYC record not found");
  }

  const note = {
    id: uuidv4(),
    content: noteContent,
    author,
    createdAt: new Date().toISOString(),
  };

  data.kycRecords[index].notes.push(note);
  data.kycRecords[index].updatedAt = new Date().toISOString();
  db.write(data);

  return note;
};

/**
 * Check if KYC is valid
 */
const isKycValid = async (userId) => {
  const data = db.read();
  const kycRecord = (data.kycRecords || []).find((k) => k.userId === userId);

  if (!kycRecord) {
    return { valid: false, reason: "No KYC record found" };
  }

  if (kycRecord.status !== KYC_STATUS.APPROVED) {
    return { valid: false, reason: `KYC status is ${kycRecord.status}` };
  }

  if (kycRecord.expiresAt && new Date(kycRecord.expiresAt) < new Date()) {
    return { valid: false, reason: "KYC has expired" };
  }

  return { valid: true, level: kycRecord.level };
};

/**
 * Get KYC statistics (admin)
 */
const getKycStatistics = async () => {
  const data = db.read();
  const kycRecords = data.kycRecords || [];

  const stats = {
    total: kycRecords.length,
    byStatus: {},
    byLevel: {},
    pendingReview: 0,
    expiringThisMonth: 0,
  };

  const nextMonth = new Date();
  nextMonth.setMonth(nextMonth.getMonth() + 1);

  kycRecords.forEach((record) => {
    stats.byStatus[record.status] = (stats.byStatus[record.status] || 0) + 1;
    stats.byLevel[record.level] = (stats.byLevel[record.level] || 0) + 1;

    if (record.status === KYC_STATUS.IN_REVIEW) {
      stats.pendingReview++;
    }

    if (record.expiresAt && new Date(record.expiresAt) < nextMonth) {
      stats.expiringThisMonth++;
    }
  });

  return stats;
};

module.exports = {
  KYC_STATUS,
  KYC_LEVEL,
  DOCUMENT_TYPE,
  VERIFICATION_TYPE,
  initializeKyc,
  getKycByUserId,
  getKycById,
  submitPersonalInfo,
  submitCorporateInfo,
  uploadDocument,
  verifyDocument,
  runVerificationCheck,
  updateKycStatus,
  updateKycLevel,
  performRiskAssessment,
  addNote,
  isKycValid,
  getKycStatistics,
};
