const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');

const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || 'uploads', 'raw');

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const ALLOWED_MIME_TYPES = new Set([
  'application/octet-stream', // .bin, .ulg
  'text/csv',
  'text/plain',               // .log, .tlog
  'application/vnd.google-earth.kml+xml',
  'application/xml',
  'text/xml',
]);

const ALLOWED_EXTENSIONS = new Set(
  (process.env.ALLOWED_EXTENSIONS || '.bin,.tlog,.ulg,.csv,.kml,.log')
    .split(',')
    .map((ext) => ext.trim().toLowerCase())
);

const MAX_FILE_SIZE = (parseInt(process.env.MAX_FILE_SIZE_MB, 10) || 500) * 1024 * 1024;

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const uniqueName = `${uuidv4()}${ext}`;
    cb(null, uniqueName);
  },
});

const fileFilter = (_req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return cb(
      new Error(`File type "${ext}" is not allowed. Supported: ${[...ALLOWED_EXTENSIONS].join(', ')}`),
      false
    );
  }
  cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE },
});

/**
 * Detect log format from file extension and original name.
 * Returns one of: 'ardupilot_bin' | 'ardupilot_tlog' | 'px4_ulg' | 'csv' | 'kml' | 'skydroid' | 'unknown'
 */
const detectLogType = (originalName) => {
  const ext = path.extname(originalName).toLowerCase();
  const base = path.basename(originalName).toLowerCase();

  if (ext === '.bin') return 'ardupilot_bin';
  if (ext === '.tlog') return 'ardupilot_tlog';
  if (ext === '.ulg') return 'px4_ulg';
  if (ext === '.kml') return 'kml';
  if (ext === '.csv') {
    // Skydroid CSVs tend to have "skydroid" in their filename
    if (base.includes('skydroid')) return 'skydroid';
    return 'csv';
  }
  if (ext === '.log') return 'ardupilot_bin'; // older ArduPilot text logs

  return 'unknown';
};

module.exports = { upload, detectLogType, UPLOAD_DIR };
