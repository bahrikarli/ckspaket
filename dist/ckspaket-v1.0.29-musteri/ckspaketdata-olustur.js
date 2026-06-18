/**
 * ckspaketdata veritabani olusturur (demoanaa'dan sema + istege bagli veri)
 * Kullanim:
 *   node ckspaketdata-olustur.js           onizleme
 *   node ckspaketdata-olustur.js --uygula  sema olustur
 *   node ckspaketdata-olustur.js --uygula --veri  sema + veri kopyala
 */
const sql = require('mssql');
const path = require('path');

try {
  require('dotenv').config({ path: path.join(__dirname, '.env'), quiet: true });
} catch (_) {}

const KAYNAK_DB = process.env.CKSPAKET_KAYNAK_DB || 'demoanaa';
const HEDEF_DB = process.env.DB_NAME || 'ckspaketdata';
const UYGULA = process.argv.includes('--uygula');
const VERI = process.argv.includes('--veri');

const baseConfig = {
  user: process.env.DB_USER || 'sa',
  password: process.env.DB_PASS || '189189',
  server: process.env.DB_SERVER || 'YENISERVER',
  options: { encrypt: false, trustServerCertificate: true },
  requestTimeout: 300000,
  connectionTimeout: 60000
};

function sqlTip(col) {
  let t = col.DATA_TYPE.toUpperCase();
  if (['NVARCHAR', 'VARCHAR', 'NCHAR', 'CHAR', 'BINARY', 'VARBINARY'].includes(t)) {
    const len = col.CHARACTER_MAXIMUM_LENGTH;
    if (len === -1) t += '(MAX)';
    else if (len) t += `(${len})`;
  } else if (['DECIMAL', 'NUMERIC'].includes(t)) {
    t += `(${col.NUMERIC_PRECISION},${col.NUMERIC_SCALE})`;
  } else if (t === 'FLOAT' && col.NUMERIC_PRECISION) {
    t += `(${col.NUMERIC_PRECISION})`;
  }
  return t;
}

function kolonTanim(col) {
  let s = `[${col.COLUMN_NAME}] ${sqlTip(col)}`;
  s += col.IS_NULLABLE === 'YES' ? ' NULL' : ' NOT NULL';
  return s;
}

async function kolonlariAl(pool, db) {
  const r = await pool.request().query(`
    SELECT TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME, DATA_TYPE,
           CHARACTER_MAXIMUM_LENGTH, NUMERIC_PRECISION, NUMERIC_SCALE,
           IS_NULLABLE, ORDINAL_POSITION
    FROM [${db}].INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'dbo'
    ORDER BY TABLE_NAME, ORDINAL_POSITION
  `);
  const map = new Map();
  for (const row of r.recordset) {
    const key = `${row.TABLE_SCHEMA}.${row.TABLE_NAME}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  return map;
}

async function tablolariAl(pool, db) {
  const r = await pool.request().query(`
    SELECT s.name AS TABLE_NAME
    FROM [${db}].sys.tables s
    WHERE s.is_ms_shipped = 0
    ORDER BY s.name
  `);
  return new Set(r.recordset.map((x) => x.TABLE_NAME));
}

async function main() {
  console.log('=== ckspaketdata Olustur ===');
  console.log('Sunucu:', baseConfig.server);
  console.log('Kaynak:', KAYNAK_DB, '| Hedef:', HEDEF_DB);
  console.log('Mod  :', UYGULA ? (VERI ? 'UYGULA + VERI' : 'UYGULA') : 'ONIZLEME');
  console.log('');

  const pool = await sql.connect({ ...baseConfig, database: 'master' });

  const dbCheck = await pool.request().query(`
    SELECT name FROM sys.databases WHERE name IN ('${KAYNAK_DB}','${HEDEF_DB}')
  `);
  const names = new Set(dbCheck.recordset.map((x) => x.name));
  if (!names.has(KAYNAK_DB)) throw new Error(`Kaynak veritabani yok: ${KAYNAK_DB}`);

  if (!names.has(HEDEF_DB)) {
    console.log(`Veritabani yok, olusturulacak: ${HEDEF_DB}`);
    if (UYGULA) {
      await pool.request().query(`CREATE DATABASE [${HEDEF_DB}]`);
      console.log('  OK: CREATE DATABASE', HEDEF_DB);
    }
  } else {
    console.log('Veritabani mevcut:', HEDEF_DB);
  }

  if (!UYGULA) {
    console.log('\nOnizleme. Uygulamak icin:');
    console.log('  node ckspaketdata-olustur.js --uygula');
    console.log('  node ckspaketdata-olustur.js --uygula --veri');
    await pool.close();
    return;
  }

  const kaynakTablolar = await tablolariAl(pool, KAYNAK_DB);
  const hedefTablolar = names.has(HEDEF_DB) ? await tablolariAl(pool, HEDEF_DB) : new Set();
  const kaynakKolonlar = await kolonlariAl(pool, KAYNAK_DB);
  const hedefKolonlar = names.has(HEDEF_DB) ? await kolonlariAl(pool, HEDEF_DB) : new Map();

  let ok = 0;
  let hata = 0;

  for (const tablo of [...kaynakTablolar].sort()) {
    if (!hedefTablolar.has(tablo)) {
      try {
        await pool.request().query(`
          IF NOT EXISTS (SELECT 1 FROM [${HEDEF_DB}].sys.tables WHERE name = N'${tablo}')
          BEGIN
            SELECT * INTO [${HEDEF_DB}].dbo.[${tablo}]
            FROM [${KAYNAK_DB}].dbo.[${tablo}]
            WHERE 1 = 0;
          END`);
        console.log('  + TABLO', tablo);
        ok++;
      } catch (e) {
        console.error('  HATA TABLO', tablo, '-', e.message);
        hata++;
      }
      continue;
    }

    const kKey = `dbo.${tablo}`;
    const kCols = kaynakKolonlar.get(kKey) || [];
    const hCols = new Set((hedefKolonlar.get(kKey) || []).map((c) => c.COLUMN_NAME));
    for (const col of kCols) {
      if (!hCols.has(col.COLUMN_NAME)) {
        try {
          await pool.request().query(`
            IF COL_LENGTH('[${HEDEF_DB}].dbo.[${tablo}]', '${col.COLUMN_NAME}') IS NULL
              ALTER TABLE [${HEDEF_DB}].dbo.[${tablo}] ADD ${kolonTanim(col)};`);
          console.log('  + KOLON', tablo + '.' + col.COLUMN_NAME);
          ok++;
        } catch (e) {
          console.error('  HATA KOLON', tablo, col.COLUMN_NAME, '-', e.message);
          hata++;
        }
      }
    }
  }

  if (VERI) {
    console.log('\nVeri kopyalaniyor (demoanaa -> ckspaketdata)...');
    const guncelHedef = await tablolariAl(pool, HEDEF_DB);
    for (const tablo of [...kaynakTablolar].sort()) {
      if (!guncelHedef.has(tablo)) continue;
      try {
        const hedefSay = await pool.request().query(`SELECT COUNT(1) AS n FROM [${HEDEF_DB}].dbo.[${tablo}]`);
        if (hedefSay.recordset[0].n > 0) continue;

        const idCol = await pool.request().query(`
          SELECT COL_NAME(ic.object_id, ic.column_id) AS col
          FROM [${KAYNAK_DB}].sys.identity_columns ic
          INNER JOIN [${KAYNAK_DB}].sys.tables t ON t.object_id = ic.object_id
          WHERE t.name = N'${tablo.replace(/'/g, "''")}'`);
        const identityCol = idCol.recordset[0]?.col;

        if (identityCol) {
          await pool.request().query(`SET IDENTITY_INSERT [${HEDEF_DB}].dbo.[${tablo}] ON`);
          await pool.request().query(`
            INSERT INTO [${HEDEF_DB}].dbo.[${tablo}]
            SELECT * FROM [${KAYNAK_DB}].dbo.[${tablo}]`);
          await pool.request().query(`SET IDENTITY_INSERT [${HEDEF_DB}].dbo.[${tablo}] OFF`);
        } else {
          await pool.request().query(`
            INSERT INTO [${HEDEF_DB}].dbo.[${tablo}]
            SELECT * FROM [${KAYNAK_DB}].dbo.[${tablo}]`);
        }
        const cnt = await pool.request().query(`SELECT COUNT(1) AS n FROM [${HEDEF_DB}].dbo.[${tablo}]`);
        console.log('  + VERI', tablo, cnt.recordset[0].n, 'satir');
        ok++;
      } catch (e) {
        console.error('  HATA VERI', tablo, '-', e.message);
        hata++;
      }
    }
  }

  console.log(`\nTamamlandi: ${ok} basarili, ${hata} hata`);
  console.log('Sunucuyu baslatin: ckspaket-baslat.bat');
  await pool.close();
}

main().catch((e) => {
  console.error('HATA:', e.message);
  process.exit(1);
});
