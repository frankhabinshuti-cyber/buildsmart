const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env'), quiet: true });

const isProd = process.env.NODE_ENV === 'production';

const env = {
  isProd,
  isTest: process.env.NODE_ENV === 'test',
  port: Number(process.env.PORT || 4000),
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'buildsmart',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'buildsmart',
  },
  jwtSecret: process.env.JWT_SECRET || '',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB || 10),
  uploadDir: path.join(__dirname, '..', '..', 'uploads'),
};

// Fail fast: a missing or weak secret would make every login token forgeable.
if (!env.jwtSecret || env.jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must be set in .env and be at least 32 characters long.');
}

module.exports = env;
