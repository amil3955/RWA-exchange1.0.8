const { v4: uuidv4 } = require("uuid");
const db = require("../db");

/**
 * Vehicle Service - Handles vehicle assets
 * Supports cars, yachts, aircraft, and other vehicles
 */

const VEHICLE_TYPE = {
  CAR: "car",
  MOTORCYCLE: "motorcycle",
  YACHT: "yacht",
  AIRCRAFT: "aircraft",
  RV: "rv",
  TRUCK: "truck",
  CLASSIC_CAR: "classic_car",
  EXOTIC_CAR: "exotic_car",
};

const VEHICLE_CONDITION = {
  NEW: "new",
  EXCELLENT: "excellent",
  GOOD: "good",
  FAIR: "fair",
  POOR: "poor",
  RESTORATION: "restoration",
  BARN_FIND: "barn_find",
};

/**
 * Create a vehicle asset
 */
const createVehicle = async (ownerId, vehicleData) => {
  const data = db.read();

  if (!data.vehicles) {
    data.vehicles = [];
  }

  const vehicle = {
    id: uuidv4(),
    ownerId,
    assetId: vehicleData.assetId || null,
    vehicleType: vehicleData.vehicleType || VEHICLE_TYPE.CAR,
    identification: {
      vin: vehicleData.vin || null,
      registrationNumber: vehicleData.registrationNumber || null,
      title: vehicleData.title || null,
      serialNumber: vehicleData.serialNumber || null,
    },
    details: {
      make: vehicleData.make,
      model: vehicleData.model,
      year: vehicleData.year,
      trim: vehicleData.trim || null,
      bodyStyle: vehicleData.bodyStyle || null,
      color: vehicleData.exteriorColor || null,
      interiorColor: vehicleData.interiorColor || null,
    },
    specifications: {
      engine: vehicleData.engine || null,
      transmission: vehicleData.transmission || null,
      drivetrain: vehicleData.drivetrain || null,
      fuelType: vehicleData.fuelType || null,
      horsepower: vehicleData.horsepower || null,
      torque: vehicleData.torque || null,
      mileage: vehicleData.mileage || 0,
      mileageUnit: vehicleData.mileageUnit || "miles",
    },
    condition: {
      status: vehicleData.condition || VEHICLE_CONDITION.GOOD,
      notes: vehicleData.conditionNotes || null,
      lastInspection: vehicleData.lastInspection || null,
      accidentHistory: vehicleData.accidentHistory || false,
      serviceHistory: vehicleData.serviceHistory || [],
    },
    ownership: {
      purchaseDate: vehicleData.purchaseDate || null,
      purchasePrice: vehicleData.purchasePrice || 0,
      purchaseLocation: vehicleData.purchaseLocation || null,
      previousOwners: vehicleData.previousOwners || null,
    },
    valuation: {
      currentValue: vehicleData.currentValue || 0,
      currency: vehicleData.currency || "USD",
      appraisalDate: vehicleData.appraisalDate || null,
      appraiser: vehicleData.appraiser || null,
      method: vehicleData.valuationMethod || "market",
    },
    insurance: {
      provider: vehicleData.insuranceProvider || null,
      policyNumber: vehicleData.policyNumber || null,
      coverage: vehicleData.coverage || 0,
      premium: vehicleData.premium || 0,
      expiryDate: vehicleData.insuranceExpiry || null,
    },
    storage: {
      location: vehicleData.storageLocation || null,
      type: vehicleData.storageType || null, // garage, climate-controlled, outdoor
      cost: vehicleData.storageCost || 0,
    },
    documents: [],
    images: vehicleData.images || [],
    modifications: vehicleData.modifications || [],
    status: "owned",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  data.vehicles.push(vehicle);
  db.write(data);

  return vehicle;
};

/**
 * Get vehicle by ID
 */
const getVehicleById = async (vehicleId) => {
  const data = db.read();
  const vehicle = (data.vehicles || []).find((v) => v.id === vehicleId);

  if (!vehicle) {
    throw new Error("Vehicle not found");
  }

  return vehicle;
};

/**
 * Get user vehicles
 */
const getUserVehicles = async (ownerId, filters = {}) => {
  const data = db.read();
  let vehicles = (data.vehicles || []).filter((v) => v.ownerId === ownerId);

  if (filters.vehicleType) {
    vehicles = vehicles.filter((v) => v.vehicleType === filters.vehicleType);
  }

  if (filters.make) {
    vehicles = vehicles.filter((v) =>
      v.details.make.toLowerCase().includes(filters.make.toLowerCase())
    );
  }

  if (filters.minYear) {
    vehicles = vehicles.filter((v) => v.details.year >= filters.minYear);
  }

  if (filters.maxYear) {
    vehicles = vehicles.filter((v) => v.details.year <= filters.maxYear);
  }

  if (filters.minValue) {
    vehicles = vehicles.filter((v) => v.valuation.currentValue >= filters.minValue);
  }

  return vehicles;
};

/**
 * Update vehicle
 */
const updateVehicle = async (vehicleId, ownerId, updates) => {
  const data = db.read();
  const index = (data.vehicles || []).findIndex(
    (v) => v.id === vehicleId && v.ownerId === ownerId
  );

  if (index === -1) {
    throw new Error("Vehicle not found or unauthorized");
  }

  const vehicle = data.vehicles[index];

  // Update allowed fields
  if (updates.specifications) {
    vehicle.specifications = { ...vehicle.specifications, ...updates.specifications };
  }

  if (updates.condition) {
    vehicle.condition = { ...vehicle.condition, ...updates.condition };
  }

  if (updates.insurance) {
    vehicle.insurance = { ...vehicle.insurance, ...updates.insurance };
  }

  if (updates.storage) {
    vehicle.storage = { ...vehicle.storage, ...updates.storage };
  }

  if (updates.images) {
    vehicle.images = updates.images;
  }

  vehicle.updatedAt = new Date().toISOString();
  data.vehicles[index] = vehicle;
  db.write(data);

  return vehicle;
};

/**
 * Update vehicle mileage
 */
const updateMileage = async (vehicleId, ownerId, newMileage) => {
  const data = db.read();
  const index = (data.vehicles || []).findIndex(
    (v) => v.id === vehicleId && v.ownerId === ownerId
  );

  if (index === -1) {
    throw new Error("Vehicle not found or unauthorized");
  }

  const vehicle = data.vehicles[index];
  const previousMileage = vehicle.specifications.mileage;

  if (newMileage < previousMileage) {
    throw new Error("New mileage cannot be less than current mileage");
  }

  // Record mileage history
  if (!vehicle.mileageHistory) {
    vehicle.mileageHistory = [];
  }

  vehicle.mileageHistory.push({
    mileage: previousMileage,
    date: vehicle.updatedAt,
  });

  vehicle.specifications.mileage = newMileage;
  vehicle.updatedAt = new Date().toISOString();

  data.vehicles[index] = vehicle;
  db.write(data);

  return vehicle;
};

/**
 * Add service record
 */
const addServiceRecord = async (vehicleId, serviceData) => {
  const data = db.read();
  const index = (data.vehicles || []).findIndex((v) => v.id === vehicleId);

  if (index === -1) {
    throw new Error("Vehicle not found");
  }

  const record = {
    id: uuidv4(),
    date: serviceData.date || new Date().toISOString(),
    type: serviceData.type, // maintenance, repair, upgrade
    description: serviceData.description,
    mileage: serviceData.mileage || null,
    provider: serviceData.provider || null,
    cost: serviceData.cost || 0,
    parts: serviceData.parts || [],
    notes: serviceData.notes || null,
    documents: serviceData.documents || [],
  };

  data.vehicles[index].condition.serviceHistory.push(record);
  data.vehicles[index].updatedAt = new Date().toISOString();

  db.write(data);

  return record;
};

/**
 * Update valuation
 */
const updateValuation = async (vehicleId, valuationData) => {
  const data = db.read();
  const index = (data.vehicles || []).findIndex((v) => v.id === vehicleId);

  if (index === -1) {
    throw new Error("Vehicle not found");
  }

  const vehicle = data.vehicles[index];

  // Record valuation history
  if (!vehicle.valuationHistory) {
    vehicle.valuationHistory = [];
  }

  vehicle.valuationHistory.push({
    value: vehicle.valuation.currentValue,
    date: vehicle.valuation.appraisalDate || vehicle.updatedAt,
  });

  vehicle.valuation = {
    currentValue: valuationData.currentValue,
    currency: valuationData.currency || vehicle.valuation.currency,
    appraisalDate: new Date().toISOString(),
    appraiser: valuationData.appraiser || null,
    method: valuationData.method || "appraisal",
    notes: valuationData.notes || null,
  };

  vehicle.updatedAt = new Date().toISOString();
  data.vehicles[index] = vehicle;
  db.write(data);

  return vehicle;
};

/**
 * Add modification
 */
const addModification = async (vehicleId, modificationData) => {
  const data = db.read();
  const index = (data.vehicles || []).findIndex((v) => v.id === vehicleId);

  if (index === -1) {
    throw new Error("Vehicle not found");
  }

  const modification = {
    id: uuidv4(),
    name: modificationData.name,
    category: modificationData.category, // performance, aesthetic, safety, comfort
    description: modificationData.description,
    date: modificationData.date || new Date().toISOString(),
    cost: modificationData.cost || 0,
    installer: modificationData.installer || null,
    reversible: modificationData.reversible || false,
    valueImpact: modificationData.valueImpact || 0, // positive or negative
  };

  data.vehicles[index].modifications.push(modification);
  data.vehicles[index].updatedAt = new Date().toISOString();

  db.write(data);

  return modification;
};

/**
 * Calculate depreciation
 */
const calculateDepreciation = async (vehicleId) => {
  const vehicle = await getVehicleById(vehicleId);

  const purchasePrice = vehicle.ownership.purchasePrice;
  const currentValue = vehicle.valuation.currentValue;
  const purchaseDate = new Date(vehicle.ownership.purchaseDate);
  const yearsOwned = (Date.now() - purchaseDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000);

  const totalDepreciation = purchasePrice - currentValue;
  const depreciationPercent = (totalDepreciation / purchasePrice) * 100;
  const annualDepreciation = yearsOwned > 0 ? totalDepreciation / yearsOwned : 0;

  return {
    vehicleId,
    purchasePrice,
    currentValue,
    totalDepreciation,
    depreciationPercent,
    yearsOwned: Math.round(yearsOwned * 100) / 100,
    annualDepreciation,
    appreciating: totalDepreciation < 0,
  };
};

/**
 * Get portfolio summary
 */
const getPortfolioSummary = async (ownerId) => {
  const vehicles = await getUserVehicles(ownerId);

  const totalValue = vehicles.reduce((sum, v) => sum + v.valuation.currentValue, 0);
  const totalPurchasePrice = vehicles.reduce(
    (sum, v) => sum + (v.ownership.purchasePrice || 0),
    0
  );
  const totalInsurancePremiums = vehicles.reduce(
    (sum, v) => sum + (v.insurance.premium || 0),
    0
  );

  const byType = {};
  const byMake = {};

  vehicles.forEach((v) => {
    byType[v.vehicleType] = (byType[v.vehicleType] || 0) + 1;
    byMake[v.details.make] = (byMake[v.details.make] || 0) + 1;
  });

  const appreciating = vehicles.filter(
    (v) => v.valuation.currentValue > (v.ownership.purchasePrice || 0)
  ).length;

  return {
    ownerId,
    totalVehicles: vehicles.length,
    totalValue,
    totalPurchasePrice,
    totalGainLoss: totalValue - totalPurchasePrice,
    totalGainLossPercent:
      totalPurchasePrice > 0
        ? ((totalValue - totalPurchasePrice) / totalPurchasePrice) * 100
        : 0,
    annualInsuranceCost: totalInsurancePremiums,
    appreciatingCount: appreciating,
    depreciatingCount: vehicles.length - appreciating,
    byType,
    byMake,
  };
};

/**
 * Get maintenance schedule
 */
const getMaintenanceSchedule = async (vehicleId) => {
  const vehicle = await getVehicleById(vehicleId);

  const mileage = vehicle.specifications.mileage;
  const lastServices = vehicle.condition.serviceHistory.slice(-5);

  // Standard maintenance intervals
  const intervals = [
    { service: "Oil Change", interval: 5000, unit: "miles" },
    { service: "Tire Rotation", interval: 7500, unit: "miles" },
    { service: "Brake Inspection", interval: 15000, unit: "miles" },
    { service: "Air Filter", interval: 20000, unit: "miles" },
    { service: "Transmission Service", interval: 30000, unit: "miles" },
    { service: "Spark Plugs", interval: 60000, unit: "miles" },
    { service: "Timing Belt", interval: 100000, unit: "miles" },
  ];

  const schedule = intervals.map((item) => {
    const lastService = lastServices.find((s) =>
      s.description.toLowerCase().includes(item.service.toLowerCase())
    );
    const lastMileage = lastService?.mileage || 0;
    const nextDue = lastMileage + item.interval;
    const milesUntilDue = nextDue - mileage;

    return {
      service: item.service,
      lastPerformed: lastService?.date || null,
      lastMileage,
      nextDueMileage: nextDue,
      milesUntilDue,
      overdue: milesUntilDue < 0,
    };
  });

  return {
    vehicleId,
    currentMileage: mileage,
    schedule,
    overdueCount: schedule.filter((s) => s.overdue).length,
  };
};

module.exports = {
  VEHICLE_TYPE,
  VEHICLE_CONDITION,
  createVehicle,
  getVehicleById,
  getUserVehicles,
  updateVehicle,
  updateMileage,
  addServiceRecord,
  updateValuation,
  addModification,
  calculateDepreciation,
  getPortfolioSummary,
  getMaintenanceSchedule,
};
