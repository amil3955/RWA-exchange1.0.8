const assetService = require("../services/assetService");

/**
 * Asset Controller - Handles asset-related HTTP requests
 */

const createAsset = async (req, res, next) => {
  try {
    const asset = await assetService.createAsset(req.user.id, req.body);
    res.status(201).json({ success: true, data: asset });
  } catch (error) {
    next(error);
  }
};

const getAsset = async (req, res, next) => {
  try {
    const asset = await assetService.getAssetById(req.params.id);
    res.json({ success: true, data: asset });
  } catch (error) {
    next(error);
  }
};

const getAssets = async (req, res, next) => {
  try {
    const result = await assetService.getAssets(req.query);
    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
};

const getMyAssets = async (req, res, next) => {
  try {
    const result = await assetService.getAssets({ ...req.query, ownerId: req.user.id });
    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
};

const updateAsset = async (req, res, next) => {
  try {
    const asset = await assetService.updateAsset(req.params.id, req.user.id, req.body);
    res.json({ success: true, data: asset });
  } catch (error) {
    next(error);
  }
};

const updateValuation = async (req, res, next) => {
  try {
    const asset = await assetService.updateValuation(req.params.id, req.body);
    res.json({ success: true, data: asset });
  } catch (error) {
    next(error);
  }
};

const addDocument = async (req, res, next) => {
  try {
    const document = await assetService.addDocument(req.params.id, req.body);
    res.status(201).json({ success: true, data: document });
  } catch (error) {
    next(error);
  }
};

const updateStatus = async (req, res, next) => {
  try {
    const asset = await assetService.updateStatus(req.params.id, req.body.status, req.body.reason);
    res.json({ success: true, data: asset });
  } catch (error) {
    next(error);
  }
};

const getOwnerStatistics = async (req, res, next) => {
  try {
    const stats = await assetService.getOwnerStatistics(req.user.id);
    res.json({ success: true, data: stats });
  } catch (error) {
    next(error);
  }
};

const searchAssets = async (req, res, next) => {
  try {
    const assets = await assetService.searchAssets(req.query.q, req.query);
    res.json({ success: true, data: assets });
  } catch (error) {
    next(error);
  }
};

const deleteAsset = async (req, res, next) => {
  try {
    const result = await assetService.deleteAsset(req.params.id, req.user.id);
    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
};

const getFeaturedAssets = async (req, res, next) => {
  try {
    const assets = await assetService.getFeaturedAssets(req.query.limit);
    res.json({ success: true, data: assets });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createAsset,
  getAsset,
  getAssets,
  getMyAssets,
  updateAsset,
  updateValuation,
  addDocument,
  updateStatus,
  getOwnerStatistics,
  searchAssets,
  deleteAsset,
  getFeaturedAssets,
};
