/**
 * Müşteri dağıtım paketi — C:\ckspaket'e kopyala-çalıştır
 * Kullanım: node ckspaket-paketle.js [--musteri] [sürüm notu]
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const KOK = __dirname;
const DIST = path.join(KOK, 'dist');
const GUNCELLEME = path.join(KOK, 'guncellemeler');

const argv = process.argv.slice(2);
const MUSTERI_MOD = argv.includes('--musteri');
const SURUM_ARTIR = argv.includes('--artir');
const filtArg = argv.filter((a) => a !== '--musteri' && a !== '--artir');
const notlarArg = filtArg.join(' ').trim();
const notlar = notlarArg.replace(/^"(.*)"$/, '$1');

const {
  mevcutSurumAl,
  surumArtir,
  surumSenkronYaz,
  manifestYaz
} = require('./paket-guncelleme');

const HARIC = new Set([
  'node_modules',
  '.wwebjs_auth',
  'dist',
  'uploads',
  '.git',
  '.env',
  '_guncelleme_yedek',
  '_git_klon'
]);

const MUSTERI_HARIC = new Set([
  'ckspaket-yayinla.js',
  'ckspaket-yayinla.bat',
  'ckspaket-paketle.js',
  'ckspaket-paketle.bat',
  'ckspaket-musteri-surum.bat',
  'ckspaket-guncelle.js',
  'ckspaket-guncelle.bat',
  'ckspaket-sync.bat',
  'guncellemeler'
]);

const TARAMA_ALT = ['ckstaramalar', '2026cks', '2027cks', 'ib', 'ibtaramalar'];

function okuJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function surumAl() {
  if (SURUM_ARTIR) {
    const mevcut = mevcutSurumAl(KOK).surum;
    const yeni = surumArtir(mevcut, 'patch');
    surumSenkronYaz(KOK, yeni, notlar || `${yeni} müşteri sürümü`);
    console.log('  Surum artirildi:', mevcut, '->', yeni);
    return yeni;
  }
  return okuJson(path.join(KOK, 'package.json')).version;
}

function dosyaListesi(klasor, kok = klasor) {
  const liste = [];
  if (!fs.existsSync(klasor)) return liste;
  for (const ad of fs.readdirSync(klasor)) {
    if (HARIC.has(ad)) continue;
    if (MUSTERI_MOD && MUSTERI_HARIC.has(ad)) continue;
    const tam = path.join(klasor, ad);
    const rel = path.relative(kok, tam);
    if (ad === 'taramalar' && fs.statSync(tam).isDirectory()) {
      for (const alt of TARAMA_ALT) {
        liste.push(path.join('taramalar', alt, '.gitkeep'));
      }
      continue;
    }
    const st = fs.statSync(tam);
    if (st.isDirectory()) {
      liste.push(...dosyaListesi(tam, kok));
    } else {
      liste.push(rel);
    }
  }
  return liste;
}

function musteriKurBat(surum) {
  return `@echo off
title CKS Paket v${surum} — Ilk Kurulum
cd /d "%~dp0"

echo.
echo ========================================
echo   CKS PAKET v${surum} — ILK KURULUM
echo ========================================
echo.
echo Bu klasor C:\\ckspaket icinde olmali.
echo Ornek: C:\\ckspaket\\MUSTERI-KUR.bat
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo HATA: Node.js yuklu degil.
  echo Indirin: https://nodejs.org  ^(LTS surumu^)
  pause
  exit /b 1
)

if /i not "%CD%"=="C:\\ckspaket" (
  echo UYARI: Su anki klasor C:\\ckspaket degil: %CD%
  echo Dosyalari C:\\ckspaket klasorune kopyalamaniz onerilir.
  echo.
)

if not exist ".env" (
  if exist ".env.musteri" (
    copy /Y ".env.musteri" ".env" >nul
    echo .env olusturuldu — SQL bilgilerini duzenleyin.
    notepad .env
  ) else (
    echo HATA: .env.musteri bulunamadi.
    pause
    exit /b 1
  )
)

if not exist "node_modules" (
  echo.
  echo npm install calistiriliyor ^(ilk kurulum, birkaç dakika^)...
  call npm install --omit=dev
  if errorlevel 1 (
    echo HATA: npm install basarisiz.
    pause
    exit /b 1
  )
)

echo.
echo Masaustu kisayolu olusturuluyor...
wscript.exe //nologo "%~dp0kisayol-olustur.vbs"

echo.
echo Kurulum tamam. Program baslatiliyor...
call baslat.bat
`;
}

function musteriOkuBeni(surum, not) {
  return `CKS PAKET v${surum} — Musteri Kurulum
================================

KURULUM (ilk kez)
-----------------
1. SQL Server 2022 Express kurun (MUSTERI-SQL-KURULUM.txt)
2. Bu klasoru C:\\ckspaket olarak kopyalayin
3. ckspaketdata-musteri-kur.bat  (veritabani — localhost)
4. MUSTERI-KUR.bat               (npm + sunucu)

Tarayici: http://127.0.0.1:3030

SQL (.env):
  DB_SERVER=localhost
  DB_USER=sa
  DB_PASS=189189
  DB_NAME=ckspaketdata

GUNCELLEME
----------
ckspaket-musteri-guncelle.bat  (tek tik — otomatik gunceller)

PROGRAM
-------
baslat.bat   (cift tik — sunucu arka planda + tarayici acilir)
durdur.bat   (sunucuyu kapatir)

Masaustunde "CKS Paket" kisayolu olusur (buğday ikonu).

NOTLAR
------
${not || 'Ilk musteri surumu'}
Surum: v${surum}
Tarih: ${new Date().toISOString().slice(0, 10)}

Destek: Sarayonu Ziraat Odasi — CKS Paket
`;
}

function envMusteriOlustur(hedefKlasor) {
  const s = `# CKS Paket — Musteri SQL ayarlari
DB_SERVER=localhost
DB_USER=sa
DB_PASS=189189
DB_NAME=ckspaketdata
PORT=3030
CKSPAKET=1

MESAI_WA_AKTIF=false
ZOBIS_HATIRLATMA_AKTIF=false

# Git guncelleme — gelistirici "Surum Cik" yapinca GitHub'dan otomatik cekilir
# (.env, taramalar, uploads dokunulmaz)
GIT_REPO_URL=https://github.com/bahrikarli/ckspaket.git
GIT_BRANCH=main

# Ozel repo: GIT_TOKEN=ghp_xxxx

# Ozel repo: GIT_TOKEN=ghp_xxxx
`;
  fs.writeFileSync(path.join(hedefKlasor, '.env.musteri'), s, 'utf8');
}

function musteriDosyalariEkle(hedef, surum) {
  fs.writeFileSync(path.join(hedef, 'MUSTERI-KUR.bat'), musteriKurBat(surum), 'utf8');
  fs.writeFileSync(path.join(hedef, 'MUSTERI-OKU-BENI.txt'), musteriOkuBeni(surum, notlar), 'utf8');
  envMusteriOlustur(hedef);
  const sqlKur = path.join(KOK, 'MUSTERI-SQL-KURULUM.txt');
  if (fs.existsSync(sqlKur)) {
    fs.copyFileSync(sqlKur, path.join(hedef, 'MUSTERI-SQL-KURULUM.txt'));
  }
  const semaBak = path.join(KOK, 'sema', 'ckspaketdata-sema.bak');
  if (fs.existsSync(semaBak)) {
    const hedefSema = path.join(hedef, 'sema');
    fs.mkdirSync(hedefSema, { recursive: true });
    fs.copyFileSync(semaBak, path.join(hedefSema, 'ckspaketdata-sema.bak'));
    console.log('  OK: sema/ckspaketdata-sema.bak');
  } else {
    console.log('  UYARI: sema/ckspaketdata-sema.bak yok — once ckspaket-sema-yedek-al.bat calistirin');
  }
  console.log('  OK: MUSTERI-KUR.bat, MUSTERI-OKU-BENI.txt, .env.musteri');
}

function geciciKopyaOlustur(surum) {
  const klasorAdi = MUSTERI_MOD ? `ckspaket-v${surum}-musteri` : `_paket_${surum}`;
  const tmp = path.join(KOK, 'dist', klasorAdi);
  if (fs.existsSync(tmp)) fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(tmp, { recursive: true });

  const dosyalar = dosyaListesi(KOK);
  for (const rel of dosyalar) {
    const src = path.join(KOK, rel);
    if (!fs.existsSync(src)) continue;
    const dst = path.join(tmp, rel);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
  }

  for (const alt of TARAMA_ALT) {
    const p = path.join(tmp, 'taramalar', alt);
    fs.mkdirSync(p, { recursive: true });
    const keep = path.join(p, '.gitkeep');
    if (!fs.existsSync(keep)) fs.writeFileSync(keep, '');
  }

  if (MUSTERI_MOD) {
    musteriDosyalariEkle(tmp, surum);
  }

  return tmp;
}

function zipOlustur(kaynakKlasor, zipYol) {
  fs.mkdirSync(path.dirname(zipYol), { recursive: true });
  if (fs.existsSync(zipYol)) fs.unlinkSync(zipYol);
  const ps = [
    `$src = '${kaynakKlasor.replace(/'/g, "''")}'`,
    `$dst = '${zipYol.replace(/'/g, "''")}'`,
    'Compress-Archive -Path (Join-Path $src "*") -DestinationPath $dst -Force'
  ].join('; ');
  execSync(`powershell -NoProfile -Command "${ps}"`, { stdio: 'inherit' });
}

function musteriVerKlasoruOlustur(surum, zipAdi) {
  const hedef = path.join(KOK, 'MUSTERIYE-VER', `v${surum}`);
  fs.mkdirSync(hedef, { recursive: true });
  fs.copyFileSync(path.join(GUNCELLEME, zipAdi), path.join(hedef, zipAdi));
  fs.copyFileSync(path.join(GUNCELLEME, 'guncelleme.json'), path.join(hedef, 'guncelleme.json'));
  const talimat = [
    `CKS Paket — v${surum} Guncelleme Paketi`,
    '',
    'MUSTERIYE GONDERIN (USB, e-posta, Teams vb.):',
    `  1) ${zipAdi}`,
    '  2) guncelleme.json',
    '',
    'Musteri bilgisayarinda:',
    '  1) Her iki dosyayi C:\\ckspaket\\guncellemeler\\ icine kopyalayin',
    '  2) ckspaket-musteri-guncelle.bat calistirin',
    '',
    'IP adresi veya internet gerekmez.'
  ].join('\r\n');
  fs.writeFileSync(path.join(hedef, 'NASIL-KURULUR.txt'), talimat + '\r\n', 'utf8');
  console.log('  OK: MUSTERIYE-VER/v' + surum + '/');
  return hedef;
}

function manifestVeZipKaydet(surum, zipAdi) {
  fs.mkdirSync(GUNCELLEME, { recursive: true });
  fs.copyFileSync(path.join(DIST, zipAdi), path.join(GUNCELLEME, zipAdi));
  console.log('  OK: guncellemeler/' + zipAdi);
  manifestYaz(KOK, surum, zipAdi, null, null, notlar);
  console.log('  OK: guncellemeler/guncelleme.json');
  if (MUSTERI_MOD) {
    musteriVerKlasoruOlustur(surum, zipAdi);
  }
}

// manifestYaz — paket-guncelleme.js uzerinden (manifestVeZipKaydet)

const surum = surumAl();
const zipAdi = MUSTERI_MOD ? `ckspaket-v${surum}-musteri.zip` : `ckspaket-v${surum}.zip`;
const zipYol = path.join(DIST, zipAdi);

console.log(MUSTERI_MOD ? '=== CKS Paket — MUSTERI SURUM ===' : '=== CKS Paket — Musteri ZIP ===');
console.log('Surum: v' + surum);
console.log('');

const tmp = geciciKopyaOlustur(surum);
console.log('  Paket klasoru:', tmp);

try {
  zipOlustur(tmp, zipYol);
  console.log('  OK ZIP:', zipYol);
} catch (err) {
  console.error('  ZIP hatasi:', err.message);
}

if (!MUSTERI_MOD) {
  fs.rmSync(tmp, { recursive: true, force: true });
}

manifestVeZipKaydet(surum, zipAdi);

console.log('');
console.log('Tamamlandi.');
console.log('');
if (MUSTERI_MOD) {
  console.log('MUSTERIYE VERIN:');
  console.log('  Klasor:', tmp);
  console.log('  ZIP   :', zipYol);
  console.log('');
  console.log('Musteri adimlari:');
  console.log('  1) Klasoru veya ZIP icerigini C:\\ckspaket altina kopyalayin');
  console.log('  2) MUSTERI-KUR.bat calistirin');
} else {
  console.log('Musteriye verilecek dosya:', zipYol);
}
