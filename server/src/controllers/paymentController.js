const paymentService = require("../services/paymentService");

/**
 * Payment Controller - Handles payment-related HTTP requests
 */

const createPayment = async (req, res, next) => {
  try {
    const payment = await paymentService.createPayment(req.user.id, req.body);
    res.status(201).json({ success: true, data: payment });
  } catch (error) {
    next(error);
  }
};

const getPayment = async (req, res, next) => {
  try {
    const payment = await paymentService.getPaymentById(req.params.id);
    res.json({ success: true, data: payment });
  } catch (error) {
    next(error);
  }
};

const getUserPayments = async (req, res, next) => {
  try {
    const result = await paymentService.getUserPayments(req.user.id, req.query);
    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
};

const processPayment = async (req, res, next) => {
  try {
    const payment = await paymentService.processPayment(req.params.id);
    res.json({ success: true, data: payment });
  } catch (error) {
    next(error);
  }
};

const refundPayment = async (req, res, next) => {
  try {
    const result = await paymentService.refundPayment(req.params.id, req.body);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

const getPaymentStatistics = async (req, res, next) => {
  try {
    const stats = await paymentService.getPaymentStatistics(req.user.id, req.query.period);
    res.json({ success: true, data: stats });
  } catch (error) {
    next(error);
  }
};

const calculateFees = async (req, res, next) => {
  try {
    const fees = paymentService.calculateFees(req.body.method, req.body.amount, req.body.currency);
    res.json({ success: true, data: fees });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createPayment,
  getPayment,
  getUserPayments,
  processPayment,
  refundPayment,
  getPaymentStatistics,
  calculateFees,
};
