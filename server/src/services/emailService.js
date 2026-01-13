const { v4: uuidv4 } = require("uuid");
const db = require("../db");

/**
 * Email Service - Handles email sending and tracking
 * Supports templates, scheduling, and delivery tracking
 */

const EMAIL_STATUS = {
  PENDING: "pending",
  SENT: "sent",
  DELIVERED: "delivered",
  OPENED: "opened",
  CLICKED: "clicked",
  BOUNCED: "bounced",
  FAILED: "failed",
};

const EMAIL_TYPE = {
  TRANSACTIONAL: "transactional",
  NOTIFICATION: "notification",
  MARKETING: "marketing",
  SYSTEM: "system",
};

/**
 * Email templates
 */
const EMAIL_TEMPLATES = {
  WELCOME: {
    subject: "Welcome to RWA Exchange",
    template: (data) => `
      <h1>Welcome, ${data.name}!</h1>
      <p>Thank you for joining RWA Exchange. We're excited to have you on board.</p>
      <p>Start exploring real world assets and investment opportunities today.</p>
      <a href="${data.dashboardUrl}">Go to Dashboard</a>
    `,
  },
  VERIFICATION: {
    subject: "Verify Your Email Address",
    template: (data) => `
      <h1>Verify Your Email</h1>
      <p>Please click the link below to verify your email address:</p>
      <a href="${data.verificationUrl}">Verify Email</a>
      <p>This link will expire in 24 hours.</p>
    `,
  },
  PASSWORD_RESET: {
    subject: "Reset Your Password",
    template: (data) => `
      <h1>Password Reset Request</h1>
      <p>You requested to reset your password. Click the link below:</p>
      <a href="${data.resetUrl}">Reset Password</a>
      <p>If you didn't request this, please ignore this email.</p>
      <p>This link will expire in 1 hour.</p>
    `,
  },
  TRADE_EXECUTED: {
    subject: "Trade Executed Successfully",
    template: (data) => `
      <h1>Trade Confirmation</h1>
      <p>Your ${data.side} order has been executed:</p>
      <ul>
        <li>Symbol: ${data.symbol}</li>
        <li>Quantity: ${data.quantity}</li>
        <li>Price: ${data.price}</li>
        <li>Total: ${data.total}</li>
      </ul>
      <a href="${data.tradeUrl}">View Trade Details</a>
    `,
  },
  DEPOSIT_RECEIVED: {
    subject: "Deposit Confirmed",
    template: (data) => `
      <h1>Deposit Received</h1>
      <p>Your deposit has been credited to your account:</p>
      <ul>
        <li>Amount: ${data.amount} ${data.currency}</li>
        <li>Reference: ${data.reference}</li>
      </ul>
      <a href="${data.walletUrl}">View Your Wallet</a>
    `,
  },
  WITHDRAWAL_COMPLETED: {
    subject: "Withdrawal Processed",
    template: (data) => `
      <h1>Withdrawal Complete</h1>
      <p>Your withdrawal has been processed:</p>
      <ul>
        <li>Amount: ${data.amount} ${data.currency}</li>
        <li>Destination: ${data.destination}</li>
        <li>Reference: ${data.reference}</li>
      </ul>
    `,
  },
  KYC_APPROVED: {
    subject: "Identity Verification Approved",
    template: (data) => `
      <h1>KYC Approved</h1>
      <p>Great news! Your identity verification has been approved.</p>
      <p>You now have full access to all features on RWA Exchange.</p>
      <a href="${data.dashboardUrl}">Start Trading</a>
    `,
  },
  KYC_REJECTED: {
    subject: "Identity Verification Update Required",
    template: (data) => `
      <h1>Verification Update Required</h1>
      <p>Unfortunately, we couldn't verify your identity with the documents provided.</p>
      <p>Reason: ${data.reason}</p>
      <p>Please submit updated documents to continue.</p>
      <a href="${data.kycUrl}">Update Documents</a>
    `,
  },
  SECURITY_ALERT: {
    subject: "Security Alert - Action Required",
    template: (data) => `
      <h1>Security Alert</h1>
      <p>${data.message}</p>
      <p>Time: ${data.timestamp}</p>
      <p>IP Address: ${data.ipAddress}</p>
      <p>If this wasn't you, please secure your account immediately.</p>
      <a href="${data.securityUrl}">Review Security Settings</a>
    `,
  },
  PRICE_ALERT: {
    subject: "Price Alert: ${data.symbol}",
    template: (data) => `
      <h1>Price Alert Triggered</h1>
      <p>${data.symbol} has ${data.direction} your target price.</p>
      <ul>
        <li>Current Price: ${data.currentPrice}</li>
        <li>Target Price: ${data.targetPrice}</li>
      </ul>
      <a href="${data.marketUrl}">View Market</a>
    `,
  },
};

/**
 * Send email
 */
const sendEmail = async (to, templateName, data, options = {}) => {
  const dbData = db.read();

  if (!dbData.emails) {
    dbData.emails = [];
  }

  const template = EMAIL_TEMPLATES[templateName];
  if (!template) {
    throw new Error("Unknown email template");
  }

  const email = {
    id: uuidv4(),
    to,
    from: options.from || "noreply@rwa-exchange.com",
    subject: template.subject.replace(/\${data\.(\w+)}/g, (_, key) => data[key] || ""),
    body: template.template(data),
    templateName,
    templateData: data,
    type: options.type || EMAIL_TYPE.TRANSACTIONAL,
    status: EMAIL_STATUS.PENDING,
    priority: options.priority || "normal",
    scheduledAt: options.scheduledAt || null,
    sentAt: null,
    deliveredAt: null,
    openedAt: null,
    clickedAt: null,
    metadata: options.metadata || {},
    createdAt: new Date().toISOString(),
  };

  dbData.emails.push(email);
  db.write(dbData);

  // Simulate sending (in production, would call actual email provider)
  if (!options.scheduledAt) {
    await processEmail(email.id);
  }

  return email;
};

/**
 * Process email (mock sending)
 */
const processEmail = async (emailId) => {
  const data = db.read();
  const index = (data.emails || []).findIndex((e) => e.id === emailId);

  if (index === -1) {
    throw new Error("Email not found");
  }

  // Simulate API call to email provider
  await new Promise((resolve) => setTimeout(resolve, 100));

  // Mock 98% success rate
  const success = Math.random() < 0.98;

  if (success) {
    data.emails[index].status = EMAIL_STATUS.SENT;
    data.emails[index].sentAt = new Date().toISOString();

    // Simulate delivery after a delay
    setTimeout(async () => {
      const d = db.read();
      const idx = d.emails.findIndex((e) => e.id === emailId);
      if (idx !== -1 && d.emails[idx].status === EMAIL_STATUS.SENT) {
        d.emails[idx].status = EMAIL_STATUS.DELIVERED;
        d.emails[idx].deliveredAt = new Date().toISOString();
        db.write(d);
      }
    }, 2000);
  } else {
    data.emails[index].status = EMAIL_STATUS.FAILED;
    data.emails[index].error = "Simulated delivery failure";
  }

  db.write(data);

  return data.emails[index];
};

/**
 * Send bulk emails
 */
const sendBulkEmail = async (recipients, templateName, dataGenerator, options = {}) => {
  const results = [];

  for (const recipient of recipients) {
    try {
      const data = typeof dataGenerator === "function" ? dataGenerator(recipient) : dataGenerator;
      const email = await sendEmail(recipient.email, templateName, data, {
        ...options,
        scheduledAt: options.scheduledAt, // Delay for bulk
      });
      results.push({ recipient: recipient.email, status: "queued", emailId: email.id });
    } catch (error) {
      results.push({ recipient: recipient.email, status: "failed", error: error.message });
    }
  }

  return {
    total: recipients.length,
    queued: results.filter((r) => r.status === "queued").length,
    failed: results.filter((r) => r.status === "failed").length,
    results,
  };
};

/**
 * Get email by ID
 */
const getEmailById = async (emailId) => {
  const data = db.read();
  const email = (data.emails || []).find((e) => e.id === emailId);

  if (!email) {
    throw new Error("Email not found");
  }

  return email;
};

/**
 * Get email history for recipient
 */
const getEmailHistory = async (to, filters = {}) => {
  const data = db.read();
  let emails = (data.emails || []).filter((e) => e.to === to);

  if (filters.type) {
    emails = emails.filter((e) => e.type === filters.type);
  }

  if (filters.status) {
    emails = emails.filter((e) => e.status === filters.status);
  }

  if (filters.templateName) {
    emails = emails.filter((e) => e.templateName === filters.templateName);
  }

  emails.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return emails;
};

/**
 * Track email open
 */
const trackOpen = async (emailId) => {
  const data = db.read();
  const index = (data.emails || []).findIndex((e) => e.id === emailId);

  if (index === -1) return null;

  if (!data.emails[index].openedAt) {
    data.emails[index].status = EMAIL_STATUS.OPENED;
    data.emails[index].openedAt = new Date().toISOString();
    db.write(data);
  }

  return data.emails[index];
};

/**
 * Track email click
 */
const trackClick = async (emailId, url) => {
  const data = db.read();
  const index = (data.emails || []).findIndex((e) => e.id === emailId);

  if (index === -1) return null;

  if (!data.emails[index].clicks) {
    data.emails[index].clicks = [];
  }

  data.emails[index].clicks.push({
    url,
    timestamp: new Date().toISOString(),
  });

  if (!data.emails[index].clickedAt) {
    data.emails[index].status = EMAIL_STATUS.CLICKED;
    data.emails[index].clickedAt = new Date().toISOString();
  }

  db.write(data);

  return data.emails[index];
};

/**
 * Get email statistics
 */
const getEmailStatistics = async (period = "30d") => {
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

  const emails = (data.emails || []).filter(
    (e) => new Date(e.createdAt) >= startDate
  );

  const sent = emails.filter(
    (e) => e.status !== EMAIL_STATUS.PENDING && e.status !== EMAIL_STATUS.FAILED
  ).length;
  const delivered = emails.filter(
    (e) =>
      [EMAIL_STATUS.DELIVERED, EMAIL_STATUS.OPENED, EMAIL_STATUS.CLICKED].includes(
        e.status
      )
  ).length;
  const opened = emails.filter(
    (e) => [EMAIL_STATUS.OPENED, EMAIL_STATUS.CLICKED].includes(e.status)
  ).length;
  const clicked = emails.filter((e) => e.status === EMAIL_STATUS.CLICKED).length;
  const bounced = emails.filter((e) => e.status === EMAIL_STATUS.BOUNCED).length;
  const failed = emails.filter((e) => e.status === EMAIL_STATUS.FAILED).length;

  return {
    period,
    total: emails.length,
    sent,
    delivered,
    opened,
    clicked,
    bounced,
    failed,
    rates: {
      deliveryRate: sent > 0 ? (delivered / sent) * 100 : 0,
      openRate: delivered > 0 ? (opened / delivered) * 100 : 0,
      clickRate: opened > 0 ? (clicked / opened) * 100 : 0,
      bounceRate: sent > 0 ? (bounced / sent) * 100 : 0,
    },
    byTemplate: emails.reduce((acc, e) => {
      acc[e.templateName] = (acc[e.templateName] || 0) + 1;
      return acc;
    }, {}),
  };
};

/**
 * Retry failed email
 */
const retryEmail = async (emailId) => {
  const data = db.read();
  const index = (data.emails || []).findIndex((e) => e.id === emailId);

  if (index === -1) {
    throw new Error("Email not found");
  }

  if (data.emails[index].status !== EMAIL_STATUS.FAILED) {
    throw new Error("Only failed emails can be retried");
  }

  data.emails[index].status = EMAIL_STATUS.PENDING;
  data.emails[index].retryCount = (data.emails[index].retryCount || 0) + 1;
  data.emails[index].error = null;
  db.write(data);

  return processEmail(emailId);
};

module.exports = {
  EMAIL_STATUS,
  EMAIL_TYPE,
  EMAIL_TEMPLATES,
  sendEmail,
  sendBulkEmail,
  getEmailById,
  getEmailHistory,
  trackOpen,
  trackClick,
  getEmailStatistics,
  retryEmail,
};
