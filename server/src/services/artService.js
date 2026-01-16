const { v4: uuidv4 } = require("uuid");
const db = require("../db");

/**
 * Art Service - Handles art and collectibles assets
 * Supports paintings, sculptures, digital art, collectibles, and antiques
 */

const ART_CATEGORY = {
  PAINTING: "painting",
  SCULPTURE: "sculpture",
  PHOTOGRAPHY: "photography",
  PRINT: "print",
  DIGITAL_ART: "digital_art",
  NFT: "nft",
  COLLECTIBLE: "collectible",
  ANTIQUE: "antique",
  JEWELRY: "jewelry",
  WINE: "wine",
  WATCHES: "watches",
};

const ART_MEDIUM = {
  OIL: "oil",
  ACRYLIC: "acrylic",
  WATERCOLOR: "watercolor",
  MIXED_MEDIA: "mixed_media",
  BRONZE: "bronze",
  MARBLE: "marble",
  DIGITAL: "digital",
  CERAMIC: "ceramic",
  TEXTILE: "textile",
};

const CONDITION = {
  MINT: "mint",
  EXCELLENT: "excellent",
  VERY_GOOD: "very_good",
  GOOD: "good",
  FAIR: "fair",
  POOR: "poor",
  RESTORED: "restored",
};

/**
 * Create an art piece
 */
const createArtPiece = async (ownerId, artData) => {
  const data = db.read();

  if (!data.artPieces) {
    data.artPieces = [];
  }

  const artPiece = {
    id: uuidv4(),
    ownerId,
    assetId: artData.assetId || null,
    title: artData.title,
    description: artData.description,
    category: artData.category,
    medium: artData.medium || null,
    artist: {
      name: artData.artistName,
      nationality: artData.artistNationality || null,
      birthYear: artData.artistBirthYear || null,
      deathYear: artData.artistDeathYear || null,
      biography: artData.artistBiography || null,
    },
    creation: {
      year: artData.creationYear || null,
      period: artData.period || null,
      style: artData.style || null,
      movement: artData.movement || null,
    },
    physical: {
      height: artData.height || null,
      width: artData.width || null,
      depth: artData.depth || null,
      unit: artData.dimensionUnit || "cm",
      weight: artData.weight || null,
      weightUnit: artData.weightUnit || "kg",
      framed: artData.framed || false,
      frameDetails: artData.frameDetails || null,
    },
    condition: {
      status: artData.condition || CONDITION.GOOD,
      notes: artData.conditionNotes || null,
      lastInspection: artData.lastInspection || null,
      restorationHistory: artData.restorationHistory || [],
    },
    provenance: {
      history: artData.provenanceHistory || [],
      previousOwners: artData.previousOwners || [],
      exhibitionHistory: artData.exhibitionHistory || [],
      publicationHistory: artData.publicationHistory || [],
    },
    authentication: {
      authenticated: false,
      authenticator: null,
      certificateNumber: null,
      authenticatedDate: null,
      catalogueRaisonne: artData.catalogueRaisonne || null,
    },
    valuation: {
      estimatedValue: artData.estimatedValue || 0,
      currency: artData.currency || "USD",
      lastAppraisalDate: null,
      lastAppraisalValue: null,
      appraiser: null,
      purchasePrice: artData.purchasePrice || null,
      purchaseDate: artData.purchaseDate || null,
    },
    insurance: {
      insured: false,
      provider: null,
      policyNumber: null,
      coverage: 0,
      premium: 0,
      expiryDate: null,
    },
    storage: {
      location: artData.storageLocation || null,
      facility: artData.storageFacility || null,
      conditions: {
        temperature: artData.storageTemp || null,
        humidity: artData.storageHumidity || null,
        lightExposure: artData.lightExposure || null,
      },
    },
    images: artData.images || [],
    documents: [],
    editions: artData.editions || null, // For prints/multiples
    editionNumber: artData.editionNumber || null,
    signature: {
      signed: artData.signed || false,
      location: artData.signatureLocation || null,
      type: artData.signatureType || null,
    },
    status: "owned",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  data.artPieces.push(artPiece);
  db.write(data);

  return artPiece;
};

/**
 * Get art piece by ID
 */
const getArtPieceById = async (artPieceId) => {
  const data = db.read();
  const artPiece = (data.artPieces || []).find((a) => a.id === artPieceId);

  if (!artPiece) {
    throw new Error("Art piece not found");
  }

  return artPiece;
};

/**
 * Get art pieces with filters
 */
const getArtPieces = async (filters = {}) => {
  const data = db.read();
  let artPieces = data.artPieces || [];

  if (filters.ownerId) {
    artPieces = artPieces.filter((a) => a.ownerId === filters.ownerId);
  }

  if (filters.category) {
    artPieces = artPieces.filter((a) => a.category === filters.category);
  }

  if (filters.artist) {
    artPieces = artPieces.filter((a) =>
      a.artist.name.toLowerCase().includes(filters.artist.toLowerCase())
    );
  }

  if (filters.minValue) {
    artPieces = artPieces.filter((a) => a.valuation.estimatedValue >= filters.minValue);
  }

  if (filters.maxValue) {
    artPieces = artPieces.filter((a) => a.valuation.estimatedValue <= filters.maxValue);
  }

  if (filters.period) {
    artPieces = artPieces.filter((a) => a.creation.period === filters.period);
  }

  if (filters.medium) {
    artPieces = artPieces.filter((a) => a.medium === filters.medium);
  }

  if (filters.authenticated !== undefined) {
    artPieces = artPieces.filter((a) => a.authentication.authenticated === filters.authenticated);
  }

  // Pagination
  const page = filters.page || 1;
  const limit = filters.limit || 20;
  const startIndex = (page - 1) * limit;

  return {
    artPieces: artPieces.slice(startIndex, startIndex + limit),
    total: artPieces.length,
    page,
    totalPages: Math.ceil(artPieces.length / limit),
  };
};

/**
 * Update art piece
 */
const updateArtPiece = async (artPieceId, ownerId, updates) => {
  const data = db.read();
  const index = (data.artPieces || []).findIndex(
    (a) => a.id === artPieceId && a.ownerId === ownerId
  );

  if (index === -1) {
    throw new Error("Art piece not found or unauthorized");
  }

  const artPiece = data.artPieces[index];

  // Update allowed fields
  const allowedFields = ["title", "description", "images", "status"];
  allowedFields.forEach((field) => {
    if (updates[field] !== undefined) {
      artPiece[field] = updates[field];
    }
  });

  // Update nested objects
  if (updates.condition) {
    artPiece.condition = { ...artPiece.condition, ...updates.condition };
  }

  if (updates.storage) {
    artPiece.storage = { ...artPiece.storage, ...updates.storage };
  }

  artPiece.updatedAt = new Date().toISOString();
  data.artPieces[index] = artPiece;
  db.write(data);

  return artPiece;
};

/**
 * Authenticate art piece
 */
const authenticateArtPiece = async (artPieceId, authenticationData) => {
  const data = db.read();
  const index = (data.artPieces || []).findIndex((a) => a.id === artPieceId);

  if (index === -1) {
    throw new Error("Art piece not found");
  }

  data.artPieces[index].authentication = {
    authenticated: true,
    authenticator: authenticationData.authenticator,
    certificateNumber: authenticationData.certificateNumber || uuidv4(),
    authenticatedDate: new Date().toISOString(),
    method: authenticationData.method || null,
    notes: authenticationData.notes || null,
    catalogueRaisonne: authenticationData.catalogueRaisonne || null,
  };

  data.artPieces[index].updatedAt = new Date().toISOString();
  db.write(data);

  return data.artPieces[index];
};

/**
 * Update valuation
 */
const updateValuation = async (artPieceId, valuationData) => {
  const data = db.read();
  const index = (data.artPieces || []).findIndex((a) => a.id === artPieceId);

  if (index === -1) {
    throw new Error("Art piece not found");
  }

  const artPiece = data.artPieces[index];

  artPiece.valuation = {
    ...artPiece.valuation,
    estimatedValue: valuationData.estimatedValue,
    lastAppraisalDate: new Date().toISOString(),
    lastAppraisalValue: valuationData.estimatedValue,
    appraiser: valuationData.appraiser || null,
    appraisalNotes: valuationData.notes || null,
  };

  // Record valuation history
  if (!artPiece.valuationHistory) {
    artPiece.valuationHistory = [];
  }

  artPiece.valuationHistory.push({
    value: valuationData.estimatedValue,
    appraiser: valuationData.appraiser,
    date: new Date().toISOString(),
    notes: valuationData.notes,
  });

  artPiece.updatedAt = new Date().toISOString();
  data.artPieces[index] = artPiece;
  db.write(data);

  return artPiece;
};

/**
 * Add provenance record
 */
const addProvenanceRecord = async (artPieceId, provenanceData) => {
  const data = db.read();
  const index = (data.artPieces || []).findIndex((a) => a.id === artPieceId);

  if (index === -1) {
    throw new Error("Art piece not found");
  }

  const record = {
    id: uuidv4(),
    ownerName: provenanceData.ownerName,
    ownerType: provenanceData.ownerType || "individual", // individual, gallery, museum, auction
    location: provenanceData.location || null,
    acquisitionDate: provenanceData.acquisitionDate,
    dispositionDate: provenanceData.dispositionDate || null,
    acquisitionMethod: provenanceData.acquisitionMethod, // purchase, gift, inheritance, auction
    salePrice: provenanceData.salePrice || null,
    documentation: provenanceData.documentation || [],
    notes: provenanceData.notes || null,
    addedAt: new Date().toISOString(),
  };

  data.artPieces[index].provenance.history.push(record);
  data.artPieces[index].updatedAt = new Date().toISOString();
  db.write(data);

  return record;
};

/**
 * Add exhibition record
 */
const addExhibitionRecord = async (artPieceId, exhibitionData) => {
  const data = db.read();
  const index = (data.artPieces || []).findIndex((a) => a.id === artPieceId);

  if (index === -1) {
    throw new Error("Art piece not found");
  }

  const record = {
    id: uuidv4(),
    exhibitionName: exhibitionData.exhibitionName,
    venue: exhibitionData.venue,
    location: exhibitionData.location,
    startDate: exhibitionData.startDate,
    endDate: exhibitionData.endDate,
    curator: exhibitionData.curator || null,
    catalogueNumber: exhibitionData.catalogueNumber || null,
    notes: exhibitionData.notes || null,
    addedAt: new Date().toISOString(),
  };

  data.artPieces[index].provenance.exhibitionHistory.push(record);
  data.artPieces[index].updatedAt = new Date().toISOString();
  db.write(data);

  return record;
};

/**
 * Update insurance
 */
const updateInsurance = async (artPieceId, ownerId, insuranceData) => {
  const data = db.read();
  const index = (data.artPieces || []).findIndex(
    (a) => a.id === artPieceId && a.ownerId === ownerId
  );

  if (index === -1) {
    throw new Error("Art piece not found or unauthorized");
  }

  data.artPieces[index].insurance = {
    insured: true,
    provider: insuranceData.provider,
    policyNumber: insuranceData.policyNumber,
    coverage: insuranceData.coverage,
    premium: insuranceData.premium || 0,
    expiryDate: insuranceData.expiryDate,
    deductible: insuranceData.deductible || 0,
  };

  data.artPieces[index].updatedAt = new Date().toISOString();
  db.write(data);

  return data.artPieces[index];
};

/**
 * Get collection statistics
 */
const getCollectionStatistics = async (ownerId) => {
  const data = db.read();
  const artPieces = (data.artPieces || []).filter((a) => a.ownerId === ownerId);

  const totalValue = artPieces.reduce(
    (sum, a) => sum + (a.valuation.estimatedValue || 0),
    0
  );

  const totalInsuredValue = artPieces
    .filter((a) => a.insurance.insured)
    .reduce((sum, a) => sum + (a.insurance.coverage || 0), 0);

  const byCategory = {};
  const byArtist = {};
  const byPeriod = {};

  artPieces.forEach((a) => {
    byCategory[a.category] = (byCategory[a.category] || 0) + 1;
    byArtist[a.artist.name] = (byArtist[a.artist.name] || 0) + 1;
    if (a.creation.period) {
      byPeriod[a.creation.period] = (byPeriod[a.creation.period] || 0) + 1;
    }
  });

  const authenticated = artPieces.filter((a) => a.authentication.authenticated).length;
  const insured = artPieces.filter((a) => a.insurance.insured).length;

  return {
    ownerId,
    totalPieces: artPieces.length,
    totalValue,
    averageValue: artPieces.length > 0 ? totalValue / artPieces.length : 0,
    totalInsuredValue,
    authenticatedCount: authenticated,
    insuredCount: insured,
    byCategory,
    byArtist: Object.entries(byArtist)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10),
    byPeriod,
  };
};

/**
 * Search art pieces
 */
const searchArtPieces = async (query, filters = {}) => {
  const data = db.read();
  let artPieces = data.artPieces || [];

  if (query) {
    const searchTerm = query.toLowerCase();
    artPieces = artPieces.filter(
      (a) =>
        a.title.toLowerCase().includes(searchTerm) ||
        a.artist.name.toLowerCase().includes(searchTerm) ||
        (a.description && a.description.toLowerCase().includes(searchTerm))
    );
  }

  if (filters.category) {
    artPieces = artPieces.filter((a) => a.category === filters.category);
  }

  if (filters.minValue) {
    artPieces = artPieces.filter((a) => a.valuation.estimatedValue >= filters.minValue);
  }

  if (filters.maxValue) {
    artPieces = artPieces.filter((a) => a.valuation.estimatedValue <= filters.maxValue);
  }

  return artPieces;
};

/**
 * Get valuation history
 */
const getValuationHistory = async (artPieceId) => {
  const artPiece = await getArtPieceById(artPieceId);

  return {
    artPieceId,
    title: artPiece.title,
    currentValue: artPiece.valuation.estimatedValue,
    purchasePrice: artPiece.valuation.purchasePrice,
    appreciationPercent: artPiece.valuation.purchasePrice
      ? ((artPiece.valuation.estimatedValue - artPiece.valuation.purchasePrice) /
          artPiece.valuation.purchasePrice) *
        100
      : null,
    history: artPiece.valuationHistory || [],
  };
};

module.exports = {
  ART_CATEGORY,
  ART_MEDIUM,
  CONDITION,
  createArtPiece,
  getArtPieceById,
  getArtPieces,
  updateArtPiece,
  authenticateArtPiece,
  updateValuation,
  addProvenanceRecord,
  addExhibitionRecord,
  updateInsurance,
  getCollectionStatistics,
  searchArtPieces,
  getValuationHistory,
};
