const { v4: uuidv4 } = require("uuid");
const db = require("../db");

/**
 * Search Service - Handles search across different entities
 * Supports full-text search, filters, and search history
 */

const SEARCH_TYPE = {
  ALL: "all",
  ASSETS: "assets",
  USERS: "users",
  TOKENS: "tokens",
  ORDERS: "orders",
  TRANSACTIONS: "transactions",
};

/**
 * Global search
 */
const search = async (query, options = {}) => {
  const searchType = options.type || SEARCH_TYPE.ALL;
  const limit = options.limit || 20;
  const results = {};

  if (searchType === SEARCH_TYPE.ALL || searchType === SEARCH_TYPE.ASSETS) {
    results.assets = await searchAssets(query, limit);
  }

  if (searchType === SEARCH_TYPE.ALL || searchType === SEARCH_TYPE.TOKENS) {
    results.tokens = await searchTokens(query, limit);
  }

  if (searchType === SEARCH_TYPE.ALL || searchType === SEARCH_TYPE.USERS) {
    results.users = await searchUsers(query, limit);
  }

  // Calculate totals
  let totalResults = 0;
  Object.values(results).forEach((r) => {
    totalResults += r.length;
  });

  return {
    query,
    type: searchType,
    totalResults,
    results,
  };
};

/**
 * Search assets
 */
const searchAssets = async (query, limit = 20) => {
  const data = db.read();
  const searchTerm = query.toLowerCase();

  const assets = (data.assets || [])
    .filter(
      (a) =>
        a.name.toLowerCase().includes(searchTerm) ||
        (a.description && a.description.toLowerCase().includes(searchTerm)) ||
        a.type.toLowerCase().includes(searchTerm) ||
        (a.category && a.category.toLowerCase().includes(searchTerm))
    )
    .slice(0, limit)
    .map((a) => ({
      id: a.id,
      name: a.name,
      type: a.type,
      category: a.category,
      status: a.status,
      valuation: a.valuation?.amount,
      matchType: "asset",
    }));

  return assets;
};

/**
 * Search tokens
 */
const searchTokens = async (query, limit = 20) => {
  const data = db.read();
  const searchTerm = query.toLowerCase();

  const tokens = (data.tokenizations || [])
    .filter(
      (t) =>
        t.tokenName.toLowerCase().includes(searchTerm) ||
        t.tokenSymbol.toLowerCase().includes(searchTerm)
    )
    .slice(0, limit)
    .map((t) => ({
      id: t.id,
      name: t.tokenName,
      symbol: t.tokenSymbol,
      status: t.status,
      pricePerToken: t.pricePerToken,
      matchType: "token",
    }));

  return tokens;
};

/**
 * Search users
 */
const searchUsers = async (query, limit = 20) => {
  const data = db.read();
  const searchTerm = query.toLowerCase();

  const users = (data.users || [])
    .filter(
      (u) =>
        u.email.toLowerCase().includes(searchTerm) ||
        (u.name && u.name.toLowerCase().includes(searchTerm))
    )
    .slice(0, limit)
    .map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      matchType: "user",
    }));

  return users;
};

/**
 * Advanced search with filters
 */
const advancedSearch = async (query, filters = {}) => {
  const data = db.read();
  const searchTerm = query.toLowerCase();
  let results = [];

  // Search assets
  let assets = data.assets || [];

  if (filters.assetType) {
    assets = assets.filter((a) => a.type === filters.assetType);
  }

  if (filters.status) {
    assets = assets.filter((a) => a.status === filters.status);
  }

  if (filters.minValuation) {
    assets = assets.filter((a) => a.valuation?.amount >= filters.minValuation);
  }

  if (filters.maxValuation) {
    assets = assets.filter((a) => a.valuation?.amount <= filters.maxValuation);
  }

  assets = assets.filter(
    (a) =>
      a.name.toLowerCase().includes(searchTerm) ||
      (a.description && a.description.toLowerCase().includes(searchTerm))
  );

  results = assets.map((a) => ({
    id: a.id,
    type: "asset",
    name: a.name,
    assetType: a.type,
    status: a.status,
    valuation: a.valuation?.amount,
    createdAt: a.createdAt,
  }));

  // Sort
  if (filters.sortBy) {
    switch (filters.sortBy) {
      case "name":
        results.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case "valuation":
        results.sort((a, b) => (b.valuation || 0) - (a.valuation || 0));
        break;
      case "newest":
        results.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        break;
    }
  }

  // Pagination
  const page = filters.page || 1;
  const limit = filters.limit || 20;
  const startIndex = (page - 1) * limit;

  return {
    query,
    filters,
    total: results.length,
    page,
    totalPages: Math.ceil(results.length / limit),
    results: results.slice(startIndex, startIndex + limit),
  };
};

/**
 * Record search history
 */
const recordSearch = async (userId, query, type = SEARCH_TYPE.ALL) => {
  const data = db.read();

  if (!data.searchHistory) {
    data.searchHistory = [];
  }

  const record = {
    id: uuidv4(),
    userId,
    query,
    type,
    timestamp: new Date().toISOString(),
  };

  data.searchHistory.push(record);

  // Keep only last 1000 searches per user
  data.searchHistory = data.searchHistory.filter((s) => s.userId === userId).slice(-1000);

  db.write(data);

  return record;
};

/**
 * Get user search history
 */
const getSearchHistory = async (userId, limit = 20) => {
  const data = db.read();

  const history = (data.searchHistory || [])
    .filter((s) => s.userId === userId)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, limit);

  return history;
};

/**
 * Clear search history
 */
const clearSearchHistory = async (userId) => {
  const data = db.read();

  data.searchHistory = (data.searchHistory || []).filter(
    (s) => s.userId !== userId
  );

  db.write(data);

  return { success: true };
};

/**
 * Get search suggestions
 */
const getSuggestions = async (query, limit = 10) => {
  const data = db.read();
  const searchTerm = query.toLowerCase();
  const suggestions = new Set();

  // Add matching asset names
  (data.assets || [])
    .filter((a) => a.name.toLowerCase().startsWith(searchTerm))
    .slice(0, limit / 2)
    .forEach((a) => suggestions.add(a.name));

  // Add matching token symbols
  (data.tokenizations || [])
    .filter((t) => t.tokenSymbol.toLowerCase().startsWith(searchTerm))
    .slice(0, limit / 2)
    .forEach((t) => suggestions.add(t.tokenSymbol));

  // Add popular searches
  const popularSearches = (data.searchHistory || [])
    .filter((s) => s.query.toLowerCase().startsWith(searchTerm))
    .reduce((acc, s) => {
      acc[s.query] = (acc[s.query] || 0) + 1;
      return acc;
    }, {});

  Object.entries(popularSearches)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit / 2)
    .forEach(([q]) => suggestions.add(q));

  return Array.from(suggestions).slice(0, limit);
};

/**
 * Get trending searches
 */
const getTrendingSearches = async (limit = 10) => {
  const data = db.read();
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const recentSearches = (data.searchHistory || []).filter(
    (s) => new Date(s.timestamp) >= oneDayAgo
  );

  const searchCounts = recentSearches.reduce((acc, s) => {
    acc[s.query] = (acc[s.query] || 0) + 1;
    return acc;
  }, {});

  return Object.entries(searchCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([query, count]) => ({ query, count }));
};

/**
 * Get search statistics
 */
const getSearchStatistics = async () => {
  const data = db.read();
  const history = data.searchHistory || [];

  const uniqueUsers = new Set(history.map((s) => s.userId)).size;
  const uniqueQueries = new Set(history.map((s) => s.query)).size;

  const byType = history.reduce((acc, s) => {
    acc[s.type] = (acc[s.type] || 0) + 1;
    return acc;
  }, {});

  return {
    totalSearches: history.length,
    uniqueUsers,
    uniqueQueries,
    byType,
    averageSearchesPerUser: uniqueUsers > 0 ? history.length / uniqueUsers : 0,
  };
};

module.exports = {
  SEARCH_TYPE,
  search,
  searchAssets,
  searchTokens,
  searchUsers,
  advancedSearch,
  recordSearch,
  getSearchHistory,
  clearSearchHistory,
  getSuggestions,
  getTrendingSearches,
  getSearchStatistics,
};
