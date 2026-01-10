const crypto = require("crypto");
const { v4: uuidv4 } = require("uuid");

/**
 * Encryption Service - Handles data encryption and security
 * Provides AES-256-GCM encryption for sensitive data
 */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 64;
const KEY_LENGTH = 32;
const ITERATIONS = 100000;

// Encryption key (in production, use secure key management)
const MASTER_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString("hex");

/**
 * Generate encryption key from password
 */
const deriveKey = (password, salt) => {
  return crypto.pbkdf2Sync(
    password,
    salt,
    ITERATIONS,
    KEY_LENGTH,
    "sha512"
  );
};

/**
 * Encrypt data
 */
const encrypt = (data, key = null) => {
  try {
    const text = typeof data === "string" ? data : JSON.stringify(data);
    const encryptionKey = key || Buffer.from(MASTER_KEY, "hex");

    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, encryptionKey, iv);

    let encrypted = cipher.update(text, "utf8", "hex");
    encrypted += cipher.final("hex");

    const authTag = cipher.getAuthTag();

    return {
      encrypted: encrypted,
      iv: iv.toString("hex"),
      authTag: authTag.toString("hex"),
    };
  } catch (error) {
    throw new Error(`Encryption failed: ${error.message}`);
  }
};

/**
 * Decrypt data
 */
const decrypt = (encryptedData, key = null) => {
  try {
    const encryptionKey = key || Buffer.from(MASTER_KEY, "hex");

    const decipher = crypto.createDecipheriv(
      ALGORITHM,
      encryptionKey,
      Buffer.from(encryptedData.iv, "hex")
    );

    decipher.setAuthTag(Buffer.from(encryptedData.authTag, "hex"));

    let decrypted = decipher.update(encryptedData.encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");

    // Try to parse as JSON
    try {
      return JSON.parse(decrypted);
    } catch {
      return decrypted;
    }
  } catch (error) {
    throw new Error(`Decryption failed: ${error.message}`);
  }
};

/**
 * Encrypt with password
 */
const encryptWithPassword = (data, password) => {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const key = deriveKey(password, salt);
  const encrypted = encrypt(data, key);

  return {
    ...encrypted,
    salt: salt.toString("hex"),
  };
};

/**
 * Decrypt with password
 */
const decryptWithPassword = (encryptedData, password) => {
  const salt = Buffer.from(encryptedData.salt, "hex");
  const key = deriveKey(password, salt);

  return decrypt(
    {
      encrypted: encryptedData.encrypted,
      iv: encryptedData.iv,
      authTag: encryptedData.authTag,
    },
    key
  );
};

/**
 * Hash data (one-way)
 */
const hash = (data, algorithm = "sha256") => {
  return crypto.createHash(algorithm).update(data).digest("hex");
};

/**
 * Hash with salt
 */
const hashWithSalt = (data, salt = null) => {
  const useSalt = salt || crypto.randomBytes(16).toString("hex");
  const hashed = crypto
    .createHmac("sha256", useSalt)
    .update(data)
    .digest("hex");

  return {
    hash: hashed,
    salt: useSalt,
  };
};

/**
 * Verify hash
 */
const verifyHash = (data, hashedData, salt) => {
  const computed = crypto
    .createHmac("sha256", salt)
    .update(data)
    .digest("hex");

  return computed === hashedData;
};

/**
 * Generate secure random string
 */
const generateSecureRandom = (length = 32) => {
  return crypto.randomBytes(length).toString("hex");
};

/**
 * Generate API key
 */
const generateApiKey = (prefix = "rwa") => {
  const key = crypto.randomBytes(32).toString("base64url");
  return `${prefix}_${key}`;
};

/**
 * Generate secret key
 */
const generateSecretKey = () => {
  return crypto.randomBytes(64).toString("hex");
};

/**
 * Mask sensitive data
 */
const maskData = (data, visibleChars = 4) => {
  if (!data || data.length <= visibleChars * 2) {
    return "*".repeat(data?.length || 8);
  }

  const start = data.slice(0, visibleChars);
  const end = data.slice(-visibleChars);
  const masked = "*".repeat(data.length - visibleChars * 2);

  return `${start}${masked}${end}`;
};

/**
 * Encrypt field in object
 */
const encryptField = (obj, fieldPath) => {
  const parts = fieldPath.split(".");
  let current = obj;

  for (let i = 0; i < parts.length - 1; i++) {
    if (!current[parts[i]]) return obj;
    current = current[parts[i]];
  }

  const lastKey = parts[parts.length - 1];
  if (current[lastKey] !== undefined) {
    current[`${lastKey}_encrypted`] = encrypt(current[lastKey]);
    delete current[lastKey];
  }

  return obj;
};

/**
 * Decrypt field in object
 */
const decryptField = (obj, fieldPath) => {
  const parts = fieldPath.split(".");
  let current = obj;

  for (let i = 0; i < parts.length - 1; i++) {
    if (!current[parts[i]]) return obj;
    current = current[parts[i]];
  }

  const encryptedKey = `${parts[parts.length - 1]}_encrypted`;
  if (current[encryptedKey]) {
    current[parts[parts.length - 1]] = decrypt(current[encryptedKey]);
    delete current[encryptedKey];
  }

  return obj;
};

/**
 * Sign data
 */
const sign = (data, privateKey = null) => {
  const key = privateKey || MASTER_KEY;
  const text = typeof data === "string" ? data : JSON.stringify(data);

  return crypto.createHmac("sha256", key).update(text).digest("hex");
};

/**
 * Verify signature
 */
const verifySignature = (data, signature, privateKey = null) => {
  const computedSignature = sign(data, privateKey);
  return crypto.timingSafeEqual(
    Buffer.from(computedSignature),
    Buffer.from(signature)
  );
};

/**
 * Generate key pair
 */
const generateKeyPair = () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: {
      type: "spki",
      format: "pem",
    },
    privateKeyEncoding: {
      type: "pkcs8",
      format: "pem",
    },
  });

  return { publicKey, privateKey };
};

/**
 * Encrypt with public key
 */
const encryptWithPublicKey = (data, publicKey) => {
  const text = typeof data === "string" ? data : JSON.stringify(data);
  const encrypted = crypto.publicEncrypt(publicKey, Buffer.from(text));
  return encrypted.toString("base64");
};

/**
 * Decrypt with private key
 */
const decryptWithPrivateKey = (encrypted, privateKey) => {
  const decrypted = crypto.privateDecrypt(
    privateKey,
    Buffer.from(encrypted, "base64")
  );

  const text = decrypted.toString();

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

/**
 * Constant time comparison
 */
const secureCompare = (a, b) => {
  if (a.length !== b.length) {
    return false;
  }

  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
};

module.exports = {
  encrypt,
  decrypt,
  encryptWithPassword,
  decryptWithPassword,
  hash,
  hashWithSalt,
  verifyHash,
  generateSecureRandom,
  generateApiKey,
  generateSecretKey,
  maskData,
  encryptField,
  decryptField,
  sign,
  verifySignature,
  generateKeyPair,
  encryptWithPublicKey,
  decryptWithPrivateKey,
  secureCompare,
  deriveKey,
};
