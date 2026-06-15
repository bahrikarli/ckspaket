/** Musteri guncellemesinde dokunulmayacak dosya/klasorler */
const KORU_DOSYALAR = new Set(['.env']);
const KORU_KLASORLER = new Set([
  'taramalar',
  'uploads',
  'guncellemeler',
  'node_modules',
  'logs',
  'dist',
  '_guncelleme_yedek',
  '_git_klon'
]);

function koruMu(ad) {
  const a = String(ad || '').toLowerCase();
  if (KORU_DOSYALAR.has(a)) return true;
  if (KORU_KLASORLER.has(a)) return true;
  return false;
}

module.exports = { KORU_DOSYALAR, KORU_KLASORLER, koruMu };
