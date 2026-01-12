const { v4: uuidv4 } = require("uuid");
const path = require("path");
const db = require("../db");

/**
 * Storage Service - Handles file storage and management
 * Supports local storage with metadata tracking
 */

const STORAGE_TYPE = {
  LOCAL: "local",
  S3: "s3",
  GCS: "gcs",
  AZURE: "azure",
};

const FILE_STATUS = {
  UPLOADING: "uploading",
  ACTIVE: "active",
  ARCHIVED: "archived",
  DELETED: "deleted",
};

const ALLOWED_EXTENSIONS = {
  images: [".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg"],
  documents: [".pdf", ".doc", ".docx", ".xls", ".xlsx", ".txt", ".csv"],
  media: [".mp4", ".mp3", ".wav", ".avi", ".mov"],
  archives: [".zip", ".rar", ".7z", ".tar", ".gz"],
};

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

/**
 * Upload file (mock - records metadata)
 */
const uploadFile = async (userId, fileData) => {
  const data = db.read();

  if (!data.files) {
    data.files = [];
  }

  // Validate file size
  if (fileData.size > MAX_FILE_SIZE) {
    throw new Error(`File size exceeds maximum of ${MAX_FILE_SIZE / (1024 * 1024)}MB`);
  }

  // Validate extension
  const ext = path.extname(fileData.filename).toLowerCase();
  const allAllowed = Object.values(ALLOWED_EXTENSIONS).flat();
  if (!allAllowed.includes(ext)) {
    throw new Error(`File extension ${ext} is not allowed`);
  }

  const fileId = uuidv4();
  const storagePath = `uploads/${userId}/${fileId}${ext}`;

  const file = {
    id: fileId,
    userId,
    filename: fileData.filename,
    originalName: fileData.originalName || fileData.filename,
    mimeType: fileData.mimeType,
    size: fileData.size,
    extension: ext,
    category: getFileCategory(ext),
    storagePath,
    storageType: STORAGE_TYPE.LOCAL,
    publicUrl: fileData.publicUrl || null,
    metadata: fileData.metadata || {},
    tags: fileData.tags || [],
    status: FILE_STATUS.ACTIVE,
    checksum: fileData.checksum || null,
    uploadedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  data.files.push(file);
  db.write(data);

  return file;
};

/**
 * Get file category from extension
 */
const getFileCategory = (ext) => {
  for (const [category, extensions] of Object.entries(ALLOWED_EXTENSIONS)) {
    if (extensions.includes(ext)) {
      return category;
    }
  }
  return "other";
};

/**
 * Get file by ID
 */
const getFileById = async (fileId) => {
  const data = db.read();
  const file = (data.files || []).find((f) => f.id === fileId);

  if (!file) {
    throw new Error("File not found");
  }

  return file;
};

/**
 * Get user files
 */
const getUserFiles = async (userId, filters = {}) => {
  const data = db.read();
  let files = (data.files || []).filter(
    (f) => f.userId === userId && f.status !== FILE_STATUS.DELETED
  );

  if (filters.category) {
    files = files.filter((f) => f.category === filters.category);
  }

  if (filters.extension) {
    files = files.filter((f) => f.extension === filters.extension);
  }

  if (filters.tags && filters.tags.length > 0) {
    files = files.filter((f) =>
      filters.tags.some((tag) => f.tags.includes(tag))
    );
  }

  if (filters.search) {
    const searchTerm = filters.search.toLowerCase();
    files = files.filter(
      (f) =>
        f.filename.toLowerCase().includes(searchTerm) ||
        f.originalName.toLowerCase().includes(searchTerm)
    );
  }

  // Sort by upload date descending
  files.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));

  // Pagination
  const page = filters.page || 1;
  const limit = filters.limit || 20;
  const startIndex = (page - 1) * limit;

  return {
    files: files.slice(startIndex, startIndex + limit),
    total: files.length,
    page,
    totalPages: Math.ceil(files.length / limit),
  };
};

/**
 * Update file metadata
 */
const updateFile = async (fileId, userId, updates) => {
  const data = db.read();
  const index = (data.files || []).findIndex(
    (f) => f.id === fileId && f.userId === userId
  );

  if (index === -1) {
    throw new Error("File not found or unauthorized");
  }

  const file = data.files[index];

  if (updates.filename) {
    file.filename = updates.filename;
  }

  if (updates.metadata) {
    file.metadata = { ...file.metadata, ...updates.metadata };
  }

  if (updates.tags) {
    file.tags = updates.tags;
  }

  if (updates.publicUrl !== undefined) {
    file.publicUrl = updates.publicUrl;
  }

  file.updatedAt = new Date().toISOString();
  data.files[index] = file;
  db.write(data);

  return file;
};

/**
 * Delete file (soft delete)
 */
const deleteFile = async (fileId, userId) => {
  const data = db.read();
  const index = (data.files || []).findIndex(
    (f) => f.id === fileId && f.userId === userId
  );

  if (index === -1) {
    throw new Error("File not found or unauthorized");
  }

  data.files[index].status = FILE_STATUS.DELETED;
  data.files[index].deletedAt = new Date().toISOString();
  data.files[index].updatedAt = new Date().toISOString();

  db.write(data);

  return { success: true };
};

/**
 * Archive file
 */
const archiveFile = async (fileId, userId) => {
  const data = db.read();
  const index = (data.files || []).findIndex(
    (f) => f.id === fileId && f.userId === userId
  );

  if (index === -1) {
    throw new Error("File not found or unauthorized");
  }

  data.files[index].status = FILE_STATUS.ARCHIVED;
  data.files[index].archivedAt = new Date().toISOString();
  data.files[index].updatedAt = new Date().toISOString();

  db.write(data);

  return data.files[index];
};

/**
 * Restore archived file
 */
const restoreFile = async (fileId, userId) => {
  const data = db.read();
  const index = (data.files || []).findIndex(
    (f) => f.id === fileId && f.userId === userId
  );

  if (index === -1) {
    throw new Error("File not found or unauthorized");
  }

  if (data.files[index].status !== FILE_STATUS.ARCHIVED) {
    throw new Error("File is not archived");
  }

  data.files[index].status = FILE_STATUS.ACTIVE;
  data.files[index].restoredAt = new Date().toISOString();
  data.files[index].updatedAt = new Date().toISOString();

  db.write(data);

  return data.files[index];
};

/**
 * Get storage usage for user
 */
const getStorageUsage = async (userId) => {
  const data = db.read();
  const files = (data.files || []).filter(
    (f) => f.userId === userId && f.status !== FILE_STATUS.DELETED
  );

  const totalSize = files.reduce((sum, f) => sum + f.size, 0);

  const byCategory = {};
  files.forEach((f) => {
    if (!byCategory[f.category]) {
      byCategory[f.category] = { count: 0, size: 0 };
    }
    byCategory[f.category].count++;
    byCategory[f.category].size += f.size;
  });

  return {
    userId,
    totalFiles: files.length,
    totalSize,
    totalSizeMB: totalSize / (1024 * 1024),
    byCategory,
    activeFiles: files.filter((f) => f.status === FILE_STATUS.ACTIVE).length,
    archivedFiles: files.filter((f) => f.status === FILE_STATUS.ARCHIVED).length,
  };
};

/**
 * Generate signed URL (mock)
 */
const generateSignedUrl = async (fileId, expirationMinutes = 60) => {
  const file = await getFileById(fileId);

  // Mock signed URL generation
  const expiration = new Date(Date.now() + expirationMinutes * 60 * 1000);
  const signature = `sig_${uuidv4().replace(/-/g, "")}`;

  return {
    fileId,
    url: `https://storage.example.com/${file.storagePath}?sig=${signature}&exp=${expiration.getTime()}`,
    expiresAt: expiration.toISOString(),
    expirationMinutes,
  };
};

/**
 * Duplicate file
 */
const duplicateFile = async (fileId, userId) => {
  const original = await getFileById(fileId);

  if (original.userId !== userId) {
    throw new Error("Unauthorized");
  }

  const data = db.read();
  const newFileId = uuidv4();
  const ext = original.extension;

  const duplicate = {
    ...original,
    id: newFileId,
    filename: `Copy of ${original.filename}`,
    storagePath: `uploads/${userId}/${newFileId}${ext}`,
    uploadedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  data.files.push(duplicate);
  db.write(data);

  return duplicate;
};

/**
 * Get storage statistics
 */
const getStorageStatistics = async () => {
  const data = db.read();
  const files = data.files || [];

  const activeFiles = files.filter((f) => f.status === FILE_STATUS.ACTIVE);
  const totalSize = activeFiles.reduce((sum, f) => sum + f.size, 0);

  const byCategory = {};
  const byExtension = {};

  activeFiles.forEach((f) => {
    byCategory[f.category] = (byCategory[f.category] || 0) + 1;
    byExtension[f.extension] = (byExtension[f.extension] || 0) + 1;
  });

  return {
    totalFiles: files.length,
    activeFiles: activeFiles.length,
    archivedFiles: files.filter((f) => f.status === FILE_STATUS.ARCHIVED).length,
    deletedFiles: files.filter((f) => f.status === FILE_STATUS.DELETED).length,
    totalSize,
    totalSizeGB: totalSize / (1024 * 1024 * 1024),
    byCategory,
    byExtension,
    averageFileSize: activeFiles.length > 0 ? totalSize / activeFiles.length : 0,
  };
};

module.exports = {
  STORAGE_TYPE,
  FILE_STATUS,
  ALLOWED_EXTENSIONS,
  MAX_FILE_SIZE,
  uploadFile,
  getFileById,
  getUserFiles,
  updateFile,
  deleteFile,
  archiveFile,
  restoreFile,
  getStorageUsage,
  generateSignedUrl,
  duplicateFile,
  getStorageStatistics,
};
