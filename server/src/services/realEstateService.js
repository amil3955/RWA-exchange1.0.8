const { v4: uuidv4 } = require("uuid");
const db = require("../db");

/**
 * Real Estate Service - Specialized handling for real estate assets
 * Supports residential, commercial, industrial, and land properties
 */

const PROPERTY_TYPE = {
  RESIDENTIAL: "residential",
  COMMERCIAL: "commercial",
  INDUSTRIAL: "industrial",
  LAND: "land",
  MIXED_USE: "mixed_use",
  RETAIL: "retail",
  OFFICE: "office",
  WAREHOUSE: "warehouse",
  MULTIFAMILY: "multifamily",
};

const PROPERTY_STATUS = {
  AVAILABLE: "available",
  UNDER_CONTRACT: "under_contract",
  SOLD: "sold",
  LEASED: "leased",
  OFF_MARKET: "off_market",
  PENDING: "pending",
};

const OWNERSHIP_TYPE = {
  FREEHOLD: "freehold",
  LEASEHOLD: "leasehold",
  JOINT_TENANCY: "joint_tenancy",
  TENANCY_IN_COMMON: "tenancy_in_common",
  FRACTIONAL: "fractional",
};

/**
 * Create a real estate property
 */
const createProperty = async (ownerId, propertyData) => {
  const data = db.read();

  if (!data.realEstateProperties) {
    data.realEstateProperties = [];
  }

  const property = {
    id: uuidv4(),
    ownerId,
    assetId: propertyData.assetId || null,
    name: propertyData.name,
    description: propertyData.description,
    propertyType: propertyData.propertyType,
    status: PROPERTY_STATUS.AVAILABLE,
    ownershipType: propertyData.ownershipType || OWNERSHIP_TYPE.FREEHOLD,
    address: {
      street: propertyData.street,
      unit: propertyData.unit || null,
      city: propertyData.city,
      state: propertyData.state,
      postalCode: propertyData.postalCode,
      country: propertyData.country,
      coordinates: {
        latitude: propertyData.latitude || null,
        longitude: propertyData.longitude || null,
      },
    },
    specifications: {
      totalArea: propertyData.totalArea || 0,
      areaUnit: propertyData.areaUnit || "sqft",
      buildingArea: propertyData.buildingArea || 0,
      landArea: propertyData.landArea || 0,
      floors: propertyData.floors || 1,
      bedrooms: propertyData.bedrooms || null,
      bathrooms: propertyData.bathrooms || null,
      parkingSpaces: propertyData.parkingSpaces || 0,
      yearBuilt: propertyData.yearBuilt || null,
      lastRenovation: propertyData.lastRenovation || null,
    },
    features: propertyData.features || [],
    amenities: propertyData.amenities || [],
    valuation: {
      currentValue: propertyData.currentValue || 0,
      purchasePrice: propertyData.purchasePrice || null,
      purchaseDate: propertyData.purchaseDate || null,
      currency: propertyData.currency || "USD",
      appraisalDate: null,
      appraisalValue: null,
      appraiser: null,
    },
    financials: {
      monthlyRent: propertyData.monthlyRent || null,
      annualPropertyTax: propertyData.annualPropertyTax || null,
      annualInsurance: propertyData.annualInsurance || null,
      hoaFees: propertyData.hoaFees || null,
      maintenanceCosts: propertyData.maintenanceCosts || null,
      occupancyRate: propertyData.occupancyRate || null,
      capRate: null,
      noi: null,
    },
    legal: {
      titleNumber: propertyData.titleNumber || null,
      zoningCode: propertyData.zoningCode || null,
      permitNumber: propertyData.permitNumber || null,
      encumbrances: propertyData.encumbrances || [],
      easements: propertyData.easements || [],
    },
    documents: [],
    images: propertyData.images || [],
    virtualTour: propertyData.virtualTour || null,
    tenants: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // Calculate financial metrics
  property.financials = calculateFinancialMetrics(property.financials, property.valuation);

  data.realEstateProperties.push(property);
  db.write(data);

  return property;
};

/**
 * Calculate financial metrics
 */
const calculateFinancialMetrics = (financials, valuation) => {
  const metrics = { ...financials };

  if (financials.monthlyRent) {
    const annualRent = financials.monthlyRent * 12;
    const expenses =
      (financials.annualPropertyTax || 0) +
      (financials.annualInsurance || 0) +
      (financials.hoaFees || 0) * 12 +
      (financials.maintenanceCosts || 0);

    metrics.noi = annualRent - expenses;

    if (valuation.currentValue > 0) {
      metrics.capRate = (metrics.noi / valuation.currentValue) * 100;
    }
  }

  return metrics;
};

/**
 * Get property by ID
 */
const getPropertyById = async (propertyId) => {
  const data = db.read();
  const property = (data.realEstateProperties || []).find((p) => p.id === propertyId);

  if (!property) {
    throw new Error("Property not found");
  }

  return property;
};

/**
 * Get properties with filters
 */
const getProperties = async (filters = {}) => {
  const data = db.read();
  let properties = data.realEstateProperties || [];

  if (filters.ownerId) {
    properties = properties.filter((p) => p.ownerId === filters.ownerId);
  }

  if (filters.propertyType) {
    properties = properties.filter((p) => p.propertyType === filters.propertyType);
  }

  if (filters.status) {
    properties = properties.filter((p) => p.status === filters.status);
  }

  if (filters.city) {
    properties = properties.filter(
      (p) => p.address.city.toLowerCase() === filters.city.toLowerCase()
    );
  }

  if (filters.state) {
    properties = properties.filter(
      (p) => p.address.state.toLowerCase() === filters.state.toLowerCase()
    );
  }

  if (filters.country) {
    properties = properties.filter(
      (p) => p.address.country.toLowerCase() === filters.country.toLowerCase()
    );
  }

  if (filters.minPrice) {
    properties = properties.filter((p) => p.valuation.currentValue >= filters.minPrice);
  }

  if (filters.maxPrice) {
    properties = properties.filter((p) => p.valuation.currentValue <= filters.maxPrice);
  }

  if (filters.minArea) {
    properties = properties.filter((p) => p.specifications.totalArea >= filters.minArea);
  }

  if (filters.maxArea) {
    properties = properties.filter((p) => p.specifications.totalArea <= filters.maxArea);
  }

  if (filters.bedrooms) {
    properties = properties.filter((p) => p.specifications.bedrooms >= filters.bedrooms);
  }

  // Sort options
  if (filters.sortBy) {
    switch (filters.sortBy) {
      case "price_asc":
        properties.sort((a, b) => a.valuation.currentValue - b.valuation.currentValue);
        break;
      case "price_desc":
        properties.sort((a, b) => b.valuation.currentValue - a.valuation.currentValue);
        break;
      case "area_asc":
        properties.sort((a, b) => a.specifications.totalArea - b.specifications.totalArea);
        break;
      case "area_desc":
        properties.sort((a, b) => b.specifications.totalArea - a.specifications.totalArea);
        break;
      case "newest":
        properties.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        break;
    }
  }

  // Pagination
  const page = filters.page || 1;
  const limit = filters.limit || 20;
  const startIndex = (page - 1) * limit;

  return {
    properties: properties.slice(startIndex, startIndex + limit),
    total: properties.length,
    page,
    totalPages: Math.ceil(properties.length / limit),
  };
};

/**
 * Update property
 */
const updateProperty = async (propertyId, ownerId, updates) => {
  const data = db.read();
  const index = (data.realEstateProperties || []).findIndex(
    (p) => p.id === propertyId && p.ownerId === ownerId
  );

  if (index === -1) {
    throw new Error("Property not found or unauthorized");
  }

  const property = data.realEstateProperties[index];

  // Update allowed fields
  const allowedFields = [
    "name",
    "description",
    "features",
    "amenities",
    "images",
    "virtualTour",
  ];

  allowedFields.forEach((field) => {
    if (updates[field] !== undefined) {
      property[field] = updates[field];
    }
  });

  // Update nested objects
  if (updates.specifications) {
    property.specifications = { ...property.specifications, ...updates.specifications };
  }

  if (updates.financials) {
    property.financials = { ...property.financials, ...updates.financials };
    property.financials = calculateFinancialMetrics(property.financials, property.valuation);
  }

  property.updatedAt = new Date().toISOString();
  data.realEstateProperties[index] = property;
  db.write(data);

  return property;
};

/**
 * Update property valuation
 */
const updateValuation = async (propertyId, valuationData) => {
  const data = db.read();
  const index = (data.realEstateProperties || []).findIndex((p) => p.id === propertyId);

  if (index === -1) {
    throw new Error("Property not found");
  }

  const property = data.realEstateProperties[index];

  property.valuation = {
    ...property.valuation,
    currentValue: valuationData.currentValue,
    appraisalDate: new Date().toISOString(),
    appraisalValue: valuationData.appraisalValue || valuationData.currentValue,
    appraiser: valuationData.appraiser || null,
  };

  // Recalculate financial metrics
  property.financials = calculateFinancialMetrics(property.financials, property.valuation);

  property.updatedAt = new Date().toISOString();
  data.realEstateProperties[index] = property;
  db.write(data);

  return property;
};

/**
 * Add tenant to property
 */
const addTenant = async (propertyId, tenantData) => {
  const data = db.read();
  const index = (data.realEstateProperties || []).findIndex((p) => p.id === propertyId);

  if (index === -1) {
    throw new Error("Property not found");
  }

  const tenant = {
    id: uuidv4(),
    name: tenantData.name,
    email: tenantData.email,
    phone: tenantData.phone,
    unit: tenantData.unit || null,
    leaseStart: tenantData.leaseStart,
    leaseEnd: tenantData.leaseEnd,
    monthlyRent: tenantData.monthlyRent,
    securityDeposit: tenantData.securityDeposit || 0,
    status: "active",
    addedAt: new Date().toISOString(),
  };

  data.realEstateProperties[index].tenants.push(tenant);
  data.realEstateProperties[index].updatedAt = new Date().toISOString();
  db.write(data);

  return tenant;
};

/**
 * Remove tenant
 */
const removeTenant = async (propertyId, tenantId) => {
  const data = db.read();
  const index = (data.realEstateProperties || []).findIndex((p) => p.id === propertyId);

  if (index === -1) {
    throw new Error("Property not found");
  }

  const property = data.realEstateProperties[index];
  const tenantIndex = property.tenants.findIndex((t) => t.id === tenantId);

  if (tenantIndex === -1) {
    throw new Error("Tenant not found");
  }

  property.tenants[tenantIndex].status = "inactive";
  property.tenants[tenantIndex].removedAt = new Date().toISOString();
  property.updatedAt = new Date().toISOString();

  data.realEstateProperties[index] = property;
  db.write(data);

  return { success: true };
};

/**
 * Calculate rental yield
 */
const calculateRentalYield = async (propertyId) => {
  const property = await getPropertyById(propertyId);

  if (!property.financials.monthlyRent || !property.valuation.currentValue) {
    return null;
  }

  const annualRent = property.financials.monthlyRent * 12;
  const grossYield = (annualRent / property.valuation.currentValue) * 100;

  const expenses =
    (property.financials.annualPropertyTax || 0) +
    (property.financials.annualInsurance || 0) +
    (property.financials.hoaFees || 0) * 12 +
    (property.financials.maintenanceCosts || 0);

  const netYield = ((annualRent - expenses) / property.valuation.currentValue) * 100;

  return {
    propertyId,
    grossRentalYield: Math.round(grossYield * 100) / 100,
    netRentalYield: Math.round(netYield * 100) / 100,
    annualRent,
    annualExpenses: expenses,
    noi: annualRent - expenses,
    capRate: property.financials.capRate,
  };
};

/**
 * Get property analytics
 */
const getPropertyAnalytics = async (propertyId) => {
  const property = await getPropertyById(propertyId);
  const yieldData = await calculateRentalYield(propertyId);

  const activeTenants = property.tenants.filter((t) => t.status === "active");
  const occupancyRate = property.specifications.floors > 0
    ? (activeTenants.length / property.specifications.floors) * 100
    : 0;

  const totalRentCollected = activeTenants.reduce((sum, t) => sum + t.monthlyRent, 0);

  return {
    propertyId,
    propertyName: property.name,
    currentValue: property.valuation.currentValue,
    purchasePrice: property.valuation.purchasePrice,
    appreciation: property.valuation.purchasePrice
      ? ((property.valuation.currentValue - property.valuation.purchasePrice) /
          property.valuation.purchasePrice) *
        100
      : null,
    occupancyRate,
    totalTenants: activeTenants.length,
    monthlyRentRoll: totalRentCollected,
    ...yieldData,
  };
};

/**
 * Search properties by location
 */
const searchByLocation = async (latitude, longitude, radiusKm = 10) => {
  const data = db.read();
  const properties = (data.realEstateProperties || []).filter((p) => {
    if (!p.address.coordinates.latitude || !p.address.coordinates.longitude) {
      return false;
    }

    const distance = calculateDistance(
      latitude,
      longitude,
      p.address.coordinates.latitude,
      p.address.coordinates.longitude
    );

    return distance <= radiusKm;
  });

  return properties;
};

/**
 * Calculate distance between two coordinates (Haversine formula)
 */
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

/**
 * Get market comparison
 */
const getMarketComparison = async (propertyId) => {
  const data = db.read();
  const property = await getPropertyById(propertyId);

  // Find similar properties
  const similarProperties = (data.realEstateProperties || []).filter(
    (p) =>
      p.id !== propertyId &&
      p.propertyType === property.propertyType &&
      p.address.city === property.address.city &&
      p.status === PROPERTY_STATUS.AVAILABLE
  );

  if (similarProperties.length === 0) {
    return {
      propertyId,
      comparableProperties: 0,
      marketData: null,
    };
  }

  const prices = similarProperties.map((p) => p.valuation.currentValue);
  const pricePerSqft = similarProperties.map(
    (p) => p.valuation.currentValue / p.specifications.totalArea
  );

  return {
    propertyId,
    comparableProperties: similarProperties.length,
    marketData: {
      averagePrice: prices.reduce((a, b) => a + b, 0) / prices.length,
      medianPrice: prices.sort((a, b) => a - b)[Math.floor(prices.length / 2)],
      minPrice: Math.min(...prices),
      maxPrice: Math.max(...prices),
      averagePricePerSqft:
        pricePerSqft.reduce((a, b) => a + b, 0) / pricePerSqft.length,
      propertyPricePerSqft:
        property.valuation.currentValue / property.specifications.totalArea,
    },
  };
};

/**
 * Update property status
 */
const updateStatus = async (propertyId, newStatus) => {
  const data = db.read();
  const index = (data.realEstateProperties || []).findIndex((p) => p.id === propertyId);

  if (index === -1) {
    throw new Error("Property not found");
  }

  if (!Object.values(PROPERTY_STATUS).includes(newStatus)) {
    throw new Error("Invalid property status");
  }

  data.realEstateProperties[index].status = newStatus;
  data.realEstateProperties[index].updatedAt = new Date().toISOString();
  db.write(data);

  return data.realEstateProperties[index];
};

/**
 * Get portfolio summary
 */
const getPortfolioSummary = async (ownerId) => {
  const data = db.read();
  const properties = (data.realEstateProperties || []).filter(
    (p) => p.ownerId === ownerId
  );

  const totalValue = properties.reduce((sum, p) => sum + p.valuation.currentValue, 0);
  const totalRent = properties.reduce(
    (sum, p) => sum + (p.financials.monthlyRent || 0),
    0
  );

  const byType = {};
  const byStatus = {};

  properties.forEach((p) => {
    byType[p.propertyType] = (byType[p.propertyType] || 0) + 1;
    byStatus[p.status] = (byStatus[p.status] || 0) + 1;
  });

  return {
    ownerId,
    totalProperties: properties.length,
    totalValue,
    totalMonthlyRent: totalRent,
    totalAnnualRent: totalRent * 12,
    averageCapRate:
      properties.filter((p) => p.financials.capRate).length > 0
        ? properties.reduce((sum, p) => sum + (p.financials.capRate || 0), 0) /
          properties.filter((p) => p.financials.capRate).length
        : 0,
    byType,
    byStatus,
  };
};

module.exports = {
  PROPERTY_TYPE,
  PROPERTY_STATUS,
  OWNERSHIP_TYPE,
  createProperty,
  getPropertyById,
  getProperties,
  updateProperty,
  updateValuation,
  addTenant,
  removeTenant,
  calculateRentalYield,
  getPropertyAnalytics,
  searchByLocation,
  getMarketComparison,
  updateStatus,
  getPortfolioSummary,
};
