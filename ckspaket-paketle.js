/**
 * Müşteri dağıtım paketi oluşturur (ZIP).
 * Kullanım: node ckspaket-paketle.js [sürüm notu]
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const KOK = __dirname;
const DIST = path.join(KOK, 'dist');
const GUNCELLEME = path.join(KOK, 'guncellemeler');

const HARIC = new Set([
  'node_modules',
  '.wwebjs_auth',
  'dist',
  'uploads',
  '.git',
  '.env'
]);

const TARAMA_ALT = ['ckstaramalar', '2026cks', '2027cks', 'ib', 'ibtaramalar'];

function okuJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function surumAl() {
  return okuJson(path.join(KOK, 'package.json')).version;
}

function dosyaListesi(klasor, kok = klasor) {
  const liste = [];
  if (!fs.existsSync(klasor)) return liste;
  for (const ad of fs.readdirSync(klasor)) {
    if (HARIC.has(ad)) continue;
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

function geciciKopyaOlustur(surum) {
  const tmp = path.join(KOK, 'dist', `_paket_${surum}`);
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

  const envOrnek = path.join(tmp, '.env.example');
  if (fs.existsSync(envOrnek)) {
    let s = fs.readFileSync(envOrnek, 'utf8');
    if (!s.includes('GUNCELLEME_URL')) {
      s += '\n# Guncelleme manifest JSON adresi (ornek: http://192.168.1.120:3030/guncellemeler/guncelleme.json)\nGUNCELLEME_URL=\n';
      fs.writeFileSync(envOrnek, s);
    }
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

function manifestYaz(surum, zipAdi, notlar, ip, port) {
  fs.mkdirSync(GUNCELLEME, { recursive: true });
  const sunucuIp = ip || process.env.CKS_SUNUCU_IP || '127.0.0.1';
  const sunucuPort = port || process.env.CKS_PORT || process.env.PORT || '3030';
  const manifest = {
    surum,
    tarih: new Date().toISOString().slice(0, 10),
    notlar: notlar || `${surum} sürüm güncellemesi`,
    indirmeUrl: `http://${sunucuIp}:${sunucuPort}/guncellemeler/${zipAdi}`
  };
  const hedef = path.join(GUNCELLEME, 'guncelleme.json');
  fs.writeFileSync(hedef, JSON.stringify(manifest, null, 2), 'utf8');
  console.log('  OK: guncellemeler/guncelleme.json');
  return manifest;
}

const notlarArg = process.argv.slice(2).join(' ').trim();
const notlar = notlarArg.replace(/^"(.*)"$/, '$1');
const surum = surumAl();
const zipAdi = `ckspaket-v${surum}.zip`;
const zipYol = path.join(DIST, zipAdi);
const { ip, port } = (() => {
  const i = String(process.env.CKS_SUNUCU_IP || '127.0.0.1').trim();
  const p = String(process.env.CKS_PORT || process.env.PORT || '3030').trim();
  return { ip: i, port: p };
})();

console.log('=== CKS Paket — Musteri ZIP ===');
console.log('Surum:', surum);
console.log('');

const tmp = geciciKopyaOlustur(surum);
console.log('  Gecici klasor hazir:', tmp);

try {
  zipOlustur(tmp, zipYol);
  console.log('  OK:', zipYol);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

fs.mkdirSync(GUNCELLEME, { recursive: true });
const guncellemeZip = path.join(GUNCELLEME, zipAdi);
fs.copyFileSync(zipYol, guncellemeZip);
console.log('  OK: guncellemeler/' + zipAdi);

const manifest = manifestYaz(surum, zipAdi, notlar, ip, port);

console.log('');
console.log('Tamamlandi.');
console.log('');
console.log('Musteriye verilecek dosya:', zipYol);
console.log('Guncelleme manifest:', `http://${ip}:${port}/guncellemeler/guncelleme.json`);
console.log('');
console.log('Manifest:');
console.log(JSON.stringify(manifest, null, 2));
