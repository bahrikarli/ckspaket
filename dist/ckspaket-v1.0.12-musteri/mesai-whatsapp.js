/**
 * Personel mesai — WhatsApp Web (tek kurum hattı, QR ile bağlanır).
 * .env: MESAI_WA_AKTIF=true, MESAI_WA_NUMARALAR=905xxxxxxxxx,905yyyyyyyyy
 */
const path = require('path');
const fs = require('fs');
const { Client, LocalAuth } = require('whatsapp-web.js');
const QRCode = require('qrcode');

const gercekKlasor = process.pkg ? path.dirname(process.execPath) : __dirname;

let envSonYukle = 0;
function envYenile() {
  const simdi = Date.now();
  if (simdi - envSonYukle < 5000) return;
  envSonYukle = simdi;
  try {
    require('dotenv').config({
      path: path.join(gercekKlasor, '.env'),
      override: true,
      quiet: true
    });
  } catch (_) {}
}
envYenile();

let client = null;
let hazir = false;
let baslatiliyor = false;
let sonQrDataUrl = null;
let waServisAcik = false;
let sonQrGerekli = false;

function waAuthKlasoru() {
  return path.join(gercekKlasor, '.wwebjs_auth');
}

/** Daha önce QR okutulduysa oturum dosyaları burada kalır */
function waOturumKayitliMi() {
  const authPath = waAuthKlasoru();
  if (!fs.existsSync(authPath)) return false;
  try {
    const alt = fs.readdirSync(authPath, { withFileTypes: true });
    return alt.some((d) => d.isDirectory() || d.name.endsWith('.json'));
  } catch {
    return false;
  }
}

function envBool(key) {
  return String(process.env[key] || '').trim().toLowerCase() === 'true';
}

function waAktifMi() {
  return envBool('MESAI_WA_AKTIF') || waServisAcik;
}

function waNumaralari() {
  envYenile();
  const ham = String(process.env.MESAI_WA_NUMARALAR || '')
    .trim()
    .replace(/[;\n\r\t|]+/g, ',')
    .replace(/，/g, ',');
  if (!ham) return [];
  const liste = [];
  const parcalar = ham.split(',');
  for (const p of parcalar) {
    const n = waNumaraNormalize(p.trim());
    if (n && !liste.includes(n)) liste.push(n);
  }
  return liste;
}

/** Türkiye: 905xxxxxxxxx (sadece rakam, @c.us için) */
function waNumaraNormalize(numara) {
  let d = String(numara || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.length === 10 && d.startsWith('5')) d = '90' + d;
  if (d.length === 11 && d.startsWith('0')) d = '9' + d;
  if (d.length === 12 && d.startsWith('90')) return d;
  if (d.length > 12) return d;
  return d;
}

function waChatId(numara) {
  const n = waNumaraNormalize(numara);
  return n ? `${n}@c.us` : null;
}

function ensureMesaiWhatsApp() {
  if (envBool('MESAI_WA_AKTIF') || waServisAcik) {
    initMesaiWhatsApp();
  }
}

function initMesaiWhatsApp() {
  if (!envBool('MESAI_WA_AKTIF') && !waServisAcik) {
    console.log('[Mesai WA] Kapalı (MESAI_WA_AKTIF=true yapın).');
    return;
  }
  if (client || baslatiliyor) return;
  baslatiliyor = true;
  waServisAcik = true;

  const authPath = waAuthKlasoru();
  if (waOturumKayitliMi()) {
    console.log('[Mesai WA] Kayıtlı oturum bulundu — QR gerekmeden bağlanılıyor…');
  } else {
    console.log('[Mesai WA] İlk kurulum — bir kez QR okutmanız yeterli.');
  }
  client = new Client({
    authStrategy: new LocalAuth({ dataPath: authPath }),
    puppeteer: {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    }
  });

  client.on('qr', async (qr) => {
    sonQrGerekli = true;
    console.log('[Mesai WA] QR gerekli — Personel Kart sayfasından okutun (genelde sadece ilk sefer).');
    try {
      sonQrDataUrl = await QRCode.toDataURL(qr, { width: 300, margin: 2 });
    } catch (err) {
      sonQrDataUrl = null;
      console.error('[Mesai WA] QR görseli üretilemedi:', err.message);
    }
  });

  client.on('ready', () => {
    hazir = true;
    baslatiliyor = false;
    sonQrDataUrl = null;
    if (sonQrGerekli) {
      console.log('[Mesai WA] Bağlantı hazır — oturum kaydedildi. Sonraki açılışlarda QR gerekmez.');
    } else {
      console.log('[Mesai WA] Kayıtlı oturumla bağlandı — 10:00 raporu otomatik gidebilir.');
    }
    sonQrGerekli = false;
  });

  client.on('authenticated', () => {
    console.log('[Mesai WA] Oturum doğrulandı (c:\\cks\\.wwebjs_auth klasörüne kaydedildi).');
  });

  client.on('auth_failure', (msg) => {
    hazir = false;
    baslatiliyor = false;
    console.error('[Mesai WA] Oturum hatası:', msg);
  });

  client.on('disconnected', (reason) => {
    hazir = false;
    sonQrDataUrl = null;
    console.warn('[Mesai WA] Bağlantı koptu:', reason);
    client = null;
    baslatiliyor = false;
  });

  client.initialize().catch((err) => {
    baslatiliyor = false;
    console.error('[Mesai WA] Başlatılamadı:', err.message);
  });
}

function mesaiWhatsAppHazirMi() {
  return waAktifMi() && hazir && !!client;
}

function mesaiWhatsAppDurum() {
  const bagli = mesaiWhatsAppHazirMi();
  const aktif = envBool('MESAI_WA_AKTIF') || waServisAcik || baslatiliyor || !!client || !!sonQrDataUrl;
  return {
    aktif,
    bagli,
    baslatiliyor: (baslatiliyor || (!!sonQrDataUrl && !bagli)) && !bagli,
    qrDataUrl: bagli ? null : sonQrDataUrl,
    qrHazir: !!sonQrDataUrl,
    oturumKayitli: waOturumKayitliMi(),
    qrGerekli: !!sonQrDataUrl,
    alicilar: waNumaralari(),
    sunucuPid: process.pid
  };
}

async function mesaiWhatsAppGonder(metin, numaralar) {
  if (!waAktifMi()) {
    return { success: false, message: 'WhatsApp kapalı. c:\\cks\\.env içinde MESAI_WA_AKTIF=true yazıp sunucuyu yeniden başlatın.' };
  }
  if (!mesaiWhatsAppHazirMi()) {
    return { success: false, message: 'WhatsApp henüz bağlı değil. Bu sayfadaki QR kodu telefonla okutun (WhatsApp → Bağlı cihazlar).' };
  }

  const hedefler = (numaralar && numaralar.length ? numaralar : waNumaralari()).map(waNumaraNormalize).filter(Boolean);
  if (!hedefler.length) {
    return { success: false, message: 'Alıcı numara yok (.env MESAI_WA_NUMARALAR).' };
  }

  const gonderilen = [];
  const hatalar = [];

  for (const num of hedefler) {
    const chatId = waChatId(num);
    try {
      await client.sendMessage(chatId, metin);
      gonderilen.push(num);
    } catch (err) {
      hatalar.push({ numara: num, hata: err.message });
    }
  }

  const hedefSayisi = hedefler.length;
  let sonucMetni = '';
  if (gonderilen.length === hedefSayisi) {
    sonucMetni = `${gonderilen.length} numaraya gönderildi: ${gonderilen.join(', ')}`;
  } else if (gonderilen.length) {
    sonucMetni = `${gonderilen.length}/${hedefSayisi} numaraya gönderildi. Başarılı: ${gonderilen.join(', ')}`;
    if (hatalar.length) {
      sonucMetni += '. Hata: ' + hatalar.map((h) => h.numara + ' (' + h.hata + ')').join('; ');
    }
  } else {
    sonucMetni = 'Hiçbir numaraya gönderilemedi.';
    if (hatalar.length) {
      sonucMetni += ' ' + hatalar.map((h) => h.numara + ': ' + h.hata).join('; ');
    }
  }

  return {
    success: gonderilen.length > 0 && hatalar.length === 0,
    message: sonucMetni,
    gonderilen,
    hedefSayisi,
    hatalar: hatalar.length ? hatalar : undefined
  };
}

module.exports = {
  initMesaiWhatsApp,
  ensureMesaiWhatsApp,
  mesaiWhatsAppGonder,
  mesaiWhatsAppHazirMi,
  mesaiWhatsAppDurum,
  waAktifMi,
  waNumaralari,
  waNumaraNormalize
};
