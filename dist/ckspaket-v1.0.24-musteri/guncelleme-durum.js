/**
 * Güncelleme / yayınlama ilerleme dosyası (UI polling)
 */
const path = require('path');
const fs = require('fs');

function durumYolu(kok, tip = 'guncelleme') {
  const ad = tip === 'yayinla' ? 'yayinla-durum.json' : 'guncelleme-durum.json';
  return path.join(kok, 'guncellemeler', ad);
}

function durumYaz(kok, data, tip = 'guncelleme') {
  const hedef = durumYolu(kok, tip);
  fs.mkdirSync(path.dirname(hedef), { recursive: true });
  const payload = { ...data, guncelleme: new Date().toISOString() };
  fs.writeFileSync(hedef, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  return payload;
}

function durumBaslat(kok, tip = 'guncelleme', mesaj = 'Başlatılıyor…') {
  return durumYaz(kok, { yuzde: 0, asama: 'basladi', mesaj, bitti: false, hata: null }, tip);
}

function durumGuncelle(kok, yuzde, mesaj, asama, tip = 'guncelleme') {
  return durumYaz(kok, { yuzde, asama: asama || 'devam', mesaj, bitti: false, hata: null }, tip);
}

function durumBitir(kok, basarili, mesaj, surum, tip = 'guncelleme') {
  return durumYaz(
    kok,
    {
      yuzde: basarili ? 100 : 0,
      asama: basarili ? 'tamam' : 'hata',
      mesaj,
      bitti: true,
      hata: basarili ? null : mesaj,
      surum: surum || null
    },
    tip
  );
}

function durumOku(kok, tip = 'guncelleme') {
  try {
    const p = durumYolu(kok, tip);
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (_) {
    return null;
  }
}

module.exports = { durumYolu, durumYaz, durumBaslat, durumGuncelle, durumBitir, durumOku };
