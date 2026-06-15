/**
 * Müşteri kurulumunda güncelleme uygular (Git veya ZIP).
 * Sunucu kapalıyken çalıştırın: ckspaket-musteri-guncelle.bat
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const axios = require('axios');
const { surumKarsilastir, mevcutSurumAl } = require('./paket-guncelleme');
const { durumBaslat, durumGuncelle, durumBitir } = require('./guncelleme-durum');
const { gitGuncellemeAktifMi, gitPullUygula, gitUzakSurumKontrol, gitKuruluMu, githubZipGuncelle } = require('./git-guncelleme');
const { koruMu } = require('./guncelleme-koru');
const { zipAc, kaynakTemizle, zipKaynakBul } = require('./guncelleme-zip');

const KOK = __dirname;

try {
  require('dotenv').config({ path: path.join(KOK, '.env'), quiet: true });
} catch (_) {}

let yedekKok = '';

function yedekAl() {
  console.log('.env yedekleniyor (taramalar/dist/uploads DOKUNULMAZ)...');
  yedekKok = path.join(KOK, '_guncelleme_yedek');
  if (fs.existsSync(yedekKok)) fs.rmSync(yedekKok, { recursive: true, force: true });
  fs.mkdirSync(yedekKok, { recursive: true });
  const env = path.join(KOK, '.env');
  if (fs.existsSync(env)) fs.copyFileSync(env, path.join(yedekKok, '.env'));
  console.log('Yedek tamam.');
}

function yedekGeri() {
  if (!yedekKok || !fs.existsSync(yedekKok)) return;
  const src = path.join(yedekKok, '.env');
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(KOK, '.env'));
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

function dosyalariUygula(kaynak, hedef) {
  kaynakTemizle(kaynak);
  for (const ad of fs.readdirSync(kaynak)) {
    if (koruMu(ad)) {
      console.log('  atla:', ad);
      continue;
    }
    const src = path.join(kaynak, ad);
    const dst = path.join(hedef, ad);
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
  durumGuncelle(KOK, 35, `v${yeniSurum} indiriliyor…`, 'indir', 'guncelleme');
  await zipIndir(indirmeUrl, tmpZip);
  yedekAl();
  try {
    durumGuncelle(KOK, 50, 'Paket açılıyor…', 'ac', 'guncelleme');
    if (fs.existsSync(tmpAc)) fs.rmSync(tmpAc, { recursive: true, force: true });
    zipAc(tmpZip, tmpAc);
    durumGuncelle(KOK, 60, 'Dosyalar kopyalanıyor…', 'kopyala', 'guncelleme');
    const kaynakKok = zipKaynakBul(tmpAc);
    dosyalariUygula(kaynakKok, KOK);
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

  durumBaslat(KOK, 'guncelleme', 'Güncelleme kontrol ediliyor…');
  durumGuncelle(KOK, 8, 'Mevcut sürüm okunuyor…', 'kontrol', 'guncelleme');

  const mevcut = mevcutSurumAl(KOK);
  console.log('Mevcut surum:', mevcut.surum);

  let guncellendi = false;

  if (gitGuncellemeAktifMi(KOK)) {
    console.log('Yontem: Git');
    durumGuncelle(KOK, 15, 'Git deposu kontrol ediliyor…', 'git', 'guncelleme');
    const kontrol = await gitUzakSurumKontrol(KOK);
    if (kontrol && !kontrol.guncellemeVar) {
      console.log('');
      console.log('Zaten guncel (Git).');
      durumBitir(KOK, true, 'Zaten güncel', mevcut.surum, 'guncelleme');
      process.exit(0);
    }
    if (kontrol?.yeniSurum) {
      console.log('Yeni surum (Git):', kontrol.yeniSurum);
      if (kontrol.notlar) console.log('Notlar:', kontrol.notlar);
    }
    console.log('');
    console.log('Guncelleme indiriliyor...');
    durumGuncelle(KOK, 30, 'Güncelleme indiriliyor…', 'indir', 'guncelleme');
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
      durumBitir(KOK, true, 'Zaten güncel', mevcut.surum, 'guncelleme');
      process.exit(0);
    }
    durumGuncelle(KOK, 65, 'Dosyalar uygulandı', 'uygula', 'guncelleme');
  } else {
    console.log('Yontem: ZIP');
    durumGuncelle(KOK, 20, 'Güncelleme manifesti okunuyor…', 'manifest', 'guncelleme');
    guncellendi = await zipGuncelle(mevcut);
    if (!guncellendi) {
      console.log('');
      console.log('Zaten guncel (ZIP).');
      durumBitir(KOK, true, 'Zaten güncel', mevcut.surum, 'guncelleme');
      process.exit(0);
    }
    durumGuncelle(KOK, 70, 'ZIP dosyaları uygulandı', 'uygula', 'guncelleme');
  }

  console.log('');
  console.log('npm install calistiriliyor...');
  durumGuncelle(KOK, 80, 'Bağımlılıklar kuruluyor (npm install)…', 'npm', 'guncelleme');
  execSync('npm install --omit=dev --no-audit', { cwd: KOK, stdio: 'inherit' });

  const guncel = mevcutSurumAl(KOK);
  console.log('');
  console.log('Guncelleme tamamlandi. Surum:', guncel.surum);
  durumGuncelle(KOK, 92, 'Sunucu yeniden başlatılıyor…', 'yeniden-baslat', 'guncelleme');
  durumBitir(KOK, true, `Güncelleme tamamlandı — v${guncel.surum}`, guncel.surum, 'guncelleme');
  process.exit(0);
})().catch((err) => {
  console.error('');
  console.error('GUNCELLEME BASARISIZ:', err.message);
  try {
    durumBitir(KOK, false, err.message, null, 'guncelleme');
  } catch (_) {}
  process.exit(1);
});

