/**
 * Müşteri kurulumunda güncelleme uygular (Git veya ZIP).
 * Sunucu kapalıyken çalıştırın: ckspaket-musteri-guncelle.bat
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const axios = require('axios');
const { surumKarsilastir, mevcutSurumAl } = require('./paket-guncelleme');
const { gitGuncellemeAktifMi, gitPullUygula, gitUzakSurumKontrol, gitKuruluMu, githubZipGuncelle } = require('./git-guncelleme');

const KOK = __dirname;

try {
  require('dotenv').config({ path: path.join(KOK, '.env'), quiet: true });
} catch (_) {}

/** Guncelleme sirasinda ASLA degistirilmez / yedeklenmez (taramalar dahil) */
const KORU_DOSYALAR = ['.env'];
const KORU_KLASORLER = ['taramalar', 'uploads', 'guncellemeler', 'node_modules', 'logs', '_guncelleme_yedek', '_git_klon'];
let yedekKok = '';

function yedekAl() {
  console.log('.env yedekleniyor (taramalar ve uploads dokunulmaz)...');
  yedekKok = path.join(KOK, '_guncelleme_yedek');
  if (fs.existsSync(yedekKok)) fs.rmSync(yedekKok, { recursive: true, force: true });
  fs.mkdirSync(yedekKok, { recursive: true });
  for (const ad of KORU_DOSYALAR) {
    const src = path.join(KOK, ad);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(yedekKok, ad));
  }
  console.log('Yedek tamam.');
}

function yedekGeri() {
  if (!yedekKok || !fs.existsSync(yedekKok)) return;
  for (const ad of KORU_DOSYALAR) {
    const src = path.join(yedekKok, ad);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(KOK, ad));
  }
  fs.rmSync(yedekKok, { recursive: true, force: true });
  yedekKok = '';
}

function koruIslem(islem) {
  if (islem === 'yedek') yedekAl();
  else if (islem === 'geri') yedekGeri();
}

async function manifestAl() {
  const url = String(process.env.GUNCELLEME_URL || '').trim();
  if (!url) throw new Error('GUNCELLEME_URL .env dosyasinda tanimli degil');
  const res = await axios.get(url, { timeout: 30000, validateStatus: (s) => s === 200 });
  return res.data;
}

async function zipIndir(url, hedef) {
  const res = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 120000,
    validateStatus: (s) => s === 200
  });
  fs.mkdirSync(path.dirname(hedef), { recursive: true });
  fs.writeFileSync(hedef, Buffer.from(res.data));
}

function zipAc(zipYol, hedefKlasor) {
  fs.mkdirSync(hedefKlasor, { recursive: true });
  const ps = [
    `$zip = '${zipYol.replace(/'/g, "''")}'`,
    `$dst = '${hedefKlasor.replace(/'/g, "''")}'`,
    'Expand-Archive -Path $zip -DestinationPath $dst -Force'
  ].join('; ');
  execSync(`powershell -NoProfile -Command "${ps}"`, { stdio: 'inherit' });
}

function dosyalariUygula(kaynak, hedef) {
  for (const ad of fs.readdirSync(kaynak)) {
    const src = path.join(kaynak, ad);
    const dst = path.join(hedef, ad);
    if (KORU_DOSYALAR.includes(ad)) continue;
    if (KORU_KLASORLER.includes(ad)) continue;
    const st = fs.statSync(src);
    if (st.isDirectory()) {
      if (fs.existsSync(dst)) fs.rmSync(dst, { recursive: true, force: true });
      execSync(`xcopy "${src}" "${dst}\\" /E /I /Y /Q`, { stdio: 'inherit' });
    } else {
      fs.copyFileSync(src, dst);
    }
  }
}

async function zipGuncelle(mevcut) {
  const manifest = await manifestAl();
  const yeniSurum = String(manifest.surum || manifest.version || '').trim();
  const indirmeUrl = String(manifest.indirmeUrl || manifest.downloadUrl || '').trim();
  if (!yeniSurum || !indirmeUrl) throw new Error('Manifest eksik: surum veya indirmeUrl yok');
  if (surumKarsilastir(yeniSurum, mevcut.surum) <= 0) return false;

  console.log('Yeni surum (ZIP):', yeniSurum);
  if (manifest.notlar) console.log('Notlar:', manifest.notlar);

  const tmpZip = path.join(KOK, 'guncellemeler', '_indirilen.zip');
  const tmpAc = path.join(KOK, 'guncellemeler', '_acilan');
  console.log('Indiriliyor...');
  await zipIndir(indirmeUrl, tmpZip);
  yedekAl();
  try {
    if (fs.existsSync(tmpAc)) fs.rmSync(tmpAc, { recursive: true, force: true });
    zipAc(tmpZip, tmpAc);
    dosyalariUygula(tmpAc, KOK);
    yedekGeri();
  } catch (err) {
    yedekGeri();
    throw err;
  } finally {
    if (fs.existsSync(tmpAc)) fs.rmSync(tmpAc, { recursive: true, force: true });
    if (fs.existsSync(tmpZip)) fs.unlinkSync(tmpZip);
  }
  return true;
}

(async () => {
  console.log('=== CKS Paket — Musteri Guncelleme ===');
  console.log('Klasor:', KOK);
  console.log('');

  const mevcut = mevcutSurumAl(KOK);
  console.log('Mevcut surum:', mevcut.surum);

  let guncellendi = false;

  if (gitGuncellemeAktifMi(KOK)) {
    console.log('Yontem: Git');
    const kontrol = await gitUzakSurumKontrol(KOK);
    if (kontrol && !kontrol.guncellemeVar) {
      console.log('');
      console.log('Zaten guncel (Git).');
      process.exit(0);
    }
    if (kontrol?.yeniSurum) {
      console.log('Yeni surum (Git):', kontrol.yeniSurum);
      if (kontrol.notlar) console.log('Notlar:', kontrol.notlar);
    }
    console.log('');
    console.log('Guncelleme indiriliyor...');
    let sonuc;
    if (gitKuruluMu()) {
      sonuc = gitPullUygula(KOK, koruIslem);
    } else {
      sonuc = await githubZipGuncelle(KOK, koruIslem);
    }
    guncellendi = sonuc.guncellendi;
    if (!guncellendi) {
      console.log('');
      console.log('Zaten guncel (Git).');
      process.exit(0);
    }
  } else {
    console.log('Yontem: ZIP');
    guncellendi = await zipGuncelle(mevcut);
    if (!guncellendi) {
      console.log('');
      console.log('Zaten guncel (ZIP).');
      process.exit(0);
    }
  }

  console.log('');
  console.log('npm install calistiriliyor...');
  execSync('npm install --omit=dev --no-audit', { cwd: KOK, stdio: 'inherit' });

  const guncel = mevcutSurumAl(KOK);
  console.log('');
  console.log('Guncelleme tamamlandi. Surum:', guncel.surum);
  process.exit(0);
})().catch((err) => {
  console.error('');
  console.error('GUNCELLEME BASARISIZ:', err.message);
  process.exit(1);
});

