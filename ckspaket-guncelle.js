/**
 * c:\cks → c:\ckspaket senkron
 * Ana projedeki çiftçi kayıt güncellemeleri pakete aktarılır; pakete özel ayarlar korunur.
 */
const fs = require('fs');
const path = require('path');

const KAYNAK = 'C:\\cks';
const HEDEF = path.join(__dirname);

const KOPYALA = [
  'server.js',
  'auth.js',
  'index.html',
  'cks.html',
  'dashboard.html',
  'profil.html',
  'mesajlar.html',
  'mesaj-global.js',
  'mesaj-global.css',
  'mesai-whatsapp.js',
  'tzob-logo.png',
  '.gitignore',
  'dilekce.html',
  'dilekceliarama.html',
  'eksikler.html',
  'eksik_rapor.html',
  'tum_eksik_rapor.html',
  'formlar.html',
  'planli.html',
  'pasifleme.html',
  'ekevrak.html',
  'ibform.html',
  'destekleme.html',
  'cks_istatistik.html',
  'bilgi.html',
  'tarim-rehber.js',
  'tarim-rehber.html',
  'tarama-havuz-ui.js',
  'personel-pdf-havuz.html'
];

const KORU = new Set([
  'anasayfa.html', 'index.html', 'arsiv.html', 'package.json', 'OKU-BENI.md', '.env', '.env.example',
  'ckspaket-ayar.bat', 'ckspaket-baslat.bat', 'ckspaket-guncelle.bat', 'ckspaket-guncelle.js',
  'sistem-ayar.js', 'config.js',
  'kurum-sunucu.js', 'kurum-ayar.js', 'kurum-baslik.js', 'kurum-ayar-client.js',
  'ckspaket-sunucu.js', 'paket-guncelleme.js', 'git-guncelleme.js', 'ckspaket-surum-ui.js'
]);

const TARAMA_ALT = ['ckstaramalar', '2026cks', '2027cks', 'ib', 'ibtaramalar'];

function oku(p) { return fs.readFileSync(p, 'utf8'); }
function yaz(p, s) { fs.writeFileSync(p, s, 'utf8'); }

function bosTaramalarYapisi() {
  const kok = path.join(HEDEF, 'taramalar');
  fs.mkdirSync(kok, { recursive: true });
  for (const alt of TARAMA_ALT) {
    const p = path.join(kok, alt);
    fs.mkdirSync(p, { recursive: true });
    const keep = path.join(p, '.gitkeep');
    if (!fs.existsSync(keep)) fs.writeFileSync(keep, '');
  }
  console.log('  OK: taramalar/ (bos sablon)');
}

function dataKlasoruKopyala() {
  const srcData = path.join(KAYNAK, 'data');
  const dstData = path.join(HEDEF, 'data');
  if (!fs.existsSync(srcData)) {
    console.log('  ATLA: data/ (kaynak yok)');
    return;
  }
  fs.mkdirSync(dstData, { recursive: true });
  for (const f of fs.readdirSync(srcData)) {
    const src = path.join(srcData, f);
    if (!fs.statSync(src).isFile()) continue;
    fs.copyFileSync(src, path.join(dstData, f));
    console.log('  OK: data/' + f);
  }
}

function serverJsPaketYamasi() {
  const p = path.join(HEDEF, 'server.js');
  if (!fs.existsSync(p)) return;
  let s = oku(p);

  if (!s.includes('CKSPAKET_MOD')) {
    s = s.replace(
      /} catch \(_\) \{\}\s*\n\s*\nconst express = require\('express'\);/,
      `} catch (_) {}\n\nconst CKSPAKET_MOD = process.env.CKSPAKET === '1' || /ckspaket/i.test(String(gercekKlasorErken));\nconst CKSPAKET_TARAMA_KOK = process.env.CKS_TARAMA_KOK || path.join(gercekKlasorErken, 'taramalar');\n\nconst express = require('express');`
    );
  }
  s = s.replace(
    /const CKSPAKET_TARAMA_KOK = process\.env\.CKS_TARAMA_KOK \|\| path\.join\('C:', 'cks', 'taramalar'\);/,
    "const CKSPAKET_TARAMA_KOK = process.env.CKS_TARAMA_KOK || path.join(gercekKlasorErken, 'taramalar');"
  );
  s = s.replace(
    /const CKSPAKET_TARAMA_KOK = path\.join\(gercekKlasorErken, 'taramalar'\);/,
    "const CKSPAKET_TARAMA_KOK = process.env.CKS_TARAMA_KOK || path.join(gercekKlasorErken, 'taramalar');"
  );

  s = s.replace(/\n\/\*\* Ana CKS[\s\S]*?function sistemAyarAnaCksUygula\(\) \{[\s\S]*?\n\}\n/g, '\n');
  s = s.replace(/\n  sistemAyarAnaCksUygula\(\);\n/g, '\n');

  if (!s.includes('function sistemAyarPaketUygula')) {
    s = s.replace(
      /async function sistemAyarDbYukle\(\) \{/,
      `function sistemAyarPaketUygula() {
  if (!CKSPAKET_MOD) return;
  const paketPort = Number(process.env.PORT) || 3030;
  sistemAyarCache = sistemAyarBirlestir({
    ...sistemAyarCache,
    anaSunucuPort: paketPort,
    taramaKokKlasor: CKSPAKET_TARAMA_KOK
  });
}

async function sistemAyarDbYukle() {`
    );
  }
  if (!s.includes('sistemAyarPaketUygula();')) {
    s = s.replace(
      /(\n  return sistemAyarCache;\s*\n\}\s*\nfunction sistemAyarAl)/,
      '\n  sistemAyarPaketUygula();$1'
    );
  }
  if (!s.includes('sistemAyarPaketUygula();\n  const json = JSON.stringify(sistemAyarCache);')) {
    s = s.replace(
      /(async function sistemAyarDbKaydet\(veri\) \{[\s\S]*?sistemAyarCache = sistemAyarBirlestir\(veri \|\| \{\}\);)/,
      '$1\n  sistemAyarPaketUygula();'
    );
  }

  if (!s.includes('ibTaramaKlasorleri')) {
    s = s.replace(
      "// 📂 Hedef Klasör: C:\\cks\\taramalar\\ibtaramalar\n// --- 📂 2926 Sayılı Kanun Tarama Ayarları ---\n// Multer ayarını en sade hale getiriyoruz (Geçici isimle kaydedecek)\n// 1. Multer depolama ayarı (Geçici isimle kaydet)\nconst ibStorage = multer.diskStorage({\n    destination: 'C:\\\\cks\\\\taramalar\\\\ibtaramalar',",
      "// --- 📂 2926 Sayılı Kanun Tarama Ayarları ---\nfunction ibTaramaKlasorleri() {\n    const kok = taramaKokYol(sistemAyarAl());\n    return {\n        havuz: path.join(kok, 'ibtaramalar'),\n        arsiv: path.join(kok, 'ib')\n    };\n}\nconst ibStorage = multer.diskStorage({\n    destination: (req, file, cb) => {\n        const { havuz } = ibTaramaKlasorleri();\n        fs.mkdirSync(havuz, { recursive: true });\n        cb(null, havuz);\n    },"
    );
    s = s.replace("const hedefKlasor = 'C:\\\\cks\\\\taramalar\\\\ib';", 'const hedefKlasor = ibTaramaKlasorleri().arsiv;');
    s = s.replace(/C:\\\\cks\\\\taramalar\\\\ibtaramalar/g, "ibTaramaKlasorleri().havuz");
    s = s.replace(/'C:\\\\cks\\\\taramalar\\\\ib'/g, 'ibTaramaKlasorleri().arsiv');
    s = s.replace(
      /const havuzYolu = path\.join\('C:\\\\cks\\\\taramalar\\\\ibtaramalar', dosyaAdi\);\s*\n\s*const hedefKlasor = 'C:\\\\cks\\\\taramalar\\\\ib';/,
      'const { havuz, arsiv } = ibTaramaKlasorleri();\n        const havuzYolu = path.join(havuz, dosyaAdi);\n        const hedefKlasor = arsiv;'
    );
  }

  if (!s.includes("app.use('/taramalar'")) {
    s = s.replace(
      '// --- BELGENET VE PDF SİSTEMİ ---',
      `// --- BELGENET VE PDF SİSTEMİ ---
// Paket: /taramalar — ckspaket tarama havuzu (program klasoru\\taramalar)
app.use('/taramalar', (req, res, next) => {
  const kok = taramaKokYol(sistemAyarAl());
  express.static(kok)(req, res, next);
});`
    );
    if (!s.includes("app.use('/taramalar'")) {
      s = s.replace(
        '// --- AKILLI PDF BULUCU',
        `app.use('/taramalar', (req, res, next) => {
  const kok = taramaKokYol(sistemAyarAl());
  express.static(kok)(req, res, next);
});

// --- AKILLI PDF BULUCU`
      );
    }
  }

  s = s.replace(
    /const dosyaYolu = path\.join\('C:', 'CKS', 'taramalar', `\$\{aktifYil\}cks`, `\$\{temizDosyaAdi\}\.pdf`\);/,
    'const dosyaYolu = path.join(taramaYilKlasorYol(sistemAyarAl(), aktifYil), `${temizDosyaAdi}.pdf`);'
  );

  if (!s.includes('taramaYilKlasorYol(sa, yil)')) {
    s = s.replace(
      /function pdfYolunuBul\(gercekDosyaAdi\) \{[\s\S]*?const adaylar = \[[\s\S]*?\];/,
      `function pdfYolunuBul(gercekDosyaAdi) {
    const yil = new Date().getFullYear();
    const dosyaAdi = (gercekDosyaAdi || '').trim();
    if (!dosyaAdi) throw new Error('PDF dosya adı boş!');

    console.log(\`\\n🔍 PDF ARANIYOR: "\${dosyaAdi}"\`);
    const sa = sistemAyarAl();
    const adaylar = [
        path.join(taramaYilKlasorYol(sa, yil), dosyaAdi),
        path.join(taramaHavuzYol(sa), dosyaAdi),
        ...(CKSPAKET_MOD ? [] : [
            ...pdfAgYoluOlustur(CKS_TARAMA_AG_KOKU, yil, dosyaAdi),
            path.join('C:', 'CKS', 'taramalar', \`\${yil}cks\`, dosyaAdi),
            path.join('C:', 'cks', 'taramalar', \`\${yil}cks\`, dosyaAdi),
        ]),
    ];`
    );
  }

  s = s.replace(/const PORT = Number\(process\.env\.PORT\) \|\| 3000;/, 'const PORT = Number(process.env.PORT) || 3030;');
  s = s.replace(/if \(mesaiWa\.waAktifMi\(\)\) \{/, 'if (!CKSPAKET_MOD && mesaiWa.waAktifMi()) {');
  s = s.replace(/if \(zobisHatirlatmaAktif\) \{/, 'if (!CKSPAKET_MOD && zobisHatirlatmaAktif) {');

  s = s.replace(/mesaiWhatsAppDurum\(\);\(\);/g, 'mesaiWhatsAppDurum();');
  if (!s.includes('[CKS Paket] Mesai / Selektör')) {
    s = s.replace(
      /(\} else \{\s*console\.warn\('\[Ag\] LAN IP bulunamadi[^']*'\);\s*\})\s*(\n\s*(?:const wa = mesaiWa\.mesaiWhatsAppDurum\(\);[\s\S]*?)?(?:console\.log\(`\\nSunucu çalışıyor|await selektorMobilBaslat))/,
      `$1
    if (CKSPAKET_MOD) {
      console.log('[CKS Paket] Mesai / Selektör / Market modülleri kapalı.\\n');
      return;
    }
    const wa = mesaiWa.mesaiWhatsAppDurum();
    $2`
    );
    s = s.replace(
      /const wa = mesaiWa\.mesaiWhatsAppDurum\(\);\s*\n\s*console\.log\(`\\nSunucu çalışıyor/,
      `console.log(\`\\nSunucu çalışıyor`
    );
  }

  s = s.replace(
    /console\.log\('Sistem ayarları:', anaSunucuUrl\(sistemAyarAl\(\)\), '\| tarama:', taramaKokYol\(sistemAyarAl\(\)\)\);/,
    `if (CKSPAKET_MOD) {
    console.log('[CKS Paket] Mod aktif — port', Number(process.env.PORT) || 3030, '| tarama:', taramaKokYol(sistemAyarAl()));
  } else {
    console.log('Sistem ayarları:', anaSunucuUrl(sistemAyarAl()), '| tarama:', taramaKokYol(sistemAyarAl()));
  }`
  );

  s = s.replace(
    /const dbConfig = \{[\s\S]*?connectionTimeout: \d+\s*\};/,
    `const dbConfig = {
  user: process.env.DB_USER || 'sa',
  password: process.env.DB_PASS || '189189',
  server: process.env.DB_SERVER || 'YENISERVER',
  database: process.env.DB_NAME || 'demoanaa',
  options: {
        encrypt: false,
        trustServerCertificate: true,
    },
    requestTimeout: 120000,
    connectionTimeout: 60000
};`
  );
  s = s.replace(/\[anaa\]\.\[dbo\]\./g, '');
  s = s.replace(
    /console\.log\("Veritabanına bağlandı!"\);/,
    "console.log('Veritabanına bağlandı:', dbConfig.database, `(${dbConfig.server})`);"
  );

  // Erken static — HTML route onceligini bozar; dosya sonunda ckspaket-sunucu.js
  s = s.replace(/\napp\.use\(express\.static\(__dirname\)\);\n/, '\n// express.static(gercekKlasor) — ckspaket-sunucu.js dosya sonunda\n');

  if (!s.includes('registerCkspaketSunucu')) {
    s = s.replace(
      /app\.use\('\/api', require\('\.\/auth'\)\);\s*\n/,
      `app.use('/api', require('./auth'));

// CKS Paket — kurum adi, guncelleme bildirimi, health
try {
  const { registerCkspaketSunucu } = require('./ckspaket-sunucu');
  registerCkspaketSunucu(app, { getPool, gercekKlasor, CKSPAKET_MOD, authenticateToken, sadeceAdmin });
} catch (e) { console.warn('[ckspaket-sunucu]', e.message); }

`
    );
  }

  // / ve /anasayfa.html — kurum-sunucu.js (Bearer GET tasimaz)
  s = s.replace(
    /\napp\.get\('\/', \(req, res\) => res\.sendFile\(path\.join\(__dirname, 'index\.html'\)\)\);\s*\napp\.get\('\/anasayfa\.html', authenticateToken, \(req, res\) => res\.sendFile\(path\.join\(__dirname, 'anasayfa\.html'\)\)\);\s*\n/,
    '\n'
  );

  if (!s.includes('registerCkspaketStatic')) {
    s = s.replace(
      /(\n  const dinle = \(host\) => new Promise)/,
      `
  if (CKSPAKET_MOD) {
    try { require('./ckspaket-sunucu').registerCkspaketStatic(app, gercekKlasor); } catch (_) {}
  }$1`
    );
  }

  yaz(p, s);
  console.log('  OK: server.js paket yamalari');
}

function cksHtmlPaketYamasi() {
  const p = path.join(HEDEF, 'cks.html');
  if (!fs.existsSync(p)) return;
  let s = oku(p);
  s = s.replace(/http:\/\/127\.0\.0\.1:3000\/api\/belgenet/g, '/api/belgenet');
  s = s.replace(/fetch\('\/api\/belgenet/g, "fetch('/api/belgenet");
  s = s.replace(/t\.anaSunucuPort \|\| 3000/g, 't.anaSunucuPort || 3030');
  s = s.replace(/anaSunucuPort \|\| 3000/g, 'anaSunucuPort || 3030');
  if (!s.includes('ckspaketM')) {
    s = s.replace(
      /function tanimlarAgYol\(anaIp, kokKlasor, alt\) \{[\s\S]*?return yol;\s*\}/,
      `function tanimlarAgYol(anaIp, kokKlasor, alt) {
    const m = String(kokKlasor || '').match(/^([A-Za-z]):\\\\(.*)$/i);
    if (!m) return '—';
    const altYol = String(m[2] || '').replace(/\\//g, '\\\\');
    let paylasim, paylasimAlti;
    const ckspaketM = altYol.match(/^ckspaket\\\\(.*)$/i);
    if (ckspaketM) {
        paylasim = 'ckspaket';
        paylasimAlti = ckspaketM[1];
    } else {
        const cksM = altYol.match(/^cks\\\\(.*)$/i);
        if (cksM) {
            paylasim = 'cks';
            paylasimAlti = cksM[1];
        } else {
            paylasim = m[1].toLowerCase() === 'c' ? 'cks' : m[1].toLowerCase();
            paylasimAlti = altYol;
        }
    }
    let yol = '\\\\\\\\' + anaIp + '\\\\' + paylasim;
    if (paylasimAlti) yol += '\\\\' + paylasimAlti;
    if (alt) yol += '\\\\' + String(alt).replace(/\\//g, '\\\\');
    return yol;
}`
    );
  }
  yaz(p, s);
  console.log('  OK: cks.html paket yamalari');
}

function dilekcePaketYamasi() {
  const p = path.join(HEDEF, 'dilekce.html');
  if (!fs.existsSync(p)) return;
  let s = oku(p);
  s = s.replace(
    /const gercekPdfYolu = `\/taramalar\/\$\{aktifYil\}cks\/\$\{data\.dosyadi\}\.pdf[^`]*`;/,
    'const gercekPdfYolu = `/pdf-arsivi/${encodeURIComponent(data.dosyadi + \'.pdf\')}#toolbar=0&navpanes=0&scrollbar=0`;'
  );
  const pdfAcYeni = `function pdfAc(dosyaAdi) {
    const ad = String(dosyaAdi || '').trim();
    const uzanti = ad.toLowerCase().endsWith('.pdf') ? '' : '.pdf';
    const url = \`/pdf-arsivi/\${encodeURIComponent(ad + uzanti)}\`;
    window.open(url, '_blank');
}`;
  if (!s.includes('encodeURIComponent(ad + uzanti)')) {
    const eskiCks = /function pdfAc\(dosyaAdi\) \{\s*const uzanti = dosyaAdi\.toLowerCase\(\)\.endsWith\('\.pdf'\) \? '' : '\.pdf';\s*const url = `http:\/\/192\.168\.1\.120:3000\/pdf-arsivi\/\$\{dosyaAdi\}\$\{uzanti\}`;\s*window\.open\(url, '_blank'\);\s*\}/;
    const eskiPaket = /function pdfAc\(dosyaAdi\) \{[\s\S]*?\n\}\s*\}\$\{uzanti\}`;[\s\S]*?window\.open\(url, '_blank'\);\s*\n\}/;
    if (eskiPaket.test(s)) {
      s = s.replace(eskiPaket, pdfAcYeni);
    } else {
      s = s.replace(eskiCks, pdfAcYeni);
    }
  }
  yaz(p, s);
  console.log('  OK: dilekce.html paket yamalari');
}

function ibformPaketYamasi() {
  const p = path.join(HEDEF, 'ibform.html');
  if (!fs.existsSync(p)) return;
  let s = oku(p);
  s = s.replace(/http:\/\/192\.168\.1\.120:3000\/api\//g, '/api/');
  s = s.replace(/http:\/\/127\.0\.0\.1:3000\/api\//g, '/api/');
  yaz(p, s);
  console.log('  OK: ibform.html paket yamalari');
}

console.log('=== CKS → CKS Paket Senkron ===');
console.log('Kaynak:', KAYNAK);
console.log('Hedef :', HEDEF);
console.log('');

let ok = 0, atla = 0, hata = 0;

for (const dosya of KOPYALA) {
  if (KORU.has(dosya)) { atla++; continue; }
  const src = path.join(KAYNAK, dosya);
  const dst = path.join(HEDEF, dosya);
  if (!fs.existsSync(src)) {
    console.log('  ATLA (yok):', dosya);
    atla++;
    continue;
  }
  try {
    fs.copyFileSync(src, dst);
    console.log('  OK:', dosya);
    ok++;
  } catch (e) {
    console.log('  HATA:', dosya, e.message);
    hata++;
  }
}

const odaSrc = path.join(KAYNAK, 'public', 'img', 'odalar');
const odaDst = path.join(HEDEF, 'public', 'img', 'odalar');
if (fs.existsSync(odaSrc)) {
  fs.mkdirSync(odaDst, { recursive: true });
  for (const f of fs.readdirSync(odaSrc)) {
    try {
      fs.copyFileSync(path.join(odaSrc, f), path.join(odaDst, f));
      console.log('  OK: public/img/odalar/' + f);
      ok++;
    } catch (e) {
      console.log('  HATA: oda resmi', f, e.message);
      hata++;
    }
  }
}

const tumEksikSrc = path.join(KAYNAK, 'tum_eksik_rapor.html');
const tumEksikAlias = path.join(HEDEF, 'tum_eksikler_rapor.html');
if (fs.existsSync(tumEksikSrc)) {
  try {
    fs.copyFileSync(tumEksikSrc, tumEksikAlias);
    console.log('  OK: tum_eksikler_rapor.html (alias)');
  } catch (e) {
    console.log('  HATA: tum_eksikler_rapor alias', e.message);
  }
}

console.log('');
console.log('--- Paket yamalari ---');
serverJsPaketYamasi();
cksHtmlPaketYamasi();
dilekcePaketYamasi();
ibformPaketYamasi();
bosTaramalarYapisi();
dataKlasoruKopyala();

function portDogrulama() {
  const hatalar = [];
  const srvPath = path.join(HEDEF, 'server.js');
  const srv = oku(srvPath);
  if (srv.includes('sistemAyarAnaCksUygula')) hatalar.push('server.js icinde Ana CKS port kilidi kalmis');
  if (!srv.includes('CKSPAKET_MOD')) hatalar.push('server.js: CKSPAKET_MOD eksik');
  if (!/const PORT = Number\(process\.env\.PORT\) \|\| 3030/.test(srv)) hatalar.push('server.js: PORT varsayilan 3030 olmali');
  if (!srv.includes('sistemAyarPaketUygula')) hatalar.push('server.js: sistemAyarPaketUygula eksik');
  const envPath = path.join(HEDEF, '.env');
  if (fs.existsSync(envPath) && !/^PORT=3030\s*$/m.test(oku(envPath))) {
    hatalar.push('.env: PORT=3030 korunmali (senkron .env dosyasina dokunmaz)');
  }
  if (fs.existsSync(envPath) && !/^DB_NAME=(demoanaa|ckspaketdata)\s*$/m.test(oku(envPath))) {
    hatalar.push('.env: DB_NAME=demoanaa veya ckspaketdata olmali (3030 paket veritabani)');
  }
  if (/\[anaa\]\.\[dbo\]\./.test(srv)) {
    hatalar.push('server.js: [anaa].[dbo] sabit referanslari kalmis');
  }
  if (!/database: process\.env\.DB_NAME \|\| 'demoanaa'/.test(srv)) {
    hatalar.push('server.js: dbConfig demoanaa (.env) kullanmali');
  }
  if (!srv.includes("app.get('/api/tarama-havuz-listesi'")) {
    hatalar.push('server.js: /api/tarama-havuz-listesi eksik');
  }
  if (!srv.includes('havuzPdfKullaniciyaAit')) {
    hatalar.push('server.js: havuz kullanici eslestirme eksik');
  }
  if (!fs.existsSync(path.join(HEDEF, 'tarama-havuz-ui.js'))) {
    hatalar.push('tarama-havuz-ui.js eksik');
  }
  if (!fs.existsSync(path.join(HEDEF, 'personel-pdf-havuz.html'))) {
    hatalar.push('personel-pdf-havuz.html eksik');
  }
  const dilekce = oku(path.join(HEDEF, 'dilekce.html'));
  if (!dilekce.includes('tarama-havuz-ui.js') || !dilekce.includes('taramaHavuzDosyaSec')) {
    hatalar.push('dilekce.html: tarama havuz secim UI entegre degil');
  }
  if (hatalar.length) {
    console.error('\nPORT DOGRULAMA HATASI (ckspaket 3030):');
    hatalar.forEach((h) => console.error('  -', h));
    process.exit(1);
  }
  console.log('  OK: port kilidi dogrulandi (ckspaket = 3030)');
}

console.log('');
console.log('--- Port dogrulama ---');
portDogrulama();

console.log('');
console.log(`Tamamlandi: ${ok} kopyalandi, ${atla} atlandi, ${hata} hata`);
console.log('Korunan: anasayfa.html, arsiv.html, sistem-ayar.js, .env, taramalar/ (icerik)');
console.log('NOT: c:\\cks (port 3000) bu senkronla DEGISMEZ — sadece okunur.');
