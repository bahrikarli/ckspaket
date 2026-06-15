/**
 * Kurulum / satış: IP, port ve klasör yolları tek yerden yönetilir.
 * Veritabanında kayıt yoksa mevcut Sarayönü varsayılanları kullanılır (geriye uyum).
 */
const VARSAYILAN = {
  anaSunucuIp: '192.168.1.120',
  anaSunucuPort: 3030,
  marketSunucuIp: '192.168.1.120',
  marketSunucuPort: 3001,
  /** Selektör tesisi mobil arayüz (sıra, hizmet, randevu, mesai) */
  selektorMobilPort: 4000,
  yedekSunucuIp: '192.168.1.123',
  /** Evrak tarama istasyonu / tarayıcı PC IP (isteğe bağlı) */
  evrakTaramaIp: '',
  chromeRobotPort: 9222,
  taramaKokKlasor: 'C:\\CKS\\taramalar',
  taramaHavuzAdi: 'ckstaramalar',
  /** Belgenet robot — Kişiye Havale (adın ilk 3 harfi aramada kullanılır) */
  belgenetHavaleKisiAdi: 'BAHRİ KARLI'
};

function temizIp(ip) {
  return String(ip || '').trim().replace(/^https?:\/\//i, '').split(':')[0].split('/')[0];
}

function sayiPort(p, varsayilan) {
  const n = parseInt(p, 10);
  return Number.isFinite(n) && n > 0 && n < 65536 ? n : varsayilan;
}

function temizKlasor(yol, varsayilan) {
  const s = String(yol || '').trim();
  return s || varsayilan;
}

/** Kayıtlı JSON + varsayılan birleştir */
function sistemAyarBirlestir(kayitli) {
  const k = kayitli && typeof kayitli === 'object' ? kayitli : {};
  const anaIp = temizIp(k.anaSunucuIp) || VARSAYILAN.anaSunucuIp;
  const marketIp = temizIp(k.marketSunucuIp) || anaIp || VARSAYILAN.marketSunucuIp;
  return {
    anaSunucuIp: anaIp,
    anaSunucuPort: sayiPort(k.anaSunucuPort, VARSAYILAN.anaSunucuPort),
    marketSunucuIp: marketIp,
    marketSunucuPort: sayiPort(k.marketSunucuPort, VARSAYILAN.marketSunucuPort),
    selektorMobilPort: sayiPort(k.selektorMobilPort, VARSAYILAN.selektorMobilPort),
    yedekSunucuIp: temizIp(k.yedekSunucuIp) || VARSAYILAN.yedekSunucuIp,
    evrakTaramaIp: temizIp(k.evrakTaramaIp),
    chromeRobotPort: sayiPort(k.chromeRobotPort, VARSAYILAN.chromeRobotPort),
    taramaKokKlasor: temizKlasor(k.taramaKokKlasor, VARSAYILAN.taramaKokKlasor),
    taramaHavuzAdi: String(k.taramaHavuzAdi || VARSAYILAN.taramaHavuzAdi).trim() || VARSAYILAN.taramaHavuzAdi,
    belgenetHavaleKisiAdi: String(k.belgenetHavaleKisiAdi || VARSAYILAN.belgenetHavaleKisiAdi).trim() || VARSAYILAN.belgenetHavaleKisiAdi
  };
}

function anaSunucuUrl(ayar) {
  const a = ayar || VARSAYILAN;
  return `http://${a.anaSunucuIp}:${a.anaSunucuPort}`;
}

function marketSunucuUrl(ayar) {
  const a = ayar || VARSAYILAN;
  return `http://${a.marketSunucuIp}:${a.marketSunucuPort}`;
}

function taramaKokYol(ayar) {
  return temizKlasor(ayar?.taramaKokKlasor, VARSAYILAN.taramaKokKlasor);
}

function taramaHavuzYol(ayar) {
  const kok = taramaKokYol(ayar);
  const ad = String(ayar?.taramaHavuzAdi || VARSAYILAN.taramaHavuzAdi).trim();
  const path = require('path');
  return path.join(kok, ad);
}

function taramaYilKlasorYol(ayar, yil) {
  const path = require('path');
  const y = String(yil || new Date().getFullYear());
  return path.join(taramaKokYol(ayar), `${y}cks`);
}

/** Yerel kök → Windows paylaşım adı + alt yol (UNC için) */
function taramaPaylasimParcala(kok) {
  const m = String(kok || '').match(/^([A-Za-z]):\\(.*)$/i);
  if (!m) return null;
  const alt = String(m[2] || '').replace(/\//g, '\\');
  const ozel = String(process.env.CKS_AG_PAYLASIM || '').trim();
  if (ozel) return { paylasim: ozel, alt };
  const ckspaketM = alt.match(/^ckspaket\\(.*)$/i);
  if (ckspaketM) return { paylasim: 'ckspaket', alt: ckspaketM[1] };
  const cksM = alt.match(/^cks\\(.*)$/i);
  if (cksM) return { paylasim: 'cks', alt: cksM[1] };
  const surucu = m[1].toLowerCase();
  return { paylasim: surucu === 'c' ? 'cks' : surucu, alt };
}

/** C:\ckspaket\taramalar → \\sunucu\ckspaket\taramalar | C:\cks\taramalar → \\sunucu\cks\taramalar */
function taramaAgYol(ayar, altParca) {
  const ip = ayar?.anaSunucuIp || VARSAYILAN.anaSunucuIp;
  const parca = taramaPaylasimParcala(taramaKokYol(ayar));
  if (!parca) return null;
  let yol = `\\\\${ip}\\${parca.paylasim}`;
  if (parca.alt) yol += `\\${parca.alt}`;
  if (altParca) yol += `\\${String(altParca).replace(/\//g, '\\')}`;
  return yol;
}

/** Tanımlamalar ekranı ve kurulum özeti */
function taramaDetayAl(ayar, yil) {
  const a = ayar || VARSAYILAN;
  const y = yil || new Date().getFullYear();
  const havuzAd = a.taramaHavuzAdi || VARSAYILAN.taramaHavuzAdi;
  const yilKlasor = `${y}cks`;
  return {
    evrakTaramaPcIp: a.evrakTaramaIp || '',
    anaSunucuIp: a.anaSunucuIp,
    anaSunucuPort: a.anaSunucuPort,
    anaSunucuUrl: anaSunucuUrl(a),
    taramaKokKlasor: taramaKokYol(a),
    taramaHavuzAdi: havuzAd,
    taramaHavuzYol: taramaHavuzYol(a),
    taramaYilKlasor: yilKlasor,
    taramaYilKlasorYol: taramaYilKlasorYol(a, y),
    agKokYol: taramaAgYol(a),
    agHavuzYol: taramaAgYol(a, havuzAd),
    agYilKlasorYol: taramaAgYol(a, yilKlasor),
    tarayiciNot:
      'Tarama hangi bilgisayardan yapılırsa yapılsın PDF ortak havuza gider. Dosya adı personel kullanıcı adıyla başlamalıdır (ör. bahri.pdf). Tarayıcı kayıt yolu: ağ yolu (UNC) veya sunucudaki havuz klasörü.'
  };
}

module.exports = {
  VARSAYILAN,
  sistemAyarBirlestir,
  anaSunucuUrl,
  marketSunucuUrl,
  taramaKokYol,
  taramaHavuzYol,
  taramaYilKlasorYol,
  taramaAgYol,
  taramaPaylasimParcala,
  taramaDetayAl
};
