/**
 * Excel/CSV → çksdilekçe tablosu aktarımı
 *
 * Desteklenen basliklar:
 * Kimlik, Tc Kimlik No, Adı Soyadı, vergino, Baba Adı, Doğum Tarihi,
 * Cinsiyet, Durum, İlçe, Köy/Mahalle, kayıttarihi, kullanıcı, il, Telefon, sicil, tur
 * (Yaş ve tkgm atlanir — tkgm dilekçebilgileri tablosuna ait)
 *
 * Kullanım:
 *   node ckspaket-excel-ciftci-aktar.js dosya.csv              onizleme
 *   node ckspaket-excel-ciftci-aktar.js dosya.csv --uygula    yaz
 */
const fs = require('fs');
const path = require('path');
const sql = require('mssql');

try {
  require('dotenv').config({ path: path.join(__dirname, '.env'), quiet: true });
} catch (_) {}

const getPool = require('./config');

const UYGULA = process.argv.includes('--uygula');
const dosyaArg = process.argv.find(
  (a, i) => i >= 2 && !a.startsWith('--') && (a.endsWith('.csv') || a.endsWith('.xlsx') || a.endsWith('.xls') || a.endsWith('.txt'))
);

const KOLON_ESLES = {
  kimlik: ['kimlik', 'id'],
  tc: ['tc kimlik no', 'tc', 'tc kimlik', 'tckimlik', 't.c. kimlik no'],
  vergino: ['vergino', 'vergi no', 'vergi', 'vkn'],
  adsoyad: ['adi soyadi', 'ad soyad', 'adsoyad', 'unvan'],
  babaadi: ['baba adi', 'babaadi', 'baba'],
  dogumtarihi: ['dogum tarihi', 'dogumtarihi'],
  cinsiyet: ['cinsiyet', 'cins'],
  il: ['il'],
  ilce: ['ilce', 'ilçe'],
  koy: ['koy/mahalle', 'koy mahalle', 'koy', 'mahalle', 'koyu'],
  telefon: ['telefon', 'tel', 'gsm'],
  tur: ['tur', 'tip'],
  sicil: ['sicil', 'sicil no'],
  durum: ['durum'],
  kayittarihi: ['kayittarihi', 'kayit tarihi', 'kayıt tarihi'],
  kullanici: ['kullanici', 'kullanıcı', 'kullanici id', 'kullaniciid']
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
      if (c === '"') {
        q = !q;
        continue;
      }
      if (c === ayir && !q) {
        out.push(cur.trim());
        cur = '';
        continue;
      }
      cur += c;
    }
    out.push(cur.trim());
    return out;
  };
  const basliklar = parse(satirlar[0]);
  const veri = satirlar.slice(1).map(parse).filter((r) => r.some((c) => c));
  return { basliklar, satirlar: veri };
}

function dosyaOku(dosyaYol) {
  const ext = path.extname(dosyaYol).toLowerCase();
  if (ext === '.xlsx' || ext === '.xls') {
    let XLSX;
    try {
      XLSX = require('xlsx');
    } catch (_) {
      throw new Error('XLSX icin: npm install xlsx — veya CSV UTF-8 kaydedin.');
    }
    const wb = XLSX.readFile(dosyaYol);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    const basliklar = (rows[0] || []).map(String);
    const satirlar = rows.slice(1).filter((r) => r.some((c) => String(c).trim()));
    return { basliklar, satirlar: satirlar.map((r) => r.map(String)) };
  }
  return satirOkuCsv(fs.readFileSync(dosyaYol, 'utf8'));
}

function sadeceRakam(s) {
  return String(s || '').replace(/\D/g, '');
}

function turBelirle(tur, tc, vergi) {
  const t = String(tur || '').trim().toUpperCase();
  if (t.includes('TUZEL') || t.includes('SIRKET')) return 'TUZEL';
  if (t.includes('GERCEK') || t.includes('SAHIS')) return 'GERCEK';
  if (vergi.length === 10) return 'TUZEL';
  if (tc.length === 11) return 'GERCEK';
  if (tc.length === 10) return 'TUZEL';
  return 'GERCEK';
}

function tarihParse(s) {
  const v = String(s || '').trim();
  if (!v) return null;
  const m1 = v.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})/);
  if (m1) return new Date(`${m1[3]}-${m1[2].padStart(2, '0')}-${m1[1].padStart(2, '0')}`);
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
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
  const tur = turBelirle(al('tur'), tc, vergi);

  if (tur === 'TUZEL') {
    if (!vergi && tc.length === 10) vergi = tc;
    tc = '';
  } else {
    if (!tc && vergi.length === 11) tc = vergi;
    vergi = '';
  }

  const adsoyad = al('adsoyad');
  if (!adsoyad) return null;

  const kimlikStr = al('kimlik');
  const kimlik = kimlikStr && /^\d+$/.test(kimlikStr) ? parseInt(kimlikStr, 10) : null;
  const kullStr = al('kullanici');
  const kullanici = kullStr && /^\d+$/.test(kullStr) ? parseInt(kullStr, 10) : null;
  const kayitTarih = tarihParse(al('kayittarihi'));

  return {
    kimlik,
    tc: tc || null,
    vergino: vergi || null,
    tur,
    adsoyad,
    babaadi: tur === 'TUZEL' ? 'TÜZEL KİŞİ' : (al('babaadi') || null),
    dogumtarihi: al('dogumtarihi') || null,
    cinsiyet: al('cinsiyet') || null,
    il: al('il') || 'KONYA',
    ilce: al('ilce') || null,
    koy: al('koy') || null,
    telefon: al('telefon') || null,
    sicil: al('sicil') || null,
    durum: al('durum') || 'Aktif',
    kayittarihi: kayitTarih,
    kullanici
  };
}

async function adminIdAl(pool) {
  try {
    const r = await pool.request().query(`
      SELECT TOP 1 Id FROM Kullanicilar
      WHERE LOWER(LTRIM(ISNULL(rol,''))) = 'admin'
      ORDER BY Id`);
    if (r.recordset.length) return r.recordset[0].Id;
  } catch (_) {}
  return 1;
}

async function mevcutAnahtarlarAl(pool) {
  const r = await pool.request().query(`
    SELECT Kimlik, [Tc Kimlik No] AS tc, vergino FROM [çksdilekçe]`);
  const kimlikler = new Set();
  const tcler = new Set();
  const vergiler = new Set();
  for (const row of r.recordset) {
    if (row.Kimlik != null) kimlikler.add(row.Kimlik);
    if (row.tc) tcler.add(String(row.tc).trim());
    if (row.vergino) vergiler.add(String(row.vergino).trim());
  }
  return { kimlikler, tcler, vergiler };
}

const SCRIPT_SURUM = '2026-06-10c';

const INSERT_KIMLIKLI = `
  INSERT INTO [çksdilekçe]
    (Kimlik, [Tc Kimlik No], vergino, tur, [Adı Soyadı], [Baba Adı], [Doğum Tarihi],
     Cinsiyet, il, İlçe, [Köy/Mahalle], Telefon, Durum, kayıttarihi, kullanıcı, sicil)
  VALUES
    (@kimlik, @tc, @vergino, @tur, @adsoyad, @babaadi, @dogumtarihi,
     @cinsiyet, @il, @ilce, @koy, @telefon, @durum, @tarih, @kullanici, @sicil)`;

const INSERT_OTO = `
  INSERT INTO [çksdilekçe]
    ([Tc Kimlik No], vergino, tur, [Adı Soyadı], [Baba Adı], [Doğum Tarihi],
     Cinsiyet, il, İlçe, [Köy/Mahalle], Telefon, Durum, kayıttarihi, kullanıcı, sicil)
  VALUES
    (@tc, @vergino, @tur, @adsoyad, @babaadi, @dogumtarihi,
     @cinsiyet, @il, @ilce, @koy, @telefon, @durum, @tarih, @kullanici, @sicil)`;

const PAKET_BOYUT = 50;

function satirParamEkle(req, k, varsayilanKullanici, p) {
  req
    .input(`kimlik${p}`, sql.Int, k.kimlik)
    .input(`tc${p}`, sql.NVarChar, k.tc)
    .input(`vergino${p}`, sql.NVarChar, k.vergino)
    .input(`tur${p}`, sql.NVarChar, k.tur)
    .input(`adsoyad${p}`, sql.NVarChar, k.adsoyad)
    .input(`babaadi${p}`, sql.NVarChar, k.babaadi)
    .input(`dogumtarihi${p}`, sql.NVarChar, k.dogumtarihi)
    .input(`cinsiyet${p}`, sql.NVarChar, k.cinsiyet)
    .input(`telefon${p}`, sql.NVarChar, k.telefon)
    .input(`il${p}`, sql.NVarChar, k.il)
    .input(`ilce${p}`, sql.NVarChar, k.ilce)
    .input(`koy${p}`, sql.NVarChar, k.koy)
    .input(`durum${p}`, sql.NVarChar, k.durum)
    .input(`sicil${p}`, sql.NVarChar, k.sicil)
    .input(`tarih${p}`, sql.Date, k.kayittarihi || new Date())
    .input(`kullanici${p}`, sql.Int, k.kullanici || varsayilanKullanici);
  return `(@kimlik${p}, @tc${p}, @vergino${p}, @tur${p}, @adsoyad${p}, @babaadi${p}, @dogumtarihi${p},
     @cinsiyet${p}, @il${p}, @ilce${p}, @koy${p}, @telefon${p}, @durum${p}, @tarih${p}, @kullanici${p}, @sicil${p})`;
}

async function kimlikliPaketYaz(conn, paket, varsayilanKullanici) {
  const req = conn.request();
  const satirlar = paket.map((k, i) => satirParamEkle(req, k, varsayilanKullanici, i));
  await req.query(`
    SET IDENTITY_INSERT [çksdilekçe] ON;
    INSERT INTO [çksdilekçe]
      (Kimlik, [Tc Kimlik No], vergino, tur, [Adı Soyadı], [Baba Adı], [Doğum Tarihi],
       Cinsiyet, il, İlçe, [Köy/Mahalle], Telefon, Durum, kayıttarihi, kullanıcı, sicil)
    VALUES ${satirlar.join(',\n')};
    SET IDENTITY_INSERT [çksdilekçe] OFF;`);
}

async function otoKayitYaz(conn, k, varsayilanKullanici) {
  await conn.request()
    .input('tc', sql.NVarChar, k.tc)
    .input('vergino', sql.NVarChar, k.vergino)
    .input('tur', sql.NVarChar, k.tur)
    .input('adsoyad', sql.NVarChar, k.adsoyad)
    .input('babaadi', sql.NVarChar, k.babaadi)
    .input('dogumtarihi', sql.NVarChar, k.dogumtarihi)
    .input('cinsiyet', sql.NVarChar, k.cinsiyet)
    .input('telefon', sql.NVarChar, k.telefon)
    .input('il', sql.NVarChar, k.il)
    .input('ilce', sql.NVarChar, k.ilce)
    .input('koy', sql.NVarChar, k.koy)
    .input('durum', sql.NVarChar, k.durum)
    .input('sicil', sql.NVarChar, k.sicil)
    .input('tarih', sql.Date, k.kayittarihi || new Date())
    .input('kullanici', sql.Int, k.kullanici || varsayilanKullanici)
    .query(INSERT_OTO);
}

async function main() {
  if (!dosyaArg || !fs.existsSync(dosyaArg)) {
    console.log('Kullanim: node ckspaket-excel-ciftci-aktar.js ciftci-listesi.csv [--uygula]');
    process.exit(1);
  }

  console.log('=== Excel/CSV → çksdilekçe ===');
  console.log('Surum :', SCRIPT_SURUM);
  console.log('Dosya:', path.resolve(dosyaArg));
  console.log('Mod  :', UYGULA ? 'UYGULA' : 'ONIZLEME');
  console.log('Not  : Yas ve tkgm sutunlari atlanir (tkgm → dilekce tablosu)');
  console.log('');

  const { basliklar, satirlar } = dosyaOku(dosyaArg);
  console.log('Sutunlar:', basliklar.join(' | '));
  console.log('Satir   :', satirlar.length);

  const kayitlar = [];
  for (const h of satirlar) {
    const k = satirDonustur(basliklar, h);
    if (k) kayitlar.push(k);
  }
  console.log('Gecerli kayit:', kayitlar.length);

  const kimlikli = kayitlar.filter((k) => k.kimlik).length;
  if (kimlikli) console.log('Kimlik numarasi olan:', kimlikli, '(eski ID korunacak)');

  if (!kayitlar.length) {
    console.log('Aktarilacak satir yok.');
    process.exit(1);
  }

  console.log('\nOrnek (ilk 3):');
  kayitlar.slice(0, 3).forEach((k, i) => {
    console.log(
      `  ${i + 1}. #${k.kimlik || '?'} ${k.adsoyad} | ${k.tur} | TC:${k.tc || '-'} | ${k.ilce}/${k.koy}`
    );
  });

  if (!UYGULA) {
    console.log('\nOnizleme bitti. Yazmak icin --uygula veya bat dosyasinda "uygula" yazin.');
    process.exit(0);
  }

  const pool = await getPool();
  const varsayilanKullanici = await adminIdAl(pool);
  const mevcut = await mevcutAnahtarlarAl(pool);

  let eklenen = 0;
  let atlanan = 0;
  let hata = 0;

  const yazilacak = [];
  for (const k of kayitlar) {
    if (k.kimlik && mevcut.kimlikler.has(k.kimlik)) {
      atlanan++;
      continue;
    }
    if (!k.kimlik) {
      if (k.tur === 'GERCEK' && k.tc && mevcut.tcler.has(k.tc)) {
        atlanan++;
        continue;
      }
      if (k.tur === 'TUZEL' && k.vergino && mevcut.vergiler.has(k.vergino)) {
        atlanan++;
        continue;
      }
    }
    yazilacak.push(k);
  }

  console.log('Yazilacak:', yazilacak.length, '| Atlanacak (mukerrer):', atlanan);

  const conn = await pool.connect();
  try {
    const kimlikliler = yazilacak.filter((k) => k.kimlik);
    const otolar = yazilacak.filter((k) => !k.kimlik);

    for (let i = 0; i < kimlikliler.length; i += PAKET_BOYUT) {
      const paket = kimlikliler.slice(i, i + PAKET_BOYUT);
      try {
        await kimlikliPaketYaz(conn, paket, varsayilanKullanici);
        for (const k of paket) {
          mevcut.kimlikler.add(k.kimlik);
          if (k.tc) mevcut.tcler.add(k.tc);
          if (k.vergino) mevcut.vergiler.add(k.vergino);
        }
        eklenen += paket.length;
        if (eklenen % 500 === 0 || i + PAKET_BOYUT >= kimlikliler.length) {
          console.log(`  ... ${eklenen} kayit yazildi`);
        }
      } catch (e) {
        for (const k of paket) {
          try {
            await conn.request()
              .input('kimlik', sql.Int, k.kimlik)
              .input('tc', sql.NVarChar, k.tc)
              .input('vergino', sql.NVarChar, k.vergino)
              .input('tur', sql.NVarChar, k.tur)
              .input('adsoyad', sql.NVarChar, k.adsoyad)
              .input('babaadi', sql.NVarChar, k.babaadi)
              .input('dogumtarihi', sql.NVarChar, k.dogumtarihi)
              .input('cinsiyet', sql.NVarChar, k.cinsiyet)
              .input('telefon', sql.NVarChar, k.telefon)
              .input('il', sql.NVarChar, k.il)
              .input('ilce', sql.NVarChar, k.ilce)
              .input('koy', sql.NVarChar, k.koy)
              .input('durum', sql.NVarChar, k.durum)
              .input('sicil', sql.NVarChar, k.sicil)
              .input('tarih', sql.Date, k.kayittarihi || new Date())
              .input('kullanici', sql.Int, k.kullanici || varsayilanKullanici)
              .query(`SET IDENTITY_INSERT [çksdilekçe] ON;\n${INSERT_KIMLIKLI};\nSET IDENTITY_INSERT [çksdilekçe] OFF;`);
            eklenen++;
          } catch (e2) {
            hata++;
            console.warn('  HATA:', k.adsoyad, `#${k.kimlik}`, '-', e2.message);
          }
        }
      }
    }

    for (const k of otolar) {
      try {
        await otoKayitYaz(conn, k, varsayilanKullanici);
        if (k.tc) mevcut.tcler.add(k.tc);
        if (k.vergino) mevcut.vergiler.add(k.vergino);
        eklenen++;
      } catch (e) {
        hata++;
        console.warn('  HATA:', k.adsoyad, '-', e.message);
      }
    }
  } finally {
    conn.release();
  }

  if (yazilacak.some((k) => k.kimlik)) {
    const maxR = await pool.request().query('SELECT ISNULL(MAX(Kimlik), 0) AS m FROM [çksdilekçe]');
    const maxId = maxR.recordset[0].m;
    if (maxId > 0) {
      await pool.request().query(`DBCC CHECKIDENT ('[çksdilekçe]', RESEED, ${maxId})`);
      console.log('Kimlik sayaci guncellendi:', maxId);
    }
  }

  const cnt = await pool.request().query('SELECT COUNT(1) AS n FROM [çksdilekçe]');
  console.log('\nTamam.');
  console.log('  Eklenen :', eklenen);
  console.log('  Atlanan :', atlanan);
  console.log('  Hata    :', hata);
  console.log('  Tablo toplam:', cnt.recordset[0].n, 'ciftci');
  await sql.close();
}

main().catch((e) => {
  console.error('HATA:', e.message);
  process.exit(1);
});
