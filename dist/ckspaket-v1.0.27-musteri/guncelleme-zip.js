/**
 * Musteri guncellemesinde ZIP acma — Expand-Archive dist/ icinde coker, tar kullanilir.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { koruMu } = require('./guncelleme-koru');

function klasorSil(p) {
  if (!fs.existsSync(p)) return;
  fs.rmSync(p, { recursive: true, force: true, maxRetries: 5, retryDelay: 400 });
}

function zipAc(zipYol, hedefKlasor) {
  klasorSil(hedefKlasor);
  fs.mkdirSync(hedefKlasor, { recursive: true });

  const zipArg = JSON.stringify(zipYol);
  const dstArg = JSON.stringify(hedefKlasor);

  try {
    execSync(`tar -xf ${zipArg} -C ${dstArg}`, { stdio: 'inherit' });
    console.log('ZIP acildi (tar).');
    return;
  } catch (err) {
    console.log('tar ile acilamadi — .NET ZipFile deneniyor...');
  }

  const ps1 = path.join(path.dirname(hedefKlasor), '_zipac.ps1');
  fs.writeFileSync(
    ps1,
    [
      'Add-Type -AssemblyName System.IO.Compression.FileSystem',
      `$z = ${JSON.stringify(zipYol)}`,
      `$d = ${JSON.stringify(hedefKlasor)}`,
      'if (Test-Path $d) { Remove-Item -LiteralPath $d -Recurse -Force -ErrorAction SilentlyContinue }',
      'New-Item -ItemType Directory -Path $d -Force | Out-Null',
      '[System.IO.Compression.ZipFile]::ExtractToDirectory($z, $d)'
    ].join('\n'),
    'utf8'
  );
  try {
    execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File ${JSON.stringify(ps1)}`, {
      stdio: 'inherit'
    });
  } finally {
    try {
      fs.unlinkSync(ps1);
    } catch (_) {}
  }
}

/** GitHub ZIP icindeki dist/guncellemeler vb. musteriye kopyalanmadan once silinir */
function kaynakTemizle(kaynak) {
  if (!fs.existsSync(kaynak)) return;
  for (const ad of fs.readdirSync(kaynak)) {
    if (ad === '.git' || koruMu(ad)) {
      const p = path.join(kaynak, ad);
      console.log('  zip icinden cikarildi (uygulanmaz):', ad);
      try {
        const st = fs.statSync(p);
        if (st.isDirectory()) klasorSil(p);
        else fs.unlinkSync(p);
      } catch (err) {
        console.warn('  uyari: silinemedi', ad, '-', err.message);
      }
    }
  }
}

function zipKaynakBul(acilanKlasor) {
  const ust = fs.readdirSync(acilanKlasor).filter((ad) => !ad.startsWith('.'));
  if (ust.length === 1) {
    const pth = path.join(acilanKlasor, ust[0]);
    if (fs.statSync(pth).isDirectory()) return pth;
  }
  return acilanKlasor;
}

module.exports = { zipAc, kaynakTemizle, zipKaynakBul, klasorSil };
