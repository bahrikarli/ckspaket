/**
 * Excel/CSV → dilekçebilgileri tablosu aktarımı
 *
 * Mod 1 — dilekce CSV (eski sistemden export):
 *   Kimlik, kimlikid, dilekçeno, yil, başvurutarihi, tkgm, çks, çkstarih, not, nott, kullanıcıı
 *
 * Mod 2 — TRGM CSV (TC ile):
 *   trgm.csv icinde: Tc Kimlik No + trgm/tkgm
 *   Akis: TC → çksdilekçe.Kimlik (kimlikid) → dilekçebilgileri.tkgm UPDATE
 *   node ... trgm.csv --tkgm-tc --yil=2026 --uygula *
 * Kullanım:
 *   node ckspaket-excel-dilekce-aktar.js dilekce.csv
 *   node ckspaket-excel-dilekce-aktar.js dilekce.csv --uygula
 *   node ckspaket-excel-dilekce-aktar.js dilekce.csv --uygula --yil=2025
 */
const fs = require('fs');
const path = require('path');
const sql = require('mssql');

try {
  require('dotenv').config({ path: path.join(__dirname, '.env'), quiet: true });
} catch (_) {}

const getPool = require('./config');

const SCRIPT_SURUM = '2026-06-10e';
const UYGULA = process.argv.includes('--uygula');
const TKGm_GUNCELLE = process.argv.includes('--tkgm-guncelle');
const TKGm_TC = process.argv.includes('--tkgm-tc');
const yilArg = process.argv.find((a) => a.startsWith('--yil='));
const varsayilanYil = yilArg ? yilArg.split('=')[1].trim() : String(new Date().getFullYear());

const dosyaArg = process.argv.find(
  (a, i) => i >= 2 && !a.startsWith('--') && (a.endsWith('.csv') || a.endsWith('.xlsx') || a.endsWith('.xls') || a.endsWith('.txt'))
);

const KOLON_ESLES = {
  satirKimlik: ['kimlik', 'id', 'dilekce kimlik', 'dilekce id'],
  kimlikid: ['kimlikid', 'kimlik id', 'ciftci kimlik', 'ciftci id', 'cks kimlik'],
  dilekceno: ['dilekçeno', 'dilekce no', 'dilekce no', 'dilekce', 'no'],
  yil: ['yil', 'yıl', 'year'],
  basvurutarihi: ['başvurutarihi', 'basvuru tarihi', 'basvurutarihi', 'kayittarihi', 'kayıt tarihi'],
  tkgm: ['tkgm', 'tarbis', 'trgm', 'tarbis no', 'trgm no', 'tkgm no'],
  tc: ['tc kimlik no', 'tc', 'tc kimlik', 'tckimlik', 't.c. kimlik no', 'tc no'],
  vergino: ['vergino', 'vergi no', 'vkn'],
  cks: ['çks', 'cks'],
  ckstarih: ['çkstarih', 'cks tarih', 'ckstarih'],
  ckskullanici: ['çkskullanıcıı', 'çkskullanici', 'ckskullanici'],
  not: ['not'],
  nott: ['nott', 'not2'],
  kullanici: ['kullanıcıı', 'kullanici', 'kullanıcı', 'kullanici adi']
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
    const b = normBaslik(basliklar[i]);
    if (aday.includes(b)) return i;
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

function tarihParse(s) {
  const v = String(s || '').trim();
  if (!v) return null;
  const m1 = v.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})/);
  if (m1) return new Date(`${m1[3]}-${m1[2].padStart(2, '0')}-${m1[1].padStart(2, '0')}`);
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function intParse(s) {
  const v = String(s || '').trim();
  if (!v) return null;
  const n = parseInt(v.replace(/\D/g, ''), 10);
  return Number.isNaN(n) ? null : n;
}

function sadeceRakam(s) {
  return String(s || '').replace(/\D/g, '');
}

/** Excel TC kaymasina karsi olasi anahtarlar (11 hane, basinda 0 vb.) */
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

function satirDonustur(basliklar, hucreler, mod) {
  const idx = {};
  for (const alan of Object.keys(KOLON_ESLES)) idx[alan] = kolonBul(basliklar, alan);
  const al = (a) => {
    const i = idx[a];
    return i >= 0 ? String(hucreler[i] || '').trim() : '';
  };

  let kimlikid = intParse(al('kimlikid'));
  const satirKimlik = intParse(al('satirKimlik'));

  // Çiftçi CSV: Kimlik = çiftçi id (tkgm-guncelle modu)
  if (mod === 'tkgm' && !kimlikid && satirKimlik) kimlikid = satirKimlik;

  // Dilekce export: hem Kimlik (satir) hem kimlikid var; Kimlik tek basina kimlikid sanilmasin
  const kimlikidKolonVar = idx.kimlikid >= 0;

  let satirId = null;
  if (kimlikidKolonVar && satirKimlik) {
    satirId = satirKimlik;
  } else if (!kimlikidKolonVar && satirKimlik && mod !== 'tkgm') {
    // Sadece Kimlik var — çiftçi id olarak kullan (dilekce export'ta ayri Kimlik kolonu yoksa)
    if (!kimlikid) kimlikid = satirKimlik;
  } else if (kimlikidKolonVar && satirKimlik && satirKimlik !== kimlikid) {
    satirId = satirKimlik;
  }

  const tkgm = al('tkgm') || null;
  const yil = al('yil') || varsayilanYil;

  if (mod === 'tkgm-tc') {
    let tc = sadeceRakam(al('tc'));
    let vergi = sadeceRakam(al('vergino'));
    if (!tc && vergi.length === 11) tc = vergi;
    if (!vergi && tc.length === 10) vergi = tc;
    if (tc.length === 10 && !vergi) vergi = tc;
    if (tc.length !== 11) tc = '';
    if (vergi.length !== 10) vergi = '';
    if ((!tc && !vergi) || !tkgm) return null;
    return { tc: tc || null, vergino: vergi || null, yil: String(yil), tkgm };
  }

  if (!kimlikid) return null;

  if (mod === 'tkgm') {
    if (!tkgm) return null;
    return { kimlikid, yil: String(yil), tkgm };
  }

  const dilekceno = intParse(al('dilekceno'));
  if (!dilekceno) return null;

  return {
    satirKimlik: satirId,
    kimlikid,
    dilekceno,
    yil: String(yil),
    basvurutarihi: tarihParse(al('basvurutarihi')),
    tkgm,
    cks: al('cks') || null,
    ckstarih: tarihParse(al('ckstarih')),
    ckskullanici: al('ckskullanici') || null,
    not: al('not') || null,
    nott: al('nott') || null,
    kullanici: al('kullanici') || null
  };
}

async function ciftciEslemeAl(pool) {
  const r = await pool.request().query(`
    SELECT Kimlik, [Tc Kimlik No] AS tc, vergino FROM [çksdilekçe]`);
  const tcMap = new Map();
  const vergiMap = new Map();
  for (const row of r.recordset) {
    if (row.Kimlik == null) continue;
    for (const key of tcAnahtarlari(row.tc)) tcMap.set(key, row.Kimlik);
    const vno = sadeceRakam(row.vergino);
    if (vno.length === 10) vergiMap.set(vno, row.Kimlik);
  }
  return { tcMap, vergiMap };
}

function tcKimlikBul(esleme, tc, vergino) {
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

/** dilekçebilgileri.tkgm — sadece bu tablo, çksdilekçe dokunulmaz */
async function dilekceTkgmKimlikidIle(pool, kimlikid, yil, tkgm) {
  const r = await pool.request()
    .input('kid', sql.Int, kimlikid)
    .input('yil', sql.NVarChar, String(yil).trim())
    .input('tkgm', sql.NVarChar, tkgm)
    .query(`
      UPDATE dilekçebilgileri SET tkgm = @tkgm
      WHERE kimlikid = @kid
        AND LTRIM(RTRIM(CAST(yil AS NVARCHAR(20)))) = @yil`);
  return (r.rowsAffected[0] || 0) > 0;
}

async function tkgmGuncelle(pool, kayitlar) {
  let ok = 0;
  let yok = 0;
  for (const k of kayitlar) {
    if (await dilekceTkgmKimlikidIle(pool, k.kimlikid, k.yil, k.tkgm)) ok++;
    else yok++;
  }
  return { ok, yok };
}

async function tkgmTcGuncelle(pool, kayitlar, esleme) {
  let ok = 0;
  let ciftciYok = 0;
  let dilekceYok = 0;

  for (const k of kayitlar) {
    const kimlikid = tcKimlikBul(esleme, k.tc, k.vergino);
    if (!kimlikid) {
      ciftciYok++;
      continue;
    }
    if (await dilekceTkgmKimlikidIle(pool, kimlikid, k.yil, k.tkgm)) ok++;
    else dilekceYok++;
  }
  return { ok, ciftciYok, dilekceYok };
}

async function ciftciKimlikleriAl(pool) {
  const r = await pool.request().query('SELECT Kimlik FROM [çksdilekçe]');
  return new Set(r.recordset.map((x) => x.Kimlik));
}

async function mevcutDilekceAnahtarlariAl(pool) {
  const r = await pool.request().query('SELECT Kimlik, kimlikid, yil FROM dilekçebilgileri');
  const kimlikYil = new Set();
  const satirKimlikler = new Set();
  for (const row of r.recordset) {
    if (row.Kimlik != null) satirKimlikler.add(row.Kimlik);
    if (row.kimlikid != null && row.yil) kimlikYil.add(`${row.kimlikid}|${String(row.yil).trim()}`);
  }
  return { kimlikYil, satirKimlikler };
}

const PAKET_BOYUT = 50;

function paketSatirEkle(req, k, i) {
  const p = String(i);
  req
    .input(`sk${p}`, sql.Int, k.satirKimlik)
    .input(`kid${p}`, sql.Int, k.kimlikid)
    .input(`dno${p}`, sql.Int, k.dilekceno)
    .input(`yil${p}`, sql.NVarChar, k.yil)
    .input(`bt${p}`, sql.DateTime, k.basvurutarihi)
    .input(`tk${p}`, sql.NVarChar, k.tkgm)
    .input(`cks${p}`, sql.NVarChar, k.cks)
    .input(`ckst${p}`, sql.DateTime, k.ckstarih)
    .input(`cksu${p}`, sql.NVarChar, k.ckskullanici)
    .input(`nt${p}`, sql.NVarChar, k.not)
    .input(`ntt${p}`, sql.NVarChar, k.nott)
    .input(`kul${p}`, sql.NVarChar, k.kullanici);
  return `(@sk${p}, @kid${p}, @dno${p}, @bt${p}, @kul${p}, @cks${p}, @ckst${p}, @cksu${p}, @tk${p}, @nt${p}, @ntt${p}, @yil${p})`;
}

function paketSatirEkleOto(req, k, i) {
  const p = String(i);
  req
    .input(`kid${p}`, sql.Int, k.kimlikid)
    .input(`dno${p}`, sql.Int, k.dilekceno)
    .input(`yil${p}`, sql.NVarChar, k.yil)
    .input(`bt${p}`, sql.DateTime, k.basvurutarihi)
    .input(`tk${p}`, sql.NVarChar, k.tkgm)
    .input(`cks${p}`, sql.NVarChar, k.cks)
    .input(`ckst${p}`, sql.DateTime, k.ckstarih)
    .input(`cksu${p}`, sql.NVarChar, k.ckskullanici)
    .input(`nt${p}`, sql.NVarChar, k.not)
    .input(`ntt${p}`, sql.NVarChar, k.nott)
    .input(`kul${p}`, sql.NVarChar, k.kullanici);
  return `(@kid${p}, @dno${p}, @bt${p}, @kul${p}, @cks${p}, @ckst${p}, @cksu${p}, @tk${p}, @nt${p}, @ntt${p}, @yil${p})`;
}

async function kimlikliPaketYaz(conn, paket) {
  const req = conn.request();
  const satirlar = paket.map((k, i) => paketSatirEkle(req, k, i));
  await req.query(`
    SET IDENTITY_INSERT dilekçebilgileri ON;
    INSERT INTO dilekçebilgileri
      (Kimlik, kimlikid, dilekçeno, başvurutarihi, kullanıcıı, çks, çkstarih, çkskullanıcıı, tkgm, [not], [nott], yil)
    VALUES ${satirlar.join(',\n')};
    SET IDENTITY_INSERT dilekçebilgileri OFF;`);
}

async function otoPaketYaz(conn, paket) {
  const req = conn.request();
  const satirlar = paket.map((k, i) => paketSatirEkleOto(req, k, i));
  await req.query(`
    INSERT INTO dilekçebilgileri
      (kimlikid, dilekçeno, başvurutarihi, kullanıcıı, çks, çkstarih, çkskullanıcıı, tkgm, [not], [nott], yil)
    VALUES ${satirlar.join(',\n')};`);
}

async function main() {
  if (!dosyaArg || !fs.existsSync(dosyaArg)) {
    console.log('Kullanim:');
    console.log('  node ckspaket-excel-dilekce-aktar.js dilekce.csv [--uygula] [--yil=2026]');
    console.log('  node ckspaket-excel-dilekce-aktar.js trgm.csv --tkgm-tc --yil=2026 --uygula');
    process.exit(1);
  }

  const mod = TKGm_TC ? 'tkgm-tc' : (TKGm_GUNCELLE ? 'tkgm' : 'dilekce');
  const modEtiket = mod === 'tkgm-tc'
    ? 'TRGM GUNCELLE (TC → kimlikid → dilekçebilgileri.tkgm)'
    : (mod === 'tkgm' ? 'TKGM GUNCELLE (Kimlik ile)' : (UYGULA ? 'UYGULA' : 'ONIZLEME'));
  console.log('=== Excel/CSV → dilekçebilgileri ===');
  console.log('Surum :', SCRIPT_SURUM);
  console.log('Dosya :', path.resolve(dosyaArg));
  console.log('Mod   :', modEtiket);
  if (mod === 'tkgm-tc') {
    console.log('Akis  : TRGM CSV (TC) → çksdilekçe.Kimlik → dilekçebilgileri.tkgm');
    console.log('Not   : çksdilekçe tablosu SADECE TC okumak icin, tkgm oraya yazilmaz');
  }
  if (mod === 'tkgm' || mod === 'tkgm-tc' || !process.argv.some((a) => a.startsWith('--yil='))) {
    console.log('Yil   :', varsayilanYil);
  }
  console.log('');

  const { basliklar, satirlar } = dosyaOku(dosyaArg);
  console.log('Sutunlar:', basliklar.join(' | '));
  console.log('Satir   :', satirlar.length);

  const kayitlar = [];
  let gecersiz = 0;
  for (const h of satirlar) {
    const k = satirDonustur(basliklar, h, mod);
    if (k) kayitlar.push(k);
    else gecersiz++;
  }

  if (mod === 'tkgm' || mod === 'tkgm-tc') {
    console.log('TKGM guncellenecek:', kayitlar.length, '| Bos/gecersiz:', gecersiz);
  } else {
    console.log('Gecerli kayit:', kayitlar.length, '| Eksik (kimlikid/dilekçeno):', gecersiz);
    const kimlikli = kayitlar.filter((k) => k.satirKimlik).length;
    if (kimlikli) console.log('Eski Kimlik (satir id) korunacak:', kimlikli);
  }

  if (!kayitlar.length) {
    console.log('Islenecek satir yok.');
    process.exit(1);
  }

  console.log('\nOrnek (ilk 3):');
  kayitlar.slice(0, 3).forEach((k, i) => {
    if (mod === 'tkgm-tc') {
      console.log(`  ${i + 1}. TC:${k.tc || '-'} VNO:${k.vergino || '-'} | yil:${k.yil} | tkgm:${k.tkgm}`);
    } else if (mod === 'tkgm') {
      console.log(`  ${i + 1}. ciftci #${k.kimlikid} | yil:${k.yil} | tkgm:${k.tkgm}`);
    } else {
      console.log(`  ${i + 1}. #${k.satirKimlik || '?'} ciftci:${k.kimlikid} | no:${k.dilekceno} | yil:${k.yil} | tkgm:${k.tkgm || '-'}`);
    }
  });

  if (mod === 'tkgm-tc') {
    const pool = await getPool();
    const esleme = await ciftciEslemeAl(pool);
    let tcEslesen = 0;
    let dilekceVar = 0;
    for (const k of kayitlar) {
      const kid = tcKimlikBul(esleme, k.tc, k.vergino);
      if (kid) {
        tcEslesen++;
        const chk = await pool.request()
          .input('kid', sql.Int, kid)
          .input('yil', sql.NVarChar, k.yil)
          .query(`
            SELECT COUNT(1) AS n FROM dilekçebilgileri
            WHERE kimlikid = @kid AND LTRIM(RTRIM(CAST(yil AS NVARCHAR(20)))) = @yil`);
        if (chk.recordset[0].n > 0) dilekceVar++;
      }
    }
    console.log('\nTC → çksdilekçe eslesen     :', tcEslesen, '/', kayitlar.length);
    console.log('kimlikid + yil dilekce var  :', dilekceVar, '/', kayitlar.length);
    if (!UYGULA) {
      console.log('\nOnizleme bitti. Yazmak icin --uygula ekleyin.');
      await sql.close();
      process.exit(0);
    }
    const sonuc = await tkgmTcGuncelle(pool, kayitlar, esleme);
    console.log('\nTamam.');
    console.log('  dilekçebilgileri.tkgm guncellenen :', sonuc.ok);
    console.log('  TC bulunamadi (çksdilekçe)        :', sonuc.ciftciYok);
    console.log('  Dilekce kaydi yok (kimlikid+yil)   :', sonuc.dilekceYok);
    await sql.close();
    return;
  }

  if (!UYGULA) {
    console.log('\nOnizleme bitti. Yazmak icin --uygula ekleyin.');
    process.exit(0);
  }

  const pool = await getPool();

  if (mod === 'tkgm') {
    let yok = 0;
    for (const k of kayitlar) {
      if (!ciftciIds.has(k.kimlikid)) yok++;
    }
    if (yok) console.log('Uyari:', yok, 'satirda ciftci bulunamadi (yine de UPDATE denenecek)');

    const sonuc = await tkgmGuncelle(pool, kayitlar);
    console.log('\nTamam.');
    console.log('  dilekçebilgileri.tkgm guncellenen :', sonuc.ok);
    console.log('  Dilekce kaydi bulunamadi           :', sonuc.yok);
    await sql.close();
    return;
  }

  const ciftciIds = await ciftciKimlikleriAl(pool);
  const mevcut = await mevcutDilekceAnahtarlariAl(pool);
  const yazilacak = [];
  let atlanan = 0;
  let ciftciYok = 0;

  for (const k of kayitlar) {
    if (!ciftciIds.has(k.kimlikid)) {
      ciftciYok++;
      continue;
    }
    const anahtar = `${k.kimlikid}|${k.yil}`;
    if (mevcut.kimlikYil.has(anahtar)) {
      atlanan++;
      continue;
    }
    if (k.satirKimlik && mevcut.satirKimlikler.has(k.satirKimlik)) {
      atlanan++;
      continue;
    }
    yazilacak.push(k);
  }

  console.log('Yazilacak:', yazilacak.length, '| Atlanacak:', atlanan, '| Ciftci yok:', ciftciYok);

  let eklenen = 0;
  let hata = 0;
  const conn = await pool.connect();

  try {
    const kimlikliler = yazilacak.filter((k) => k.satirKimlik);
    const otolar = yazilacak.filter((k) => !k.satirKimlik);

    for (let i = 0; i < kimlikliler.length; i += PAKET_BOYUT) {
      const paket = kimlikliler.slice(i, i + PAKET_BOYUT);
      try {
        await kimlikliPaketYaz(conn, paket);
        for (const k of paket) {
          mevcut.kimlikYil.add(`${k.kimlikid}|${k.yil}`);
          mevcut.satirKimlikler.add(k.satirKimlik);
        }
        eklenen += paket.length;
        if (eklenen % 500 === 0 || i + PAKET_BOYUT >= kimlikliler.length) {
          console.log(`  ... ${eklenen} kayit yazildi`);
        }
      } catch (e) {
        for (const k of paket) {
          try {
            const req = conn.request();
            paketSatirEkle(req, k, 0);
            await req.query(`
              SET IDENTITY_INSERT dilekçebilgileri ON;
              INSERT INTO dilekçebilgileri
                (Kimlik, kimlikid, dilekçeno, başvurutarihi, kullanıcıı, çks, çkstarih, çkskullanıcıı, tkgm, [not], [nott], yil)
              VALUES (@sk0, @kid0, @dno0, @bt0, @kul0, @cks0, @ckst0, @cksu0, @tk0, @nt0, @ntt0, @yil0);
              SET IDENTITY_INSERT dilekçebilgileri OFF;`);
            eklenen++;
          } catch (e2) {
            hata++;
            console.warn('  HATA:', `#${k.satirKimlik} ciftci:${k.kimlikid}`, '-', e2.message);
          }
        }
      }
    }

    for (let i = 0; i < otolar.length; i += PAKET_BOYUT) {
      const paket = otolar.slice(i, i + PAKET_BOYUT);
      try {
        await otoPaketYaz(conn, paket);
        for (const k of paket) mevcut.kimlikYil.add(`${k.kimlikid}|${k.yil}`);
        eklenen += paket.length;
        if (eklenen % 500 === 0 || i + PAKET_BOYUT >= otolar.length) {
          console.log(`  ... ${eklenen} kayit yazildi`);
        }
      } catch (e) {
        hata += paket.length;
        console.warn('  PAKET HATA:', e.message);
      }
    }
  } finally {
    conn.release();
  }

  if (yazilacak.some((k) => k.satirKimlik)) {
    const maxR = await pool.request().query('SELECT ISNULL(MAX(Kimlik), 0) AS m FROM dilekçebilgileri');
    const maxId = maxR.recordset[0].m;
    if (maxId > 0) {
      await pool.request().query(`DBCC CHECKIDENT ('dilekçebilgileri', RESEED, ${maxId})`);
      console.log('Kimlik sayaci guncellendi:', maxId);
    }
  }

  const cnt = await pool.request().query('SELECT COUNT(1) AS n FROM dilekçebilgileri');
  console.log('\nTamam.');
  console.log('  Eklenen :', eklenen);
  console.log('  Atlanan :', atlanan);
  console.log('  Ciftci yok:', ciftciYok);
  console.log('  Hata    :', hata);
  console.log('  Tablo toplam:', cnt.recordset[0].n, 'dilekce');
  await sql.close();
}

main().catch((e) => {
  console.error('HATA:', e.message);
  process.exit(1);
});
