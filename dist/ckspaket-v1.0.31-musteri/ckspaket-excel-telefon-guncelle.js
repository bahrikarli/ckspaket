/**
 * CSV → çksdilekçe.Telefon güncelleme (TC ile eşleştir)
 *
 * CSV basliklari: Tc Kimlik No (veya tc) + tel (veya telefon)
 *
 * Kullanım:
 *   node ckspaket-excel-telefon-guncelle.js tel.csv
 *   node ckspaket-excel-telefon-guncelle.js tel.csv --uygula
 */
const fs = require('fs');
const path = require('path');
const sql = require('mssql');

try {
  require('dotenv').config({ path: path.join(__dirname, '.env'), quiet: true });
} catch (_) {}

const getPool = require('./config');

const SCRIPT_SURUM = '2026-06-10a';
const UYGULA = process.argv.includes('--uygula');
const dosyaArg = process.argv.find(
  (a, i) => i >= 2 && !a.startsWith('--') && (a.endsWith('.csv') || a.endsWith('.xlsx') || a.endsWith('.xls') || a.endsWith('.txt'))
);

const KOLON_ESLES = {
  tc: ['tc kimlik no', 'tc', 'tc kimlik', 'tckimlik', 't.c. kimlik no'],
  vergino: ['vergino', 'vergi no', 'vkn'],
  telefon: ['tel', 'telefon', 'gsm', 'cep', 'phone']
};

function normBaslik(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/ı/g, 'i')
    .replace(/İ/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/\s+/g, ' ')
    .replace(/_/g, ' ');
}

function kolonBul(basliklar, alan) {
  const aday = KOLON_ESLES[alan].map(normBaslik);
  for (let i = 0; i < basliklar.length; i++) {
    if (aday.includes(normBaslik(basliklar[i]))) return i;
  }
  return -1;
}

function ayiriciBul(satir) {
  if (satir.includes('\t')) return '\t';
  if (satir.includes(';') && !satir.includes(',')) return ';';
  return ',';
}

function satirOkuCsv(metin) {
  const satirlar = metin.replace(/^\uFEFF/, '').split(/\r?\n/).filter((s) => s.trim());
  if (!satirlar.length) return { basliklar: [], satirlar: [] };
  const ayir = ayiriciBul(satirlar[0]);
  const parse = (line) => {
    if (ayir === '\t') return line.split('\t').map((c) => c.trim());
    const out = [];
    let cur = '';
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') { q = !q; continue; }
      if (c === ayir && !q) { out.push(cur.trim()); cur = ''; continue; }
      cur += c;
    }
    out.push(cur.trim());
    return out;
  };
  return { basliklar: parse(satirlar[0]), satirlar: satirlar.slice(1).map(parse).filter((r) => r.some((c) => c)) };
}

function dosyaOku(dosyaYol) {
  const ext = path.extname(dosyaYol).toLowerCase();
  if (ext === '.xlsx' || ext === '.xls') {
    let XLSX;
    try { XLSX = require('xlsx'); } catch (_) {
      throw new Error('XLSX icin: npm install xlsx — veya CSV UTF-8 kaydedin.');
    }
    const wb = XLSX.readFile(dosyaYol);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    return {
      basliklar: (rows[0] || []).map(String),
      satirlar: rows.slice(1).filter((r) => r.some((c) => String(c).trim())).map((r) => r.map(String))
    };
  }
  return satirOkuCsv(fs.readFileSync(dosyaYol, 'utf8'));
}

function sadeceRakam(s) {
  return String(s || '').replace(/\D/g, '');
}

function tcAnahtarlari(tc) {
  const d = sadeceRakam(tc);
  const keys = new Set();
  if (!d) return keys;
  keys.add(d);
  if (d.length === 10) keys.add('0' + d);
  if (d.length === 11 && d.startsWith('0')) keys.add(d.slice(1));
  if (d.length >= 10) keys.add(d.slice(-10));
  return keys;
}

function telefonTemizle(s) {
  const v = String(s || '').trim();
  if (!v) return null;
  return v;
}

function satirDonustur(basliklar, hucreler) {
  const idx = {};
  for (const alan of Object.keys(KOLON_ESLES)) idx[alan] = kolonBul(basliklar, alan);
  const al = (a) => {
    const i = idx[a];
    return i >= 0 ? String(hucreler[i] || '').trim() : '';
  };

  let tc = sadeceRakam(al('tc'));
  let vergi = sadeceRakam(al('vergino'));
  if (!tc && vergi.length === 11) tc = vergi;
  if (!vergi && tc.length === 10) vergi = tc;
  if (tc.length !== 11) tc = '';
  if (vergi.length !== 10) vergi = '';

  const telefon = telefonTemizle(al('telefon'));
  if ((!tc && !vergi) || !telefon) return null;

  return { tc: tc || null, vergino: vergi || null, telefon };
}

async function ciftciEslemeAl(pool) {
  const r = await pool.request().query(`
    SELECT Kimlik, [Tc Kimlik No] AS tc, vergino FROM [çksdilekçe]`);
  const tcMap = new Map();
  const vergiMap = new Map();
  for (const row of r.recordset) {
    if (row.Kimlik == null) continue;
    for (const key of tcAnahtarlari(row.tc)) tcMap.set(key, row.Kimlik);
    const v = sadeceRakam(row.vergino);
    if (v.length === 10) vergiMap.set(v, row.Kimlik);
  }
  return { tcMap, vergiMap };
}

function kimlikBul(esleme, tc, vergino) {
  if (tc) {
    for (const key of tcAnahtarlari(tc)) {
      if (esleme.tcMap.has(key)) return esleme.tcMap.get(key);
    }
  }
  if (vergino) {
    const v = sadeceRakam(vergino);
    if (esleme.vergiMap.has(v)) return esleme.vergiMap.get(v);
  }
  return null;
}

async function telefonYaz(pool, kimlikid, telefon) {
  const r = await pool.request()
    .input('kid', sql.Int, kimlikid)
    .input('tel', sql.NVarChar, telefon)
    .query(`
      UPDATE [çksdilekçe] SET Telefon = @tel
      WHERE Kimlik = @kid`);
  return (r.rowsAffected[0] || 0) > 0;
}

async function main() {
  if (!dosyaArg || !fs.existsSync(dosyaArg)) {
    console.log('Kullanim:');
    console.log('  node ckspaket-excel-telefon-guncelle.js tel.csv');
    console.log('  node ckspaket-excel-telefon-guncelle.js tel.csv --uygula');
    process.exit(1);
  }

  console.log('=== CSV → çksdilekçe.Telefon ===');
  console.log('Surum :', SCRIPT_SURUM);
  console.log('Dosya :', path.resolve(dosyaArg));
  console.log('Mod   :', UYGULA ? 'UYGULA' : 'ONIZLEME');
  console.log('Akis  : TC → çksdilekçe.Kimlik → Telefon guncelle');
  console.log('');

  const { basliklar, satirlar } = dosyaOku(dosyaArg);
  console.log('Sutunlar:', basliklar.join(' | '));
  console.log('Satir   :', satirlar.length);

  const kayitlar = [];
  let gecersiz = 0;
  for (const h of satirlar) {
    const k = satirDonustur(basliklar, h);
    if (k) kayitlar.push(k);
    else gecersiz++;
  }
  console.log('Gecerli kayit:', kayitlar.length, '| Bos/gecersiz:', gecersiz);

  if (!kayitlar.length) {
    console.log('Islenecek satir yok. Baslik: tc + tel olmali.');
    process.exit(1);
  }

  console.log('\nOrnek (ilk 3):');
  kayitlar.slice(0, 3).forEach((k, i) => {
    console.log(`  ${i + 1}. TC:${k.tc || '-'} VNO:${k.vergino || '-'} → tel:${k.telefon}`);
  });

  const pool = await getPool();
  const esleme = await ciftciEslemeAl(pool);
  let eslesen = 0;
  for (const k of kayitlar) {
    if (kimlikBul(esleme, k.tc, k.vergino)) eslesen++;
  }
  console.log('\nTC → ciftci eslesen:', eslesen, '/', kayitlar.length);

  if (!UYGULA) {
    console.log('\nOnizleme bitti. Yazmak icin --uygula ekleyin.');
    await sql.close();
    return;
  }

  let guncellenen = 0;
  let bulunamadi = 0;
  for (const k of kayitlar) {
    const kid = kimlikBul(esleme, k.tc, k.vergino);
    if (!kid) {
      bulunamadi++;
      continue;
    }
    if (await telefonYaz(pool, kid, k.telefon)) guncellenen++;
    else bulunamadi++;
  }

  console.log('\nTamam.');
  console.log('  Guncellenen :', guncellenen);
  console.log('  Bulunamadi  :', bulunamadi);
  await sql.close();
}

main().catch((e) => {
  console.error('HATA:', e.message);
  process.exit(1);
});
