/**
 * Tarım Rehberi — TMO fiyatları, hava uyarıları, zirai mücadele takvimi
 */
const fs = require('fs');
const path = require('path');

const GercekKlasor = process.pkg ? path.dirname(process.execPath) : __dirname;
const TMO_DOSYA = path.join(GercekKlasor, 'data', 'tmo-fiyatlar.json');

/** Sarayönü / Konya bölgesi */
const KONUM = {
  ad: 'Sarayönü (Konya)',
  lat: 38.2625,
  lon: 32.4103
};

const VARSAYILAN_TMO = {
  guncelleme: new Date().toISOString().slice(0, 10),
  kaynak: 'TMO referans — manuel güncellenebilir',
  urunler: [
    { kod: 'bugday', ad: 'Ekmeklik Buğday', birim: 'TL/ton', fiyat: 12500, degisim: 0 },
    { kod: 'arpa', ad: 'Arpa', birim: 'TL/ton', fiyat: 11000, degisim: 0 },
    { kod: 'misir', ad: 'Mısır', birim: 'TL/ton', fiyat: 10800, degisim: 0 },
    { kod: 'aycicegi', ad: 'Ayçiçeği', birim: 'TL/ton', fiyat: 18500, degisim: 150 },
    { kod: 'soya', ad: 'Soya', birim: 'TL/ton', fiyat: 17200, degisim: -80 }
  ]
};

const URUN_TAKVIM = {
  'Buğday': {
    bolge: 'İç Anadolu',
    aylar: {
      9: [{ tip: 'ekim', baslik: 'Toprak hazırlığı', aciklama: 'Pulluk + diskaro sonrası tavlı tohum yatağı.' }],
      10: [{ tip: 'ekim', baslik: 'Ekim penceresi', aciklama: 'Kuru ekim için optimum dönem. Tohum miktarı çeşide göre ayarlayın.' }],
      11: [{ tip: 'gubre', baslik: 'Çıkış sonrası azot', aciklama: 'Çıkıştan sonra 15–20 kg/da üre (toprak analizine göre).' }],
      3: [{ tip: 'ilac', baslik: 'Yabancı ot mücadelesi', aciklama: 'Sıcaklık 8°C üzeri ve nemli toprakta herbisit uygulaması.' }],
      4: [{ tip: 'ilac', baslik: 'Külle ve pas kontrolü', aciklama: 'Sarı pas / külle belirtisi varsa fungisit programı.' }],
      6: [{ tip: 'hasat', baslik: 'Hasat hazırlığı', aciklama: 'Nem %13–14 olunca biçerdöver hasadı.' }]
    }
  },
  'Arpa': {
    bolge: 'İç Anadolu',
    aylar: {
      10: [{ tip: 'ekim', baslik: 'Arpa ekimi', aciklama: 'Erken ekim hastalık riskini artırır; optimum pencereyi kaçırmayın.' }],
      2: [{ tip: 'gubre', baslik: 'Kış sonrası azot', aciklama: 'Kardeşlenme döneminde üst gübre.' }],
      4: [{ tip: 'ilac', baslik: 'Yabancı ot / hastalık', aciklama: 'Yabancı ot ve külle mücadelesi.' }],
      6: [{ tip: 'hasat', baslik: 'Hasat', aciklama: 'Buğdaydan 2–3 hafta önce hasat edilebilir.' }]
    }
  },
  'Mısır': {
    bolge: 'Konya ovası',
    aylar: {
      4: [{ tip: 'ekim', baslik: 'Mısır ekimi', aciklama: 'Toprak sıcaklığı 10°C üzeri olmalı.' }],
      5: [{ tip: 'gubre', baslik: 'Taban + çıkış gübresi', aciklama: 'Fosfor tabanda, azot bölünmüş uygulama.' }],
      6: [{ tip: 'ilac', baslik: 'Yabancı ot', aciklama: 'Çıkış öncesi/sonrası herbisit (çeşide uygun).' }],
      7: [{ tip: 'ilac', baslik: 'Zararlı takibi', aciklama: 'Mısır kurdu feromon tuzak kontrolü.' }],
      9: [{ tip: 'hasat', baslik: 'Silaj / tane hasadı', aciklama: 'Nem ve olgunluk izlenerek hasat.' }]
    }
  },
  'Ayçiçeği': {
    bolge: 'Konya',
    aylar: {
      3: [{ tip: 'ekim', baslik: 'Erken ekim planı', aciklama: 'Toprak işleme ve tohum yatağı.' }],
      4: [{ tip: 'ekim', baslik: 'Ekim', aciklama: 'Nisan ortası — mayıs başı ekim penceresi.' }],
      5: [{ tip: 'gubre', baslik: 'Azot uygulaması', aciklama: 'Çıkıştan 4–6 yaprak döneminde üst gübre.' }],
      6: [{ tip: 'ilac', baslik: 'Yabancı ot + kurt', aciklama: 'Geniş yapraklı yabancı ot ve ayçiçeği kurdu.' }],
      8: [{ tip: 'ilac', baslik: 'Kurşuni küf', aciklama: 'Çiçeklenme öncesi fungisit (gerekirse).' }],
      9: [{ tip: 'hasat', baslik: 'Hasat', aciklama: 'Tabla kurduğunda biçim.' }]
    }
  },
  'Şeker Pancarı': {
    bolge: 'Konya',
    aylar: {
      3: [{ tip: 'ekim', baslik: 'Ekim hazırlığı', aciklama: 'Derin sürüm ve taban gübresi.' }],
      4: [{ tip: 'ekim', baslik: 'Ekim', aciklama: 'Nisan ekim penceresi.' }],
      5: [{ tip: 'ilac', baslik: 'Yabancı ot', aciklama: 'Çıkış öncesi herbisit programı.' }],
      6: [{ tip: 'gubre', baslik: 'Azot bölünmüş', aciklama: 'Şeker oranı için dengeli azot.' }],
      10: [{ tip: 'hasat', baslik: 'Kök hasadı', aciklama: 'Fabrika programına göre hasat.' }]
    }
  },
  'Nohut': {
    bolge: 'Kuru tarım',
    aylar: {
      2: [{ tip: 'ekim', baslik: 'Kışlık nohut ekimi', aciklama: 'Şubat — mart erken ekim.' }],
      4: [{ tip: 'ilac', baslik: 'Antraknoz', aciklama: 'Çiçeklenme öncesi fungisit (yağışlı yıllarda).' }],
      7: [{ tip: 'hasat', baslik: 'Hasat', aciklama: 'Sarı-kahverengi olgunluk.' }]
    }
  },
  'Mercimek': {
    bolge: 'Kuru tarım',
    aylar: {
      2: [{ tip: 'ekim', baslik: 'Mercimek ekimi', aciklama: 'Şubat sonu — mart başı.' }],
      5: [{ tip: 'ilac', baslik: 'Yabancı ot', aciklama: 'Dar yapraklı yabancı ot mücadelesi.' }],
      6: [{ tip: 'hasat', baslik: 'Hasat', aciklama: 'Kuru hasat veya biçim.' }]
    }
  },
  'Patates': {
    bolge: 'Sulama / kuru',
    aylar: {
      3: [{ tip: 'ekim', baslik: 'Tohum yumru dikimi', aciklama: 'Toprak sıcaklığı ve nem uygunluğu.' }],
      4: [{ tip: 'gubre', baslik: 'Gübreleme', aciklama: 'Potasyum ağırlıklı program.' }],
      5: [{ tip: 'ilac', baslik: 'Mildiyö / alternarya', aciklama: 'Sık fungisit rotasyonu (sulama alanlarında).' }],
      7: [{ tip: 'ilac', baslik: 'Colorado böceği', aciklama: 'Erken müdahale ile bulaşık alanı sınırlayın.' }],
      9: [{ tip: 'hasat', baslik: 'Hasat', aciklama: 'Kabuk olgunluğu sonrası.' }]
    }
  }
};

const URUN_ESLESTIRME = [
  { anahtar: 'buğday', urun: 'Buğday' },
  { anahtar: 'bugday', urun: 'Buğday' },
  { anahtar: 'arpa', urun: 'Arpa' },
  { anahtar: 'mısır', urun: 'Mısır' },
  { anahtar: 'misir', urun: 'Mısır' },
  { anahtar: 'ayçiçeği', urun: 'Ayçiçeği' },
  { anahtar: 'aycicegi', urun: 'Ayçiçeği' },
  { anahtar: 'şeker', urun: 'Şeker Pancarı' },
  { anahtar: 'pancar', urun: 'Şeker Pancarı' },
  { anahtar: 'nohut', urun: 'Nohut' },
  { anahtar: 'mercimek', urun: 'Mercimek' },
  { anahtar: 'patates', urun: 'Patates' }
];

function tmoDosyaOku() {
  try {
    if (fs.existsSync(TMO_DOSYA)) {
      return JSON.parse(fs.readFileSync(TMO_DOSYA, 'utf8'));
    }
  } catch (_) {}
  return { ...VARSAYILAN_TMO };
}

function tmoDosyaYaz(data) {
  const klasor = path.dirname(TMO_DOSYA);
  if (!fs.existsSync(klasor)) fs.mkdirSync(klasor, { recursive: true });
  fs.writeFileSync(TMO_DOSYA, JSON.stringify(data, null, 2), 'utf8');
}

function urunNormEslestir(ham) {
  const s = String(ham || '').toLocaleLowerCase('tr-TR').trim();
  if (!s) return null;
  for (const e of URUN_ESLESTIRME) {
    if (s.includes(e.anahtar)) return e.urun;
  }
  return null;
}

const WMO_ACIKLAMA = {
  0: 'Açık', 1: 'Az bulutlu', 2: 'Parçalı bulutlu', 3: 'Kapalı',
  45: 'Sis', 48: 'Donlu sis', 51: 'Çisenti', 53: 'Çisenti', 55: 'Yoğun çisenti',
  61: 'Yağmur', 63: 'Yağmur', 65: 'Şiddetli yağmur',
  71: 'Kar', 73: 'Kar', 75: 'Yoğun kar',
  80: 'Sağanak', 81: 'Sağanak', 82: 'Şiddetli sağanak',
  95: 'Fırtına', 96: 'Dolu', 99: 'Şiddetli fırtına'
};

async function httpJsonGet(url, timeoutMs) {
  if (typeof fetch === 'function') {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) throw new Error('Hava API yanıt vermedi (' + res.status + ')');
    return res.json();
  }
  const https = require('https');
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Hava API zaman aşımı')), timeoutMs);
    https.get(url, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        clearTimeout(timer);
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error('Hava API yanıt vermedi (' + res.statusCode + ')'));
        }
        try { resolve(JSON.parse(body)); } catch (e) { reject(new Error('Hava JSON okunamadı')); }
      });
    }).on('error', (e) => { clearTimeout(timer); reject(e); });
  });
}

async function havaVerisiCek() {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${KONUM.lat}&longitude=${KONUM.lon}` +
    `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weathercode,windspeed_10m_max` +
    `&hourly=temperature_2m,precipitation,weathercode` +
    `&timezone=Europe%2FIstanbul&forecast_days=7`;

  const data = await httpJsonGet(url, 12000);

  const gunler = (data.daily?.time || []).map((t, i) => ({
    tarih: t,
    tarihTr: t.split('-').reverse().join('.'),
    max: Math.round(data.daily.temperature_2m_max[i]),
    min: Math.round(data.daily.temperature_2m_min[i]),
    yagis: Math.round((data.daily.precipitation_sum[i] || 0) * 10) / 10,
    ruzgar: Math.round(data.daily.windspeed_10m_max[i] || 0),
    kod: data.daily.weathercode[i],
    aciklama: WMO_ACIKLAMA[data.daily.weathercode[i]] || '—'
  }));

  const uyarilar = [];
  for (const g of gunler.slice(0, 3)) {
    if (g.min <= 2) {
      uyarilar.push({ seviye: 'kritik', tip: 'don', mesaj: `${g.tarihTr}: Gece ${g.min}°C — don riski! Hassas bitkileri koruyun.` });
    }
    if (g.yagis >= 25) {
      uyarilar.push({ seviye: 'uyari', tip: 'yagis', mesaj: `${g.tarihTr}: ${g.yagis} mm yağış bekleniyor — ilaçlama ertelenmeli.` });
    }
    if ([82, 95, 96, 99].includes(g.kod)) {
      uyarilar.push({ seviye: 'kritik', tip: 'firtina', mesaj: `${g.tarihTr}: ${g.aciklama} — tarla işleri riskli.` });
    }
    if (g.ruzgar >= 50) {
      uyarilar.push({ seviye: 'uyari', tip: 'ruzgar', mesaj: `${g.tarihTr}: Rüzgar ${g.ruzgar} km/s — toz ilacı uygulaması uygun değil.` });
    }
  }

  const toplamYagis = gunler.reduce((s, g) => s + g.yagis, 0);
  if (toplamYagis < 2) {
    uyarilar.push({ seviye: 'bilgi', tip: 'kuraklik', mesaj: '7 günde yağış az — sulama planı gözden geçirin.' });
  }

  return {
    konum: KONUM.ad,
    guncelleme: new Date().toISOString(),
    bugun: gunler[0] || null,
    gunler,
    uyarilar
  };
}

function havaMesajMetniOlustur(hava) {
  const satirlar = [
    '🌾 *Sarayönü Ziraat Odası — Hava Uyarısı*',
    `📍 ${KONUM.ad}`,
    ''
  ];
  if (hava.bugun) {
    satirlar.push(`Bugün: ${hava.bugun.min}° / ${hava.bugun.max}°C — ${hava.bugun.aciklama}`);
  }
  if (hava.uyarilar && hava.uyarilar.length) {
    satirlar.push('', '⚠️ *Uyarılar:*');
    hava.uyarilar.slice(0, 4).forEach(u => satirlar.push('• ' + u.mesaj));
  } else {
    satirlar.push('', 'Önümüzdeki günlerde kritik uyarı yok.');
  }
  satirlar.push('', '_Ziraat Odası bilgilendirme mesajıdır._');
  return satirlar.join('\n');
}

function buAyTakvim(urunAdi) {
  const takvim = URUN_TAKVIM[urunAdi];
  if (!takvim) return { urun: urunAdi, aylar: [], buAy: [] };
  const ay = new Date().getMonth() + 1;
  const buAy = (takvim.aylar[ay] || []).map(g => ({ ...g, ay }));
  const yakin = [];
  for (let a = ay; a <= ay + 2; a++) {
    const gercekAy = a > 12 ? a - 12 : a;
    (takvim.aylar[gercekAy] || []).forEach(g => yakin.push({ ...g, ay: gercekAy }));
  }
  return { urun: urunAdi, bolge: takvim.bolge, buAy, yakinAy: yakin, tumAylar: takvim.aylar };
}

function mountTarimRehber(app, { getPool, authenticateToken, mesaiWa }) {
  app.get('/tarim-rehber.html', authenticateToken, (req, res) => {
    res.sendFile(path.join(GercekKlasor, 'tarim-rehber.html'));
  });

  app.get('/api/tarim/hava', authenticateToken, async (req, res) => {
    try {
      const hava = await havaVerisiCek();
      res.json({ success: true, ...hava });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.get('/api/tarim/tmo-fiyatlar', authenticateToken, (req, res) => {
    res.json({ success: true, ...tmoDosyaOku() });
  });

  app.post('/api/tarim/tmo-fiyat-guncelle', authenticateToken, (req, res) => {
    const yetki = String(req.user?.rol || '').toLowerCase().trim();
    if (yetki !== 'admin') {
      return res.status(403).json({ success: false, message: 'Sadece admin güncelleyebilir.' });
    }
    const { urunler, kaynak } = req.body || {};
    if (!Array.isArray(urunler) || !urunler.length) {
      return res.json({ success: false, message: 'Ürün listesi gerekli.' });
    }
    const data = {
      guncelleme: new Date().toISOString().slice(0, 10),
      kaynak: kaynak || 'Manuel güncelleme',
      urunler
    };
    tmoDosyaYaz(data);
    res.json({ success: true, message: 'TMO fiyatları kaydedildi.', ...data });
  });

  app.get('/api/tarim/urun-listesi', authenticateToken, async (req, res) => {
    const liste = Object.keys(URUN_TAKVIM).map(ad => ({ ad, bolge: URUN_TAKVIM[ad].bolge }));
    let planliUrunler = [];
    try {
      const pool = await getPool();
      const r = await pool.request().query(`
        SELECT LTRIM(RTRIM(ürünadı)) AS urun, COUNT(*) AS adet
        FROM planlı
        WHERE ürünadı IS NOT NULL AND LTRIM(RTRIM(ürünadı)) <> ''
        GROUP BY LTRIM(RTRIM(ürünadı))
        ORDER BY COUNT(*) DESC
      `);
      planliUrunler = (r.recordset || []).map(row => ({
        ham: row.urun,
        adet: row.adet,
        eslesen: urunNormEslestir(row.urun)
      }));
    } catch (_) {}
    res.json({ success: true, liste, planliUrunler });
  });

  app.get('/api/tarim/zirai-takvim', authenticateToken, (req, res) => {
    const urun = req.query.urun || 'Buğday';
    const takvim = buAyTakvim(urun);
    res.json({ success: true, ...takvim });
  });

  app.get('/api/tarim/hava-mesaj-onizle', authenticateToken, async (req, res) => {
    try {
      const hedef = req.query.hedef === 'personel' ? 'personel' : 'ciftciler';
      const hava = await havaVerisiCek();
      const mesaj = havaMesajMetniOlustur(hava);
      let aliciSayisi = 0;
      if (hedef === 'personel') {
        aliciSayisi = (mesaiWa && mesaiWa.waNumaralari()) ? mesaiWa.waNumaralari().length : 0;
      } else {
        const pool = await getPool();
        const r = await pool.request().query(`
          SELECT COUNT(*) AS toplam
          FROM çksdilekçe
          WHERE Telefon IS NOT NULL
            AND LEN(LTRIM(RTRIM(CAST(Telefon AS NVARCHAR(30))))) >= 10
        `);
        aliciSayisi = r.recordset[0]?.toplam || 0;
      }
      const gonderilecek = Math.min(aliciSayisi, 50);
      res.json({
        success: true,
        hedef,
        mesaj,
        aliciSayisi,
        gonderilecek,
        partiNotu: aliciSayisi > 50 ? 'İlk gönderimde en fazla 50 numaraya gider.' : null
      });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.get('/api/tarim/ciftci-telefon-sayisi', authenticateToken, async (req, res) => {
    try {
      const pool = await getPool();
      const r = await pool.request().query(`
        SELECT COUNT(*) AS toplam
        FROM çksdilekçe
        WHERE Telefon IS NOT NULL
          AND LEN(LTRIM(RTRIM(CAST(Telefon AS NVARCHAR(30))))) >= 10
      `);
      res.json({ success: true, toplam: r.recordset[0]?.toplam || 0 });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.post('/api/tarim/hava-uyari-gonder', authenticateToken, async (req, res) => {
    if (!mesaiWa) {
      return res.json({ success: false, message: 'WhatsApp modülü yüklü değil.' });
    }
    const { hedef = 'ciftciler', mesaj } = req.body || {};
    if (hedef === 'ciftciler') {
      return res.json({ success: false, message: 'Çiftçilere toplu gönderim geçici olarak kapalıdır.' });
    }
    let metin = mesaj;
    if (!metin) {
      try {
        const hava = await havaVerisiCek();
        metin = havaMesajMetniOlustur(hava);
      } catch (err) {
        return res.json({ success: false, message: 'Hava verisi alınamadı: ' + err.message });
      }
    }

    let numaralar = [];
    if (hedef === 'personel') {
      numaralar = mesaiWa.waNumaralari();
    } else {
      try {
        const pool = await getPool();
        const r = await pool.request().query(`
          SELECT DISTINCT LTRIM(RTRIM(CAST(Telefon AS NVARCHAR(30)))) AS telefon
          FROM çksdilekçe
          WHERE Telefon IS NOT NULL
            AND LEN(LTRIM(RTRIM(CAST(Telefon AS NVARCHAR(30))))) >= 10
        `);
        numaralar = (r.recordset || [])
          .map(row => mesaiWa.waNumaraNormalize(row.telefon))
          .filter(Boolean);
        numaralar = [...new Set(numaralar)];
      } catch (err) {
        return res.json({ success: false, message: 'Çiftçi telefonları alınamadı: ' + err.message });
      }
    }

    if (!numaralar.length) {
      return res.json({ success: false, message: 'Gönderilecek telefon numarası bulunamadı.' });
    }

    const limit = Math.min(numaralar.length, 50);
    const gonderilecek = numaralar.slice(0, limit);
    const sonuc = await mesaiWa.mesaiWhatsAppGonder(metin, gonderilecek);

    res.json({
      ...sonuc,
      toplamHedef: numaralar.length,
      gonderilenAdet: gonderilecek.length,
      not: numaralar.length > 50 ? 'İlk 50 numaraya gönderildi. Toplu gönderim için partiler halinde tekrarlayın.' : undefined
    });
  });
}

module.exports = { mountTarimRehber, URUN_TAKVIM, KONUM };
