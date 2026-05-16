const multer = require('multer');
const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const logger = require('./logger');

// ── R2 Client ──────────────────────────────────────────────
const r2 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId:     process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const BUCKET = process.env.R2_BUCKET_NAME;

// ── Log type detection ─────────────────────────────────────
const LOG_TYPE_MAP = {
  '.bin':  'ardupilot_bin',
  '.tlog': 'ardupilot_tlog',
  '.ulg':  'px4_ulg',
  '.csv':  'csv',
  '.kml':  'kml',
  '.log':  'skydroid',
};

function detectLogType(filename) {
  const ext = path.extname(filename).toLowerCase();
  return LOG_TYPE_MAP[ext] || 'unknown';
}

// ── Multer — memory storage (buffer → R2) ──────────────────
const allowedExtensions = (process.env.ALLOWED_EXTENSIONS || '.bin,.tlog,.ulg,.csv,.kml,.log').split(',');
const maxSizeMB = parseInt(process.env.MAX_FILE_SIZE_MB || '500', 10);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maxSizeMB * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${ext} not allowed. Allowed: ${allowedExtensions.join(', ')}`));
    }
  },
});

// ── Upload buffer to R2 ────────────────────────────────────
async function uploadToR2(file) {
  const ext = path.extname(file.originalname).toLowerCase();
  const storedName = `${uuidv4()}${ext}`;
  const key = `raw/${storedName}`;

  await r2.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: file.buffer,
    ContentType: file.mimetype || 'application/octet-stream',
    ContentLength: file.size,
  }));

  const fileUrl = `${process.env.R2_PUBLIC_URL}/${key}`;

  logger.info(`Uploaded to R2: ${key} (${file.size} bytes)`);

  return {
    storedName,
    key,
    fileUrl,
    logType: detectLogType(file.originalname),
  };
}

// ── Delete from R2 ─────────────────────────────────────────
async function deleteFromR2(key) {
  try {
    await r2.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
    logger.info(`Deleted from R2: ${key}`);
  } catch (err) {
    logger.warn(`Failed to delete from R2: ${key} — ${err.message}`);
  }
}

module.exports = { upload, uploadToR2, deleteFromR2, detectLogType };
