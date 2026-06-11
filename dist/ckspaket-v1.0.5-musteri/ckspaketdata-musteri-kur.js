/**
 * Müşteri PC — localhost SQL Express üzerinde ckspaketdata kurar
 * sema/ckspaketdata-sema.bak dosyasindan restore eder
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

try {
  require('dotenv').config({ path: path.join(__dirname, '.env'), quiet: true });
} catch (_) {}

const KOK = __dirname;
const BAK = path.join(KOK, 'sema', 'ckspaketdata-sema.bak');
const DB = process.env.DB_NAME || 'ckspaketdata';
const USER = process.env.DB_USER || 'sa';
const PASS = process.env.DB_PASS || '189189';

const SUNUCU_ADAYLARI = [
  process.env.DB_SERVER,
  'localhost',
  '127.0.0.1',
  '.',
  '(local)',
  'localhost\\SQLEXPRESS',
  '.\\SQLEXPRESS'
].filter(Boolean);

const VERI_YOLLARI = [
  'C:\\Program Files\\Microsoft SQL Server\\MSSQL16.MSSQLSERVER\\MSSQL\\DATA',
  'C:\\Program Files\\Microsoft SQL Server\\MSSQL17.MSSQLSERVER\\MSSQL\\DATA',
  'C:\\Program Files\\Microsoft SQL Server\\MSSQL15.MSSQLSERVER\\MSSQL\\DATA',
  'C:\\Program Files\\Microsoft SQL Server\\MSSQL16.SQLEXPRESS\\MSSQL\\DATA',
  'C:\\Program Files\\Microsoft SQL Server\\MSSQL17.SQLEXPRESS\\MSSQL\\DATA'
];

function sqlcmd(sunucu, sql) {
  const q = sql.replace(/"/g, '""');
  execSync(`sqlcmd -S "${sunucu}" -U ${USER} -P ${PASS} -Q "${q}"`, { stdio: 'inherit' });
}

function sunucuBul() {
  for (const s of SUNUCU_ADAYLARI) {
    try {
      execSync(`sqlcmd -S "${s}" -U ${USER} -P ${PASS} -Q "SELECT 1"`, { stdio: 'pipe' });
      console.log('SQL sunucu:', s);
      return s;
    } catch (_) {}
  }
  throw new Error(
    'SQL Server bulunamadi. Servis calisiyor mu?\n' +
    'Denenen: ' + SUNUCU_ADAYLARI.join(', ') + '\n' +
    '.env icinde DB_SERVER=localhost ayarlayin.'
  );
}

function veriKlasoruBul() {
  for (const p of VERI_YOLLARI) {
    if (fs.existsSync(p)) return p;
  }
  return VERI_YOLLARI[0];
}

function main() {
  console.log('=== ckspaketdata — Musteri SQL Kurulum ===');
  console.log('');

  if (!fs.existsSync(BAK)) {
    console.error('HATA: sema/ckspaketdata-sema.bak bulunamadi.');
    console.error('Gelistirici ckspaket-sema-yedek-al.bat calistirmali.');
    process.exit(1);
  }

  const mb = (fs.statSync(BAK).size / 1024 / 1024).toFixed(1);
  console.log('Sema yedegi:', BAK, `(${mb} MB)`);

  const sunucu = sunucuBul();
  const veri = veriKlasoruBul();
  const mdf = path.join(veri, `${DB}.mdf`);
  const ldf = path.join(veri, `${DB}_log.ldf`);
  const bakWin = BAK.replace(/\\/g, '\\\\');

  console.log('Veritabani dosyalari:', veri);
  console.log('Restore basliyor...');
  console.log('');

  try {
    sqlcmd(sunucu, `
IF EXISTS (SELECT 1 FROM sys.databases WHERE name = N'${DB}')
BEGIN
  ALTER DATABASE [${DB}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
  DROP DATABASE [${DB}];
END`);
  } catch (_) {}

  sqlcmd(sunucu, `
RESTORE DATABASE [${DB}]
FROM DISK = N'${bakWin}'
WITH REPLACE,
MOVE N'anaa' TO N'${mdf.replace(/\\/g, '\\\\')}',
MOVE N'anaa_log' TO N'${ldf.replace(/\\/g, '\\\\')}',
RECOVERY`);

  sqlcmd(sunucu, `SELECT name, state_desc FROM sys.databases WHERE name = N'${DB}'`);

  console.log('');
  console.log('Tamam —', DB, 'hazir.');
  console.log('.env kontrol: DB_SERVER=' + sunucu);
  console.log('Sonra: MUSTERI-KUR.bat veya ckspaket-baslat.bat');
}

main();
