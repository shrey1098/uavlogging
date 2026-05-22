/**
 * Cloudflare R2 client — #005
 *
 * R2 speaks the AWS S3 API. We use @aws-sdk/client-s3 with R2's
 * S3-compatible endpoint. Backend holds the only credentials; the
 * parser (and any other downstream) gets time-limited presigned URLs
 * at dispatch time, never raw credentials.
 *
 * Required env (set in .env):
 *   R2_ACCOUNT_ID         — Cloudflare account ID
 *   R2_ACCESS_KEY_ID      — R2 API token access key
 *   R2_SECRET_ACCESS_KEY  — R2 API token secret
 *   R2_BUCKET             — bucket name
 *   R2_ENDPOINT           — usually https://<account_id>.r2.cloudflarestorage.com
 *
 * #005 portability: bucket and endpoint move with the Cloudflare
 * account, not with the host. No code change required when parser is
 * migrated to a separate cloud host — only env values shift.
 */

const fs = require('fs');
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const logger = require('./logger');

const REQUIRED_ENV = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET', 'R2_ENDPOINT'];

const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missing.length > 0) {
  logger.warn(`R2 env missing: ${missing.join(', ')}. Uploads will fail until configured.`);
}

const r2 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
  },
});

const BUCKET = process.env.R2_BUCKET;

// Presigned URL TTL — tunable per #005 Notes. Binding: time-limited.
const PRESIGNED_URL_TTL_SECONDS = parseInt(process.env.R2_PRESIGNED_TTL_SECONDS, 10) || 3600;

/**
 * Build the canonical R2 key for a flight log.
 * Convention from #005: flight-logs/<flightLogId>/<storedName>
 */
const buildR2Key = (flightLogId, storedName) =>
  `flight-logs/${flightLogId}/${storedName}`;

/**
 * Upload a local file to R2. Used by the upload controller after multer
 * accepts the file. On success, the caller should delete the local
 * temp file — R2 is the canonical store.
 */
const putObject = async ({ key, filePath, contentType }) => {
  const body = fs.createReadStream(filePath);
  const cmd = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: body,
    ContentType: contentType || 'application/octet-stream',
  });
  await r2.send(cmd);
  logger.info(`R2 PUT ok: ${key}`);
  return key;
};

/**
 * Mint a fresh presigned URL for a stored object. Used at parse
 * dispatch — the URL is never persisted; a new one is generated for
 * every dispatch.
 */
const getPresignedUrl = async (key, ttlSeconds = PRESIGNED_URL_TTL_SECONDS) => {
  const cmd = new GetObjectCommand({ Bucket: BUCKET, Key: key });
  return getSignedUrl(r2, cmd, { expiresIn: ttlSeconds });
};

/**
 * Delete an object from R2 — used when a FlightLog is deleted to keep
 * R2 in sync with the database.
 */
const deleteObject = async (key) => {
  const cmd = new DeleteObjectCommand({ Bucket: BUCKET, Key: key });
  await r2.send(cmd);
  logger.info(`R2 DELETE ok: ${key}`);
};

module.exports = {
  r2,
  BUCKET,
  buildR2Key,
  putObject,
  getPresignedUrl,
  deleteObject,
  PRESIGNED_URL_TTL_SECONDS,
};
