/**
 * taramalar/2026cks (veya --yil) içindeki PDF'leri çksdilekçe ile eşleştirip belgenet'e yazar.
 *
 * Dosya adında TC (11 hane) veya vergino (10 hane) aranır.
 * çksdilekçe.Kimlik → belgenet.kimlikid
 *
 * Kullanım:
 *   node ckspaket-belgenet-pdf-eslestir.js
 *   node ckspaket-belgenet-pdf-eslestir.js --yil=2026
 *   node ckspaket-belgenet-pdf-eslestir.js --yil=2026 --uygula
 *   node ckspaket-belgenet-pdf-eslestir.js --klasor="C:\ckspaket\taramalar\2026cks" --uygula
 */
const fs = require('fs');
const path = require('path');
const sql = require('mssql');

try {
  require('dotenv').config({ path: path.join(__dirname, '.env'), quiet: true });
} catch (_) {}

const getPool = require('./config');
const { taramaYilKlasorYol, VARSAYILAN, sistemAyarBirlestir } = require('./sistem-ayar');

const SCRIPT_SURUM = '2026-06-10b';
const UYGULA = process.argv.includes('--uygula');
const yilArg = process.argv.find((a) => a.startsWith('--yil='));
const klasorArg = process.argv.find((a) => a.startsWith('--klasor='));
const YIL = yilArg ? yilArg.split('=')[1].trim() : '2026';

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

/** Dosya adından TC veya vergi no çıkar (ör. 123-12345678901, 123-EK-1-12345678901) */
function dosyadanKimlikNoCikar(dosyaAdi) {
  const base = dosyaAdi.replace(/\.pdf$/i, '');
  const parcalar = base.split('-').reverse();
  for (const p of parcalar) {
    const n = sadeceRakam(p);
    if (n.length === 11) return { tc: n, vergino: null };
    if (n.length === 10) return { tc: null, vergino: n };
  }
  const tum = sadeceRakam(base);
  if (tum.length >= 11) {
    for (let i = 0; i <= tum.length - 11; i++) {
      const parca = tum.slice(i, i + 11);
      if (parca.length === 11) return { tc: parca, vergino: null };
    }
  }
  if (tum.length >= 10) {
    const son10 = tum.slice(-10);
    if (son10.length === 10) return { tc: null, vergino: son10 };
  }
  return null;
}

async function ayarKlasorAl(pool) {
  if (klasorArg) return klasorArg.split('=').slice(1).join('=').replace(/^"|"$/g, '');
  try {
    const r = await pool.request().query(`
      SELECT TOP 1 teknik_json FROM ayarlar WHERE teknik_json IS NOT NULL ORDER BY id DESC`);
    if (r.recordset.length && r.recordset[0].teknik_json) {
      const j = JSON.parse(r.recordset[0].teknik_json);
      return taramaYilKlasorYol(sistemAyarBirlestir(j), YIL);
    }
  } catch (_) {}
  return taramaYilKlasorYol(VARSAYILAN, YIL);
}

async function ciftciHaritalariAl(pool) {
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

function kimlikBul(haritalar, tc, vergino) {
  if (tc) {
    for (const key of tcAnahtarlari(tc)) {
      if (haritalar.tcMap.has(key)) return haritalar.tcMap.get(key);
    }
  }
  if (vergino) {
    const v = sadeceRakam(vergino);
    if (haritalar.vergiMap.has(v)) return haritalar.vergiMap.get(v);
  }
  return null;
}

async function mevcutDosyalarAl(pool) {
  const r = await pool.request()
    .input('yil', sql.SmallInt, parseInt(YIL, 10))
    .query(`
    SELECT LOWER(LTRIM(RTRIM(REPLACE(ISNULL(dosyadı,''), '.pdf', '')))) AS d
    FROM belgenet WHERE dosyadı IS NOT NULL AND yil = @yil`);
  return new Set(r.recordset.map((x) => x.d));
}

async function pdfSayfaSayisi(dosyaYol) {
  try {
    const { PDFDocument } = require('pdf-lib');
    const buf = fs.readFileSync(dosyaYol);
    const doc = await PDFDocument.load(buf, { ignoreEncryption: true });
    const n = doc.getPageCount();
    return n > 0 ? n : 1;
  } catch (_) {
    return 1;
  }
}

async function belgenetEkle(pool, kayit) {
  await pool.request()
    .input('kid', sql.Int, kayit.kimlikid)
    .input('dosya', sql.NVarChar, kayit.dosyadi)
    .input('sayfa', sql.Int, kayit.sayfa)
    .input('yil', sql.SmallInt, parseInt(YIL, 10))
    .input('kul', sql.NVarChar, 'PDF eslestirme')
    .query(`
      INSERT INTO belgenet (kimlikid, sayfasayısı, tarih, kullanıcı, dosyadı, belgenetno, yil)
      VALUES (@kid, @sayfa, GETDATE(), @kul, @dosya, 0, @yil)`);
}

async function main() {
  console.log('=== PDF → belgenet eslestirme ===');
  console.log('Surum :', SCRIPT_SURUM);
  console.log('Yil   :', YIL);
  console.log('Mod   :', UYGULA ? 'UYGULA' : 'ONIZLEME');
  console.log('Akis  : PDF adi (TC/vergi) → çksdilekçe.Kimlik → belgenet.kimlikid');
  console.log('');

  const pool = await getPool();
  const klasor = await ayarKlasorAl(pool);
  console.log('Klasor:', klasor);

  if (!fs.existsSync(klasor)) {
    console.error('HATA: Klasor yok:', klasor);
    process.exit(1);
  }

  const pdfler = fs.readdirSync(klasor).filter((f) => f.toLowerCase().endsWith('.pdf'));
  console.log('PDF sayisi:', pdfler.length);
  if (!pdfler.length) {
    console.log('Islenecek PDF yok.');
    await sql.close();
    return;
  }

  const haritalar = await ciftciHaritalariAl(pool);
  const mevcutDosyalar = await mevcutDosyalarAl(pool);

  let eslesen = 0;
  let ciftciYok = 0;
  let kimlikYok = 0;
  let zatenVar = 0;
  let eklenecek = 0;
  const ornekler = [];

  for (const pdf of pdfler) {
    const dosyadi = pdf.replace(/\.pdf$/i, '');
    const anahtar = dosyadi.toLowerCase().trim();
    if (mevcutDosyalar.has(anahtar)) {
      zatenVar++;
      continue;
    }

    const no = dosyadanKimlikNoCikar(pdf);
    if (!no) {
      kimlikYok++;
      continue;
    }

    const kimlikid = kimlikBul(haritalar, no.tc, no.vergino);
    if (!kimlikid) {
      ciftciYok++;
      continue;
    }

    eslesen++;
    if (ornekler.length < 5) {
      ornekler.push({ pdf, kimlikid, tc: no.tc, vergi: no.vergino });
    }

    if (UYGULA) {
      const sayfa = await pdfSayfaSayisi(path.join(klasor, pdf));
      await belgenetEkle(pool, { kimlikid, dosyadi, sayfa });
      mevcutDosyalar.add(anahtar);
      eklenecek++;
      if (eklenecek % 100 === 0) console.log(`  ... ${eklenecek} kayit eklendi`);
    } else {
      eklenecek++;
    }
  }

  console.log('\nOrnek eslesmeler:');
  ornekler.forEach((o, i) => {
    console.log(`  ${i + 1}. ${o.pdf} → kimlikid:${o.kimlikid} (TC:${o.tc || '-'} VNO:${o.vergi || '-'})`);
  });

  console.log('\nOzet:');
  console.log('  Eslesen (ciftci bulundu) :', eslesen);
  console.log('  Eklenecek / eklendi    :', eklenecek);
  console.log('  Zaten belgenette       :', zatenVar);
  console.log('  TC/vergi okunamadi     :', kimlikYok);
  console.log('  Ciftci bulunamadi      :', ciftciYok);

  if (!UYGULA) {
    console.log('\nOnizleme bitti. Yazmak icin --uygula ekleyin.');
  }

  const cnt = await pool.request().query('SELECT COUNT(1) AS n FROM belgenet');
  console.log('  belgenet toplam kayit  :', cnt.recordset[0].n);
  await sql.close();
}

main().catch((e) => {
  console.error('HATA:', e.message);
  process.exit(1);
});
