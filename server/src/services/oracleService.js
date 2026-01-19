const { v4: uuidv4 } = require("uuid");
const db = require("../db");

/**
 * Oracle Service - Handles external data feeds and price oracles
 * Aggregates data from multiple sources for accuracy
 */

const ORACLE_TYPE = {
  PRICE: "price",
  WEATHER: "weather",
  SPORTS: "sports",
  FINANCIAL: "financial",
  CUSTOM: "custom",
};

const ORACLE_STATUS = {
  ACTIVE: "active",
  INACTIVE: "inactive",
  DEGRADED: "degraded",
  ERROR: "error",
};

/**
 * Register a new oracle
 */
const registerOracle = async (oracleData) => {
  const data = db.read();

  if (!data.oracles) {
    data.oracles = [];
  }

  const oracle = {
    id: uuidv4(),
    name: oracleData.name,
    type: oracleData.type || ORACLE_TYPE.PRICE,
    description: oracleData.description || null,
    endpoint: oracleData.endpoint,
    apiKey: oracleData.apiKey || null,
    supportedSymbols: oracleData.supportedSymbols || [],
    updateFrequency: oracleData.updateFrequency || 60000, // ms
    priority: oracleData.priority || 1,
    reliability: 100,
    status: ORACLE_STATUS.ACTIVE,
    statistics: {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageLatency: 0,
      lastUpdate: null,
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  data.oracles.push(oracle);
  db.write(data);

  return oracle;
};

/**
 * Get oracle by ID
 */
const getOracleById = async (oracleId) => {
  const data = db.read();
  const oracle = (data.oracles || []).find((o) => o.id === oracleId);

  if (!oracle) {
    throw new Error("Oracle not found");
  }

  return oracle;
};

/**
 * Get all oracles
 */
const getOracles = async (filters = {}) => {
  const data = db.read();
  let oracles = data.oracles || [];

  if (filters.type) {
    oracles = oracles.filter((o) => o.type === filters.type);
  }

  if (filters.status) {
    oracles = oracles.filter((o) => o.status === filters.status);
  }

  if (filters.symbol) {
    oracles = oracles.filter((o) => o.supportedSymbols.includes(filters.symbol));
  }

  return oracles;
};

/**
 * Fetch price from oracle (mock)
 */
const fetchPrice = async (oracleId, symbol) => {
  const data = db.read();
  const index = (data.oracles || []).findIndex((o) => o.id === oracleId);

  if (index === -1) {
    throw new Error("Oracle not found");
  }

  const oracle = data.oracles[index];
  const startTime = Date.now();

  // Simulate API call
  const success = Math.random() > 0.02; // 98% success rate
  const latency = Math.floor(50 + Math.random() * 200);

  await new Promise((resolve) => setTimeout(resolve, latency));

  // Update statistics
  oracle.statistics.totalRequests++;
  if (success) {
    oracle.statistics.successfulRequests++;
  } else {
    oracle.statistics.failedRequests++;
  }

  // Update average latency
  const totalLatency =
    oracle.statistics.averageLatency * (oracle.statistics.totalRequests - 1) + latency;
  oracle.statistics.averageLatency = totalLatency / oracle.statistics.totalRequests;
  oracle.statistics.lastUpdate = new Date().toISOString();

  // Calculate reliability
  oracle.reliability =
    (oracle.statistics.successfulRequests / oracle.statistics.totalRequests) * 100;

  // Update status based on reliability
  if (oracle.reliability < 80) {
    oracle.status = ORACLE_STATUS.DEGRADED;
  } else if (oracle.reliability < 50) {
    oracle.status = ORACLE_STATUS.ERROR;
  } else {
    oracle.status = ORACLE_STATUS.ACTIVE;
  }

  oracle.updatedAt = new Date().toISOString();
  data.oracles[index] = oracle;
  db.write(data);

  if (!success) {
    throw new Error("Oracle request failed");
  }

  // Mock price data
  const basePrice = 100 + Math.random() * 1000;
  const change = (Math.random() - 0.5) * 10;

  return {
    oracleId,
    symbol,
    price: basePrice,
    change,
    changePercent: (change / basePrice) * 100,
    timestamp: new Date().toISOString(),
    latency,
  };
};

/**
 * Get aggregated price from multiple oracles
 */
const getAggregatedPrice = async (symbol) => {
  const oracles = await getOracles({ type: ORACLE_TYPE.PRICE, status: ORACLE_STATUS.ACTIVE });

  const relevantOracles = oracles.filter(
    (o) => o.supportedSymbols.includes(symbol) || o.supportedSymbols.length === 0
  );

  if (relevantOracles.length === 0) {
    throw new Error("No oracles available for this symbol");
  }

  const prices = [];

  for (const oracle of relevantOracles) {
    try {
      const priceData = await fetchPrice(oracle.id, symbol);
      prices.push({
        oracleId: oracle.id,
        oracleName: oracle.name,
        price: priceData.price,
        weight: oracle.priority * (oracle.reliability / 100),
        reliability: oracle.reliability,
      });
    } catch (error) {
      // Skip failed oracle
    }
  }

  if (prices.length === 0) {
    throw new Error("Failed to fetch price from any oracle");
  }

  // Calculate weighted average
  const totalWeight = prices.reduce((sum, p) => sum + p.weight, 0);
  const weightedPrice = prices.reduce((sum, p) => sum + p.price * p.weight, 0) / totalWeight;

  // Calculate median for outlier detection
  const sortedPrices = prices.map((p) => p.price).sort((a, b) => a - b);
  const medianPrice = sortedPrices[Math.floor(sortedPrices.length / 2)];

  // Standard deviation
  const variance =
    prices.reduce((sum, p) => sum + Math.pow(p.price - weightedPrice, 2), 0) / prices.length;
  const stdDev = Math.sqrt(variance);

  return {
    symbol,
    aggregatedPrice: weightedPrice,
    medianPrice,
    standardDeviation: stdDev,
    sources: prices.length,
    prices,
    confidence: prices.length >= 3 ? "high" : prices.length >= 2 ? "medium" : "low",
    timestamp: new Date().toISOString(),
  };
};

/**
 * Record oracle data point
 */
const recordDataPoint = async (oracleId, dataPoint) => {
  const data = db.read();

  if (!data.oracleData) {
    data.oracleData = [];
  }

  const record = {
    id: uuidv4(),
    oracleId,
    symbol: dataPoint.symbol,
    value: dataPoint.value,
    metadata: dataPoint.metadata || {},
    timestamp: new Date().toISOString(),
  };

  data.oracleData.push(record);

  // Keep only last 10000 records
  if (data.oracleData.length > 10000) {
    data.oracleData = data.oracleData.slice(-10000);
  }

  db.write(data);

  return record;
};

/**
 * Get historical oracle data
 */
const getHistoricalData = async (symbol, period = "24h") => {
  const data = db.read();

  let startTime;
  switch (period) {
    case "1h":
      startTime = new Date(Date.now() - 60 * 60 * 1000);
      break;
    case "24h":
      startTime = new Date(Date.now() - 24 * 60 * 60 * 1000);
      break;
    case "7d":
      startTime = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      break;
    default:
      startTime = new Date(Date.now() - 24 * 60 * 60 * 1000);
  }

  const records = (data.oracleData || []).filter(
    (r) => r.symbol === symbol && new Date(r.timestamp) >= startTime
  );

  return records.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
};

/**
 * Get oracle statistics
 */
const getOracleStatistics = async () => {
  const oracles = await getOracles();

  const active = oracles.filter((o) => o.status === ORACLE_STATUS.ACTIVE).length;
  const degraded = oracles.filter((o) => o.status === ORACLE_STATUS.DEGRADED).length;
  const error = oracles.filter((o) => o.status === ORACLE_STATUS.ERROR).length;

  const totalRequests = oracles.reduce((sum, o) => sum + o.statistics.totalRequests, 0);
  const avgReliability =
    oracles.length > 0
      ? oracles.reduce((sum, o) => sum + o.reliability, 0) / oracles.length
      : 0;
  const avgLatency =
    oracles.length > 0
      ? oracles.reduce((sum, o) => sum + o.statistics.averageLatency, 0) / oracles.length
      : 0;

  return {
    totalOracles: oracles.length,
    active,
    degraded,
    error,
    totalRequests,
    averageReliability: avgReliability,
    averageLatency: avgLatency,
  };
};

/**
 * Update oracle status
 */
const updateOracleStatus = async (oracleId, status) => {
  const data = db.read();
  const index = (data.oracles || []).findIndex((o) => o.id === oracleId);

  if (index === -1) {
    throw new Error("Oracle not found");
  }

  if (!Object.values(ORACLE_STATUS).includes(status)) {
    throw new Error("Invalid oracle status");
  }

  data.oracles[index].status = status;
  data.oracles[index].updatedAt = new Date().toISOString();
  db.write(data);

  return data.oracles[index];
};

module.exports = {
  ORACLE_TYPE,
  ORACLE_STATUS,
  registerOracle,
  getOracleById,
  getOracles,
  fetchPrice,
  getAggregatedPrice,
  recordDataPoint,
  getHistoricalData,
  getOracleStatistics,
  updateOracleStatus,
};
