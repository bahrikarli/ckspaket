/**
 * CKS Paket — TaramaOnEk kolonu ve admin API (server.js uyumluluk)
 * Admin rotaları ckspaket-sunucu.js içinde paket-admin ile kayıtlıdır.
 */
const getPool = require('./config');

let taramaOnEkKolonHazir = false;

async function ensureTaramaOnEkKolon(pool) {
  if (!pool) {
    if (taramaOnEkKolonHazir) return;
    pool = await getPool();
  }
  try {
    await pool.request().query(`
      IF COL_LENGTH('Kullanicilar', 'TaramaOnEk') IS NULL
        ALTER TABLE Kullanicilar ADD TaramaOnEk NVARCHAR(100) NULL;
    `);
    taramaOnEkKolonHazir = true;
  } catch (err) {
    console.warn('TaramaOnEk kolonu kontrolü:', err.message);
  }
}

/** Rotalar ckspaket-sunucu → paket-admin üzerinden zaten kayıtlı */
function registerPersonelAdmin() {}

module.exports = { registerPersonelAdmin, ensureTaramaOnEkKolon };
