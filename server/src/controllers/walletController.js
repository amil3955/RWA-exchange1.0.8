const walletService = require("../services/walletService");

/**
 * Wallet Controller - Handles wallet-related HTTP requests
 */

const createWallet = async (req, res, next) => {
  try {
    const wallet = await walletService.createWallet(req.user.id, req.body);
    res.status(201).json({ success: true, data: wallet });
  } catch (error) {
    next(error);
  }
};

const getWallet = async (req, res, next) => {
  try {
    const wallet = await walletService.getWalletById(req.params.id);
    res.json({ success: true, data: wallet });
  } catch (error) {
    next(error);
  }
};

const getUserWallets = async (req, res, next) => {
  try {
    const wallets = await walletService.getUserWallets(req.user.id);
    res.json({ success: true, data: wallets });
  } catch (error) {
    next(error);
  }
};

const updateWallet = async (req, res, next) => {
  try {
    const wallet = await walletService.updateWallet(req.params.id, req.user.id, req.body);
    res.json({ success: true, data: wallet });
  } catch (error) {
    next(error);
  }
};

const setDefaultWallet = async (req, res, next) => {
  try {
    const wallet = await walletService.setDefaultWallet(req.params.id, req.user.id);
    res.json({ success: true, data: wallet });
  } catch (error) {
    next(error);
  }
};

const getWalletBalances = async (req, res, next) => {
  try {
    const balances = await walletService.getWalletBalances(req.params.id);
    res.json({ success: true, data: balances });
  } catch (error) {
    next(error);
  }
};

const updateSecuritySettings = async (req, res, next) => {
  try {
    const wallet = await walletService.updateSecuritySettings(req.params.id, req.user.id, req.body);
    res.json({ success: true, data: wallet });
  } catch (error) {
    next(error);
  }
};

const addToWhitelist = async (req, res, next) => {
  try {
    const wallet = await walletService.addToWhitelist(
      req.params.id,
      req.user.id,
      req.body.address,
      req.body.label
    );
    res.json({ success: true, data: wallet });
  } catch (error) {
    next(error);
  }
};

const removeFromWhitelist = async (req, res, next) => {
  try {
    const wallet = await walletService.removeFromWhitelist(
      req.params.id,
      req.user.id,
      req.body.address
    );
    res.json({ success: true, data: wallet });
  } catch (error) {
    next(error);
  }
};

const getActivityHistory = async (req, res, next) => {
  try {
    const result = await walletService.getActivityHistory(req.params.id, req.query);
    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
};

const deleteWallet = async (req, res, next) => {
  try {
    const result = await walletService.deleteWallet(req.params.id, req.user.id);
    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
};

const getWalletStatistics = async (req, res, next) => {
  try {
    const stats = await walletService.getWalletStatistics(req.params.id);
    res.json({ success: true, data: stats });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createWallet,
  getWallet,
  getUserWallets,
  updateWallet,
  setDefaultWallet,
  getWalletBalances,
  updateSecuritySettings,
  addToWhitelist,
  removeFromWhitelist,
  getActivityHistory,
  deleteWallet,
  getWalletStatistics,
};
