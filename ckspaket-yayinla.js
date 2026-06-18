/**
 * Tek tıkla yayın: senkron + sürüm artır + Git push (+ isteğe bağlı ZIP)
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const {
  mevcutSurumAl,
  surumArtir,
  surumYaz,
  envGuncellemeUrlAyarla
} = require('./paket-guncelleme');
const {
  gitVarMi,
  gitYayinla,
  envGitAyarla,
  surumJsonYaz,
  repoUrlAl,
  dalAl
} = require('./git-guncelleme');

const KOK = __dirname;
const CKS_KAYNAK = 'C:\\cks';

let durumGuncelle = () => {};
try {
  ({ durumGuncelle } = require('./guncelleme-durum'));
} catch (_) {}

function yayinDurum(yuzde, mesaj, asama) {
  try { durumGuncelle(KOK, yuzde, mesaj, asama || 'devam', 'yayinla'); } catch (_) {}
}

function calistir(komut, aciklama) {
  console.log('');
  console.log('---', aciklama, '---');
  try {
    execSync(komut, { cwd: KOK, stdio: 'inherit' });
  } catch (err) {
    const detay = err.stderr?.toString?.() || err.stdout?.toString?.() || err.message || String(err);
    console.error('HATA:', aciklama, '-', detay.split('\n').slice(0, 12).join('\n'));
    process.exit(err.status || 1);
  }
}

function ipPortAl() {
  const ip = String(process.env.CKS_SUNUCU_IP || process.env.CKS_BIND_HOST || '127.0.0.1').trim();
  const port = String(process.env.CKS_PORT || process.env.PORT || '3030').trim();
  return { ip, port };
}

function senkronYap() {
  if (!fs.existsSync(path.join(CKS_KAYNAK, 'server.js'))) {
    console.log('Ana CKS bulunamadi, senkron atlandi:', CKS_KAYNAK);
    return;
  }
  calistir('node ckspaket-guncelle.js', 'Ana CKS senkronu');
}

function surumArtirVeYaz() {
  const mevcut = mevcutSurumAl(KOK).surum;
  const yeni = surumArtir(mevcut, 'patch');
  const { surumSenkronYaz } = require('./paket-guncelleme');
  surumSenkronYaz(KOK, yeni, notlar);
  console.log('');
  console.log('Surum:', mevcut, '->', yeni);
  return yeni;
}

const notlar = process.argv.slice(2).join(' ').trim() || 'Otomatik yayin';

console.log('=== CKS Paket — TEK TUSLA YAYIN ===');
console.log('Klasor:', KOK);

yayinDurum(8, 'Ana CKS senkronu yapılıyor…', 'senkron');
senkronYap();
yayinDurum(18, 'Sürüm numarası artırılıyor…', 'surum');
const surum = surumArtirVeYaz();
surumJsonYaz(KOK, surum, notlar);
const { ip, port } = ipPortAl();

process.env.CKS_SUNUCU_IP = ip;
process.env.CKS_PORT = port;
process.env.PORT = port;

yayinDurum(35, 'Git commit + push yapılıyor…', 'git-push');
const gitOk = gitYayinla(KOK, surum, notlar);
const repoUrl = repoUrlAl(KOK);
if (repoUrl) {
  envGitAyarla(KOK, repoUrl, dalAl());
  console.log('  OK: .env GIT_REPO_URL ayarlandi');
}

if (gitOk) {
  console.log('');
  console.log('--- Musteri surum paketi (C:\\ckspaket) ---');
  yayinDurum(55, 'Müşteri paketi oluşturuluyor (birkaç dakika sürebilir)…', 'paketle');
  calistir(`node ckspaket-paketle.js --musteri ${JSON.stringify(notlar)}`, 'Musteri klasor + ZIP');
  yayinDurum(90, 'Paket tamamlanıyor…', 'bitir');
}

if (!gitOk) {
  console.log('');
  console.log('--- ZIP yedek yayin (Git yok) ---');
  calistir(`node ckspaket-paketle.js ${JSON.stringify(notlar)}`, 'Musteri ZIP olusturma');
  const guncellemeUrl = envGuncellemeUrlAyarla(KOK, ip, port);
  console.log('GUNCELLEME_URL (.env):', guncellemeUrl);
}

console.log('');
console.log('TAMAM — v' + surum + ' yayinda.');
if (gitOk) {
  console.log('Musteriler Git uzerinden otomatik guncelleme gorecek.');
  console.log('Musteri paketi: dist\\ckspaket-v' + surum + '-musteri.zip');
  console.log('Musteri .env: GIT_REPO_URL=' + (repoUrl || '(remote origin)'));
} else {
  console.log('Git init yapip remote ekleyin — sonra sadece push yeterli olur.');
}

