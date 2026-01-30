const { v4: uuidv4 } = require("uuid");
const db = require("../db");

/**
 * Watchlist Service - Handles user watchlists for assets and symbols
 * Supports multiple watchlists with custom organization
 */

const WATCHLIST_TYPE = {
  DEFAULT: "default",
  CUSTOM: "custom",
  FAVORITES: "favorites",
  ALERTS: "alerts",
};

/**
 * Create watchlist
 */
const createWatchlist = async (userId, watchlistData) => {
  const data = db.read();

  if (!data.watchlists) {
    data.watchlists = [];
  }

  const watchlist = {
    id: uuidv4(),
    userId,
    name: watchlistData.name,
    description: watchlistData.description || null,
    type: watchlistData.type || WATCHLIST_TYPE.CUSTOM,
    items: [],
    isDefault: watchlistData.isDefault || false,
    sortOrder: watchlistData.sortOrder || 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // If setting as default, unset other defaults
  if (watchlist.isDefault) {
    data.watchlists = data.watchlists.map((w) => {
      if (w.userId === userId) {
        w.isDefault = false;
      }
      return w;
    });
  }

  data.watchlists.push(watchlist);
  db.write(data);

  return watchlist;
};

/**
 * Get watchlist by ID
 */
const getWatchlistById = async (watchlistId) => {
  const data = db.read();
  const watchlist = (data.watchlists || []).find((w) => w.id === watchlistId);

  if (!watchlist) {
    throw new Error("Watchlist not found");
  }

  return watchlist;
};

/**
 * Get user watchlists
 */
const getUserWatchlists = async (userId) => {
  const data = db.read();
  return (data.watchlists || [])
    .filter((w) => w.userId === userId)
    .sort((a, b) => a.sortOrder - b.sortOrder);
};

/**
 * Update watchlist
 */
const updateWatchlist = async (watchlistId, userId, updates) => {
  const data = db.read();
  const index = (data.watchlists || []).findIndex(
    (w) => w.id === watchlistId && w.userId === userId
  );

  if (index === -1) {
    throw new Error("Watchlist not found or unauthorized");
  }

  const watchlist = data.watchlists[index];

  if (updates.name) {
    watchlist.name = updates.name;
  }

  if (updates.description !== undefined) {
    watchlist.description = updates.description;
  }

  if (updates.sortOrder !== undefined) {
    watchlist.sortOrder = updates.sortOrder;
  }

  if (updates.isDefault) {
    // Unset other defaults
    data.watchlists = data.watchlists.map((w) => {
      if (w.userId === userId && w.id !== watchlistId) {
        w.isDefault = false;
      }
      return w;
    });
    watchlist.isDefault = true;
  }

  watchlist.updatedAt = new Date().toISOString();
  data.watchlists[index] = watchlist;
  db.write(data);

  return watchlist;
};

/**
 * Delete watchlist
 */
const deleteWatchlist = async (watchlistId, userId) => {
  const data = db.read();
  const index = (data.watchlists || []).findIndex(
    (w) => w.id === watchlistId && w.userId === userId
  );

  if (index === -1) {
    throw new Error("Watchlist not found or unauthorized");
  }

  data.watchlists.splice(index, 1);
  db.write(data);

  return { success: true };
};

/**
 * Add item to watchlist
 */
const addItem = async (watchlistId, userId, itemData) => {
  const data = db.read();
  const index = (data.watchlists || []).findIndex(
    (w) => w.id === watchlistId && w.userId === userId
  );

  if (index === -1) {
    throw new Error("Watchlist not found or unauthorized");
  }

  const watchlist = data.watchlists[index];

  // Check if item already exists
  if (watchlist.items.some((i) => i.symbol === itemData.symbol)) {
    throw new Error("Item already in watchlist");
  }

  const item = {
    id: uuidv4(),
    symbol: itemData.symbol,
    name: itemData.name || null,
    assetType: itemData.assetType || null,
    assetId: itemData.assetId || null,
    notes: itemData.notes || null,
    addedPrice: itemData.addedPrice || null,
    addedAt: new Date().toISOString(),
  };

  watchlist.items.push(item);
  watchlist.updatedAt = new Date().toISOString();
  data.watchlists[index] = watchlist;
  db.write(data);

  return item;
};

/**
 * Remove item from watchlist
 */
const removeItem = async (watchlistId, userId, itemId) => {
  const data = db.read();
  const index = (data.watchlists || []).findIndex(
    (w) => w.id === watchlistId && w.userId === userId
  );

  if (index === -1) {
    throw new Error("Watchlist not found or unauthorized");
  }

  const watchlist = data.watchlists[index];
  const itemIndex = watchlist.items.findIndex((i) => i.id === itemId);

  if (itemIndex === -1) {
    throw new Error("Item not found in watchlist");
  }

  watchlist.items.splice(itemIndex, 1);
  watchlist.updatedAt = new Date().toISOString();
  data.watchlists[index] = watchlist;
  db.write(data);

  return { success: true };
};

/**
 * Update item notes
 */
const updateItemNotes = async (watchlistId, userId, itemId, notes) => {
  const data = db.read();
  const index = (data.watchlists || []).findIndex(
    (w) => w.id === watchlistId && w.userId === userId
  );

  if (index === -1) {
    throw new Error("Watchlist not found or unauthorized");
  }

  const watchlist = data.watchlists[index];
  const itemIndex = watchlist.items.findIndex((i) => i.id === itemId);

  if (itemIndex === -1) {
    throw new Error("Item not found in watchlist");
  }

  watchlist.items[itemIndex].notes = notes;
  watchlist.updatedAt = new Date().toISOString();
  data.watchlists[index] = watchlist;
  db.write(data);

  return watchlist.items[itemIndex];
};

/**
 * Reorder watchlist items
 */
const reorderItems = async (watchlistId, userId, itemIds) => {
  const data = db.read();
  const index = (data.watchlists || []).findIndex(
    (w) => w.id === watchlistId && w.userId === userId
  );

  if (index === -1) {
    throw new Error("Watchlist not found or unauthorized");
  }

  const watchlist = data.watchlists[index];

  // Reorder based on itemIds array
  const reorderedItems = itemIds
    .map((id) => watchlist.items.find((i) => i.id === id))
    .filter(Boolean);

  // Add any items not in itemIds at the end
  watchlist.items.forEach((item) => {
    if (!itemIds.includes(item.id)) {
      reorderedItems.push(item);
    }
  });

  watchlist.items = reorderedItems;
  watchlist.updatedAt = new Date().toISOString();
  data.watchlists[index] = watchlist;
  db.write(data);

  return watchlist;
};

/**
 * Copy watchlist
 */
const copyWatchlist = async (watchlistId, userId, newName) => {
  const original = await getWatchlistById(watchlistId);

  if (original.userId !== userId) {
    throw new Error("Unauthorized");
  }

  return createWatchlist(userId, {
    name: newName || `Copy of ${original.name}`,
    description: original.description,
    type: WATCHLIST_TYPE.CUSTOM,
    items: original.items.map((item) => ({
      symbol: item.symbol,
      name: item.name,
      assetType: item.assetType,
      assetId: item.assetId,
    })),
  });
};

/**
 * Check if symbol is in any watchlist
 */
const isInWatchlist = async (userId, symbol) => {
  const data = db.read();
  const watchlists = (data.watchlists || []).filter((w) => w.userId === userId);

  for (const watchlist of watchlists) {
    if (watchlist.items.some((i) => i.symbol === symbol)) {
      return {
        inWatchlist: true,
        watchlistId: watchlist.id,
        watchlistName: watchlist.name,
      };
    }
  }

  return { inWatchlist: false };
};

/**
 * Get watchlist statistics
 */
const getWatchlistStatistics = async (userId) => {
  const watchlists = await getUserWatchlists(userId);

  const totalItems = watchlists.reduce((sum, w) => sum + w.items.length, 0);

  const bySymbol = {};
  watchlists.forEach((w) => {
    w.items.forEach((item) => {
      bySymbol[item.symbol] = (bySymbol[item.symbol] || 0) + 1;
    });
  });

  return {
    totalWatchlists: watchlists.length,
    totalItems,
    uniqueSymbols: Object.keys(bySymbol).length,
    mostWatched: Object.entries(bySymbol)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([symbol, count]) => ({ symbol, count })),
  };
};

/**
 * Get or create default watchlist
 */
const getOrCreateDefault = async (userId) => {
  const data = db.read();
  const existing = (data.watchlists || []).find(
    (w) => w.userId === userId && w.isDefault
  );

  if (existing) {
    return existing;
  }

  return createWatchlist(userId, {
    name: "My Watchlist",
    type: WATCHLIST_TYPE.DEFAULT,
    isDefault: true,
  });
};

module.exports = {
  WATCHLIST_TYPE,
  createWatchlist,
  getWatchlistById,
  getUserWatchlists,
  updateWatchlist,
  deleteWatchlist,
  addItem,
  removeItem,
  updateItemNotes,
  reorderItems,
  copyWatchlist,
  isInWatchlist,
  getWatchlistStatistics,
  getOrCreateDefault,
};
