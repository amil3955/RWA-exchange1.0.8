const { v4: uuidv4 } = require("uuid");
const db = require("../db");

/**
 * SMS Service - Handles SMS notifications
 * Supports verification codes, alerts, and marketing messages
 */

const SMS_TYPE = {
  VERIFICATION: "verification",
  ALERT: "alert",
  NOTIFICATION: "notification",
  MARKETING: "marketing",
  OTP: "otp",
};

const SMS_STATUS = {
  PENDING: "pending",
  SENT: "sent",
  DELIVERED: "delivered",
  FAILED: "failed",
};

/**
 * Send SMS
 */
const sendSms = async (to, message, options = {}) => {
  const data = db.read();

  if (!data.smsMessages) {
    data.smsMessages = [];
  }

  // Validate phone number format (basic)
  const phoneRegex = /^\+?[1-9]\d{1,14}$/;
  if (!phoneRegex.test(to.replace(/[\s-]/g, ""))) {
    throw new Error("Invalid phone number format");
  }

  const sms = {
    id: uuidv4(),
    to: to.replace(/[\s-]/g, ""),
    message,
    type: options.type || SMS_TYPE.NOTIFICATION,
    status: SMS_STATUS.PENDING,
    provider: options.provider || "default",
    metadata: options.metadata || {},
    createdAt: new Date().toISOString(),
    sentAt: null,
    deliveredAt: null,
  };

  data.smsMessages.push(sms);
  db.write(data);

  // Mock sending (in production, would call SMS provider like Twilio)
  await processSms(sms.id);

  return sms;
};

/**
 * Process SMS (mock sending)
 */
const processSms = async (smsId) => {
  const data = db.read();
  const index = (data.smsMessages || []).findIndex((s) => s.id === smsId);

  if (index === -1) return null;

  // Simulate API call delay
  await new Promise((resolve) => setTimeout(resolve, 100));

  // Mock 97% success rate
  const success = Math.random() < 0.97;

  if (success) {
    data.smsMessages[index].status = SMS_STATUS.SENT;
    data.smsMessages[index].sentAt = new Date().toISOString();

    // Simulate delivery after delay
    setTimeout(() => {
      const d = db.read();
      const idx = d.smsMessages.findIndex((s) => s.id === smsId);
      if (idx !== -1 && d.smsMessages[idx].status === SMS_STATUS.SENT) {
        d.smsMessages[idx].status = SMS_STATUS.DELIVERED;
        d.smsMessages[idx].deliveredAt = new Date().toISOString();
        db.write(d);
      }
    }, 2000);
  } else {
    data.smsMessages[index].status = SMS_STATUS.FAILED;
    data.smsMessages[index].error = "Simulated delivery failure";
  }

  db.write(data);
  return data.smsMessages[index];
};

/**
 * Generate and send OTP
 */
const sendOtp = async (to, options = {}) => {
  const otpLength = options.length || 6;
  const otp = generateOtp(otpLength);
  const expiresIn = options.expiresIn || 300; // 5 minutes

  const data = db.read();

  if (!data.otpCodes) {
    data.otpCodes = [];
  }

  // Invalidate existing OTPs for this number
  data.otpCodes = data.otpCodes.map((o) => {
    if (o.to === to && o.status === "active") {
      o.status = "invalidated";
    }
    return o;
  });

  const otpRecord = {
    id: uuidv4(),
    to,
    code: otp,
    purpose: options.purpose || "verification",
    status: "active",
    attempts: 0,
    maxAttempts: options.maxAttempts || 3,
    expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
    createdAt: new Date().toISOString(),
  };

  data.otpCodes.push(otpRecord);
  db.write(data);

  // Send OTP via SMS
  const message = options.template
    ? options.template.replace("{code}", otp)
    : `Your verification code is: ${otp}. Valid for ${expiresIn / 60} minutes.`;

  await sendSms(to, message, { type: SMS_TYPE.OTP });

  return {
    id: otpRecord.id,
    to,
    expiresAt: otpRecord.expiresAt,
    // Don't return the actual code for security
  };
};

/**
 * Generate OTP code
 */
const generateOtp = (length = 6) => {
  let otp = "";
  for (let i = 0; i < length; i++) {
    otp += Math.floor(Math.random() * 10);
  }
  return otp;
};

/**
 * Verify OTP
 */
const verifyOtp = async (to, code) => {
  const data = db.read();
  const otpRecord = (data.otpCodes || []).find(
    (o) =>
      o.to === to &&
      o.status === "active" &&
      new Date(o.expiresAt) > new Date()
  );

  if (!otpRecord) {
    return { valid: false, error: "No active OTP found or OTP expired" };
  }

  otpRecord.attempts++;

  if (otpRecord.attempts > otpRecord.maxAttempts) {
    otpRecord.status = "exhausted";
    db.write(data);
    return { valid: false, error: "Maximum attempts exceeded" };
  }

  if (otpRecord.code !== code) {
    db.write(data);
    return {
      valid: false,
      error: "Invalid code",
      attemptsRemaining: otpRecord.maxAttempts - otpRecord.attempts,
    };
  }

  otpRecord.status = "verified";
  otpRecord.verifiedAt = new Date().toISOString();
  db.write(data);

  return { valid: true, otpId: otpRecord.id };
};

/**
 * Get SMS history
 */
const getSmsHistory = async (to, filters = {}) => {
  const data = db.read();
  let messages = (data.smsMessages || []).filter((s) => s.to === to);

  if (filters.type) {
    messages = messages.filter((s) => s.type === filters.type);
  }

  if (filters.status) {
    messages = messages.filter((s) => s.status === filters.status);
  }

  messages.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return messages;
};

/**
 * Get SMS statistics
 */
const getSmsStatistics = async (period = "30d") => {
  const data = db.read();

  let startDate;
  switch (period) {
    case "7d":
      startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      break;
    case "30d":
      startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      break;
    default:
      startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  }

  const messages = (data.smsMessages || []).filter(
    (s) => new Date(s.createdAt) >= startDate
  );

  return {
    period,
    total: messages.length,
    sent: messages.filter((s) => s.status === SMS_STATUS.SENT).length,
    delivered: messages.filter((s) => s.status === SMS_STATUS.DELIVERED).length,
    failed: messages.filter((s) => s.status === SMS_STATUS.FAILED).length,
    byType: messages.reduce((acc, s) => {
      acc[s.type] = (acc[s.type] || 0) + 1;
      return acc;
    }, {}),
    deliveryRate:
      messages.length > 0
        ? (messages.filter((s) => s.status === SMS_STATUS.DELIVERED).length /
            messages.length) *
          100
        : 0,
  };
};

/**
 * Send bulk SMS
 */
const sendBulkSms = async (recipients, message, options = {}) => {
  const results = [];

  for (const to of recipients) {
    try {
      const sms = await sendSms(to, message, options);
      results.push({ to, status: "sent", smsId: sms.id });
    } catch (error) {
      results.push({ to, status: "failed", error: error.message });
    }
  }

  return {
    total: recipients.length,
    sent: results.filter((r) => r.status === "sent").length,
    failed: results.filter((r) => r.status === "failed").length,
    results,
  };
};

module.exports = {
  SMS_TYPE,
  SMS_STATUS,
  sendSms,
  sendOtp,
  verifyOtp,
  getSmsHistory,
  getSmsStatistics,
  sendBulkSms,
};
