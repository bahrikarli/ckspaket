/**
 * ckspaketdata yedeğini sema/ klasörüne alır (müşteri paketi için)
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

try {
  require('dotenv').config({ path: path.join(__dirname, '.env'), quiet: true });
} catch (_) {}

const KOK = __dirname;
const SEMA = path.join(KOK, 'sema');
const HEDEF = path.join(SEMA, 'ckspaketdata-sema.bak');
const server = process.env.DB_SERVER || 'YENISERVER';
const pass = process.env.DB_PASS || '189189';
const geciciSunucu = 'C:\\Windows\\Temp\\ckspaketdata-sema.bak';

fs.mkdirSync(SEMA, { recursive: true });

console.log('Sunucu:', server);
console.log('Yedek aliniyor...');

execSync(
  `sqlcmd -S ${server} -U sa -P ${pass} -Q "BACKUP DATABASE ckspaketdata TO DISK = N'${geciciSunucu}' WITH FORMAT, INIT"`,
  { stdio: 'inherit' }
);

const paylasim = `\\\\${server.replace(/\\.*$/, '')}\\c$\\Windows\\Temp\\ckspaketdata-sema.bak`;
const yerelGecici = path.join(KOK, 'dist', '_sema.bak');

try {
  if (fs.existsSync(paylasim)) {
    fs.copyFileSync(paylasim, HEDEF);
  } else {
    throw new Error('paylasim yok');
  }
} catch (_) {
  console.log('Ag kopyasi yok — sqlcmd ile yerel hedef deneniyor...');
  try {
    execSync(
      `sqlcmd -S ${server} -U sa -P ${pass} -Q "BACKUP DATABASE ckspaketdata TO DISK = N'${HEDEF.replace(/\\/g, '\\\\')}' WITH FORMAT, INIT"`,
      { stdio: 'inherit' }
    );
  } catch (e) {
    console.error('');
    console.error('sema klasorune yedek alinamadi.');
    console.error('SQL sunucusunda (SSMS veya sqlcmd) su komutu calistirin:');
    console.error(`  BACKUP DATABASE ckspaketdata TO DISK = N'C:\\ckspaket\\sema\\ckspaketdata-sema.bak' WITH FORMAT, INIT`);
    process.exit(1);
  }
}

if (fs.existsSync(HEDEF)) {
  const mb = (fs.statSync(HEDEF).size / 1024 / 1024).toFixed(1);
  console.log('OK:', HEDEF, `(${mb} MB)`);
}
