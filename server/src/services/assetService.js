const { v4: uuidv4 } = require("uuid");
const db = require("../db");

/**
 * Asset Service - Handles Real World Asset management
 * Supports various asset types: real estate, commodities, art, bonds, equity, vehicles, IP
 */

const ASSET_STATUS = {
  DRAFT: "draft",
  PENDING_VERIFICATION: "pending_verification",
  VERIFIED: "verified",
  TOKENIZED: "tokenized",
  LISTED: "listed",
  SOLD: "sold",
  DELISTED: "delisted",
  SUSPENDED: "suspended",
};

const ASSET_TYPES = {
  REAL_ESTATE: "real_estate",
  COMMODITY: "commodity",
  ART: "art",
  BOND: "bond",
  EQUITY: "equity",
  VEHICLE: "vehicle",
  INTELLECTUAL_PROPERTY: "intellectual_property",
};

/**
 * Create a new asset
 */
const createAsset = async (ownerId, assetData) => {
  const data = db.read();

  if (!data.assets) {
    data.assets = [];
  }

  const asset = {
    id: uuidv4(),
    ownerId,
    name: assetData.name,
    description: assetData.description,
    type: assetData.type,
    category: assetData.category || null,
    location: assetData.location || null,
    valuation: {
      amount: assetData.valuationAmount || 0,
      currency: assetData.valuationCurrency || "USD",
      date: new Date().toISOString(),
      method: assetData.valuationMethod || "self_declared",
      appraiser: assetData.appraiser || null,
    },
    documents: [],
    images: assetData.images || [],
    metadata: assetData.metadata || {},
    status: ASSET_STATUS.DRAFT,
    tokenization: null,
    compliance: {
      kycVerified: false,
      amlCleared: false,
      regulatoryApproved: false,
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  data.assets.push(asset);
  db.write(data);

  return asset;
};

/**
 * Get asset by ID
 */
const getAssetById = async (assetId) => {
  const data = db.read();
  const asset = (data.assets || []).find((a) => a.id === assetId);

  if (!asset) {
    throw new Error("Asset not found");
  }

  return asset;
};

/**
 * Get all assets with optional filters
 */
const getAssets = async (filters = {}) => {
  const data = db.read();
  let assets = data.assets || [];

  if (filters.ownerId) {
    assets = assets.filter((a) => a.ownerId === filters.ownerId);
  }

  if (filters.type) {
    assets = assets.filter((a) => a.type === filters.type);
  }

  if (filters.status) {
    assets = assets.filter((a) => a.status === filters.status);
  }

  if (filters.minValuation) {
    assets = assets.filter(
      (a) => a.valuation.amount >= filters.minValuation
    );
  }

  if (filters.maxValuation) {
    assets = assets.filter(
      (a) => a.valuation.amount <= filters.maxValuation
    );
  }

  if (filters.category) {
    assets = assets.filter((a) => a.category === filters.category);
  }

  // Pagination
  const page = filters.page || 1;
  const limit = filters.limit || 20;
  const startIndex = (page - 1) * limit;
  const endIndex = startIndex + limit;

  return {
    assets: assets.slice(startIndex, endIndex),
    total: assets.length,
    page,
    totalPages: Math.ceil(assets.length / limit),
  };
};

/**
 * Update asset details
 */
const updateAsset = async (assetId, ownerId, updates) => {
  const data = db.read();
  const assetIndex = (data.assets || []).findIndex(
    (a) => a.id === assetId && a.ownerId === ownerId
  );

  if (assetIndex === -1) {
    throw new Error("Asset not found or unauthorized");
  }

  const asset = data.assets[assetIndex];

  // Prevent updates to tokenized/sold assets
  if ([ASSET_STATUS.TOKENIZED, ASSET_STATUS.SOLD].includes(asset.status)) {
    throw new Error("Cannot update tokenized or sold assets");
  }

  const allowedUpdates = [
    "name",
    "description",
    "category",
    "location",
    "images",
    "metadata",
  ];

  allowedUpdates.forEach((field) => {
    if (updates[field] !== undefined) {
      asset[field] = updates[field];
    }
  });

  asset.updatedAt = new Date().toISOString();
  data.assets[assetIndex] = asset;
  db.write(data);

  return asset;
};

/**
 * Update asset valuation
 */
const updateValuation = async (assetId, valuationData) => {
  const data = db.read();
  const assetIndex = (data.assets || []).findIndex((a) => a.id === assetId);

  if (assetIndex === -1) {
    throw new Error("Asset not found");
  }

  const asset = data.assets[assetIndex];

  asset.valuation = {
    ...asset.valuation,
    amount: valuationData.amount,
    currency: valuationData.currency || asset.valuation.currency,
    date: new Date().toISOString(),
    method: valuationData.method || "professional_appraisal",
    appraiser: valuationData.appraiser || null,
    report: valuationData.report || null,
  };

  asset.updatedAt = new Date().toISOString();
  data.assets[assetIndex] = asset;
  db.write(data);

  return asset;
};

/**
 * Add document to asset
 */
const addDocument = async (assetId, documentData) => {
  const data = db.read();
  const assetIndex = (data.assets || []).findIndex((a) => a.id === assetId);

  if (assetIndex === -1) {
    throw new Error("Asset not found");
  }

  const document = {
    id: uuidv4(),
    type: documentData.type,
    name: documentData.name,
    url: documentData.url,
    hash: documentData.hash || null,
    verified: false,
    uploadedAt: new Date().toISOString(),
  };

  data.assets[assetIndex].documents.push(document);
  data.assets[assetIndex].updatedAt = new Date().toISOString();
  db.write(data);

  return document;
};

/**
 * Update asset status
 */
const updateStatus = async (assetId, newStatus, reason = null) => {
  const data = db.read();
  const assetIndex = (data.assets || []).findIndex((a) => a.id === assetId);

  if (assetIndex === -1) {
    throw new Error("Asset not found");
  }

  if (!Object.values(ASSET_STATUS).includes(newStatus)) {
    throw new Error("Invalid asset status");
  }

  const asset = data.assets[assetIndex];
  const previousStatus = asset.status;

  asset.status = newStatus;
  asset.statusHistory = asset.statusHistory || [];
  asset.statusHistory.push({
    from: previousStatus,
    to: newStatus,
    reason,
    timestamp: new Date().toISOString(),
  });
  asset.updatedAt = new Date().toISOString();

  data.assets[assetIndex] = asset;
  db.write(data);

  return asset;
};

/**
 * Get asset statistics for owner
 */
const getOwnerStatistics = async (ownerId) => {
  const data = db.read();
  const assets = (data.assets || []).filter((a) => a.ownerId === ownerId);

  const stats = {
    totalAssets: assets.length,
    totalValuation: assets.reduce((sum, a) => sum + (a.valuation?.amount || 0), 0),
    byStatus: {},
    byType: {},
  };

  assets.forEach((asset) => {
    stats.byStatus[asset.status] = (stats.byStatus[asset.status] || 0) + 1;
    stats.byType[asset.type] = (stats.byType[asset.type] || 0) + 1;
  });

  return stats;
};

/**
 * Search assets by keyword
 */
const searchAssets = async (query, filters = {}) => {
  const data = db.read();
  let assets = (data.assets || []).filter(
    (a) => a.status === ASSET_STATUS.LISTED
  );

  if (query) {
    const searchTerm = query.toLowerCase();
    assets = assets.filter(
      (a) =>
        a.name.toLowerCase().includes(searchTerm) ||
        a.description.toLowerCase().includes(searchTerm) ||
        (a.category && a.category.toLowerCase().includes(searchTerm))
    );
  }

  if (filters.type) {
    assets = assets.filter((a) => a.type === filters.type);
  }

  return assets;
};

/**
 * Delete asset (soft delete)
 */
const deleteAsset = async (assetId, ownerId) => {
  const data = db.read();
  const assetIndex = (data.assets || []).findIndex(
    (a) => a.id === assetId && a.ownerId === ownerId
  );

  if (assetIndex === -1) {
    throw new Error("Asset not found or unauthorized");
  }

  const asset = data.assets[assetIndex];

  if (asset.status === ASSET_STATUS.TOKENIZED) {
    throw new Error("Cannot delete tokenized assets");
  }

  asset.status = ASSET_STATUS.DELISTED;
  asset.deletedAt = new Date().toISOString();
  asset.updatedAt = new Date().toISOString();

  data.assets[assetIndex] = asset;
  db.write(data);

  return { success: true, message: "Asset deleted successfully" };
};

/**
 * Get featured assets for marketplace
 */
const getFeaturedAssets = async (limit = 10) => {
  const data = db.read();
  const assets = (data.assets || [])
    .filter((a) => a.status === ASSET_STATUS.LISTED)
    .sort((a, b) => b.valuation.amount - a.valuation.amount)
    .slice(0, limit);

  return assets;
};

/**
 * Verify asset ownership
 */
const verifyOwnership = async (assetId, ownerId) => {
  const data = db.read();
  const asset = (data.assets || []).find((a) => a.id === assetId);

  if (!asset) {
    return { verified: false, reason: "Asset not found" };
  }

  return {
    verified: asset.ownerId === ownerId,
    reason: asset.ownerId === ownerId ? "Ownership verified" : "Not the owner",
  };
};

module.exports = {
  ASSET_STATUS,
  ASSET_TYPES,
  createAsset,
  getAssetById,
  getAssets,
  updateAsset,
  updateValuation,
  addDocument,
  updateStatus,
  getOwnerStatistics,
  searchAssets,
  deleteAsset,
  getFeaturedAssets,
  verifyOwnership,
};
