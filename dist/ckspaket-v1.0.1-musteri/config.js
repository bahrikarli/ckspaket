const sql = require('mssql');
const path = require('path');

try {
  require('dotenv').config({ path: path.join(__dirname, '.env'), quiet: true });
} catch (_) {}

const config = {
  user: process.env.DB_USER || 'sa',
  password: process.env.DB_PASS || '189189',
  server: process.env.DB_SERVER || 'YENISERVER',
  database: process.env.DB_NAME || 'ckspaketdata',
  ...(process.env.DB_PORT ? { port: parseInt(process.env.DB_PORT, 10) } : {}),
  options: {
    encrypt: false,
    trustServerCertificate: true
  }
};

let pool;
async function getPool() {
  if (!pool) {
    pool = await sql.connect(config);
    console.log('Veritabanına bağlandı:', config.database, `(${config.server})`);
  }
  return pool;
}

module.exports = getPool;
