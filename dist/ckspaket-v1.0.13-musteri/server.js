// server.js – HEM ÇKS HEM PERSONEL PANELİ HEM PROFİLİM %100 ÇALIŞIR
// pkg (.exe) dönüştürme hatasını çözen sahte tanımlamalar (En üstte olmalı!)
// --- PKG (.exe) DÖNÜŞTÜRME YAMALARI (EN ÜSTTE OLMALI) ---
global.DOMMatrix = global.DOMMatrix || class DOMMatrix {};
global.ImageData = global.ImageData || class ImageData {};
global.Path2D = global.Path2D || class Path2D {};

// TextDecoder için "ascii" ve "windows-1252" çökmelerini engelleyen KESİN çözüm
const OrijinalTextDecoder = global.TextDecoder;
global.TextDecoder = class CustomTextDecoder extends OrijinalTextDecoder {
    constructor(encoding, options) {
        // Eğer sistemin tanımadığı bir format gelirse, zorla "utf-8" yap!
        if (encoding && (encoding.toLowerCase() === 'ascii' || encoding.toLowerCase() === 'windows-1252')) {
            encoding = 'utf-8'; 
        }
        super(encoding, options);
    }
};
// --------------------------------------------------------

// ... Diğer tüm kodlarınız buradan aşağıya devam edecek ...

// ... diğer kodlarınız eskisi gibi buradan aşağıya devam edecek ...


const path = require('path');
const gercekKlasorErken = process.pkg ? path.dirname(process.execPath) : __dirname;
try {
  require('dotenv').config({ path: path.join(gercekKlasorErken, '.env'), quiet: true });
} catch (_) {}

const CKSPAKET_MOD = process.env.CKSPAKET === '1' || /ckspaket/i.test(String(gercekKlasorErken));
const CKSPAKET_TARAMA_KOK = path.join(gercekKlasorErken, 'taramalar');

const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const sql = require('mssql');
const IP = require('ip');
const app = express();
const qrcode = require('qrcode');
const { PDFDocument } = require('pdf-lib');
const multer = require('multer');
const fs = require('fs');
app.use(express.static('public'));
const bwipjs = require('bwip-js');
const pdfParser = require('pdf-parse'); // Kütüphaneyi BURADA tanımlayın
const fsExtra = require('fs-extra');
const cron = require('node-cron');
const puppeteer = require('puppeteer');
const PDFKitDocument = require('pdfkit');

// Eğer normal base64 çalışmazsa bunu dene:




app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));
// Uploads klasörü oluştur
// 🎯 SİHİRLİ YOL BULUCU: Program .exe ise dışarıdaki gerçek klasörü, kod ise bulunduğu yeri bulur.
const gercekKlasor = process.pkg ? path.dirname(process.execPath) : __dirname;
const uploadDir = path.join(gercekKlasor, 'uploads');

if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer yapılandırma (Burası aynı kalıyor, sadece yukarıdaki yeni uploadDir'i kullanacak)
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const kimlikid = req.body.kimlikid || 'unknown';
    const ext = path.extname(file.originalname);
    const safeName = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9]/g, '_');
    cb(null, `${kimlikid}_${Date.now()}_${safeName}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.jpg', '.jpeg', '.png'];
    if (allowed.includes(path.extname(file.originalname).toLowerCase())) {
      cb(null, true);
    } else {
      cb(new Error('Sadece PDF, JPG, PNG!'));
    }
  }
});
const getPool = require('./config');
const {
  VARSAYILAN: SISTEM_AYAR_VARSAYILAN,
  sistemAyarBirlestir,
  anaSunucuUrl,
  marketSunucuUrl,
  taramaKokYol,
  taramaHavuzYol,
  taramaYilKlasorYol,
  taramaDetayAl
} = require('./sistem-ayar');

let sistemAyarCache = { ...SISTEM_AYAR_VARSAYILAN };
let sistemAyarKolonHazir = false;

async function ensureTeknikJsonKolon() {
  if (sistemAyarKolonHazir) return;
  try {
    const p = await getPool();
    await p.request().query(`
      IF COL_LENGTH('ayarlar', 'teknik_json') IS NULL
        ALTER TABLE ayarlar ADD teknik_json NVARCHAR(MAX) NULL;
    `);
    sistemAyarKolonHazir = true;
  } catch (err) {
    console.warn('teknik_json kolonu kontrolü:', err.message);
  }
}


function sistemAyarPaketUygula() {
  if (!CKSPAKET_MOD) return;
  const paketPort = Number(process.env.PORT) || 3030;
  sistemAyarCache = sistemAyarBirlestir({
    ...sistemAyarCache,
    anaSunucuPort: paketPort,
    taramaKokKlasor: CKSPAKET_TARAMA_KOK
  });
}

async function sistemAyarDbYukle() {
  await ensureTeknikJsonKolon();
  try {
    const p = await getPool();
    const r = await p.request().query('SELECT TOP 1 teknik_json FROM ayarlar ORDER BY id DESC');
    const ham = r.recordset[0]?.teknik_json;
    if (ham) {
      try {
        sistemAyarCache = sistemAyarBirlestir(JSON.parse(ham));
      } catch (_) {
        sistemAyarCache = sistemAyarBirlestir({});
      }
    } else {
      sistemAyarCache = sistemAyarBirlestir({});
    }
  } catch (err) {
    console.warn('Sistem ayarları yüklenemedi, varsayılan kullanılıyor:', err.message);
    sistemAyarCache = sistemAyarBirlestir({});
  }
  sistemAyarPaketUygula();
  return sistemAyarCache;
}

function sistemAyarAl() {
  return sistemAyarCache;
}

async function sistemAyarDbKaydet(veri) {
  await ensureTeknikJsonKolon();
  sistemAyarCache = sistemAyarBirlestir(veri || {});
  const p = await getPool();
  const json = JSON.stringify(sistemAyarCache);
  await p.request()
    .input('json', sql.NVarChar(sql.MAX), json)
    .query(`
      IF EXISTS (SELECT 1 FROM ayarlar)
        UPDATE ayarlar SET teknik_json = @json, guncelleme_tarihi = GETDATE()
      ELSE
        INSERT INTO ayarlar (kurum_adi, teknik_json) VALUES (N'Kurum', @json)
    `);
  return sistemAyarCache;
}
const JWT_SECRET = "besiktas1903kartal";
const dbConfig = {
  user: process.env.DB_USER || 'sa',
  password: process.env.DB_PASS || '189189',
  server: process.env.DB_SERVER || 'YENISERVER',
  database: process.env.DB_NAME || 'demoanaa',
  options: {
        encrypt: false,
        trustServerCertificate: true,
    },
    requestTimeout: 120000,
    connectionTimeout: 60000
};


let pool;
sql.connect(dbConfig).then(async (p) => {
  pool = p;
  console.log('Veritabanına bağlandı:', dbConfig.database, `(${dbConfig.server})`);
  await sistemAyarDbYukle();
  if (CKSPAKET_MOD) {
    console.log('[CKS Paket] Mod aktif — port', Number(process.env.PORT) || 3030, '| tarama:', taramaKokYol(sistemAyarAl()));
  } else {
    console.log('Sistem ayarları:', anaSunucuUrl(sistemAyarAl()), '| tarama:', taramaKokYol(sistemAyarAl()));
  }
}).catch(err => {
  console.error("BAĞLANTI HATASI:", err.message);
  process.exit(1);
});
// Token kontrol
// ==========================================
// TOKEN VE KİMLİK KONTROLÜ (ROL EKLENDİ)
// ==========================================
const authenticateToken = (req, res, next) => {
  const token = req.headers['authorization']?.split(' ')[1];
  const htmlSayfa = /\.html$/i.test(req.path || '');
  if (!token) {
    if (htmlSayfa) return res.redirect('/');
    return res.status(401).json({ success: false, message: 'Giriş gerekli' });
  }

  jwt.verify(token, JWT_SECRET, async (err, decoded) => {
    if (err) {
      if (htmlSayfa) return res.redirect('/');
      return res.status(403).json({ success: false, message: 'Oturum geçersiz' });
    }

    try {
      const pool = await getPool();
      const result = await pool.request()
        .input('id', sql.Int, decoded.id)
        // DİKKAT: rol SÜTUNU BURAYA EKLENDİ!
        .query(`SELECT Id, KullaniciAdi, Ad, Soyad, rol FROM Kullanicilar WHERE Id = @id`);

      if (result.recordset.length === 0) {
        // 404, tarayıcıda "endpoint yok" sanılmasın; oturum / kullanıcı kaydı geçersiz.
        return res.status(401).json({
          success: false,
          message: 'Oturum geçersiz veya kullanıcı bulunamadı. Lütfen çıkış yapıp tekrar giriş yapın.'
        });
      }

      const u = result.recordset[0];
      req.user = {
        id: u.Id,
        kullaniciadi: u.KullaniciAdi,
        ad: u.Ad || '',
        soyad: u.Soyad || '',
        rol: u.rol // DİKKAT: ARTIK ROL BİLGİSİ SUNUCU HAFIZASINA KAYDEDİLİYOR
      };
      next();
    } catch (dbErr) {
      console.error("Kullanıcı bilgisi çekme hatası:", dbErr);
      return res.status(500).json({ success: false });
    }
  });
};

// ==========================================
// ADMİN YETKİ KONTROLÜ (GÜVENLİ)
// ==========================================
const sadeceAdmin = (req, res, next) => {
  // Rolü her ihtimale karşı küçük harfe çevirip boşluklarını siliyoruz
  const yetki = String(req.user.rol || '').toLowerCase().trim();
  
  if (yetki !== 'admin') {
      return res.status(403).json({ success: false, message: 'Bu işlem için admin yetkisi gereklidir!' });
  }
  next();
};

const sadeceAdminSayfa = (req, res, next) => {
  const yetki = String(req.user.rol || '').toLowerCase().trim();
  if (yetki !== 'admin') {
    return res.redirect('/anasayfa.html');
  }
  next();
};

// GİRİŞ
app.use('/api', require('./auth'));

// TÜM SAYFALAR
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/anasayfa.html', authenticateToken, (req, res) => res.sendFile(path.join(__dirname, 'anasayfa.html')));
app.get('/dashboard.html', authenticateToken, sadeceAdmin, (req, res) => res.sendFile(path.join(__dirname, 'dashboard.html')));
app.get('/mesajlar.html', authenticateToken, (req, res) => res.sendFile(path.join(__dirname, 'mesajlar.html')));
app.get('/profil.html', authenticateToken, (req, res) => res.sendFile(path.join(__dirname, 'profil.html')));
app.get('/personel-pdf-havuz.html', authenticateToken, (req, res) => res.sendFile(path.join(__dirname, 'personel-pdf-havuz.html')));
app.get('/cks.html', authenticateToken, (req, res) => res.sendFile(path.join(__dirname, 'cks.html')));
app.get('/mesai-kart.html', authenticateToken, sadeceAdminSayfa, (req, res) => {
  const dosya = path.join(__dirname, 'mesai-kart.html');
  res.sendFile(dosya, (err) => {
    if (err) {
      console.error('mesai-kart.html:', err.message);
      res.status(404).send('mesai-kart.html bulunamadı.');
    }
  });
});
app.get('/mesai-yoklama.html', authenticateToken, sadeceAdminSayfa, (req, res) => res.sendFile(path.join(__dirname, 'mesai-yoklama.html')));
app.get('/mesai-takip.html', authenticateToken, (req, res) => res.sendFile(path.join(__dirname, 'mesai-takip.html')));
app.get('/mesai-zobis-hatirlatma-test.html', authenticateToken, sadeceAdminSayfa, (req, res) =>
  res.sendFile(path.join(__dirname, 'mesai-zobis-hatirlatma-test.html'))
);

// Tarım Rehberi (TMO, hava, zirai mücadele) — erken kayıt
const mesaiWa = require('./mesai-whatsapp');
const { mountTarimRehber } = require('./tarim-rehber');
const { registerKonumYonetim } = require('./konum-yonetim');
mountTarimRehber(app, { getPool, authenticateToken, mesaiWa });
registerKonumYonetim(app, { getPool, authenticateToken, sadeceAdmin, sql });

/** Tarayıcı adres çubuğu GET — test sayfasına yönlendir */
app.get('/api/mesai/zobis-hatirlatma-test', (req, res) => {
  res.redirect(302, '/mesai-zobis-hatirlatma-test.html');
});
// MEVCUT KULLANICI – EMAIL DE GELECEK (%100 ÇALIŞIR)
app.get('/api/me', authenticateToken, async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('id', sql.Int, req.user.id)
      .query(`
        SELECT 
          Id, 
          KullaniciAdi, 
          ISNULL(Ad,'') AS Ad, 
          ISNULL(Soyad,'') AS Soyad,
          ISNULL(Email,'') AS Email,
          ISNULL(rol,'user') AS rol 
        FROM Kullanicilar 
        WHERE Id = @id
      `);

    if (result.recordset.length === 0) return res.json({ success: false });

    const u = result.recordset[0];
    let zobisIzinUyari = false;
    let zobisIzinUyariMetni = '';
    try {
      const adSoyad = `${u.Ad || ''} ${u.Soyad || ''}`.trim() || u.KullaniciAdi || '';
      if (adSoyad && !mesaiHaricMi(adSoyad)) {
        const bugun = bugunTarihStr();
        const yMap = await mesaiYoklamaEtkinMapAl(bugun);
        const y = yMap.get(u.Id);
        if (y && String(y.durum || '').toLowerCase().trim() === 'izin_cikarmadi') {
          zobisIzinUyari = true;
          zobisIzinUyariMetni =
            'ZOBİS\'ten çıkarılmayan izniniz var. ZOBİS işleminizi tamamlayın veya yönetici ile görüşün.';
        } else {
          const yil = new Date().getFullYear();
          const kullanimlar = await mesaiIzinKullanimlariAl(u.Id, yil);
          const bek = mesaiIzinZobisBekleyenSayi(kullanimlar);
          if (bek > 0) {
            zobisIzinUyari = true;
            zobisIzinUyariMetni =
              bek + ' izin planınız ZOBİS\'te işlenmeyi bekliyor. Mesai takip sayfasından işaretleyin.';
          }
        }
      }
    } catch (mesaiErr) {
      console.warn('/api/me ZOBİS uyarısı atlandı:', mesaiErr.message);
    }

    res.json({
      success: true,
      zobisIzinUyari,
      zobisIzinUyariMetni,
      user: {
        id: u.Id,
        kullaniciadi: u.KullaniciAdi,
        ad: u.Ad,
        soyad: u.Soyad,
        email: u.Email.trim(),  // ← EMAIL BURADA, BOŞ OLMAYACAK
        rol: u.rol
      }
    });
  } catch (err) {
    console.error('/api/me hatası:', err);
    res.json({ success: false });
  }
});

// MEVCUT KULLANICI
//app.get('/api/me', authenticateToken, async (req, res) => {
  //try {
    //const pool = await getPool();
    //const result = await pool.request()
      //.input('id', req.user.id)
      //.query('SELECT Id, KullaniciAdi, ISNULL(Ad,\'\') AS Ad, ISNULL(Soyad,\'\') AS Soyad, ISNULL(rol,\'user\') AS rol FROM Kullanicilar WHERE Id = @id');
    //if (result.recordset.length === 0) return res.json({ success: false });
    //const u = result.recordset[0];
    //res.json({ success: true, user: { id: u.Id, kullaniciadi: u.KullaniciAdi, ad: u.Ad, soyad: u.Soyad, rol: u.rol }});
  //} catch (err) { res.json({ success: false }); }
//});

// PERSONEL PANELİ – TÜM KULLANICILAR
app.get('/api/kullanicilar', authenticateToken, sadeceAdmin, async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT Id AS id, KullaniciAdi AS kullaniciadi, ISNULL(Ad + ' ' + Soyad, '-') AS adsoyad,
             ISNULL(Email, '-') AS email, ISNULL(rol, 'user') AS rol
      FROM Kullanicilar ORDER BY rol DESC, Ad
    `);
    res.json(result.recordset);
  } catch (err) { res.json([]); }
});

// ÇKS LİSTE & ARAMA – HEM İLK 100 HEM DE TÜM TABLODA ARAMA (%100 ÇALIŞIR)
// ÇKS LİSTE & ARAMA – HEM İLK 100 HEM DE TÜM TABLODA ARAMA (%100 ÇALIŞIR)
app.get('/api/cks-ara', authenticateToken, async (req, res) => {
  const q = (req.query.q || '').toString().trim();

  try {
    const pool = await getPool();
    
    // DİKKAT: 'tur' ve 'vergino' sütunlarını SQL sorgusuna ekledik ki ön yüz (frontend) bunları görebilsin!
    let sqlQuery = `
      SELECT TOP 100 
        kimlik, [Tc Kimlik No], [Adı Soyadı], [Baba Adı], [Doğum Tarihi],
        Cinsiyet, İlçe, [Köy/Mahalle], Telefon as telefon, kayıttarihi, Durum, tur, vergino
      FROM [çksdilekçe]
    `;

    const request = pool.request();

    if (q && q.length >= 2) {
      // Şirket aramalarında kolaylık olsun diye vergino'yu da arama kriterlerine ekledik
      sqlQuery += ` WHERE 
        [Tc Kimlik No] LIKE @q OR
        [Adı Soyadı] LIKE @q OR
        [Baba Adı] LIKE @q OR
        [Köy/Mahalle] LIKE @q OR
        İlçe LIKE @q OR
        vergino LIKE @q
      `;
      request.input('q', sql.NVarChar, `%${q}%`);
    }

    sqlQuery += ` ORDER BY kimlik DESC`;

    const result = await request.query(sqlQuery);
    res.json(result.recordset);

  } catch (err) {
    console.error("ÇKS ARAMA HATASI:", err.message);
    res.json([]); 
  }
});

// ÇKS KAYDET
// ÇKS KAYDET (ŞAHIS & ŞİRKET UYUMLU)
app.post('/api/ciftci-kaydet', authenticateToken, async (req, res) => {
  const { tc, vergino, tur, adsoyad, babaadi, dogumtarihi, cinsiyet, telefon, il, ilce, koy, durum } = req.body;
  
  if (!adsoyad) return res.json({ success: false, message: "Ad Soyad/Unvan zorunludur!" });
  
  // Zeki Güvenlik Kontrolleri
  if (tur === 'GERCEK' && (!tc || tc.length !== 11)) return res.json({ success: false, message: "Şahıs için 11 haneli TC zorunludur!" });
  if (tur === 'TUZEL' && (!vergino || vergino.length !== 10)) return res.json({ success: false, message: "Şirket için 10 haneli Vergi No zorunludur!" });

  try {
    const pool = await getPool();
    
    // Mükerrer Kayıt Kontrolü (TC veya Vergi No'ya göre)
    if (tur === 'GERCEK') {
        const k = await pool.request().input('tc', tc).query(`SELECT COUNT(*) AS cnt FROM [çksdilekçe] WHERE [Tc Kimlik No] = @tc`);
        if (k.recordset[0].cnt > 0) return res.json({ success: false, message: "Bu TC sistemde zaten kayıtlı!" });
    } else {
        const k = await pool.request().input('vno', vergino).query(`SELECT COUNT(*) AS cnt FROM [çksdilekçe] WHERE vergino = @vno`);
        if (k.recordset[0].cnt > 0) return res.json({ success: false, message: "Bu Vergi Numarası sistemde zaten kayıtlı!" });
    }

    await pool.request()
      .input('tc', sql.NVarChar, tc || null)
      .input('vergino', sql.NVarChar, vergino || null)
      .input('tur', sql.NVarChar, tur || 'GERCEK')
      .input('adsoyad', sql.NVarChar, adsoyad)
      .input('babaadi', sql.NVarChar, babaadi || null)
      .input('dogumtarihi', sql.NVarChar, dogumtarihi || null)
      .input('cinsiyet', sql.NVarChar, cinsiyet || null)
      .input('telefon', sql.NVarChar, telefon || null) 
      .input('il', sql.NVarChar, il || 'KONYA')        
      .input('ilce', sql.NVarChar, ilce || 'Sarayönü')
      .input('koy', sql.NVarChar, koy || null)
      .input('durum', sql.NVarChar, durum || 'Aktif')
      .input('tarih', sql.Date, new Date())
      .input('kullanici', sql.Int, req.user.id)
      .query(`INSERT INTO [çksdilekçe] 
             ([Tc Kimlik No], vergino, tur, [Adı Soyadı], [Baba Adı], [Doğum Tarihi], Cinsiyet, il, İlçe, [Köy/Mahalle], Telefon, Durum, kayıttarihi, kullanıcı)
              VALUES (@tc, @vergino, @tur, @adsoyad, @babaadi, @dogumtarihi, @cinsiyet, @il, @ilce, @koy, @telefon, @durum, @tarih, @kullanici)`);
    
    res.json({ success: true });
  } catch (err) {
    console.error("KAYDET HATASI:", err.message);
    res.json({ success: false, message: "Veritabanına yazılamadı!" });
  }
});

//mesajlas

// TÜM PERSONELLER (MESAJLAR İÇİN KULLANICI LİSTESİ) – DÜZELTİLMİŞ HALİ!
app.get('/api/personeller', authenticateToken, async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('benimId', sql.Int, req.user.id)  // BU SATIRI EKLEDİK!
      .query(`
        SELECT Id, KullaniciAdi, ISNULL(Ad + ' ' + Soyad, KullaniciAdi) AS AdSoyad
        FROM Kullanicilar 
        WHERE Id != @benimId
        ORDER BY AdSoyad
      `);
    res.json(result.recordset);
  } catch (err) {
    console.error('/api/personeller hatası:', err);
    res.json([]);
  }
});
// ÇKS SİL
app.delete('/api/cks-sil/:id', authenticateToken, async (req, res) => {
  try {
    const pool = await getPool();
    await pool.request().input('id', req.params.id).query(`DELETE FROM [çksdilekçe] WHERE kimlik = @id`);
    res.json({ success: true });
  } catch (err) { res.json({ success: false }); }
});
// 1. TÜM PERSONELLER (MESAJLAR İÇİN KULLANICI LİSTESİ)
// app.get('/api/personeller', authenticateToken, async (req, res) => {
//   try {
//     const pool = await getPool();
//     const result = await pool.request().query(`
//       SELECT Id, KullaniciAdi, ISNULL(Ad + ' ' + Soyad, KullaniciAdi) AS AdSoyad
//       FROM Kullanicilar 
//       WHERE Id != @benimId
//       ORDER BY AdSoyad
//     `);
//     result.recordset.forEach(x => x.Id = Number(x.Id)); // id string geliyorsa düzeltir
//     res.json(result.recordset);
//   } catch (err) {
//     console.error('/api/personeller hatası:', err);
//     res.json([]);
//   }
// });

// 2. TÜM MESAJLAR (OKUNMAMIŞ + GÖRÜNTÜLEME İÇİN)
app.get('/api/mesajlar', authenticateToken, async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('benimId', sql.Int, req.user.id)
      .query(`
        SELECT m.*, ISNULL(k1.Ad + ' ' + k1.Soyad, k1.KullaniciAdi) AS GonderenIsim,
               ISNULL(k2.Ad + ' ' + k2.Soyad, k2.KullaniciAdi) AS AliciIsim
        FROM Mesajlar m
        LEFT JOIN Kullanicilar k1 ON m.GonderenId = k1.Id
        LEFT JOIN Kullanicilar k2 ON m.AliciId = k2.Id
        WHERE m.GonderenId = @benimId OR m.AliciId = @benimId
        ORDER BY m.Tarih ASC
      `);
    res.json(result.recordset);
  } catch (err) {
    console.error('/api/mesajlar hatası:', err);
    res.json([]);
  }
});

// 3. MESAJ GÖNDER
app.post('/api/mesaj-gonder', authenticateToken, async (req, res) => {
  const { aliciId, mesaj } = req.body;
  if (!aliciId || !mesaj?.trim()) return res.json({ success: false });

  try {
    const pool = await getPool();
    await pool.request()
      .input('gonderen', sql.Int, req.user.id)
      .input('alici', sql.Int, aliciId)
      .input('mesaj', sql.NVarChar, mesaj.trim())
      .query(`
        INSERT INTO Mesajlar (GonderenId, AliciId, Mesaj, Tarih, OkunmaDurumu)
        VALUES (@gonderen, @alici, @mesaj, GETDATE(), 0)
      `);
    res.json({ success: true });
  } catch (err) {
    console.error('Mesaj gönderilemedi:', err);
    res.json({ success: false });
  }
});

// 4. OKUNDU İŞARETLE
app.post('/api/mesaj-okundu', authenticateToken, async (req, res) => {
  const { gonderenId } = req.body;
  try {
    const pool = await getPool();
    await pool.request()
      .input('gonderen', sql.Int, gonderenId)
      .input('alici', sql.Int, req.user.id)
      .query(`
        UPDATE Mesajlar SET OkunmaDurumu = 1 
        WHERE GonderenId = @gonderen AND AliciId = @alici AND OkunmaDurumu = 0
      `);
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false });
  }
});

// 5. MESAJ SİL (SEÇİLEN KİŞİYLE TÜM MESAJLAR)
app.post('/api/mesaj-sil', authenticateToken, async (req, res) => {
  const { karsiId } = req.body;
  try {
    const pool = await getPool();
    await pool.request()
      .input('ben', sql.Int, req.user.id)
      .input('karsi', sql.Int, karsiId)
      .query(`
        DELETE FROM Mesajlar 
        WHERE (GonderenId = @ben AND AliciId = @karsi) 
           OR (GonderenId = @karsi AND AliciId = @ben)
      `);
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false });
  }
});
// 1. ÇKS DETAY – ANA BİLGİLER (KESİN ÇALIŞIR)
app.get('/api/cks-detay/:kimlik', authenticateToken, async (req, res) => {
  try {
    const kimlik = parseInt(req.params.kimlik);
    if (isNaN(kimlik)) return res.json({ success: false });

    const pool = await getPool();
    const result = await pool.request()
      .input('kimlik', sql.Int, kimlik)
      .query(`
        SELECT 
          [Tc Kimlik No], [Adı Soyadı], [Baba Adı], [Doğum Tarihi], 
          Cinsiyet, İlçe, [Köy/Mahalle], Durum, kayıttarihi
        FROM çksdilekçe 
        WHERE kimlik = @kimlik
      `);

    if (result.recordset.length === 0) {
      return res.json({ success: false });
    }

    res.json({ success: true, data: result.recordset[0] });
  } catch (err) {
    console.error('ÇKS Detay hatası:', err.message);
    res.json({ success: false });
  }
});

// 2. EK BİLGİLER – ZATEN DOĞRU AMA TEKRAR KOYALIM
app.get('/api/dilekce-ek-bilgi/:kimlik', authenticateToken, async (req, res) => {
    const { kimlik } = req.params;
    try {
        const pool = await getPool();
        const result = await pool.request()
            .input('kimlik', sql.Int, kimlik)
            .query(`
                SELECT d.*, 
                -- Klasör Numarası (Alan1)
                (SELECT TOP 1 [Alan1] 
                 FROM [VTÇKS] v
                 WHERE LTRIM(RTRIM(CAST(v.[Açıklama] AS NVARCHAR))) = LTRIM(RTRIM(CAST(d.[yil] AS NVARCHAR)))
                   AND v.[DefterTarihi] LIKE '%-%'
                   AND TRY_CAST(d.[dilekçeno] AS INT) BETWEEN 
                       TRY_CAST(LEFT(REPLACE(v.[DefterTarihi], ' ', ''), CHARINDEX('-', REPLACE(v.[DefterTarihi], ' ', '')) - 1) AS INT) 
                       AND 
                       TRY_CAST(SUBSTRING(REPLACE(v.[DefterTarihi], ' ', ''), CHARINDEX('-', REPLACE(v.[DefterTarihi], ' ', '')) + 1, 10) AS INT)
                ) AS KlasorNo,
                -- Oda Numarası (Resim Önizleme İçin)
                (SELECT TOP 1 [ODA] 
                 FROM [VTÇKS] v
                 WHERE LTRIM(RTRIM(CAST(v.[Açıklama] AS NVARCHAR))) = LTRIM(RTRIM(CAST(d.[yil] AS NVARCHAR)))
                   AND v.[DefterTarihi] LIKE '%-%'
                   AND TRY_CAST(d.[dilekçeno] AS INT) BETWEEN 
                       TRY_CAST(LEFT(REPLACE(v.[DefterTarihi], ' ', ''), CHARINDEX('-', REPLACE(v.[DefterTarihi], ' ', '')) - 1) AS INT) 
                       AND 
                       TRY_CAST(SUBSTRING(REPLACE(v.[DefterTarihi], ' ', ''), CHARINDEX('-', REPLACE(v.[DefterTarihi], ' ', '')) + 1, 10) AS INT)
                ) AS OdaNo
                FROM [dilekçebilgileri] d 
                WHERE d.[kimlikid] = @kimlik 
                ORDER BY d.yil DESC
            `);
        
        console.log(`Kimlik ${kimlik} için bulunan kayıt sayısı: ${result.recordset.length}`);
        
        // Terminalden kontrol edelim:
        if(result.recordset.length > 0) {
            console.log("Gelen Veri -> Klasör:", result.recordset[0].KlasorNo, "Oda (Resim No):", result.recordset[0].OdaNo);
        }

        res.json({ success: true, data: result.recordset });
    } catch (err) {
        console.error("Hata oluştu:", err.message);
        res.status(500).json({ success: false, message: err.message });
    }
});
// ---------- YENİ EKLENECEK 2 ENDPOINT (KESİN ÇALIŞIR) ----------

// 1. Otomatik artan dilekçe numarası al (dilekce.html'de kullanılıyor)
app.get('/api/max-dilekceno', authenticateToken, async (req, res) => {
    // Arayüzden gelen yılı alıyoruz (Gelmese bile 2026'yı baz al)
    const yil = req.query.yil || 2026;

    try {
        const pool = await getPool();
        const result = await pool.request()
            .input('yil', sql.SmallInt, yil)
            .query(`
                SELECT MAX(TRY_CAST(dilekçeno AS INT)) AS maxNo 
                FROM dilekçebilgileri 
                WHERE yil = @yil
            `);

        const maxNo = result.recordset[0].maxNo || 0;
        res.json({ success: true, maxDilekceNo: maxNo });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// 2. Dilekçe ek bilgi kaydet/güncelle (hem ilk kayıt hem düzenleme için)
// 2. Dilekçe ek bilgi kaydet/güncelle (hem ilk kayıt hem düzenleme için)
// 2. Dilekçe ek bilgi kaydet/güncelle (not ve nott düzeltildi – %100 ÇALIŞIR)
app.post('/api/dilekce-guncelle', authenticateToken, async (req, res) => {
  const { kimlik, dilekçeno, başvurutarihi, kullanıcıı, çks, çkstarih, çkskullanıcıı, tkgm, not, nott, yil } = req.body;

  // Temel bilgiler eksikse dur
  if (!kimlik || !dilekçeno || !yil) {
    return res.json({ success: false, message: "Eksik bilgi (Kimlik, No veya Yıl yok)" });
  }

  try {
    const pool = await getPool();
    const request = pool.request();

    // Parametreleri tanımla
    request.input('kimlik', sql.Int, kimlik);
    request.input('yil', sql.SmallInt, yil);
    request.input('dilekçeno', sql.NVarChar, dilekçeno);
    request.input('başvurutarihi', sql.Date, başvurutarihi);
    request.input('kullanıcıı', sql.NVarChar, kullanıcıı || null);
    request.input('çks', sql.NVarChar, çks || null);
    request.input('çkstarih', sql.NVarChar, çkstarih || null);
    request.input('çkskullanıcıı', sql.NVarChar, çkskullanıcıı || null);
    request.input('tkgm', sql.NVarChar, tkgm || null);
    request.input('not', sql.NVarChar, not || null);
    request.input('nott', sql.NVarChar, nott || null);

    // KRİTİK KONTROL: Bu kimliğin BU YILDA kaydı var mı?
    const kontrol = await pool.request()
      .input('kimlik', sql.Int, kimlik)
      .input('yil', sql.SmallInt, yil)
      .query(`SELECT COUNT(*) AS cnt FROM dilekçebilgileri WHERE kimlikid = @kimlik AND yil = @yil`);

    if (kontrol.recordset[0].cnt > 0) {
      // AYNI YIL İÇİNDE KAYIT VARSA -> GÜNCELLE
      console.log(`${yil} yılı için kayıt bulundu, güncelleniyor...`);
      await request.query(`
          UPDATE dilekçebilgileri SET 
            dilekçeno = @dilekçeno,
            başvurutarihi = @başvurutarihi,
            kullanıcıı = @kullanıcıı,
            çks = @çks,
            çkstarih = @çkstarih,
            çkskullanıcıı = @çkskullanıcıı,
            tkgm = @tkgm,
            [not] = @not,
            [nott] = @nott
          WHERE kimlikid = @kimlik AND yil = @yil
      `);
    } else {
      // BU YIL İÇİN KAYIT YOKSA -> YENİ SATIR EKLE (INSERT)
      console.log(`${yil} yılı için kayıt yok, yeni satır oluşturuluyor...`);
      await request.query(`
          INSERT INTO dilekçebilgileri 
          (kimlikid, dilekçeno, başvurutarihi, kullanıcıı, çks, çkstarih, çkskullanıcıı, tkgm, [not], [nott], yil)
          VALUES 
          (@kimlik, @dilekçeno, @başvurutarihi, @kullanıcıı, @çks, @çkstarih, @çkskullanıcıı, @tkgm, @not, @nott, @yil)
      `);
    }

    res.json({ success: true, message: `${yil} yılı kaydı başarıyla işlendi.` });
  } catch (err) {
    console.error("Dilekçe işlem hatası:", err.message);
    res.json({ success: false, message: err.message });
  }
});

app.post('/api/cks-modal-kaydet', authenticateToken, async (req, res) => {
  const { kimlik, tkgm, nott, cks, ckstarih, ckskullanici } = req.body;

  if (!kimlik) {
    return res.json({ success: false, message: "Kimlik ID eksik!" });
  }

  try {
    const pool = await getPool();
    await pool.request()
      .input('kimlik', sql.Int, kimlik)
      .input('tkgm', sql.NVarChar, tkgm || null)
      .input('nott', sql.NVarChar, nott || null)
      .input('cks', sql.NVarChar, cks || null)
      .input('ckstarih', sql.NVarChar, ckstarih || null)
      .input('ckskullanici', sql.NVarChar, ckskullanici || null)
      .query(`
          UPDATE dilekçebilgileri 
          SET 
            tkgm = @tkgm,
            nott = @nott,
            çks = @cks,
            çkstarih = @ckstarih,
            çkskullanıcıı = @ckskullanici
          WHERE kimlikid = @kimlik 
          AND yil = (SELECT YEAR(GETDATE())) -- Veya hangi yıl aktifse o
      `);

    res.json({ success: true, message: "Kayıt başarıyla güncellendi." });
  } catch (err) {
    console.error("CKS Modal Kayıt Hatası:", err.message);
    res.json({ success: false, message: err.message });
  }
});

app.post('/api/cks-modal-ozel-kaydet', authenticateToken, async (req, res) => {
    const { kimlik, tkgm, nott, cks, ckstarih, ckskullanici, yil } = req.body;

    if (!kimlik || !yil) {
        return res.json({ success: false, message: "Kimlik ID veya Yıl bilgisi eksik!" });
    }

    try {
        const pool = await getPool();
        await pool.request()
            .input('kimlik', sql.Int, kimlik)
            .input('yil', sql.SmallInt, yil)
            .input('tkgm', sql.NVarChar, tkgm || null)
            .input('nott', sql.NVarChar, nott || null)
            .input('cks', sql.NVarChar, cks || null)
            .input('ckstarih', sql.NVarChar, ckstarih || null)
            .input('ckskullanici', sql.NVarChar, ckskullanici || null)
            .query(`
                UPDATE dilekçebilgileri 
                SET 
                    tkgm = @tkgm,
                    [nott] = @nott,
                    çks = @cks,
                    çkstarih = @ckstarih,
                    çkskullanıcıı = @ckskullanici
                WHERE kimlikid = @kimlik AND yil = @yil
            `);

        res.json({ success: true, message: "Kayıt başarıyla güncellendi." });
    } catch (err) {
        console.error("Özel Güncelleme Hatası:", err.message);
        res.json({ success: false, message: "Veritabanı hatası: " + err.message });
    }
});

/** belgenet.dosyadı → dilekçe no (2027-123-… ile eski 123-… uyumlu) */
const BELGENET_DILEKCE_NO_SQL = `CASE 
  WHEN LEN(dosyadı) >= 5 AND dosyadı LIKE '[0-9][0-9][0-9][0-9]-%'
    THEN LEFT(SUBSTRING(dosyadı, 6, 8000),
      CASE WHEN CHARINDEX('-', SUBSTRING(dosyadı, 6, 8000)) > 0
           THEN CHARINDEX('-', SUBSTRING(dosyadı, 6, 8000)) - 1
           ELSE LEN(SUBSTRING(dosyadı, 6, 8000)) END)
  WHEN CHARINDEX('-', dosyadı) > 0 THEN LEFT(dosyadı, CHARINDEX('-', dosyadı) - 1)
  ELSE dosyadı
END`;

app.get('/api/klasor-sayfa-istatistik', authenticateToken, async (req, res) => {
    try {
        const pool = await getPool();
        
        // 1. Sorgu: Klasör Aralıkları (VTÇKS tablosundan)
        const aralikSorgu = await pool.request().query(`
            WITH Evraklar AS (
                SELECT 
                    TRY_CAST(${BELGENET_DILEKCE_NO_SQL} AS INT) AS DilekceNo,
                    TRY_CAST(sayfasayısı AS INT) AS Sayfa
                FROM belgenet 
                WHERE dosyadı IS NOT NULL AND sayfasayısı IS NOT NULL
            ),
            Klasorler AS (
                SELECT Alan1 AS KlasorNo, DefterTarihi AS KlasorAraligi,
                TRY_CAST(LEFT(DefterTarihi, CHARINDEX('-', DefterTarihi) - 1) AS INT) AS Baslangic,
                TRY_CAST(RIGHT(DefterTarihi, LEN(DefterTarihi) - CHARINDEX('-', DefterTarihi)) AS INT) AS Bitis
                FROM VTÇKS WHERE DefterTarihi LIKE '%-%'
            )
            SELECT K.KlasorNo, K.KlasorAraligi, COUNT(E.DilekceNo) AS EvrakSayisi, ISNULL(SUM(E.Sayfa), 0) AS ToplamSayfa
            FROM Klasorler K LEFT JOIN Evraklar E ON E.DilekceNo BETWEEN K.Baslangic AND K.Bitis
            GROUP BY K.KlasorNo, K.KlasorAraligi ORDER BY TRY_CAST(K.KlasorNo AS INT) ASC
        `);

        // 2. Sorgu: En Çok Sayfalı 10 Çiftçi (Hata riskine karşı zırhlı JOIN)
        // Eğer tablo adınız 'ciftci' değilse burayı 'ciftciler' vb. olarak kontrol edin
            // 2. Sorgu: En Çok Sayfalı 10 Çiftçi (Ek dosyalar dahil toplam)
const topCiftciSorgu = await pool.request().query(`
    WITH GruplanmisEvraklar AS (
        SELECT 
            kimlikid,
            -- Dosya adından tireye kadar olan kısmı (Dilekçe No) alıyoruz
            ${BELGENET_DILEKCE_NO_SQL} AS AnaDosyaNo,
            SUM(TRY_CAST(sayfasayısı AS INT)) as ToplamSayfa
        FROM belgenet
        WHERE sayfasayısı IS NOT NULL AND dosyadı IS NOT NULL
        GROUP BY kimlikid, ${BELGENET_DILEKCE_NO_SQL}
    )
    SELECT TOP 10 
        ISNULL(c.[Adı Soyadı], 'Bilinmeyen Çiftçi') as AdSoyad,
        g.AnaDosyaNo as dosyadı,
        g.ToplamSayfa as Sayfa
    FROM GruplanmisEvraklar g
    LEFT JOIN çksdilekçe c ON g.kimlikid = c.Kimlik
    ORDER BY g.ToplamSayfa DESC
`);

        res.json({ 
            success: true, 
            data: aralikSorgu.recordset,
            topCiftciler: topCiftciSorgu.recordset 
        });

    } catch (err) {
        console.error("KRİTİK HATA:", err.message);
        // Hata olsa bile JSON döndür ki ekranda 'Analiz Ediliyor' yazısı kapansın
        res.status(500).json({ success: false, message: err.message });
    }
});

// 1. Çiftçinin tüm planlı kayıtlarını getir - %100 ÇALIŞIR HALİ
app.get('/api/planli', async (req, res) => {
  try {
    const { kimlik } = req.query;
    if (!kimlik) return res.status(400).json({ error: "kimlik parametresi gerekli" });

    const result = await pool.request()
      .input('kimlikid', sql.Int, kimlik)
      .query(`
        SELECT kimlik, kimlikid, il, ilçe, mahalle, ada, parsel, alan, ürünadı, tik 
        FROM planlı 
        WHERE kimlikid = @kimlikid 
        ORDER BY kimlik DESC
      `);

    res.json(result.recordset);
  } catch (err) {
    console.error("Planlı veri çekme hatası:", err.message);
    console.error("Stack:", err.stack);
    res.status(500).json({ error: err.message });
  }
});

// 2. Yeni kayıt ekle (değişiklik yok, zaten kimlikid ile çalışıyor)
app.post('/api/planli', async (req, res) => {
  try {
    const { kimlikid, il, ilçe, mahalle, ada, parsel, alan, ürünadı, tik = 1 } = req.body;

    if (!kimlikid) return res.status(400).json({ error: "kimlikid gerekli" });

    const result = await pool.request()
      .input('kimlikid', sql.Int, kimlikid)
      .input('il', sql.NVarChar(50), il || 'Konya')
      .input('ilçe', sql.NVarChar(50), ilçe || 'Sarayönü')
      .input('mahalle', sql.NVarChar(255), mahalle)
      .input('ada', sql.Int, ada || 0)
      .input('parsel', sql.Int, parsel || 0)
      .input('alan', sql.Float, alan || 0)
      .input('ürünadı', sql.NVarChar(255), ürünadı)
      .input('tik', sql.Int, tik)
      .query(`
        INSERT INTO planlı (kimlikid, il, ilçe, mahalle, ada, parsel, alan, ürünadı, tik)
        VALUES (@kimlikid, @il, @ilçe, @mahalle, @ada, @parsel, @alan, @ürünadı, @tik);
        
        SELECT SCOPE_IDENTITY() AS kimlik;  -- Yeni eklenen satırın kimlik değerini döndür (eğer oto-artan değilse)
      `);

    // Eğer tablonuzda kimlik alanı oto-artan değilse ve siz manuel atıyorsanız bu satırı kaldırabilirsiniz
    const yeniKimlik = result.recordset[0]?.kimlik;

    res.json({ success: true, kimlik: yeniKimlik });
  } catch (err) {
    console.error("Planlı ekleme hatası:", err);
    res.status(500).json({ error: err.message });
  }
});

// 3. Kayıt sil → artık :id yerine :kimlik olacak
app.delete('/api/planli/:kimlik', async (req, res) => {
  try {
    const { kimlik } = req.params;

    const result = await pool.request()
      .input('kimlik', sql.Int, kimlik)
      .query(`DELETE FROM planlı WHERE kimlik = @kimlik`);

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ error: "Kayıt bulunamadı" });
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Planlı silme hatası:", err);
    res.status(500).json({ error: err.message });
  }
});

// 4. Tik güncelle → artık :id yerine :kimlik olacak
app.put('/api/planli/:kimlik', async (req, res) => {
  try {
    const { kimlik } = req.params;
    const { tik } = req.body;

    const result = await pool.request()
      .input('kimlik', sql.Int, kimlik)
      .input('tik', sql.Int, tik ? 1 : 0)
      .query(`
        UPDATE planlı 
        SET tik = @tik 
        WHERE kimlik = @kimlik
      `);

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ error: "Kayıt bulunamadı" });
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Tik güncelleme hatası:", err);
    res.status(500).json({ error: err.message });
  }
});



// ===================== PASİFLEME - %100 ÇALIŞIR (MEVCUT POOL KULLANILIYOR) =====================

// 1) LİSTELE - %100 ÇALIŞIR HALİ (ADA/PARSEL GELİYOR)
// LİSTELEME
app.get('/api/pasifleme', async (req, res) => {
  try {
    const numara = req.query.tc;
    if (!numara) return res.json([]);

    // BURASI DÜZELTİLDİ: Listelerken de hem TC hem Vergi No sütununa bakıyoruz
    const result = await pool.request()
      .input('numara', sql.NVarChar, numara)
      .query(`
        SELECT a.kimlik, a.kimlikid, a.il, a.ilçe, a.mahalle, a.ada, a.parsel, a.tur 
        FROM arazic a
        INNER JOIN çksdilekçe c ON a.kimlikid = c.kimlik
        WHERE LTRIM(RTRIM(c.[Tc Kimlik No])) = @numara 
           OR LTRIM(RTRIM(c.vergino)) = @numara
        ORDER BY a.kimlikid DESC
      `);

    res.json(result.recordset);
  } catch (err) {
    console.error("Pasifleme GET hatası:", err);
    res.status(500).json([]);
  }
});

// PASİFLEME EKLEME - %100 ÇALIŞAN
// PASİFLEME EKLEME
app.post('/api/pasifleme', async (req, res) => {
  try {
    const { tc, il, ilce, mahalle, ada, parsel, tur } = req.body;

    // BURASI DÜZELTİLDİ: Hem TC hem Vergi No sütununda arıyoruz
    const kimlikRes = await pool.request()
      .input('numara', sql.NVarChar, tc)
      .query(`
        SELECT kimlik 
        FROM çksdilekçe 
        WHERE LTRIM(RTRIM([Tc Kimlik No])) = @numara 
           OR LTRIM(RTRIM(vergino)) = @numara
      `);

    if (kimlikRes.recordset.length === 0) {
      return res.status(404).json({ hata: "Bu Numara (TC/Vergi) sistemde yok!" });
    }

    const kimlikid = kimlikRes.recordset[0].kimlik;

    // Ekleme kısmı aynı kalıyor
    await pool.request()
      .input('kimlikid', sql.Int, kimlikid)
      .input('il', sql.NVarChar, il)
      .input('ilçe', sql.NVarChar, ilce)
      .input('mahalle', sql.NVarChar, mahalle || null)
      .input('ada', sql.Int, ada)
      .input('parsel', sql.Int, parsel)
      .input('tur', sql.NVarChar, tur)
      .query(`
        INSERT INTO arazic (kimlikid, il, ilçe, mahalle, ada, parsel, tur)
        VALUES (@kimlikid, @il, @ilçe, @mahalle, @ada, @parsel, @tur)
      `);

    res.json({ success: true });
  } catch (err) {
    console.log("Ekleme hatası:", err);
    res.status(500).json({ hata: "Ekleme başarısız" });
  }
});

// PASİFLEME SİLME İŞLEMİ
app.delete('/api/pasifleme/:kimlik', async (req, res) => {
  try {
    const kimlik = parseInt(req.params.kimlik);
    
    if (isNaN(kimlik) || kimlik <= 0) {
      console.error("Geçersiz kimlik değeri:", req.params.kimlik);
      return res.status(400).json({ success: false, hata: "Geçersiz ID formatı" });
    }

    await pool.request()
      .input('kimlik', sql.Int, kimlik) 
      .query('DELETE FROM arazic WHERE kimlik = @kimlik');
    
    res.json({ success: true });
  } catch (err) {
    console.error("Pasifleme SİLME hatası:", err); 
    res.status(500).json({ hata: err.message });
  }
});

// // 3) SİL
// app.delete('/api/pasifleme/:kimlik', async (req, res) => {
//   try {
//     await pool.request()
//       .input('kimlik', sql.Int, req.params.kimlik)
//       .query('DELETE FROM arazic WHERE kimlik = @kimlik');
//     res.json({ success: true });
//   } catch (err) {
//     console.error("Pasifleme SİLME hatası:", err);
//     res.status(500).json({ hata: err.message });
//   }
// });



// GERÇEK İL - İLÇE - MAHALLE TABLOLARINDAN ÇEKİYORUZ (KESİN ÇALIŞIR)
// İL - İLÇE - MAHALLE → GERÇEK TABLOLARDAN ÇEKİYORUZ (KESİN ÇALIŞIR)
// İL - İLÇE - MAHALLE → SENİN TABLOLARINDAN ÇEKİYORUZ (4 VERSİYON BİR ARADA, BİRİ KESİN ÇALIŞIR)
app.get('/api/IL', async (req,res) => {
  try { const p=await getPool(); const r=await p.request().query("SELECT DISTINCT [İL] FROM [İL] ORDER BY [İL]"); res.json(r.recordset.map(x=>({İL:x.İL}))); }
  catch{try{const p=await getPool(); const r=await p.request().query("SELECT DISTINCT [İL] FROM [İL] ORDER BY [İL]"); res.json(r.recordset.map(x=>({İL:x.İL})));}catch{res.json([])}}
});

app.get('/api/ILCE', async (req,res) => {
  try { const p=await getPool(); const r=await p.request().query("SELECT [İL],[İLÇE] FROM [İLÇE] ORDER BY [İL],[İLÇE]"); res.json(r.recordset); }
  catch{try{const p=await getPool(); const r=await p.request().query("SELECT [İL],[İLÇE] FROM [İLÇE] ORDER BY [İL],[İLÇE]"); res.json(r.recordset);}catch{res.json([])}}
});

app.get('/api/MAHALLE', async (req, res) => {
  try {
    const pool = await getPool();
    const r = await pool.request().query(`
      SELECT DISTINCT 
        LTRIM(RTRIM([İL])) AS İL,
        LTRIM(RTRIM([İLÇE])) AS İLÇE, 
        LTRIM(RTRIM([MAHALLE])) AS MAHALLE 
      FROM planlıMAHALLE 
      WHERE [MAHALLE] IS NOT NULL AND LTRIM(RTRIM([MAHALLE])) != ''
      ORDER BY [İL], [İLÇE], [MAHALLE]
    `);
    console.log("MAHALLE tablosundan mahalle sayısı:", r.recordset.length);
    res.json(r.recordset.map(x => ({İL:x.İL, İLÇE:x.İLÇE, MAHALLE:x.MAHALLE})));
  } catch (e) {
    console.error(e.message);
    res.json([]);
  }
});
// authenticateToken KALDIRILDI → TC GÜNCELLEME HERKES YAPABİLİR (ÇKS'DE GEREK YOK)
app.post('/api/tc-guncelle', async (req, res) => {
  try {
    const { kimlik, yeniTc } = req.body;

    if (!kimlik || !yeniTc || yeniTc.length !== 11 || isNaN(yeniTc)) {
      return res.status(400).json({ success: false });
    }

    const pool = await getPool();
    const result = await pool.request()
      .input('kimlik', sql.Int, kimlik)
      .input('tc', sql.NVarChar(11), yeniTc)
      .query(`UPDATE [çksdilekçe] SET [Tc Kimlik No] = @tc WHERE kimlik = @kimlik`);

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ success: false });
    }

    console.log(`TC GÜNCELLENDİ → ${kimlik} → ${yeniTc}`);
    res.json({ success: true });

  } catch (err) {
    console.error("TC GÜNCELLEME HATASI:", err.message);
    res.status(500).json({ success: false });
  }
});
// ==================== YENİ: TÜM DİLEKÇELERİ LİSTELEME ====================
// server.js (Düzeltilmiş /api/tum-dilekceler rotası - Basitleştirilmiş)


/// ==================== YENİ: TÜM DİLEKÇELERİ LİSTELEME ====================
// server.js (Düzeltilmiş /api/tum-dilekceler rotası - Basitleştirilmiş)
// 1. TÜM LİSTEYİ GETİREN ENDPOINT (TEKRARSIZ, HIZLI)
app.get('/api/tum-dilekceler', async (req, res) => {
    try {
        const pool = await getPool(); 
        
        const request = pool.request();
        request.timeout = 120000;

        const result = await request.query(`
            SELECT 
                db.dilekçeno,
                cd.[Tc Kimlik No],
                cd.[Adı Soyadı],
                cd.[Baba Adı],
                cd.[Doğum Tarihi],
                db.başvurutarihi,
                db.kullanıcıı,
                db.kimlikid,
                db.çks,
                '-' AS ebelgeno, -- Numarayı sildik, yerine sadece çizgi gönderiyoruz
                -- Sadece taranmış dosyası var mı diye bakıyoruz, satırları çoğaltmıyoruz!
                CASE WHEN EXISTS(SELECT 1 FROM belgenet b WHERE b.kimlikid = cd.Kimlik) THEN 1 ELSE 0 END AS ebelge
            FROM dilekçebilgileri db
            INNER JOIN çksdilekçe cd ON db.kimlikid = cd.Kimlik
            ORDER BY TRY_CAST(db.dilekçeno AS INT) DESC
        `);
        res.json(result.recordset);
    } catch (err) {
        console.error('tum-dilekceler hata:', err);
        res.status(500).json({ hata: err.message });
    }
});


// 2. ARAMA YAPAN ENDPOINT (TEKRARSIZ, HIZLI)
app.get('/api/tum-dilekceler-ara', async (req, res) => {
    const q = (req.query.q || '').trim();
    if (!q) return res.json([]);

    const arama = `%${q}%`;

    try {
        const pool = await getPool();

        const request = pool.request();
        request.timeout = 120000; 

        request.input('arama', sql.VarChar, arama);

        const result = await request.query(`
            SELECT 
                db.dilekçeno,
                cd.[Tc Kimlik No],
                cd.[Adı Soyadı],
                cd.[Baba Adı],
                cd.[Doğum Tarihi],
                db.başvurutarihi,
                db.kullanıcıı,
                db.kimlikid,
                db.çks,
                '-' AS ebelgeno, -- Numarayı sildik
                -- Sadece taranmış dosyası var mı diye bakıyoruz
                CASE WHEN EXISTS(SELECT 1 FROM belgenet b WHERE b.kimlikid = cd.Kimlik) THEN 1 ELSE 0 END AS ebelge
            FROM dilekçebilgileri db
            INNER JOIN çksdilekçe cd ON db.kimlikid = cd.Kimlik
            WHERE 
                cd.[Adı Soyadı] LIKE @arama
                OR cd.[Tc Kimlik No] LIKE @arama
                OR db.dilekçeno LIKE @arama
            ORDER BY TRY_CAST(db.dilekçeno AS INT) DESC
        `);

        res.json(result.recordset);
    } catch (err) {
        console.error('tum-dilekceler-ara hata:', err);
        res.status(500).json({ hata: 'Sunucu hatası' });
    }
});
// EK EVRAK YÜKLE
// EK EVRAK EKLE
// EKLE
// EK EVRAK EKLE (sadece tarih, otomatik bugünün tarihi)
// EK EVRAK EKLE (BASİT – SADECE TARİH, OTOMATİK BUGÜN)
// EK EVRAK EKLE – otomatik dosyano (dilekçeno), ek (sıralı 1,2,3...)
// ===================== EK EVRAK SİSTEMİ (KESİN ÇALIŞIR) =====================

// ===================== EK EVRAK SİSTEMİ (TAM VE ÇALIŞIR) =====================

// ===================== EK EVRAK SİSTEMİ (TAM VE ÇALIŞIR) =====================

// 1. EKLE
// EK EVRAK EKLE – dosyano INT olarak gönderiliyor
// EK EVRAK EKLE – dosyano INT olarak gönderiliyor
app.post('/api/ekevrak-ekle', authenticateToken, async (req, res) => {
  const kid = parseInt(req.body?.kimlikid, 10);
  const tarih = req.body?.tarih;
  if (!kid || isNaN(kid)) {
    return res.json({ success: false, message: 'Geçersiz kimlik id' });
  }

  try {
    const pool = await getPool();

    const dilekceRes = await pool.request()
      .input('kimlikid', sql.Int, kid)
      .query(`SELECT dilekçeno FROM dilekçebilgileri WHERE kimlikid = @kimlikid`);

    let dosyano = 0;
    if (dilekceRes.recordset.length > 0) {
      dosyano = parseInt(dilekceRes.recordset[0].dilekçeno, 10) || 0;
    }

    const maxEkRes = await pool.request()
      .input('kimlikid', sql.Int, kid)
      .query(`SELECT ISNULL(MAX(ek), 0) + 1 AS yeniEk FROM ekevrak WHERE kimlikid = @kimlikid`);

    const ek = maxEkRes.recordset[0].yeniEk;

    const request = pool.request()
      .input('kimlikid', sql.Int, kid)
      .input('dosyano', sql.Int, dosyano)
      .input('ek', sql.Int, ek);

    if (tarih) {
      const dt = new Date(String(tarih).replace(' ', 'T'));
      if (isNaN(dt.getTime())) {
        await request.query(`
          INSERT INTO ekevrak (kimlikid, dosyano, ek, tarih)
          VALUES (@kimlikid, @dosyano, @ek, GETDATE())
        `);
      } else {
        request.input('tarih', sql.DateTime, dt);
        await request.query(`
          INSERT INTO ekevrak (kimlikid, dosyano, ek, tarih)
          VALUES (@kimlikid, @dosyano, @ek, @tarih)
        `);
      }
    } else {
      await request.query(`
        INSERT INTO ekevrak (kimlikid, dosyano, ek, tarih)
        VALUES (@kimlikid, @dosyano, @ek, GETDATE())
      `);
    }

    res.json({ success: true, ek, dosyano });
  } catch (err) {
    console.error('Ek evrak ekleme hatası:', err.message);
    res.json({ success: false, message: err.message });
  }
});

// EK EVRAK LİSTELE (Bu kısımda bir değişiklik yapmanıza gerek yok, sorunsuz)
app.get('/api/ekevrak-liste', authenticateToken, async (req, res) => {
  const kid = parseInt(req.query.kimlikid, 10);
  if (!kid || isNaN(kid)) return res.json([]);

  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('kimlikid', sql.Int, kid)
      .query(`
        SELECT Kimlik AS id, dosyano, ek, tarih 
        FROM ekevrak 
        WHERE kimlikid = @kimlikid 
        ORDER BY ek
      `);
    res.json(result.recordset);
  } catch (err) {
    console.error("Ek evrak listeleme hatası:", err.message);
    res.json([]);
  }
});

// 3. SİL
app.delete('/api/ekevrak-sil/:id', authenticateToken, async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.json({ success: false });

  try {
    const pool = await getPool();
    await pool.request()
      .input('id', sql.Int, id)
      .query(`DELETE FROM ekevrak WHERE Kimlik = @id`);
    res.json({ success: true });
  } catch (err) {
    console.error("Ek evrak silme hatası:", err);
    res.json({ success: false });
  }
});


// ===================== EKSİKLER SİSTEMİ (ÇAKIŞMA YOK) =====================

// EKSİK EKLE
app.post('/api/eksik-ekle', authenticateToken, async (req, res) => {
  const { kimlikid, eksikler } = req.body;
  if (!kimlikid || !eksikler) return res.json({ success: false });

  try {
    const pool = await getPool();

    // KULLANICI ADI SOYADI ZORUNLU OLARAK ALINIYOR
    let adSoyad = 'Bilinmeyen';
    if (req.user.ad && req.user.soyad) {
      adSoyad = `${req.user.ad.trim()} ${req.user.soyad.trim()}`;  // Ad Soyad birleştir
    } else if (req.user.kullaniciadi) {
      adSoyad = req.user.kullaniciadi;  // Son çare kullanıcı adı
    }

    await pool.request()
      .input('kimlikid', sql.Int, kimlikid)
      .input('eksikler', sql.NVarChar(sql.MAX), eksikler)
      .input('kullanici', sql.NVarChar, adSoyad)  // BURADA AD SOYAD KAYDEDİLİYOR
      .query(`
        INSERT INTO eksikler (Kimlikid, eksikler, tarih, durum, kullanıcı)
        VALUES (@kimlikid, @eksikler, GETDATE(), 'EKSİK', @kullanici)
      `);

    res.json({ success: true });
  } catch (err) {
    console.error("Eksik ekleme hatası:", err.message);
    res.json({ success: false });
  }
});
// EKSİK LİSTELE
app.get('/api/eksik-liste', authenticateToken, async (req, res) => {
  const { kimlikid } = req.query;
  if (!kimlikid) return res.json([]);

  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('kimlikid', sql.Int, kimlikid)
.query(`
  SELECT Kimlik, eksikler, tarih, durum, kullanıcı 
  FROM eksikler 
  WHERE Kimlikid = @kimlikid 
  ORDER BY tarih DESC
`);
    res.json(result.recordset);
  } catch (err) {
    console.error("Eksik listeleme hatası:", err);
    res.json([]);
  }
});

// EKSİK SİL
app.delete('/api/eksik-sil/:id', authenticateToken, async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.json({ success: false });

  try {
    const pool = await getPool();
    await pool.request()
      .input('id', sql.Int, id)
      .query(`DELETE FROM eksikler WHERE Kimlik = @id`);
    res.json({ success: true });
  } catch (err) {
    console.error("Eksik silme hatası:", err);
    res.json({ success: false });
  }
});

// EKSİK DÜZENLE
app.put('/api/eksik-duzenle/:id', authenticateToken, async (req, res) => {
  const id = parseInt(req.params.id);
  const { eksikler, durum } = req.body;
  if (isNaN(id)) return res.json({ success: false });

  try {
    const pool = await getPool();
    await pool.request()
      .input('id', sql.Int, id)
      .input('eksikler', sql.NVarChar(sql.MAX), eksikler)
      .input('durum', sql.NChar(10), durum || null)
      .query(`UPDATE eksikler SET eksikler = @eksikler, durum = @durum WHERE Kimlik = @id`);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.json({ success: false });
  }
});
// TÜM EKSİKLER RAPORU İÇİN
app.get('/api/eksik-liste', authenticateToken, async (req, res) => {
  let kimlikid = parseInt(req.query.kimlikid);
  if (isNaN(kimlikid)) return res.json([]);

  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('kimlikid', sql.Int, kimlikid)
      .query(`
        SELECT Kimlik, eksikler, tarih, durum, kullanıcı 
        FROM eksikler 
        WHERE Kimlikid = @kimlikid 
        ORDER BY tarih DESC
      `);
    res.json(result.recordset);
  } catch (err) {
    console.error("Eksik listeleme hatası:", err.message);
    res.json([]);
  }
});
// TÜM EKSİKLER RAPORU İÇİN ENDPOINT
app.get('/api/tum-eksikler', authenticateToken, async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .query(`
        SELECT 
          e.Kimlik AS eksikId,
          e.eksikler,
          e.tarih,
          e.durum,
          e.kullanıcı,
          cd.[Adı Soyadı] AS adsoyad,
          cd.[Tc Kimlik No] AS tc,
          db.dilekçeno
        FROM eksikler e
        INNER JOIN çksdilekçe cd ON e.Kimlikid = cd.kimlik
        LEFT JOIN dilekçebilgileri db ON cd.kimlik = db.kimlikid
        ORDER BY e.tarih DESC
      `);
    res.json(result.recordset);
  } catch (err) {
    console.error("Tüm eksikler hatası:", err.message);
    res.json([]);
  }
});
// ÇKS İSTATİSTİKLERİ
// ÇKS İSTATİSTİKLERİ – KESİN ÇALIŞIR
// ÇKS İSTATİSTİKLERİ – KESİN ÇALIŞIR
app.get('/api/cks-istatistik', authenticateToken, async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT 
        COUNT(*) AS toplam,
        SUM(CASE WHEN çks = 'YAPILDI' THEN 1 ELSE 0 END) AS yapildi
      FROM dilekçebilgileri
    `);

    const row = result.recordset[0] || { toplam: 0, yapildi: 0 };
    const bekleyen = row.toplam - row.yapildi;

    res.json({
      toplam: row.toplam,
      yapildi: row.yapildi,
      bekleyen: bekleyen
    });
  } catch (err) {
    console.error("İstatistik hatası:", err.message);
    res.json({ toplam: 0, yapildi: 0, bekleyen: 0 });
  }
});
// DETAYLI ÇKS İSTATİSTİKLERİ (PERSONEL GRUPLU – KESİN ÇALIŞIR)
// DETAYLI ÇKS İSTATİSTİKLERİ (PERSONEL TABLOLARI DOLU GELECEK – KESİN!)
app.get('/api/cks-istatistik-detayli', authenticateToken, async (req, res) => {
  try {
    const pool = await getPool();
    const aktifYil = req.query.yil || '2026';

    // 1. Genel istatistikler
    const genelResult = await pool.request()
      .input('yil', aktifYil)
      .query(`
        SELECT 
          COUNT(*) AS toplam,
          SUM(CASE WHEN LTRIM(RTRIM(ISNULL(çks,''))) = 'YAPILDI' THEN 1 ELSE 0 END) AS yapildi
        FROM dilekçebilgileri
        WHERE yil = @yil
      `);

    // 2. Belgenet Toplam Tarama Sayısı
    const toplamTaramaResult = await pool.request()
      .input('yil', aktifYil)
      .query(`SELECT COUNT(*) AS toplamTarama FROM belgenet WHERE yil = @yil`);

    const genel = genelResult.recordset[0];
    const toplam = genel.toplam || 0;
    const yapildi = genel.yapildi || 0;
    const bekleyen = toplam - yapildi;
    const toplamTarama = toplamTaramaResult.recordset[0].toplamTarama || 0;

    // 3. Dosya Kabul Sayısı
    const kabulResult = await pool.request()
      .input('yil', aktifYil)
      .query(`
        SELECT 
          ISNULL(LTRIM(RTRIM(kullanıcıı)), 'BİLİNMEYEN') AS kullanıcı,
          COUNT(*) AS sayi
        FROM dilekçebilgileri
        WHERE yil = @yil
        GROUP BY kullanıcıı
        HAVING ISNULL(LTRIM(RTRIM(kullanıcıı)), '') != ''
        ORDER BY sayi DESC
      `);

    // 4. ÇKS Veri Girişi
    const cksResult = await pool.request()
      .input('yil', aktifYil)
      .query(`
        SELECT 
          ISNULL(LTRIM(RTRIM(çkskullanıcıı)), 'BİLİNMEYEN') AS kullanıcı,
          COUNT(*) AS sayi
        FROM dilekçebilgileri
        WHERE yil = @yil
        GROUP BY çkskullanıcıı
        HAVING ISNULL(LTRIM(RTRIM(çkskullanıcıı)), '') != ''
        ORDER BY sayi DESC
      `);

    // 5. YENİ: EVRAK TARAMA (kullanıcı kolonuna göre)
    const taramaResult = await pool.request()
      .input('yil', aktifYil)
      .query(`
        SELECT 
          ISNULL(LTRIM(RTRIM(kullanıcı)), 'BİLİNMEYEN') AS kullanıcı,
          COUNT(*) AS sayi
        FROM belgenet
        WHERE yil = @yil
        GROUP BY kullanıcı
        HAVING ISNULL(LTRIM(RTRIM(kullanıcı)), '') != ''
        ORDER BY sayi DESC
      `);

    // 6. YENİ: BELGENET GİRİŞ (bkullanici kolonuna göre)
    const belgenetResult = await pool.request()
      .input('yil', aktifYil)
      .query(`
        SELECT 
          ISNULL(LTRIM(RTRIM(bkullanici)), 'BİLİNMEYEN') AS kullanıcı,
          COUNT(*) AS sayi
        FROM belgenet
        WHERE yil = @yil
        GROUP BY bkullanici
        HAVING ISNULL(LTRIM(RTRIM(bkullanici)), '') != ''
        ORDER BY sayi DESC
      `);

    // Sonuçları birleştirip 4 ayrı liste halinde gönderiyoruz
    res.json({
      genel: {
        toplam: toplam,
        yapildi: yapildi,
        bekleyen: bekleyen,
        toplamTarama: toplamTarama
      },
      kabul: kabulResult.recordset,
      cks: cksResult.recordset,
      tarama: taramaResult.recordset,     // 3. Sütun (Evrak Tarama)
      belgenet: belgenetResult.recordset  // 4. Sütun (Belgenet Giriş)
    });

  } catch (err) {
    console.error("Detaylı istatistik hatası:", err.message);
    res.json({
      genel: { toplam: 0, yapildi: 0, bekleyen: 0, toplamTarama: 0 },
      kabul: [],
      cks: [],
      tarama: [],
      belgenet: []
    });
  }
});
// TKGM girilmeyen sayısı için basit endpoint (istatistik için)
app.get('/api/tkgm-girilmeyen-sayi', authenticateToken, async (req, res) => {
    try {
        const pool = await getPool();
        const aktifYil = req.query.yil || '2026';

        const result = await pool.request()
            .input('yil', aktifYil)
            .query(`
                SELECT COUNT(*) AS tkgm_girilmeyen
                FROM dilekçebilgileri
                WHERE 
                    yil = @yil 
                    
                    AND (
                        -- TKGM alanı boş olanlar
                        tkgm IS NULL OR LEN(LTRIM(RTRIM(REPLACE(REPLACE(CAST(tkgm AS NVARCHAR(MAX)), CHAR(10), ''), CHAR(13), '')))) = 0
                    )
            `);
        
        res.json({ tkgm_girilmeyen: result.recordset[0].tkgm_girilmeyen || 0 });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// PASİF ARAZİLER ARAMA – SON VE EN ESNEK VERSİYON
app.get('/api/pasif-araziler', authenticateToken, async (req, res) => {
  try {
    const pool = await getPool();

    let query = `
      SELECT 
        c.[Tc Kimlik No] AS tc,
        c.[Adı Soyadı] AS adsoyad,
        c.[Baba Adı] AS babaadi,
        c.[Doğum Tarihi] AS dogumtarihi,
        ISNULL(LTRIM(RTRIM(a.il)), '') AS il,
        LTRIM(RTRIM(a.ilçe)) AS ilce,
        LTRIM(RTRIM(a.mahalle)) AS mahalle,
        LTRIM(RTRIM(a.ada)) AS ada,
        LTRIM(RTRIM(a.parsel)) AS parsel,
        a.tur,
        ISNULL(d.dilekçeno, '-') AS dilekceNo
      FROM arazic a
      LEFT JOIN çksdilekçe c ON a.kimlikid = c.kimlik
      LEFT JOIN dilekçebilgileri d ON c.kimlik = d.kimlikid
      WHERE 1=1
    `;

    const request = pool.request();

    // İl
    if (req.query.il?.trim()) {
      query += ` AND LTRIM(RTRIM(a.il)) LIKE @il`;
      request.input('il', sql.NVarChar, `%${req.query.il.trim()}%`);
    }

    // İlçe
    if (req.query.ilce?.trim()) {
      query += ` AND LTRIM(RTRIM(a.ilçe)) LIKE @ilce`;
      request.input('ilce', sql.NVarChar, `%${req.query.ilce.trim()}%`);
    }

    // Mahalle
    if (req.query.mahalle?.trim()) {
      query += ` AND LTRIM(RTRIM(a.mahalle)) LIKE @mahalle`;
      request.input('mahalle', sql.NVarChar, `%${req.query.mahalle.trim()}%`);
    }

    // Ada
    if (req.query.ada?.trim() !== undefined && req.query.ada.trim() !== '') {
      query += ` AND LTRIM(RTRIM(a.ada)) LIKE @ada`;
      request.input('ada', sql.NVarChar, `%${req.query.ada.trim()}%`);
    }

    // Parsel
    if (req.query.parsel?.trim() !== undefined && req.query.parsel.trim() !== '') {
      query += ` AND LTRIM(RTRIM(a.parsel)) LIKE @parsel`;
      request.input('parsel', sql.NVarChar, `%${req.query.parsel.trim()}%`);
    }

    // İsim arama (TC veya Ad Soyad)
    if (req.query.isim?.trim()) {
      const isimVal = req.query.isim.trim();
      query += ` AND (
        c.[Tc Kimlik No] LIKE @isimTC 
        OR c.[Adı Soyadı] LIKE @isimAd
      )`;
      request.input('isimTC', sql.NVarChar, `%${isimVal}%`);
      request.input('isimAd', sql.NVarChar, `%${isimVal}%`);
    }

    query += ` ORDER BY a.ilçe, a.mahalle, TRY_CAST(a.ada AS INT), TRY_CAST(a.parsel AS INT)`;

    const result = await request.query(query);
    res.json(result.recordset);

  } catch (err) {
    console.error("Pasif arazi arama hatası:", err.message);
    res.status(500).json([]);
  }
});

// TKGM notu dolu olanları listele
app.get('/api/tkgm-eksik-liste', authenticateToken, async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT 
        d.kimlikid AS ciftci_id,
        c.[Tc Kimlik No], 
        c.[Adı Soyadı], 
        c.[Baba Adı], 
        c.[Doğum Tarihi], 
        d.dilekçeno, 
        d.çks,
        d.tkgm,
        d.başvurutarihi
      FROM dilekçebilgileri d
      INNER JOIN çksdilekçe c ON d.kimlikid = c.Kimlik
      WHERE 
        -- Daha güvenli boşluk/NULL kontrolü (TEXT veri tiplerinde çökmez)
        d.tkgm IS NULL OR CAST(d.tkgm AS NVARCHAR(MAX)) = '' OR CAST(d.tkgm AS NVARCHAR(MAX)) = ' '
      ORDER BY d.dilekçeno DESC
    `);
    
    res.json(result.recordset || []);
  } catch (err) {
    // Siyah ekrana hatanın asıl sebebini yazar
    console.error("TKGM eksik liste hatası:", err.message);
    res.status(500).json({ error: "Veri çekilemedi", detay: err.message });
  }
});

// Sadece TKGM güncelleme için basit endpoint
app.post('/api/v2-tkgm-guncelle', authenticateToken, async (req, res) => {
  const { ciftci_id, yeni_metin } = req.body;

  if (!ciftci_id) return res.json({ success: false });

  try {
    const pool = await getPool();
    await pool.request()
      .input('kimlik', sql.Int, ciftci_id)
      .input('tkgm', sql.NVarChar, yeni_metin || null)
      .query("UPDATE dilekçebilgileri SET tkgm = @tkgm WHERE kimlikid = @kimlik");

    res.json({ success: true });
  } catch (err) {
    console.error("TKGM güncelleme hatası:", err);
    res.json({ success: false });
  }
});

//belgenet
// Taranmayanlar (belgenette kimlikid'si hiç olmayan çiftçiler)
// Taranmayanlar (belgenette kimlikid'si olmayanlar)
// Tarananlar (belgenette kaydı olanlar + dosyadı)

// ÇKS YAPILMAYANLAR LİSTESİ
app.get('/api/cks-eksik-liste', authenticateToken, async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT 
        d.kimlikid AS ciftci_id,
        c.[Tc Kimlik No], 
        c.[Adı Soyadı], 
        c.[Baba Adı], 
        c.[Doğum Tarihi], 
        d.dilekçeno, 
        d.çks,
        d.tkgm,
        d.başvurutarihi,
        d.nott,
        d.kullanıcıı
      FROM dilekçebilgileri d
      INNER JOIN çksdilekçe c ON d.kimlikid = c.Kimlik
      WHERE 
        -- Sadece ÇKS alanı boş veya NULL olanları getirir
        d.çks IS NULL OR CAST(d.çks AS NVARCHAR(MAX)) = '' OR CAST(d.çks AS NVARCHAR(MAX)) = ' '
      ORDER BY d.dilekçeno DESC
    `);
    
    res.json(result.recordset || []);
  } catch (err) {
    console.error("ÇKS eksik liste hatası:", err.message);
    res.status(500).json({ error: "Veri çekilemedi", detay: err.message });
  }
});


app.get('/api/taranan-dilekceler', async (req, res) => {
  try {
    const pool = await getPool();
    
let sorgu = `
      SELECT DISTINCT 
        c.kimlik,
        c.[Tc Kimlik No] AS tc,
        c.vergino,          -- 🎯 EKLENDİ (Şirketleri bulmak için)
        c.tur,              -- 🎯 EKLENDİ (Tüzel yazısını bulmak için)
        c.[Adı Soyadı] AS adsoyad,
        c.[Doğum Tarihi] AS dogumtarihi,
        d.dilekçeno,
        b.kimlik as bkimlik,
        b.sayfasayısı as sayfasayisi,
        b.belgenetno as belgenetnoo,
        b.dosyadı,
        b.bkullanici,
        k.PC_IP 
      FROM çksdilekçe c
      INNER JOIN dilekçebilgileri d ON c.kimlik = d.kimlikid
      INNER JOIN belgenet b ON c.kimlik = b.kimlikid
      LEFT JOIN Kullanicilar k ON 
        REPLACE(REPLACE(REPLACE(LTRIM(RTRIM(UPPER(b.bkullanici))), 'I', 'İ'), ' ', ''), 'İ', 'I') = 
        REPLACE(REPLACE(REPLACE(LTRIM(RTRIM(UPPER(k.Ad + k.Soyad))), 'I', 'İ'), ' ', ''), 'İ', 'I')
      WHERE (b.belgenetno = 0 OR b.belgenetno = '0')
    `;

    const result = await pool.request().query(sorgu);
    res.json(result.recordset || []);
    
  } catch (err) {
    console.error("Tarananlar hatası:", err.message);
    res.status(500).json({ error: "Veritabanı hatası oluştu" });
  }
});
// Sunucu Tarafı (Server.js)

// Detay (tek kimlik için tüm kayıtlar + dosyadı)
// server.js içindeki ilgili kısmı şu şekilde güncelle:
// Detayları getiren endpoint
app.get('/api/belgenet-detay/:kimlik', authenticateToken, async (req, res) => {
    const kimlik = req.params.kimlik;
    try {
        const pool = await getPool();
        const result = await pool.request()
            .input('kimlik', sql.Int, kimlik)
            .query(`
                SELECT 
                    ISNULL(CAST(belgenetno AS NVARCHAR(50)), '-') AS belgenet_no,
                    ISNULL(CAST(sayfasayısı AS INT), 0) AS sayfasayisi,
                    CONVERT(varchar, tarih, 104) AS tarih_tr,
                    ISNULL(kullanıcı, '-') AS kullanici,
                    ISNULL(dosyadı, '-') AS dosyadi,
                    ISNULL(bkullanici, '-') AS bkullanici, -- YENİ: Belgenet Personeli
                    CONVERT(varchar, belgenettarihi, 104) AS belgenettarihi_tr, -- YENİ: Belgenet Tarihi
                    yil 
                FROM belgenet
                WHERE kimlikid = @kimlik
                ORDER BY yil DESC, tarih ASC -- Eskiden yeniye doğru sıralar (1. Ek, 2. Ek gibi)
            `);

        res.json(result.recordset || []);
    } catch (err) {
        console.error("Detay hatası:", err.message);
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/belgenet-guncelle/:id', authenticateToken, async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const { belgenetno, sayfasayisi, belgenettarihi } = req.body; 

        // İŞTE BURASI: Token üzerinden giriş yapan kişinin adını-soyadını alıyoruz
        const islemYapan = req.user ? (req.user.ad + ' ' + req.user.soyad).trim() : 'Bilinmiyor';

        const pool = await getPool();
        const result = await pool.request()
            .input('id', sql.Int, id)
            .input('bNo', sql.NVarChar, belgenetno)
            .input('sSayisi', sql.Int, sayfasayisi)
            .input('bTarih', sql.DateTime, belgenettarihi)
            .input('bKul', sql.NVarChar, islemYapan) // Yeni Parametre
            .query(`
                UPDATE belgenet 
                SET belgenetno = @bNo, 
                    sayfasayısı = @sSayisi,
                    belgenettarihi = @bTarih,
                    bkullanici = @bKul -- Girişi yapan personeli yazıyoruz
                WHERE kimlik = @id
            `);

        if (result.rowsAffected[0] > 0) {
            res.json({ success: true, message: "Kayıt tarih ve personelle birlikte güncellendi." });
        } else {
            res.status(404).json({ success: false, message: "Kayıt bulunamadı." });
        }
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.get('/api/belgenet-istatistik', authenticateToken, async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request().query(`
            SELECT 
                COUNT(CASE WHEN belgenetno <> '0' AND belgenetno IS NOT NULL THEN 1 END) as girilen,
                COUNT(CASE WHEN belgenetno = '0' OR belgenetno IS NULL THEN 1 END) as girilmeyen,
                -- Bugün girilenleri sayan yeni satır:
                COUNT(CASE WHEN CAST(belgenettarihi AS DATE) = CAST(GETDATE() AS DATE) 
                           AND belgenetno <> '0' 
                           AND belgenetno IS NOT NULL THEN 1 END) as bugunGirilen
            FROM belgenet
        `);
        
        res.json({
            success: true,
            girilen: result.recordset[0].girilen,
            girilmeyen: result.recordset[0].girilmeyen,
            bugunGirilen: result.recordset[0].bugunGirilen // Bu yeni değer
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// --- BELGENET VE PDF SİSTEMİ ---
// Paket: /taramalar ckspaket kökünden (ana CKS __dirname static kullanır)
app.use('/taramalar', (req, res, next) => {
  const kok = taramaKokYol(sistemAyarAl());
  express.static(kok)(req, res, next);
});
// Not: /taramalar/... PDF'leri express.static(__dirname) ile c:\cks\taramalar üzerinden sunulur.

function pdfArsivKokAdaylari() {
    const sa = sistemAyarAl();
    const birincil = taramaKokYol(sa);
    const adaylar = [birincil, path.join(gercekKlasorErken, 'taramalar'), 'C:\\CKS\\taramalar'];
    const paket = 'C:\\ckspaket\\taramalar';
    if (fs.existsSync(paket)) adaylar.push(paket);
    const seen = new Set();
    return adaylar.filter((k) => {
        const key = String(k || '').toLowerCase();
        if (!key || seen.has(key) || !fs.existsSync(k)) return false;
        seen.add(key);
        return true;
    });
}

function pdfArsivDosyaBul(dosyaAdi) {
    const ad = decodeURIComponent(String(dosyaAdi || '').trim());
    if (!ad) return null;
    try {
        const havuzDosya = path.join(taramaHavuzYol(sistemAyarAl()), ad);
        if (fs.existsSync(havuzDosya)) return havuzDosya;
    } catch (_) {}
    for (const kok of pdfArsivKokAdaylari()) {
        try {
            const altKlasorler = fs.readdirSync(kok).filter((file) =>
                fs.statSync(path.join(kok, file)).isDirectory()
            );
            for (const klasor of altKlasorler) {
                const tamYol = path.join(kok, klasor, ad);
                if (fs.existsSync(tamYol)) return tamYol;
            }
            const direkYol = path.join(kok, ad);
            if (fs.existsSync(direkYol)) return direkYol;
        } catch (_) {}
    }
    return null;
}

// --- AKILLI PDF BULUCU (Yıl Klasörlerini Otomatik Tarar) ---
app.get('/pdf-arsivi/:dosya', (req, res) => {
    const dosyaAdi = req.params.dosya;
    const tamYol = pdfArsivDosyaBul(dosyaAdi);
    if (tamYol) return res.sendFile(tamYol);
    console.log('❌ PDF Bulunamadı:', dosyaAdi, '| aranan:', pdfArsivKokAdaylari().join(', '));
    res.status(404).send('Dosya bulunamadı.');
});

// 2. Taranmayan Dilekçeleri Getir
app.get('/api/taranmayan-dilekceler', authenticateToken, async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request().query(`
            SELECT c.kimlik, c.[Adı Soyadı] as adsoyad, d.dilekçeno, c.[Tc Kimlik No] as tc,c.[Baba Adı] as baba,c.[Doğum Tarihi] as dogum
            FROM çksdilekçe c
            INNER JOIN dilekçebilgileri d ON c.kimlik = d.kimlikid
            WHERE NOT EXISTS (SELECT 1 FROM belgenet b WHERE b.kimlikid = c.kimlik)
            ORDER BY d.dilekçeno ASC
        `);
        res.json(result.recordset);
    } catch (err) { res.status(500).json([]); }
});

// LISTE ENDPOINTI
app.get('/api/tarama-listesi', authenticateToken, async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request().query(`
            SELECT c.kimlik, c.[Adı Soyadı] as adsoyad, d.dilekçeno, c.[Tc Kimlik No] as tc, 
                   c.[Baba Adı] as baba, c.[Doğum Tarihi] as dogum
            FROM çksdilekçe c
            INNER JOIN dilekçebilgileri d ON c.kimlik = d.kimlikid
            WHERE NOT EXISTS (SELECT 1 FROM belgenet b WHERE b.kimlikid = c.kimlik)
            ORDER BY d.dilekçeno ASC
        `);
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json([]);
    }
});

// SAYAC ENDPOINTI
app.get('/api/tarama-sayaclar', authenticateToken, async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request().query(`
            SELECT 
                (SELECT COUNT(*) FROM belgenet) as ToplamTaranan,
                
                -- Bugün tarananlar (Saat farketmeksizin sadece GÜN karşılaştırması)
                (SELECT COUNT(*) FROM belgenet 
                 WHERE CONVERT(DATE, tarih) = CONVERT(DATE, GETDATE())) as BugunTaranan,
                
                (SELECT COUNT(*) FROM çksdilekçe c 
                 WHERE NOT EXISTS (SELECT 1 FROM belgenet b WHERE b.kimlikid = c.kimlik)) as Kalan
        `);
        
        res.json(result.recordset[0]);
    } catch (err) {
        console.error("Sayaç Hatası:", err);
        res.status(500).json({ ToplamTaranan: 0, BugunTaranan: 0, Kalan: 0 });
    }
});


// BELGENET KAYIT VE TARAMA İŞLEMİ
// BELGENET KAYIT VE TARAMA İŞLEMİ (Önizleme Destekli)
// BELGENET KAYIT VE TARAMA İŞLEMİ (Önizleme Destekli)
// ==========================================
// BELGENET KAYIT VE TARAMA İŞLEMİ (HAVUZ MANTIĞI)
// ==========================================
// ==========================================
// BELGENET KAYIT VE TARAMA İŞLEMİ (ORİJİNAL SİSTEM)
// ==========================================

function belgenetRegexKacis(s) {
    return String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function belgenetDosyaAdiSay(dosyaAdi, yilOnEk, prefix, anaAd, ekRegex, durum) {
    const d = String(dosyaAdi || '').replace(/\.pdf$/i, '').trim();
    if (!d.startsWith(`${yilOnEk}-`)) return;
    if (!d.startsWith(prefix)) return;
    if (d === anaAd) {
        durum.hasMain = true;
        return;
    }
    const m = d.match(ekRegex);
    if (m) durum.maxEk = Math.max(durum.maxEk, parseInt(m[1], 10));
}

async function belgenetSonrakiDosyaAdiOlustur(pool, kimlikid, aktifYil, dilekçeno, gecerliKimlikNo, arsivKlasor = null) {
    const yilOnEk = String(aktifYil);
    const yilNum = parseInt(yilOnEk, 10) || new Date().getFullYear();
    const prefix = `${yilOnEk}-${dilekçeno}-`;
    const anaAd = `${prefix}${gecerliKimlikNo}`;
    const ekRegex = new RegExp(`^${belgenetRegexKacis(prefix)}EK-(\\d+)-${belgenetRegexKacis(gecerliKimlikNo)}$`, 'i');

    const r = await pool.request()
        .input('kid', sql.Int, kimlikid)
        .input('yil', sql.SmallInt, yilNum)
        .input('yilStr', sql.NVarChar, yilOnEk)
        .input('pfx', sql.NVarChar, prefix + '%')
        .query(`
            SELECT dosyadı FROM belgenet
            WHERE kimlikid = @kid
              AND yil = @yil
              AND dosyadı IS NOT NULL
              AND dosyadı LIKE @pfx
              AND LEFT(dosyadı, 4) = @yilStr
        `);

    const durum = { hasMain: false, maxEk: 0 };
    for (const row of r.recordset) {
        belgenetDosyaAdiSay(row.dosyadı, yilOnEk, prefix, anaAd, ekRegex, durum);
    }

    if (arsivKlasor && fs.existsSync(arsivKlasor)) {
        for (const f of fs.readdirSync(arsivKlasor)) {
            if (!f.toLowerCase().endsWith('.pdf')) continue;
            belgenetDosyaAdiSay(f.replace(/\.pdf$/i, ''), yilOnEk, prefix, anaAd, ekRegex, durum);
        }
    }

    if (!durum.hasMain) {
        return anaAd;
    }
    return `${prefix}EK-${durum.maxEk + 1}-${gecerliKimlikNo}`;
}

function kullaniciTaramaOnEkleri(user) {
    return [...new Set(
        [user?.kullaniciadi, user?.ad, user?.KullaniciAdi, user?.Ad]
            .map((s) => String(s || '').trim())
            .filter(Boolean)
    )];
}

function trKucukMetin(s) {
    try { return String(s).toLocaleLowerCase('tr-TR'); } catch (_) { return String(s).toLowerCase(); }
}

function havuzPdfKullaniciyaAit(dosyaAdi, user) {
    if (!/\.pdf$/i.test(dosyaAdi)) return false;
    const dosya = trKucukMetin(dosyaAdi);
    return kullaniciTaramaOnEkleri(user).some((onEk) => dosya.startsWith(trKucukMetin(onEk)));
}

function havuzEnYeniKullaniciPdf(dosyalar, havuzYol, user) {
    let secilen = null;
    let enYeni = 0;
    for (const f of dosyalar) {
        if (!havuzPdfKullaniciyaAit(f, user)) continue;
        try {
            const mt = fs.statSync(path.join(havuzYol, f)).mtimeMs;
            if (!secilen || mt > enYeni) { secilen = f; enYeni = mt; }
        } catch (_) {
            if (!secilen) secilen = f;
        }
    }
    return secilen;
}

function havuzKullaniciPdfListesi(dosyalar, havuzYol, user) {
    const liste = [];
    for (const f of dosyalar) {
        if (!havuzPdfKullaniciyaAit(f, user)) continue;
        try {
            const fp = path.join(havuzYol, f);
            const st = fs.statSync(fp);
            liste.push({ dosya: f, mtime: st.mtimeMs, boyut: st.size });
        } catch (_) { /* atla */ }
    }
    return liste.sort((a, b) => b.mtime - a.mtime);
}

async function pdfIlkSayfaOnizleme(pdfYol) {
    const dataBuffer = fs.readFileSync(pdfYol);
    const pdfDoc = await PDFDocument.load(dataBuffer, { ignoreEncryption: true });
    const sayfa = pdfDoc.getPageCount();
    const previewDoc = await PDFDocument.create();
    const [firstPage] = await previewDoc.copyPages(pdfDoc, [0]);
    previewDoc.addPage(firstPage);
    const onizleme = await previewDoc.saveAsBase64({ dataUri: true });
    return { onizleme, sayfa };
}

async function pdfSayfaSayisiOku(pdfYol) {
    try {
        const dataBuffer = fs.readFileSync(pdfYol);
        const pdfDoc = await PDFDocument.load(dataBuffer, { ignoreEncryption: true });
        return pdfDoc.getPageCount();
    } catch (_) {
        return 0;
    }
}

app.get('/api/tarama-havuz-pdf/:dosya', authenticateToken, (req, res) => {
    try {
        const guvenli = path.basename(decodeURIComponent(req.params.dosya || ''));
        if (!guvenli || !havuzPdfKullaniciyaAit(guvenli, req.user)) {
            return res.status(403).json({ success: false, message: 'Bu dosyaya erişim yok.' });
        }
        const havuz = taramaHavuzYol(sistemAyarAl());
        const fp = path.join(havuz, guvenli);
        if (!fs.existsSync(fp)) {
            return res.status(404).json({ success: false, message: 'Dosya bulunamadı.' });
        }
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${guvenli.replace(/"/g, '')}"`);
        fs.createReadStream(fp).pipe(res);
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.get('/api/tarama-havuz-listesi', authenticateToken, async (req, res) => {
    try {
        const sa = sistemAyarAl();
        const havuz = taramaHavuzYol(sa);
        if (!fs.existsSync(havuz)) fs.mkdirSync(havuz, { recursive: true });

        const dosyalar = fs.readdirSync(havuz);
        const liste = havuzKullaniciPdfListesi(dosyalar, havuz, req.user);
        const onEkler = kullaniciTaramaOnEkleri(req.user);

        if (!liste.length) {
            const ornek = onEkler[0] || 'kullaniciadi';
            return res.json({
                success: false,
                message: `ORTAK HAVUZDA İSMİNİZE AİT PDF YOK! Dosya adı şunlardan biriyle başlamalı: ${onEkler.join(', ') || 'kullaniciadi'} (ör. ${ornek}.pdf). Havuz: ${havuz}`,
                dosyalar: []
            });
        }

        const sonuc = [];
        const tumListe = req.query.tum === '1' || req.query.tum === 'true';
        const kaynak = tumListe ? liste : liste.slice(0, 12);
        for (const item of kaynak) {
            const fp = path.join(havuz, item.dosya);
            const sayfa = await pdfSayfaSayisiOku(fp);
            sonuc.push({
                dosya: item.dosya,
                tarih: new Date(item.mtime).toLocaleString('tr-TR'),
                mtime: item.mtime,
                boyutKb: Math.round(item.boyut / 1024),
                sayfa,
                onizlemeUrl: `/pdf-arsivi/${encodeURIComponent(item.dosya)}`
            });
        }

        return res.json({
            success: true,
            havuzYol: havuz,
            havuzAdi: sa.taramaHavuzAdi || 'ckstaramalar',
            onEkler,
            toplam: liste.length,
            dosyalar: sonuc
        });
    } catch (err) {
        console.error('tarama-havuz-listesi:', err.message);
        return res.status(500).json({ success: false, message: err.message });
    }
});

app.delete('/api/tarama-havuz-pdf/:dosya', authenticateToken, (req, res) => {
    try {
        const guvenli = path.basename(decodeURIComponent(req.params.dosya || ''));
        if (!guvenli || !/\.pdf$/i.test(guvenli)) {
            return res.status(400).json({ success: false, message: 'Geçersiz dosya adı.' });
        }
        if (!havuzPdfKullaniciyaAit(guvenli, req.user)) {
            return res.status(403).json({ success: false, message: 'Bu dosyayı silme yetkiniz yok.' });
        }
        const havuz = taramaHavuzYol(sistemAyarAl());
        const fp = path.join(havuz, guvenli);
        if (!fs.existsSync(fp)) {
            return res.status(404).json({ success: false, message: 'Dosya bulunamadı.' });
        }
        fs.unlinkSync(fp);
        res.json({ success: true, message: 'PDF silindi.' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/belgenet-ekle', authenticateToken, async (req, res) => {
    const { kimlikid, yil, havuzDosya } = req.body;
    
    // 1. ZIRHLI KULLANICI KONTROLÜ (Trim hatasını kökten çözer)
    const kullanici = req.user ? (req.user.ad + ' ' + req.user.soyad).trim() : 'Sistem';
    const taramaOnEkleri = kullaniciTaramaOnEkleri(req.user);

    try {
        const pool = await getPool();
        const yilNum = parseInt(String(yil || new Date().getFullYear()), 10);
        const aktifYil = yilNum;

        // Çiftçi / Şirket Bilgilerini Al (yalnizca secili yil dilekcesi)
        const info = await pool.request()
            .input('kid', sql.Int, kimlikid)
            .input('yil', sql.SmallInt, yilNum)
            .query(`SELECT TOP 1 c.[Tc Kimlik No] as tc, c.vergino, c.tur, d.dilekçeno 
                    FROM çksdilekçe c 
                    INNER JOIN dilekçebilgileri d ON c.kimlik = d.kimlikid AND d.yil = @yil
                    WHERE c.kimlik = @kid`);

        if (info.recordset.length === 0) {
            return res.json({ success: false, message: `${yilNum} yili icin dilekce kaydi bulunamadi!` });
        }
        
        const { tc, vergino, tur, dilekçeno } = info.recordset[0];

        // AKILLI KİMLİK SEÇİCİ
        const isTuzel = (tur && tur.toUpperCase().includes('TUZEL')) || (!tc && vergino);
        const gecerliKimlikNo = isTuzel ? (vergino ? vergino.toString().trim() : '') : (tc ? tc.toString().trim() : '');

        if (!gecerliKimlikNo) {
            return res.json({ success: false, message: "Hata: Kişinin TC veya Vergi Numarası sistemde kayıtlı değil!" });
        }

        const sa = sistemAyarAl();
        const TARAMA_HAVUZU = taramaHavuzYol(sa);
        const HEDEF_KLASOR = taramaYilKlasorYol(sa, aktifYil);

        if (!fs.existsSync(TARAMA_HAVUZU)) fs.mkdirSync(TARAMA_HAVUZU, { recursive: true });
        if (!fs.existsSync(HEDEF_KLASOR)) fs.mkdirSync(HEDEF_KLASOR, { recursive: true });

        const dosyalar = fs.readdirSync(TARAMA_HAVUZU);
        const kullaniciListesi = havuzKullaniciPdfListesi(dosyalar, TARAMA_HAVUZU, req.user);
        let taramaDosyasi = null;

        if (havuzDosya) {
            const guvenli = path.basename(String(havuzDosya));
            if (!havuzPdfKullaniciyaAit(guvenli, req.user)) {
                return res.json({ success: false, message: 'Seçilen dosya size ait değil veya geçersiz.' });
            }
            const tamYol = path.join(TARAMA_HAVUZU, guvenli);
            if (!fs.existsSync(tamYol)) {
                return res.json({ success: false, message: 'Seçilen dosya havuzda bulunamadı (başka biri almış olabilir).' });
            }
            taramaDosyasi = guvenli;
        } else if (kullaniciListesi.length === 1) {
            taramaDosyasi = kullaniciListesi[0].dosya;
        } else if (kullaniciListesi.length > 1) {
            return res.json({
                success: false,
                requiresSelection: true,
                adet: kullaniciListesi.length,
                message: `Havuzda size ait ${kullaniciListesi.length} tarama var. Lütfen önizlemeden birini seçin.`
            });
        }

        if (!taramaDosyasi) {
            const ornek = taramaOnEkleri[0] || 'kullaniciadi';
            return res.json({ 
                success: false, 
                message: `ORTAK HAVUZDA İSMİNİZE AİT PDF YOK! Dosya adı şunlardan biriyle başlamalı: ${taramaOnEkleri.join(', ') || 'kullaniciadi'} (ör. ${ornek}.pdf). Havuz: ${TARAMA_HAVUZU}` 
            });
        }

        const dosyadi = await belgenetSonrakiDosyaAdiOlustur(pool, kimlikid, aktifYil, dilekçeno, gecerliKimlikNo, HEDEF_KLASOR);
        //DNM
        let otomatikSayfaSayisi = 1;
        let ilkSayfaOnizleme = null;
        const eskiYol = path.join(TARAMA_HAVUZU, taramaDosyasi);
        const yeniYol = path.join(HEDEF_KLASOR, dosyadi + '.pdf');

        // 3. DOSYA TAŞIMA — başarısızsa DB kaydı yapılmaz
        try {
            fs.renameSync(eskiYol, yeniYol);
            await new Promise((resolve) => setTimeout(resolve, 500));
            if (!fs.existsSync(yeniYol)) {
                return res.json({ success: false, message: 'PDF arşive taşınamadı (dosya oluşmadı).' });
            }
            const dataBuffer = fs.readFileSync(yeniYol);
            const pdfDoc = await PDFDocument.load(dataBuffer);
            otomatikSayfaSayisi = pdfDoc.getPageCount();
            const previewDoc = await PDFDocument.create();
            const [firstPage] = await previewDoc.copyPages(pdfDoc, [0]);
            previewDoc.addPage(firstPage);
            ilkSayfaOnizleme = await previewDoc.saveAsBase64({ dataUri: true });
        } catch (innerErr) {
            console.error('PDF taşıma/önizleme hatası:', innerErr.message);
            return res.json({
                success: false,
                message: `PDF arşive taşınamadı: ${innerErr.message}. Veritabanına kayıt yapılmadı.`
            });
        }

        // 4. VERİTABANI KAYDI
        await pool.request()
            .input('kid', sql.Int, kimlikid)
            .input('dosya', sql.NVarChar, dosyadi)
            .input('kull', sql.NVarChar, kullanici)
            .input('yil', sql.SmallInt, yilNum)
            .input('sayfa', sql.Int, otomatikSayfaSayisi)
            .query(`
                INSERT INTO belgenet (kimlikid, sayfasayısı, tarih, kullanıcı, dosyadı, belgenetno, yil) 
                VALUES (@kid, @sayfa, GETDATE(), @kull, @dosya, 0, @yil)
            `);

        return res.json({ 
            success: true, 
            message: "Evrak başarıyla arşive taşındı ve kaydedildi.",
            dosyadi: dosyadi, 
            sayfasayısı: otomatikSayfaSayisi,
            onizleme: ilkSayfaOnizleme 
        });

    } catch (err) {
        console.error("GENEL HATA:", err.message);
        res.json({ success: false, message: "Sistem hatası: " + err.message });
    }
});
// =========================================================================
// 3️⃣ ŞİFRELİ EVRAK VE SQL KAYDI SİLME (C: DİSKİ UYUMLU)
// =========================================================================
app.post('/api/belgenet-sil', async (req, res) => {
    // 🚨 RADAR: HTML'den tam olarak ne gelmiş siyah ekranda görelim!
    console.log("📦 ARAYÜZDEN GELEN KARGO:", req.body);

    // Hem 'dosyaadi' hem 'dosyadı' ihtimaline karşı ikisini de alıyoruz
    const { dosyaadi, dosyadı, yil, sifre } = req.body;
    const yetkiliSifre = "Canbey10."; 

    // Hangisi doluysa onu kullan
    const gelenDosya = dosyaadi || dosyadı;

    if (sifre !== yetkiliSifre) return res.json({ success: false, message: "Hatalı şifre! Yetkiniz reddedildi." });
    if (!gelenDosya) return res.json({ success: false, message: "Dosya adı okunamadı." });

    const temizDosyaAdi = gelenDosya.replace('.pdf', '').trim();
    
    // 🧠 AKILLI YIL FİLTRESİ
    let aktifYil = new Date().getFullYear().toString(); 
    if (yil && yil !== '-' && yil !== 'undefined') {
        const yilString = yil.toString().trim();
        aktifYil = yilString.length >= 4 ? yilString.slice(-4) : yilString;
    }

    let dosyaSilindi = false; let sqlSilindi = false; let dosyaHataMesaji = "";

    try {
        const path = require('path');
        const dosyaYolu = path.join(taramaYilKlasorYol(sistemAyarAl(), aktifYil), `${temizDosyaAdi}.pdf`);
        
        if (fs.existsSync(dosyaYolu)) { 
            fs.unlinkSync(dosyaYolu); 
            console.log(`🗑️ DOSYA İMHA EDİLDİ: ${dosyaYolu}`);
            dosyaSilindi = true; 
        } else {
            console.log(`⚠️ DOSYA BULUNAMADI: ${dosyaYolu}`);
        }
    } catch (fileErr) { 
        dosyaHataMesaji = " (Fiziksel dosya bilgisayarda açık/kilitli olduğu için silinemedi)"; 
    }

    try {
        const pool = await getPool();
        // 🛡️ ZIRH: [dosyadı] köşeli parantez içine alındı ki SQL Türkçe karakterde çökmesin
        const result = await pool.request().input('hedefDosya', sql.NVarChar, temizDosyaAdi)
            .query(`DELETE FROM belgenet WHERE [dosyadı] = @hedefDosya OR [dosyadı] = @hedefDosya + '.pdf'`);

        if (result.rowsAffected[0] > 0) {
            console.log(`✅ SQL KAYDI SİLİNDİ: ${temizDosyaAdi}`);
            sqlSilindi = true;
        }

        if (sqlSilindi || dosyaSilindi) {
            res.json({ success: true, message: `Evrak başarıyla imha edildi!${dosyaHataMesaji}` });
        } else {
            res.json({ success: false, message: "Dosya veya kayıt bulunamadı." });
        }
    } catch (dbErr) { res.json({ success: false, message: "SQL Hatası: " + dbErr.message }); }
});
app.get('/api/ciftci-tum-bilgi/:kimlik', authenticateToken, async (req, res) => {
  const kimlik = parseInt(req.params.kimlik);
  if (isNaN(kimlik)) return res.status(400).json({ success: false });

  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('kimlik', sql.Int, kimlik)
      .query(`
        SELECT 
            c.kimlik,
            c.[Tc Kimlik No] AS tc,
            c.[Adı Soyadı] AS adsoyad,
            d.dilekçeno,
            d.çks,
            d.tkgm,
            b.belgenetno,
            b.sayfasayısı,
            b.dosyadı,
            b.tarih AS tarama_tarihi
        FROM çksdilekçe c
        LEFT JOIN dilekçebilgileri d ON c.kimlik = d.kimlikid
        LEFT JOIN belgenet b ON c.kimlik = b.kimlikid
        WHERE c.kimlik = @kimlik
        ORDER BY b.tarih DESC
      `);
    res.json({ success: true, data: result.recordset });
  } catch (err) {
    console.error("Bilgi çekme hatası:", err.message);
    res.status(500).json({ success: false });
  }
});

// Token doğrulama fonksiyonu
const verifyToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401).json({ message: "Yetkisiz erişim: Token bulunamadı" });

    // Burada kendi JWT secret anahtarınızı kullanmalısınız
    jwt.verify(token, 'GIZLI_ANAHTARINIZ', (err, user) => {
      console.log("JWT HATA DETAYI:", err.message);
        if (err) return res.status(403).json({ message: "Geçersiz Token" });
        req.user = user;
        next();
    });
};
// 'verifyToken' kısmını geçici olarak silerek dene
// Eski hali: app.get('/api/excel-listesi', verifyToken, async (req, res) => {
// Yeni hali (Bununla değiştir):
/** ÇKS tel listesi — 5 dk bellek önbelleği */
let telListesiCache = null;
let telListesiCacheZaman = 0;
const TEL_LISTE_CACHE_MS = 5 * 60 * 1000;

app.get('/api/tel-listesi', authenticateToken, async (req, res) => {
  try {
    const yenile = String(req.query.yenile || '') === '1';
    if (!yenile && telListesiCache && Date.now() - telListesiCacheZaman < TEL_LISTE_CACHE_MS) {
      return res.json(telListesiCache);
    }

    const pool = await getPool();
    const [listeRes, sayimRes] = await Promise.all([
      pool.request().query(`
        SELECT
          kimlik,
          [Adı Soyadı] AS adSoyad,
          [Tc Kimlik No] AS tc,
          ISNULL(vergino, '') AS vergino,
          ISNULL(tur, 'GERCEK') AS tur,
          ISNULL(İlçe, '') AS ilce,
          ISNULL([Köy/Mahalle], '') AS koy,
          LTRIM(RTRIM(CAST(Telefon AS NVARCHAR(30)))) AS telefon
        FROM [çksdilekçe] WITH (NOLOCK)
        WHERE Telefon IS NOT NULL
          AND LEN(LTRIM(RTRIM(CAST(Telefon AS NVARCHAR(30))))) >= 10
        ORDER BY [Adı Soyadı]
      `),
      pool.request().query(`SELECT COUNT(*) AS toplamCiftci FROM [çksdilekçe] WITH (NOLOCK)`)
    ]);

    const ham = listeRes.recordset || [];
    const liste = [];
    for (let i = 0; i < ham.length; i++) {
      const r = ham[i];
      const digits = String(r.telefon || '').replace(/\D/g, '');
      if (digits.length >= 10) liste.push(r);
    }

    const toplamCiftci = Number(sayimRes.recordset[0]?.toplamCiftci) || 0;
    const payload = {
      success: true,
      toplam: liste.length,
      toplamCiftci,
      liste,
      onbellek: true
    };
    telListesiCache = payload;
    telListesiCacheZaman = Date.now();
    res.json(payload);
  } catch (err) {
    console.error('/api/tel-listesi:', err.message);
    res.status(500).json({ success: false, message: err.message, liste: [], toplam: 0 });
  }
});

app.get('/api/excel-listesi', async (req, res) => { 
    try {
        const sqlQuery = `
            SELECT 
                çksdilekçe.il, 
                çksdilekçe.İlçe, 
                çksdilekçe.[Köy/Mahalle], 
                çksdilekçe.[Tc Kimlik No], 
                çksdilekçe.[Adı Soyadı], 
                dilekçebilgileri.dilekçeno,
                belgenet.belgenetno,
                belgenet.sayfasayısı, 
                -- Tarih Formatlama (Gün.Ay.Yıl):
                FORMAT(belgenet.belgenettarihi, 'dd.MM.yyyy') as belgenettarihi
            FROM çksdilekçe 
            RIGHT JOIN dilekçebilgileri ON çksdilekçe.Kimlik = dilekçebilgileri.kimlikid
            LEFT JOIN belgenet ON dilekçebilgileri.kimlikid = belgenet.kimlikid
            ORDER BY dilekçebilgileri.dilekçeno asc`;

        // MSSQL kullanıyorsan 'pool.request().query', MySQL kullanıyorsan 'pool.query' kullanılır
        const result = await pool.request().query(sqlQuery); 
        
        // MSSQL için sonuçlar genelde recordset içindedir
        const sonuc = result.recordset || [];
        res.json(sonuc);
        
    } catch (err) {
        console.error("Sorgu Hatası:", err);
        res.status(500).json({ error: "Veritabanı hatası: " + err.message });
    }
});


// Eski hali: app.post('/api/ciftci-guncelle', verifyToken, async (req, res) => {
// Yeni hali:
// GÜNCELLEME ROTASI (server.js içine)
// GÜNCELLEME ROTASI (Şahıs, Şirket ve Sicil Uyumlu - Hata Korumalı)
app.post('/api/ciftci-guncelle', async (req, res) => {
    // Hem eski hem yeni sayfalardan gelen TÜM olası parametreleri içeri alıyoruz
    const { 
        kimlikid, adsoyad, tc, vergino, tur, babaadi, dogumtarihi, 
        il, ilce, koymahalle, koy, tel, telefon, sicil 
    } = req.body;

    try {
        const request = pool.request();
        
        // --- ZEKİ EŞLEŞTİRMELER ---
        // Sayfaların birinden 'koy' diğerinden 'koymahalle' gelebilir, hangisi doluyse onu al
        const gercekKoy = koy || koymahalle || null;
        const gercekTel = telefon || tel || null;
        const gercekTur = tur || 'GERCEK';
        
        request.input('p_id', sql.Int, parseInt(kimlikid));
        request.input('p_ad', sql.NVarChar, adsoyad);
        request.input('p_tc', sql.NVarChar, tc || null);
        
        // YENİ: Vergi No ve Tür eklendi
        request.input('p_vergino', sql.NVarChar, vergino || null);
        request.input('p_tur', sql.NVarChar, gercekTur);
        
        // YENİ: Şirketlerde baba adı kutusu olmadığı için otomatik TÜZEL KİŞİ yazdırıyoruz
        request.input('p_baba', sql.NVarChar, (gercekTur === 'TUZEL') ? 'TÜZEL KİŞİ' : (babaadi || null));
        
        request.input('p_dogum', sql.NVarChar, dogumtarihi || null);
        request.input('p_il', sql.NVarChar, il || 'KONYA');
        request.input('p_ilce', sql.NVarChar, ilce || 'SARAYÖNÜ');
        request.input('p_koy', sql.NVarChar, gercekKoy);
        request.input('p_tel', sql.NVarChar, gercekTel);
        
        // SENİN EKLEDİĞİN SİCİL BURADA GÜVENDE
        request.input('p_sicil', sql.NVarChar, sicil || null);

        // SQL Sorgusuna vergino ve tur eklendi!
        const query = `
            UPDATE [çksdilekçe] 
            SET [Adı Soyadı] = @p_ad, 
                [Tc Kimlik No] = @p_tc, 
                vergino = @p_vergino,
                tur = @p_tur,
                [Baba Adı] = @p_baba, 
                [Doğum Tarihi] = @p_dogum, 
                [il] = @p_il, 
                [İlçe] = @p_ilce, 
                [Köy/Mahalle] = @p_koy, 
                [Telefon] = @p_tel,
                [sicil] = @p_sicil
            WHERE [Kimlik] = @p_id`;

        await request.query(query);
        res.json({ success: true });
    } catch (err) {
        console.error("SQL Hatası:", err);
        res.status(500).json({ success: false, message: "Veritabanı hatası!" });
    }
});

// server.js içine ekleyin (Eğer yoksa)
app.get('/api/ciftci-detay/:id', async (req, res) => {
    try {
        const request = pool.request();
        request.input('id', sql.Int, req.params.id);
        const result = await request.query("SELECT * FROM [çksdilekçe] WHERE Kimlik = @id");
        
        if (result.recordset.length > 0) {
            res.json(result.recordset[0]);
        } else {
            res.status(404).send("Kayıt bulunamadı");
        }
    } catch (err) {
        res.status(500).send(err.message);
    }
});

app.get('/api/getir-ciftci/:id', async (req, res) => {
    try {
        const request = pool.request();
        request.input('id', sql.Int, req.params.id);
        const result = await request.query("SELECT * FROM [çksdilekçe] WHERE [Kimlik] = @id");
        
        if (result.recordset.length > 0) {
            let ciftci = result.recordset[0];

            // 1. Veritabanındaki ham verileri al
            let tur = (ciftci.tur || '').trim();
            let tc = (ciftci['Tc Kimlik No'] || '').trim();
            let vergi = (ciftci.vergino || '').trim();

            // 2. Eğer eski bir kayıtsa ve 'tur' sütunu boşsa otomatik tespit et
            if (!tur) {
                tur = (vergi.length > 0 || tc.length === 10) ? 'TUZEL' : 'GERCEK';
            }

            // 3. SENİN KESİN KURALIN: GERÇEK ise TC, TÜZEL ise VERGİ NO
            if (tur === 'TUZEL') {
                // Şirketlerde numara 'vergino' sütunundan gelir. 
                // (Eğer eski kayıtsa ve yanlışlıkla TC'ye yazılmışsa onu vergino'ya kaydırırız)
                if (vergi === '' && tc.length === 10) {
                    ciftci.vergino = tc;
                } else {
                    ciftci.vergino = vergi;
                }
                ciftci['Tc Kimlik No'] = ''; // Şirketin TC'si olmaz, boşaltıyoruz
            } else {
                // Gerçek kişilerde numara TC sütunundan gelir
                ciftci['Tc Kimlik No'] = tc;
                ciftci.vergino = ''; // Şahsın Vergi No'su olmaz
            }

            ciftci.tur = tur; // Tür bilgisini de json'a ekleyip gönderiyoruz

            res.json(ciftci);
        } else {
            res.status(404).send("Kayıt bulunamadı");
        }
    } catch (err) {
        console.error("SQL Hatası:", err);
        res.status(500).send(err.message);
    }
});
// EKSİK DÜZENLEME ROTASI (PUT)
// EKSİK DÜZENLEME ROTASI (PUT)
// EKSİK DÜZENLEME ROTASI (PUT) - İSİM GÜNCELLENDİ


// authMiddleware Tanımlaması
async function authMiddleware(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ message: "Yetkisiz erişim: Token bulunamadı" });
    }

    jwt.verify(token, process.env.JWT_SECRET || 'secret', (err, user) => {
        if (err) {
            return res.status(403).json({ message: "Geçersiz veya süresi dolmuş token" });
        }
        req.user = user; // Kullanıcı bilgisini isteğe ekle
        next(); // İşlemi devam ettir
    });
}
app.put('/api/eksik-duzenlee/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { eksikler, durum } = req.body;

        const pool = await getPool();
        await pool.request()
            .input('id', sql.Int, id)
            .input('eksikler', sql.NVarChar, eksikler)
            .input('durum', sql.NVarChar, durum)
            .query(`
                UPDATE [eksikler] 
                SET [eksikler] = @eksikler, 
                    [durum] = @durum 
                WHERE [Kimlik] = @id
            `);

        res.json({ success: true, message: "Kayıt başarıyla güncellendi." });
    } catch (err) {
        console.error("Düzenleme hatası:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// --- DEMİRBAŞ İŞLEMLERİ ---

// 1. Tüm Demirbaşları Listele
// --- DEMİRBAŞ (INVENTORY) İŞLEMLERİ ---

// 1. Tüm Demirbaşları Listele
// --- DEMİRBAŞ API TEST ROTASI ---
// --- DEMİRBAŞ (INVENTORY) API ROTALARI ---

// 1. Tüm Demirbaşları Listele
// ANA LİSTE: Her Defter No'dan bir satır getirir (Özet)

// --- RESİM SERVİSİ (Hataları önlemek için en üstte olmalı) ---
// --- RESİM SERVİSİ (Hataları önlemek için en üstte olmalı) ---
const resimKlasoru = 'C:\\CKS\\public\\img\\demirbas';

// Eğer klasör yoksa hata vermemesi için otomatik oluşturur
if (!fs.existsSync(resimKlasoru)) {
    console.log(`DİKKAT: ${resimKlasoru} klasörü bulunamadı, otomatik oluşturuluyor...`);
    fs.mkdirSync(resimKlasoru, { recursive: true });
}

// server.js içindeki resim rotası
app.get('/resimler/:dosya', (req, res) => {
    const dosyaAdi = req.params.dosya;
    const anaDizin = 'C:\\CKS\\public\\img\\demirbas'; // YENİ KLASÖR YOLU
    
    // Denenecek ihtimaller
    const anaNo = dosyaAdi.split('-')[0];
    const adaylar = [
        path.join(anaDizin, dosyaAdi),                         // 156-1.bmp
        path.join(anaDizin, dosyaAdi.replace('.bmp', '.BMP')), // 156-1.BMP
        path.join(anaDizin, anaNo + '.bmp'),                   // 156.bmp
        path.join(anaDizin, anaNo + '.BMP')                    // 156.BMP
    ];

    for (let tamYol of adaylar) {
        if (fs.existsSync(tamYol)) {
            console.log("Resim bulundu:", tamYol);
            // Hatalı olan alt kısmı sildik ve önbellek (cache) ayarını olması gereken yere ekledik
            return res.sendFile(tamYol, { maxAge: 86400000 }); 
        }
    }

    console.log("Resim hiçbir şekilde bulunamadı:", dosyaAdi);
    res.status(404).send('Bulunamadı');
});


// API: Özet Liste (Defter No Grubu)
// API: Gruplandırılmış Ana Liste
// API: Gruplandırılmış Ana Liste
// API: Gruplandırılmış Ana Liste
app.get('/api/demirbas-liste', async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request()
            .query(`
                SELECT 
                    DEFTERNO as defterno, 
                    CİNSİ as cinsi, 
                    SUM(CAST(ADEDİ AS INT)) as toplam_adet, 
                    MAX(ZİMMET) as zimmet,
                    MAX(ISNULL(ODA, '')) as kullanildigi_yer, -- [KULLANILDIĞI YER] YERİNE ODA YAZILDI
                    MAX(ISNULL(DURUM, 0)) as durum 
                FROM [DEMİRBAŞ]
                GROUP BY DEFTERNO, CİNSİ
                ORDER BY DEFTERNO DESC
            `);
        res.json(result.recordset);
    } catch (err) {
        console.error("Liste Hatası:", err.message);
        res.status(500).send(err.message);
    }
});
// DEMİRBAŞ YER (ODA) DEĞİŞTİRME API
// DEMİRBAŞ YER (ODA) DEĞİŞTİRME API
app.post('/api/demirbas-oda-guncelle', async (req, res) => {
    try {
        const { defterno, detayno, yeniOdaNo } = req.body;
        const pool = await getPool();
        await pool.request()
            .input('dn', sql.Int, defterno)
            .input('dt', sql.Int, detayno)
            .input('oda', sql.NVarChar, yeniOdaNo.toString())
            .query(`
                UPDATE [DEMİRBAŞ] 
                SET ODA = @oda  -- [KULLANILDIĞI YER] YERİNE ODA YAZILDI
                WHERE [DEFTERNO] = @dn AND [detayno] = @dt
            `);
        res.json({ success: true });
    } catch (err) {
        console.error("Oda değişim hatası:", err);
        res.status(500).json({ success: false, message: err.message });
    }
});
// API: Bir Defter No'ya Ait Tüm Detaylar
// API: Bir Defter No'ya Ait Tüm Detaylar
// API: Bir Defter No'ya Ait Tüm Detaylar
app.get('/api/demirbas-detaylar/:defterno', async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request()
            .input('dn', sql.Int, req.params.defterno)
            .query(`
                SELECT 
                    DEFTERNO as defterno, 
                    detayno, 
                    ADEDİ as adedi, 
                    BİRİM as birim,
                    FİYAT as fiyat, 
                    ZİMMET as zimmet, 
                    FATURANO as fis_no,
                    EDİNMEŞEKLİ as edinme_sekli,
                    EDİNMETARİHİ as edinme_tarihi,
                    ISNULL(ODA, '') as kullanildigi_yer, -- [KULLANILDIĞI YER] YERİNE ODA YAZILDI
                    KARARSAYISI as karar_sayisi,
                    EDİNMETARİHİ as karar_tarihi,
                    AÇIKLAMA as aciklama,
                    notlar as notl,
                    AKTIF_SAYI as aktifsayi,
                    AKTIF_TARIHI as aktiftarihi,
                    CIKIS_NEDENI as cikis_nedeni, 
                    CIKIS_TARIHI as cikis_tarihi, 
                    ISNULL(DURUM, 0) as durum,
                    KARAR_NO as karar_no,         
                    KARAR_TARIHI as karar_tarihi_ozel 
                FROM [DEMİRBAŞ] 
                WHERE DEFTERNO = @dn 
                ORDER BY detayno ASC
            `);
        res.json(result.recordset);
    } catch (err) { 
        res.status(500).json({error: err.message}); 
    }
});
// API: Özet Rakamlar
app.get('/api/demirbas-ozet', async (req, res) => {
    try {
        const result = await pool.request().query("SELECT COUNT(*) as toplamAdet, SUM(ADEDİ * FİYAT) as toplamTutar FROM DEMİRBAŞ");
        res.json(result.recordset[0]);
    } catch (err) { res.status(500).json({error: err.message}); }
});

app.post('/api/demirbas-durum-guncelle', async (req, res) => {
    // Frontend'den gelen yeni değişkenler: yTarih, yNo, mTarih, mNo
    const { defterno, detayno, yeniDurum, yTarih, yNo, mTarih, mNo, cikisNedeni } = req.body;
    
    try {
        const pool = await getPool(); 
        
        if (yeniDurum === 0) {
            // --- AKTİFE GERİ DÖNÜŞ İŞLEMİ ---
            // Aktife dönüşlerde genellikle tek bir karar yeterli olur, meclis veya yönetimden birini referans alabiliriz.
            // Bu örnekte Yönetim numarasını referans alıyoruz.
            await pool.request()
                .input('dn', sql.Int, defterno)
                .input('dt', sql.Int, detayno)
                .input('kno', sql.NVarChar, yNo) 
                .input('ktarih', sql.DateTime, yTarih)
                .query(`
                    UPDATE [DEMİRBAŞ] 
                    SET [DURUM] = 0, 
                        [AKTIF_SAYI] = @kno, 
                        [AKTIF_TARIHI] = @ktarih,
                        [notlar] = 'Geri Aktif Edildi (Y.Karar: ' + @kno + ') ' + CHAR(13) + ISNULL(CAST([notlar] AS NVARCHAR(MAX)), '')
                    WHERE [DEFTERNO] = @dn AND [detayno] = @dt
                `);
        } else {
            // --- ÇIKIŞ İŞLEMLERİ (İmha, Satış, Hibe) ---
            await pool.request()
                .input('dn', sql.Int, defterno)
                .input('dt', sql.Int, detayno)
                .input('dur', sql.Int, yeniDurum)
                .input('neden', sql.NVarChar, cikisNedeni)
                .input('yTarih', sql.DateTime, yTarih)
                .input('yNo', sql.NVarChar, yNo)
                .input('mTarih', sql.DateTime, mTarih)
                .input('mNo', sql.NVarChar, mNo)
                .query(`
                    UPDATE [DEMİRBAŞ] 
                    SET [DURUM] = @dur, 
                        [CIKIS_NEDENI] = @neden, 
                        [YCIKIS_TARIHI] = @yTarih,  -- Yönetim Karar Tarihi
                        [YCIKIS_KARAR] = @yNo,      -- Yönetim Karar No
                        [CIKIS_TARIHI] = @mTarih,   -- Meclis Karar Tarihi
                        [CIKIS_KARAR] = @mNo        -- Meclis Karar No
                    WHERE [DEFTERNO] = @dn AND [detayno] = @dt
                `);
        }
        res.json({ success: true, message: "İşlem başarıyla kaydedildi." });
    } catch (err) {
        console.error("Güncelleme Hatası:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});
app.post('/api/demirbas-not-ekle', async (req, res) => {
    const { defterno, detayno, not } = req.body;
    try {
        await pool.request()
            .input('dn', sql.Int, defterno)
            .input('dt', sql.Int, detayno)
            .input('yeniNot', sql.NVarChar, not)
            .query(`
                UPDATE [DEMİRBAŞ] 
                SET [notlar] = CAST(@yeniNot AS NVARCHAR(MAX)) + ' \n ' + ISNULL(CAST([notlar] AS NVARCHAR(MAX)), '')
                WHERE [DEFTERNO] = @dn AND [detayno] = @dt
            `);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// TOPLU RAPOR İÇİN TÜM DETAYLARI GETİREN API
// TOPLU YAZDIRMA İÇİN TÜM LİSTEYİ GETİREN API
// TOPLU YAZDIRMA İÇİN TÜM LİSTEYİ GETİREN API (server.js)
// TOPLU YAZDIRMA İÇİN TÜM LİSTEYİ GETİREN API (server.js)
app.get('/api/demirbas-tum-detaylar', async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request().query(`
            SELECT 
                DEFTERNO as defterno, 
                detayno, 
                ADEDİ as adedi, 
                BİRİM as birim,
                FİYAT as fiyat, 
                CİNSİ as cinsi, 
                AÇIKLAMA as aciklama, 
                CAST(LTRIM(RTRIM(ISNULL(DURUM, 0))) AS INT) as durum,
                CIKIS_KARAR,
                KARAR_NO,
                CIKIS_TARIHI,
                KARAR_TARIHI,
                YCIKIS_KARAR,  -- BUNLARIN EKLİ OLMASI ŞART!
                YCIKIS_TARIHI, -- BUNLARIN EKLİ OLMASI ŞART!
                FATURANO as fis_no,
                ZİMMET as zimmet,
                EDİNMEŞEKLİ as edinme_sekli,
                ISNULL(ODA, '') as kullanildigi_yer 
            FROM [DEMİRBAŞ]
        `);
        res.json(result.recordset);
    } catch (err) {
        console.error("Hata:", err.message);
        res.status(500).json({ error: err.message });
    }
});


// ==========================================
// GERÇEK ZAMANLI ONLINE (ÇEVRİMİÇİ) SİSTEMİ
// ==========================================
const aktifKullanicilar = {}; // Kimin ne zaman aktif olduğunu RAM'de tutarız

app.post('/api/heartbeat', authenticateToken, (req, res) => {
    const userId = req.user.id || req.user.Id;
    if (userId) {
        // Kullanıcıdan sinyal geldiğinde o anki saati kaydet
        aktifKullanicilar[userId] = Date.now();
    }
    res.sendStatus(200);
});

app.get('/api/online', authenticateToken, (req, res) => {
    const now = Date.now();
    const onlineOlanlar = [];
    
    // Son 15 saniye içinde sinyal gönderenleri "Online" say
    for (const [id, lastSeen] of Object.entries(aktifKullanicilar)) {
        if (now - lastSeen < 15000) {
            onlineOlanlar.push(parseInt(id));
        } else {
            // Düşenleri RAM'den temizle
            delete aktifKullanicilar[id];
        }
    }
    res.json(onlineOlanlar);
});

// Kurul üyelerini veritabanından çeken kapı
app.get('/api/kurul-uyeleri', async (req, res) => {
    try {
        // MSSQL üzerinden aktif üyeleri çekiyoruz
        const result = await sql.query`SELECT * FROM kurul_uyeleri WHERE aktif = 1 ORDER BY gorev_tipi DESC, sira_no ASC`;
        
        // MSSQL sonuçları recordset içinde döndürür
        res.json(result.recordset); 
    } catch (err) {
        console.error("MSSQL Veri Çekme Hatası:", err);
        res.status(500).send("Veritabanı hatası oluştu.");
    }
});

// 2. Yeni Demirbaş Ekle
// 2. Yeni Demirbaş Ekle (Oda alanı düzeltildi)
app.post('/api/demirbas-ekle', async (req, res) => {
    try {
        const d = req.body;
        const adet = parseInt(d.adedi) || 1;
        
        const resultDefterNo = await pool.request().query("SELECT ISNULL(MAX(DEFTERNO), 0) + 1 AS yeniNo FROM DEMİRBAŞ");
        const yeniDefterNo = resultDefterNo.recordset[0].yeniNo;

        for (let i = 1; i <= adet; i++) {
            const request = pool.request();
            
            request.input('defterno', sql.Int, yeniDefterNo);
            request.input('detayno', sql.Int, i);
            request.input('cinsi', sql.NVarChar, d.cinsi);
            request.input('marka', sql.NVarChar, d.marka_model || "");
            request.input('serino', sql.NVarChar, d.seri_no || "");
            request.input('fiyat', sql.Money, parseFloat(d.fiyat) || 0);
            request.input('tarih', sql.DateTime, d.edinme_tarihi ? new Date(d.edinme_tarihi) : new Date());
            request.input('zimmet', sql.NVarChar, d.zimmet || "");
            request.input('yer', sql.NVarChar, d.kullanildigi_yer || "");

            // --- EKLEMENİZ GEREKEN SATIR BURASI ---
            // Ön yüzden gelen 'edinme_sekli' verisini SQL'e tanıtıyoruz
            request.input('edinme_sekli', sql.NVarChar, d.edinme_sekli || ""); 
            // --------------------------------------

            request.input('karar_no', sql.NVarChar, d.karar_no || "");
            request.input('karar_tarihi', sql.Date, d.karar_tarihi ? new Date(d.karar_tarihi) : null);

            // SORGUDU GÜNCELLEME: [KULLANILDIĞI YER] YERİNE ODA EKLENDİ
            const query = `
                INSERT INTO DEMİRBAŞ 
                (DEFTERNO, detayno, CİNSİ, MARKA_MODEL, SERI_NO, ADEDİ, FİYAT, EDİNMETARİHİ, ZİMMET, ODA, DURUM, KARAR_NO, KARAR_TARIHI, EDİNMEŞEKLİ)
                VALUES 
                (@defterno, @detayno, @cinsi, @marka, @serino, 1, @fiyat, @tarih, @zimmet, @yer, 0, @karar_no, @karar_tarihi, @edinme_sekli)
            `;
            await request.query(query);
        }
        res.json({ success: true, message: "Kayıt ve Karar Bilgileri İşlendi.", yeniDefterNo: yeniDefterNo });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});
app.delete('/api/demirbas-sil/:defterno/:detayno', async (req, res) => {
    try {
        const defterno = parseInt(req.params.defterno);
        const detayno = parseInt(req.params.detayno);
        
        const request = pool.request();
        request.input('defterno', sql.Int, defterno);
        request.input('detayno', sql.Int, detayno);
        
        // Sadece belirtilen Defter No ve Detay No'ya ait kaydı siler
        await request.query("DELETE FROM DEMİRBAŞ WHERE DEFTERNO = @defterno AND detayno = @detayno");
        
        res.json({ success: true, message: "Demirbaş başarıyla silindi." });
    } catch (err) {
        console.error("Silme Hatası:", err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// API: Yapılan Toplantıları/Kararları Gruplayarak Listele
// server.js içine eklenecek yeni API
// server.js içinde bu bloğun bağımsız olduğundan emin olun
// server.js içindeki /api/toplanti-listesi kısmını bununla güncelleyin
// ────────────────────────────────────────────────
// EN BASİT TEST ENDPOINT - önce bunu mutlaka dene
// ────────────────────────────────────────────────
app.get('/test-api', (req, res) => {
    console.log('TEST-API ENDPOINT ÇAĞRILDI!');
    res.json({
        message: 'Backend çalışıyor - test başarılı',
        zaman: new Date().toISOString(),
        sunucu: anaSunucuUrl(sistemAyarAl()).replace(/^https?:\/\//, '')
    });
});

// ────────────────────────────────────────────────
// SENİN ASIL ENDPOINT - veritabanı sorgusuyla
// ────────────────────────────────────────────────
// 1. API: GİRİŞ TOPLANTILARI
app.get('/api/toplanti-listesi', async (req, res) => {
    try {
        const result = await pool.request().query(`
            SELECT 
                CONVERT(varchar(10), KARAR_TARIHI, 120) AS tarih_id,
                CONVERT(varchar(10), KARAR_TARIHI, 104) AS tarih_gosterim,
                KARAR_NO AS no,
                COUNT(*) AS kalem_adedi,
                -- KRİTİK EKLEME: Edinme şeklini de gruplayıp çekiyoruz
                ISNULL([EDİNMEŞEKLİ], 'SATIN ALMA') AS giris_tipi 
            FROM [DEMİRBAŞ]
            WHERE KARAR_TARIHI IS NOT NULL
            GROUP BY 
                CONVERT(varchar(10), KARAR_TARIHI, 120), 
                CONVERT(varchar(10), KARAR_TARIHI, 104), 
                KARAR_NO,
                [EDİNMEŞEKLİ] -- Buraya ekledik ki her grubu türüne göre ayırsın
            ORDER BY tarih_id DESC, no DESC
        `);
        res.json(result.recordset || []);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 2. API: ÇIKIŞ TOPLANTILARI
app.get('/api/cikis-toplanti-listesi', async (req, res) => {
    try {
        const result = await pool.request().query(`
            SELECT 
                CONVERT(varchar(10), CIKIS_TARIHI, 120) AS tarih_id,
                CONVERT(varchar(10), CIKIS_TARIHI, 104) AS tarih_gosterim,
                CIKIS_KARAR AS no,
                -- Durum ne olursa olsun (1,2,3) hepsini getiriyoruz
                CAST(DURUM AS INT) as tur, 
                COUNT(*) AS kalem_adedi
            FROM [DEMİRBAŞ]
            WHERE CIKIS_TARIHI IS NOT NULL AND CIKIS_KARAR IS NOT NULL
            GROUP BY 
                CONVERT(varchar(10), CIKIS_TARIHI, 120), 
                CONVERT(varchar(10), CIKIS_TARIHI, 104), 
                CIKIS_KARAR, DURUM
            ORDER BY tarih_id DESC
        `);
        res.json(result.recordset || []);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ===================== BÜTÇE İŞLEMLERİ =====================

// 1. KAYITLARI LİSTELEME ENDPOINT'İ (GET)
app.get('/api/butce', async (req, res) => {
    try {
        const pool = await getPool(); // Senin sistemindeki doğru bağlantı şekli
        // SıraNo'ya göre azalan (en yeni en üstte) şekilde listeliyoruz
        let result = await pool.request().query('SELECT Kimlik, SıraNo, Yıl, Tarih1, Tarih2, ODA FROM VTBÜTÇE ORDER BY SıraNo DESC');
        res.json(result.recordset);
    } catch (err) {
        res.status(500).send("Veri çekme hatası: " + err.message);
    }
});

// 2. YENİ KAYIT EKLEME ENDPOINT'İ (POST)
app.post('/api/butce', async (req, res) => {
    try {
        const { Yil, Tarih1, Tarih2, Oda } = req.body;
        const pool = await getPool(); // Senin sistemindeki doğru bağlantı şekli
        
        // SıraNo'yu otomatik bir artırmak için mevcut en yüksek SıraNo'yu bulalım
        let siraNoResult = await pool.request().query('SELECT ISNULL(MAX(SıraNo), 0) + 1 AS YeniSiraNo FROM VTBÜTÇE');
        let yeniSiraNo = siraNoResult.recordset[0].YeniSiraNo;

        // Veriyi Tabloya Ekle
        await pool.request()
            .input('SiraNo', sql.Float, yeniSiraNo)
            .input('Yil', sql.NVarChar(255), Yil)
            // Eğer tarih girilmezse veritabanına NULL göndersin diye kontrol ekledik
            .input('Tarih1', sql.DateTime, Tarih1 ? new Date(Tarih1) : null) 
            .input('Tarih2', sql.DateTime, Tarih2 ? new Date(Tarih2) : null)
            .input('Oda', sql.Float, Oda)
            .query(`
                INSERT INTO VTBÜTÇE (SıraNo, Yıl, Tarih1, Tarih2, ODA) 
                VALUES (@SiraNo, @Yil, @Tarih1, @Tarih2, @Oda)
            `);

        res.status(200).json({ mesaj: "Kayıt başarıyla eklendi", siraNo: yeniSiraNo });
    } catch (err) {
        console.error("Bütçe ekleme hatası:", err);
        res.status(500).send("Kayıt ekleme hatası: " + err.message);
    }
});

// 3. BÜTÇE KAYDI GÜNCELLE (PUT)
app.put('/api/butce/:kimlik', async (req, res) => {
    try {
        const { Yil, Tarih1, Tarih2, Oda } = req.body;
        const pool = await getPool();
        await pool.request()
            .input('Kimlik', sql.Int, req.params.kimlik)
            .input('Yil', sql.NVarChar(255), Yil)
            .input('Tarih1', sql.DateTime, Tarih1 ? new Date(Tarih1) : null)
            .input('Tarih2', sql.DateTime, Tarih2 ? new Date(Tarih2) : null)
            .input('Oda', sql.Float, Oda)
            .query(`
                UPDATE VTBÜTÇE 
                SET Yıl = @Yil, Tarih1 = @Tarih1, Tarih2 = @Tarih2, ODA = @Oda 
                WHERE Kimlik = @Kimlik
            `);
        res.json({ success: true });
    } catch (err) {
        console.error("Güncelleme hatası:", err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// 4. BÜTÇE KAYDI SİL (DELETE)
app.delete('/api/butce/:kimlik', async (req, res) => {
    try {
        const pool = await getPool();
        await pool.request()
            .input('Kimlik', sql.Int, req.params.kimlik)
            .query('DELETE FROM VTBÜTÇE WHERE Kimlik = @Kimlik');
        res.json({ success: true });
    } catch (err) {
        console.error("Silme hatası:", err);
        res.status(500).json({ success: false, message: err.message });
    }
});
// ===================== ÇİFTÇİ BELGESİ İŞLEMLERİ =====================

// 1. LİSTELE (GET)
app.get('/api/ciftcibelgesi', async (req, res) => {
    try {
        const pool = await getPool();
        // Alan6 sütununu "Oda" olarak çekiyoruz
        let result = await pool.request().query('SELECT Kimlik, [DOSYA NO] as DosyaNo, TÜR as Tur, YIL as Yil, BAŞLANGIÇ as Baslangic, BİTİŞ as Bitis, Alan6 as Oda FROM VTÇİFTÇİBELGESİ ORDER BY [DOSYA NO] DESC');
        res.json(result.recordset);
    } catch (err) {
        res.status(500).send("Veri çekme hatası: " + err.message);
    }
});

// 2. EKLE (POST)
app.post('/api/ciftcibelgesi', async (req, res) => {
    try {
        const { Yil, Baslangic, Bitis, Oda } = req.body;
        const pool = await getPool();
        
        // Otomatik artan Dosya No
        let noResult = await pool.request().query('SELECT ISNULL(MAX([DOSYA NO]), 0) + 1 AS YeniNo FROM VTÇİFTÇİBELGESİ');
        let yeniNo = noResult.recordset[0].YeniNo;

        await pool.request()
            .input('DosyaNo', sql.Float, yeniNo)
            .input('Tur', sql.NVarChar(255), 'ÇİFTÇİ BELGESİ')
            .input('Yil', sql.Float, Yil ? parseFloat(Yil) : null)
            .input('Baslangic', sql.Float, Baslangic ? parseFloat(Baslangic) : null)
            .input('Bitis', sql.Float, Bitis ? parseFloat(Bitis) : null)
            .input('Oda', sql.Float, Oda ? parseFloat(Oda) : null)
            .query(`
                INSERT INTO VTÇİFTÇİBELGESİ ([DOSYA NO], TÜR, YIL, BAŞLANGIÇ, BİTİŞ, Alan6) 
                VALUES (@DosyaNo, @Tur, @Yil, @Baslangic, @Bitis, @Oda)
            `);

        res.status(200).json({ mesaj: "Kayıt eklendi", DosyaNo: yeniNo });
    } catch (err) {
        console.error("Çiftçi Belgesi ekleme hatası:", err);
        res.status(500).send("Hata: " + err.message);
    }
});

// 3. GÜNCELLE (PUT)
app.put('/api/ciftcibelgesi/:kimlik', async (req, res) => {
    try {
        const { Yil, Baslangic, Bitis, Oda } = req.body;
        const pool = await getPool();
        await pool.request()
            .input('Kimlik', sql.Int, req.params.kimlik)
            .input('Yil', sql.Float, Yil ? parseFloat(Yil) : null)
            .input('Baslangic', sql.Float, Baslangic ? parseFloat(Baslangic) : null)
            .input('Bitis', sql.Float, Bitis ? parseFloat(Bitis) : null)
            .input('Oda', sql.Float, Oda ? parseFloat(Oda) : null)
            .query(`
                UPDATE VTÇİFTÇİBELGESİ 
                SET YIL = @Yil, BAŞLANGIÇ = @Baslangic, BİTİŞ = @Bitis, Alan6 = @Oda 
                WHERE Kimlik = @Kimlik
            `);
        res.json({ success: true });
    } catch (err) {
        console.error("Güncelleme hatası:", err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// 4. SİL (DELETE)
app.delete('/api/ciftcibelgesi/:kimlik', async (req, res) => {
    try {
        const pool = await getPool();
        await pool.request()
            .input('Kimlik', sql.Int, req.params.kimlik)
            .query('DELETE FROM VTÇİFTÇİBELGESİ WHERE Kimlik = @Kimlik');
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ===================== DANIŞMANLIK İŞLEMLERİ =====================

// 1. LİSTELE (GET)
app.get('/api/danisman', async (req, res) => {
    try {
        const pool = await getPool();
        let result = await pool.request().query(`
            SELECT Kimlik, SN, [DANIŞMANIN ADI] as DanismanAdi, [DOSYA SAYI ARALIĞI] as DosyaAraligi, YILI as Yil, ODA as Oda,imhatarih, imhasayi 
            FROM VTDANIŞMAN 
            ORDER BY SN DESC
        `);
        res.json(result.recordset);
    } catch (err) {
        res.status(500).send("Veri çekme hatası: " + err.message);
    }
});

// 2. EKLE (POST)
app.post('/api/danisman', async (req, res) => {
    try {
        const { Yil, DosyaAraligi, DanismanAdi, Oda } = req.body;
        const pool = await getPool();
        
        // Otomatik artan SN
        let noResult = await pool.request().query('SELECT ISNULL(MAX(SN), 0) + 1 AS YeniNo FROM VTDANIŞMAN');
        let yeniNo = noResult.recordset[0].YeniNo;

        await pool.request()
            .input('SN', sql.Float, yeniNo)
            .input('DanismanAdi', sql.NVarChar(255), DanismanAdi || '')
            .input('DosyaAraligi', sql.NVarChar(255), DosyaAraligi || '')
            .input('Yil', sql.NVarChar(255), Yil || '')
            .input('Oda', sql.Float, Oda ? parseFloat(Oda) : null)
            .query(`
                INSERT INTO VTDANIŞMAN (SN, [DANIŞMANIN ADI], [DOSYA SAYI ARALIĞI], YILI, ODA) 
                VALUES (@SN, @DanismanAdi, @DosyaAraligi, @Yil, @Oda)
            `);

        res.status(200).json({ mesaj: "Kayıt eklendi", SN: yeniNo });
    } catch (err) {
        console.error("Danışman ekleme hatası:", err);
        res.status(500).send("Hata: " + err.message);
    }
});

// 3. GÜNCELLE (PUT)
app.put('/api/danisman/:kimlik', async (req, res) => {
    try {
        const { Yil, DosyaAraligi, DanismanAdi, Oda } = req.body;
        const pool = await getPool();
        await pool.request()
            .input('Kimlik', sql.Int, req.params.kimlik)
            .input('DanismanAdi', sql.NVarChar(255), DanismanAdi || '')
            .input('DosyaAraligi', sql.NVarChar(255), DosyaAraligi || '')
            .input('Yil', sql.NVarChar(255), Yil || '')
            .input('Oda', sql.Float, Oda ? parseFloat(Oda) : null)
            .query(`
                UPDATE VTDANIŞMAN 
                SET [DANIŞMANIN ADI] = @DanismanAdi, [DOSYA SAYI ARALIĞI] = @DosyaAraligi, YILI = @Yil, ODA = @Oda 
                WHERE Kimlik = @Kimlik
            `);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// 4. SİL (DELETE)
app.delete('/api/danisman/:kimlik', async (req, res) => {
    try {
        const pool = await getPool();
        await pool.request()
            .input('Kimlik', sql.Int, req.params.kimlik)
            .query('DELETE FROM VTDANIŞMAN WHERE Kimlik = @Kimlik');
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});
// ===================== DEFTER İŞLEMLERİ =====================

// 1. LİSTELE (GET)
app.get('/api/defter', async (req, res) => {
    try {
        const pool = await getPool();
        let result = await pool.request().query(`
            SELECT Kimlik, Alan1, DefterTürü, DefterTarihi, GRUP, Açıklama, ODA 
            FROM VTDEFTER 
            ORDER BY Alan1 DESC
        `);
        res.json(result.recordset);
    } catch (err) {
        res.status(500).send("Veri çekme hatası: " + err.message);
    }
});

// 2. EKLE (POST) - (Çift Sıra Numarası Mantığı Burada)
app.post('/api/defter', async (req, res) => {
    try {
        const { DefterTuru, DefterTarihi, Aciklama, Oda } = req.body;
        const pool = await getPool();
        
        // 1. Genel Sıra Numarası (Alan1) için MAX + 1
        let alan1Result = await pool.request().query('SELECT ISNULL(MAX(Alan1), 0) + 1 AS YeniAlan1 FROM VTDEFTER');
        let yeniAlan1 = alan1Result.recordset[0].YeniAlan1;

        // 2. Sadece Seçilen Defter Türüne Ait (GRUP) için MAX + 1
        let grupResult = await pool.request()
            .input('tur', sql.NVarChar(255), DefterTuru)
            .query('SELECT ISNULL(MAX(GRUP), 0) + 1 AS YeniGrup FROM VTDEFTER WHERE DefterTürü = @tur');
        let yeniGrup = grupResult.recordset[0].YeniGrup;

        // Veritabanına Yaz
        await pool.request()
            .input('Alan1', sql.Float, yeniAlan1)
            .input('DefterTuru', sql.NVarChar(255), DefterTuru || '')
            .input('DefterTarihi', sql.NVarChar(255), DefterTarihi || '')
            .input('Grup', sql.Float, yeniGrup)
            .input('Aciklama', sql.NVarChar(255), Aciklama || '')
            .input('Oda', sql.NVarChar(255), Oda || '')
            .query(`
                INSERT INTO VTDEFTER (Alan1, DefterTürü, DefterTarihi, GRUP, Açıklama, ODA) 
                VALUES (@Alan1, @DefterTuru, @DefterTarihi, @Grup, @Aciklama, @Oda)
            `);

        res.status(200).json({ mesaj: "Kayıt eklendi" });
    } catch (err) {
        res.status(500).send("Hata: " + err.message);
    }
});

// 3. GÜNCELLE (PUT)
app.put('/api/defter/:kimlik', async (req, res) => {
    try {
        const { DefterTuru, DefterTarihi, Aciklama, Oda } = req.body;
        const pool = await getPool();
        await pool.request()
            .input('Kimlik', sql.Int, req.params.kimlik)
            .input('DefterTuru', sql.NVarChar(255), DefterTuru || '')
            .input('DefterTarihi', sql.NVarChar(255), DefterTarihi || '')
            .input('Aciklama', sql.NVarChar(255), Aciklama || '')
            .input('Oda', sql.NVarChar(255), Oda || '')
            .query(`
                UPDATE VTDEFTER 
                SET DefterTürü = @DefterTuru, DefterTarihi = @DefterTarihi, Açıklama = @Aciklama, ODA = @Oda 
                WHERE Kimlik = @Kimlik
            `);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// 4. SİL (DELETE)
app.delete('/api/defter/:kimlik', async (req, res) => {
    try {
        const pool = await getPool();
        await pool.request()
            .input('Kimlik', sql.Int, req.params.kimlik)
            .query('DELETE FROM VTDEFTER WHERE Kimlik = @Kimlik');
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// 5. DEFTER TÜRLERİNİ GETİR (Benzersiz/Gruplanmış Liste)
app.get('/api/defter/turler', async (req, res) => {
    try {
        const pool = await getPool();
        // Sadece dolu ve birbirinden farklı olan Defter Türlerini alfabetik sırayla çeker
        let result = await pool.request().query(`
            SELECT DISTINCT DefterTürü 
            FROM VTDEFTER 
            WHERE DefterTürü IS NOT NULL AND DefterTürü <> '' 
            ORDER BY DefterTürü ASC
        `);
        // Sadece isimleri içeren temiz bir dizi (array) döndürüyoruz
        res.json(result.recordset.map(row => row.DefterTürü));
    } catch (err) {
        res.status(500).send("Tür çekme hatası: " + err.message);
    }
});

// ===================== DOSYA İŞLEMLERİ =====================

// 1. LİSTELE (GET)
app.get('/api/dosya', async (req, res) => {
    try {
        const pool = await getPool();
        let result = await pool.request().query(`
            SELECT Kimlik, TÜR as Tur, IDNO, DETAYNO, KLASÖRADI as KlasorAdi, TARİH as Tarih, İÇERİK as Icerik, oda as Oda, AÇIKLAMA as Aciklama 
            FROM VTDOSYALAR 
            ORDER BY IDNO DESC
        `);
        res.json(result.recordset);
    } catch (err) {
        res.status(500).send("Veri çekme hatası: " + err.message);
    }
});

// 2. DOSYA TÜRLERİNİ GETİR (Combobox için Dinamik Liste)
app.get('/api/dosya/turler', async (req, res) => {
    try {
        const pool = await getPool();
        let result = await pool.request().query(`
            SELECT DISTINCT TÜR 
            FROM VTDOSYALAR 
            WHERE TÜR IS NOT NULL AND TÜR <> '' 
            ORDER BY TÜR ASC
        `);
        res.json(result.recordset.map(row => row.TÜR));
    } catch (err) {
        res.status(500).send("Tür çekme hatası: " + err.message);
    }
});

// 3. EKLE (POST) - (Çift Sıra Numarası Mantığı)
app.post('/api/dosya', async (req, res) => {
    try {
        const { Tur, KlasorAdi, Tarih, Icerik, Oda, Aciklama } = req.body;
        const pool = await getPool();
        
        // 1. Genel Sıra Numarası (IDNO) için MAX + 1
        let idnoResult = await pool.request().query('SELECT ISNULL(MAX(IDNO), 0) + 1 AS YeniIDNO FROM VTDOSYALAR');
        let yeniIDNO = idnoResult.recordset[0].YeniIDNO;

        // 2. Seçilen Türe Göre (DETAYNO) için MAX + 1
        let detayResult = await pool.request()
            .input('tur', sql.NVarChar(255), Tur)
            .query('SELECT ISNULL(MAX(DETAYNO), 0) + 1 AS YeniDetay FROM VTDOSYALAR WHERE TÜR = @tur');
        let yeniDetay = detayResult.recordset[0].YeniDetay;

        // Veritabanına Yaz
        await pool.request()
            .input('Tur', sql.NVarChar(255), Tur || '')
            .input('IDNO', sql.Float, yeniIDNO)
            .input('DetayNo', sql.Float, yeniDetay)
            .input('KlasorAdi', sql.NVarChar(255), KlasorAdi || '')
            .input('Tarih', sql.DateTime, Tarih ? new Date(Tarih) : null)
            .input('Icerik', sql.DateTime, Icerik ? new Date(Icerik) : null)
            .input('Oda', sql.Float, Oda ? parseFloat(Oda) : null)
            .input('Aciklama', sql.NVarChar(255), Aciklama || '')
            .query(`
                INSERT INTO VTDOSYALAR (TÜR, IDNO, DETAYNO, KLASÖRADI, TARİH, İÇERİK, oda, AÇIKLAMA) 
                VALUES (@Tur, @IDNO, @DetayNo, @KlasorAdi, @Tarih, @Icerik, @Oda, @Aciklama)
            `);

        res.status(200).json({ mesaj: "Kayıt eklendi" });
    } catch (err) {
        res.status(500).send("Hata: " + err.message);
    }
});

// 4. GÜNCELLE (PUT)
app.put('/api/dosya/:kimlik', async (req, res) => {
    try {
        const { Tur, KlasorAdi, Tarih, Icerik, Oda, Aciklama } = req.body;
        const pool = await getPool();
        await pool.request()
            .input('Kimlik', sql.Int, req.params.kimlik)
            .input('Tur', sql.NVarChar(255), Tur || '')
            .input('KlasorAdi', sql.NVarChar(255), KlasorAdi || '')
            .input('Tarih', sql.DateTime, Tarih ? new Date(Tarih) : null)
            .input('Icerik', sql.DateTime, Icerik ? new Date(Icerik) : null)
            .input('Oda', sql.Float, Oda ? parseFloat(Oda) : null)
            .input('Aciklama', sql.NVarChar(255), Aciklama || '')
            .query(`
                UPDATE VTDOSYALAR 
                SET TÜR = @Tur, KLASÖRADI = @KlasorAdi, TARİH = @Tarih, İÇERİK = @Icerik, oda = @Oda, AÇIKLAMA = @Aciklama 
                WHERE Kimlik = @Kimlik
            `);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// 5. SİL (DELETE)
app.delete('/api/dosya/:kimlik', async (req, res) => {
    try {
        const pool = await getPool();
        await pool.request()
            .input('Kimlik', sql.Int, req.params.kimlik)
            .query('DELETE FROM VTDOSYALAR WHERE Kimlik = @Kimlik');
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ===================== ODALAR İŞLEMLERİ =====================

// 1. LİSTELE (GET)
app.get('/api/odalar', async (req, res) => {
    try {
        const pool = await getPool();
        let result = await pool.request().query(`
            SELECT Kimlik, NO as No, ODAADI as OdaAdi 
            FROM VTODALAR 
            ORDER BY NO ASC
        `);
        res.json(result.recordset);
    } catch (err) {
        res.status(500).send("Veri çekme hatası: " + err.message);
    }
});

// 2. EKLE (POST)
app.post('/api/odalar', async (req, res) => {
    try {
        const { No, OdaAdi } = req.body;
        const pool = await getPool();
        await pool.request()
            .input('No', sql.Float, No ? parseFloat(No) : null)
            .input('OdaAdi', sql.NVarChar(255), OdaAdi || '')
            .query(`
                INSERT INTO VTODALAR (NO, ODAADI) 
                VALUES (@No, @OdaAdi)
            `);
        res.status(200).json({ mesaj: "Kayıt eklendi" });
    } catch (err) {
        res.status(500).send("Hata: " + err.message);
    }
});

// 3. GÜNCELLE (PUT)
app.put('/api/odalar/:kimlik', async (req, res) => {
    try {
        const { No, OdaAdi } = req.body;
        const pool = await getPool();
        await pool.request()
            .input('Kimlik', sql.Int, req.params.kimlik)
            .input('No', sql.Float, No ? parseFloat(No) : null)
            .input('OdaAdi', sql.NVarChar(255), OdaAdi || '')
            .query(`
                UPDATE VTODALAR 
                SET NO = @No, ODAADI = @OdaAdi 
                WHERE Kimlik = @Kimlik
            `);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// 4. SİL (DELETE)
app.delete('/api/odalar/:kimlik', async (req, res) => {
    try {
        const pool = await getPool();
        await pool.request()
            .input('Kimlik', sql.Int, req.params.kimlik)
            .query('DELETE FROM VTODALAR WHERE Kimlik = @Kimlik');
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ===================== GÖREVLENDİRME / PERSONEL İŞLEMLERİ =====================

// ===================== GÖREVLENDİRME / PERSONEL İŞLEMLERİ =====================

// 1. LİSTELE (GET)
app.get('/api/gorevlendirmeler', async (req, res) => {
    try {
        // getPool() yerine global pool kullanıldı!
        let result = await pool.request().query('SELECT * FROM kurul_uyeleri ORDER BY gorev_tipi DESC, sira_no ASC');
        res.json(result.recordset);
    } catch (err) {
        console.error("Görevlendirme Liste Hatası:", err);
        res.status(500).json({ error: err.message });
    }
});

// 2. EKLE (POST)
app.post('/api/gorevlendirmeler', async (req, res) => {
    try {
        const { ad_soyad, gorev_tipi, unvan, sira_no, aktif, sorumlu_oda } = req.body;
        await pool.request()
            .input('ad', sql.NVarChar(100), ad_soyad)
            .input('tip', sql.NVarChar(20), gorev_tipi)
            .input('unvan', sql.NVarChar(100), unvan)
            .input('sira', sql.Int, sira_no || 99)
            .input('aktif', sql.Bit, aktif ? 1 : 0)
            .input('oda', sql.NVarChar(50), sorumlu_oda || null)
            .query(`
                INSERT INTO kurul_uyeleri (ad_soyad, gorev_tipi, unvan, sira_no, aktif, sorumlu_oda) 
                VALUES (@ad, @tip, @unvan, @sira, @aktif, @oda)
            `);
        res.status(200).json({ success: true });
    } catch (err) {
        console.error("Görevlendirme Ekleme Hatası:", err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// 3. GÜNCELLE (PUT)
app.put('/api/gorevlendirmeler/:id', async (req, res) => {
    try {
        const { ad_soyad, gorev_tipi, unvan, sira_no, aktif, sorumlu_oda } = req.body;
        await pool.request()
            .input('id', sql.Int, req.params.id)
            .input('ad', sql.NVarChar(100), ad_soyad)
            .input('tip', sql.NVarChar(20), gorev_tipi)
            .input('unvan', sql.NVarChar(100), unvan)
            .input('sira', sql.Int, sira_no || 99)
            .input('aktif', sql.Bit, aktif ? 1 : 0)
            .input('oda', sql.NVarChar(50), sorumlu_oda || null)
            .query(`
                UPDATE kurul_uyeleri 
                SET ad_soyad = @ad, gorev_tipi = @tip, unvan = @unvan, sira_no = @sira, aktif = @aktif, sorumlu_oda = @oda 
                WHERE id = @id
            `);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// 4. SİL (DELETE)
app.delete('/api/gorevlendirmeler/:id', async (req, res) => {
    try {
        await pool.request()
            .input('id', sql.Int, req.params.id)
            .query('DELETE FROM kurul_uyeleri WHERE id = @id');
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ===================== KULLANICI LİSTESİNİ ÇEK (GÖREVLENDİRME FORMU İÇİN) =====================
app.get('/api/kullanicilar-liste', async (req, res) => {
    try {
        // Kullanicilar tablosundan verileri çeker
        let result = await pool.request().query('SELECT * FROM Kullanicilar');
        res.json(result.recordset);
    } catch (err) {
        console.error("Kullanıcı Çekme Hatası:", err);
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// KİMLİK KART KAYDETME (RESİM + QR DESTEKLİ)
// ==========================================
// Resmi veritabanına "image" tipi olarak Buffer halinde yazabilmek için 
// Multer'ın "memoryStorage" özelliğini kullanıyoruz.
// ==========================================
// KİMLİK KART KAYDETME (TÜM BİLGİLER + TARİH DÜZELTMESİ)
// ==========================================
const multerMemStorage = multer.memoryStorage();
const memoryUpload = multer({ storage: multerMemStorage });

// ==========================================
// KİMLİK KART KAYDETME
// ==========================================
app.post('/api/kimlik-kaydet', authenticateToken, memoryUpload.single('resim'), async (req, res) => {
    try {
        const { adsoyad, tc, sicil, baba, dogumyeri, dtarih, ili, ilcesi, mahalle, gorevi, kayittarihi, qr_verisi, bagkur, ssk } = req.body;
        
        if (!adsoyad || !tc) {
            return res.status(400).json({ success: false, message: 'Ad Soyad ve TC zorunludur.' });
        }

        let resimBuffer = null;
        if (req.file) {
            resimBuffer = req.file.buffer;
        }

        // ÇÖZÜM 1: QR metni resme ÇEVRİLMİYOR, direkt saf metin olarak alınıyor!
        const safQrMetni = qr_verisi ? qr_verisi.trim() : '';

        // ÇÖZÜM 2: Sicil (Personel No) alanı güvenli sayıya çevriliyor
        let parsedSicil = parseFloat(sicil);
        if (isNaN(parsedSicil)) parsedSicil = null;

        let dogumTarihiSQL = null;
        if (dtarih) {
            let t = dtarih.trim();
            if (t.length === 4) dogumTarihiSQL = new Date(`${t}-01-01`); 
            else if (t.includes('.')) { 
                const p = t.split('.'); 
                if(p.length === 3) dogumTarihiSQL = new Date(`${p[2]}-${p[1]}-${p[0]}`); 
            }
        }

        let kayitTarihiSQL = new Date(); 
        if (kayittarihi) {
            let k = kayittarihi.trim();
            if (k.includes('.')) {
                const p = k.split('.');
                if(p.length === 3) kayitTarihiSQL = new Date(`${p[2]}-${p[1]}-${p[0]}`);
            }
        }

        const pool = await getPool();
        await pool.request()
            .input('adsoyad', sql.NVarChar(255), adsoyad)
            .input('tc', sql.Float, parseFloat(tc))
            .input('sicil', sql.Float, parsedSicil)
            .input('baba', sql.NVarChar(255), baba || null)
            .input('dogumyeri', sql.NVarChar(255), dogumyeri || null)
            .input('tarihi', sql.DateTime, dogumTarihiSQL)         
            .input('ili', sql.NVarChar(255), ili || null)          
            .input('ilcesi', sql.NVarChar(255), ilcesi || null)    
            .input('mahalle', sql.NVarChar(255), mahalle || null)  
            .input('gorevi', sql.NVarChar(255), gorevi || null)
            .input('kayittarihi', sql.DateTime, kayitTarihiSQL)    
            .input('resim', sql.Image, resimBuffer)      
            .input('qr', sql.NVarChar(sql.MAX), safQrMetni) // SAF METİN KAYDEDİLİYOR
            .input('bagkur', sql.NVarChar(50), bagkur || null) 
            .input('ssk', sql.NVarChar(50), ssk || null)       
            .query(`
                INSERT INTO kimlikkart 
                (ADSOYAD, TC, SİCİL, BABA, DOĞUMYERİ, TARİHİ, İLİ, İLÇESİ, MAHALLE, GÖREVİ, RESİM, qr, KAYITTARİHİ, BAGKUR, SSK, BUGÜN) 
                VALUES 
                (@adsoyad, @tc, @sicil, @baba, @dogumyeri, @tarihi, @ili, @ilcesi, @mahalle, @gorevi, @resim, @qr, @kayittarihi, @bagkur, @ssk, GETDATE())
            `);

        res.json({ success: true, message: "Kayıt Başarılı" });
    } catch (err) {
        console.error("Kimlik Kaydetme Hatası:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ==========================================
// KİMLİK LİSTESİNİ GETİRME
// ==========================================
app.get('/api/kimlik-liste', authenticateToken, async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request().query(`
            SELECT TOP 50 Kimlik, ADSOYAD, TC, SİCİL FROM kimlikkart ORDER BY Kimlik DESC
        `);
        res.json(result.recordset);
    } catch (err) { res.status(500).json([]); }
});

// ==========================================
// KİMLİK ARAMA
// ==========================================
app.get('/api/kimlik-ara', authenticateToken, async (req, res) => {
    try {
        const q = req.query.q || '';
        const pool = await getPool();
        const result = await pool.request()
            .input('q', sql.NVarChar, `%${q}%`)
            .query(`
                SELECT TOP 50 Kimlik, ADSOYAD, TC, SİCİL 
                FROM kimlikkart WHERE ADSOYAD LIKE @q OR TC LIKE @q ORDER BY Kimlik DESC
            `);
        res.json(result.recordset);
    } catch (err) { res.status(500).json([]); }
});

// ==========================================
// KİMLİK DETAY GETİRME
// ==========================================
app.get('/api/kimlik-detay/:id', authenticateToken, async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request()
            .input('id', sql.Int, req.params.id)
            .query('SELECT * FROM kimlikkart WHERE Kimlik = @id');
        
        if (result.recordset.length > 0) {
            const kisi = result.recordset[0];
            if (kisi.RESİM) {
                kisi.resimBase64 = Buffer.from(kisi.RESİM).toString('base64');
                kisi.RESİM = null; 
            }
            res.json({ success: true, data: kisi });
        } else {
            res.json({ success: false, message: 'Kayıt bulunamadı' });
        }
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ==========================================
// KİMLİK GÜNCELLEME
// ==========================================
app.post('/api/kimlik-guncelle/:id', authenticateToken, memoryUpload.single('resim'), async (req, res) => {
    try {
        const id = req.params.id;
        const { adsoyad, tc, sicil, baba, dogumyeri, dtarih, ili, ilcesi, mahalle, gorevi, kayittarihi, qr_verisi, bagkur, ssk } = req.body;
        
        if (!adsoyad || !tc) return res.status(400).json({ success: false, message: 'Ad Soyad ve TC zorunludur.' });

        let dogumTarihiSQL = null;
        if (dtarih) {
            let t = dtarih.trim();
            if (t.length === 4) dogumTarihiSQL = new Date(`${t}-01-01`); 
            else if (t.includes('.')) { const p = t.split('.'); if(p.length === 3) dogumTarihiSQL = new Date(`${p[2]}-${p[1]}-${p[0]}`); }
        }

        let kayitTarihiSQL = new Date(); 
        if (kayittarihi) {
            let k = kayittarihi.trim();
            if (k.includes('.')) { const p = k.split('.'); if(p.length === 3) kayitTarihiSQL = new Date(`${p[2]}-${p[1]}-${p[0]}`); }
        }

        const safQrMetni = qr_verisi ? qr_verisi.trim() : '';

        let parsedSicil = parseFloat(sicil);
        if (isNaN(parsedSicil)) parsedSicil = null;

        const pool = await getPool();
        const request = pool.request();
        
        request.input('id', sql.Int, id);
        request.input('adsoyad', sql.NVarChar(255), adsoyad);
        request.input('tc', sql.Float, parseFloat(tc));
        request.input('sicil', sql.Float, parsedSicil);
        request.input('baba', sql.NVarChar(255), baba || null);
        request.input('dogumyeri', sql.NVarChar(255), dogumyeri || null);
        request.input('tarihi', sql.DateTime, dogumTarihiSQL);         
        request.input('ili', sql.NVarChar(255), ili || null);          
        request.input('ilcesi', sql.NVarChar(255), ilcesi || null);    
        request.input('mahalle', sql.NVarChar(255), mahalle || null);  
        request.input('gorevi', sql.NVarChar(255), gorevi || null);
        request.input('kayittarihi', sql.DateTime, kayitTarihiSQL);
        request.input('qr', sql.NVarChar(sql.MAX), safQrMetni); // SAF METİN
        request.input('bagkur', sql.NVarChar(50), bagkur || null); 
        request.input('ssk', sql.NVarChar(50), ssk || null);       

        let resimGuncellemeSorgusu = "";
        if (req.file) {
            request.input('resim', sql.Image, req.file.buffer);
            resimGuncellemeSorgusu = ", RESİM = @resim";
        }

        await request.query(`
            UPDATE kimlikkart SET 
                ADSOYAD = @adsoyad, TC = @tc, SİCİL = @sicil, BABA = @baba, DOĞUMYERİ = @dogumyeri, 
                TARİHİ = @tarihi, İLİ = @ili, İLÇESİ = @ilcesi, MAHALLE = @mahalle, GÖREVİ = @gorevi, 
                KAYITTARİHİ = @kayittarihi, qr = @qr, BAGKUR = @bagkur, SSK = @ssk ${resimGuncellemeSorgusu}
            WHERE Kimlik = @id
        `);

        res.json({ success: true, message: "Güncelleme Başarılı" });
    } catch (err) {
        console.error("Kimlik Güncelleme Hatası:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ==========================================
// KİMLİK SİLME (ŞİFRE ONAYLI VE GÜVENLİ)
// ==========================================
app.post('/api/kimlik-sil/:id', authenticateToken, async (req, res) => {
    try {
        const id = req.params.id; // Silinecek kimlik kartının ID'si
        const { sifre } = req.body; // Kullanıcının girdiği şifre

        if (!sifre) {
            return res.status(400).json({ success: false, message: 'Lütfen şifrenizi girin.' });
        }

        const pool = await getPool();
        let userCheck;

        // Token'dan gelen kullanıcı verilerini güvenli bir şekilde alalım
        const aktifKullaniciId = req.user.Id || req.user.id || req.user.ID;
        const aktifKullaniciAdi = req.user.KullaniciAdi || req.user.kullaniciadi || req.user.KULLANICIADI;

        // 1. ADIM: KULLANICILAR TABLOSUNDAN ŞİFRE KONTROLÜ (Birebir eşleşen tablo adlarıyla)
        if (aktifKullaniciId) {
            userCheck = await pool.request()
                .input('id', sql.Int, aktifKullaniciId)
                .input('sifre', sql.NVarChar(255), sifre)
                .query(`SELECT * FROM Kullanicilar WHERE Id = @id AND sifre = @sifre`);
        } else if (aktifKullaniciAdi) {
            userCheck = await pool.request()
                .input('ka', sql.NVarChar(50), aktifKullaniciAdi)
                .input('sifre', sql.NVarChar(255), sifre)
                .query(`SELECT * FROM Kullanicilar WHERE KullaniciAdi = @ka AND sifre = @sifre`);
        } else {
            return res.status(401).json({ success: false, message: 'Oturum bilgisi alınamadı. Lütfen tekrar giriş yapın.' });
        }

        // Eğer girilen şifre veritabanındaki şifreyle uyuşmuyorsa
        if (!userCheck || userCheck.recordset.length === 0) {
            return res.status(401).json({ success: false, message: 'Hatalı şifre girdiniz! Kayıt silinemedi.' });
        }

        // 2. ADIM: ŞİFRE DOĞRUYSA KİMLİK KARTINI SİL
        await pool.request()
            .input('silinecekId', sql.Int, id)
            .query('DELETE FROM kimlikkart WHERE Kimlik = @silinecekId');

        res.json({ success: true, message: 'Kayıt başarıyla silindi.' });
    } catch (err) {
        console.error("Kimlik Silme Hatası:", err);
        res.status(500).json({ success: false, message: "Sunucu hatası: " + err.message });
    }
});

// ==========================================
// PROFİL GÜNCELLEME (PERSONELİN KENDİ BİLGİLERİ)
// ==========================================
// ==========================================
// PROFİL GÜNCELLEME (PERSONELİN KENDİ BİLGİLERİ)
// ==========================================
app.put('/api/profil', authenticateToken, async (req, res) => {
    try {
        const { ad, soyad, email, sifre } = req.body;
        
        // Token'dan aktif kullanıcının ID'sini alıyoruz
        const userId = req.user.id || req.user.Id || req.user.ID;

        if (!userId) {
            return res.status(401).json({ success: false, message: 'Oturum hatası. Lütfen tekrar giriş yapın.' });
        }

        const pool = await getPool();
        const request = pool.request();
        request.input('id', sql.Int, userId);

        let updateQuery = "UPDATE Kullanicilar SET ";
        let updates = [];

        // Sadece doldurulan alanları güncelliyoruz
        if (ad !== undefined && ad.trim() !== "") { 
            updates.push("Ad = @ad"); 
            request.input('ad', sql.NVarChar(50), ad.trim()); 
        }
        if (soyad !== undefined && soyad.trim() !== "") { 
            updates.push("Soyad = @soyad"); 
            request.input('soyad', sql.NVarChar(50), soyad.trim()); 
        }
        if (email !== undefined) { 
            updates.push("Email = @email"); 
            request.input('email', sql.NVarChar(100), email.trim()); 
        }
        if (sifre && sifre.trim() !== "") { // Şifre boş gelirse hiç dokunma
            updates.push("sifre = @sifre"); 
            request.input('sifre', sql.NVarChar(255), sifre.trim()); 
        }

        if (updates.length === 0) {
            return res.json({ success: false, message: "Değişecek bilgi bulunamadı." });
        }

        updateQuery += updates.join(", ") + " WHERE Id = @id";
        await request.query(updateQuery);

        res.json({ success: true, message: "Profil başarıyla güncellendi." });
    } catch (err) {
        console.error("Profil Güncelleme Hatası:", err);
        res.status(500).json({ success: false, message: "Sunucu hatası: " + err.message });
    }
});
// ==========================================
// MESAJLAR - "YAZIYOR..." ÖZELLİĞİ İÇİN
// ==========================================

// Kimin kime yazdığını anlık olarak RAM'de (geçici hafızada) tutacağımız obje
const yaziyorHafizasi = {}; 

// 1. Kullanıcı klavyeye bastığında burası tetiklenir
app.post('/api/yaziyor', authenticateToken, (req, res) => {
    const { karsiId } = req.body;
    const benimId = req.user.id || req.user.Id;
    
    if (karsiId) {
        // Karşı tarafın ID'sine "ben şu an yazıyorum" diye zaman damgası bırakıyoruz
        yaziyorHafizasi[karsiId] = {
            yazanKisi: benimId,
            zaman: Date.now()
        };
    }
    res.json({ success: true });
});

// 2. Frontend 3 saniyede bir "Bana yazan biri var mı?" diye buraya sorar
app.get('/api/yaziyor-kontrol', authenticateToken, (req, res) => {
    const benimId = req.user.id || req.user.Id;
    const durum = yaziyorHafizasi[benimId];

    // Eğer bana ait bir kayıt varsa ve son 4 saniye içinde klavyeye basılmışsa "yazıyor" de
    if (durum && (Date.now() - durum.zaman) < 4000) {
        res.json({ yaziyor: true });
    } else {
        res.json({ yaziyor: false });
    }
});

// ==========================================
//             MAKBUZ - A ENDPOINT'LERİ
// ==========================================

// 1. GET: Tüm Makbuzları Listele
app.get('/api/makbuz', async (req, res) => {
    try {
        const pool = await sql.connect(dbConfig); // dbConfig değişkeniniz kendi ayarlarınıza göre olmalı
        const result = await pool.request()
            .query('SELECT * FROM VTMAKBUZ ORDER BY [Sıra No] DESC');
        res.json(result.recordset);
    } catch (err) {
        console.error("Makbuz listeleme hatası:", err);
        res.status(500).send("Veri çekilirken hata oluştu.");
    }
});

// 2. POST: Yeni Makbuz Ekle
app.post('/api/makbuz', async (req, res) => {
    try {
        const { SeriNo, Tarih1, Tarih2, Sayi1, Sayi2, Oda } = req.body;
        const pool = await sql.connect(dbConfig);
        
        await pool.request()
            .input('SeriNo', sql.NVarChar(255), SeriNo || null)
            .input('Tarih1', sql.DateTime, Tarih1 ? new Date(Tarih1) : null)
            .input('Tarih2', sql.DateTime, Tarih2 ? new Date(Tarih2) : null)
            .input('Sayi1', sql.Float, Sayi1 ? parseFloat(Sayi1) : null)
            .input('Sayi2', sql.Float, Sayi2 ? parseFloat(Sayi2) : null)
            .input('Oda', sql.Float, Oda ? parseFloat(Oda) : null)
            .query(`
                DECLARE @YeniSira FLOAT = ISNULL((SELECT MAX([Sıra No]) FROM VTMAKBUZ), 0) + 1;
                
                INSERT INTO VTMAKBUZ ([Sıra No], [Tarih 1], [Tarih 2], [SERİ NO], [Sayı 1], [Sayı 2], ODA)
                VALUES (@YeniSira, @Tarih1, @Tarih2, @SeriNo, @Sayi1, @Sayi2, @Oda)
            `);
            
        res.status(201).send("Makbuz başarıyla eklendi.");
    } catch (err) {
        console.error("Makbuz ekleme hatası:", err);
        res.status(500).send("Kayıt eklenirken hata oluştu.");
    }
});

// 3. PUT: Makbuz Güncelle
app.put('/api/makbuz/:kimlik', async (req, res) => {
    try {
        const kimlik = req.params.kimlik;
        const { SeriNo, Tarih1, Tarih2, Sayi1, Sayi2, Oda } = req.body;
        
        const pool = await sql.connect(dbConfig);
        await pool.request()
            .input('Kimlik', sql.Int, kimlik)
            .input('SeriNo', sql.NVarChar(255), SeriNo || null)
            .input('Tarih1', sql.DateTime, Tarih1 ? new Date(Tarih1) : null)
            .input('Tarih2', sql.DateTime, Tarih2 ? new Date(Tarih2) : null)
            .input('Sayi1', sql.Float, Sayi1 ? parseFloat(Sayi1) : null)
            .input('Sayi2', sql.Float, Sayi2 ? parseFloat(Sayi2) : null)
            .input('Oda', sql.Float, Oda ? parseFloat(Oda) : null)
            .query(`
                UPDATE VTMAKBUZ 
                SET [SERİ NO] = @SeriNo, 
                    [Tarih 1] = @Tarih1, 
                    [Tarih 2] = @Tarih2, 
                    [Sayı 1] = @Sayi1, 
                    [Sayı 2] = @Sayi2, 
                    ODA = @Oda
                WHERE Kimlik = @Kimlik
            `);
            
        res.send("Makbuz başarıyla güncellendi.");
    } catch (err) {
        console.error("Makbuz güncelleme hatası:", err);
        res.status(500).send("Kayıt güncellenirken hata oluştu.");
    }
});

// 4. DELETE: Makbuz Sil
app.delete('/api/makbuz/:kimlik', async (req, res) => {
    try {
        const kimlik = req.params.kimlik;
        const pool = await sql.connect(dbConfig);
        
        await pool.request()
            .input('Kimlik', sql.Int, kimlik)
            .query('DELETE FROM VTMAKBUZ WHERE Kimlik = @Kimlik');
            
        res.send("Makbuz başarıyla silindi.");
    } catch (err) {
        console.error("Makbuz silme hatası:", err);
        res.status(500).send("Kayıt silinirken hata oluştu.");
    }
});

// ==========================================
//             MAKBUZ - B ENDPOINT'LERİ
// ==========================================

// GET: Tüm Makbuz-B'leri Listele
app.get('/api/makbuzB', async (req, res) => {
    try {
        const pool = await sql.connect(dbConfig); 
        const result = await pool.request()
            .query('SELECT * FROM VTKREDİHAVALE ORDER BY [Sıra No] DESC');
        res.json(result.recordset);
    } catch (err) {
        console.error("Makbuz B listeleme hatası:", err);
        res.status(500).send("Veri çekilirken hata oluştu.");
    }
});

// POST: Yeni Makbuz-B Ekle
app.post('/api/makbuzB', async (req, res) => {
    try {
        const { SeriNo, Tarih1, Tarih2, Sayi1, Sayi2, Oda } = req.body;
        const pool = await sql.connect(dbConfig);
        
        await pool.request()
            .input('cilt', sql.NVarChar(255), SeriNo || null)
            .input('Tarih1', sql.DateTime, Tarih1 ? new Date(Tarih1) : null)
            .input('Tarih2', sql.DateTime, Tarih2 ? new Date(Tarih2) : null)
            .input('Sayi1', sql.Int, Sayi1 ? parseInt(Sayi1) : null)
            .input('Sayi2', sql.Int, Sayi2 ? parseInt(Sayi2) : null)
            .input('Oda', sql.Int, Oda ? parseInt(Oda) : null)
            .query(`
                DECLARE @YeniSira FLOAT = ISNULL((SELECT MAX([Sıra No]) FROM VTKREDİHAVALE), 0) + 1;
                
                INSERT INTO VTKREDİHAVALE ([Sıra No], [Tarih 1], [Tarih 2], cilt, [Sayı 1], [Sayı 2], ODA)
                VALUES (@YeniSira, @Tarih1, @Tarih2, @cilt, @Sayi1, @Sayi2, @Oda)
            `);
            
        res.status(201).send("Makbuz B başarıyla eklendi.");
    } catch (err) {
        console.error("Makbuz B ekleme hatası:", err);
        res.status(500).send("Kayıt eklenirken hata oluştu.");
    }
});

// PUT: Makbuz-B Güncelle
app.put('/api/makbuzB/:kimlik', async (req, res) => {
    try {
        const kimlik = req.params.kimlik;
        const { SeriNo, Tarih1, Tarih2, Sayi1, Sayi2, Oda } = req.body;
        
        const pool = await sql.connect(dbConfig);
        await pool.request()
            .input('Kimlik', sql.Int, kimlik)
            .input('cilt', sql.NVarChar(255), SeriNo || null)
            .input('Tarih1', sql.DateTime, Tarih1 ? new Date(Tarih1) : null)
            .input('Tarih2', sql.DateTime, Tarih2 ? new Date(Tarih2) : null)
            .input('Sayi1', sql.Int, Sayi1 ? parseInt(Sayi1) : null)
            .input('Sayi2', sql.Int, Sayi2 ? parseInt(Sayi2) : null)
            .input('Oda', sql.Int, Oda ? parseInt(Oda) : null)
            .query(`
                UPDATE VTKREDİHAVALE 
                SET cilt = @cilt, 
                    [Tarih 1] = @Tarih1, 
                    [Tarih 2] = @Tarih2, 
                    [Sayı 1] = @Sayi1, 
                    [Sayı 2] = @Sayi2, 
                    ODA = @Oda
                WHERE Kimlik = @Kimlik
            `);
            
        res.send("Makbuz B başarıyla güncellendi.");
    } catch (err) {
        console.error("Makbuz B güncelleme hatası:", err);
        res.status(500).send("Kayıt güncellenirken hata oluştu.");
    }
});

// DELETE: Makbuz-B Sil
app.delete('/api/makbuzB/:kimlik', async (req, res) => {
    try {
        const kimlik = req.params.kimlik;
        const pool = await sql.connect(dbConfig);
        
        await pool.request()
            .input('Kimlik', sql.Int, kimlik)
            .query('DELETE FROM VTKREDİHAVALE WHERE Kimlik = @Kimlik');
            
        res.send("Makbuz B başarıyla silindi.");
    } catch (err) {
        console.error("Makbuz B silme hatası:", err);
        res.status(500).send("Kayıt silinirken hata oluştu.");
    }
});

// ==========================================
//             SİCİL DOSYALARI ENDPOINT'LERİ
// ==========================================

// GET: Listele
app.get('/api/sicil', async (req, res) => {
    try {
        const pool = await sql.connect(dbConfig); 
        const result = await pool.request()
            .query('SELECT * FROM VTSİCİLDOSYALARI ORDER BY SıraNo DESC');
        res.json(result.recordset);
    } catch (err) {
        console.error("Sicil Dosyası listeleme hatası:", err);
        res.status(500).send("Hata oluştu.");
    }
});

// POST: Ekle
app.post('/api/sicil', async (req, res) => {
    try {
        const { Sayi1, Sayi2, Notlar, Oda } = req.body;
        const pool = await sql.connect(dbConfig);
        
        await pool.request()
            .input('Sayi1', sql.Float, Sayi1 ? parseFloat(Sayi1) : null)
            .input('Sayi2', sql.Float, Sayi2 ? parseFloat(Sayi2) : null)
            .input('Notlar', sql.NVarChar(255), Notlar || null)
            .input('Oda', sql.Int, Oda ? parseInt(Oda) : null)
            .query(`
                DECLARE @YeniSira FLOAT = ISNULL((SELECT MAX(SıraNo) FROM VTSİCİLDOSYALARI), 0) + 1;
                
                INSERT INTO VTSİCİLDOSYALARI (SıraNo, Sayı1, Sayı2, NOTLAR, ODA)
                VALUES (@YeniSira, @Sayi1, @Sayi2, @Notlar, @Oda)
            `);
            
        res.status(201).send("Başarıyla eklendi.");
    } catch (err) {
        console.error("Sicil ekleme hatası:", err);
        res.status(500).send("Hata oluştu.");
    }
});

// PUT: Güncelle
app.put('/api/sicil/:kimlik', async (req, res) => {
    try {
        const kimlik = req.params.kimlik;
        const { Sayi1, Sayi2, Notlar, Oda } = req.body;
        
        const pool = await sql.connect(dbConfig);
        await pool.request()
            .input('Kimlik', sql.Int, kimlik)
            .input('Sayi1', sql.Float, Sayi1 ? parseFloat(Sayi1) : null)
            .input('Sayi2', sql.Float, Sayi2 ? parseFloat(Sayi2) : null)
            .input('Notlar', sql.NVarChar(255), Notlar || null)
            .input('Oda', sql.Int, Oda ? parseInt(Oda) : null)
            .query(`
                UPDATE VTSİCİLDOSYALARI 
                SET Sayı1 = @Sayi1, Sayı2 = @Sayi2, NOTLAR = @Notlar, ODA = @Oda
                WHERE Kimlik = @Kimlik
            `);
            
        res.send("Başarıyla güncellendi.");
    } catch (err) {
        console.error("Sicil güncelleme hatası:", err);
        res.status(500).send("Hata oluştu.");
    }
});

// DELETE: Sil
app.delete('/api/sicil/:kimlik', async (req, res) => {
    try {
        const kimlik = req.params.kimlik;
        const pool = await sql.connect(dbConfig);
        await pool.request()
            .input('Kimlik', sql.Int, kimlik)
            .query('DELETE FROM VTSİCİLDOSYALARI WHERE Kimlik = @Kimlik');
        res.send("Başarıyla silindi.");
    } catch (err) {
        console.error("Sicil silme hatası:", err);
        res.status(500).send("Hata oluştu.");
    }
});

// ==========================================
//             GELEN YAZI ENDPOINT'LERİ
// ==========================================

// GET: Listele
app.get('/api/gelen', async (req, res) => {
    try {
        const pool = await sql.connect(dbConfig); 
        const result = await pool.request()
            .query('SELECT * FROM VTGELENEVRAK ORDER BY [SIRA NO] DESC');
        res.json(result.recordset);
    } catch (err) {
        console.error("Gelen Yazı listeleme hatası:", err);
        res.status(500).send("Hata oluştu.");
    }
});

// POST: Ekle
app.post('/api/gelen', async (req, res) => {
    try {
        const { Tur, Tarih1, Tarih2, Oda } = req.body;
        const pool = await sql.connect(dbConfig);
        
        await pool.request()
            .input('Tur', sql.NVarChar(255), Tur || null)
            .input('Tarih1', sql.DateTime, Tarih1 ? new Date(Tarih1) : null)
            .input('Tarih2', sql.DateTime, Tarih2 ? new Date(Tarih2) : null)
            .input('Oda', sql.Float, Oda ? parseFloat(Oda) : null)
            .query(`
                DECLARE @YeniSira FLOAT = ISNULL((SELECT MAX([SIRA NO]) FROM VTGELENEVRAK), 0) + 1;
                
                INSERT INTO VTGELENEVRAK ([SIRA NO], Tür, [Tarih 1], [Tarih 2], ODA)
                VALUES (@YeniSira, @Tur, @Tarih1, @Tarih2, @Oda)
            `);
            
        res.status(201).send("Başarıyla eklendi.");
    } catch (err) {
        console.error("Gelen Yazı ekleme hatası:", err);
        res.status(500).send("Hata oluştu.");
    }
});

// PUT: Güncelle
app.put('/api/gelen/:kimlik', async (req, res) => {
    try {
        const kimlik = req.params.kimlik;
        const { Tur, Tarih1, Tarih2, Oda } = req.body;
        
        const pool = await sql.connect(dbConfig);
        await pool.request()
            .input('Kimlik', sql.Int, kimlik)
            .input('Tur', sql.NVarChar(255), Tur || null)
            .input('Tarih1', sql.DateTime, Tarih1 ? new Date(Tarih1) : null)
            .input('Tarih2', sql.DateTime, Tarih2 ? new Date(Tarih2) : null)
            .input('Oda', sql.Float, Oda ? parseFloat(Oda) : null)
            .query(`
                UPDATE VTGELENEVRAK 
                SET Tür = @Tur, [Tarih 1] = @Tarih1, [Tarih 2] = @Tarih2, ODA = @Oda
                WHERE Kimlik = @Kimlik
            `);
            
        res.send("Başarıyla güncellendi.");
    } catch (err) {
        console.error("Gelen Yazı güncelleme hatası:", err);
        res.status(500).send("Hata oluştu.");
    }
});

// DELETE: Sil
app.delete('/api/gelen/:kimlik', async (req, res) => {
    try {
        const kimlik = req.params.kimlik;
        const pool = await sql.connect(dbConfig);
        await pool.request()
            .input('Kimlik', sql.Int, kimlik)
            .query('DELETE FROM VTGELENEVRAK WHERE Kimlik = @Kimlik');
        res.send("Başarıyla silindi.");
    } catch (err) {
        console.error("Gelen Yazı silme hatası:", err);
        res.status(500).send("Hata oluştu.");
    }
});

// ==========================================
//             GİDEN YAZI ENDPOINT'LERİ
// ==========================================

// GET: Listele
app.get('/api/giden', async (req, res) => {
    try {
        const pool = await sql.connect(dbConfig); 
        const result = await pool.request()
            .query('SELECT * FROM VTGİDENEVRAK ORDER BY [SIRA NO] DESC');
        res.json(result.recordset);
    } catch (err) {
        console.error("Giden Yazı listeleme hatası:", err);
        res.status(500).send("Hata oluştu.");
    }
});

// POST: Ekle
app.post('/api/giden', async (req, res) => {
    try {
        const { Tur, Tarih1, Tarih2, Oda } = req.body;
        const pool = await sql.connect(dbConfig);
        
        await pool.request()
            .input('Tur', sql.NVarChar(255), Tur || null)
            .input('Tarih1', sql.DateTime, Tarih1 ? new Date(Tarih1) : null)
            .input('Tarih2', sql.DateTime, Tarih2 ? new Date(Tarih2) : null)
            .input('Oda', sql.Float, Oda ? parseFloat(Oda) : null)
            .query(`
                DECLARE @YeniSira FLOAT = ISNULL((SELECT MAX([SIRA NO]) FROM VTGİDENEVRAK), 0) + 1;
                
                INSERT INTO VTGİDENEVRAK ([SIRA NO], tür, [Tarih 1], [Tarih 2], ODA)
                VALUES (@YeniSira, @Tur, @Tarih1, @Tarih2, @Oda)
            `);
            
        res.status(201).send("Başarıyla eklendi.");
    } catch (err) {
        console.error("Giden Yazı ekleme hatası:", err);
        res.status(500).send("Hata oluştu.");
    }
});

// PUT: Güncelle
app.put('/api/giden/:kimlik', async (req, res) => {
    try {
        const kimlik = req.params.kimlik;
        const { Tur, Tarih1, Tarih2, Oda } = req.body;
        
        const pool = await sql.connect(dbConfig);
        await pool.request()
            .input('Kimlik', sql.Int, kimlik)
            .input('Tur', sql.NVarChar(255), Tur || null)
            .input('Tarih1', sql.DateTime, Tarih1 ? new Date(Tarih1) : null)
            .input('Tarih2', sql.DateTime, Tarih2 ? new Date(Tarih2) : null)
            .input('Oda', sql.Float, Oda ? parseFloat(Oda) : null)
            .query(`
                UPDATE VTGİDENEVRAK 
                SET tür = @Tur, [Tarih 1] = @Tarih1, [Tarih 2] = @Tarih2, ODA = @Oda
                WHERE Kimlik = @Kimlik
            `);
            
        res.send("Başarıyla güncellendi.");
    } catch (err) {
        console.error("Giden Yazı güncelleme hatası:", err);
        res.status(500).send("Hata oluştu.");
    }
});

// DELETE: Sil
app.delete('/api/giden/:kimlik', async (req, res) => {
    try {
        const kimlik = req.params.kimlik;
        const pool = await sql.connect(dbConfig);
        await pool.request()
            .input('Kimlik', sql.Int, kimlik)
            .query('DELETE FROM VTGİDENEVRAK WHERE Kimlik = @Kimlik');
        res.send("Başarıyla silindi.");
    } catch (err) {
        console.error("Giden Yazı silme hatası:", err);
        res.status(500).send("Hata oluştu.");
    }
});

// ==========================================
//             İMHA MERKEZİ İŞLEMİ
// ==========================================
app.post('/api/imha-isle', async (req, res) => {
    try {
        const { tur, ids, imhaSayi, imhaTarih, ykNo, ykTarih, komTarih, imhaSekli, imhaImzalar } = req.body;
        
        const tabloHaritasi = {
            'ciftci': { tablo: 'VTÇİFTÇİBELGESİ', idCol: 'Kimlik' },
            'danisman': { tablo: 'VTDANIŞMAN', idCol: 'Kimlik' },
            'makbuzA': { tablo: 'VTMAKBUZ', idCol: 'Kimlik' },
            'makbuzB': { tablo: 'VTKREDİHAVALE', idCol: 'Kimlik' },
            'gelen': { tablo: 'VTGELENEVRAK', idCol: 'Kimlik' },
            'giden': { tablo: 'VTGİDENEVRAK', idCol: 'Kimlik' }
        };

        const ayar = tabloHaritasi[tur];
        if (!ayar) return res.status(400).json({ success: false, message: "Geçersiz evrak türü." });
        if (!ids || ids.length === 0) return res.status(400).json({ success: false, message: "ID listesi boş." });

        const pool = await sql.connect(dbConfig);
        const idListesi = ids.join(',');

        const meclisSayiInt = imhaSayi ? parseInt(String(imhaSayi).replace(/[^\d]/g, '')) || null : null;
        const ykSayiInt = ykNo ? parseInt(String(ykNo).replace(/[^\d]/g, '')) || null : null;

        // Konsolda verinin boyutunu görmek için (Test amaçlı)
        console.log("Backend'e ulaşan imza paketi uzunluğu:", imhaImzalar ? imhaImzalar.length : 0);

        await pool.request()
            .input('imhaSayi', sql.Int, meclisSayiInt)
            .input('imhaTarih', sql.DateTime, imhaTarih ? new Date(imhaTarih) : null)
            .input('ykSayi', sql.Int, ykSayiInt)
            .input('ykTarih', sql.DateTime, ykTarih ? new Date(ykTarih) : null)
            .input('komTarih', sql.DateTime, komTarih ? new Date(komTarih) : null)
            .input('imhaSekli', sql.NVarChar, imhaSekli || 'KIRPMA')
            // DÜZELTME BURADA: sql.NVarChar(sql.MAX) olarak değiştirildi! 
            // Çok uzun metinler (21 kişinin imzası vs.) veritabanına sorunsuz yazılacak.
            .input('imhaImzalar', sql.NVarChar(sql.MAX), imhaImzalar || null)
            .query(`
                UPDATE ${ayar.tablo} 
                SET 
                    imhatarih = @imhaTarih,
                    imhasayi = @imhaSayi,
                    ykimhatarihi = @ykTarih,
                    yksayi = @ykSayi,
                    komisyontarih = @komTarih,
                    imhasekli = @imhaSekli,
                    imha_imzalar = @imhaImzalar
                WHERE ${ayar.idCol} IN (${idListesi})
            `);

        res.json({ success: true, message: "İmha kaydı ve imza hafızası başarıyla işlendi." });
    } catch (err) {
        console.error("İmha işlemi hatası:", err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ==========================================
// GEÇMİŞ İMHA LİSTELERİ (ÖZET EKRANI İÇİN)
// ==========================================
app.get('/api/imha-ozet', async (req, res) => {
    try {
        const pool = await sql.connect(dbConfig);
        // Tüm tablolarda imhatarih dolu olanları bulup, karar bazında grupluyoruz
        const query = `
            SELECT 'ciftci' AS tur, imhatarih, imhasayi, ykimhatarihi, yksayi, komisyontarih, COUNT(*) as adet FROM VTÇİFTÇİBELGESİ WHERE imhatarih IS NOT NULL GROUP BY imhatarih, imhasayi, ykimhatarihi, yksayi, komisyontarih
            UNION ALL
            SELECT 'danisman' AS tur, imhatarih, imhasayi, ykimhatarihi, yksayi, komisyontarih, COUNT(*) as adet FROM VTDANIŞMAN WHERE imhatarih IS NOT NULL GROUP BY imhatarih, imhasayi, ykimhatarihi, yksayi, komisyontarih
            UNION ALL
            SELECT 'makbuzA' AS tur, imhatarih, imhasayi, ykimhatarihi, yksayi, komisyontarih, COUNT(*) as adet FROM VTMAKBUZ WHERE imhatarih IS NOT NULL GROUP BY imhatarih, imhasayi, ykimhatarihi, yksayi, komisyontarih
            UNION ALL
            SELECT 'makbuzB' AS tur, imhatarih, imhasayi, ykimhatarihi, yksayi, komisyontarih, COUNT(*) as adet FROM VTKREDİHAVALE WHERE imhatarih IS NOT NULL GROUP BY imhatarih, imhasayi, ykimhatarihi, yksayi, komisyontarih
            UNION ALL
            SELECT 'gelen' AS tur, imhatarih, imhasayi, ykimhatarihi, yksayi, komisyontarih, COUNT(*) as adet FROM VTGELENEVRAK WHERE imhatarih IS NOT NULL GROUP BY imhatarih, imhasayi, ykimhatarihi, yksayi, komisyontarih
            UNION ALL
            SELECT 'giden' AS tur, imhatarih, imhasayi, ykimhatarihi, yksayi, komisyontarih, COUNT(*) as adet FROM VTGİDENEVRAK WHERE imhatarih IS NOT NULL GROUP BY imhatarih, imhasayi, ykimhatarihi, yksayi, komisyontarih
        `;
        const result = await pool.request().query(query);
        res.json(result.recordset);
    } catch (err) {
        console.error("İmha özet hatası:", err);
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// GEÇMİŞ İMHA İÇERİĞİ (TUTANAĞA ÇİFT TIKLANINCA İÇİNDEKİLERİ GETİRİR)
// ==========================================
app.post('/api/imha-detay', async (req, res) => {
    try {
        const { tur, imhaTarih, imhaSayi } = req.body;
        const tabloHaritasi = {
            'ciftci': 'VTÇİFTÇİBELGESİ', 'danisman': 'VTDANIŞMAN',
            'makbuzA': 'VTMAKBUZ', 'makbuzB': 'VTKREDİHAVALE',
            'gelen': 'VTGELENEVRAK', 'giden': 'VTGİDENEVRAK'
        };
        const tablo = tabloHaritasi[tur];
        if (!tablo) return res.status(400).json([]);

        const pool = await sql.connect(dbConfig);
        
        // HATA ÇÖZÜMÜ: HTML'den gelen "null", "undefined", "-" gibi metinleri ayıklayıp gerçek sayıya veya gerçek NULL'a çeviriyoruz.
        let sayiInt = null;
        if (imhaSayi && String(imhaSayi).trim() !== 'null' && String(imhaSayi).trim() !== 'undefined' && String(imhaSayi).trim() !== '-') {
            sayiInt = parseInt(String(imhaSayi).replace(/[^\d]/g, ''));
            if (isNaN(sayiInt)) sayiInt = null;
        }

        const result = await pool.request()
            .input('sayi', sql.Int, sayiInt)
            .input('tarih', sql.DateTime, new Date(imhaTarih))
            .query(`
                SELECT * FROM ${tablo} 
                WHERE (imhasayi = @sayi OR (@sayi IS NULL AND imhasayi IS NULL))
                AND CAST(imhatarih AS DATE) = CAST(@tarih AS DATE)
            `);
            
        res.json(result.recordset);
    } catch (err) {
        console.error("İmha detay hatası:", err);
        res.status(500).json({ error: err.message });
    }
});

// Personel Maaş Listesini MSSQL'den Çekme API'si
// app.get('/api/personel-maas-listesi', async (req, res) => {
//     try {
//         // sql nesnesi mssql paketinden gelmektedir (const sql = require('mssql'))
//         const request = new sql.Request();
        
//         // Kendi tablo ve sütun adlarınıza göre burayı düzenleyin
//         const result = await request.query(`
//             SELECT 
//                 TCKimlikNo AS tc, 
//                 Ad + ' ' + Soyad AS ad, 
//                 IBAN AS iban, 
//                 GuncelMaas AS tutar 
//             FROM Personeller 
//             WHERE CalismaDurumu = 'Aktif'
//         `);

//         // Veriyi frontend'e gönder
//         res.json({ success: true, veriler: result.recordset });
//     } catch (err) {
//         console.error("MSSQL Hata:", err);
//         res.status(500).json({ success: false, message: 'Veritabanı hatası!' });
//     }
// });


// PERSONEL/YÖNETİM/MECLİS/İKAME LİSTESİNİ ÇEKME KAPISI
// PERSONEL / YÖNETİM / MECLİS / İKAME FİLTRELİ LİSTELEME (ÇOKLU GRUP DESTEKLİ)
app.get('/api/personel-maas-listesi', async (req, res) => {
    const secilenGrup = req.query.grup || 'PERSONEL';

    try {
        const pool = await sql.connect();
        const request = new sql.Request(pool);

        request.input('grup', sql.VarChar(20), secilenGrup);

        // --- İŞTE SİHİRLİ DOKUNUŞ BURADA ---
        // = işareti yerine LIKE '%...%' kullandık. 
        // Yani "İçinde YONETIM kelimesi geçen herkesi getir" dedik.
        const query = `
            SELECT 
                PersonelID as id, 
                TCKimlikNo as tc, 
                LTRIM(RTRIM(Ad + ' ' + ISNULL(Soyad, ''))) as ad, 
                IBAN as iban, 
                GuncelMaas as tutar 
            FROM Personeller 
            WHERE OdemeGrubu LIKE '%' + @grup + '%'
        `;
        
        const result = await request.query(query);
        console.log(`[BİLGİ] İçinde '${secilenGrup}' geçen liste çekildi. Bulunan kişi: ${result.recordset.length}`);

        res.json({ success: true, veriler: result.recordset });

    } catch (err) {
        console.error("Listeleme Hatası:", err.message);
        res.status(500).json({ success: false, message: 'Veri çekilemedi!' });
    }
});

// Personel Bilgilerini MSSQL'de Güncelleme API'si
// Personel Bilgilerini Veritabanında (Kalıcı Olarak) Güncelleme API'si
app.put('/api/personel-guncelle', async (req, res) => {
    const { tc, ad, iban, tutar } = req.body;

    if (!tc) {
        return res.status(400).json({ success: false, message: 'TC Kimlik No boş olamaz!' });
    }

    try {
        const pool = await sql.connect();
        const request = new sql.Request(pool);

        // Parametreleri SQL'e güvenli şekilde gönderiyoruz
        request.input('tc', sql.VarChar(11), tc.trim());
        request.input('ad', sql.VarChar(100), ad.trim().toUpperCase());
        request.input('iban', sql.VarChar(26), iban.trim().toUpperCase());
        request.input('tutar', sql.Decimal(10, 2), tutar);

        // Personel tablonuzun adı neyse (Örn: PersonelListesi) onu buraya yazın.
        // Ben genel bir tablo adı kullandım, gerekirse değiştirin.
        await request.query(`
            UPDATE Personeller
            SET IBAN = @iban, 
                GuncelMaas = @tutar
            WHERE TCKimlikNo = @tc
        `);

        console.log(`[GÜNCELLEME] ${ad} personeli başarıyla güncellendi.`);
        res.json({ success: true, message: 'Bilgiler başarıyla güncellendi!' });

    } catch (err) {
        console.error("Güncelleme Hatası:", err.message);
        res.status(500).json({ success: false, message: 'Veritabanı güncelleme hatası!' });
    }
});

// TXT Oluşturulduğunda Maaş Geçmişini Veritabanına Kaydetme API'si

// Geçmiş Maaş Kayıtlarını Çekme API'si
app.get('/api/maas-gecmisi', async (req, res) => {
    try {
        // sql nesnesinin mssql kütüphanesinden geldiğinden emin olun
        const request = new sql.Request();
        
        // Maaşları en yeni tarihten en eskiye doğru sıralayarak çekiyoruz
        const result = await request.query(`
            SELECT 
                AdSoyad, 
                IBAN, 
                OdenenTutar, 
                DosyaAciklamasi, 
                CONVERT(varchar, OdemeTarihi, 104) as OdemeTarihi -- 104 formatı: GG.AA.YYYY
            FROM MaasGecmisi 
            ORDER BY OdemeTarihi DESC, IslemID DESC
        `);

        res.json({ success: true, veriler: result.recordset });
    } catch (err) {
        console.error("Maaş Geçmişi Çekme Hatası:", err);
        res.status(500).json({ success: false, message: 'Veritabanı hatası!' });
    }
});


// TXT Oluşturulduğunda Maaş Geçmişini Veritabanına Kaydetme / Güncelleme API'si
app.post('/api/maas-gecmisi-kaydet', async (req, res) => {
    const { personelListesi, odemeTarihi, aciklama } = req.body;
    
    // Açıklamayı tertemiz alıyoruz
    const temizAciklama = aciklama.trim();

    try {
        const pool = await sql.connect();
        
        // --- KRİTİK ADIM: AÇIKLAMAYA GÖRE TEMİZLİK ---
        const deleteRequest = new sql.Request(pool);
        deleteRequest.input('aciklamaParam', sql.VarChar(100), temizAciklama);
        
        // SQL'e emir: "DosyaAciklamasi bu olan her şeyi SÜPÜR"
        // RTRIM ve LTRIM kullanarak SQL'in kendi eklediği gizli boşlukları da yok sayıyoruz
        await deleteRequest.query(`
            DELETE FROM MaasGecmisi 
            WHERE RTRIM(LTRIM(DosyaAciklamasi)) = @aciklamaParam
        `);
        
        console.log(`[TEMİZLİK] '${temizAciklama}' açıklamalı eski kayıtlar silindi.`);

        // --- GÜNCEL LİSTEYİ EKLE ---
        for (let p of personelListesi) {
            const insertRequest = new sql.Request(pool);
            
            insertRequest.input('tc', sql.VarChar(11), (p.tc || '').trim());
            insertRequest.input('adsoyad', sql.VarChar(100), p.ad.trim());
            insertRequest.input('iban', sql.VarChar(26), p.iban.trim());
            insertRequest.input('tutar', sql.Decimal(10, 2), p.tutar);
            insertRequest.input('aciklama', sql.VarChar(100), temizAciklama);
            insertRequest.input('odemeTarihi', sql.Date, odemeTarihi);

            await insertRequest.query(`
                INSERT INTO MaasGecmisi (TCKimlikNo, AdSoyad, IBAN, OdenenTutar, DosyaAciklamasi, OdemeTarihi, IslemTarihi)
                VALUES (@tc, @adsoyad, @iban, @tutar, @aciklama, @odemeTarihi, GETDATE())
            `);
        }

        console.log(`[KAYIT] '${temizAciklama}' için ${personelListesi.length} yeni kayıt eklendi.`);
        res.json({ success: true });

    } catch (err) {
        console.error("HATA:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});


const nodemailer = require('nodemailer');

// E-posta Gönderim Ayarları (Sarayönü Ziraat Odası Mail Bilgileri)
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'sziraatodasi@gmail.com',
        pass: 'vgpqgbsdccbxesdv' // Aldığın kodu boşluksuz, jilet gibi buraya yazdım
    }
});


// Mail Gönderme İstek Kanalı
app.post('/api/maas-mail-gonder', async (req, res) => {
    const { dosyaIcerigi, dosyaAdi, konu, icerik } = req.body;

    try {
        const mailOptions = {
            from: 'sziraatodasi@gmail.com', // Burayı Gmail yaptık abi
            to: 'maas@ziraatbank.com.tr',
            subject: konu,
            text: icerik,
            attachments: [
                {
                    filename: dosyaAdi,
                    content: dosyaIcerigi,
                    contentType: 'text/plain'
                }
            ]
        };

        await transporter.sendMail(mailOptions);
        console.log("-----------------------------------------");
        console.log("BAŞARILI: E-posta bankaya gönderildi!");
        console.log("-----------------------------------------");
        res.json({ success: true, message: "E-posta bankaya başarıyla gönderildi!" });
    } catch (error) {
        console.error("Mail Hatası:", error);
        res.status(500).json({ success: false, message: "Hata oluştu: " + error.message });
    }
});

// --- BİÇERDÖVER RUHSAT KAYDETME ENDPOINT'İ ---
app.post('/api/ruhsat-kaydet', async (req, res) => {
    try {
        const d = req.body;

        const request = new sql.Request();
        
        // Parametreleri bağlıyoruz (SQL Injection koruması için)
        request.input('tescilSiraNo', sql.VarChar, d.tescilSiraNo || null);
        request.input('belgeSeriNo', sql.VarChar, d.belgeSeriNo || null);
        request.input('tescilTarihi', sql.Date, d.tescilTarihi || null);
        request.input('tescilPlakaNo', sql.VarChar, d.tescilPlakaNo || null);
        request.input('aracinCinsi', sql.VarChar, d.aracinCinsi || 'BİÇERDÖVER');
        request.input('markasi', sql.VarChar, d.markasi || null);
        request.input('tipi', sql.VarChar, d.tipi || null);
        request.input('sasiNo', sql.VarChar, d.sasiNo || null);
        request.input('motorNo', sql.VarChar, d.motorNo || null);
        request.input('motorGucu', sql.VarChar, d.motorGucu || null);
        request.input('modelYili', sql.VarChar, d.modelYili || null);
        request.input('yuruyusTakimi', sql.VarChar, d.yuruyusTakimi || 'LASTİK');
        request.input('yuruyusOzel', sql.VarChar, d.yuruyusOzel || null);
        request.input('yakitCinsi', sql.VarChar, d.yakitCinsi || 'MOTORİN');
        request.input('digerOzellikleri', sql.Text, d.digerOzellikleri || null);
        request.input('sahipAdSoyad', sql.VarChar, d.sahipAdSoyad || null);
        request.input('sahipTc', sql.VarChar, d.sahipTc || null);
        request.input('sahipAnaAdi', sql.VarChar, d.sahipAnaAdi || null);
        request.input('sahipBabaAdi', sql.VarChar, d.sahipBabaAdi || null);
        request.input('sahipDogumYeri', sql.VarChar, d.sahipDogumYeri || null);
        request.input('sahipDogumTarihi', sql.VarChar, d.sahipDogumTarihi || null);
        request.input('sahipAdres', sql.Text, d.sahipAdres || null);

        const query = `
            INSERT INTO bicerdover_ruhsat (
                tescil_sira_no, belge_seri_no, tescil_tarihi, tescil_plaka_no,
                aracin_cinsi, markasi, tipi, sasi_no, motor_no, motor_gucu,
                model_yili, yuruyus_takimi, yuruyus_tk_ozellikleri, yakit_cinsi, diger_ozellikleri,
                sahip_ad_soyad, sahip_tc, sahip_ana_adi, sahip_baba_adi,
                sahip_dogum_yeri, sahip_dogum_tarihi, sahip_adres
            ) VALUES (
                @tescilSiraNo, @belgeSeriNo, @tescilTarihi, @tescilPlakaNo,
                @aracinCinsi, @markasi, @tipi, @sasiNo, @motorNo, @motorGucu,
                @modelYili, @yuruyusTakimi, @yuruyusOzel, @yakitCinsi, @digerOzellikleri,
                @sahipAdSoyad, @sahipTc, @sahipAnaAdi, @sahipBabaAdi,
                @sahipDogumYeri, @sahipDogumTarihi, @sahipAdres
            )
        `;

        await request.query(query);
        res.json({ success: true, message: "Ruhsat bilgileri veritabanına başarıyla kaydedildi!" });

    } catch (err) {
        console.error("Ruhsat Kayıt Hatası:", err);
        res.status(500).json({ success: false, message: "Kayıt sırasında bir hata oluştu: " + err.message });
    }
});

// --- BİÇERDÖVER RUHSATLARI LİSTELEME ENDPOINT'İ ---
app.get('/api/ruhsat-liste', async (req, res) => {
    try {
        const request = new sql.Request();
        // En son eklenen en üstte çıksın diye ORDER BY id DESC yapıyoruz
        const result = await request.query('SELECT * FROM bicerdover_ruhsat ORDER BY id DESC');
        
        res.json({ success: true, veriler: result.recordset });
    } catch (err) {
        console.error("Ruhsat Listeleme Hatası:", err);
        res.status(500).json({ success: false, message: "Listeleme hatası: " + err.message });
    }
});

// ====================== TELEFON GÜNCELLEME ENDPOINT ======================
// ====================== TELEFON GÜNCELLEME ENDPOINT ======================
app.post('/api/cks-telefon-guncelle', async (req, res) => {
    const { kimlik, telefon } = req.body;

    // Basit validation
    if (!kimlik || !telefon) {
        return res.status(400).json({ 
            success: false, 
            message: "Kimlik ve telefon numarası zorunludur." 
        });
    }

    if (telefon.length < 10) {
        return res.status(400).json({ 
            success: false, 
            message: "Geçerli bir telefon numarası giriniz." 
        });
    }

    try {
        const request = pool.request();

        request.input('p_kimlik', sql.Int, parseInt(kimlik));
        request.input('p_tel', sql.NVarChar(20), telefon);

        const query = `
            UPDATE [çksdilekçe] 
            SET [Telefon] = @p_tel
            WHERE [Kimlik] = @p_kimlik`;

        const result = await request.query(query);

        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ 
                success: false, 
                message: "Kayıt bulunamadı." 
            });
        }

        res.json({ 
            success: true, 
            message: "Telefon numarası başarıyla güncellendi." 
        });

    } catch (err) {
        console.error("Telefon Güncelleme SQL Hatası:", err);
        res.status(500).json({ 
            success: false, 
            message: "Veritabanı işlemi sırasında hata oluştu." 
        });
    }
});

const { exec } = require('child_process');

// Manuel Yedekleme Tetikleyici
app.post('/api/sistem-yedekle', authenticateToken, sadeceAdmin, (req, res) => {
    console.log("🚀 Yedekleme işlemi kullanıcı tarafından başlatıldı...");
    
    // .bat dosyasının tam yolunu buraya yaz
    // const batPath = 'C:\\Yedekler\\yedekle.bat'; 
    const batPath = 'C:\\Yedekler\\yedekle_bak.bat';

    exec(batPath, (error, stdout, stderr) => {
        if (error) {
            console.error(`❌ Yedekleme Hatası: ${error.message}`);
            return res.status(500).json({ success: false, message: "Yedekleme başlatılamadı!" });
        }
        console.log(`✅ Yedekleme Çıktısı: ${stdout}`);
        res.json({ success: true, message: "Yedekleme başarıyla tamamlandı. C:\\Yedekler klasörünü kontrol edin." });
    });
});
// --- 1. OTOMATİK YEDEKLEME: Hafta içi her gün saat 13:00 ---
cron.schedule('0 13 * * 1-5', async () => {
    try {
        const kaynak = 'C:\\cks';
        const simdi = new Date();
        const tarihFormat = `${String(simdi.getDate()).padStart(2, '0')}.${String(simdi.getMonth() + 1).padStart(2, '0')}.${simdi.getFullYear()}`;
        const hedef = `C:\\yedekler\\CKS_${tarihFormat}`;

        console.log(`⏰ [OTOMATİK] Yedekleme başladı: ${tarihFormat}`);
        await fsExtra.copy(kaynak, hedef);
        console.log(`✅ Yedekleme Başarılı: ${hedef}`);
    } catch (err) {
        console.error('❌ Otomatik Yedekleme Hatası:', err.message);
    }
}, { timezone: "Europe/Istanbul" });

// --- 2. MANUEL YEDEKLEME: Butonla tetiklenen komut ---
app.post('/api/manuel-yedekle', async (req, res) => {
    const kaynak = 'C:\\cks';
    const ip = "192.168.1.123";
    const uzakKlasor = `\\\\${ip}\\yedekler`;
    
    // Klasör ismini sabitledik: Her seferinde yeni klasör açmaz, olanı günceller.
    const hedef = `${uzakKlasor}\\CKS_Guncel_Yedek`;

    const uzakKullanici = "dms"; 
    const uzakSifre = "canbey10"; 
    //canbey10
    console.log(`🚀 [${new Date().toLocaleTimeString()}] YENISERVER üzerine senkronizasyon başlatıldı...`);

    const childProcess = require('child_process');

    // Önceki bağlantıyı temizle ve dms kullanıcısı ile yeniden bağlan
    const baglan = `net use "${uzakKlasor}" /delete /y & net use "${uzakKlasor}" "${uzakSifre}" /user:"${uzakKullanici}" /persistent:no`;
    
    childProcess.exec(baglan, (err) => {
        // /MIR: Mirror (Ayna) modu. Kaynaktaki klasör yapısını hedefe birebir kopyalar.
        // /Z: Bağlantı koparsa devam eder.
        // /MT:32: Çoklu işlem parçacığı kullanarak hızlı kopyalar.
        // /XF ile kilitli kalan Chrome profil dosyalarini atliyoruz.
// Bunlar yedeklenmese de sistemin calismasina engel degil.
// /FFT: Saat farklarını (FAT/NTFS) tolere eder.
// /XJ: Kavşak noktalarını (Junctions) atlar, sonsuz döngüyü engeller.
// /NDL: Klasör listesini loglamaz, hızı artırır.
// /XD: Klasör engelleme, /XF: Dosya engelleme
// Chrome profil klasörlerini tamamen listeden çıkartıyoruz (RobotProfil ve Default klasörleri)
const robocopyKomutu = `robocopy "${kaynak}" "${hedef}" /MIR /Z /R:1 /W:1 /MT:32 /FFT /XJ /XD "RobotProfil" "Default" "Cache" "Local Storage" /XF "Cookies" "Cookies-journal" "Session_*" "Tabs_*" "LOCK" "Web Data*"`;

        childProcess.exec(robocopyKomutu, (error, stdout, stderr) => {
            // Robocopy Çıkış Kodları: 0-8 arası başarılıdır.
            if (error && error.code > 8) {
                console.error("❌ Robocopy Hatası (Kod " + error.code + "):", stdout);
                return res.status(500).json({ 
                    success: false, 
                    message: `Yedekleme başarısız! (Hata Kodu: ${error.code})` 
                });
            }

            console.log(`✅ BAŞARILI: ${hedef} klasörü güncellendi.`);
            res.json({ 
                success: true, 
                message: "Tüm dosyalar (server.js dahil) başarıyla eşitlendi!" 
            });
        });
    });
});
console.log("⏰ Yedekleme sistemi server.js üzerinde aktif edildi.");

// === BELGENET-ROBOT-SYNC-START ===
// =================================================================
// 🤖 ÇKS - BELGENET TAM OTOMASYON ROBOTU
// =================================================================

/** Belgenet standart dosya planı — konu kodu (autocomplete'te çıkan seçenek) */
const BELGENET_KONU_KODU = '240.02';

// Fonksiyona 3. parametre olarak 'dosya' ekledik


// Butona bastığında bu fonksiyon 'tetiklenir'

const delay = (ms) => new Promise(r => setTimeout(r, ms));

// Robot aynı anda yalnızca bir evrak işlesin (çakışma / tıkanma önleme)
let belgenetRobotMesgul = false;
let belgenetRobotDurduruldu = false;
const belgenetRobotKuyruk = [];

class BelgenetRobotDurdurulduHatasi extends Error {
    constructor() {
        super('Robot kullanıcı tarafından durduruldu.');
        this.kod = 'ROBOT_DURDURULDU';
    }
}

function belgenetRobotKontrol() {
    if (belgenetRobotDurduruldu) throw new BelgenetRobotDurdurulduHatasi();
}

function belgenetRobotDurdurSifirla() {
    belgenetRobotDurduruldu = false;
}

function belgenetRobotDurdur() {
    belgenetRobotDurduruldu = true;
    const iptal = new BelgenetRobotDurdurulduHatasi();
    while (belgenetRobotKuyruk.length > 0) {
        const item = belgenetRobotKuyruk.shift();
        try { item.reject(iptal); } catch (_) { /* yoksay */ }
    }
    console.log('🛑 Belgenet robotu durduruldu — sıradaki işlemler iptal edildi.');
}

async function delayKontrollu(ms) {
    const ek = ms >= 2000 ? 2000 : ms >= 1000 ? 1500 : 1000;
    const adim = 400;
    let kalan = ms + ek;
    while (kalan > 0) {
        belgenetRobotKontrol();
        const parca = Math.min(adim, kalan);
        await delay(parca);
        kalan -= parca;
    }
}

/** Belgenet robot adımları — temel beklemenin üstüne +1–2 sn (aşırı hız hatalarını azaltır) */
function belgenetBekle(ms) {
    const ek = ms >= 2000 ? 2000 : ms >= 1000 ? 1500 : 1000;
    return delay(ms + ek);
}

function belgenetRobotSirayaAl(islem) {
    return new Promise((resolve, reject) => {
        belgenetRobotKuyruk.push({ islem, resolve, reject });
        belgenetRobotKuyruguCalistir();
    });
}

async function belgenetRobotKuyruguCalistir() {
    if (belgenetRobotMesgul || belgenetRobotKuyruk.length === 0) return;
    belgenetRobotMesgul = true;
    const { islem, resolve, reject } = belgenetRobotKuyruk.shift();
    try {
        belgenetRobotKontrol();
        resolve(await islem());
    } catch (e) {
        reject(e);
    } finally {
        belgenetRobotMesgul = false;
        belgenetRobotKuyruguCalistir();
    }
}

function pdfBeklemeSuresiHesapla(sayfa) {
    if (sayfa > 150) return 95000;
    if (sayfa >= 126) return 80000;
    if (sayfa >= 101) return 65000;
    if (sayfa >= 76) return 50000;
    if (sayfa >= 51) return 35000;
    if (sayfa >= 31) return 22000;
    if (sayfa >= 21) return 17000;
    if (sayfa >= 11) return 13000;
    return 7000;
}

const CKS_TARAMA_AG_KOKU = process.env.CKS_TARAMA_AG || '\\\\BAHRIKARLI\\cks\\taramalar';

function pdfYoluNormalize(yol) {
    // UNC yollarında path.resolve KULLANMA — C:\192.168.1.120\... yapıp dosyayı kaybettiriyor
    if (yol.startsWith('\\\\') || yol.startsWith('//')) return yol;
    return path.resolve(yol);
}

function pdfAgYoluOlustur(agKoku, yil, dosyaAdi) {
    const temizKok = agKoku.replace(/[/\\]+$/, '');
    const yilKlasor = `${yil}cks`;
    return [
        `${temizKok}\\${yilKlasor}\\${dosyaAdi}`,
        `${temizKok.replace(/\\/g, '/')}/${yilKlasor}/${dosyaAdi}`,
    ];
}

function pdfYolunuBul(gercekDosyaAdi) {
    const yil = new Date().getFullYear();
    const dosyaAdi = (gercekDosyaAdi || '').trim();
    if (!dosyaAdi) throw new Error('PDF dosya adı boş!');

    console.log(`\n🔍 PDF ARANIYOR: "${dosyaAdi}"`);
    const sa = sistemAyarAl();
    const adaylar = [
        path.join(taramaYilKlasorYol(sa, yil), dosyaAdi),
        path.join(taramaHavuzYol(sa), dosyaAdi),
        ...(CKSPAKET_MOD ? [] : [
            ...pdfAgYoluOlustur(CKS_TARAMA_AG_KOKU, yil, dosyaAdi),
            path.join('C:', 'CKS', 'taramalar', `${yil}cks`, dosyaAdi),
            path.join('C:', 'cks', 'taramalar', `${yil}cks`, dosyaAdi),
        ]),
    ];

    for (let i = 0; i < adaylar.length; i++) {
        const kontrol = pdfYoluNormalize(adaylar[i]);
        try {
            const varMi = fs.existsSync(kontrol);
            console.log(`   [${i + 1}/${adaylar.length}] ${varMi ? '✅ BULUNDU' : '❌ yok'} → ${kontrol}`);
            if (varMi) return kontrol;
        } catch (err) {
            console.log(`   [${i + 1}/${adaylar.length}] ⚠️ hata → ${kontrol} (${err.message})`);
        }
    }

    const klasor = pdfYoluNormalize(`${CKS_TARAMA_AG_KOKU}\\${yil}cks`);
    try {
        const benzer = fs.readdirSync(klasor)
            .filter(f => f.toLowerCase().includes(dosyaAdi.replace(/\.pdf$/i, '').toLowerCase().slice(0, 12)))
            .slice(0, 8);
        console.log(`   📁 Klasörde benzer dosyalar: ${benzer.length ? benzer.join(', ') : '(eşleşme yok)'}`);
    } catch (err) {
        console.log(`   📁 Klasör okunamadı: ${klasor} (${err.message})`);
    }

    throw new Error(
        `PDF dosyası bulunamadı: ${dosyaAdi}\n` +
        `Aranan: ${CKS_TARAMA_AG_KOKU}\\${yil}cks\\${dosyaAdi}`
    );
}

/** Chrome/Puppeteer UNC yolunu okuyamayabiliyor — ağ dosyasını yerel temp'e kopyala */
function pdfYuklemeYoluHazirla(kaynakYol) {
    const abs = pdfYoluNormalize(kaynakYol);
    if (!fs.existsSync(abs)) {
        throw new Error(`PDF okunamadı: ${abs}`);
    }
    const uncMi = abs.startsWith('\\\\') || abs.startsWith('//');
    if (!uncMi) {
        console.log(`📋 PDF yerel yol kullanılıyor: ${abs}`);
        return abs;
    }
    const tmpDir = path.join(require('os').tmpdir(), 'cks-belgenet-pdf');
    fs.mkdirSync(tmpDir, { recursive: true });
    const hedef = path.join(tmpDir, path.basename(abs));
    fs.copyFileSync(abs, hedef);
    console.log(`📋 PDF ağdan yerel kopyalandı: ${abs} → ${hedef}`);
    return hedef;
}

async function pdfSatirindaNaVarMi(targetFrame) {
    return targetFrame.evaluate(() => {
        const midY = window.innerHeight * 0.55;
        for (const row of document.querySelectorAll('tr, li')) {
            if (row.getBoundingClientRect().top > midY) continue;
            const t = row.innerText || '';
            if (/\.pdf/i.test(t) && /\bN\/A\b/i.test(t) && t.length < 400) return true;
        }
        return false;
    });
}

async function ustYaziYuklendiMi(targetFrame) {
    return targetFrame.evaluate(() => {
        const goster = Array.from(document.querySelectorAll('button, span, a')).find(el => {
            const t = (el.textContent || '').trim();
            return t.includes('Üst Yazı Göster') && el.offsetParent !== null;
        });
        if (goster) return true;

        const limit = Array.from(document.querySelectorAll('span, div, label, td')).find(el => {
            const t = (el.textContent || '').trim();
            return t.includes('Dosya boyut üst limiti') && t.length < 80;
        });
        if (limit) {
            let p = limit.closest('table, div, td, fieldset') || limit.parentElement;
            for (let i = 0; i < 6 && p; i++) {
                const t = p.innerText || '';
                if (/\.pdf/i.test(t) && !/\bN\/A\b/i.test(t) && t.length < 800) return true;
                p = p.parentElement;
            }
        }

        const midY = window.innerHeight * 0.55;
        const leftX = window.innerWidth * 0.65;
        for (const el of document.querySelectorAll('tr, li, span, td, div')) {
            const r = el.getBoundingClientRect();
            if (r.top > midY || r.left > leftX) continue;
            const t = el.innerText || '';
            if (/\.pdf/i.test(t) && !/\bN\/A\b/i.test(t) && t.length < 250) return true;
        }
        return false;
    });
}

async function pdfOnizlemeyiAc(targetFrame) {
    await targetFrame.evaluate(() => {
        const btn = [...document.querySelectorAll('button, span, a, div')].find(el => {
            const t = (el.textContent || '').trim();
            return t.includes('Üst Yazı Göster');
        });
        if (btn) btn.click();
    });
}

async function pdfBasarisizSatiriniSil(targetFrame) {
    await targetFrame.evaluate(() => {
        const midY = window.innerHeight * 0.55;
        for (const row of document.querySelectorAll('tr, li')) {
            if (row.getBoundingClientRect().top > midY) continue;
            const t = row.innerText || '';
            if (!/\.pdf/i.test(t) || !/\bN\/A\b/i.test(t)) continue;
            const sil = row.querySelector('button, a, span.ui-icon-closethick, .ui-fileupload-cancel, [title*="Sil"], [title*="Kaldır"]');
            if (sil) { sil.click(); return; }
        }
    });
}

/** Üst Yazı panelindeki (sol üst) Dosya Seç / file input — Evrak Ekleri (sağ alt) hariç */
async function ustYaziDosyaSecTikla(targetFrame) {
    return targetFrame.evaluate(() => {
        function ustYaziAlaniBul() {
            const dialogs = Array.from(document.querySelectorAll('.ui-dialog-content, .ui-dialog, [role="dialog"]'))
                .filter(d => d.offsetParent !== null);
            for (const d of dialogs) {
                const t = d.innerText || '';
                if (/Dosya Seç|Dosya boyut üst limiti|Üst Yazı/i.test(t) && !/Evrak Ekleri/i.test(t)) return d;
            }
            const limit = Array.from(document.querySelectorAll('span, div, label, td')).find(el => {
                const t = (el.textContent || '').trim();
                return t.includes('Dosya boyut üst limiti') && t.length < 80;
            });
            if (limit) {
                let p = limit.closest('table, div, td, fieldset') || limit.parentElement;
                for (let i = 0; i < 6 && p; i++) {
                    if (p.querySelector('input[type="file"]') ||
                        [...p.querySelectorAll('button, span, a')].some(b => (b.textContent || '').includes('Dosya Seç'))) {
                        return p;
                    }
                    p = p.parentElement;
                }
            }
            const ekleBtn = Array.from(document.querySelectorAll('button, span, a, div')).find(el =>
                (el.textContent || '').trim().includes('Üst Yazı Ekle')
            );
            if (ekleBtn) {
                return ekleBtn.closest('td, div, fieldset, table') || ekleBtn.parentElement?.parentElement;
            }
            return null;
        }

        const alan = ustYaziAlaniBul();
        const dosyaSecAday = Array.from(document.querySelectorAll('button, span, label, a, div, input[type="button"]'))
            .filter(el => el.offsetParent !== null)
            .filter(el => {
                const t = (el.textContent || el.value || '').trim();
                return t === 'Dosya Seç' || t.startsWith('Dosya Seç');
            });

        let dosyaSec = null;
        if (alan) {
            dosyaSec = dosyaSecAday.find(el => alan.contains(el));
        }
        if (!dosyaSec && dosyaSecAday.length) {
            dosyaSecAday.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
            dosyaSec = dosyaSecAday[0];
        }
        if (dosyaSec) {
            dosyaSec.click();
            return 'dosya-sec';
        }

        let input = alan ? alan.querySelector('input[type="file"]') : null;
        if (!input) {
            const inputs = Array.from(document.querySelectorAll('input[type="file"]'))
                .filter(i => i.offsetParent !== null);
            inputs.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
            input = inputs[0];
        }
        if (input) {
            input.style.display = 'block';
            input.style.visibility = 'visible';
            input.style.opacity = '1';
            input.click();
            return 'file-input';
        }
        return null;
    });
}

async function ustYaziYukleButonunaBas(targetFrame) {
    await targetFrame.evaluate(() => {
        function ustYaziAlaniBul() {
            const limit = Array.from(document.querySelectorAll('span, div, label, td')).find(el =>
                (el.textContent || '').trim().includes('Dosya boyut üst limiti')
            );
            if (limit) return limit.closest('table, div, td, fieldset') || limit.parentElement;
            return null;
        }
        const alan = ustYaziAlaniBul();
        const yukleAday = Array.from(document.querySelectorAll('button, span, a'))
            .filter(el => el.offsetParent !== null)
            .filter(el => {
                const t = (el.textContent || '').trim().toUpperCase();
                return t === 'YÜKLE' || t === 'UPLOAD';
            });
        let yukle = alan ? yukleAday.find(el => alan.contains(el)) : null;
        if (!yukle && yukleAday.length) {
            yukleAday.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
            yukle = yukleAday[0];
        }
        if (yukle) yukle.click();

        if (window.PrimeFaces && PrimeFaces.widgets) {
            let input = alan ? alan.querySelector('input[type="file"]') : null;
            if (!input) {
                const inputs = Array.from(document.querySelectorAll('input[type="file"]'))
                    .filter(i => i.offsetParent !== null);
                inputs.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
                input = inputs[0];
            }
            if (input) {
                for (const key of Object.keys(PrimeFaces.widgets)) {
                    const w = PrimeFaces.widgets[key];
                    if (w && w.fileinput && w.fileinput[0] === input && typeof w.upload === 'function') {
                        w.upload();
                        break;
                    }
                }
            }
        }
    });
}

async function ustYaziFileInputIndex(targetFrame) {
    return targetFrame.evaluate(() => {
        const inputs = Array.from(document.querySelectorAll('input[type="file"]'))
            .filter(i => i.offsetParent !== null);
        if (!inputs.length) return -1;
        inputs.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
        return inputs.indexOf(inputs[0]);
    });
}

async function belgenetPdfYukle(page, targetFrame, dosyaYolu, sayfaSayisi) {
    const sayfa = parseInt(sayfaSayisi) || 1;
    const absPath = pdfYuklemeYoluHazirla(dosyaYolu);

    for (let deneme = 1; deneme <= 2; deneme++) {
        console.log(`📎 Üst Yazı PDF yükleme (deneme ${deneme}): ${absPath}`);

        await targetFrame.evaluate(() => {
            const btn = Array.from(document.querySelectorAll('button, span, a, div, label')).find(el => {
                const t = (el.textContent || '').trim();
                return t.includes('Üst Yazı Ekle') && !t.includes('Evrak');
            });
            if (btn) btn.click();
        });
        await belgenetBekle(3000);

        const uploadPromise = page.waitForResponse(
            (resp) => {
                const req = resp.request();
                return resp.url().includes('tzob.org.tr') &&
                    req.method() === 'POST' &&
                    resp.status() < 500;
            },
            { timeout: 120000 }
        ).catch(() => null);

        let secildi = false;
        try {
            const [fileChooser] = await Promise.all([
                page.waitForFileChooser({ timeout: 20000 }),
                ustYaziDosyaSecTikla(targetFrame)
            ]);
            await fileChooser.accept([absPath]);
            secildi = true;
            console.log('✅ Üst Yazı — Dosya Seç ile PDF seçildi (sol üst panel)');
        } catch (fcErr) {
            console.log(`⚠️ Üst Yazı Dosya Seç açılamadı (${fcErr.message}), uploadFile deneniyor...`);
            const idx = await ustYaziFileInputIndex(targetFrame);
            const fileInputs = await targetFrame.$$('input[type="file"]');
            const fileInput = idx >= 0 ? fileInputs[idx] : fileInputs[0];
            if (!fileInput) throw new Error('Üst Yazı file input bulunamadı');
            await fileInput.uploadFile(absPath);
            await targetFrame.evaluate(() => {
                const inputs = Array.from(document.querySelectorAll('input[type="file"]'))
                    .filter(i => i.offsetParent !== null);
                inputs.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
                const input = inputs[0];
                if (input) {
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                }
            });
            secildi = true;
            console.log('✅ Üst Yazı — uploadFile ile PDF seçildi (en üstteki input)');
        }

        if (!secildi) throw new Error('Üst Yazı PDF seçilemedi');

        await belgenetBekle(1500);
        await ustYaziYukleButonunaBas(targetFrame);

        const uploadResp = await uploadPromise;
        if (uploadResp) console.log(`✅ Belgenet sunucu yanıtı alındı (${uploadResp.status()})`);

        const minMs = pdfBeklemeSuresiHesapla(sayfa);
        const maxMs = minMs + 90000;
        console.log(`⏳ Üst Yazı işleniyor (${sayfa} sayfa) -> min ${minMs / 1000}s, max ${maxMs / 1000}s`);

        let elapsed = 0;
        while (elapsed < maxMs) {
            belgenetRobotKontrol();
            const hazir = await ustYaziYuklendiMi(targetFrame);
            const naVar = await pdfSatirindaNaVarMi(targetFrame);
            if (hazir && !naVar) {
                await pdfOnizlemeyiAc(targetFrame);
                console.log(`✅ Üst Yazı yüklendi (${Math.round(elapsed / 1000)}s)`);
                return true;
            }
            await delayKontrollu(1500);
            elapsed += 1500;
            if (elapsed % 15000 === 0) {
                console.log(`⌛ Üst Yazı bekleniyor... ${Math.round(elapsed / 1000)}s`);
            }
        }

        console.log(`❌ Deneme ${deneme}: Üst Yazı yüklenemedi`);
        if (deneme < 2) {
            await pdfBasarisizSatiriniSil(targetFrame);
            await belgenetBekle(2000);
        }
    }

    return false;
}

async function alanTemizleVeYaz(page, frame, elementId, metin) {
    if (!elementId || metin == null || metin === '') return;
    const deger = String(metin);
    try {
        await frame.click(`[id="${elementId}"]`, { clickCount: 3 });
        await belgenetBekle(200);
    } catch (_) {
        await frame.evaluate((id) => document.getElementById(id)?.focus(), elementId);
    }
    try {
        await page.keyboard.down('Control');
        await page.keyboard.press('A');
        await page.keyboard.up('Control');
        await page.keyboard.press('Backspace');
        await belgenetBekle(150);
        await page.keyboard.type(deger, { delay: 35 });
    } finally {
        try {
            await page.keyboard.up('Control');
            await page.keyboard.up('Shift');
            await page.keyboard.up('Alt');
        } catch (_) {}
    }
    await belgenetBekle(200);
    await frame.evaluate((id, val) => {
        const el = document.getElementById(id);
        if (!el) return false;
        el.value = val;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new Event('blur', { bubbles: true }));
        return true;
    }, elementId, deger);
    await belgenetBekle(300);
}

/** PrimeFaces LOV — global klavye/blur kullanmadan yalnızca hedef kutuya yazar */
async function belgenetLovAlaniDoldur(frame, elementId, metin) {
    const deger = String(metin || '').trim();
    if (!elementId || !deger) return false;
    const sel = `[id="${String(elementId).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"]`;
    const input = frame.locator(sel);
    try {
        await input.click({ timeout: 5000 });
        await belgenetBekle(120);
        await input.fill('');
        await belgenetBekle(80);
        await input.pressSequentially(deger, { delay: 45 });
    } catch (err) {
        console.log(`⚠️ LOV yazımı locator ile olmadı, DOM deneniyor: ${err.message}`);
        const ok = await frame.evaluate((id, val) => {
            const el = document.getElementById(id) ||
                document.querySelector(`[id="${String(id).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"]`);
            if (!el) return false;
            el.focus();
            el.value = val;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
        }, elementId, deger);
        if (!ok) return false;
    }
    await belgenetBekle(350);
    return true;
}

async function belgenetLovButonTikla(frame, lovTextId) {
    await frame.evaluate((id) => {
        const lovKok = String(id).replace(/:LovText.*$/, '');
        const btn = document.getElementById(`${lovKok}:LovButton`) ||
            document.querySelector(`[id="${lovKok.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}:LovButton"]`);
        btn?.click();
    }, lovTextId);
}

async function belgenetLovListedenSec(frame, aramaParcalari) {
    const parcalar = Array.isArray(aramaParcalari) ? aramaParcalari : [aramaParcalari];
    return frame.evaluate((parts) => {
        const ps = parts.map((p) => String(p || '').toLocaleUpperCase('tr-TR')).filter(Boolean);
        if (!ps.length) return false;
        const gorunur = (el) => {
            if (!el) return false;
            if (el.classList?.contains('ui-helper-hidden')) return false;
            const st = getComputedStyle(el);
            const r = el.getBoundingClientRect();
            return st.display !== 'none' && st.visibility !== 'hidden' && r.width > 8 && r.height > 8;
        };
        const kokler = [];
        for (const p of document.querySelectorAll('.ui-autocomplete-panel, .ui-autocomplete-items, .ui-lov-panel, .ui-dialog, [role="dialog"]')) {
            if (gorunur(p)) kokler.push(p);
        }
        if (!kokler.length) kokler.push(document.body);
        const elms = [];
        for (const kok of kokler) {
            elms.push(...kok.querySelectorAll(
                'li.ui-autocomplete-item, .ui-autocomplete-item, .lovItemTitle, .lovItemDetail, ' +
                '.ui-selectonemenu-items li, .ui-datalist-item, tr.ui-widget-content, .ui-lov-table tr'
            ));
            for (const parca of kok.querySelectorAll('.lovItemTitle, .lovItemDetail')) {
                const satir = parca.closest('li.ui-autocomplete-item, tr, li, div.ui-autocomplete-item');
                if (satir && gorunur(satir)) elms.push(satir);
            }
        }
        const esles = (el) => {
            const txt = (el.innerText || el.textContent || '').toLocaleUpperCase('tr-TR');
            if (ps.length > 1 && ps.every((p) => txt.includes(p))) return true;
            return ps.some((p) => txt.includes(p));
        };
        const h = elms.find((el) => gorunur(el) && esles(el));
        if (!h) return false;
        const tikla = h.closest('li.ui-autocomplete-item, tr, li') || h;
        tikla.scrollIntoView({ block: 'center' });
        tikla.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
        tikla.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
        tikla.click();
        if (tikla.closest('.ui-dialog')) {
            tikla.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, view: window }));
            const dlg = tikla.closest('.ui-dialog');
            const secBtn = dlg && Array.from(dlg.querySelectorAll('.ui-button, button, a, span.ui-button')).find((b) => {
                const t = (b.innerText || b.textContent || b.value || '').trim().toLocaleUpperCase('tr-TR');
                return t === 'SEÇ' || t === 'SEC' || t === 'TAMAM' || t === 'OK' || t.includes('SEÇ');
            });
            secBtn?.click();
        }
        return true;
    }, parcalar);
}

/** Ad * zorunlu alanını bul (2. satır = Vergi/Kısa Ad altındaki tek input) */
async function tuzelKisiAdInputIdBul(frame) {
    return frame.evaluate(() => {
        const gorunur = (el) => {
            if (!el) return false;
            const r = el.getBoundingClientRect();
            return r.width > 20 && r.height > 10 && getComputedStyle(el).display !== 'none';
        };
        const dialog = Array.from(document.querySelectorAll('.ui-dialog')).find((d) =>
            gorunur(d) && (d.innerText || '').includes('Tüzel Kişi')
        );
        if (!dialog) return null;

        const satirMetni = (inp) => (inp.closest('tr')?.innerText || '').replace(/\s+/g, ' ');

        const adaylar = Array.from(dialog.querySelectorAll('input[type="text"]')).filter((inp) => {
            if (!gorunur(inp) || inp.readOnly) return false;
            const satir = satirMetni(inp);
            if (/Ülke|İlçe|E-Posta|Telefon|Faks|Adres|Mobil|Kısa Ad|Vergi\/SGK|Tüzel Kişi Tipi/.test(satir)) return false;
            return true;
        });

        // Etiket satırı
        for (const tr of dialog.querySelectorAll('tr')) {
            const satir = (tr.innerText || '').replace(/\s+/g, ' ');
            if (!/\bAd\b/.test(satir) || satir.includes('Kısa Ad') || satir.includes('Adres')) continue;
            if (satir.includes('Tüzel Kişi Tipi')) continue;
            const inp = tr.querySelector('input[type="text"], textarea');
            if (inp?.id) return inp.id;
        }

        // Konum: 2. yatay satırdaki tek input (Ad satırı)
        const byTop = new Map();
        for (const inp of adaylar) {
            const top = Math.round(inp.getBoundingClientRect().top / 8) * 8;
            if (!byTop.has(top)) byTop.set(top, []);
            byTop.get(top).push(inp);
        }
        const tops = [...byTop.keys()].sort((a, b) => a - b);
        if (tops.length >= 2) {
            const adRow = byTop.get(tops[1]);
            if (adRow?.length >= 1) {
                adRow.sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left);
                return adRow[0].id;
            }
        }
        if (adaylar.length >= 3) return adaylar[2].id;
        return null;
    });
}

/** Ad * zorunlu alanını doldur */
async function tuzelKisiAdAlaniDoldur(page, frame, sirketAdi) {
    const ad = (sirketAdi || '').trim();
    if (!ad) return false;

    for (let deneme = 1; deneme <= 5; deneme++) {
        const adId = await tuzelKisiAdInputIdBul(frame);
        if (!adId) {
            console.log(`⚠️ Ad * alanı bulunamadı (${deneme}. deneme)`);
            await belgenetBekle(500);
            continue;
        }

        console.log(`✍️ Ad * dolduruluyor (${deneme}. deneme): ${adId}`);
        await alanTemizleVeYaz(page, frame, adId, ad);
        await belgenetBekle(600);

        const dolu = await frame.evaluate((id, beklenen) => {
            const el = document.getElementById(id);
            const v = (el?.value || '').trim();
            return v.length > 5 && beklenen.startsWith(v.substring(0, 8)) || v.length > 10;
        }, adId, ad);

        if (dolu) {
            console.log('✅ Ad * alanı dolduruldu');
            return true;
        }
    }
    return false;
}

/** Konu metin alanı id'sini bul */
async function belgenetKonuInputIdBul(frame) {
    return frame.evaluate(() => {
        const etiketler = Array.from(document.querySelectorAll('label, td, span, th'));
        const konuEtiketi = etiketler.find((l) => {
            const t = (l.innerText || l.textContent || '').trim().replace(/\s*\*+\s*$/, '').trim();
            return t === 'Konu';
        });
        if (konuEtiketi) {
            const satir = konuEtiketi.closest('tr') || konuEtiketi.parentElement?.parentElement;
            const input = satir?.querySelector('textarea, input[type="text"]');
            if (input?.id) return input.id;
        }
        const inp = document.querySelector('textarea[id*="konu"], input[id*="konu"]:not([id*="konuKodu"]):not([id*="standartDosyaPlani"])');
        return inp?.id || null;
    });
}

/** Belgenet "Konu Kodu" kutusunun id'sini bul (240.02 standart dosya planı) */
async function belgenetKonuKoduInputIdBul(frame) {
    return frame.evaluate(() => {
        const kullanilabilir = (el) => {
            if (!el || el.type === 'hidden' || el.disabled) return false;
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.height > 0;
        };
        for (const sel of [
            'input[id*="konuKodu_input"]',
            'input[id*="konuKodu"]',
            'input[id*="standartDosyaPlani"]',
            'input[id*="StandartDosyaPlani"]'
        ]) {
            const el = document.querySelector(sel);
            if (kullanilabilir(el) && el.id) return el.id;
        }
        const etiketler = Array.from(document.querySelectorAll('label, td, span, th'));
        const etiket = etiketler.find((l) => {
            const t = (l.innerText || l.textContent || '').trim().replace(/\s*\*+\s*$/, '').trim();
            return t === 'Konu Kodu';
        });
        if (etiket) {
            const forId = etiket.getAttribute('for');
            if (forId) {
                const el = document.getElementById(forId);
                if (kullanilabilir(el)) return forId;
            }
            const satir = etiket.closest('tr') || etiket.parentElement?.parentElement;
            const input = satir?.querySelector('input[type="text"]');
            if (kullanilabilir(input) && input.id) return input.id;
        }
        return null;
    });
}

/** Açılan Konu Kodu listesinden 240.02 / Çiftçi Kayıt Sistemi satırını seç */
async function belgenetKonuKoduListedenSec(frame) {
    const kod = BELGENET_KONU_KODU;
    const yil = String(new Date().getFullYear());
    const aramaDenemeleri = [
        [kod, 'Çiftçi Kayıt Sistemi Başvuru'],
        [kod, 'Çiftçi Kayıt Sistemi'],
        [yil, kod, 'Başvuru'],
        [kod]
    ];
    for (const parcalar of aramaDenemeleri) {
        if (await belgenetLovListedenSec(frame, parcalar)) return true;
    }
    return frame.evaluate((k) => {
        const gorunur = (el) => {
            if (!el) return false;
            const st = getComputedStyle(el);
            const r = el.getBoundingClientRect();
            return st.display !== 'none' && st.visibility !== 'hidden' && r.width > 8 && r.height > 8;
        };
        const adaylar = [];
        for (const p of document.querySelectorAll('.ui-autocomplete-panel, .ui-autocomplete-items, .ui-lov-panel, .ui-dialog')) {
            if (!gorunur(p)) continue;
            adaylar.push(...p.querySelectorAll('li.ui-autocomplete-item, tr.ui-widget-content, .ui-lov-table tr'));
        }
        const hedef = adaylar.find((el) => {
            if (!gorunur(el)) return false;
            const txt = (el.innerText || el.textContent || '').toLocaleUpperCase('tr-TR');
            return txt.includes(k.toLocaleUpperCase('tr-TR')) &&
                (txt.includes('ÇIFTÇI') || txt.includes('CIFTCI')) &&
                txt.includes('KAYIT');
        }) || adaylar.find((el) => gorunur(el) && (el.innerText || '').includes(k));
        if (!hedef) return false;
        const tikla = hedef.closest('li.ui-autocomplete-item, tr, li') || hedef;
        tikla.scrollIntoView({ block: 'center' });
        tikla.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
        tikla.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
        tikla.click();
        tikla.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, view: window }));
        return true;
    }, kod);
}

/** Konu Kodu alanına BELGENET_KONU_KODU (240.02) yazar ve listeden seçer */
async function belgenetKonuKoduDoldur(page, targetFrame) {
    const kod = BELGENET_KONU_KODU;
    console.log(`📋 Konu Kodu (${kod}) giriliyor...`);

    let inputId = null;
    for (let deneme = 1; deneme <= 5; deneme++) {
        inputId = await belgenetKonuKoduInputIdBul(targetFrame);
        if (inputId) break;
        await belgenetBekle(1000);
    }
    if (!inputId) {
        console.log('❌ Konu Kodu kutusu bulunamadı!');
        return false;
    }

    await alanTemizleVeYaz(page, targetFrame, inputId, kod);
    await targetFrame.evaluate((id) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowDown' }));
        el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'ArrowDown' }));
    }, inputId);

    console.log('⏳ Konu Kodu listesi bekleniyor...');
    let konuTiklandiMi = false;
    for (let deneme = 1; deneme <= 6; deneme++) {
        await belgenetBekle(deneme === 1 ? 2500 : 1000);
        if (await belgenetKonuKoduListedenSec(targetFrame)) {
            konuTiklandiMi = true;
            console.log(`✅ Konu Kodu listeden seçildi (${deneme}. deneme)`);
            break;
        }
    }

    if (!konuTiklandiMi) {
        console.log('⚠️ Konu menüsü tıklanamadı, B Planı (Klavye) devreye giriyor...');
        try {
            await targetFrame.focus(`[id="${inputId}"]`);
        } catch (_) { /* yoksay */ }
        await page.keyboard.press('ArrowDown');
        await belgenetBekle(700);
        await page.keyboard.press('Enter');
    }
    await belgenetBekle(1500);

    const dogruMu = await targetFrame.evaluate((id, k) => {
        const el = document.getElementById(id);
        const v = (el?.value || '').trim();
        return v.includes(k);
    }, inputId, kod);

    if (!dogruMu) {
        console.log('⚠️ Konu Kodu doğrulanamadı, klavye ile tekrar deneniyor...');
        await targetFrame.focus(`[id="${inputId}"]`);
        await page.keyboard.press('ArrowDown');
        await belgenetBekle(500);
        await page.keyboard.press('Enter');
        await belgenetBekle(1000);
    }
    return true;
}

async function belgenetHavaleInputIdBul(frame) {
    for (let deneme = 1; deneme <= 8; deneme++) {
        const id = await frame.evaluate(() => {
            const idIleBul = (rawId) => {
                if (!rawId) return null;
                return document.getElementById(rawId) ||
                    document.querySelector(`[id="${String(rawId).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"]`);
            };
            const kullanilabilirInput = (el) => {
                if (!el || el.type === 'hidden' || el.disabled) return false;
                const r = el.getBoundingClientRect();
                return r.width > 0 && r.height > 0;
            };
            const etiketEsles = (text) => {
                const t = String(text || '').toLocaleUpperCase('tr-TR').replace(/\s+/g, ' ').trim();
                return t === 'KIŞIYE HAVALE' || t === 'KISIYE HAVALE' ||
                    t.includes('KIŞIYE HAVALE') || t.includes('KISIYE HAVALE') ||
                    t.includes('HAVALE EDILECEK') || t.includes('HAVALE EDILEN') ||
                    (t.includes('HAVALE') && t.includes('KISI'));
            };

            const sabitIdler = [
                'evrakBilgileriForm:dagitimBilgileriKullaniciLov:LovText',
                'evrakBilgileriForm:dagitimBilgileriKullaniciLov:LovText_input'
            ];
            for (const sabit of sabitIdler) {
                const el = idIleBul(sabit);
                if (kullanilabilirInput(el)) return sabit;
            }
            for (const el of Array.from(document.querySelectorAll(
                'input[id*="dagitimBilgileriKullaniciLov"], input[id*="KullaniciLov"][id*="LovText"]'
            ))) {
                if (kullanilabilirInput(el) && el.id) return el.id;
            }

            for (const etiket of Array.from(document.querySelectorAll('label'))) {
                const forId = etiket.getAttribute('for');
                if (forId && (forId.includes('KullaniciLov') || forId.includes('dagitimBilgileri'))) {
                    const el = idIleBul(forId);
                    if (kullanilabilirInput(el)) return forId;
                }
                const metin = (etiket.innerText || etiket.textContent || '').trim();
                if (!metin || !etiketEsles(metin)) continue;
                if (forId) {
                    const el = idIleBul(forId);
                    if (kullanilabilirInput(el)) return forId;
                }
            }

            for (const etiket of Array.from(document.querySelectorAll('td, span, div'))) {
                const metin = (etiket.innerText || etiket.textContent || '').trim();
                if (!metin || !etiketEsles(metin)) continue;
                const satir = etiket.closest('tr') || etiket.closest('.ui-g') || etiket.parentElement;
                if (!satir) continue;
                const input = satir.querySelector(
                    'input[type="text"], input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), textarea'
                );
                if (kullanilabilirInput(input) && input.id) return input.id;
            }

            for (const sel of ['input[id*="Havale"]', 'input[id*="havale"]', 'input[id*="devir"]', 'input[id*="Devreden"]']) {
                const el = document.querySelector(sel);
                if (kullanilabilirInput(el) && el.id) return el.id;
            }
            return null;
        });
        if (id) return id;
        if (deneme < 8) await belgenetBekle(1000);
    }
    return null;
}

/** Tanımlamalardan Kişiye Havale arama metni (adın ilk 3 harfi) + listede eşleşecek parçalar */
function belgenetHavaleAyarAl() {
    const varsayilanAd = String(process.env.BELGENET_HAVALE_KISI || 'BAHRİ KARLI').trim();
    const ad = String(sistemAyarAl()?.belgenetHavaleKisiAdi || varsayilanAd).trim() || varsayilanAd;
    const upper = ad.toLocaleUpperCase('tr-TR');
    const kelimeler = upper.split(/\s+/).filter(Boolean);
    const ilk = kelimeler[0] || 'BAH';
    let arama = ilk.substring(0, 3).toLocaleUpperCase('tr-TR');
    if (arama.length < 3) arama = 'BAH';
    const secim = [...new Set([
        ...(kelimeler.length >= 2 ? [kelimeler[kelimeler.length - 1], kelimeler[0]] : kelimeler),
        'KARLI', 'BAHRİ', 'BAHRI'
    ].filter(Boolean))];
    return { ad, arama, secim };
}

/** Kişiye Havale — orijinal sade akış (doğru alan ID + gerçek tıklama) */
async function belgenetKisiyeHavaleDoldur(page, frame) {
    const { ad, arama, secim } = belgenetHavaleAyarAl();
    console.log(`👤 'Kişiye Havale' kutusu aranıyor (${ad}, arama: ${arama})...`);
    const havaleId = await belgenetHavaleInputIdBul(frame);
    if (!havaleId) {
        console.log('❌ Kişiye Havale alanı bulunamadı — robot bu adımı atladı!');
        return;
    }
    const sel = `[id="${String(havaleId).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"]`;
    console.log(`🎯 Kişiye Havale alanı: ${havaleId}`);
    try {
        await frame.focus(sel);
    } catch (_) {
        await frame.click(sel).catch(() => {});
    }
    await belgenetBekle(2000);

    console.log(`🎯 Kişiye Havale için '${arama}' yazılıyor...`);
    await page.keyboard.type(arama, { delay: 380 });

    console.log('⏳ Personel listesinin açılması için RADAR devrede...');
    let personelTiklandiMi = false;
    for (let deneme = 1; deneme <= 12; deneme++) {
        await belgenetBekle(2000);
        const hedefMetin = await frame.evaluate((parcalari) => {
            const elemanlar = Array.from(document.querySelectorAll('.lovItemTitle, .lovItemDetail, .ui-autocomplete-item, li.ui-autocomplete-item'));
            const hedef = elemanlar.find((el) => {
                const t = (el.innerText || el.textContent || '').toUpperCase();
                return parcalari.some((p) => t.includes(p)) && el.offsetParent !== null;
            });
            if (!hedef) return null;
            hedef.setAttribute('data-cks-havale-hedef', '1');
            return (hedef.innerText || hedef.textContent || '').trim();
        }, secim);
        if (hedefMetin) {
            const handle = await frame.$('[data-cks-havale-hedef="1"]');
            if (handle) {
                try {
                    await handle.click({ delay: 100 });
                } finally {
                    await handle.dispose().catch(() => {});
                }
            }
            await frame.evaluate(() => {
                document.querySelector('[data-cks-havale-hedef="1"]')?.removeAttribute('data-cks-havale-hedef');
            }).catch(() => {});
            console.log(`✅ [${deneme}. denemede] '${hedefMetin}' seçildi`);
            personelTiklandiMi = true;
            break;
        }
    }
    if (!personelTiklandiMi) {
        console.log('⚠️ Menü tıklanamadı, klavye Enter deneniyor...');
        try {
            await frame.focus(sel);
            await belgenetBekle(500);
            await page.keyboard.press('ArrowDown');
            await belgenetBekle(1200);
            await page.keyboard.press('Enter');
        } catch (_) {}
    }
}

/** Konu alanına yaz ve doğrula */
async function belgenetKonuYaz(page, frame, metin) {
    if (!metin) return false;
    let konuId = await belgenetKonuInputIdBul(frame);
    if (!konuId) {
        console.log('⚠️ Konu alanı bulunamadı');
        return false;
    }
    await alanTemizleVeYaz(page, frame, konuId, metin);
    await belgenetBekle(300);
    const dolu = await frame.evaluate((id, beklenen) => {
        const el = document.getElementById(id);
        return (el?.value || '').trim().length > 0 && (el.value || '').includes(beklenen.slice(0, 8));
    }, konuId, metin);
    if (dolu) console.log(`✅ Konu yazıldı: ${metin}`);
    else console.log('⚠️ Konu yazılamadı, tekrar deneniyor...');
    return dolu;
}

/** Kişi-Kurum → Tüzel Kişi seç */
async function belgenetKisiKurumTuzelSec(frame) {
    return frame.evaluate(() => {
        const select = document.querySelector('select[id$=":kisiKurum"], select[id*="kisiKurum"]');
        if (select) {
            const opt = Array.from(select.options).find((o) => /Tüzel\s*Kişi/i.test(o.text));
            if (opt) {
                select.value = opt.value;
                select.dispatchEvent(new Event('change', { bubbles: true }));
                return select.options[select.selectedIndex]?.text?.includes('Tüzel') || false;
            }
        }
        const menu = document.querySelector('.ui-selectonemenu[id*="kisiKurum"]');
        if (menu && window.jQuery) {
            const sel = menu.querySelector('select');
            if (sel) {
                const opt = Array.from(sel.options).find((o) => /Tüzel/i.test(o.text));
                if (opt) {
                    window.jQuery(sel).val(opt.value).trigger('change');
                    const lb = menu.querySelector('.ui-selectonemenu-label');
                    if (lb) lb.textContent = opt.text;
                    return true;
                }
            }
        }
        return false;
    });
}

async function belgenetKisiKurumTuzelMi(frame) {
    return frame.evaluate(() => {
        const select = document.querySelector('select[id$=":kisiKurum"], select[id*="kisiKurum"]');
        if (select) return (select.options[select.selectedIndex]?.text || '').includes('Tüzel');
        const lb = document.querySelector('[id*="kisiKurum_label"]');
        return (lb?.textContent || '').includes('Tüzel');
    });
}

/** Kişi-Kurum → Gerçek Kişi seç */
async function belgenetKisiKurumGercekSec(frame) {
    return frame.evaluate(() => {
        const select = document.querySelector('select[id$=":kisiKurum"], select[id*="kisiKurum"]');
        if (select) {
            const opt = Array.from(select.options).find((o) => /Gerçek\s*Kişi/i.test(o.text));
            if (opt) {
                select.value = opt.value;
                select.dispatchEvent(new Event('change', { bubbles: true }));
                return (select.options[select.selectedIndex]?.text || '').includes('Gerçek');
            }
        }
        const menu = document.querySelector('.ui-selectonemenu[id*="kisiKurum"]');
        if (menu && window.jQuery) {
            const sel = menu.querySelector('select');
            if (sel) {
                const opt = Array.from(sel.options).find((o) => /Gerçek/i.test(o.text));
                if (opt) {
                    window.jQuery(sel).val(opt.value).trigger('change');
                    const lb = menu.querySelector('.ui-selectonemenu-label');
                    if (lb) lb.textContent = opt.text;
                    return true;
                }
            }
        }
        return false;
    });
}

async function belgenetKisiKurumGercekMi(frame) {
    return frame.evaluate(() => {
        const select = document.querySelector('select[id$=":kisiKurum"], select[id*="kisiKurum"]');
        if (select) return (select.options[select.selectedIndex]?.text || '').includes('Gerçek');
        const lb = document.querySelector('[id*="kisiKurum_label"]');
        return (lb?.textContent || '').includes('Gerçek');
    });
}

/** Şahıs (gerçek kişi) formu kaydet öncesi kontrol */
async function belgenetSahisFormDurumu(frame, { konuMetni, tc }) {
    return frame.evaluate(({ konuMetni, tc }) => {
        const sorunlar = [];
        const konuEl = document.querySelector('textarea[id*="konu"], input[id*="konu"]:not([id*="konuKodu"]):not([id*="standartDosyaPlani"])')
            || (() => {
                const etiketler = Array.from(document.querySelectorAll('label, td, span'));
                const e = etiketler.find((l) => (l.innerText || '').trim().replace(/\s*\*+$/, '') === 'Konu');
                return e?.closest('tr')?.querySelector('textarea, input[type="text"]');
            })();
        if (!konuEl?.value?.trim()) sorunlar.push('konu-bos');
        else if (konuMetni && !konuEl.value.includes(konuMetni.slice(0, 6))) sorunlar.push('konu-yanlis');

        const kk = document.querySelector('select[id*="kisiKurum"]');
        const kkMetin = kk?.options[kk.selectedIndex]?.text || document.querySelector('[id*="kisiKurum_label"]')?.textContent || '';
        if (!/Gerçek/i.test(kkMetin)) sorunlar.push('kisiKurum-tuzel');

        const gercekInp = document.querySelector('input[id*="GercekKisi"]');
        if (tc && gercekInp && !gercekInp.value?.includes(tc)) sorunlar.push('kisi-secilmedi');

        return { ok: sorunlar.length === 0, sorunlar };
    }, { konuMetni, tc });
}

/** Şahıs formu eksik alanları düzelt */
async function belgenetSahisFormuDuzelt(page, frame, { konuMetni, tc }) {
    const durum = await belgenetSahisFormDurumu(frame, { konuMetni, tc });
    if (durum.ok) return true;

    console.log(`🔧 [ŞAHIS] Form düzeltiliyor: ${durum.sorunlar.join(', ')}`);

    if (durum.sorunlar.includes('konu-bos') || durum.sorunlar.includes('konu-yanlis')) {
        await belgenetKonuYaz(page, frame, konuMetni);
    }
    if (durum.sorunlar.includes('kisiKurum-tuzel')) {
        for (let i = 0; i < 3; i++) {
            await belgenetKisiKurumGercekSec(frame);
            await belgenetBekle(600);
            if (await belgenetKisiKurumGercekMi(frame)) break;
        }
    }
    if (durum.sorunlar.includes('kisi-secilmedi') && tc) {
        const aramaId = await frame.evaluate(() => document.querySelector('input[id*="GercekKisi"]')?.id || null);
        if (aramaId) {
            await alanTemizleVeYaz(page, frame, aramaId, tc);
            await belgenetBekle(800);
            await frame.evaluate((no) => {
                const elms = Array.from(document.querySelectorAll('.lovItemTitle, .lovItemDetail, .ui-autocomplete-item'));
                const h = elms.find((e) => e.innerText.includes(no) && e.offsetParent !== null);
                h?.click();
            }, tc);
        }
    }

    await belgenetBekle(400);
    const son = await belgenetSahisFormDurumu(frame, { konuMetni, tc });
    if (!son.ok) console.log(`⚠️ [ŞAHIS] Form hâlâ eksik: ${son.sorunlar.join(', ')}`);
    return son.ok;
}

/** Şirket formu kaydet öncesi kontrol */
async function belgenetSirketFormDurumu(frame, { konuMetni, vkn }) {
    return frame.evaluate(({ konuMetni, vkn }) => {
        const sorunlar = [];
        const konuEl = document.querySelector('textarea[id*="konu"], input[id*="konu"]:not([id*="konuKodu"]):not([id*="standartDosyaPlani"])')
            || (() => {
                const etiketler = Array.from(document.querySelectorAll('label, td, span'));
                const e = etiketler.find((l) => (l.innerText || '').trim().replace(/\s*\*+$/, '') === 'Konu');
                const satir = e?.closest('tr');
                return satir?.querySelector('textarea, input[type="text"]');
            })();
        if (!konuEl?.value?.trim()) sorunlar.push('konu-bos');
        else if (konuMetni && !konuEl.value.includes(konuMetni.slice(0, 6))) sorunlar.push('konu-yanlis');

        const kk = document.querySelector('select[id*="kisiKurum"]');
        const kkMetin = kk?.options[kk.selectedIndex]?.text || document.querySelector('[id*="kisiKurum_label"]')?.textContent || '';
        if (!/Tüzel/i.test(kkMetin)) sorunlar.push('kisiKurum-gercek');

        const tuzelInp = document.querySelector('input[id*="TuzelKisi"]');
        if (vkn && tuzelInp && !tuzelInp.value?.includes(vkn)) sorunlar.push('sirket-secilmedi');

        return { ok: sorunlar.length === 0, sorunlar };
    }, { konuMetni, vkn });
}

/** Eksik alanları otomatik düzelt (kaydet öncesi) */
async function belgenetSirketFormuDuzelt(page, frame, { konuMetni, vkn }) {
    const durum = await belgenetSirketFormDurumu(frame, { konuMetni, vkn });
    if (durum.ok) return true;

    console.log(`🔧 Form düzeltiliyor: ${durum.sorunlar.join(', ')}`);

    if (durum.sorunlar.includes('konu-bos') || durum.sorunlar.includes('konu-yanlis')) {
        await belgenetKonuYaz(page, frame, konuMetni);
    }
    if (durum.sorunlar.includes('kisiKurum-gercek')) {
        for (let i = 0; i < 3; i++) {
            await belgenetKisiKurumTuzelSec(frame);
            await belgenetBekle(600);
            if (await belgenetKisiKurumTuzelMi(frame)) break;
        }
    }
    if (durum.sorunlar.includes('sirket-secilmedi') && vkn) {
        const aramaId = await frame.evaluate(() => document.querySelector('input[id*="TuzelKisi"]')?.id || null);
        if (aramaId) {
            await alanTemizleVeYaz(page, frame, aramaId, vkn);
            await belgenetBekle(800);
            await frame.evaluate((no) => {
                const elms = Array.from(document.querySelectorAll('.lovItemTitle, .lovItemDetail, .ui-autocomplete-item'));
                const h = elms.find((e) => e.innerText.includes(no) && e.offsetParent !== null);
                h?.click();
            }, vkn);
        }
    }

    await belgenetBekle(400);
    const son = await belgenetSirketFormDurumu(frame, { konuMetni, vkn });
    if (!son.ok) console.log(`⚠️ Form hâlâ eksik: ${son.sorunlar.join(', ')}`);
    return son.ok;
}

/** Tüzel Kişi Kaydet dialog'unun bulunduğu frame'i ara (dialog genelde ana frame'de) */
async function belgenetDialogFrameBul(page, targetFrame, baslikParca = 'Tüzel Kişi') {
    const frames = [...new Set([page.mainFrame(), targetFrame, ...page.frames()].filter(Boolean))];
    for (let deneme = 0; deneme < 20; deneme++) {
        for (const frame of frames) {
            try {
                const bulundu = await frame.evaluate((parca) => {
                    const gorunur = (el) => {
                        if (!el) return false;
                        const r = el.getBoundingClientRect();
                        const st = getComputedStyle(el);
                        return r.width > 50 && r.height > 50 && st.display !== 'none' && st.visibility !== 'hidden';
                    };
                    for (const d of document.querySelectorAll('.ui-dialog')) {
                        if (!gorunur(d)) continue;
                        const baslik = d.querySelector('.ui-dialog-title');
                        const metin = (baslik?.innerText || d.innerText || '').trim();
                        if (metin.includes(parca)) return true;
                    }
                    return false;
                }, baslikParca);
                if (bulundu) {
                    console.log(`✅ Dialog frame bulundu (${baslikParca})`);
                    return frame;
                }
            } catch (_) { /* frame erişilemez */ }
        }
        await belgenetBekle(500);
    }
    console.log('⚠️ Dialog frame bulunamadı, varsayılan frame kullanılıyor');
    return targetFrame;
}

function tuzelKisiAlanlariBulScript() {
    const gorunur = (el) => {
        if (!el) return false;
        const r = el.getBoundingClientRect();
        const st = getComputedStyle(el);
        return r.width > 20 && r.height > 10 && st.display !== 'none' && st.visibility !== 'hidden';
    };

    let dialog = null;
    for (const d of document.querySelectorAll('.ui-dialog')) {
        if (!gorunur(d)) continue;
        const baslik = (d.querySelector('.ui-dialog-title')?.innerText || d.innerText || '');
        if (baslik.includes('Tüzel Kişi')) { dialog = d; break; }
    }
    if (!dialog) {
        dialog = Array.from(document.querySelectorAll('.ui-dialog')).find(gorunur) || null;
    }
    if (!dialog) return {};

    const satirMetni = (inp) => (inp.closest('tr')?.innerText || inp.closest('.ui-panelgrid')?.innerText || '').replace(/\s+/g, ' ');

    const ustAlanInputlari = Array.from(dialog.querySelectorAll('input[type="text"]'))
        .filter((inp) => {
            if (!gorunur(inp) || inp.readOnly) return false;
            const satir = satirMetni(inp);
            if (/Ülke|^İl[^ç]|İlçe|E-Posta|Telefon|Faks|Adres|Mobil|Web/.test(satir)) return false;
            if (inp.closest('.ui-selectonemenu')) return false;
            return true;
        })
        .sort((a, b) => {
            const ra = a.getBoundingClientRect();
            const rb = b.getBoundingClientRect();
            if (Math.abs(ra.top - rb.top) > 12) return ra.top - rb.top;
            return ra.left - rb.left;
        });

    // Vergi + Kısa Ad: ekran konumu (1. satır sol/sağ)
    const vergiId = ustAlanInputlari[0]?.id || null;
    const kisaAdId = ustAlanInputlari[1]?.id || null;

    // Ad *: mutlaka etiket satırından bul (3. sıradaki input yanlış olabiliyor)
    let adId = null;
    for (const tr of dialog.querySelectorAll('tr')) {
        const hucreler = Array.from(tr.querySelectorAll('label, td, th, span.ui-outputlabel'));
        const adEtiketi = hucreler.some((el) => {
            const t = (el.innerText || el.textContent || '').trim();
            return t === 'Ad *' || /^Ad\s*\*$/i.test(t);
        });
        if (!adEtiketi) continue;
        const inp = tr.querySelector('input[type="text"], textarea, input:not([type="hidden"]):not([readonly])');
        if (inp?.id) { adId = inp.id; break; }
    }

    if (!adId) {
        for (const tr of dialog.querySelectorAll('tr')) {
            const satir = (tr.innerText || '').replace(/\s+/g, ' ');
            if (!/\bAd\s*\*/.test(satir) || satir.includes('Kısa Ad') || satir.includes('Vergi/SGK')) continue;
            const inp = tr.querySelector('input[type="text"], textarea');
            if (inp?.id) { adId = inp.id; break; }
        }
    }

    return { vergiId, kisaAdId, adId, dialogVar: true };
}

/** Tüzel Kişi Kaydet penceresini doldurur: vergi no, Ad *, tip=DİĞER, Kaydet (Kısa Ad boş) */
async function belgenetTuzelKisiHizliKayit(page, targetFrame, vergiNo, sirketAdi) {
    const ad = (sirketAdi || 'BİLİNMEYEN ŞİRKET').trim();

    console.log(`🏢 Tüzel Kişi formu dolduruluyor: VKN=${vergiNo}, Ad=${ad}`);

    const dialogFrame = await belgenetDialogFrameBul(page, targetFrame, 'Tüzel Kişi Kaydet');
    await belgenetBekle(500);

    let alanlar = await dialogFrame.evaluate(tuzelKisiAlanlariBulScript);
    if (!alanlar.dialogVar || !alanlar.vergiId) {
        for (const frame of [page.mainFrame(), targetFrame, ...page.frames()]) {
            try {
                const a = await frame.evaluate(tuzelKisiAlanlariBulScript);
                if (a.dialogVar && a.vergiId) { alanlar = a; break; }
            } catch (_) {}
        }
    }

    console.log('📋 Form alanları:', JSON.stringify({ vergiId: alanlar.vergiId, adId: alanlar.adId }));

    if (!alanlar.vergiId) {
        throw new Error('Tüzel Kişi form alanları bulunamadı — dialog açık mı kontrol edin');
    }

    const aktifFrame = dialogFrame;
    const temizVkn = String(vergiNo).replace(/\D/g, '');

    // 1) Sadece Vergi No
    await alanTemizleVeYaz(page, aktifFrame, alanlar.vergiId, temizVkn);
    await belgenetBekle(400);

    // 2) Kısa Ad ZORUNLU DEĞİL — dokunma. Tam şirket adını Ad * alanına yaz
    const adDoldu = await tuzelKisiAdAlaniDoldur(page, aktifFrame, ad);
    if (!adDoldu) {
        throw new Error('Ad * (şirket adı) alanı doldurulamadı');
    }
    await belgenetBekle(150);

    // 3) Tüzel Kişi Tipi → DİĞER (zaten seçiliyse atla)
    if (await tuzelKisiTipiDigerMi(aktifFrame)) {
        console.log('✅ Tüzel Kişi Tipi zaten DİĞER');
    } else {
        console.log('⚙️ Tüzel Kişi Tipi → DİĞER seçiliyor...');
        let tipSecildi = false;
        for (let d = 1; d <= 3; d++) {
            tipSecildi = await tuzelKisiTipiDigerSec(page, aktifFrame);
            if (tipSecildi) break;
            console.log(`⚠️ DİĞER seçimi ${d}. deneme başarısız, tekrar...`);
            await belgenetBekle(400);
        }
        if (!tipSecildi && !/DİĞER|DIGER/i.test(await tuzelKisiTipiMetniOku(aktifFrame))) {
            throw new Error(`Tüzel Kişi Tipi "DİĞER" seçilemedi`);
        }
        console.log('📋 Tüzel Kişi Tipi: DİĞER');
    }

    // 4) Hemen Kaydet — önce üst buton, yoksa alta kaydır
    console.log('💾 Tüzel Kişi Kaydet butonuna basılıyor...');
    const kaydetBilgi = await aktifFrame.evaluate(() => {
        const form = document.querySelector('form[id*="tuzelKisiHizliKayit"]');
        const dialog = form?.closest('.ui-dialog') || document.querySelector('.ui-dialog');
        const icerik = dialog?.querySelector('.ui-dialog-content');

        const metin = (el) => (el.innerText || el.textContent || el.value || '').trim().toUpperCase();
        const adaylar = form
            ? [...form.querySelectorAll('button, .ui-button, input[type="button"], a.ui-button')]
            : [...document.querySelectorAll('button[id*="saveTuzelKisi"], button[id*="TuzelKisi"]')];

        let btn = adaylar.find((b) => b.id?.includes('saveTuzelKisiHizliKayitButton'));
        if (!btn) btn = adaylar.find((b) => metin(b) === 'KAYDET' && b.offsetParent !== null);
        if (!btn && icerik) {
            icerik.scrollTop = icerik.scrollHeight;
            btn = [...form.querySelectorAll('button, .ui-button')].find((b) => metin(b) === 'KAYDET' && b.offsetParent !== null);
        }
        if (!btn) return null;
        btn.scrollIntoView({ block: 'center' });
        const r = btn.getBoundingClientRect();
        return { id: btn.id, x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });

    let kaydedildi = false;
    if (kaydetBilgi?.id) kaydedildi = await fareIleTikla(page, aktifFrame, `[id="${kaydetBilgi.id}"]`);
    if (!kaydedildi && kaydetBilgi?.x) {
        await page.mouse.click(kaydetBilgi.x, kaydetBilgi.y);
        kaydedildi = true;
        console.log(`   Kaydet fare tık: (${Math.round(kaydetBilgi.x)}, ${Math.round(kaydetBilgi.y)})`);
    }
    if (!kaydedildi) {
        kaydedildi = await aktifFrame.evaluate(() => {
            const form = document.querySelector('form[id*="tuzelKisiHizliKayit"]');
            const btn = form?.querySelector('button[id*="saveTuzelKisi"]')
                || [...(form || document).querySelectorAll('button, .ui-button')].find((b) =>
                    (b.innerText || '').trim().toUpperCase() === 'KAYDET' && b.offsetParent !== null
                );
            if (btn) { btn.click(); return true; }
            return false;
        });
    }

    if (!kaydedildi) throw new Error('Tüzel Kişi Kaydet butonu bulunamadı');
    await belgenetEvetOnayiniBekle(page, targetFrame, 8, 350);

    for (let i = 0; i < 12; i++) {
        await belgenetBekle(200);
        const kapali = await aktifFrame.evaluate(() =>
            !Array.from(document.querySelectorAll('.ui-dialog')).some((d) =>
                d.offsetParent !== null && (d.innerText || '').includes('Tüzel Kişi Kaydet')
            )
        );
        if (kapali) break;
    }
    await belgenetBekle(300);
    console.log('✅ Tüzel Kişi kaydı tamamlandı, ana forma dönülüyor');
}

/** Fare ile elemente tıkla (PrimeFaces için daha güvenilir) */
async function fareIleTikla(page, frame, selector) {
    try {
        const el = await frame.$(selector);
        if (!el) return false;
        const box = await el.boundingBox();
        if (box) {
            await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
            await el.dispose();
            return true;
        }
        await el.click();
        await el.dispose();
        return true;
    } catch (_) {
        return false;
    }
}

async function tuzelKisiTipiMetniOku(frame) {
    return frame.evaluate(() => {
        const lb = document.querySelector('[id*="tuzelKisiTipi_label"]');
        if (lb) return (lb.textContent || '').trim();
        const form = document.querySelector('form[id*="tuzelKisiHizliKayit"]');
        if (!form) return '';
        const menu = form.querySelector('.ui-selectonemenu[id*="tuzelKisiTipi"]');
        const label = menu?.querySelector('.ui-selectonemenu-label');
        return (label?.textContent || '').trim();
    });
}

/** Görünür tuzelKisiTipi panelinde DİĞER öğesini bul */
async function tuzelKisiTipiDigerLiBul(frame) {
    return frame.evaluate(() => {
        const paneller = [...document.querySelectorAll('[id*="tuzelKisiTipi_panel"]')].filter((p) => {
            const st = getComputedStyle(p);
            return st.display !== 'none' && st.visibility !== 'hidden' && p.offsetHeight > 5;
        });
        const panel = paneller[0];
        if (!panel) return { bulundu: false, neden: 'panel-yok' };

        const items = panel.querySelectorAll('li[data-label], li.ui-selectonemenu-item, ul li');
        const etiketler = [];
        for (let i = 0; i < items.length; i++) {
            const el = items[i];
            const label = (el.getAttribute('data-label') || el.textContent || '').trim();
            etiketler.push(label);
            if (/DİĞER|DIGER|Diğer|diğer/i.test(label)) {
                el.scrollIntoView({ block: 'nearest' });
                const r = el.getBoundingClientRect();
                return {
                    bulundu: true,
                    idx: i,
                    label,
                    x: r.x + r.width / 2,
                    y: r.y + r.height / 2,
                    etiketler,
                };
            }
        }
        // Sıra sabit: Seçiniz(0), BANKALAR(1), DERNEK(2), DİĞER(3)
        if (items.length > 3) {
            const el = items[3];
            el.scrollIntoView({ block: 'nearest' });
            const r = el.getBoundingClientRect();
            return { bulundu: true, idx: 3, label: etiketler[3] || '?', x: r.x + r.width / 2, y: r.y + r.height / 2, etiketler, yedek: true };
        }
        return { bulundu: false, neden: 'diger-yok', etiketler, adet: items.length };
    });
}

/** Tüzel Kişi Tipi → DİĞER: menüyü aç, listeden tıkla, olmazsa klavye */
async function tuzelKisiTipiDigerSec(page, dialogFrame) {
    if (await tuzelKisiTipiDigerMi(dialogFrame)) return true;

    const frames = [...new Set([dialogFrame, page.mainFrame(), ...page.frames()].filter(Boolean))];

    for (let deneme = 1; deneme <= 3; deneme++) {
        console.log(`🎯 DİĞER seçimi deneme ${deneme}`);

        await dialogFrame.evaluate(() => {
            document.querySelector('.ui-selectonemenu[id*="tuzelKisiTipi"]')?.scrollIntoView({ block: 'center' });
        });
        await belgenetBekle(300);

        // Menü kapalıysa aç
        const panelAcik = await tuzelKisiTipiPanelAcikMi(dialogFrame) || await tuzelKisiTipiPanelAcikMi(page.mainFrame());
        if (!panelAcik) {
            await fareIleTikla(page, dialogFrame, '.ui-selectonemenu[id*="tuzelKisiTipi"] .ui-selectonemenu-trigger');
            await belgenetBekle(500);
        } else {
            console.log('   panel zaten açık');
        }

        // DİĞER li — koordinat ile tıkla (tüm frame'ler)
        for (const frame of frames) {
            try {
                const li = await tuzelKisiTipiDigerLiBul(frame);
                if (!li.bulundu) continue;

                console.log(`   DİĞER bulundu: "${li.label}" (idx=${li.idx}, yedek=${!!li.yedek}) etiketler=[${(li.etiketler || []).join(', ')}]`);

                // DOM click
                await frame.evaluate((idx) => {
                    const panel = [...document.querySelectorAll('[id*="tuzelKisiTipi_panel"]')].find((p) => {
                        const st = getComputedStyle(p);
                        return st.display !== 'none' && p.offsetHeight > 5;
                    });
                    const items = panel?.querySelectorAll('li[data-label], li.ui-selectonemenu-item, ul li');
                    const el = items?.[idx];
                    if (el) {
                        el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, view: window }));
                        el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, view: window }));
                        el.click();
                    }
                }, li.idx);

                await belgenetBekle(150);
                await page.mouse.click(li.x, li.y);
                console.log(`   fare tık: (${Math.round(li.x)}, ${Math.round(li.y)})`);
                await belgenetBekle(250);

                if (await tuzelKisiTipiDigerMi(dialogFrame)) {
                    console.log('✅ Tüzel Kişi Tipi: DİĞER seçildi');
                    return true;
                }
            } catch (e) {
                console.log(`   tıklama hatası: ${e.message}`);
            }
        }

        // Klavye — panel açıkken label'a TEKRAR tıklama (kapanır)
        console.log('   klavye: 3x ArrowDown + Enter');
        for (let i = 0; i < 3; i++) {
            await page.keyboard.press('ArrowDown');
            await belgenetBekle(80);
        }
        await page.keyboard.press('Enter');
        await belgenetBekle(300);

        if (await tuzelKisiTipiDigerMi(dialogFrame)) {
            console.log('✅ Tüzel Kişi Tipi: klavye ile DİĞER');
            return true;
        }

        await page.keyboard.press('Escape');
        await belgenetBekle(300);
    }

    console.log('❌ Tüzel Kişi Tipi: DİĞER seçilemedi');
    return false;
}

async function tuzelKisiTipiPanelAcikMi(frame) {
    return frame.evaluate(() => {
        const menu = document.querySelector('.ui-selectonemenu[id*="tuzelKisiTipi"]');
        if (menu?.getAttribute('aria-expanded') === 'true') return true;
        return [...document.querySelectorAll('[id*="tuzelKisiTipi_panel"]')].some((p) => {
            const st = getComputedStyle(p);
            return st.display !== 'none' && p.offsetHeight > 5;
        });
    });
}

async function tuzelKisiTipiDigerMi(frame) {
    return frame.evaluate(() => {
        const lb = document.querySelector('[id*="tuzelKisiTipi_label"]');
        if (lb) {
            const t = (lb.textContent || '').trim().toUpperCase();
            return t.includes('DİĞER') || t.includes('DIGER');
        }
        const form = document.querySelector('form[id*="tuzelKisiHizliKayit"]');
        if (!form) return false;
        const menu = form.querySelector('.ui-selectonemenu[id*="tuzelKisiTipi"]');
        if (menu) {
            const label = menu.querySelector('.ui-selectonemenu-label');
            const t = (label?.textContent || '').trim().toUpperCase();
            return t.includes('DİĞER') || t.includes('DIGER');
        }
        for (const tr of form.querySelectorAll('tr')) {
            if (!(tr.innerText || '').includes('Tüzel Kişi Tipi')) continue;
            const lb2 = tr.querySelector('.ui-selectonemenu-label');
            const t = (lb2?.textContent || '').trim().toUpperCase();
            return t.includes('DİĞER') || t.includes('DIGER');
        }
        return false;
    });
}

async function belgenetEvetOnayiniBekle(page, targetFrame, maxDeneme = 15, pollMs = 800) {
    const frames = [...new Set([targetFrame, page.mainFrame(), ...page.frames()].filter(Boolean))];
    for (let d = 1; d <= maxDeneme; d++) {
        belgenetRobotKontrol();
        await delayKontrollu(pollMs);
        for (const frame of frames) {
            try {
                const sonuc = await frame.evaluate(() => {
                    const gorunurMu = (el) => {
                        if (!el) return false;
                        const st = getComputedStyle(el);
                        return st.display !== 'none' && st.visibility !== 'hidden' && el.offsetParent !== null;
                    };

                    const butonMetni = (el) => (el.innerText || el.textContent || el.value || '').trim().toUpperCase();

                    const evetButonuBul = (kok) => {
                        const adaylar = Array.from(kok.querySelectorAll('.ui-button, button, input[type="button"], a, span.ui-button'));
                        return adaylar.find(el => gorunurMu(el) && (butonMetni(el) === 'EVET' || butonMetni(el) === 'YES'));
                    };

                    for (const dlg of document.querySelectorAll('.ui-dialog, [role="dialog"]')) {
                        if (!gorunurMu(dlg) && dlg.style.display === 'none') continue;

                        const evetBtn = evetButonuBul(dlg);
                        if (evetBtn) {
                            evetBtn.click();
                            return 'evet-diyalog';
                        }
                    }

                    const genelEvet = evetButonuBul(document.body);
                    if (genelEvet && genelEvet.closest('.ui-dialog, [role="dialog"]')) {
                        genelEvet.click();
                        return 'evet-genel';
                    }

                    return null;
                });
                if (sonuc) {
                    console.log(`✅ Belgenet onay penceresi: "${sonuc}" (${d}. deneme)`);
                    await belgenetBekle(pollMs < 500 ? 400 : 1500);
                    return true;
                }
            } catch (_) { /* frame erişilemez olabilir */ }
        }
    }
    return false;
}

app.post('/api/belgenet-robot-durdur', (req, res) => {
    belgenetRobotDurdur();
    res.json({
        success: true,
        message: 'Robot durduruldu. Devam eden işlem en kısa sürede kesilecek, sıradakiler iptal edildi.',
        mesgul: belgenetRobotMesgul,
        kuyruk: belgenetRobotKuyruk.length
    });
});

app.get('/api/belgenet-robot-durum', (req, res) => {
    res.json({
        success: true,
        durduruldu: belgenetRobotDurduruldu,
        mesgul: belgenetRobotMesgul,
        kuyruk: belgenetRobotKuyruk.length
    });
});

app.post('/api/belgenet-yukle', async (req, res) => {
    
    const { tc, dilekceno, dosyadı, hedefIP ,sayfasayisi} = req.body;
    
    if (!tc || !dilekceno || !dosyadı) {
        return res.json({ success: false, message: "TC, Dilekçe No veya Dosya Adı eksik!" });
    }

    belgenetRobotDurdurSifirla();

    // Eğer hedefIP boş gelirse (kendi bilgisayarınsa) varsayılan olarak 127.0.0.1 kullanır
    const aktifRobotIP = hedefIP || '127.0.0.1';
    
    try {
        await belgenetRobotSirayaAl(async () => {
        belgenetRobotKontrol();
        console.log(`🤖 ${dosyadı} için ${aktifRobotIP} üzerinde operasyon başladı`);

        let gercekDosyaAdi = dosyadı.trim();
        if (!gercekDosyaAdi.toLowerCase().endsWith('.pdf')) {
            gercekDosyaAdi += '.pdf';
        }

        let dosyaYolu;
        try {
            dosyaYolu = pdfYolunuBul(gercekDosyaAdi);
        } catch (pdfBulErr) {
            console.error('❌ PDF arama hatası:', pdfBulErr.message);
            if (!res.headersSent) {
                return res.json({ success: false, message: pdfBulErr.message });
            }
            return;
        }
        const temizDosyaAdi = gercekDosyaAdi.replace(/\.pdf$/i, "");

        const browser = await puppeteer.connect({ 
            browserURL: `http://${aktifRobotIP}:9222`, 
            defaultViewport: null 
        });

        // 🔍 TZOB Belgenet'i bulma radarı
        const pages = await browser.pages();
        const page = pages.find(p => p.url().includes('tzob.org.tr')); 

        if (!page) { 
            console.log("❌ TZOB Belgenet sayfası bulunamadı!");
            return res.json({ success: false, message: "Belgenet (TZOB) sayfası açık değil!" }); 
        }

        await page.bringToFront();
        console.log("✅ TZOB Belgenet bulundu ve kontrol ele alındı!");
        await belgenetBekle(1200); 

        const targetFrame = page.frames().find(f => 
            f.url().includes('xhtml') || f.url().includes('main')
        ) || page.mainFrame();

        const sayfa = parseInt(sayfasayisi) || 1;
        try {
            const pdfHazir = await belgenetPdfYukle(page, targetFrame, dosyaYolu, sayfa);
            if (!pdfHazir) {
                if (!res.headersSent) {
                    return res.json({ success: false, message: 'PDF Belgenet\'e yüklenemedi (N/A). Dosya sunucuya gitmedi, işlem durduruldu.' });
                }
                return;
            }
        } catch (pdfErr) {
            console.error('❌ PDF yükleme hatası:', pdfErr.message);
            if (!res.headersSent) {
                return res.json({ success: false, message: `PDF yüklenemedi: ${pdfErr.message}` });
            }
            return;
        }

        // ==========================================
        // 2️⃣ FORM ALANLARINI DOLDURMA 
        // ==========================================
        console.log("✍️ Form alanları dolduruluyor...");
        
        // ==========================================
        // 📅 EVRAK TARİHİ AYARLANIYOR (ÇİFT DİKİŞLİ İNATÇI ZIRH)
        // ==========================================
        console.log("📅 Evrak Tarihi kutusu aranıyor...");
        const bugun = new Date().toLocaleDateString('tr-TR');
        let tarihYazildiMi = false;

        // Robot pes etmeden önce 3 kere deneyecek
        for (let deneme = 1; deneme <= 3; deneme++) { 
            const tarihKutusuId = await targetFrame.evaluate(() => {
                const input = document.querySelector('input[id*="evrakTarihi_input"]') ||
                              document.querySelector('input[id*="EvrakTarihi"]');
                // Sadece kutuyu bulmakla kalma, ekranda GÖRÜNÜR olduğundan da emin ol
                if (input && input.offsetParent !== null) {
                    return input.id;
                }
                return null;
            });

            if (tarihKutusuId) {
                await targetFrame.focus(`[id="${tarihKutusuId}"]`);
                await belgenetBekle(800);
                
                // İçini temizle
                await page.keyboard.down('Control');
                await page.keyboard.press('A');
                await page.keyboard.up('Control');
                await page.keyboard.press('Backspace');
                await belgenetBekle(500);

                console.log(`📅 [Deneme ${deneme}] Güncel tarih yazılıyor: ${bugun}`);
                await page.keyboard.type(bugun, { delay: 150 }); 
                await belgenetBekle(500);
                
                // Sisteme tarihi algılat
                await page.keyboard.press('Tab');
                await belgenetBekle(800); // 🎯 VİTES: Yazdıktan sonra nefes al

                // 🎯 DOĞRULAMA: Kutuya gerçekten tarih yazılmış mı?
                const kutuIcerigi = await targetFrame.evaluate((id) => {
                    const input = document.getElementById(id);
                    return input ? input.value : "";
                }, tarihKutusuId);

                if (kutuIcerigi.length >= 8) { // Örn: 21.09.2026 (10 karakterdir, boş değilse tamamdır)
                    console.log(`✅ Evrak tarihi başarıyla işlendi ve DOĞRULANDI! (${kutuIcerigi})`);
                    tarihYazildiMi = true;
                    break; // Yazdıysa döngüyü kır, diğer kutulara fişek gibi geç!
                } else {
                    console.log(`⚠️ Tarih silinmiş veya boş kalmış, inatla tekrar deneniyor... (${deneme}/3)`);
                }
            } else {
                console.log(`⏳ Tarih kutusu henüz ekrana düşmedi, 2 saniye bekleniyor... (${deneme}/3)`);
                await belgenetBekle(2000); // Sayfa yavaşsa bekle ve tekrar ara
            }
        }

        if (!tarihYazildiMi) {
            console.log("❌ KRİTİK UYARI: 3 denemeye rağmen Evrak Tarihi algılanamadı, manuel müdahale gerekebilir!");
        }
        await belgenetBekle(1000);

        // 🎯 KONU KODU (240.02)
        await belgenetKonuKoduDoldur(page, targetFrame);

        // ✍️ KONU METNİ
        await belgenetBekle(800);
        await belgenetKonuYaz(page, targetFrame, temizDosyaAdi);

        await belgenetBekle(800); 

        await targetFrame.evaluate(() => {
            const select = document.querySelector('select[id*="evrakTuruCombo"]');
            if (select) {
                select.value = "A";
                select.dispatchEvent(new Event('change', { bubbles: true }));
            }
        });
        await belgenetBekle(1200);

        // ==========================================
        // 📬 Geliş Tipi: ELDEN Seçiliyor
        // ==========================================
        console.log("⏳ Geliş Tipi seçimi için 2 saniye bekleniyor...");
        await belgenetBekle(2000); 

        await targetFrame.evaluate(() => {
            const select = document.querySelector('select[id*="evrakGelisTipi"]');
            if (select) {
                const opt = [...select.options].find(o => o.text.toUpperCase().includes('ELDEN'));
                if (opt) {
                    select.value = opt.value;
                    select.dispatchEvent(new Event('change', { bubbles: true }));
                }
            }
        });

        console.log("✅ Geliş Tipi: ELDEN seçildi. Sunucu onayı için bekleniyor...");
        await belgenetBekle(2500);

        await belgenetKisiyeHavaleDoldur(page, targetFrame);
        await belgenetBekle(2500);

        console.log("👤 'Kişi-Kurum' menüsünden 'Gerçek Kişi' seçiliyor...");
        await targetFrame.evaluate(() => {
            const select = document.querySelector('select[id$=":kisiKurum"], select[id*="kisiKurum"]');
            if (select) {
                const option = Array.from(select.options).find((opt) => opt.text.includes('Gerçek Kişi'));
                if (option) {
                    select.value = option.value;
                    select.dispatchEvent(new Event('change', { bubbles: true }));
                }
            }
        });
        await belgenetBekle(2000);

// ==========================================
        // 🎯 EN SON AŞAMA: GELDİĞİ KİŞİ VE HIZLI KAYIT (ÇİFT MOTOR)
        // ==========================================
        // 🧠 GÜVENLİK: Üst taraftan veriler eksik gelirse diye burada tekrar akıllı tespit yapıyoruz
        const temizTc = (req.body.tc === 'null' || req.body.tc === 'undefined' || !req.body.tc) ? '' : req.body.tc.toString().trim();
        const temizVergi = (req.body.vergino === 'null' || req.body.vergino === 'undefined' || !req.body.vergino) ? '' : req.body.vergino.toString().trim();
        const gelenTur = (req.body.tur === 'null' || req.body.tur === 'undefined' || !req.body.tur) ? '' : req.body.tur.toString().toUpperCase().trim();
        
        const isTuzel = gelenTur.includes('TUZEL') || (temizTc === '' && temizVergi.length >= 10);
        const kimlikNo = isTuzel ? temizVergi : temizTc; 
        const kurumTipiMetni = isTuzel ? 'Tüzel Kişi' : 'Gerçek Kişi';

        console.log(`🎯 Operasyonun son aşaması başladı (${kurumTipiMetni})...`);
        
        let gelenDogum = req.body.dogumtarihi || req.body.dogumTarihi || "";
        let dogumTarihiVerisi = "";

        if (gelenDogum && gelenDogum.includes("-")) {
            const parcalar = gelenDogum.split("-"); 
            dogumTarihiVerisi = `${parcalar[2]}.${parcalar[1]}.${parcalar[0]}`; 
        } else {
            dogumTarihiVerisi = gelenDogum; 
        }

        console.log(`📡 [ROBOT] Ham Veri: ${gelenDogum} -> Çevrilen Veri: ${dogumTarihiVerisi}`);

        // 🛡️ B PLANI: Form 'Kurum'da takılı kalsa bile kutuyu gözüyle bulma radarı!
        const aramaKutusuId = await targetFrame.evaluate((tuzelMi) => {
            const inputs = Array.from(document.querySelectorAll('input[type="text"]'));
            let el = inputs.find(i => i.offsetParent !== null && i.id.includes(tuzelMi ? 'TuzelKisi' : 'GercekKisi'));
            
            if (!el) {
                const labels = Array.from(document.querySelectorAll('label'));
                const targetLabel = labels.find(l => l.innerText.includes('Geldiği') && l.offsetParent !== null);
                if (targetLabel) {
                    const forId = targetLabel.getAttribute('for');
                    if (forId) el = document.getElementById(forId);
                }
            }
            if (el) { el.focus(); return el.id; }
            return null;
        }, isTuzel);

        if (aramaKutusuId) {
            console.log(`✍️ Arama kutusuna yazılıyor: ${kimlikNo}`);
            await targetFrame.focus(`[id="${aramaKutusuId}"]`);
            await belgenetBekle(300);
            await page.keyboard.type(kimlikNo, { delay: 100 }); 
            
            console.log("⏳ Belgenet veritabanında aranıyor...");
            let secildiMi = false;
            for (let aramaDeneme = 1; aramaDeneme <= 12; aramaDeneme++) {
                await belgenetBekle(1500);
                secildiMi = await targetFrame.evaluate((arananNo) => {
                    const elms = Array.from(document.querySelectorAll('.lovItemTitle, .lovItemDetail, .ui-autocomplete-item'));
                    const h = elms.find(e => e.innerText.includes(arananNo) && e.offsetParent !== null);
                    if (h) { 
                        h.scrollIntoView({ block: 'center' });
                        h.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
                        h.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
                        h.click(); 
                        return true; 
                    }
                    return false;
                }, kimlikNo);
                if (secildiMi) {
                    console.log(`✅ Kişi listede bulundu (${aramaDeneme}. deneme)`);
                    break;
                }
            }

            // 🛑 3. ADIM: EĞER KİŞİ YOKSA HIZLI KAYIT OPERASYONU
            if (!secildiMi) {
                console.log(`⚠️ ${kurumTipiMetni} yok, '+' butonuyla Hızlı Kayıt açılıyor...`);
                await targetFrame.evaluate((tuzelMi) => {
                    const btn = Array.from(document.querySelectorAll('button')).find(b => 
                        b.id && b.id.includes(tuzelMi ? 'TuzelKisiEkle' : 'GercekKisiEkle')
                    ) || document.querySelector('.add-icon')?.closest('button');
                    if (btn) btn.click();
                });

                await belgenetBekle(3000); 

                if (isTuzel) {
                    await belgenetTuzelKisiHizliKayit(page, targetFrame, kimlikNo, req.body.adsoyad);

                } else {
                    // ---------------------------------------------------------
                    // 👤 GERÇEK KİŞİ (ŞAHIS) KPS HIZLI KAYIT İŞLEMLERİ
                    // ---------------------------------------------------------
                    console.log(`📡 [ROBOT] Gelen Doğum Tarihi: "${req.body.dogumtarihi}", TC: "${kimlikNo}"`);

                    console.log("✍️ TC yazılıyor...");
                    await targetFrame.focus('input[id*="tcKimlikNoInput"]');
                    await belgenetBekle(300);
                    await page.keyboard.down('Control'); await page.keyboard.press('A'); await page.keyboard.up('Control');
                    await page.keyboard.press('Backspace');
                    await page.keyboard.type(kimlikNo, { delay: 100 });
                    await belgenetBekle(800);

                    if (dogumTarihiVerisi && dogumTarihiVerisi !== "") {
                        console.log(`✍️ Doğum Tarihi tuşlanıyor: ${dogumTarihiVerisi}`);
                        await targetFrame.click('input[id*="ghkDogumTarihi_input"]');
                        await belgenetBekle(300);
                        await page.keyboard.down('Control'); await page.keyboard.press('A'); await page.keyboard.up('Control');
                        await page.keyboard.press('Backspace');
                        await belgenetBekle(300);

                        for (let i = 0; i < 10; i++) {
                            await page.keyboard.press('ArrowLeft');
                        }
                        await belgenetBekle(200);

                        await page.keyboard.type(dogumTarihiVerisi, { delay: 250 });
                        await belgenetBekle(500);
                        await page.keyboard.press('Tab');
                    }
                    await belgenetBekle(1000);

                    await targetFrame.evaluate(() => {
                        const btn = Array.from(document.querySelectorAll('button')).find(b => 
                            (b.id && b.id.includes('kpsTcKimlikNoSorgulaButtonHizliKayit')) || 
                            (b.innerHTML && b.innerHTML.includes('fa-search'))
                        );
                        if(btn) btn.click();
                    });

                    console.log("⏳ KPS Sorgusu bekleniyor...");
                    let kpsTamam = false;
                    for (let kpsDeneme = 1; kpsDeneme <= 20; kpsDeneme++) {
                        await belgenetBekle(1500);
                        kpsTamam = await targetFrame.evaluate(() => {
                            const kaydetBtn = document.querySelector('button[id*="saveGercekKisiHizliKayitButton"]');
                            const adInput = document.querySelector('input[id*="adInput"], input[id*="AdInput"]');
                            return (kaydetBtn && kaydetBtn.offsetParent !== null) ||
                                (adInput && adInput.value && adInput.value.trim().length > 1);
                        });
                        if (kpsTamam) {
                            console.log(`✅ KPS yanıtı alındı (${kpsDeneme}. deneme)`);
                            break;
                        }
                    }
                    if (!kpsTamam) console.log("⚠️ KPS yanıtı beklenenden geç geldi, kaydet deneniyor...");

                    // 💥 KPS İPTAL ZIRHI TAMAMEN KALDIRILDI! 
                    // Robot artık "KPS boş geldi, iptal edeyim" demeyecek. Direkt yeşil "Kaydet" butonuna basacak.
                    
                    console.log("✅ KPS İşlemi tamamlandı, şahıs kaydediliyor...");
                    await targetFrame.evaluate(() => {
                        const s = document.querySelector('button[id*="saveGercekKisiHizliKayitButton"]');
                        if (s) {
                            s.scrollIntoView({ block: 'center' });
                            s.click();
                        }
                    });
                    await belgenetEvetOnayiniBekle(page, targetFrame);
                }
                
                await belgenetBekle(4000);
                await belgenetEvetOnayiniBekle(page, targetFrame, 8);
            }
        }
        
        // Kaydet öncesi form kontrolü
        const formKimlik = isTuzel ? temizVergi : temizTc;
        for (let f = 1; f <= 2; f++) {
            const hazir = isTuzel
                ? await belgenetSirketFormuDuzelt(page, targetFrame, { konuMetni: temizDosyaAdi, vkn: formKimlik })
                : await belgenetSahisFormuDuzelt(page, targetFrame, { konuMetni: temizDosyaAdi, tc: formKimlik });
            if (hazir) break;
            console.log(`⚠️ Form düzeltme ${f}. tur (${isTuzel ? 'tüzel' : 'şahıs'})`);
            await belgenetBekle(800);
        }

        // ==========================================
        // 3️⃣ KAYDET (ESKİ NUMARA HAFIZASIYLA BİRLİKTE)
        // ==========================================
        console.log("🔍 Ekranda önceden kalma numaralar var mı diye hafızaya alınıyor...");
        const eskiNumaralar = await targetFrame.evaluate(() => {
            return document.body.innerText.match(/\b\d{6}\b/g) || [];
        });
        
        if (eskiNumaralar.length > 0) {
            console.log(`⚠️ Eski numara hafızaya alındı: ${eskiNumaralar[0]}. Yeni numara beklenirken bu pas geçilecek.`);
        }

        console.log("💾 Kaydet butonuna basılıyor...");
        await targetFrame.evaluate(() => {
            const butonlar = [...document.querySelectorAll('.ui-button, button, input[type="submit"], input[type="button"], a')];
            const hedefButon = butonlar.find(el => {
                if (el.offsetParent === null) return false; 
                const yazi = (el.innerText || el.value || el.textContent || '').trim().toUpperCase();
                return yazi === 'KAYDET' || yazi.includes('KAYDET');
            });
            if (hedefButon) hedefButon.click();
        });
        await belgenetEvetOnayiniBekle(page, targetFrame);

        // ==========================================
        // 4️⃣ YEPYENİ NUMARAYI BEKLEME, SQL'E YAZMA VE KAPATMA
        // ==========================================
        console.log("⏳ Evrakın kaydedilmesi ve YENİ numaranın çıkması bekleniyor...");
        let belgenetNo = null;
        for (let i = 0; i < 45; i++) { 
            belgenetRobotKontrol();
            await belgenetEvetOnayiniBekle(page, targetFrame, 3);
            await delayKontrollu(1000);
            belgenetNo = await targetFrame.evaluate((eskiler) => {
                const tamMetin = document.body.innerText;
                const ekrandakiNumaralar = tamMetin.match(/\b\d{6}\b/g) || [];
                const yeniNumara = ekrandakiNumaralar.find(num => !eskiler.includes(num));
                return yeniNumara || null;
            }, eskiNumaralar);

            if (belgenetNo) break; 
        }

        if (belgenetNo) {
            const tarih = new Date();
            const bugunTarih = `${tarih.getFullYear()}-${String(tarih.getMonth() + 1).padStart(2, '0')}-${String(tarih.getDate()).padStart(2, '0')}`;
            const personelAdi = req.body.kullanici || 'BAHRİ KARLI';

            let sqlBasarili = false;
            let sqlHataMesaji = "";

            try {
                const pool = await getPool(); 
                const guncellenecekDosya = req.body.dosyadı || req.body.dosyadi;
                
                await pool.request()
                    .input('bNo', belgenetNo)
                    .input('bTarih', bugunTarih)
                    .input('tc', tc)
                    .input('dilekceno', dilekceno)
                    .input('dosyaAdi', guncellenecekDosya)
                    .input('personel', personelAdi)
                    .query(`
                        UPDATE b
                        SET b.belgenetno = @bNo, 
                            b.belgenettarihi = @bTarih,
                            b.bkullanici = @personel
                        FROM belgenet b
                        INNER JOIN çksdilekçe c ON c.kimlik = b.kimlikid
                        INNER JOIN dilekçebilgileri d ON c.kimlik = d.kimlikid
                        WHERE b.dosyadı = @dosyaAdi 
                    `);
                console.log(`💾 ŞAHMAT! Numara (${belgenetNo}) SQL'e işlendi.`);
                sqlBasarili = true;
            } catch (dbHata) {
                sqlBasarili = false;
                sqlHataMesaji = dbHata.message;
                console.error("❌ SQL Hatası:", dbHata.message);
            }

            // ==========================================
            // 🔄 SAYFAYI SIFIRLAMA İŞLEMİ
            // ==========================================
            console.log("🚪 Popup'taki 'Yeni Kayıt' veya 'Kapat' butonuna basılıyor...");
            await belgenetBekle(1000); 
            await targetFrame.evaluate(() => {
                const butonlar = [...document.querySelectorAll('.ui-button, button, input[type="submit"], input[type="button"], a, span')];
                let islemBtn = butonlar.find(el => el.offsetParent !== null && (el.innerText || '').trim().toUpperCase() === 'YENİ KAYIT');
                if (!islemBtn) {
                    islemBtn = butonlar.find(el => el.offsetParent !== null && (el.innerText || '').trim().toUpperCase() === 'KAPAT');
                }
                if (islemBtn) islemBtn.click();
            });

            console.log("🔄 Ana menüden 'Gelen Evrak Kayıt' açılıyor (Sıfırlama işlemi)...");
            await belgenetBekle(2000); 
            await page.evaluate(() => {
                const linkler = Array.from(document.querySelectorAll('a'));
                const gelenEvrakLink = linkler.find(el => 
                    (el.innerText && el.innerText.includes('Gelen Evrak Kayıt')) || 
                    (el.title && el.title.includes('Shift + G'))
                );
                if (gelenEvrakLink) gelenEvrakLink.click();
            });
            
            await belgenetBekle(3000); 
            console.log("✅ Sistem sıradaki evrak için tertemiz açıldı!");

            if (!res.headersSent) {
                if (sqlBasarili) {
                    res.json({ 
                        success: true, 
                        belgenetNo: belgenetNo, 
                        message: `${tc} kimlik numaralı kişi, ${belgenetNo} kayıt numarasıyla Belgenet'e ve veritabanına başarıyla işlenmiştir.` 
                    });
                } else {
                    res.json({ 
                        success: false, 
                        message: `Belgenet numarası alındı ama veritabanına yazılamadı! Hata: ${sqlHataMesaji}` 
                    });
                }
            }

        } else {
            console.log("❌ KRİTİK HATA: Yeni numara okunamadı!");
            if (!res.headersSent) {
                res.json({ success: false, message: "Kayıt işlemi başarısız, 45 saniye içinde YENİ Belgenet numarası ekrana düşmedi!" });
            }
        }

        }); // belgenetRobotSirayaAl sonu
    } catch (err) {
        if (err instanceof BelgenetRobotDurdurulduHatasi || err?.kod === 'ROBOT_DURDURULDU') {
            console.log('🛑 Belgenet yükleme kullanıcı tarafından durduruldu.');
            if (!res.headersSent) {
                res.json({ success: false, durduruldu: true, message: 'Robot durduruldu.' });
            }
            return;
        }
        console.error("❌ HATA:", err.message);
        if (!res.headersSent) {
            res.json({ success: false, message: `Sistem Hatası: ${err.message}` });
        }
    }
});
// 📂 SADECE BELGENET NO'SU DOLU OLANLARI (BİTENLERİ) GETİRİR
// 📂 SADECE BELGENET NO'SU DOLU OLANLARI (BİTENLERİ) GETİRİR
// 📂 ARŞİV GETİRME ROTASI (KİMLİK NUMARASINA GÖRE SONDAN BAŞA)
app.get('/api/belgenet-bitenler', async (req, res) => {
    try {
        const pool = await getPool(); 
        const result = await pool.request().query(`
            SELECT 
                c.kimlik, 
                c.[Tc Kimlik No] AS tc, 
                c.[Adı Soyadı] AS adsoyad,
                d.dilekçeno, 
                b.dosyadı, 
                b.belgenetno, 
                b.belgenettarihi, 
                b.bkullanici,
                b.kimlik as bkimlik -- 🎯 Sıralama yapabilmek için bunu mecburen çağırıyoruz
            FROM çksdilekçe c WITH (NOLOCK)
            INNER JOIN dilekçebilgileri d WITH (NOLOCK) ON c.kimlik = d.kimlikid
            INNER JOIN belgenet b WITH (NOLOCK) ON c.kimlik = b.kimlikid
            WHERE b.belgenetno IS NOT NULL 
              AND b.belgenetno != '0' 
              AND b.belgenetno != ''
            ORDER BY b.kimlik DESC -- 🎯 İŞTE YENİ SİLAH: Belgenet'in kendi kimliğine göre sondan başa sıralar
        `);
        res.json(result.recordset);
    } catch (err) {
        console.error("Bitenler çekilirken hata:", err);
        res.status(500).json({ error: err.message });
    }
});
// 🧪 SADECE SQL TEST ROTASI (ROBOT YOK, SADECE VERİTABANI TESTİ)
// 1. Çiftçinin IB Bilgilerini Getiren Endpoint
// 1. ENDPOINT: Verileri SQL'den Çek (Tabloya Doldurmak İçin)
// GET /api/IbBilgi/Getir/:kimlikid
// ====================== GETİR ENDPOINT ======================
// ====================== GETİR ENDPOINT (Join'li Versiyon) ======================
// VERİ GETİR: Tabloyu doldurmak için
// 1. VERİLERİ GETİR (Ekrana Doldurmak İçin)
// --- 1. VERİLERİ GETİR ---
app.get('/api/ib/getir/:kimlikid', async (req, res) => {
    try {
        let pool = await sql.connect(dbConfig);
        const kid = req.params.kimlikid;
        
        // 1. Çiftçinin ana bilgilerini (sicilliste) çek
        let sicilResult = await pool.request()
            .input('kid', sql.Int, kid)
            .query('SELECT * FROM [sicilliste] WHERE [kimlikid] = @kid');

        // 2. Tablodaki Ziraat Odası kayıtlarını (ibbilgileri) çek
        let dataResult = await pool.request()
            .input('kid', sql.Int, kid)
            .query('SELECT * FROM [ibbilgileri] WHERE kimlikid = @kid ORDER BY tarih ASC');

        res.json({ 
            success: true, 
            sicilBilgisi: sicilResult.recordset.length > 0 ? sicilResult.recordset[0] : null,
            tabloVerileri: dataResult.recordset
        });
    } catch (err) {
        console.error("Veri Getirme Hatası:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// --- 2. VERİLERİ KAYDET ---
app.post('/api/ib/kaydet', async (req, res) => {
    // Formdaki tüm verileri alıyoruz
    const { kimlikid, sicil, ana, dogyer, bagkurno, veriler } = req.body; 
    
    try {
        let pool = await sql.connect(dbConfig);

        // ADIM 1: [sicilliste] Tablosuna Kayıt (Varsa Güncelle, Yoksa Ekle)
        await pool.request()
            .input('kid', sql.Int, kimlikid)
            .input('sicil', sql.NVarChar, sicil || '')
            .input('ana', sql.NVarChar, ana || '')
            .input('dogyer', sql.NVarChar, dogyer || '')
            .input('bagkurno', sql.NVarChar, bagkurno || '')
            .query(`
                IF EXISTS (SELECT 1 FROM [sicilliste] WHERE [kimlikid] = @kid)
                BEGIN
                    UPDATE [sicilliste] SET 
                        [sicil] = @sicil, [ana] = @ana, 
                        [dogyer] = @dogyer, [bagkurno] = @bagkurno 
                    WHERE [kimlikid] = @kid
                END
                ELSE
                BEGIN
                    INSERT INTO [sicilliste] ([sicil], [ana], [dogyer], [bagkurno], [kimlikid]) 
                    VALUES (@sicil, @ana, @dogyer, @bagkurno, @kid)
                END
            `);

        // ADIM 2: [ibbilgileri] Tablosunu Temizle
        await pool.request()
            .input('kid', sql.Int, kimlikid)
            .query('DELETE FROM [ibbilgileri] WHERE kimlikid = @kid');

        // ADIM 3: [ibbilgileri] Tablosuna Yeni Satırları Ekle
        if (veriler && veriler.length > 0) {
            for (let v of veriler) {
                const sqlTarihFormat = (t) => {
                    if (!t || t.trim() === "" || t === "../../....") return '1900-01-01';
                    if (t.includes('-')) return t;
                    if (t.includes('.')) {
                        const parca = t.split('.');
                        if(parca.length === 3) return `${parca[2]}-${parca[1]}-${parca[0]}`;
                    }
                    return '1900-01-01';
                };

                await pool.request()
                    .input('tur', sql.NVarChar, v.tur)
                    .input('tarih', sql.Date, sqlTarihFormat(v.tarih))   
                    .input('tarihh', sql.Date, sqlTarihFormat(v.tarihh)) 
                    .input('ack', sql.NVarChar, v.aciklama)
                    .input('kid', sql.Int, kimlikid)
                    .query(`INSERT INTO [ibbilgileri] (tür, tarih, tarihh, aciklama, kimlikid) 
                            VALUES (@tur, @tarih, @tarihh, @ack, @kid)`);
            }
        }
        res.json({ success: true });
    } catch (err) {
        console.error("SQL Kayıt Hatası:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});
// 3. PDF RAPORU OLUŞTUR (Resimdeki Forma Uygun)


app.get('/api/ib/rapor/:kimlikid', async (req, res) => {
    try {
        let pool = await sql.connect(dbConfig);
        
        // 1. SORGUMUZ GÜNCELLENDİ (çksdilekçe ve sicilliste birleşti, Doğum Tarihi eklendi)
        let ciftci = (await pool.request().input('kid', sql.Int, req.params.kimlikid).query(`
            SELECT c.[Tc Kimlik No], c.[Adı Soyadı], c.[Baba Adı], c.[İlçe], c.[Köy/Mahalle], c.[Doğum Tarihi],
                   s.sicil, s.ana, s.dogyer, s.bagkurno 
            FROM [çksdilekçe] c
            LEFT JOIN [sicilliste] s ON c.Kimlik = s.kimlikid
            WHERE c.[Kimlik] = @kid
        `)).recordset[0] || {};
        
        let kayitlar = (await pool.request().input('kid', sql.Int, req.params.kimlikid).query('SELECT [tür], [tarih], [tarihh], [aciklama] FROM [ibbilgileri] WHERE kimlikid = @kid ORDER BY Kimlik ASC')).recordset || [];

        const doc = new PDFKitDocument({ size: 'A4', margin: 0 });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename=2926_Belgesi_${req.params.kimlikid}.pdf`);
        doc.pipe(res);

        const fontPath = path.join(__dirname, 'arial.ttf');
        if (fs.existsSync(fontPath)) { doc.registerFont('TR', fontPath); doc.font('TR'); }

        // --- ÜST BAŞLIK ---
        doc.fontSize(11).text('BAĞ-KUR SİGORTALILIK BELGESİ', 0, 25, { align: 'center' });
        doc.fontSize(9).text('(2926 SAYILI KANUNA GÖRE)', { align: 'center' });

        // --- DOĞUM TARİHİ VE YERİ BİRLEŞTİRME MANTIĞI ---
        let dogumTarihiStr = "";
        if (ciftci['Doğum Tarihi']) {
            let dt = new Date(ciftci['Doğum Tarihi']);
            if (dt.getFullYear() > 1900) {
                dogumTarihiStr = dt.toLocaleDateString('tr-TR');
            }
        }
        let dogYerTarih = ciftci.dogyer ? ciftci.dogyer : "";
        if (dogumTarihiStr) {
            dogYerTarih += dogYerTarih ? " / " + dogumTarihiStr : dogumTarihiStr;
        }
        if (!dogYerTarih) dogYerTarih = "..................";


        // --- BİLGİ KUTUSU ---
        let boxY = 50;
        doc.rect(50, boxY, 495, 45).stroke();
        doc.moveTo(285, boxY).lineTo(285, boxY + 45).stroke(); 
        doc.fontSize(8);
        
        // KUTULAR OTOMATİK DOLUYOR
        doc.text(`Bağ-No: ${ciftci.bagkurno || '..................'}`, 55, boxY + 4); 
        doc.text(`Ana adı: ${ciftci.ana || '..................'}`, 290, boxY + 4);
        doc.text(`T.C. Kimlik No: ${ciftci['Tc Kimlik No'] || ''}`, 55, boxY + 14);
        doc.text(`D.yeri ve tarihi: ${dogYerTarih}`, 290, boxY + 14);
        doc.text(`Adı ve soyadı: ${ciftci['Adı Soyadı'] || ''}`, 55, boxY + 24);
        doc.text(`Vergi Sicil No: ..................`, 290, boxY + 24);
        doc.text(`Baba adı: ${ciftci['Baba Adı'] || ''}`, 55, boxY + 34);

        // --- I. KISIM: MUHTARLIK ---
        let mY = 100;
        doc.rect(50, mY, 495, 210).stroke();
        doc.moveTo(80, mY).lineTo(80, mY + 210).stroke(); 
        doc.save();
        doc.rotate(-90, { origin: [65, mY + 105] });
        doc.fontSize(7).text('I- BU KISIM İLGİLİ KÖY VEYA MAHALLE MUHTARLIĞINCA DOLDURULACAKTIR.', 65 - (210/2), mY + 105 - 3.5, { width: 210, align: 'center' });
        doc.restore();
        
        // Köy adını otomatik yazdıralım
        let koyMahalle = ciftci['Köy/Mahalle'] || '....................';
        doc.fontSize(9).text(`${koyMahalle} Mahallesi Muhtarlığı`, 120, mY + 10);
        
        doc.text('Köyü', 170, mY + 20);
        doc.text('BAĞ-KUR İL MÜDÜRLÜĞÜNE', 250, mY + 30);
        doc.text('Yukarıda açık kimliği yazılı sigortalının 2926 sayılı Kanuna göre tarımsal faaliyette bulunduğu süreler aşağıda belirtilmiştir.', 110, mY + 60, { width: 420 });
        doc.text('Bildirim Cetveli Sıra No', 140, mY + 100); doc.text('Başlangıç Tarihi', 300, mY + 100); doc.text('Bitiş Tarihi', 450, mY + 100);
        doc.text('...........................', 140, mY + 115); 
        doc.text('...../...../.........', 320, mY + 115); 
        doc.text('...../...../.........', 460, mY + 115);

        doc.text('...........................', 140, mY + 125); 
        doc.text('...../...../.........', 320, mY + 125); 
        doc.text('...../...../.........', 460, mY + 125);
        doc.text('Onaylayanın', 170, mY + 155); doc.text('Tarih - mühür', 345, mY + 155);
        doc.text('Adı, Soyadı ve Ünvanı / İmzası', 140, mY + 167); doc.text('...../...../.........', 355, mY + 167);

        // --- II. KISIM: ZİRAAT ODASI ---
        let zY = 310; 
        doc.rect(50, zY, 495, 210).stroke(); 
        doc.moveTo(80, zY).lineTo(80, zY + 210).stroke(); 
        doc.save();
        doc.rotate(-90, { origin: [65, zY + 105] });
        doc.fontSize(7).text('II- BU KISIM ZİRAAT ODASI TARAFINDAN DOLDURULACAKTIR.', 65 - (210/2), zY + 105 - 3.5, { width: 210, align: 'center' });
        doc.restore();
        doc.fontSize(8.5).text('BAĞ-KUR İL MÜDÜRLÜĞÜNE / KONYA', 220, zY + 10);
        doc.fontSize(8).text('Yukarıda açık kimliği yazılı sigortalının Odamızdaki kayıt durumu aşağıda belirtilmiştir.', 110, zY + 30);
        
        doc.fontSize(9);
        doc.text('KONYA İli', 105, zY + 50); 
        doc.text('Sicil No', 200, zY + 50, { underline: true }); 
        doc.text('Od.Kay.Tar.', 270, zY + 50, { underline: true , fillAndStroke: true}).lineWidth(0.3); 
        doc.text('Od Kay Silindiği Tarihi', 340, zY + 50, { underline: true, fillAndStroke: true }).lineWidth(0.3); 
        doc.text('Yön Kur Kararı', 460, zY + 50, { underline: true , fillAndStroke: true}).lineWidth(0.3);
        
        // --- TABLO VE MUAFİYET MANTIĞI ---
        let rowY = zY + 65;
        let muafiyetNotlari = [];
        let ilkSatirYazildi = false; 

        kayitlar.forEach(k => {
            const tarihCevir = (gelenTarih) => {
                if (!gelenTarih || gelenTarih == null) return null;
                try {
                    let d = new Date(gelenTarih);
                    if (isNaN(d.getTime()) || d.getFullYear() <= 1900) return null;
                    return d.toLocaleDateString('tr-TR');
                } catch (e) {
                    return null;
                }
            };

            let t1 = tarihCevir(k.tarih);
            let t2 = tarihCevir(k.tarihh);

            if (k.tür === 'Muafiyet') {
                if (t1 && !t2) {
                    muafiyetNotlari.push(`${t1} tarihinde muafiyet girişi vardır.`);
                } else if (t1 && t2) {
                    muafiyetNotlari.push(`${t1} tarihinde muafiyete girip, ${t2} tarihinde muafiyetten çıkmıştır.`);
                }
            } else {
                if (!ilkSatirYazildi) {
                    doc.text('Sarayönü Zir. Odası', 105, rowY); 
                    doc.text(ciftci.sicil || '......', 200, rowY); 
                    ilkSatirYazildi = true;
                }

                doc.text(t1 || '../../....', 270, rowY); 
                doc.text(t2 || '../../....', 340, rowY); 
                doc.text(k.aciklama || '..............', 460, rowY, {width: 60});
                
                rowY += 12; 
            }
        });

        // --- MUAFİYET NOTU YAZDIR ---
        if (muafiyetNotlari.length > 0) {
            let tamNot = "MUAFİYET: " + muafiyetNotlari.join(' ');
            doc.fontSize(8.5).font('TR');

            doc.save(); 
            doc.fillColor('black');
            doc.strokeColor('black');
            doc.lineWidth(0.15); 
            
            doc.text(tamNot, 105, rowY + 5, { 
                width: 450, 
                align: 'left', 
                fill: true, 
                stroke: true,
                lineGap: -2 
            });
            doc.restore(); 

            rowY += doc.heightOfString(tamNot, { width: 450 }) + 2;
        } else {
            rowY += 5; 
        }

        // --- KAYIT DURUMU BELİRLEME ---
        let kayitDurumuMetni = "ODAMIZDA KAYDI DEVAM ETMEKTEDİR.";
        const normalKayitlar = kayitlar.filter(k => k.tür !== 'Muafiyet');
        if (normalKayitlar.length > 0) {
            const sonKayit = normalKayitlar[normalKayitlar.length - 1];
            let cikisStr = sonKayit.tarihh ? new Date(sonKayit.tarihh).toLocaleDateString('tr-TR') : "";
            if (cikisStr && cikisStr !== "01.01.1900" && cikisStr !== "../../....") {
                kayitDurumuMetni = "ODAMIZDAN KAYDI SİLİNMİŞTİR.";
            }
        }

        // --- KAYIT DURUMU YAZDIR ---
        doc.save();
        doc.fontSize(9).font('TR');
        doc.fillColor('black');
        doc.strokeColor('black');
        doc.lineWidth(0.15); 
        
        doc.text(kayitDurumuMetni, 105, rowY + 2, { 
            fill: true, 
            stroke: true 
        });
        doc.restore();

        // YETKİLİ ALANLARI
        doc.text('1.YETKİLİ', 105, zY + 145); doc.text('2.YETKİLİ', 400, zY + 145);
        doc.text('Adı Soyadı :', 105, zY + 160); doc.text('Adı Soyadı :', 400, zY + 160);
        doc.text('Görevi :', 105, zY + 172); doc.text('Tarih - mühür', 260, zY + 172); doc.text('Görevi :', 400, zY + 172);
        doc.text('İmzası :', 105, zY + 184); doc.text(new Date().toLocaleDateString('tr-TR'), 260, zY + 184); doc.text('İmzası :', 400, zY + 184);

        // --- III. KISIM: TARIM KREDİ ---
        let tkY = 520; 
        doc.rect(50, tkY, 495, 200).stroke(); 
        doc.moveTo(80, tkY).lineTo(80, tkY + 200).stroke(); 
        doc.save();
        doc.rotate(-90, { origin: [65, tkY + 100] });
        doc.fontSize(7).text('III- BU KISIM TARIM KREDİ KOOPERATİFİ TARAFINDAN DOLDURULACAKTIR.', 65 - (200/2), tkY + 100 - 3.5, { width: 200, align: 'center' });
        doc.restore();
        doc.fontSize(8.5).text('BAĞ-KUR İL MÜDÜRLÜĞÜNE', 250, tkY + 10);
        doc.fontSize(8).text('Yukarıda açık kimliği yazılı sigortalının Kooperatifimizdeki kayıt durumu aşağıda belirtilmiştir.', 110, tkY + 35);
        doc.fontSize(9);
        doc.fontSize(9);
        doc.text('İlçesi/Köyü', 115, tkY + 65, { underline: true , fillAndStroke: true}); 
        doc.text('Sicil No', 235, tkY + 65, { underline: true, fillAndStroke: true }); 
        doc.text('Kayıt tarihi', 320, tkY + 65, { underline: true , fillAndStroke: true}); 
        doc.text('Bitiş tarihi', 390, tkY + 65, { underline: true, fillAndStroke: true }); 
        doc.text('Yön Kur Kararı', 470, tkY + 65, { underline: true , fillAndStroke: true});

        doc.text('Sarayönü Tar Kredi Koop.', 115, tkY + 77);
        doc.text('............', 235, tkY + 77);
        doc.text('...../...../.........', 320, tkY + 77);
        doc.text('...../...../.........', 390, tkY + 77);
        doc.text('..................', 470, tkY + 77);

        doc.text('...../...../.........', 320, tkY + 87);
        doc.text('...../...../.........', 390, tkY + 87);
        doc.text('..................', 470, tkY + 87);
        doc.fontSize(9).text('1.YETKİLİ', 115, tkY + 120); doc.text('2.YETKİLİ', 400, tkY + 120);
        doc.text('Adı Soyadı :', 115, tkY + 135); doc.text('Adı Soyadı :', 400, tkY + 135);
        doc.text('Görevi :', 115, tkY + 147); doc.text('Tarih - mühür', 260, tkY + 147); doc.text('Görevi :', 400, tkY + 147);
        doc.text('İmzası :', 115, tkY + 159); doc.text('../../....', 260, tkY + 159); doc.text('İmzası :', 400, tkY + 159);

        // --- FOOTER ---
        doc.fontSize(7).text('STANDART FORM NO – İLK YAYIN TARİHİ: 10.043 – 01/01/2004', 50, 780);
        doc.text('REVİZYON NO – TARİHİ: 01 – 02/01/2006', 420, 780);

        doc.end();
    } catch (err) { console.error(err); res.status(500).send("Hata: " + err.message); }
});

app.post('/api/ciftci-guncelle-sicil', async (req, res) => {
    const { kimlikid, sicil } = req.body;
    try {
        let pool = await sql.connect(dbConfig);
        await pool.request()
            .input('kid', sql.Int, kimlikid)
            .input('sicil', sql.NVarChar, sicil)
            .query('UPDATE [çksdilekçe] SET [sicil] = @sicil WHERE [Kimlik] = @kid');
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});
app.post('/api/ciftci-guncelle-sicil', async (req, res) => {
    const { kimlikid, sicil } = req.body;
    try {
        let pool = await sql.connect(dbConfig);
        await pool.request()
            .input('kid', sql.Int, kimlikid)
            .input('sicil', sql.NVarChar, sicil)
            .query('UPDATE [çksdilekçe] SET [sicil] = @sicil WHERE [Kimlik] = @kid');
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// PDF İçin Tüm Çiftçi Bilgilerini Getiren Yol
// PDF İçin Tüm Çiftçi Bilgilerini Getiren Yol (GÜNCELLENDİ)
app.get('/api/rapor/bilgiler/:kimlikid', async (req, res) => {
    try {
        let pool = await sql.connect(dbConfig);
        const kid = req.params.kimlikid;

        // Senin gönderdiğin tam sütun adlarını köşeli parantez ile ekledik
        let ciftciResult = await pool.request()
            .input('kid', sql.Int, kid)
            .query(`
                SELECT 
                    c.[Kimlik], 
                    c.[Tc Kimlik No], 
                    c.[Adı Soyadı], 
                    c.[Baba Adı], 
                    c.[Doğum Tarihi], 
                    c.[İlçe], 
                    c.[Köy/Mahalle],
                    s.sicil, s.ana, s.dogyer, s.bagkurno
                FROM [çksdilekçe] c
                LEFT JOIN [sicilliste] s ON c.Kimlik = s.kimlikid
                WHERE c.Kimlik = @kid
            `);

        let tabloResult = await pool.request()
            .input('kid', sql.Int, kid)
            .query('SELECT * FROM [ibbilgileri] WHERE kimlikid = @kid ORDER BY tarih ASC');

        if (ciftciResult.recordset.length > 0) {
            res.json({
                success: true,
                ciftci: ciftciResult.recordset[0], 
                tablo: tabloResult.recordset       
            });
        } else {
            res.json({ success: false, message: "Kayıt bulunamadı." });
        }

    } catch (err) {
        console.error("Rapor Verisi Çekme Hatası:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// =========================================================================
// 🏢 YENİ ENDPOINT: SADECE TÜZEL KİŞİLER (ŞİRKETLER / KOOPERATİFLER) İÇİN
// =========================================================================
app.post('/api/belgenet-yukle-sirket', async (req, res) => {
    
    // Şirket paketinde TC veya Doğum Tarihi aranmaz! Sadece Vergi No ve Ad Soyad (Şirket Adı) alınır.
    const { vergino, adsoyad, dilekceno, dosyadı, hedefIP, sayfasayisi } = req.body;
    
    const temizVergi = (vergino === 'null' || vergino === 'undefined' || !vergino) ? '' : vergino.toString().trim();

    if (!temizVergi || !dilekceno || !dosyadı) {
        return res.json({ success: false, message: "HATA: Vergi No, Dilekçe No veya Dosya Adı eksik!" });
    }

    belgenetRobotDurdurSifirla();

    const aktifRobotIP = hedefIP || '127.0.0.1';
    
    try {
        await belgenetRobotSirayaAl(async () => {
        belgenetRobotKontrol();
        console.log(`🏢 [TÜZEL KİŞİ] ${dosyadı} için ${aktifRobotIP} üzerinde şirket operasyonu başladı`);

        let gercekDosyaAdi = dosyadı.trim();
        if (!gercekDosyaAdi.toLowerCase().endsWith('.pdf')) gercekDosyaAdi += '.pdf';

        let dosyaYolu;
        try {
            dosyaYolu = pdfYolunuBul(gercekDosyaAdi);
        } catch (pdfBulErr) {
            console.error('❌ PDF arama hatası:', pdfBulErr.message);
            if (!res.headersSent) {
                return res.json({ success: false, message: pdfBulErr.message });
            }
            return;
        }
        const temizDosyaAdi = gercekDosyaAdi.replace(/\.pdf$/i, "");

        const browser = await puppeteer.connect({ browserURL: `http://${aktifRobotIP}:9222`, defaultViewport: null });
        const pages = await browser.pages();
        const page = pages.find(p => p.url().includes('tzob.org.tr')); 

        if (!page) return res.json({ success: false, message: "Belgenet (TZOB) sayfası açık değil!" }); 

        await page.bringToFront();
        await belgenetBekle(1200); 

        const targetFrame = page.frames().find(f => f.url().includes('xhtml') || f.url().includes('main')) || page.mainFrame();

        const sayfa = parseInt(sayfasayisi) || 1;
        try {
            const pdfHazir = await belgenetPdfYukle(page, targetFrame, dosyaYolu, sayfa);
            if (!pdfHazir) {
                if (!res.headersSent) {
                    return res.json({ success: false, message: 'PDF Belgenet\'e yüklenemedi (N/A). Dosya sunucuya gitmedi, işlem durduruldu.' });
                }
                return;
            }
        } catch (pdfErr) {
            console.error('❌ PDF yükleme hatası:', pdfErr.message);
            if (!res.headersSent) return res.json({ success: false, message: `PDF yüklenemedi: ${pdfErr.message}` });
            return;
        }

        // 📅 EVRAK TARİHİ
        const bugun = new Date().toLocaleDateString('tr-TR');
        for (let deneme = 1; deneme <= 3; deneme++) { 
            const tarihId = await targetFrame.evaluate(() => {
                const input = document.querySelector('input[id*="evrakTarihi_input"]') || document.querySelector('input[id*="EvrakTarihi"]');
                return (input && input.offsetParent !== null) ? input.id : null;
            });
            if (tarihId) {
                await targetFrame.focus(`[id="${tarihId}"]`); await belgenetBekle(800);
                await page.keyboard.down('Control'); await page.keyboard.press('A'); await page.keyboard.up('Control'); await page.keyboard.press('Backspace'); await belgenetBekle(500);
                await page.keyboard.type(bugun, { delay: 150 }); await belgenetBekle(500); await page.keyboard.press('Tab'); await belgenetBekle(800); 
                const icerik = await targetFrame.evaluate((id) => document.getElementById(id)?.value || "", tarihId);
                if (icerik.length >= 8) break; 
            } else await belgenetBekle(2000); 
        }
        await belgenetBekle(1000);

        // 📋 KONU KODU (240.02)
        await belgenetKonuKoduDoldur(page, targetFrame);

        // ✍️ KONU METNİ
        await belgenetBekle(800);
        await belgenetKonuYaz(page, targetFrame, temizDosyaAdi);

        await belgenetBekle(800); 
        await targetFrame.evaluate(() => {
            const select = document.querySelector('select[id*="evrakTuruCombo"]');
            if (select) { select.value = "A"; select.dispatchEvent(new Event('change', { bubbles: true })); }
        });
        await belgenetBekle(1200);

        // 📬 GELİŞ TİPİ: ELDEN
        await belgenetBekle(2000); 
        await targetFrame.evaluate(() => {
            const select = document.querySelector('select[id*="evrakGelisTipi"]');
            if (select) { const opt = [...select.options].find(o => o.text.toUpperCase().includes('ELDEN')); if (opt) { select.value = opt.value; select.dispatchEvent(new Event('change', { bubbles: true })); } }
        });
        await belgenetBekle(2500);

        await belgenetKisiyeHavaleDoldur(page, targetFrame);
        await belgenetBekle(2500);

        console.log("👤 'Kişi-Kurum' menüsünden 'Tüzel Kişi' seçiliyor...");
        for (let k = 0; k < 3; k++) {
            await targetFrame.evaluate(() => {
                const select = document.querySelector('select[id$=":kisiKurum"], select[id*="kisiKurum"]');
                if (select) {
                    const option = Array.from(select.options).find((opt) => opt.text.includes('Tüzel Kişi'));
                    if (option) {
                        select.value = option.value;
                        select.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                }
            });
            await belgenetBekle(1500);
            if (await belgenetKisiKurumTuzelMi(targetFrame)) break;
        }
        await belgenetBekle(500);

        // ==========================================
        // 🏢 GELDİĞİ KİŞİ VE HIZLI KAYIT (SADECE ŞİRKET)
        // ==========================================
        const aramaKutusuId = await targetFrame.evaluate(() => {
            const inputs = Array.from(document.querySelectorAll('input[type="text"]'));
            let el = inputs.find(i => i.offsetParent !== null && i.id.includes('TuzelKisi'));
            if (!el) {
                const labels = Array.from(document.querySelectorAll('label'));
                const targetLabel = labels.find(l => l.innerText.includes('Geldiği') && l.offsetParent !== null);
                if (targetLabel) { const forId = targetLabel.getAttribute('for'); if (forId) el = document.getElementById(forId); }
            }
            if (el) { el.focus(); return el.id; } return null;
        });

        if (aramaKutusuId) {
            await targetFrame.focus(`[id="${aramaKutusuId}"]`); await belgenetBekle(300);
            await page.keyboard.type(temizVergi, { delay: 100 }); 

            let secildiMi = false;
            for (let aramaDeneme = 1; aramaDeneme <= 12; aramaDeneme++) {
                await belgenetBekle(1500);
                secildiMi = await targetFrame.evaluate((arananNo) => {
                    const elms = Array.from(document.querySelectorAll('.lovItemTitle, .lovItemDetail, .ui-autocomplete-item'));
                    const h = elms.find(e => e.innerText.includes(arananNo) && e.offsetParent !== null);
                    if (h) { h.scrollIntoView({ block: 'center' }); h.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window })); h.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window })); h.click(); return true; } return false;
                }, temizVergi);
                if (secildiMi) break;
            }

            if (!secildiMi) {
                console.log(`⚠️ Şirket yok, '+' butonuyla Yeni Kayıt açılıyor...`);
                await targetFrame.evaluate(() => {
                    const btn = Array.from(document.querySelectorAll('button')).find(b => b.id && b.id.includes('TuzelKisiEkle')) || document.querySelector('.add-icon')?.closest('button');
                    if (btn) btn.click();
                });
                await belgenetBekle(2000);
                await belgenetTuzelKisiHizliKayit(page, targetFrame, temizVergi, adsoyad);

                const zatenSecili = await targetFrame.evaluate((no) => {
                    const inp = document.querySelector('input[id*="TuzelKisi"]');
                    return inp?.value?.includes(no) || false;
                }, temizVergi);

                if (!zatenSecili) {
                    console.log('🔍 Tüzel kişi kaydı sonrası şirket seçiliyor...');
                    await targetFrame.evaluate((id, no) => {
                        const el = document.getElementById(id);
                        if (el) { el.focus(); el.value = no; el.dispatchEvent(new Event('input', { bubbles: true })); }
                    }, aramaKutusuId, temizVergi);
                    for (let d = 1; d <= 5; d++) {
                        await belgenetBekle(d === 1 ? 600 : 400);
                        const bulundu = await targetFrame.evaluate((arananNo) => {
                            const elms = Array.from(document.querySelectorAll('.lovItemTitle, .lovItemDetail, .ui-autocomplete-item'));
                            const h = elms.find((e) => e.innerText.includes(arananNo) && e.offsetParent !== null);
                            if (h) { h.click(); return true; }
                            return false;
                        }, temizVergi);
                        if (bulundu) { console.log('✅ Şirket listeden seçildi'); break; }
                    }
                } else {
                    console.log('✅ Şirket zaten seçili, arama atlandı');
                }
            }
        }
        
        // Kaydet öncesi form kontrolü — eksik alan varsa düzelt
        for (let f = 1; f <= 2; f++) {
            const hazir = await belgenetSirketFormuDuzelt(page, targetFrame, { konuMetni: temizDosyaAdi, vkn: temizVergi });
            if (hazir) break;
            console.log(`⚠️ Form düzeltme ${f}. tur`);
            await belgenetBekle(800);
        }

        // 3️⃣ ANA KAYDET 
        console.log('💾 Ana evrak Kaydet butonuna basılıyor...');
        const eskiNumaralar = await targetFrame.evaluate(() => document.body.innerText.match(/\b\d{6}\b/g) || []);
        await targetFrame.evaluate(() => {
            const butonlar = [...document.querySelectorAll('.ui-button, button, input[type="submit"], input[type="button"], a')];
            const hedefButon = butonlar.find(el => el.offsetParent !== null && (el.innerText || el.value || el.textContent || '').trim().toUpperCase().includes('KAYDET'));
            if (hedefButon) hedefButon.click();
        });
        await belgenetEvetOnayiniBekle(page, targetFrame, 8, 350);

        // 4️⃣ NUMARAYI BEKLE VE SQL'E YAZ
        let belgenetNo = null;
        for (let i = 0; i < 45; i++) { 
            belgenetRobotKontrol();
            await belgenetEvetOnayiniBekle(page, targetFrame, 3);
            await delayKontrollu(1000); 
            belgenetNo = await targetFrame.evaluate((eskiler) => {
                const ekrandaki = document.body.innerText.match(/\b\d{6}\b/g) || [];
                return ekrandaki.find(num => !eskiler.includes(num)) || null;
            }, eskiNumaralar);
            if (belgenetNo) break; 
        }

        if (belgenetNo) {
            const tarih = new Date();
            const bugunTarih = `${tarih.getFullYear()}-${String(tarih.getMonth() + 1).padStart(2, '0')}-${String(tarih.getDate()).padStart(2, '0')}`;
            const personelAdi = req.body.kullanici || 'BAHRİ KARLI';
            let sqlBasarili = false; let sqlHataMesaji = "";

            try {
                const pool = await getPool(); 
                const guncellenecekDosya = req.body.dosyadı || req.body.dosyadi;
                
                await pool.request()
                    .input('bNo', belgenetNo)
                    .input('bTarih', bugunTarih)
                    .input('vNo', temizVergi)
                    .input('dilekceno', dilekceno)
                    .input('dosyaAdi', guncellenecekDosya)
                    .input('personel', personelAdi)
                    .query(`
                        UPDATE b
                        SET b.belgenetno = @bNo, b.belgenettarihi = @bTarih, b.bkullanici = @personel
                        FROM belgenet b
                        INNER JOIN çksdilekçe c ON c.kimlik = b.kimlikid
                        INNER JOIN dilekçebilgileri d ON c.kimlik = d.kimlikid
                        WHERE b.dosyadı = @dosyaAdi
                          AND (c.vergino = @vNo OR LTRIM(RTRIM(c.[Tc Kimlik No])) = @vNo)
                          AND d.dilekçeno = @dilekceno
                    `);
                console.log(`💾 Şirket Belgenet No (${belgenetNo}) SQL'e işlendi.`);
                sqlBasarili = true;
            } catch (dbHata) { sqlBasarili = false; sqlHataMesaji = dbHata.message; }

            // 🔄 SIFIRLAMA
            await belgenetBekle(1000); 
            const yeniKayitBasarili = await targetFrame.evaluate(() => {
                const butonlar = [...document.querySelectorAll('.ui-button, button, input[type="submit"], input[type="button"], a, span')];
                let islemBtn = butonlar.find(el => el.offsetParent !== null && (el.innerText || '').trim().toUpperCase() === 'YENİ KAYIT');
                if (islemBtn) { islemBtn.click(); return true; }
                let kapatBtn = butonlar.find(el => el.offsetParent !== null && (el.innerText || '').trim().toUpperCase() === 'KAPAT');
                if (kapatBtn) kapatBtn.click(); return false;
            });

            if (!yeniKayitBasarili) {
                await belgenetBekle(2000); 
                await page.evaluate(() => {
                    const linkler = Array.from(document.querySelectorAll('a'));
                    const gelenEvrakLink = linkler.find(el => (el.innerText && el.innerText.includes('Gelen Evrak Kayıt')) || (el.title && el.title.includes('Shift + G')));
                    if (gelenEvrakLink) gelenEvrakLink.click();
                });
            }
            
            await belgenetBekle(3500); 
            if (!res.headersSent) {
                if (sqlBasarili) res.json({ success: true, belgenetNo: belgenetNo, message: `${temizVergi} numaralı şirket işlenmiştir.` });
                else res.json({ success: false, message: `Hata: ${sqlHataMesaji}` });
            }
        } else {
            if (!res.headersSent) res.json({ success: false, message: "Kayıt başarısız, 45 saniye içinde numara okunamadı!" });
        }

        }); // belgenetRobotSirayaAl sonu
    } catch (err) {
        if (err instanceof BelgenetRobotDurdurulduHatasi || err?.kod === 'ROBOT_DURDURULDU') {
            console.log('🛑 Şirket Belgenet yükleme kullanıcı tarafından durduruldu.');
            if (!res.headersSent) {
                res.json({ success: false, durduruldu: true, message: 'Robot durduruldu.' });
            }
            return;
        }
        if (!res.headersSent) res.json({ success: false, message: `Sistem Hatası: ${err.message}` });
    }
});

// PDF yol testi (robot çalıştırmadan dosya aramasını doğrula)
app.get('/api/pdf-kontrol', (req, res) => {
    let dosya = (req.query.dosya || '').trim();
    if (!dosya) return res.json({ success: false, message: 'dosya parametresi gerekli' });
    if (!dosya.toLowerCase().endsWith('.pdf')) dosya += '.pdf';
    try {
        const yol = pdfYolunuBul(dosya);
        res.json({ success: true, yol, mesaj: 'PDF bulundu' });
    } catch (err) {
        res.json({ success: false, message: err.message });
    }
});
// === BELGENET-ROBOT-SYNC-END ===

// 📜 GEÇMİŞ RAPORLARI LİSTELE (MODAL İÇİN)
// server.js içindeki geçmiş listesi API'sini bununla değiştir:
app.get('/api/ib/gecmis-listesi/:kimlikid', async (req, res) => {
    try {
        let pool = await sql.connect(dbConfig);
        const result = await pool.request()
            .input('kid', sql.Int, req.params.kimlikid)
            .query(`
                SELECT 
                    LogID, 
                    Personel, 
                    TaramaYolu, -- 🎯 KRİTİK: Bu kolon mutlaka olmalı!
                    FORMAT(BasimTarihi, 'dd.MM.yyyy HH:mm', 'tr-TR') as BasimTarihiFormatli
                FROM [RaporBasimGecmisi] 
                WHERE CiftciID = @kid 
                ORDER BY LogID DESC
            `);
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ❌ GEÇMİŞ RAPORU SİL (BAŞLIK VE DETAYLARIYLA)
app.delete('/api/ib/gecmis-sil/:logid', async (req, res) => {
    try {
        let pool = await sql.connect(dbConfig);
        const logId = req.params.logid;

        // 🎯 1. ÖNCE FİZİKSEL DOSYAYI SİLELİM (Temizlik Şart)
        const getFileResult = await pool.request()
            .input('logid', sql.Int, logId)
            .query('SELECT TaramaYolu FROM [RaporBasimGecmisi] WHERE LogID = @logid');

        if (getFileResult.recordset.length > 0) {
            const dosyaYolu = getFileResult.recordset[0].TaramaYolu;
            if (dosyaYolu && fs.existsSync(dosyaYolu)) {
                fs.unlinkSync(dosyaYolu); // PDF'i klasörden sildik
                console.log(`PDF Silindi: ${dosyaYolu}`);
            }
        }

        // 🎯 2. DETAYLARI SİLİYORUZ (Senin eklediğin kısım - Kritik!)
        await pool.request()
            .input('logid', sql.Int, logId)
            .query('DELETE FROM [RaporBasimDetaylari] WHERE LogID = @logid');
            
        // 🎯 3. ANA BAŞLIĞI SİLİYORUZ
        await pool.request()
            .input('logid', sql.Int, logId)
            .query('DELETE FROM [RaporBasimGecmisi] WHERE LogID = @logid');

        res.json({ success: true, message: "Rapor, detaylar ve fiziksel PDF tamamen silindi." });

    } catch (err) {
        console.error("Silme Hatası:", err);
        res.status(500).json({ success: false, message: err.message });
    }
});
// 🔍 ESKİ RAPORU ÖNİZLE (ARŞİV KOPYASI ÇİZİMİ)
app.get('/api/ib/rapor-gecmis/:logid', async (req, res) => {
    try {
        let pool = await sql.connect(dbConfig);
        const logId = req.params.logid;

        // 1. Log kaydından çiftçinin kim olduğunu bul
        const logSorgu = await pool.request().input('logid', sql.Int, logId)
            .query('SELECT CiftciID, BasimTarihi FROM [RaporBasimGecmisi] WHERE LogID = @logid');
        
        if (logSorgu.recordset.length === 0) return res.status(404).send("Rapor bulunamadı.");
        
        const ciftciID = logSorgu.recordset[0].CiftciID;
        const basimTarihi = new Date(logSorgu.recordset[0].BasimTarihi).toLocaleDateString('tr-TR');

        // 2. Çiftçinin ana bilgilerini çek (Sicil vs.)
        let ciftci = (await pool.request().input('kid', sql.Int, ciftciID).query(`
            SELECT c.[Tc Kimlik No], c.[Adı Soyadı], c.[Baba Adı], c.[İlçe], c.[Köy/Mahalle], c.[Doğum Tarihi],
                   s.sicil, s.ana, s.dogyer, s.bagkurno 
            FROM [çksdilekçe] c
            LEFT JOIN [sicilliste] s ON c.Kimlik = s.kimlikid
            WHERE c.[Kimlik] = @kid
        `)).recordset[0] || {};
        
        // 🎯 3. İŞTE BÜYÜ GÜCÜ: O günkü dondurulmuş (Snapshot) satırları çek!
        let kayitlar = (await pool.request().input('logid', sql.Int, logId).query(`
            SELECT [tür], [tarih], [tarihh], [aciklama] 
            FROM [RaporBasimDetaylari] 
            WHERE LogID = @logid 
            ORDER BY DetayID ASC
        `)).recordset || [];

        // --- BUNDAN SONRASI PDF ÇİZİMİ ---
        const doc = new PDFKitDocument({ size: 'A4', margin: 0 });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename=Arsiv_Belgesi_${logId}.pdf`);
        doc.pipe(res);

        const fontPath = path.join(__dirname, 'arial.ttf');
        if (fs.existsSync(fontPath)) { doc.registerFont('TR', fontPath); doc.font('TR'); }

        let dogYerTarih = ciftci.dogyer || "";
        if (ciftci['Doğum Tarihi']) {
            let dt = new Date(ciftci['Doğum Tarihi']);
            if (dt.getFullYear() > 1900) {
                let dtStr = dt.toLocaleDateString('tr-TR');
                dogYerTarih += dogYerTarih ? " / " + dtStr : dtStr;
            }
        }

        // 🎯 BAŞLIĞA ARŞİV NOTU DÜŞTÜK!
        doc.fontSize(12).font('TR').text('BAĞ-KUR SİGORTALILIK BELGESİ (ARŞİV KOPYASI)', 0, 35, { align: 'center', stroke: true });
        doc.fontSize(10).font('TR').text(`(${basimTarihi} TARİHLİ BASIMDIR)`, { align: 'center', stroke: true });

        // TABLO VE DİĞER ÇİZİMLER (Senin Orijinal Ayarların)
        let tableY = 65; let tableX = 50; let w = 495; let leftW = 270; let h = 14;      
        doc.lineWidth(0.5).rect(tableX, tableY, w, h * 4).stroke();
        doc.moveTo(tableX + 30, tableY).lineTo(tableX + 30, tableY + h * 4).stroke();
        doc.moveTo(tableX + leftW, tableY).lineTo(tableX + leftW, tableY + h * 4).stroke();
        doc.moveTo(tableX + 30, tableY + h).lineTo(tableX + w, tableY + h).stroke();
        doc.moveTo(tableX + 30, tableY + h * 2).lineTo(tableX + w, tableY + h * 2).stroke();
        doc.moveTo(tableX + 30, tableY + h * 3).lineTo(tableX + leftW, tableY + h * 3).stroke();

        doc.fontSize(9).font('TR');
        let tPadX = 3; let tPadY = 3; let colonX = 65; let innerLeft = tableX + 30; 

        doc.text('Bağ-No', innerLeft + tPadX, tableY + tPadY); doc.text(':', innerLeft + colonX, tableY + tPadY); doc.text(ciftci.bagkurno || '......................', innerLeft + colonX + 10, tableY + tPadY);
        doc.text('Ana adı', tableX + leftW + tPadX, tableY + tPadY); doc.text(':', tableX + leftW + 65, tableY + tPadY); doc.text(ciftci.ana || '......................', tableX + leftW + 75, tableY + tPadY);
        doc.text('T.C. Kimlik No', innerLeft + tPadX, tableY + h + tPadY); doc.text(':', innerLeft + colonX, tableY + h + tPadY); doc.text(ciftci['Tc Kimlik No'] || '', innerLeft + colonX + 10, tableY + h + tPadY);
        doc.text('D.yeri ve tarihi', tableX + leftW + tPadX, tableY + h + tPadY); doc.text(':', tableX + leftW + 65, tableY + h + tPadY); doc.text(dogYerTarih || '......................', tableX + leftW + 75, tableY + h + tPadY);
        doc.text('Adı  ve soyadı', innerLeft + tPadX, tableY + h * 2 + tPadY); doc.text(':', innerLeft + colonX, tableY + h * 2 + tPadY); doc.text(ciftci['Adı Soyadı'] || '', innerLeft + colonX + 10, tableY + h * 2 + tPadY);
        doc.text('Vergi Sicil No', tableX + leftW + tPadX, tableY + h * 2 + tPadY); doc.text(':', tableX + leftW + 65, tableY + h * 2 + tPadY);
        doc.text('Baba adı', innerLeft + tPadX, tableY + h * 3 + tPadY); doc.text(':', innerLeft + colonX, tableY + h * 3 + tPadY); doc.text(ciftci['Baba Adı'] || '', innerLeft + colonX + 10, tableY + h * 3 + tPadY);

        let mY = tableY + h * 4; let muhtarHeight = 210; 
        doc.rect(50, mY, 495, muhtarHeight).stroke(); doc.moveTo(80, mY).lineTo(80, mY + muhtarHeight).stroke(); 
        doc.save(); doc.rotate(-90, { origin: [65, mY + (muhtarHeight / 2)] }); doc.fontSize(7).text('I- BU KISIM İLGİLİ KÖY VEYA MAHALLE MUHTARLIĞINCA DOLDURULACAKTIR.', 65 - (muhtarHeight / 2), mY + (muhtarHeight / 2) - 3.5, { width: muhtarHeight, align: 'center' }); doc.restore();
        doc.fontSize(9).text(`...............Mahallesi Muhtarlığı`, 120, mY + 15); doc.text('Köyü', 170, mY + 25); doc.text('BAĞ-KUR İL MÜDÜRLÜĞÜNE', 250, mY + 35); doc.text('Yukarıda açık kimliği yazılı sigortalının 2926 sayılı Kanuna göre tarımsal faaliyette bulunduğu süreler aşağıda belirtilmiştir.', 110, mY + 65, { width: 420 });
        doc.text('Bildirim Cetveli Sıra No', 140, mY + 100); doc.text('Başlangıç Tarihi', 300, mY + 100); doc.text('Bitiş Tarihi', 450, mY + 100);
        doc.text('...........................', 140, mY + 115); doc.text('...../...../.........', 320, mY + 115); doc.text('...../...../.........', 460, mY + 115);
        doc.text('...........................', 140, mY + 130); doc.text('...../...../.........', 320, mY + 130); doc.text('...../...../.........', 460, mY + 130);
        doc.text('Onaylayanın', 170, mY + 175); doc.text('Tarih - mühür', 345, mY + 175); doc.text('Adı, Soyadı ve Ünvanı / İmzası', 140, mY + 187); doc.text('...../...../.........', 355, mY + 187);

        let zY = mY + muhtarHeight; 
        doc.rect(50, zY, 495, 210).stroke(); doc.moveTo(80, zY).lineTo(80, zY + 210).stroke(); 
        doc.save(); doc.rotate(-90, { origin: [65, zY + 105] }); doc.fontSize(7).text('II- BU KISIM ZİRAAT ODASI TARAFINDAN DOLDURULACAKTIR.', 65 - (210/2), zY + 105 - 3.5, { width: 210, align: 'center' }); doc.restore();
        doc.fontSize(8.5).text('BAĞ-KUR İL MÜDÜRLÜĞÜNE / KONYA', 220, zY + 10); doc.fontSize(8).text('Yukarıda açık kimliği yazılı sigortalının Odamızdaki kayıt durumu aşağıda belirtilmiştir.', 110, zY + 30);
        doc.fontSize(9); doc.text('KONYA İli', 105, zY + 50); doc.text('Sicil No', 200, zY + 50, { underline: true }); doc.text('Od.Kay.Tar.', 270, zY + 50, { underline: true , fillAndStroke: true}).lineWidth(0.3); doc.text('Od Kay Silindiği Tarihi', 340, zY + 50, { underline: true, fillAndStroke: true }).lineWidth(0.3); doc.text('Yön Kur Kararı', 460, zY + 50, { underline: true , fillAndStroke: true}).lineWidth(0.3);
        
        let rowY = zY + 65; let muafiyetNotlari = []; let ilkSatirYazildi = false; 

        kayitlar.forEach(k => {
            const tarihCevir = (gelenTarih) => {
                if (!gelenTarih || gelenTarih == null) return null;
                try { let d = new Date(gelenTarih); if (isNaN(d.getTime()) || d.getFullYear() <= 1900) return null; return d.toLocaleDateString('tr-TR'); } catch (e) { return null; }
            };
            let t1 = tarihCevir(k.tarih); let t2 = tarihCevir(k.tarihh);

            if (k.tür === 'Muafiyet') {
                if (t1 && !t2) muafiyetNotlari.push(`${t1} tarihinde muafiyet girişi vardır.`);
                else if (t1 && t2) muafiyetNotlari.push(`${t1} tarihinde muafiyete girip, ${t2} tarihinde muafiyetten çıkmıştır.`);
            } else {
                if (!ilkSatirYazildi) { doc.text('Sarayönü Zir. Odası', 105, rowY); doc.text(ciftci.sicil || '......', 200, rowY); ilkSatirYazildi = true; }
                doc.text(t1 || '../../....', 270, rowY); doc.text(t2 || '../../....', 340, rowY); doc.text(k.aciklama || '..............', 460, rowY, {width: 60}); rowY += 12; 
            }
        });

        if (muafiyetNotlari.length > 0) {
            let tamNot = "MUAFİYET: " + muafiyetNotlari.join(' ');
            doc.fontSize(8.5).font('TR'); doc.save(); doc.fillColor('black'); doc.strokeColor('black'); doc.lineWidth(0.15); 
            doc.text(tamNot, 105, rowY + 5, { width: 450, align: 'left', fill: true, stroke: true, lineGap: -2 }); doc.restore(); rowY += doc.heightOfString(tamNot, { width: 450 }) + 2;
        } else rowY += 5; 

        let kayitDurumuMetni = "ODAMIZDA KAYDI DEVAM ETMEKTEDİR.";
        const normalKayitlar = kayitlar.filter(k => k.tür !== 'Muafiyet');
        if (normalKayitlar.length > 0) {
            const sonKayit = normalKayitlar[normalKayitlar.length - 1];
            let cikisStr = sonKayit.tarihh ? new Date(sonKayit.tarihh).toLocaleDateString('tr-TR') : "";
            if (cikisStr && cikisStr !== "01.01.1900" && cikisStr !== "../../....") kayitDurumuMetni = "ODAMIZDAN KAYDI SİLİNMİŞTİR.";
        }

        doc.save(); doc.fontSize(9).font('TR'); doc.fillColor('black'); doc.strokeColor('black'); doc.lineWidth(0.15); doc.text(kayitDurumuMetni, 105, rowY + 2, { fill: true, stroke: true }); doc.restore();
        doc.text('1.YETKİLİ', 105, zY + 145); doc.text('2.YETKİLİ', 400, zY + 145); doc.text('Adı Soyadı :', 105, zY + 160); doc.text('Adı Soyadı :', 400, zY + 160); doc.text('Görevi :', 105, zY + 172); doc.text('Tarih - mühür', 260, zY + 172); doc.text('Görevi :', 400, zY + 172); doc.text('İmzası :', 105, zY + 184); doc.text(basimTarihi, 260, zY + 184); doc.text('İmzası :', 400, zY + 184);

        let tkY = zY + 210; 
        doc.rect(50, tkY, 495, 185).stroke(); doc.moveTo(80, tkY).lineTo(80, tkY + 185).stroke(); doc.save(); doc.rotate(-90, { origin: [65, tkY + 92] }); doc.fontSize(7).text('III- BU KISIM TARIM KREDİ KOOPERATİFİ TARAFINDAN DOLDURULACAKTIR.', 65 - (185/2), tkY + 92 - 3.5, { width: 185, align: 'center' }); doc.restore();
        doc.fontSize(8.5).text('BAĞ-KUR İL MÜDÜRLÜĞÜNE', 250, tkY + 10); doc.fontSize(8).text('Yukarıda açık kimliği yazılı sigortalının Kooperatifimizdeki kayıt durumu aşağıda belirtilmiştir.', 110, tkY + 35);
        doc.fontSize(9); doc.text('İlçesi/Köyü', 115, tkY + 65, { underline: true , fillAndStroke: true}); doc.text('Sicil No', 235, tkY + 65, { underline: true, fillAndStroke: true }); doc.text('Kayıt tarihi', 320, tkY + 65, { underline: true , fillAndStroke: true}); doc.text('Bitiş tarihi', 390, tkY + 65, { underline: true, fillAndStroke: true }); doc.text('Yön Kur Kararı', 470, tkY + 65, { underline: true , fillAndStroke: true});
        doc.text('Sarayönü Tar Kredi Koop.', 115, tkY + 77); doc.text('............', 235, tkY + 77); doc.text('...../...../.........', 320, tkY + 77); doc.text('...../...../.........', 390, tkY + 77); doc.text('..................', 470, tkY + 77);
        doc.text('...../...../.........', 320, tkY + 87); doc.text('...../...../.........', 390, tkY + 87); doc.text('..................', 470, tkY + 87);
        doc.fontSize(9).text('1.YETKİLİ', 115, tkY + 120); doc.text('2.YETKİLİ', 400, tkY + 120); doc.text('Adı Soyadı :', 115, tkY + 135); doc.text('Adı Soyadı :', 400, tkY + 135); doc.text('Görevi :', 115, tkY + 147); doc.text('Tarih - mühür', 260, tkY + 147); doc.text('Görevi :', 400, tkY + 147); doc.text('İmzası :', 115, tkY + 159); doc.text('../../....', 260, tkY + 159); doc.text('İmzası :', 400, tkY + 159);
        doc.fontSize(7).text('STANDART FORM NO – İLK YAYIN TARİHİ: 10.043 – 01/01/2004', 50, 810); doc.text('REVİZYON NO – TARİHİ: 01 – 02/01/2006', 420, 810);

        doc.end();
    } catch (err) { console.error(err); res.status(500).send("Hata: " + err.message); }
});



// --- 📂 2926 Sayılı Kanun Tarama Ayarları ---
function ibTaramaKlasorleri() {
    const kok = taramaKokYol(sistemAyarAl());
    return {
        havuz: path.join(kok, 'ibtaramalar'),
        arsiv: path.join(kok, 'ib')
    };
}
const ibStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const { havuz } = ibTaramaKlasorleri();
        fs.mkdirSync(havuz, { recursive: true });
        cb(null, havuz);
    },
    filename: (req, file, cb) => {
        cb(null, 'temp_' + Date.now() + '.pdf');
    }
});
const ibUpload = multer({ storage: ibStorage });

// 2. Yükleme ve Yeniden İsimlendirme API'si
app.post('/api/ib/tarama-yukle', ibUpload.single('dosya'), async (req, res) => {
    try {
        const logId = req.body.logId;
        const tempPath = req.file.path; // Dosyanın o anki yolu (ibtaramalar klasöründe)
        
        // 🎯 Hedef Arşiv Klasörü: ib
        const hedefKlasor = ibTaramaKlasorleri().arsiv;
        if (!fs.existsSync(hedefKlasor)) {
            fs.mkdirSync(hedefKlasor, { recursive: true });
        }

        // 🎯 Yeni İsim ve Yeni Yol
        const yeniDosyaAdi = `ibform-${logId}.pdf`;
        const asilHedefYolu = path.join(hedefKlasor, yeniDosyaAdi);

        // 🚀 TAŞIMA İŞLEMİ: Havuzdan al, ismini değiştir ve asıl klasöre koy
        fs.renameSync(tempPath, asilHedefYolu);

        // SQL'e asıl arşiv yolunu kaydediyoruz
        let pool = await sql.connect(dbConfig);
        await pool.request()
            .input('logid', sql.Int, logId)
            .input('yol', sql.NVarChar, asilHedefYolu)
            .query('UPDATE [RaporBasimGecmisi] SET TaramaYolu = @yol WHERE LogID = @logid');

        res.json({ 
            success: true, 
            message: `Dosya havuzdan alındı, ibform-${logId}.pdf olarak asıl arşive taşındı!` 
        });

    } catch (err) {
        console.error("Taşıma Hatası:", err);
        res.status(500).json({ success: false, message: err.message });
    }
});
// 📄 KAYITLI TARAMAYI AÇ
// 📄 KAYITLI TARAMAYI FİZİKSEL OLARAK OKU VE GÖSTER
app.get('/api/ib/tarama-oku/:logid', async (req, res) => {
    try {
        let pool = await sql.connect(dbConfig);
        const result = await pool.request()
            .input('logid', sql.Int, req.params.logid)
            .query('SELECT TaramaYolu FROM [RaporBasimGecmisi] WHERE LogID = @logid');

        if (result.recordset.length > 0 && result.recordset[0].TaramaYolu) {
            const dosyaYolu = result.recordset[0].TaramaYolu;
            
            // Dosya gerçekten klasörde var mı kontrol et
            if (fs.existsSync(dosyaYolu)) {
                res.sendFile(dosyaYolu); // PDF dosyasını gönder
            } else {
                res.status(404).send("Hata: Dosya klasörde bulunamadı! (ibTaramaKlasorleri().havuz)");
            }
        } else {
            res.status(404).send("Bu rapora ait tarama kaydı veritabanında yok.");
        }
    } catch (err) {
        console.error("Dosya okuma hatası:", err);
        res.status(500).send("Sunucu hatası: Dosya okunamadı.");
    }
});

// 🔍 HAVUZDAKİ EN SON DOSYAYI GETİR
app.get('/api/ib/en-son-tarama', (req, res) => {
    const havuzKlasoru = 'ibTaramaKlasorleri().havuz';
    
    try {
        if (!fs.existsSync(havuzKlasoru)) {
            return res.status(404).json({ success: false, message: "Havuz klasörü bulunamadı." });
        }

        const dosyalar = fs.readdirSync(havuzKlasoru)
            .map(file => ({
                name: file,
                time: fs.statSync(path.join(havuzKlasoru, file)).mtime.getTime()
            }))
            .filter(file => file.name.toLowerCase().endsWith('.pdf'))
            .sort((a, b) => b.time - a.time); // En yeni en üstte

        if (dosyalar.length > 0) {
            // En yeni dosyanın yolunu gönderiyoruz
            res.json({ success: true, dosyaAdi: dosyalar[0].name });
        } else {
            res.status(404).json({ success: false, message: "Klasörde PDF bulunamadı." });
        }
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// 📄 HAVUZDAKİ DOSYAYI OKUMA (Önizleme için)
app.get('/api/ib/havuzdan-oku/:filename', (req, res) => {
    const dosyaYolu = path.join('ibTaramaKlasorleri().havuz', req.params.filename);
    if (fs.existsSync(dosyaYolu)) {
        res.sendFile(dosyaYolu);
    } else {
        res.status(404).send("Dosya bulunamadı.");
    }
});

app.post('/api/ib/havuzdan-onayla', async (req, res) => {
    try {
        const { logId, dosyaAdi } = req.body;
        const havuzYolu = path.join('ibTaramaKlasorleri().havuz', dosyaAdi);
        const hedefKlasor = ibTaramaKlasorleri().arsiv;
        const yeniAd = `ibform-${logId}.pdf`;
        const finalYolu = path.join(hedefKlasor, yeniAd);

        // 🎯 Hedef klasör yoksa oluştur
        if (!fs.existsSync(hedefKlasor)) fs.mkdirSync(hedefKlasor, { recursive: true });

        // 🚀 Taşı ve İsimlendir
        if (fs.existsSync(havuzYolu)) {
            fs.renameSync(havuzYolu, finalYolu);
            
            // 📝 SQL Güncelle (Yolu yeni klasöre göre yazıyoruz)
            let pool = await sql.connect(dbConfig);
            await pool.request()
                .input('logid', sql.Int, logId)
                .input('yol', sql.NVarChar, finalYolu)
                .query('UPDATE [RaporBasimGecmisi] SET TaramaYolu = @yol WHERE LogID = @logid');

            res.json({ success: true, message: "Dosya başarıyla arşive taşındı." });
        } else {
            res.status(404).json({ success: false, message: "Dosya havuzda bulunamadı!" });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ==========================================
//             VTÇKS ENDPOINTLERİ
// ==========================================

// ==========================================
//             VTÇKS ENDPOINTLERİ
// ==========================================

// GET: Listele
app.get('/api/vtcks', async (req, res) => {
    try {
        const pool = await sql.connect(dbConfig); 
        const result = await pool.request()
            .query('SELECT * FROM VTÇKS ORDER BY Kimlik DESC');
        res.json(result.recordset);
    } catch (err) {
        console.error("VTÇKS listeleme hatası:", err);
        res.status(500).send("Hata oluştu.");
    }
});

// POST: Ekle
app.post('/api/vtcks', async (req, res) => {
    try {
        const { DefterTuru, Aciklama, DefterTarihi, Oda } = req.body;
        const pool = await sql.connect(dbConfig);
        
        await pool.request()
            .input('DefterTuru', sql.NVarChar(255), DefterTuru || null)
            .input('Aciklama', sql.NVarChar(255), Aciklama || null)
            .input('DefterTarihi', sql.NVarChar(255), DefterTarihi || null)
            .input('Oda', sql.Float, Oda ? parseFloat(Oda) : null)
            .query(`
                DECLARE @YeniAlan1 FLOAT = ISNULL((SELECT MAX(CAST([Alan1] AS FLOAT)) FROM VTÇKS), 0) + 1;
                
                INSERT INTO VTÇKS ([Alan1], [DefterTürü], [DefterTarihi], [Açıklama], [ODA])
                VALUES (@YeniAlan1, @DefterTuru, @DefterTarihi, @Aciklama, @Oda)
            `);
            
        res.status(201).send("Başarıyla eklendi.");
    } catch (err) {
        console.error("VTÇKS ekleme hatası:", err);
        res.status(500).send("Hata oluştu.");
    }
});

// PUT: Güncelle
app.put('/api/vtcks/:kimlik', async (req, res) => {
    try {
        const kimlik = req.params.kimlik;
        const { DefterTuru, Aciklama, DefterTarihi, Oda } = req.body;
        
        const pool = await sql.connect(dbConfig);
        await pool.request()
            .input('Kimlik', sql.Int, kimlik)
            .input('DefterTuru', sql.NVarChar(255), DefterTuru || null)
            .input('Aciklama', sql.NVarChar(255), Aciklama || null)
            .input('DefterTarihi', sql.NVarChar(255), DefterTarihi || null)
            .input('Oda', sql.Float, Oda ? parseFloat(Oda) : null)
            .query(`
                UPDATE VTÇKS 
                SET [DefterTürü] = @DefterTuru, 
                    [DefterTarihi] = @DefterTarihi, 
                    [Açıklama] = @Aciklama, 
                    [ODA] = @Oda
                WHERE Kimlik = @Kimlik
            `);
            
        res.send("Başarıyla güncellendi.");
    } catch (err) {
        console.error("VTÇKS güncelleme hatası:", err);
        res.status(500).send("Hata oluştu.");
    }
});

// DELETE: Sil
app.delete('/api/vtcks/:kimlik', async (req, res) => {
    try {
        const kimlik = req.params.kimlik;
        const pool = await sql.connect(dbConfig);
        await pool.request()
            .input('Kimlik', sql.Int, kimlik)
            .query('DELETE FROM VTÇKS WHERE Kimlik = @Kimlik');
            
        res.send("Başarıyla silindi.");
    } catch (err) {
        console.error("VTÇKS silme hatası:", err);
        res.status(500).send("Hata oluştu.");
    }
});

// Örnek bir Express route yapısı
// Kurum ayarlarını getir
app.get('/api/kurum-ayarlari', authenticateToken, async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request().query("SELECT TOP 1 * FROM ayarlar ORDER BY id DESC");
        
        if (result.recordset.length > 0) {
            const row = result.recordset[0];
            let teknik = sistemAyarAl();
            if (row.teknik_json) {
              try { teknik = sistemAyarBirlestir(JSON.parse(row.teknik_json)); } catch (_) {}
            }
            res.json({
              success: true,
              data: { ...row, teknik },
              teknik,
              anaSunucuUrl: anaSunucuUrl(teknik),
              marketSunucuUrl: marketSunucuUrl(teknik),
              taramaDetay: taramaDetayAl(teknik),
              taramaDurum: taramaKlasorDurumAl(teknik)
            });
        } else {
            const teknik = sistemAyarAl();
            res.json({
              success: false,
              message: 'Ayarlar bulunamadı.',
              teknik,
              anaSunucuUrl: anaSunucuUrl(teknik),
              marketSunucuUrl: marketSunucuUrl(teknik),
              taramaDetay: taramaDetayAl(teknik),
              taramaDurum: taramaKlasorDurumAl(teknik)
            });
        }
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Ayarları güncelle (Tanımlar kısmından kaydedince burası çalışacak)
// ... server.js içinde ...
app.post('/api/kurum-ayarlari-guncelle', authenticateToken, sadeceAdmin, async (req, res) => {
    const { kurum_adi, ilce_adi, il_adi, telefon, adres, ortak_kurum_adi, teknik } = req.body;
    try {
        const pool = await getPool();
        await ensureTeknikJsonKolon();
        let teknikJson = null;
        if (teknik && typeof teknik === 'object') {
          const kayitli = await sistemAyarDbKaydet(teknik);
          teknikJson = JSON.stringify(kayitli);
        }
        const reqDb = pool.request()
            .input('kurum', kurum_adi)
            .input('ortak', ortak_kurum_adi)
            .input('ilce', ilce_adi)
            .input('il', il_adi)
            .input('tel', telefon)
            .input('adr', adres);
        if (teknikJson) reqDb.input('teknik', sql.NVarChar(sql.MAX), teknikJson);
        await reqDb.query(`
                IF EXISTS (SELECT 1 FROM ayarlar)
                BEGIN
                    UPDATE ayarlar SET 
                        kurum_adi=@kurum, ortak_kurum_adi=@ortak, ilce_adi=@ilce, 
                        il_adi=@il, telefon=@tel, adres=@adr,
                        ${teknikJson ? 'teknik_json=@teknik,' : ''} guncelleme_tarihi=GETDATE()
                END
                ELSE
                BEGIN
                    INSERT INTO ayarlar (kurum_adi, ortak_kurum_adi, ilce_adi, il_adi, telefon, adres${teknikJson ? ', teknik_json' : ''}) 
                    VALUES (@kurum, @ortak, @ilce, @il, @tel, @adr${teknikJson ? ', @teknik' : ''})
                END
            `);
        res.json({
          success: true,
          message: 'Bilgiler güncellendi.',
          teknik: sistemAyarAl(),
          anaSunucuUrl: anaSunucuUrl(sistemAyarAl()),
          marketSunucuUrl: marketSunucuUrl(sistemAyarAl())
        });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

/** Yalnızca teknik / ağ ayarları (tanımlamalar ekranı) */
function taramaKlasorDurumAl(t) {
  const detay = taramaDetayAl(t);
  const havuz = detay.taramaHavuzYol;
  const yil = detay.taramaYilKlasorYol;
  const kok = detay.taramaKokKlasor;
  let havuzDosyaSayisi = 0;
  try {
    if (fs.existsSync(havuz)) {
      havuzDosyaSayisi = fs.readdirSync(havuz).filter((f) => /\.pdf$/i.test(f)).length;
    }
  } catch (_) {}
  return {
    kokKlasorVar: fs.existsSync(kok),
    havuzKlasorVar: fs.existsSync(havuz),
    yilKlasorVar: fs.existsSync(yil),
    havuzPdfSayisi: havuzDosyaSayisi
  };
}

app.get('/api/sistem-ayarlari', authenticateToken, async (req, res) => {
  try {
    await sistemAyarDbYukle();
    const t = sistemAyarAl();
    const taramaDetay = taramaDetayAl(t);
    res.json({
      success: true,
      teknik: t,
      anaSunucuUrl: anaSunucuUrl(t),
      marketSunucuUrl: marketSunucuUrl(t),
      taramaKokKlasor: taramaKokYol(t),
      taramaHavuzYol: taramaHavuzYol(t),
      taramaDetay,
      taramaDurum: taramaKlasorDurumAl(t)
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/sistem-ayarlari-guncelle', authenticateToken, sadeceAdmin, async (req, res) => {
  try {
    const kayitli = await sistemAyarDbKaydet(req.body || {});
    res.json({
      success: true,
      message: 'Teknik ayarlar kaydedildi. Sunucuyu yeniden başlatmanız önerilir.',
      teknik: kayitli,
      anaSunucuUrl: anaSunucuUrl(kayitli),
      marketSunucuUrl: marketSunucuUrl(kayitli)
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

if (CKSPAKET_MOD) {
  const { registerPaketGuncelleme } = require('./paket-guncelleme');
  registerPaketGuncelleme(app, { gercekKlasor, CKSPAKET_MOD, authenticateToken, sadeceAdmin });
}

// ========== ÇKS SIRAMATİK (SQL Server — CKS_Sira tablosu) ==========
const siraDosya = path.join(gercekKlasor, 'sira-kuyruk.json');

function bugunTarihStr() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });
}

// Saat UTC'ye çevrilmeden SQL'deki yerel saat olarak döner (Türkiye +3 kayması önlenir)
const SIRA_ZAMAN_SELECT = `
  CONVERT(VARCHAR(5), OlusturmaZamani, 108) AS Saat,
  CONVERT(VARCHAR(19), OlusturmaZamani, 120) AS ZamanStr
`;

async function siraOfsetAl(pool, tarih) {
  const r = await pool.request()
    .input('tarih', sql.Date, tarih)
    .query(`SELECT ISNULL(SiraOfset, 0) AS Ofset FROM CKS_Sira_Gunluk WHERE SiraTarihi = @tarih`);
  return r.recordset.length ? r.recordset[0].Ofset : 0;
}

function siraSatirToJson(row) {
  return {
    id: row.Id,
    siraNo: row.SiraNo,
    tc: row.TcKimlik || '',
    adSoyad: row.AdSoyad,
    kaynak: row.Kaynak,
    personel: row.Personel || null,
    saat: row.Saat || '',
    zaman: row.ZamanStr || null
  };
}

async function siraTabloOlustur() {
  const pool = await getPool();
  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = N'CKS_Sira')
    BEGIN
      CREATE TABLE dbo.CKS_Sira (
        Id BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        SiraNo INT NOT NULL,
        SiraTarihi DATE NOT NULL,
        TcKimlik NVARCHAR(11) NULL,
        AdSoyad NVARCHAR(150) NOT NULL,
        Kaynak NVARCHAR(20) NOT NULL,
        Personel NVARCHAR(100) NULL,
        Durum NVARCHAR(20) NOT NULL CONSTRAINT DF_CKS_Sira_Durum DEFAULT N'bekliyor',
        OlusturmaZamani DATETIME2(0) NOT NULL CONSTRAINT DF_CKS_Sira_Olusturma DEFAULT SYSDATETIME(),
        TamamlanmaZamani DATETIME2(0) NULL,
        TamamlayanPersonel NVARCHAR(100) NULL
      );
      CREATE INDEX IX_CKS_Sira_Tarih_Durum ON dbo.CKS_Sira (SiraTarihi, Durum, SiraNo);
    END

    IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = N'CKS_Sira_Gunluk')
    BEGIN
      CREATE TABLE dbo.CKS_Sira_Gunluk (
        SiraTarihi DATE NOT NULL PRIMARY KEY,
        SiraOfset INT NOT NULL DEFAULT 0,
        SonSifirlama DATETIME2(0) NULL,
        SifirlayanPersonel NVARCHAR(100) NULL
      );
    END

    IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = N'CKS_Sira_TetikKart')
    BEGIN
      CREATE TABLE dbo.CKS_Sira_TetikKart (
        Id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        KartUid NVARCHAR(80) NOT NULL UNIQUE,
        Aciklama NVARCHAR(100) NULL,
        Aktif BIT NOT NULL DEFAULT 1,
        TanimlamaTarihi DATETIME2(0) NOT NULL DEFAULT SYSDATETIME()
      );
    END
  `);
}

async function siraTetikKartSayisi(pool) {
  const r = await pool.request().query(`
    SELECT COUNT(1) AS Cnt FROM CKS_Sira_TetikKart WHERE Aktif = 1
  `);
  return r.recordset[0].Cnt;
}

async function siraTetikKartUygunMu(pool, uid) {
  const cnt = await siraTetikKartSayisi(pool);
  if (cnt === 0) return true;
  const { canonical, variants } = mesaiKartUidCanonical(uid);
  for (const v of variants) {
    const r = await pool.request()
      .input('uid', sql.NVarChar(80), v)
      .query(`SELECT 1 FROM CKS_Sira_TetikKart WHERE KartUid = @uid AND Aktif = 1`);
    if (r.recordset.length) return true;
  }
  if (canonical) {
    const r2 = await pool.request()
      .input('canon', sql.NVarChar(80), canonical)
      .query(`
        SELECT 1 FROM CKS_Sira_TetikKart WHERE Aktif = 1
          AND RIGHT(REPLICATE('0', 10) + REPLACE(REPLACE(REPLACE(KartUid, ',', ''), ' ', ''), CHAR(9), ''), 10) = @canon
      `);
    if (r2.recordset.length) return true;
  }
  return false;
}

async function siraJsonDosyasindanAktar() {
  if (!fs.existsSync(siraDosya)) return;
  try {
    const state = JSON.parse(fs.readFileSync(siraDosya, 'utf8'));
    const bekleyen = Array.isArray(state.bekleyen) ? state.bekleyen : [];
    if (bekleyen.length === 0) {
      fs.renameSync(siraDosya, siraDosya + '.yedek');
      return;
    }

    const pool = await getPool();
    const tarih = state.tarih || bugunTarihStr();

    for (const k of bekleyen) {
      const ad = k.adSoyad || `Sıra ${k.siraNo}`;
      const varMi = await pool.request()
        .input('tarih', sql.Date, tarih)
        .input('siraNo', sql.Int, k.siraNo)
        .input('ad', sql.NVarChar(150), ad)
        .query(`
          SELECT 1 FROM CKS_Sira
          WHERE SiraTarihi = @tarih AND SiraNo = @siraNo AND AdSoyad = @ad AND Durum = N'bekliyor'
        `);
      if (varMi.recordset.length > 0) continue;

      await pool.request()
        .input('siraNo', sql.Int, k.siraNo)
        .input('tarih', sql.Date, tarih)
        .input('tc', sql.NVarChar(11), k.tc || null)
        .input('ad', sql.NVarChar(150), ad)
        .input('kaynak', sql.NVarChar(20), k.kaynak || 'siramatik')
        .input('personel', sql.NVarChar(100), k.personel || null)
        .input('zaman', sql.DateTime2, k.zaman ? new Date(k.zaman) : new Date())
        .query(`
          INSERT INTO CKS_Sira (SiraNo, SiraTarihi, TcKimlik, AdSoyad, Kaynak, Personel, Durum, OlusturmaZamani)
          VALUES (@siraNo, @tarih, @tc, @ad, @kaynak, @personel, N'bekliyor', @zaman)
        `);
    }

    fs.renameSync(siraDosya, siraDosya + '.yedek');
    console.log('Sıra JSON → CKS_Sira aktarıldı, yedek: sira-kuyruk.json.yedek');
  } catch (e) {
    console.error('Sıra JSON aktarım hatası:', e.message);
  }
}

let siraDbHazir = false;
async function siraDbHazirla() {
  if (siraDbHazir) return;
  await siraTabloOlustur();
  await siraJsonDosyasindanAktar();
  siraDbHazir = true;
  console.log('CKS_Sira tablosu hazır.');
}

app.get('/siramatik.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'siramatik.html'));
});

app.get('/kiosk.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'kiosk.html'));
});

async function siraKayitEkle({ tc, adSoyad, kaynak, personel }) {
  await siraDbHazirla();
  const tcStr = String(tc || '').trim();
  if (tcStr && tcStr.length !== 11) {
    return { ok: false, message: 'TC kimlik numarası 11 haneli olmalıdır.' };
  }

  const pool = await getPool();
  const tarih = bugunTarihStr();

  const ofset = await siraOfsetAl(pool, tarih);
  const maxRes = await pool.request()
    .input('tarih', sql.Date, tarih)
    .query(`SELECT ISNULL(MAX(SiraNo), 0) AS SonNo FROM CKS_Sira WHERE SiraTarihi = @tarih`);

  const yeniNoIc = maxRes.recordset[0].SonNo + 1;
  const gosterilenNo = yeniNoIc - ofset;
  const ad = String(adSoyad || '').trim() || `Sıra ${gosterilenNo}`;

  const ins = await pool.request()
    .input('siraNo', sql.Int, yeniNoIc)
    .input('ofset', sql.Int, ofset)
    .input('tarih', sql.Date, tarih)
    .input('tc', sql.NVarChar(11), tcStr || null)
    .input('ad', sql.NVarChar(150), ad)
    .input('kaynak', sql.NVarChar(20), kaynak || 'siramatik')
    .input('personel', sql.NVarChar(100), personel || null)
    .query(`
      INSERT INTO CKS_Sira (SiraNo, SiraTarihi, TcKimlik, AdSoyad, Kaynak, Personel, Durum)
      OUTPUT INSERTED.Id, INSERTED.SiraNo - @ofset AS SiraNo, INSERTED.TcKimlik, INSERTED.AdSoyad,
             INSERTED.Kaynak, INSERTED.Personel,
             CONVERT(VARCHAR(5), INSERTED.OlusturmaZamani, 108) AS Saat,
             CONVERT(VARCHAR(19), INSERTED.OlusturmaZamani, 120) AS ZamanStr
      VALUES (@siraNo, @tarih, @tc, @ad, @kaynak, @personel, N'bekliyor')
    `);

  const row = ins.recordset[0];
  return { ok: true, kayit: siraSatirToJson(row) };
}

function siraApiYanit(kayit) {
  const tarih = bugunTarihStr();
  const [y, m, d] = tarih.split('-');
  const tarihTr = `${d}.${m}.${y}`;
  return {
    success: true,
    siraNo: kayit.siraNo,
    adSoyad: kayit.adSoyad,
    saat: kayit.saat || '',
    tarih,
    tarihTr
  };
}

async function siraBekleyenListe() {
  await siraDbHazirla();
  const pool = await getPool();
  const tarih = bugunTarihStr();
  const result = await pool.request()
    .input('tarih', sql.Date, tarih)
    .query(`
      SELECT s.Id, s.SiraNo - ISNULL(g.SiraOfset, 0) AS SiraNo,
             s.TcKimlik, s.AdSoyad, s.Kaynak, s.Personel,
             CONVERT(VARCHAR(5), s.OlusturmaZamani, 108) AS Saat,
             CONVERT(VARCHAR(19), s.OlusturmaZamani, 120) AS ZamanStr
      FROM CKS_Sira s
      LEFT JOIN CKS_Sira_Gunluk g ON g.SiraTarihi = s.SiraTarihi
      WHERE s.SiraTarihi = @tarih AND s.Durum = N'bekliyor'
      ORDER BY s.SiraNo ASC
    `);
  return {
    tarih,
    liste: result.recordset.map(siraSatirToJson)
  };
}

app.post('/api/sira/al', async (req, res) => {
  try {
    const { tc, adSoyad } = req.body || {};
    const sonuc = await siraKayitEkle({ tc, adSoyad, kaynak: 'siramatik' });
    if (!sonuc.ok) return res.json({ success: false, message: sonuc.message });
    res.json(siraApiYanit(sonuc.kayit));
  } catch (err) {
    console.error('/api/sira/al hatası:', err);
    res.status(500).json({ success: false, message: 'Sıra alınamadı.' });
  }
});

/** Sıramatik: 125 kHz kart okutunca sıra ver (personel kartları hariç) */
app.post('/api/sira/kart-al', async (req, res) => {
  try {
    const { kartUid } = req.body || {};
    const { canonical } = mesaiKartUidCanonical(kartUid);
    if (!canonical) {
      return res.json({ success: false, message: 'Kart okunamadı.' });
    }

    await siraDbHazirla();
    await mesaiDbHazirla();
    const pool = await getPool();

    const personelKart = await mesaiKartPersonelBul(pool, kartUid);
    if (personelKart) {
      return res.json({
        success: false,
        message: 'Bu personel kartıdır. Sıramatik için ayrı sıra kartını kullanın.'
      });
    }

    const tetikUygun = await siraTetikKartUygunMu(pool, kartUid);
    if (!tetikUygun) {
      return res.json({
        success: false,
        message: 'Bu kart sıra almak için tanımlı değil. Yöneticiye başvurun.'
      });
    }

    const sonuc = await siraKayitEkle({ adSoyad: 'Çiftçi', kaynak: 'rfid' });
    if (!sonuc.ok) return res.json({ success: false, message: sonuc.message });
    res.json(siraApiYanit(sonuc.kayit));
  } catch (err) {
    console.error('/api/sira/kart-al hatası:', err);
    res.status(500).json({ success: false, message: 'Sıra alınamadı.' });
  }
});

/** Tek okuyucu: personel kartı → mesai, sıra kartı → sıra + fiş */
app.post('/api/kiosk/kart', async (req, res) => {
  try {
    const { kartUid } = req.body || {};
    const { canonical } = mesaiKartUidCanonical(kartUid);
    if (!canonical) {
      return res.json({ success: false, message: 'Kart okunamadı.' });
    }

    await mesaiDbHazirla();
    await siraDbHazirla();
    const pool = await getPool();

    const personelKart = await mesaiKartPersonelBul(pool, kartUid);
    if (personelKart) {
      const kullaniciId = personelKart.KullaniciId;
      const tarih = bugunTarihStr();
      const tip = await mesaiSonrakiTip(pool, kullaniciId, tarih);
      const sonuc = await mesaiKayitYap(pool, kullaniciId, tip, 'rfid', canonical);
      return res.json({ mod: 'mesai', ...sonuc });
    }

    const tetikUygun = await siraTetikKartUygunMu(pool, kartUid);
    if (!tetikUygun) {
      return res.json({
        success: false,
        message: 'Tanınmayan kart. Personel veya sıra kartınızı kullanın.'
      });
    }

    const sonuc = await siraKayitEkle({ adSoyad: 'Çiftçi', kaynak: 'rfid' });
    if (!sonuc.ok) return res.json({ success: false, message: sonuc.message });
    const yanit = siraApiYanit(sonuc.kayit);
    res.json({ mod: 'sira', ...yanit });
  } catch (err) {
    console.error('/api/kiosk/kart hatası:', err);
    res.status(500).json({ success: false, message: 'İşlem yapılamadı.' });
  }
});

app.get('/api/sira/tetik-kartlar', authenticateToken, sadeceAdmin, async (req, res) => {
  try {
    await siraDbHazirla();
    const pool = await getPool();
    const r = await pool.request().query(`
      SELECT Id, KartUid, Aciklama, Aktif, TanimlamaTarihi
      FROM CKS_Sira_TetikKart WHERE Aktif = 1 ORDER BY KartUid
    `);
    res.json({ success: true, liste: r.recordset });
  } catch (err) {
    res.status(500).json({ success: false, liste: [] });
  }
});

app.post('/api/sira/tetik-kart-tanimla', authenticateToken, sadeceAdmin, async (req, res) => {
  try {
    const { kartUid, aciklama } = req.body || {};
    const { canonical } = mesaiKartUidCanonical(kartUid);
    if (!canonical) {
      return res.json({ success: false, message: 'Kartı okutun.' });
    }
    await siraDbHazirla();
    const pool = await getPool();
    await pool.request()
      .input('uid', sql.NVarChar(80), canonical)
      .input('ac', sql.NVarChar(100), String(aciklama || 'Sıramatik').trim())
      .query(`
        MERGE CKS_Sira_TetikKart AS h
        USING (SELECT @uid AS KartUid) AS k ON h.KartUid = k.KartUid
        WHEN MATCHED THEN UPDATE SET Aktif = 1, Aciklama = @ac, TanimlamaTarihi = SYSDATETIME()
        WHEN NOT MATCHED THEN INSERT (KartUid, Aciklama) VALUES (@uid, @ac);
      `);
    res.json({ success: true, message: 'Sıramatik tetik kartı kaydedildi.', kartUid: canonical });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.delete('/api/sira/tetik-kart-sil/:id', authenticateToken, sadeceAdmin, async (req, res) => {
  try {
    await siraDbHazirla();
    const pool = await getPool();
    await pool.request()
      .input('id', sql.Int, parseInt(req.params.id, 10))
      .query(`UPDATE CKS_Sira_TetikKart SET Aktif = 0 WHERE Id = @id`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/sira/personel-al', authenticateToken, async (req, res) => {
  try {
    const { adSoyad, tc } = req.body || {};
    const ad = String(adSoyad || '').trim();
    if (!ad) {
      return res.json({ success: false, message: 'Çiftçi adı soyadı giriniz.' });
    }
    const personel = `${req.user.ad || ''} ${req.user.soyad || ''}`.trim() || req.user.kullaniciadi;
    const sonuc = await siraKayitEkle({ tc, adSoyad: ad, kaynak: 'personel', personel });
    if (!sonuc.ok) return res.json({ success: false, message: sonuc.message });
    res.json({
      success: true,
      siraNo: sonuc.kayit.siraNo,
      adSoyad: sonuc.kayit.adSoyad,
      message: `${ad} için sıra ${sonuc.kayit.siraNo} verildi.`
    });
  } catch (err) {
    console.error('/api/sira/personel-al hatası:', err);
    res.status(500).json({ success: false, message: 'Sıra alınamadı.' });
  }
});

app.post('/api/sira/sifirla', authenticateToken, async (req, res) => {
  try {
    const { sifre } = req.body || {};
    if (!sifre) {
      return res.json({ success: false, message: 'Şifrenizi girin.' });
    }

    const pool = await getPool();
    await siraDbHazirla();

    const sifreKontrol = await pool.request()
      .input('id', sql.Int, req.user.id)
      .input('sifre', sql.NVarChar(255), sifre)
      .query(`SELECT 1 AS ok FROM Kullanicilar WHERE Id = @id AND sifre = @sifre`);

    if (!sifreKontrol.recordset.length) {
      return res.json({ success: false, message: 'Hatalı şifre.' });
    }

    const tarih = bugunTarihStr();
    const personel = `${req.user.ad || ''} ${req.user.soyad || ''}`.trim() || req.user.kullaniciadi;

    const iptalRes = await pool.request()
      .input('tarih', sql.Date, tarih)
      .input('p', sql.NVarChar(100), personel)
      .query(`
        UPDATE CKS_Sira
        SET Durum = N'iptal',
            TamamlanmaZamani = SYSDATETIME(),
            TamamlayanPersonel = @p
        WHERE SiraTarihi = @tarih AND Durum = N'bekliyor'
      `);

    const iptalSayisi = iptalRes.rowsAffected[0] || 0;

    const maxRes = await pool.request()
      .input('tarih', sql.Date, tarih)
      .query(`SELECT ISNULL(MAX(SiraNo), 0) AS SonNo FROM CKS_Sira WHERE SiraTarihi = @tarih`);

    const yeniOfset = maxRes.recordset[0].SonNo;

    await pool.request()
      .input('tarih', sql.Date, tarih)
      .input('ofset', sql.Int, yeniOfset)
      .input('p', sql.NVarChar(100), personel)
      .query(`
        MERGE dbo.CKS_Sira_Gunluk AS hedef
        USING (SELECT @tarih AS SiraTarihi) AS kaynak ON hedef.SiraTarihi = kaynak.SiraTarihi
        WHEN MATCHED THEN
          UPDATE SET SiraOfset = @ofset, SonSifirlama = SYSDATETIME(), SifirlayanPersonel = @p
        WHEN NOT MATCHED THEN
          INSERT (SiraTarihi, SiraOfset, SonSifirlama, SifirlayanPersonel)
          VALUES (@tarih, @ofset, SYSDATETIME(), @p);
      `);

    res.json({
      success: true,
      message: 'Sıra 1\'den başlayacak şekilde sıfırlandı.',
      iptalEdilen: iptalSayisi
    });
  } catch (err) {
    console.error('/api/sira/sifirla hatası:', err);
    res.status(500).json({ success: false, message: 'Sıfırlama yapılamadı.' });
  }
});

app.get('/api/sira/bekleyen', authenticateToken, async (req, res) => {
  try {
    const { tarih, liste } = await siraBekleyenListe();
    res.json({ success: true, liste, tarih });
  } catch (err) {
    console.error('/api/sira/bekleyen hatası:', err);
    res.status(500).json({ success: false, liste: [] });
  }
});

app.post('/api/sira/tamamla/:id', authenticateToken, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const tamamlayan = `${req.user.ad || ''} ${req.user.soyad || ''}`.trim() || req.user.kullaniciadi;
    const pool = await getPool();
    await siraDbHazirla();

    const onKayit = await pool.request()
      .input('id', sql.BigInt, id)
      .query(`SELECT SiraTarihi FROM CKS_Sira WHERE Id = @id AND Durum = N'bekliyor'`);

    if (!onKayit.recordset.length) {
      return res.json({ success: false, message: 'Kayıt bulunamadı veya zaten alındı.' });
    }

    const st = onKayit.recordset[0].SiraTarihi;
    const tarih = st instanceof Date
      ? st.toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' })
      : String(st).slice(0, 10);
    const ofset = await siraOfsetAl(pool, tarih);

    const result = await pool.request()
      .input('id', sql.BigInt, id)
      .input('ofset', sql.Int, ofset)
      .input('tamamlayan', sql.NVarChar(100), tamamlayan)
      .query(`
        UPDATE CKS_Sira
        SET Durum = N'tamamlandi',
            TamamlanmaZamani = SYSDATETIME(),
            TamamlayanPersonel = @tamamlayan
        OUTPUT INSERTED.Id, INSERTED.SiraNo - @ofset AS SiraNo,
               INSERTED.TcKimlik, INSERTED.AdSoyad,
               INSERTED.Kaynak, INSERTED.Personel,
               CONVERT(VARCHAR(5), INSERTED.OlusturmaZamani, 108) AS Saat,
               CONVERT(VARCHAR(19), INSERTED.OlusturmaZamani, 120) AS ZamanStr
        WHERE Id = @id AND Durum = N'bekliyor'
      `);

    if (!result.recordset.length) {
      return res.json({ success: false, message: 'Kayıt bulunamadı veya zaten alındı.' });
    }

    res.json({
      success: true,
      kayit: siraSatirToJson(result.recordset[0]),
      personel: tamamlayan
    });
  } catch (err) {
    console.error('/api/sira/tamamla hatası:', err);
    res.status(500).json({ success: false, message: 'İşlem başarısız.' });
  }
});

// ========== PERSONEL MESAI GİRİŞ / ÇIKIŞ ==========
let mesaiDbHazir = false;

async function mesaiTabloOlustur() {
  const pool = await getPool();
  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = N'PersonelMesaiLog')
    BEGIN
      CREATE TABLE dbo.PersonelMesaiLog (
        Id BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        KullaniciId INT NOT NULL,
        Tarih DATE NOT NULL,
        Tip NVARCHAR(10) NOT NULL,
        Zaman DATETIME2(0) NOT NULL CONSTRAINT DF_PersonelMesai_Zaman DEFAULT SYSDATETIME(),
        Kaynak NVARCHAR(20) NOT NULL,
        KartUid NVARCHAR(80) NULL
      );
      CREATE INDEX IX_PersonelMesai_Kullanici_Tarih ON dbo.PersonelMesaiLog (KullaniciId, Tarih, Zaman DESC);
    END

    IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = N'PersonelKart')
    BEGIN
      CREATE TABLE dbo.PersonelKart (
        Id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        KullaniciId INT NOT NULL UNIQUE,
        KartUid NVARCHAR(80) NOT NULL UNIQUE,
        Aktif BIT NOT NULL DEFAULT 1,
        TanimlamaTarihi DATETIME2(0) NOT NULL DEFAULT SYSDATETIME(),
        Tanimlayan NVARCHAR(100) NULL
      );
    END

    IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = N'PersonelMesaiYoklama')
    BEGIN
      CREATE TABLE dbo.PersonelMesaiYoklama (
        Id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        KullaniciId INT NOT NULL,
        Tarih DATE NOT NULL,
        Durum NVARCHAR(30) NULL,
        IzinKaynagi NVARCHAR(40) NULL,
        Notlar NVARCHAR(500) NULL,
        GuncelleyenId INT NULL,
        GuncellemeZamani DATETIME2(0) NOT NULL CONSTRAINT DF_PersonelMesaiYoklama_Gunc DEFAULT SYSDATETIME(),
        CONSTRAINT UQ_PersonelMesaiYoklama UNIQUE (KullaniciId, Tarih)
      );
      CREATE INDEX IX_PersonelMesaiYoklama_Tarih ON dbo.PersonelMesaiYoklama (Tarih);
    END

    IF COL_LENGTH('dbo.PersonelMesaiYoklama', 'IzinTuru') IS NULL
      ALTER TABLE dbo.PersonelMesaiYoklama ADD IzinTuru NVARCHAR(20) NULL;

    IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = N'PersonelMesaiIzinPlan')
    BEGIN
      CREATE TABLE dbo.PersonelMesaiIzinPlan (
        Id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        KullaniciId INT NOT NULL,
        IzinTuru NVARCHAR(20) NOT NULL,
        IzinBaslangic DATE NOT NULL,
        IseDonus DATE NULL,
        BaslangicSaat VARCHAR(5) NULL,
        BitisSaat VARCHAR(5) NULL,
        Durum NVARCHAR(30) NULL,
        IzinKaynagi NVARCHAR(40) NULL,
        Notlar NVARCHAR(500) NULL,
        GuncelleyenId INT NULL,
        OlusturmaZamani DATETIME2(0) NOT NULL DEFAULT SYSDATETIME(),
        GuncellemeZamani DATETIME2(0) NOT NULL DEFAULT SYSDATETIME()
      );
      CREATE INDEX IX_PersonelMesaiIzinPlan_Tarih ON dbo.PersonelMesaiIzinPlan (IzinBaslangic, IseDonus);
      CREATE INDEX IX_PersonelMesaiIzinPlan_Kullanici ON dbo.PersonelMesaiIzinPlan (KullaniciId);
    END

    IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = N'PersonelIzinBakiye')
    BEGIN
      CREATE TABLE dbo.PersonelIzinBakiye (
        Id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        KullaniciId INT NOT NULL,
        Yil INT NOT NULL,
        YillikHak DECIMAL(6,1) NOT NULL CONSTRAINT DF_PersonelIzinBakiye_Hak DEFAULT 0,
        Notlar NVARCHAR(300) NULL,
        GuncelleyenId INT NULL,
        GuncellemeZamani DATETIME2(0) NOT NULL CONSTRAINT DF_PersonelIzinBakiye_Gunc DEFAULT SYSDATETIME(),
        CONSTRAINT UQ_PersonelIzinBakiye UNIQUE (KullaniciId, Yil)
      );
      CREATE INDEX IX_PersonelIzinBakiye_Yil ON dbo.PersonelIzinBakiye (Yil);
    END

    IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = N'PersonelMesaiNobet')
    BEGIN
      CREATE TABLE dbo.PersonelMesaiNobet (
        Id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        HaftaBaslangic DATE NOT NULL,
        KullaniciId INT NOT NULL,
        Notlar NVARCHAR(300) NULL,
        GuncelleyenId INT NULL,
        GuncellemeZamani DATETIME2(0) NOT NULL CONSTRAINT DF_PersonelMesaiNobet_Gunc DEFAULT SYSDATETIME(),
        CONSTRAINT UQ_PersonelMesaiNobet_Hafta UNIQUE (HaftaBaslangic)
      );
      CREATE INDEX IX_PersonelMesaiNobet_Kullanici ON dbo.PersonelMesaiNobet (KullaniciId, HaftaBaslangic);
    END
  `);
}

/** Eski günlük nöbet kayıtlarını haftalık şemaya taşır */
async function mesaiNobetTabloMigrate() {
  const pool = await getPool();
  const col = await pool.request().query(`
    SELECT COL_LENGTH('dbo.PersonelMesaiNobet', 'HaftaBaslangic') AS hb,
           COL_LENGTH('dbo.PersonelMesaiNobet', 'Tarih') AS tr`);
  if (!col.recordset.length) return;
  const { hb, tr } = col.recordset[0];
  if (!hb) {
    await pool.request().query(`ALTER TABLE dbo.PersonelMesaiNobet ADD HaftaBaslangic DATE NULL`);
  }
  if (tr) {
    const rows = await pool.request().query(`
      SELECT Id, CAST(Tarih AS DATE) AS Tarih, KullaniciId, Notlar, GuncelleyenId
      FROM dbo.PersonelMesaiNobet`);
    const byWeek = new Map();
    for (const row of rows.recordset) {
      const pzt = mesaiHaftaPazartesi(row.Tarih);
      if (!pzt) continue;
      const prev = byWeek.get(pzt);
      if (!prev || row.Id > prev.id) {
        byWeek.set(pzt, {
          kid: row.KullaniciId,
          notlar: row.Notlar,
          gid: row.GuncelleyenId
        });
      }
    }
    await pool.request().query(`DELETE FROM dbo.PersonelMesaiNobet`);
    for (const [pzt, v] of byWeek) {
      await pool.request()
        .input('hb', sql.Date, pzt)
        .input('kid', sql.Int, v.kid)
        .input('notlar', sql.NVarChar(300), v.notlar)
        .input('gid', sql.Int, v.gid)
        .query(`
          INSERT INTO dbo.PersonelMesaiNobet (HaftaBaslangic, KullaniciId, Notlar, GuncelleyenId)
          VALUES (@hb, @kid, @notlar, @gid)`);
    }
    await pool.request().query(`
      IF EXISTS (SELECT 1 FROM sys.key_constraints WHERE name = N'UQ_PersonelMesaiNobet_Tarih')
        ALTER TABLE dbo.PersonelMesaiNobet DROP CONSTRAINT UQ_PersonelMesaiNobet_Tarih;
      IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_PersonelMesaiNobet_Kullanici' AND object_id = OBJECT_ID(N'dbo.PersonelMesaiNobet'))
        DROP INDEX IX_PersonelMesaiNobet_Kullanici ON dbo.PersonelMesaiNobet;
      IF COL_LENGTH('dbo.PersonelMesaiNobet', 'Tarih') IS NOT NULL
        ALTER TABLE dbo.PersonelMesaiNobet DROP COLUMN Tarih;
    `);
  }
  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM sys.key_constraints WHERE name = N'UQ_PersonelMesaiNobet_Hafta')
     AND COL_LENGTH('dbo.PersonelMesaiNobet', 'HaftaBaslangic') IS NOT NULL
      ALTER TABLE dbo.PersonelMesaiNobet ADD CONSTRAINT UQ_PersonelMesaiNobet_Hafta UNIQUE (HaftaBaslangic);
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_PersonelMesaiNobet_Kullanici' AND object_id = OBJECT_ID(N'dbo.PersonelMesaiNobet'))
      CREATE INDEX IX_PersonelMesaiNobet_Kullanici ON dbo.PersonelMesaiNobet (KullaniciId, HaftaBaslangic);
  `);
}

/** PersonelIzinBakiye — yıllık gün + ayrı saatlik izin hakkı (saat) */
async function mesaiIzinBakiyeSemasiGuncelle() {
  const pool = await getPool();
  await pool.request().query(`
    IF COL_LENGTH('dbo.PersonelIzinBakiye', 'SaatlikIzinBakiyedenDus') IS NULL
      ALTER TABLE dbo.PersonelIzinBakiye ADD SaatlikIzinBakiyedenDus BIT NOT NULL
        CONSTRAINT DF_PersonelIzinBakiye_SaatlikDus DEFAULT 0;
    IF COL_LENGTH('dbo.PersonelIzinBakiye', 'SaatlikIzinHak') IS NULL
      ALTER TABLE dbo.PersonelIzinBakiye ADD SaatlikIzinHak DECIMAL(7,2) NOT NULL
        CONSTRAINT DF_PersonelIzinBakiye_SaatlikHak DEFAULT 0;
  `);
}

async function mesaiIzinProfilSemasiGuncelle() {
  const pool = await getPool();
  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = N'PersonelIzinProfil')
    BEGIN
      CREATE TABLE dbo.PersonelIzinProfil (
        KullaniciId INT NOT NULL PRIMARY KEY,
        IlkIseGiris DATE NULL,
        GuncelleyenId INT NULL,
        GuncellemeZamani DATETIME2(0) NOT NULL CONSTRAINT DF_PersonelIzinProfil_Gunc DEFAULT SYSDATETIME()
      );
    END
  `);
  /* Kolon eklemeleri ayrı sorguda — aynı batch'te CREATE sonrası COL_LENGTH görünmez, Telefon iki kez eklenirdi */
  await pool.request().query(`
    IF COL_LENGTH('dbo.PersonelIzinProfil', 'Unvan') IS NULL
      ALTER TABLE dbo.PersonelIzinProfil ADD Unvan NVARCHAR(80) NULL;
  `);
  await pool.request().query(`
    IF COL_LENGTH('dbo.PersonelIzinProfil', 'Telefon') IS NULL
      ALTER TABLE dbo.PersonelIzinProfil ADD Telefon NVARCHAR(30) NULL;
  `);
  await pool.request().query(`
    IF COL_LENGTH('dbo.PersonelIzinProfil', 'IzinAdres') IS NULL
      ALTER TABLE dbo.PersonelIzinProfil ADD IzinAdres NVARCHAR(300) NULL;
  `);
}

async function mesaiIzinHareketSemasiGuncelle() {
  const pool = await getPool();
  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = N'PersonelIzinHareket')
    BEGIN
      CREATE TABLE dbo.PersonelIzinHareket (
        Id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        KullaniciId INT NOT NULL,
        Yil INT NOT NULL,
        HareketTarihi DATE NOT NULL,
        Tur NVARCHAR(30) NOT NULL,
        GunSayisi DECIMAL(6,1) NOT NULL,
        Aciklama NVARCHAR(300) NULL,
        GuncelleyenId INT NULL,
        OlusturmaZamani DATETIME2(0) NOT NULL CONSTRAINT DF_PersonelIzinHareket_Olus DEFAULT SYSDATETIME(),
        CONSTRAINT UQ_PersonelIzinHareket UNIQUE (KullaniciId, Yil, Tur)
      );
      CREATE INDEX IX_PersonelIzinHareket_Kullanici ON dbo.PersonelIzinHareket (KullaniciId, Yil, HareketTarihi DESC);
    END
    IF COL_LENGTH('dbo.PersonelIzinHareket', 'SaatSayisi') IS NULL
      ALTER TABLE dbo.PersonelIzinHareket ADD SaatSayisi DECIMAL(7,2) NULL;
  `);
}

async function mesaiDbHazirla() {
  if (mesaiDbHazir) return;
  await mesaiTabloOlustur();
  await mesaiNobetTabloMigrate();
  await mesaiIzinBakiyeSemasiGuncelle();
  await mesaiIzinProfilSemasiGuncelle();
  await mesaiIzinHareketSemasiGuncelle();
  mesaiDbHazir = true;
  console.log('Personel mesai tabloları hazır.');
}

function mesaiKartUidNorm(uid) {
  return String(uid || '').trim().toUpperCase().replace(/\s+/g, '');
}

/** 125 kHz proximity kart — okuyucu/kart üzerindeki 10 haneli numaraya normalize */
function mesaiKartUidCanonical(uid) {
  const raw = mesaiKartUidNorm(uid);
  const digits = raw.replace(/\D/g, '');
  if (!digits) return { raw, canonical: '', variants: [] };
  const canonical = digits.length <= 10 ? digits.padStart(10, '0') : digits;
  const noLeading = digits.replace(/^0+/, '') || '0';
  const variants = [...new Set([raw, canonical, digits, noLeading, digits.padStart(10, '0')])];
  return { raw, canonical, variants };
}

async function mesaiKartPersonelBul(pool, uid) {
  const { canonical, variants } = mesaiKartUidCanonical(uid);
  if (!canonical && !variants.length) return null;

  for (const v of variants) {
    const r = await pool.request()
      .input('uid', sql.NVarChar(80), v)
      .query(`
        SELECT k.KullaniciId, k.KartUid, k.Id AS KartId,
               ISNULL(u.Ad,'') AS Ad, ISNULL(u.Soyad,'') AS Soyad, u.KullaniciAdi
        FROM PersonelKart k
        INNER JOIN Kullanicilar u ON u.Id = k.KullaniciId
        WHERE k.KartUid = @uid AND k.Aktif = 1
      `);
    if (r.recordset.length) return r.recordset[0];
  }

  const r2 = await pool.request()
    .input('canon', sql.NVarChar(80), canonical)
    .query(`
      SELECT k.KullaniciId, k.KartUid, k.Id AS KartId,
             ISNULL(u.Ad,'') AS Ad, ISNULL(u.Soyad,'') AS Soyad, u.KullaniciAdi
      FROM PersonelKart k
      INNER JOIN Kullanicilar u ON u.Id = k.KullaniciId
      WHERE k.Aktif = 1
        AND RIGHT(REPLICATE('0', 10) + REPLACE(REPLACE(REPLACE(k.KartUid, ',', ''), ' ', ''), CHAR(9), ''), 10)
            = @canon
    `);
  return r2.recordset.length ? r2.recordset[0] : null;
}

/** Bugün yarım gün planı varsa BitisSaat; yoksa null */
async function mesaiYarimGunBitisBugun(pool, kullaniciId, tarih) {
  const r = await pool.request()
    .input('kid', sql.Int, kullaniciId)
    .input('tarih', sql.Date, tarih)
    .query(`
      SELECT TOP 1 BaslangicSaat, BitisSaat
      FROM dbo.PersonelMesaiIzinPlan
      WHERE KullaniciId = @kid AND IzinBaslangic = @tarih AND IzinTuru = N'yarim_gun'
      ORDER BY Id DESC
    `);
  if (!r.recordset.length) return null;
  const bitis = r.recordset[0].BitisSaat;
  if (!bitis) return null;
  const b = mesaiSaatNorm(bitis) || String(bitis).trim().slice(0, 5);
  return b ? { baslangic: r.recordset[0].BaslangicSaat, bitis: b } : null;
}

async function mesaiSonrakiTip(pool, kullaniciId, tarih) {
  const yb = await mesaiYarimGunBitisBugun(pool, kullaniciId, tarih);
  if (yb && yb.bitis) {
    const r = await pool.request()
      .input('kid', sql.Int, kullaniciId)
      .input('tarih', sql.Date, tarih)
      .input('bitis', sql.VarChar(5), yb.bitis)
      .query(`
        SELECT TOP 1 Tip FROM dbo.PersonelMesaiLog
        WHERE KullaniciId = @kid AND Tarih = @tarih
          AND CAST(Zaman AS TIME) >= CAST(@bitis AS TIME)
        ORDER BY Zaman DESC
      `);
    if (!r.recordset.length) return 'giris';
    return r.recordset[0].Tip === 'cikis' ? 'giris' : 'cikis';
  }
  const r2 = await pool.request()
    .input('kid', sql.Int, kullaniciId)
    .input('tarih', sql.Date, tarih)
    .query(`
      SELECT TOP 1 Tip FROM dbo.PersonelMesaiLog
      WHERE KullaniciId = @kid AND Tarih = @tarih
      ORDER BY Zaman DESC
    `);
  if (!r2.recordset.length || r2.recordset[0].Tip === 'cikis') return 'giris';
  return 'cikis';
}

async function mesaiKayitYap(pool, kullaniciId, tip, kaynak, kartUid) {
  const tarih = bugunTarihStr();
  const ins = await pool.request()
    .input('kid', sql.Int, kullaniciId)
    .input('tarih', sql.Date, tarih)
    .input('tip', sql.NVarChar(10), tip)
    .input('kaynak', sql.NVarChar(20), kaynak)
    .input('kart', sql.NVarChar(80), kartUid || null)
    .query(`
      INSERT INTO PersonelMesaiLog (KullaniciId, Tarih, Tip, Kaynak, KartUid)
      OUTPUT INSERTED.Tip,
             CONVERT(VARCHAR(5), INSERTED.Zaman, 108) AS Saat
      VALUES (@kid, @tarih, @tip, @kaynak, @kart)
    `);

  const u = await pool.request()
    .input('id', sql.Int, kullaniciId)
    .query(`SELECT ISNULL(Ad,'') AS Ad, ISNULL(Soyad,'') AS Soyad, KullaniciAdi FROM Kullanicilar WHERE Id = @id`);

  const p = u.recordset[0];
  const adSoyad = `${p.Ad} ${p.Soyad}`.trim() || p.KullaniciAdi;

  return {
    success: true,
    tip: ins.recordset[0].Tip,
    saat: ins.recordset[0].Saat,
    adSoyad
  };
}

async function mesaiKullaniciIdBul(pool, kullanici, sifre) {
  const giris = String(kullanici || '').trim();
  const r = await pool.request()
    .input('giris', sql.NVarChar, giris)
    .input('sifre', sql.NVarChar(255), sifre)
    .query(`
      SELECT Id FROM Kullanicilar
      WHERE (KullaniciAdi = @giris OR Email = @giris) AND sifre = @sifre
    `);
  return r.recordset.length ? r.recordset[0].Id : null;
}

/** Oturum açmış kullanıcının şifresini doğrular (hassas işlem onayı). */
async function mesaiKullaniciSifreDogrula(userId, sifre) {
  const s = String(sifre ?? '').trim();
  if (!userId || !s) return false;
  const pool = await getPool();
  const r = await pool.request()
    .input('id', sql.Int, userId)
    .input('sifre', sql.NVarChar(255), s)
    .query(`SELECT 1 AS ok FROM Kullanicilar WHERE Id = @id AND sifre = @sifre`);
  return r.recordset.length > 0;
}

app.get('/mesai.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'mesai.html'));
});

app.post('/api/mesai/kart', async (req, res) => {
  try {
    const { canonical } = mesaiKartUidCanonical(req.body?.kartUid);
    if (!canonical) {
      return res.json({ success: false, message: 'Kart okunamadı.' });
    }

    await mesaiDbHazirla();
    const pool = await getPool();

    const kart = await mesaiKartPersonelBul(pool, req.body?.kartUid);

    if (!kart) {
      return res.json({ success: false, message: 'Bu kart tanımlı değil. Yöneticiye başvurun.' });
    }

    const kullaniciId = kart.KullaniciId;
    const tarih = bugunTarihStr();
    const tip = await mesaiSonrakiTip(pool, kullaniciId, tarih);
    const sonuc = await mesaiKayitYap(pool, kullaniciId, tip, 'rfid', canonical);
    res.json(sonuc);
  } catch (err) {
    console.error('/api/mesai/kart hatası:', err);
    res.status(500).json({ success: false, message: 'Kayıt yapılamadı.' });
  }
});

app.post('/api/mesai/kayit', async (req, res) => {
  try {
    const { kullaniciadi, email, sifre, tip } = req.body || {};
    const giris = String(kullaniciadi || email || '').trim();
    const tipHam = String(tip || '').toLowerCase().trim();

    if (!giris || !sifre) {
      return res.json({ success: false, message: 'Kullanıcı adı ve şifre girin.' });
    }

    await mesaiDbHazirla();
    const pool = await getPool();
    const kullaniciId = await mesaiKullaniciIdBul(pool, giris, sifre);

    if (!kullaniciId) {
      return res.json({ success: false, message: 'Kullanıcı veya şifre hatalı.' });
    }

    let tipStr;
    if (tipHam === 'giris' || tipHam === 'cikis') {
      tipStr = tipHam;
    } else {
      const tarih = bugunTarihStr();
      tipStr = await mesaiSonrakiTip(pool, kullaniciId, tarih);
    }

    const sonuc = await mesaiKayitYap(pool, kullaniciId, tipStr, 'manuel', null);
    res.json(sonuc);
  } catch (err) {
    console.error('/api/mesai/kayit hatası:', err);
    res.status(500).json({ success: false, message: 'Kayıt yapılamadı.' });
  }
});

/** Oturum açmış kullanıcının bugünkü mesai durumu (selektör mobil) */
app.get('/api/mesai/durum', authenticateToken, async (req, res) => {
  try {
    await mesaiDbHazirla();
    const pool = await getPool();
    const kullaniciId = req.user.id;
    const tarih = bugunTarihStr();
    const sonrakiTip = await mesaiSonrakiTip(pool, kullaniciId, tarih);

    const logs = await pool.request()
      .input('kid', sql.Int, kullaniciId)
      .input('tarih', sql.Date, tarih)
      .query(`
        SELECT Tip, CONVERT(VARCHAR(5), Zaman, 108) AS Saat
        FROM dbo.PersonelMesaiLog
        WHERE KullaniciId = @kid AND Tarih = @tarih
        ORDER BY Zaman ASC
      `);

    const u = await pool.request()
      .input('id', sql.Int, kullaniciId)
      .query(`SELECT ISNULL(Ad,'') AS Ad, ISNULL(Soyad,'') AS Soyad, KullaniciAdi FROM Kullanicilar WHERE Id = @id`);
    const p = u.recordset[0] || {};
    const adSoyad = `${p.Ad || ''} ${p.Soyad || ''}`.trim() || p.KullaniciAdi || '';

    let girisSaat = null;
    let cikisSaat = null;
    for (const row of logs.recordset) {
      if (row.Tip === 'giris') girisSaat = row.Saat;
      if (row.Tip === 'cikis') cikisSaat = row.Saat;
    }
    const son = logs.recordset.length ? logs.recordset[logs.recordset.length - 1] : null;

    res.json({
      success: true,
      adSoyad,
      sonrakiTip,
      sonTip: son ? son.Tip : null,
      sonSaat: son ? son.Saat : null,
      girisSaat,
      cikisSaat
    });
  } catch (err) {
    console.error('/api/mesai/durum hatası:', err);
    res.status(500).json({ success: false, message: 'Durum alınamadı.' });
  }
});

/** Oturum açmış kullanıcı — açık giriş veya çıkış (selektör mobil) */
app.post('/api/mesai/isle', authenticateToken, async (req, res) => {
  try {
    const tipHam = String(req.body?.tip || '').toLowerCase().trim();
    if (tipHam !== 'giris' && tipHam !== 'cikis') {
      return res.json({ success: false, message: 'Geçersiz işlem.' });
    }

    await mesaiDbHazirla();
    const pool = await getPool();
    const kullaniciId = req.user.id;
    const tarih = bugunTarihStr();
    const beklenen = await mesaiSonrakiTip(pool, kullaniciId, tarih);

    if (tipHam !== beklenen) {
      return res.json({
        success: false,
        message: beklenen === 'giris' ? 'Şu an giriş yapabilirsiniz.' : 'Şu an çıkış yapabilirsiniz.'
      });
    }

    const sonuc = await mesaiKayitYap(pool, kullaniciId, tipHam, 'selektor_mobil', null);
    res.json(sonuc);
  } catch (err) {
    console.error('/api/mesai/isle hatası:', err);
    res.status(500).json({ success: false, message: 'Kayıt yapılamadı.' });
  }
});

app.post('/api/mesai/kart-tanimla', authenticateToken, sadeceAdmin, async (req, res) => {
  try {
    const { kullaniciId, kartUid } = req.body || {};
    const { canonical, raw } = mesaiKartUidCanonical(kartUid);
    const kid = parseInt(kullaniciId, 10);

    if (!canonical || !kid) {
      return res.json({ success: false, message: 'Personel seçin ve kartı okutun.' });
    }

    await mesaiDbHazirla();
    const pool = await getPool();
    const tanimlayan = `${req.user.ad || ''} ${req.user.soyad || ''}`.trim() || req.user.kullaniciadi;

    const baska = await mesaiKartPersonelBul(pool, kartUid);
    if (baska && baska.KullaniciId !== kid) {
      const ad = `${baska.Ad} ${baska.Soyad}`.trim() || baska.KullaniciAdi;
      return res.json({ success: false, message: `Bu kart zaten tanımlı: ${ad}` });
    }

    await pool.request()
      .input('kid', sql.Int, kid)
      .input('uid', sql.NVarChar(80), canonical)
      .input('t', sql.NVarChar(100), tanimlayan)
      .query(`
        MERGE PersonelKart AS hedef
        USING (SELECT @kid AS KullaniciId) AS kaynak ON hedef.KullaniciId = kaynak.KullaniciId
        WHEN MATCHED THEN
          UPDATE SET KartUid = @uid, Aktif = 1, TanimlamaTarihi = SYSDATETIME(), Tanimlayan = @t
        WHEN NOT MATCHED THEN
          INSERT (KullaniciId, KartUid, Tanimlayan) VALUES (@kid, @uid, @t);
      `);

    res.json({
      success: true,
      message: 'Kart personelle eşleştirildi.',
      kartUid: canonical,
      hamOkuma: raw
    });
  } catch (err) {
    if (String(err.message).includes('UNIQUE') || String(err.message).includes('duplicate')) {
      return res.json({ success: false, message: 'Bu kart başka personele tanımlı.' });
    }
    console.error('/api/mesai/kart-tanimla hatası:', err);
    res.status(500).json({ success: false, message: 'Kart tanımlanamadı.' });
  }
});

app.delete('/api/mesai/kart-sil/:kartId', authenticateToken, sadeceAdmin, async (req, res) => {
  try {
    const kartId = parseInt(req.params.kartId, 10);
    await mesaiDbHazirla();
    const pool = await getPool();
    await pool.request()
      .input('id', sql.Int, kartId)
      .query(`UPDATE PersonelKart SET Aktif = 0 WHERE Id = @id`);
    res.json({ success: true, message: 'Kart eşleşmesi kaldırıldı.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get('/api/mesai/personel-liste', authenticateToken, sadeceAdmin, async (req, res) => {
  try {
    await mesaiDbHazirla();
    const pool = await getPool();
    const r = await pool.request().query(`
      SELECT u.Id, u.KullaniciAdi, ISNULL(u.Ad,'') AS Ad, ISNULL(u.Soyad,'') AS Soyad,
             k.Id AS KartId, k.KartUid, k.TanimlamaTarihi
      FROM Kullanicilar u
      LEFT JOIN PersonelKart k ON k.KullaniciId = u.Id AND k.Aktif = 1
      ORDER BY u.Ad, u.Soyad, u.KullaniciAdi
    `);
    res.json({ success: true, liste: r.recordset });
  } catch (err) {
    res.status(500).json({ success: false, liste: [] });
  }
});

app.post('/api/mesai/kart-test', authenticateToken, sadeceAdmin, async (req, res) => {
  const { canonical, raw, variants } = mesaiKartUidCanonical(req.body?.kartUid);
  res.json({ success: true, ham: raw, canonical, variants });
});

app.get('/api/mesai/kartlar', authenticateToken, sadeceAdmin, async (req, res) => {
  try {
    await mesaiDbHazirla();
    const pool = await getPool();
    const r = await pool.request().query(`
      SELECT k.Id, k.KullaniciId, k.KartUid, k.Aktif, k.TanimlamaTarihi,
             u.KullaniciAdi, ISNULL(u.Ad,'') AS Ad, ISNULL(u.Soyad,'') AS Soyad
      FROM PersonelKart k
      INNER JOIN Kullanicilar u ON u.Id = k.KullaniciId
      ORDER BY u.Ad, u.Soyad
    `);
    res.json({ success: true, liste: r.recordset });
  } catch (err) {
    res.status(500).json({ success: false, liste: [] });
  }
});

// ========== PERSONEL MESAI — WHATSAPP (10:00 günlük özet) ==========

function mesaiTrTarihEtiket(tarihStr) {
  const gunler = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
  const [y, m, g] = tarihStr.split('-');
  const d = new Date(`${tarihStr}T12:00:00`);
  return `${g}.${m}.${y} (${gunler[d.getDay()]})`;
}

function mesaiAdNorm(ad) {
  return String(ad || '')
    .trim()
    .toLocaleLowerCase('tr-TR')
    .replace(/\s+/g, ' ');
}

/** .env MESAI_WA_HARIC=Engin Çelik — yalnızca başkan mesai takibinde yok */
function mesaiHaricAdlar() {
  const ham = String(process.env.MESAI_WA_HARIC || 'Engin Çelik').trim();
  return ham
    .split(/[,;|]+/)
    .map((s) => mesaiAdNorm(s))
    .filter(Boolean);
}

function mesaiHaricMi(adSoyad) {
  const n = mesaiAdNorm(adSoyad);
  if (!n) return false;
  return mesaiHaricAdlar().some((h) => n === h);
}

function mesaiPersonelFiltre(liste) {
  return (liste || []).filter((p) => !mesaiHaricMi(p.adSoyad));
}

/** Mesai takip / personel kartının başladığı tarih (öncesi listelenmez) */
const MESAI_SISTEM_BASLANGIC = process.env.MESAI_SISTEM_BASLANGIC || '2026-05-18';

function mesaiSistemBaslangicIso() {
  return mesaiTarihYilAyGun(MESAI_SISTEM_BASLANGIC) || '2026-05-18';
}

/** Liste / istatistikte sayılan ilk gün (sistem başlangıç günü hariç) */
function mesaiSistemDahilBaslangicIso() {
  return mesaiTarihEkle(mesaiSistemBaslangicIso(), 1);
}

/** Seçilen yıl için listelenecek tarih aralığı (sistem öncesi yıl → null) */
function mesaiSistemYilAraligi(yil) {
  const y = Number(yil) || new Date().getFullYear();
  const sistBas = mesaiSistemBaslangicIso();
  const basDahil = mesaiSistemDahilBaslangicIso();
  const sistYil = parseInt(sistBas.slice(0, 4), 10);
  if (y < sistYil) return null;
  let bas = `${y}-01-01`;
  if (y === sistYil) bas = basDahil;
  const bit = `${y}-12-31`;
  const bugun = bugunTarihStr();
  const buYil = new Date().getFullYear();
  let bitGoster = y < buYil ? bit : (y > buYil ? bas : (bit < bugun ? bit : bugun));
  if (bitGoster < bas) bitGoster = bas;
  return { bas, bit, bitGoster, sistBas, basDahil };
}

/** Sabit resmi tatiller (ay-gün). Dini bayramlar: .env MESAI_WA_TATILLER=2026-04-10:Ramazan */
const MESAI_TATIL_SABIT = {
  '01-01': 'Yılbaşı',
  '04-23': 'Ulusal Egemenlik ve Çocuk Bayramı',
  '05-01': 'Emek ve Dayanışma Günü',
  '05-19': 'Atatürk\'ü Anma, Gençlik ve Spor Bayramı',
  '07-15': 'Demokrasi ve Millî Birlik Günü',
  '08-30': 'Zafer Bayramı',
  '10-29': 'Cumhuriyet Bayramı'
};

function mesaiResmiTatilBilgi(tarihStr) {
  const iso = mesaiTarihYilAyGun(tarihStr);
  if (!iso) return { tatil: false, ad: null };
  const ozelHam = String(process.env.MESAI_WA_TATILLER || '').trim();
  for (const parca of ozelHam.split(/[,;]+/)) {
    const p = parca.trim();
    if (!p) continue;
    const [tarih, ad] = p.split(':');
    if (tarih && mesaiTarihYilAyGun(tarih.trim()) === iso) {
      return { tatil: true, ad: (ad || 'Resmi tatil').trim(), ozel: true };
    }
  }
  const md = iso.slice(5);
  if (MESAI_TATIL_SABIT[md]) {
    return { tatil: true, ad: MESAI_TATIL_SABIT[md], ozel: false };
  }
  return { tatil: false, ad: null };
}

function mesaiHaftaSonuMu(tarihStr) {
  const iso = mesaiTarihYilAyGun(tarihStr);
  if (!iso) return false;
  const d = new Date(`${iso}T12:00:00`);
  const gun = d.getDay();
  return gun === 0 || gun === 6;
}

/** Yıldaki resmi tatil + .env bayram günleri (bilgi amaçlı liste) */
function mesaiYilTatilTakvimi(yil, minTarih) {
  const y = Number(yil) || new Date().getFullYear();
  const min = mesaiTarihYilAyGun(minTarih) || '';
  const liste = [];
  for (const [md, ad] of Object.entries(MESAI_TATIL_SABIT)) {
    const tarih = `${y}-${md}`;
    if (!min || tarih >= min) liste.push({ tarih, ad, sabit: true });
  }
  const ozelHam = String(process.env.MESAI_WA_TATILLER || '').trim();
  for (const parca of ozelHam.split(/[,;]+/)) {
    const p = parca.trim();
    if (!p) continue;
    const [tarih, ad] = p.split(':');
    const iso = mesaiTarihYilAyGun((tarih || '').trim());
    if (iso && iso.slice(0, 4) === String(y) && (!min || iso >= min)) {
      liste.push({ tarih: iso, ad: (ad || 'Bayram').trim(), sabit: false });
    }
  }
  return liste.sort((a, b) => a.tarih.localeCompare(b.tarih));
}

function mesaiPersonelGunKayitliMi(g) {
  return !!(g.tamGun || g.yarim || g.giris || g.cikis);
}

function mesaiPersonelGunSatirOlustur(g) {
  if (g.resmiTatil) {
    return {
      tarih: g.tarih,
      tarihTr: mesaiTarihKisaTr(g.tarih),
      satir: 'Resmi tatil — ' + g.resmiTatil,
      tip: 'tatil',
      tamGunIzin: false,
      yarimGunIzin: false,
      giris: null,
      cikis: null
    };
  }
  if (g.haftaSonu && !mesaiPersonelGunKayitliMi(g)) {
    return {
      tarih: g.tarih,
      tarihTr: mesaiTarihKisaTr(g.tarih),
      satir: 'Hafta sonu',
      tip: 'haftasonu',
      tamGunIzin: false,
      yarimGunIzin: false,
      giris: null,
      cikis: null
    };
  }
  if (g.bosIsGunu && !mesaiPersonelGunKayitliMi(g)) {
    return {
      tarih: g.tarih,
      tarihTr: mesaiTarihKisaTr(g.tarih),
      satir: 'İş günü — mesai kaydı yok',
      tip: 'bos',
      tamGunIzin: false,
      yarimGunIzin: false,
      giris: null,
      cikis: null
    };
  }
  const parcalar = [];
  if (g.tamGun) {
    const etik = g.izinTuru === 'uzun_sureli' ? 'Tam gün izin (uzun süreli)' : 'Tam gün izin';
    parcalar.push(etik);
  }
  if (g.yarim) {
    const saat = g.yarimBas && g.yarimBit ? `${g.yarimBas}–${g.yarimBit}` : '';
    parcalar.push('Yarım gün izin' + (saat ? ' ' + saat : ''));
  }
  if (!g.tamGun && (g.giris || g.cikis)) {
    parcalar.push('Giriş ' + (g.giris || '—') + ' — Çıkış ' + (g.cikis || '—'));
  }
  const tatilEk = g.resmiTatil && mesaiPersonelGunKayitliMi(g)
    ? 'Resmi tatil — ' + g.resmiTatil
    : '';
  if (tatilEk) parcalar.unshift(tatilEk);
  let tip = 'mesai';
  if (g.tamGun) tip = 'izin';
  else if (g.yarim) tip = 'yarim';
  return {
    tarih: g.tarih,
    tarihTr: mesaiTarihKisaTr(g.tarih),
    satir: parcalar.join(' · ') || '—',
    tip,
    tamGunIzin: !!g.tamGun,
    yarimGunIzin: !!g.yarim,
    giris: g.giris,
    cikis: g.cikis
  };
}

function mesaiTatilRaporMetni(tarihStr, tatilAdi) {
  const etiket = mesaiTrTarihEtiket(tarihStr);
  const saat = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' });
  return [
    '🇹🇷 *Resmi tatil bildirimi*',
    `📅 ${etiket}`,
    `🕐 ${saat}`,
    '',
    `Bugün *${tatilAdi}* nedeniyle resmi tatildir.`,
    'Personel giriş/çıkış mesai özeti *oluşturulmamıştır*.',
    '',
    '_Sarayönü Ziraat Odası_'
  ].join('\n');
}

/**
 * Mesai takip listesi (kart şartı yok).
 * @param {{ adminDahil?: boolean, whatsappHaric?: boolean }} opts
 *   adminDahil: genel sekreter vb. admin rolü yoklamada görünsün
 *   whatsappHaric: .env MESAI_WA_HARIC (Engin Çelik / başkan) listeden çıkar
 */
async function mesaiTakipPersonelAl(opts = {}) {
  const adminDahil = !!opts.adminDahil;
  const whatsappHaric = opts.whatsappHaric !== false;
  await mesaiDbHazirla();
  const pool = await getPool();
  const adminFiltre = adminDahil
    ? ''
    : ` AND ISNULL(LOWER(LTRIM(u.rol)), 'user') <> 'admin'`;
  const r = await pool.request().query(`
    SELECT u.Id,
           LTRIM(RTRIM(ISNULL(u.Ad,'') + ' ' + ISNULL(u.Soyad,''))) AS AdSoyad,
           u.KullaniciAdi,
           ISNULL(LOWER(LTRIM(u.rol)), 'user') AS Rol
    FROM Kullanicilar u
    WHERE (
      LTRIM(RTRIM(ISNULL(u.Ad,'') + ' ' + ISNULL(u.Soyad,''))) <> ''
      OR LTRIM(RTRIM(ISNULL(u.KullaniciAdi,''))) <> ''
    )
      ${adminFiltre}
    ORDER BY u.Ad, u.Soyad, u.KullaniciAdi
  `);
  let liste = r.recordset.map((row) => ({
    id: row.Id,
    adSoyad: (row.AdSoyad || '').trim() || row.KullaniciAdi,
    rol: row.Rol
  }));
  if (whatsappHaric) liste = mesaiPersonelFiltre(liste);
  return liste;
}

async function mesaiGunSonDurumAl(tarih) {
  await mesaiDbHazirla();
  const pool = await getPool();
  const r = await pool.request()
    .input('tarih', sql.Date, tarih)
    .query(`
      WITH Son AS (
        SELECT m.KullaniciId, m.Tip, m.Zaman,
          ROW_NUMBER() OVER (PARTITION BY m.KullaniciId ORDER BY m.Zaman DESC) AS rn
        FROM PersonelMesaiLog m
        WHERE m.Tarih = @tarih
      )
      SELECT u.Id,
             LTRIM(RTRIM(ISNULL(u.Ad,'') + ' ' + ISNULL(u.Soyad,''))) AS AdSoyad,
             u.KullaniciAdi,
             s.Tip,
             CONVERT(VARCHAR(5), s.Zaman, 108) AS Saat
      FROM Son s
      INNER JOIN Kullanicilar u ON u.Id = s.KullaniciId
      WHERE s.rn = 1
      ORDER BY s.Zaman
    `);

  const cikanlar = [];
  const icteKalanlar = [];
  for (const row of r.recordset) {
    const p = {
      adSoyad: (row.AdSoyad || '').trim() || row.KullaniciAdi,
      saat: row.Saat
    };
    if (mesaiHaricMi(p.adSoyad)) continue;
    if (row.Tip === 'cikis') cikanlar.push(p);
    else icteKalanlar.push(p);
  }
  const veriGirmeyenler = await mesaiHicVeriGirmeyenAl(tarih);
  return { cikanlar, icteKalanlar, veriGirmeyenler };
}

async function mesaiHicVeriGirmeyenAl(tarih) {
  const tumu = await mesaiTakipPersonelAl();
  const pool = await getPool();
  const r = await pool.request()
    .input('tarih', sql.Date, tarih)
    .query(`SELECT DISTINCT KullaniciId FROM PersonelMesaiLog WHERE Tarih = @tarih`);
  const kayitli = new Set(r.recordset.map((x) => x.KullaniciId));
  return tumu.filter((p) => !kayitli.has(p.id)).map((p) => ({ id: p.id, adSoyad: p.adSoyad }));
}

async function mesaiGunlukOzetAl(tarih) {
  await mesaiDbHazirla();
  const pool = await getPool();

  const girenler = await pool.request()
    .input('tarih', sql.Date, tarih)
    .query(`
      SELECT u.Id,
             LTRIM(RTRIM(ISNULL(u.Ad,'') + ' ' + ISNULL(u.Soyad,''))) AS AdSoyad,
             u.KullaniciAdi,
             CONVERT(VARCHAR(5), MIN(m.Zaman), 108) AS GirisSaati,
             MAX(m.Kaynak) AS Kaynak
      FROM PersonelMesaiLog m
      INNER JOIN Kullanicilar u ON u.Id = m.KullaniciId
      WHERE m.Tarih = @tarih AND m.Tip = N'giris'
      GROUP BY u.Id, u.Ad, u.Soyad, u.KullaniciAdi
      ORDER BY MIN(m.Zaman)
    `);

  const girenIdSet = new Set(girenler.recordset.map((r) => r.Id));
  const tumPersonel = await mesaiTakipPersonelAl();
  const gelmeyenlerListe = tumPersonel
    .filter((p) => !girenIdSet.has(p.id))
    .map((p) => ({ id: p.id, adSoyad: p.adSoyad }));

  const girenlerListe = mesaiPersonelFiltre(girenler.recordset.map((r) => ({
    adSoyad: (r.AdSoyad || '').trim() || r.KullaniciAdi,
    saat: r.GirisSaati,
    kaynak: r.Kaynak
  })));
  const veriGirmeyenler = await mesaiHicVeriGirmeyenAl(tarih);

  return {
    girenler: girenlerListe,
    gelmeyenler: gelmeyenlerListe,
    veriGirmeyenler
  };
}

const MESAI_DURUM_ETIKET = {
  izin_cikardi: "ZOBİS'ten izin çıkardı",
  izin_cikarmadi: "ZOBİS'ten izin çıkmadı",
  gorevlendirildi: 'Görevlendirildi'
};

const MESAI_IZIN_ETIKET = {
  genel_sekreter: 'Genel Sekreterden izin aldı',
  baskan: 'Başkandan izin aldı',
  her_ikisi: 'GS ve Başkandan izin aldı',
  basvuru_yok: 'İzin başvurusu yok'
};

const MESAI_IZIN_TURU_ETIKET = {
  gunluk: 'Yıllık izin',
  yarim_gun: 'Yarım gün izin',
  uzun_sureli: 'Uzun süreli izin',
  yukleme: 'Yıllık izin yükleme',
  devir: 'Önceki yıldan devir',
  saatlik_yukleme: 'Saatlik izin yükleme',
  saatlik_devir: 'Önceki yıldan saatlik devir'
};

const MESAI_GECERLI_DURUM = new Set(['izin_cikardi', 'izin_cikarmadi', 'gorevlendirildi', '']);

/** Plan / yoklama: ZOBİS'te işlendi mi */
function mesaiIzinZobisIslendiMi(durum) {
  return String(durum || '').trim().toLowerCase() === 'izin_cikardi';
}

function mesaiIzinZobisBekleyenSayi(kullanimlar) {
  return (kullanimlar || []).filter(
    (k) => k.kaynak === 'plan' && !mesaiIzinZobisIslendiMi(k.durum)
  ).length;
}

/** "İzin kağıdını gelince çıkaracak" vb. — ZOBİS'ten çıkarıldı kaydında temizlenir */
function mesaiNotlarZobisDurumaGore(notlar, durum) {
  const d = String(durum || '').trim().toLowerCase();
  let n = String(notlar || '').trim();
  if (d !== 'izin_cikardi') return n.slice(0, 500);
  if (!n) return '';
  if (/gelince\s*çıkar|kağıdını\s*gelince|gelince\s*çıkaracak/i.test(n)) return '';
  return n.slice(0, 500);
}
const MESAI_GECERLI_IZIN = new Set(['genel_sekreter', 'baskan', 'her_ikisi', 'basvuru_yok', '']);
const MESAI_GECERLI_IZIN_TURU = new Set(['gunluk', 'yarim_gun', 'uzun_sureli', '']);

/** SQL / JS Date / 'YYYY-MM-DD' → 'YYYY-MM-DD' (yerel gün) */
function mesaiTarihYilAyGun(v) {
  if (v == null || v === '') return '';
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, '0');
    const day = String(v.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function mesaiTarihEkle(tarihStr, gun) {
  const iso = mesaiTarihYilAyGun(tarihStr);
  if (!iso) return '';
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + gun);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function mesaiTarihKisaTr(tarihStr) {
  const iso = mesaiTarihYilAyGun(tarihStr);
  if (!iso) return '';
  const [y, m, g] = iso.split('-');
  return `${g}.${m}.${y}`;
}

function mesaiSaatNorm(saat) {
  const t = String(saat || '').trim();
  const m = t.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h < 0 || h > 23 || mi < 0 || mi > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`;
}

function mesaiSaatDakika(saat) {
  const n = mesaiSaatNorm(saat);
  if (!n) return null;
  const [h, mi] = n.split(':').map(Number);
  return h * 60 + mi;
}

/** ISO hafta anahtarı (haftada bir erken gün takibi) */
function mesaiIsoHaftaKey(tarihStr) {
  const iso = mesaiTarihYilAyGun(tarihStr);
  if (!iso) return '';
  const d = new Date(`${iso}T12:00:00`);
  const gun = d.getDay() || 7;
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 4 - gun);
  const yilBas = new Date(d.getFullYear(), 0, 1);
  const hafta = Math.ceil((((d - yilBas) / 86400000) + 1) / 7);
  return `${d.getFullYear()}-W${String(hafta).padStart(2, '0')}`;
}

/** Pazartesi (hafta başı) — ISO hafta */
function mesaiHaftaPazartesi(tarihStr) {
  const iso = mesaiTarihYilAyGun(tarihStr);
  if (!iso) return '';
  const d = new Date(`${iso}T12:00:00`);
  const gun = d.getDay() || 7;
  d.setDate(d.getDate() - (gun - 1));
  return mesaiTarihYilAyGun(d);
}

function mesaiHaftaPazar(haftaBas) {
  return mesaiTarihEkle(mesaiHaftaPazartesi(haftaBas), 6);
}

function mesaiHaftaAralikTr(haftaBas) {
  const bas = mesaiHaftaPazartesi(haftaBas);
  if (!bas) return '';
  return mesaiTarihKisaTr(bas) + ' – ' + mesaiTarihKisaTr(mesaiHaftaPazar(bas));
}

/** HTML week (2026-W22) veya tarih → pazartesi ISO */
function mesaiHaftaDegerParse(veri) {
  const ham = String(veri?.haftaBaslangic || veri?.hafta || veri?.tarih || '').trim();
  const wk = ham.match(/^(\d{4})-W(\d{1,2})$/i);
  if (wk) {
    const y = Number(wk[1]);
    const w = Number(wk[2]);
    const d = new Date(y, 0, 1 + (w - 1) * 7);
    const dow = d.getDay();
    if (dow <= 4) d.setDate(d.getDate() - d.getDay() + 1);
    else d.setDate(d.getDate() + 8 - d.getDay());
    return mesaiTarihYilAyGun(d);
  }
  return mesaiHaftaPazartesi(ham);
}

/** Personelin nöbet haftaları (ISO hafta anahtarı) — o hafta erken gelişte giriş+8 saat */
async function mesaiNobetHaftaSetAl(kullaniciId, bas, bit) {
  await mesaiDbHazirla();
  const pool = await getPool();
  const r = await pool.request()
    .input('kid', sql.Int, kullaniciId)
    .input('bas', sql.Date, bas)
    .input('bit', sql.Date, bit)
    .query(`
      SELECT CAST(HaftaBaslangic AS DATE) AS HaftaBaslangic
      FROM dbo.PersonelMesaiNobet
      WHERE KullaniciId = @kid
        AND HaftaBaslangic <= @bit
        AND DATEADD(day, 6, HaftaBaslangic) >= @bas
    `);
  const set = new Set();
  for (const row of r.recordset) {
    const pzt = mesaiTarihYilAyGun(row.HaftaBaslangic);
    if (pzt) set.add(mesaiIsoHaftaKey(pzt));
  }
  return set;
}

function mesaiAySonGun(yil, ay) {
  const y = Number(yil) || new Date().getFullYear();
  const a = Number(ay) || 1;
  const d = new Date(`${y}-${String(a).padStart(2, '0')}-01T12:00:00`);
  d.setMonth(d.getMonth() + 1);
  d.setDate(0);
  return mesaiTarihYilAyGun(d);
}

async function mesaiNobetAyListeAl(yil, ay) {
  await mesaiDbHazirla();
  const y = Number(yil) || new Date().getFullYear();
  const a = Number(ay) || (new Date().getMonth() + 1);
  const bas = `${y}-${String(a).padStart(2, '0')}-01`;
  const bit = mesaiAySonGun(y, a);
  const pool = await getPool();
  const r = await pool.request()
    .input('bas', sql.Date, bas)
    .input('bit', sql.Date, bit)
    .query(`
      SELECT n.Id, CAST(n.HaftaBaslangic AS DATE) AS HaftaBaslangic, n.KullaniciId, n.Notlar,
             LTRIM(RTRIM(ISNULL(u.Ad,'') + ' ' + ISNULL(u.Soyad,''))) AS AdSoyad,
             u.KullaniciAdi
      FROM dbo.PersonelMesaiNobet n
      INNER JOIN Kullanicilar u ON u.Id = n.KullaniciId
      WHERE n.HaftaBaslangic <= @bit AND DATEADD(day, 6, n.HaftaBaslangic) >= @bas
      ORDER BY n.HaftaBaslangic DESC
    `);
  const kayitlar = r.recordset.map((row) => {
    const haftaBaslangic = mesaiTarihYilAyGun(row.HaftaBaslangic);
    return {
      id: row.Id,
      haftaBaslangic,
      haftaAralikTr: mesaiHaftaAralikTr(haftaBaslangic),
      haftaKey: mesaiIsoHaftaKey(haftaBaslangic),
      kullaniciId: row.KullaniciId,
      adSoyad: (row.AdSoyad || '').trim() || row.KullaniciAdi,
      notlar: row.Notlar || ''
    };
  });
  const personel = await mesaiTakipPersonelAl({ adminDahil: false, whatsappHaric: true });
  return { yil: y, ay: a, bas, bit, kayitlar, personel };
}

async function mesaiNobetKaydet(veri, guncelleyenId) {
  await mesaiDbHazirla();
  const haftaBaslangic = mesaiHaftaDegerParse(veri);
  const kid = Number(veri.kullaniciId);
  if (!haftaBaslangic || !kid) throw new Error('Hafta ve personel zorunludur.');
  const pool = await getPool();
  const p = await pool.request().input('kid', sql.Int, kid).query(`
    SELECT Id FROM Kullanicilar WHERE Id = @kid`);
  if (!p.recordset.length) throw new Error('Personel bulunamadı.');
  const notlar = String(veri.notlar || '').trim().slice(0, 300) || null;
  await pool.request()
    .input('hb', sql.Date, haftaBaslangic)
    .input('kid', sql.Int, kid)
    .input('notlar', sql.NVarChar(300), notlar)
    .input('gid', sql.Int, guncelleyenId || null)
    .query(`
      MERGE dbo.PersonelMesaiNobet AS t
      USING (SELECT @hb AS HaftaBaslangic) AS s ON t.HaftaBaslangic = s.HaftaBaslangic
      WHEN MATCHED THEN
        UPDATE SET KullaniciId = @kid, Notlar = @notlar, GuncelleyenId = @gid,
          GuncellemeZamani = SYSDATETIME()
      WHEN NOT MATCHED THEN
        INSERT (HaftaBaslangic, KullaniciId, Notlar, GuncelleyenId)
        VALUES (@hb, @kid, @notlar, @gid);
    `);
  return mesaiNobetAyListeAl(
    parseInt(haftaBaslangic.slice(0, 4), 10),
    parseInt(haftaBaslangic.slice(5, 7), 10)
  );
}

async function mesaiNobetSil(haftaStr) {
  await mesaiDbHazirla();
  const haftaBaslangic = mesaiHaftaDegerParse({ haftaBaslangic: haftaStr, hafta: haftaStr });
  if (!haftaBaslangic) throw new Error('Geçersiz hafta.');
  const pool = await getPool();
  await pool.request()
    .input('hb', sql.Date, haftaBaslangic)
    .query(`DELETE FROM dbo.PersonelMesaiNobet WHERE HaftaBaslangic = @hb`);
  return { haftaBaslangic };
}

function mesaiAyAdiTr(ay) {
  const adlar = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
  const i = (Number(ay) || 1) - 1;
  return adlar[i] || '';
}

function mesaiNobetListeMetni(veri) {
  const { yil, ay, kayitlar } = veri;
  const satirlar = [
    '📋 *Haftalık nöbet listesi*',
    '',
    `*${mesaiAyAdiTr(ay)} ${yil}*`,
    ''
  ];
  const sirali = [...(kayitlar || [])].sort((a, b) => a.haftaBaslangic.localeCompare(b.haftaBaslangic));
  if (!sirali.length) {
    satirlar.push('_Bu ay için atanmış nöbet kaydı yok._');
  } else {
    for (const k of sirali) {
      let sat = `• ${k.haftaAralikTr}: *${k.adSoyad}*`;
      if (k.notlar) sat += ` _(${k.notlar})_`;
      satirlar.push(sat);
    }
  }
  satirlar.push(
    '',
    `Nöbet haftasında en geç giriş *${mesaiNobetSonGirisSaat()}* (+ tolerans).`,
    'Zamanında gelişte çıkış: giriş + 8 saat.',
    '',
    '_Sarayönü Ziraat Odası_'
  );
  return satirlar.join('\n');
}

/** Mesai personeli — Kullanicilar.Telefon dolu olanlar */
async function mesaiPersonelTelefonluListeAl() {
  await mesaiDbHazirla();
  const personel = await mesaiTakipPersonelAl({ adminDahil: false, whatsappHaric: true });
  const pool = await getPool();
  let rows;
  try {
    rows = await pool.request().query(`
      SELECT Id, LTRIM(RTRIM(ISNULL(CAST(Telefon AS NVARCHAR(30)), ''))) AS Telefon
      FROM Kullanicilar
    `);
  } catch (_) {
    return [];
  }
  const telMap = new Map();
  for (const r of rows.recordset) {
    const t = String(r.Telefon || '').trim();
    if (t) telMap.set(r.Id, t);
  }
  return personel
    .filter((p) => telMap.has(p.id))
    .map((p) => ({ ...p, telefon: telMap.get(p.id) }));
}

/** Seçilen ayın nöbet listesini WhatsApp ile gönderir (.env numaralar + telefonu kayıtlı personel) */
async function mesaiNobetWhatsappGonder(yil, ay) {
  const veri = await mesaiNobetAyListeAl(yil, ay);
  const metin = mesaiNobetListeMetni(veri);
  if (!mesaiWa.waAktifMi()) {
    return { ok: false, message: 'WhatsApp kapalı (.env MESAI_WA_AKTIF=true).' };
  }
  mesaiWa.ensureMesaiWhatsApp();
  if (!mesaiWa.mesaiWhatsAppHazirMi()) {
    return {
      ok: false,
      message: 'WhatsApp bağlı değil. Oda telefonunda Bağlı cihazlar → QR ile Personel Kart sayfasından bağlayın.',
      metinOnizle: metin
    };
  }

  const grupSonuc = await mesaiWa.mesaiWhatsAppGonder(metin);
  const grupSet = new Set(mesaiWa.waNumaralari().map((n) => mesaiWa.waNumaraNormalize(n)));
  const telPersonel = await mesaiPersonelTelefonluListeAl();
  let personelOk = 0;
  let personelAtla = 0;
  let personelHata = 0;
  const hatalar = [];

  for (const p of telPersonel) {
    const num = mesaiWa.waNumaraNormalize(p.telefon);
    if (!num) {
      personelAtla++;
      continue;
    }
    if (grupSet.has(num)) {
      personelAtla++;
      continue;
    }
    const kisisel = `Sayın *${p.adSoyad}*,\n\n${metin}`;
    const s = await mesaiWa.mesaiWhatsAppGonder(kisisel, [p.telefon]);
    if (s.success) personelOk++;
    else {
      personelHata++;
      hatalar.push(`${p.adSoyad}: ${s.message}`);
    }
  }

  const ok = grupSonuc.success || personelOk > 0;
  let message = '';
  if (grupSonuc.success) message += `Kurum numaraları: ${grupSonuc.message}. `;
  else if (mesaiWa.waNumaralari().length) message += `Kurum numaraları: ${grupSonuc.message}. `;
  message += `Personel: ${personelOk} gönderildi`;
  if (personelAtla) message += `, ${personelAtla} atlandı (numara yok / zaten kurum listesinde)`;
  if (personelHata) message += `, ${personelHata} hata`;

  console.log(`[Nöbet WA] ${mesaiAyAdiTr(ay)} ${yil} — grup: ${grupSonuc.success ? 'ok' : 'hata'}, personel: ${personelOk}`);
  return {
    ok,
    message: message.trim(),
    metin,
    yil: veri.yil,
    ay: veri.ay,
    kayitSayisi: veri.kayitlar.length,
    grupSonuc,
    personelOk,
    personelAtla,
    personelHata,
    hatalar: hatalar.length ? hatalar : undefined
  };
}

/** Nöbet haftası — en geç giriş (varsayılan 07:45) */
function mesaiNobetSonGirisSaat() {
  return mesaiSaatNorm(process.env.MESAI_NOBET_SON_GIRIS || '07:45') || '07:45';
}

/** Tarihe göre beklenen mesai (01.09.2026 dahil önce: 09:00–17:00) */
function mesaiBeklenenMesaiSaatleri(tarih) {
  const tol = Math.max(0, Number(process.env.MESAI_MESAI_TOLERANS_DK || 10) || 10);
  const donemBitis = mesaiTarihYilAyGun(process.env.MESAI_SAAT_DONEM_BITIS || '2026-09-01') || '2026-09-01';
  const iso = mesaiTarihYilAyGun(tarih) || bugunTarihStr();
  if (iso <= donemBitis) {
    return {
      giris: mesaiSaatNorm(process.env.MESAI_BEKLENEN_GIRIS || '09:00') || '09:00',
      cikis: mesaiSaatNorm(process.env.MESAI_BEKLENEN_CIKIS || '17:00') || '17:00',
      toleransDk: tol,
      donemEtiket: '01.09.2026\'ya kadar 09:00–17:00',
      donemBitis
    };
  }
  return {
    giris: mesaiSaatNorm(process.env.MESAI_BEKLENEN_GIRIS_SONRA || '09:00') || '09:00',
    cikis: mesaiSaatNorm(process.env.MESAI_BEKLENEN_CIKIS_SONRA || '17:00') || '17:00',
    toleransDk: tol,
    donemEtiket: '01.09.2026 sonrası (env)',
    donemBitis
  };
}

/**
 * Saat uyumu: geç giriş ve erken çıkış oranı düşürür.
 * Erken/zamanında giriş, geç çıkış, henüz çıkış yok → uyumlu.
 */
function mesaiGunSaatUyumu(giris, cikis, bek, tol, opts = {}) {
  const g = mesaiSaatDakika(giris);
  const c = mesaiSaatDakika(cikis);
  const bg = mesaiSaatDakika(bek.giris);
  const bc = mesaiSaatDakika(bek.cikis);
  if (g == null) {
    return {
      uyum: false,
      gecGiris: false,
      girisYok: true,
      cikisErken: false,
      cikisGec: false,
      cikisYok: true,
      erkenGiris: false,
      erkenGun: false,
      girisUyumlu: false
    };
  }
  const calismaDk = Math.max(0, bc - bg);
  const nobetSonDk = opts.erkenGun ? mesaiSaatDakika(opts.nobetSonGiris || mesaiNobetSonGirisSaat()) : null;
  let gecGiris;
  let minCikisDk = bc - tol;
  if (nobetSonDk != null) {
    gecGiris = g > nobetSonDk + tol;
    if (!gecGiris) minCikisDk = g + calismaDk - tol;
  } else {
    gecGiris = g > bg + tol;
  }
  const erkenGiris = g < bg;
  const cikisYok = c == null;
  const cikisErken = !cikisYok && c < minCikisDk;
  const cikisGec = !cikisYok && c > bc + tol;
  const girisUyumlu = !gecGiris;
  return {
    uyum: girisUyumlu && !cikisErken,
    gecGiris,
    erkenCikis: cikisErken,
    cikisErken,
    cikisGec,
    cikisYok,
    erkenGiris,
    girisUyumlu,
    erkenGun: !!opts.erkenGun,
    nobetSonGiris: opts.nobetSonGiris || null
  };
}

function mesaiPersonelGunSaatDeger(g, tarih, nobetHaftalar) {
  const bek = mesaiBeklenenMesaiSaatleri(tarih);
  const erkenGun = !!(nobetHaftalar && nobetHaftalar.has(mesaiIsoHaftaKey(tarih)));
  const u = mesaiGunSaatUyumu(g.giris, g.cikis, bek, bek.toleransDk, {
    erkenGun,
    nobetSonGiris: erkenGun ? mesaiNobetSonGirisSaat() : null
  });
  return { u, bek, erkenGun };
}

function mesaiPersonelPerformansHesapla(gunMap, aralik, nobetHaftalar) {
  const { bas, bitGoster } = aralik;
  const bugun = bugunTarihStr();
  let bitPerf = bitGoster;
  if (bitPerf >= bugun) bitPerf = mesaiTarihEkle(bugun, -1);
  const nobetSet = nobetHaftalar || new Set();
  let beklenenGun = 0;
  let gelinenGun = 0;
  let mesaiKayitGun = 0;
  let uyumluGun = 0;
  let gecGirisGun = 0;
  let erkenCikisGun = 0;
  let cikisYokGun = 0;
  let erkenGelisGun = 0;
  let tamGunIzin = 0;
  let yarimGunIzin = 0;
  let devamsizGun = 0;
  const ornekBek = mesaiBeklenenMesaiSaatleri(bitPerf >= bas ? bitPerf : bitGoster);

  if (bitPerf < bas) {
    return {
      beklenenGiris: ornekBek.giris,
      beklenenCikis: ornekBek.cikis,
      toleransDk: ornekBek.toleransDk,
      donemEtiket: ornekBek.donemEtiket,
      beklenenGun: 0,
      gelinenGun: 0,
      devamsizGun: 0,
      tamGunIzin: 0,
      yarimGunIzin: 0,
      mesaiKayitGun: 0,
      uyumluGun: 0,
      gecGirisGun: 0,
      erkenCikisGun: 0,
      cikisYokGun: 0,
      erkenGelisGun: 0,
      katilimOrani: null,
      saatUyumOrani: null,
      istatistikBitis: null,
      bugunHaric: true,
      aciklama:
        'İstatistikler tamamlanmış iş günlerine göredir; içinde bulunulan gün dahil değildir. Henüz değerlendirilecek gün yok.'
    };
  }

  const gunUyumIsle = (g, t, agirlik) => {
    const { u } = mesaiPersonelGunSaatDeger(g, t, nobetSet);
    if (u.erkenGiris) erkenGelisGun += agirlik;
    if (u.uyum) uyumluGun += agirlik;
    if (u.gecGiris) gecGirisGun += agirlik;
    if (u.erkenCikis) erkenCikisGun += agirlik;
    if (u.cikisYok) cikisYokGun += agirlik;
  };

  for (let t = bas; t && t <= bitPerf; t = mesaiTarihEkle(t, 1)) {
    const g = gunMap.get(t);
    if (!g || g.haftaSonu || g.resmiTatil) continue;
    if (g.tamGun) {
      tamGunIzin++;
      continue;
    }
    if (g.yarim) {
      yarimGunIzin++;
      beklenenGun += 0.5;
      if (g.giris || g.cikis) gelinenGun += 0.5;
      else devamsizGun += 0.5;
      continue;
    }
    beklenenGun += 1;
    if (g.giris || g.cikis) {
      gelinenGun += 1;
      if (g.giris) {
        mesaiKayitGun++;
        gunUyumIsle(g, t, 1);
      }
    } else {
      devamsizGun += 1;
    }
  }

  const katilimOrani = beklenenGun > 0
    ? Math.round((gelinenGun / beklenenGun) * 1000) / 10
    : null;
  const saatUyumOrani = mesaiKayitGun > 0
    ? Math.round((uyumluGun / mesaiKayitGun) * 1000) / 10
    : null;

  return {
    beklenenGiris: ornekBek.giris,
    beklenenCikis: ornekBek.cikis,
    toleransDk: ornekBek.toleransDk,
    donemEtiket: ornekBek.donemEtiket,
    beklenenGun: Math.round(beklenenGun * 10) / 10,
    gelinenGun: Math.round(gelinenGun * 10) / 10,
    devamsizGun,
    tamGunIzin,
    yarimGunIzin,
    mesaiKayitGun,
    uyumluGun,
    gecGirisGun,
    erkenCikisGun,
    cikisYokGun,
    erkenGelisGun,
    katilimOrani,
    saatUyumOrani,
    istatistikBitis: bitPerf,
    bugunHaric: true,
    aciklama:
      'Katılım: izin/tatil hariç gelinen÷beklenen. Saat uyumu (' + ornekBek.donemEtiket + '): yalnızca normal mesai günleri; tam/yarım gün izin dahil değil. '
      + 'Erken/zamanında giriş ve geç çıkış uyumlu; geç giriş (>' + ornekBek.giris + '+' + ornekBek.toleransDk + ' dk) ve erken çıkış (<' + ornekBek.cikis
      + '-' + ornekBek.toleransDk + ' dk; nöbet haftasında en geç ' + mesaiNobetSonGirisSaat() + '+' + ornekBek.toleransDk
      + ' dk giriş, zamanında gelişte giriş+8 saat çıkış) oranı düşürür. Giriş kaydı olmayan gün saat uyumuna alınmaz. Henüz çıkış yok uyumlu. İçinde bulunulan gün istatistiğe dahil değildir'
      + (bitPerf < bitGoster ? ' (son: ' + mesaiTarihKisaTr(bitPerf) + ').' : '.')
  };
}

function mesaiIzinGunSayisi(izinBaslangic, iseDonus) {
  const bas = mesaiTarihYilAyGun(izinBaslangic);
  const don = mesaiTarihYilAyGun(iseDonus);
  if (!bas || !don) return 0;
  const a = new Date(`${bas}T12:00:00`);
  const b = new Date(`${don}T12:00:00`);
  return Math.max(0, Math.round((b - a) / 86400000));
}

function mesaiIzinSaatFarki(baslangicSaat, bitisSaat) {
  const b = mesaiSaatDakika(baslangicSaat);
  const e = mesaiSaatDakika(bitisSaat);
  if (b == null || e == null) return 0;
  let dk = e - b;
  if (dk <= 0) dk += 24 * 60;
  return mesaiIzinDakikaToSaat(dk);
}

/** Ondalık saat (3,5 = 3 saat 30 dk); ondalık kısım dakika değildir */
function mesaiIzinSaatOndalikParse(saat) {
  if (saat == null || saat === '') return 0;
  const n = Number(String(saat).trim().replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function mesaiIzinSaatToDakika(saat) {
  return Math.round(mesaiIzinSaatOndalikParse(saat) * 60);
}

function mesaiIzinDakikaToSaat(dk) {
  return Math.round((Math.max(0, dk) / 60) * 100) / 100;
}

function mesaiIzinSaatDakikaMetin(toplamSaat) {
  const dk = mesaiIzinSaatToDakika(toplamSaat);
  const saat = Math.floor(dk / 60);
  const rem = dk % 60;
  if (rem > 0) return `${saat} saat ${rem} dakika`;
  return `${saat} saat`;
}

function mesaiIzinSaatSureMetin(saat) {
  const s = mesaiIzinSaatOndalikParse(saat);
  if (s <= 0) return '—';
  return mesaiIzinSaatDakikaMetin(s);
}

/** Yıllık izin bakiyesinde 1 tam gün = kaç saat (MESAI_IZIN_GUN_SAATI, varsayılan 8) */
function mesaiIzinGunSaat() {
  const v = Number(process.env.MESAI_IZIN_GUN_SAATI || process.env.MESAI_IZIN_GUN_SAAT || 8);
  return Number.isFinite(v) && v > 0 ? v : 8;
}

/** Yıllık izin yüklendiğinde eklenen saatlik izin hakkı (saat) */
function mesaiIzinSaatlikYillikSaat() {
  const v = Number(process.env.MESAI_IZIN_SAATLIK_YILLIK_SAAT || 80);
  return Number.isFinite(v) && v > 0 ? v : 80;
}

function mesaiIzinSaattenGun(saat) {
  const h = Number(saat) || 0;
  if (h <= 0) return 0;
  return Math.round((h / mesaiIzinGunSaat()) * 100) / 100;
}

/** Tam gün / aralık izinler için bakiye günü (yarım gün burada 0) */
function mesaiIzinPlanGunDeger(izinTuru, izinBaslangic, iseDonus) {
  const tur = String(izinTuru || '').trim();
  if (tur === 'yarim_gun') return 0;
  const g = mesaiIzinGunSayisi(izinBaslangic, iseDonus);
  if (g > 0) return g;
  return tur === 'gunluk' ? 1 : 0;
}

/** Plan satırı: bakiye günü, saat toplamı ve gösterim metni */
function mesaiIzinPlanSureDeger(izinTuru, izinBaslangic, iseDonus, baslangicSaat, bitisSaat, opts = {}) {
  const tur = String(izinTuru || '').trim();
  if (tur === 'yarim_gun') {
    const saat = mesaiIzinSaatFarki(baslangicSaat, bitisSaat);
    return {
      gunSayisi: 0,
      saatSayisi: saat,
      sureMetin: mesaiIzinSaatSureMetin(saat),
      bakiyedenDus: saat > 0
    };
  }
  const gunSayisi = mesaiIzinPlanGunDeger(izinTuru, izinBaslangic, iseDonus);
  return {
    gunSayisi,
    saatSayisi: 0,
    sureMetin: gunSayisi > 0 ? `${gunSayisi} gün` : '—',
    bakiyedenDus: gunSayisi > 0
  };
}

function mesaiIzinYilBul(tarihStr) {
  const t = mesaiTarihYilAyGun(tarihStr) || bugunTarihStr();
  return parseInt(String(t).slice(0, 4), 10) || new Date().getFullYear();
}

async function mesaiIzinKullanimlariAl(kullaniciId, yil, opts = {}) {
  await mesaiDbHazirla();
  const aralik = mesaiSistemYilAraligi(yil);
  if (!aralik) return [];
  const pool = await getPool();
  const req = pool.request().input('kid', sql.Int, kullaniciId).input('yil', sql.Int, yil);
  let sqlEk = ' AND YEAR(IzinBaslangic) = @yil';
  if (aralik) {
    req.input('listBas', sql.Date, aralik.bas);
    sqlEk += ' AND IzinBaslangic >= @listBas';
  }
  const r = await req.query(`
      SELECT Id, IzinTuru, IzinBaslangic, IseDonus, BaslangicSaat, BitisSaat, Durum, Notlar, OlusturmaZamani
      FROM dbo.PersonelMesaiIzinPlan
      WHERE KullaniciId = @kid ${sqlEk}
      ORDER BY IzinBaslangic DESC, Id DESC
    `);
  const planlar = r.recordset.map((row) => {
    const sure = mesaiIzinPlanSureDeger(
      row.IzinTuru,
      row.IzinBaslangic,
      row.IseDonus,
      row.BaslangicSaat,
      row.BitisSaat,
      {}
    );
    return {
      id: row.Id,
      kaynak: 'plan',
      izinTuru: row.IzinTuru,
      izinTuruEtiket: MESAI_IZIN_TURU_ETIKET[row.IzinTuru] || row.IzinTuru,
      izinBaslangic: row.IzinBaslangic,
      iseDonus: row.IseDonus,
      baslangicSaat: row.BaslangicSaat,
      bitisSaat: row.BitisSaat,
      ozet: mesaiIzinAralikMetni(
        row.IzinTuru,
        row.IzinBaslangic,
        row.IseDonus,
        row.BaslangicSaat,
        row.BitisSaat
      ),
      gunSayisi: sure.gunSayisi,
      saatSayisi: sure.saatSayisi,
      sureMetin: sure.sureMetin,
      bakiyedenDus: sure.bakiyedenDus,
      bakiyeArtis: false,
      durum: row.Durum || '',
      zobisIslendi: mesaiIzinZobisIslendiMi(row.Durum),
      notlar: (row.Notlar || '').trim()
    };
  });
  const hareketler = await mesaiIzinHareketleriAl(kullaniciId, yil);
  return [...planlar, ...hareketler].sort((a, b) => {
    const da = mesaiTarihYilAyGun(a.izinBaslangic) || '';
    const db = mesaiTarihYilAyGun(b.izinBaslangic) || '';
    if (db !== da) return db.localeCompare(da);
    const aH = a.kaynak === 'hareket' ? 1 : 0;
    const bH = b.kaynak === 'hareket' ? 1 : 0;
    if (aH !== bH) return aH - bH;
    return String(b.id).localeCompare(String(a.id));
  });
}

async function mesaiIzinKullanilanToplam(kullaniciId, yil, opts = {}) {
  const liste = await mesaiIzinKullanimlariAl(kullaniciId, yil, opts);
  const t = liste
    .filter((x) => x.bakiyedenDus)
    .reduce((s, x) => s + Number(x.gunSayisi || 0), 0);
  return Math.round(t * 10) / 10;
}

function mesaiIzinSaatlikToplamHesapla(kullanimlar) {
  const dk = (kullanimlar || [])
    .filter((x) => !x.bakiyeArtis && x.kaynak !== 'hareket' && x.izinTuru === 'yarim_gun' && x.bakiyedenDus)
    .reduce((s, x) => s + mesaiIzinSaatToDakika(x.saatSayisi), 0);
  return mesaiIzinDakikaToSaat(dk);
}

async function mesaiIzinSaatlikKullanilanToplam(kullaniciId, yil) {
  const liste = await mesaiIzinKullanimlariAl(kullaniciId, yil);
  return mesaiIzinSaatlikToplamHesapla(liste);
}

async function mesaiIzinSaatlikKalanKontrol(kullaniciId, yil, istenenSaat, planIdHaric = null) {
  const ad = await mesaiIzinKullaniciAdSoyadAl(kullaniciId);
  await mesaiIzinSaatlikHakBackfill(kullaniciId, yil, null, ad);
  const bakiye = await mesaiIzinBakiyeRowGet(kullaniciId, yil);
  const hak = bakiye ? Number(bakiye.SaatlikIzinHak) : 0;
  const liste = await mesaiIzinKullanimlariAl(kullaniciId, yil);
  let kullDk = mesaiIzinSaatToDakika(mesaiIzinSaatlikToplamHesapla(liste));
  if (planIdHaric) {
    const p = liste.find((x) => x.kaynak === 'plan' && Number(x.id) === Number(planIdHaric));
    if (p) kullDk = Math.max(0, kullDk - mesaiIzinSaatToDakika(p.saatSayisi));
  }
  const kalan = mesaiIzinDakikaToSaat(Math.max(0, mesaiIzinSaatToDakika(hak) - kullDk));
  const istenen = mesaiIzinSaatOndalikParse(istenenSaat);
  if (mesaiIzinSaatToDakika(istenen) > mesaiIzinSaatToDakika(kalan)) {
    return {
      ok: false,
      message: `Saatlik izin bakiyesi yetersiz (kalan ${mesaiIzinSaatSureMetin(kalan)}, istenen ${mesaiIzinSaatSureMetin(istenen)}).`
    };
  }
  return { ok: true, kalan };
}

/** İzin yükleme günü: danışman 1 Ocak, diğer personel işe giriş yıldönümü */
function mesaiIzinYuklemeTarihi(ilkIseGiris, yil, adSoyad, kullaniciId) {
  const giris = mesaiTarihYilAyGun(ilkIseGiris);
  const y = Number(yil);
  if (!giris || !y) return null;
  if (mesaiIzinFehimeKirazMi(adSoyad, kullaniciId)) return `${y}-01-01`;
  const yildonumu = `${y}-${giris.slice(5)}`;
  if (yildonumu < giris) return null;
  return yildonumu;
}

function mesaiIzinYuklemeHazirMi(ilkIseGiris, yil, adSoyad, bugun, kullaniciId) {
  const t = mesaiIzinYuklemeTarihi(ilkIseGiris, yil, adSoyad, kullaniciId);
  if (!t) return false;
  const b = mesaiTarihYilAyGun(bugun) || bugunTarihStr();
  return b >= t;
}

/** Yükleme tarihinde tamamlanan hizmet yılı */
function mesaiIzinKidemYilSayisi(ilkIseGiris, yil, adSoyad, kullaniciId) {
  const giris = mesaiTarihYilAyGun(ilkIseGiris);
  const ref = mesaiIzinYuklemeTarihi(ilkIseGiris, yil, adSoyad, kullaniciId);
  if (!giris || !ref || giris > ref) return 0;
  const g = new Date(`${giris}T12:00:00`);
  const r = new Date(`${ref}T12:00:00`);
  let fark = r.getFullYear() - g.getFullYear();
  if (r.getMonth() < g.getMonth() || (r.getMonth() === g.getMonth() && r.getDate() < g.getDate())) {
    fark--;
  }
  return Math.max(0, fark);
}

function mesaiIzinAdNorm(adSoyad) {
  return String(adSoyad || '')
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Fehime Kiraz — tarım danışmanı (MESAI_IZIN_DANISMAN_KULLANICI_ID ile de tanınır) */
function mesaiIzinFehimeKirazMi(adSoyad, kullaniciId) {
  const kid = Number(process.env.MESAI_IZIN_DANISMAN_KULLANICI_ID);
  if (kid && Number(kullaniciId) === kid) return true;
  const n = mesaiIzinAdNorm(adSoyad);
  return (n.includes('fehime') || n.includes('fehiime')) && n.includes('kiraz');
}

/** Kayıtlı ünvan yoksa: Fehime → Tarım Danışmanı, diğer personel → MEMUR */
function mesaiIzinVarsayilanUnvan(adSoyad, kullaniciId) {
  if (mesaiIzinFehimeKirazMi(adSoyad, kullaniciId)) return 'Tarım Danışmanı';
  return 'MEMUR';
}

function mesaiIzinUnvanGoster(kayitliUnvan, adSoyad, kullaniciId) {
  const u = String(kayitliUnvan || '').trim();
  if (u) return u;
  return mesaiIzinVarsayilanUnvan(adSoyad, kullaniciId);
}

function mesaiIzinDanismanYillikGun() {
  return Number(process.env.MESAI_IZIN_HAK_FEHIME || 20);
}

/** Kurum geneli 30 gün (yıldönümü); tarım danışmanı sabit 20 gün (1 Ocak) */
function mesaiIzinYillikHakGun(ilkIseGiris, yil, adSoyad, kullaniciId) {
  const giris = mesaiTarihYilAyGun(ilkIseGiris);
  const yuk = mesaiIzinYuklemeTarihi(ilkIseGiris, yil, adSoyad, kullaniciId);
  if (!giris || !yuk || giris > yuk) return 0;
  if (mesaiIzinFehimeKirazMi(adSoyad, kullaniciId)) {
    return mesaiIzinDanismanYillikGun();
  }
  const kidem = mesaiIzinKidemYilSayisi(ilkIseGiris, yil, adSoyad, kullaniciId);
  if (kidem < 1) return 0;
  return Number(process.env.MESAI_IZIN_YILLIK_GUN || 30);
}

function mesaiIzinHakKuralMetni(adSoyad, kullaniciId) {
  if (mesaiIzinFehimeKirazMi(adSoyad, kullaniciId)) {
    return 'Tarım danışmanı yıllık izni yılbaşında 20 gün olarak eklenir';
  }
  return 'İşe giriş yıldönümünde 30 gün olarak eklenir';
}

function mesaiIzinYillikHakYuklemeAciklama(yil, kidem, adSoyad, ilkIseGiris, kullaniciId) {
  const gun = mesaiIzinYillikHakGun(ilkIseGiris, yil, adSoyad, kullaniciId);
  const yukTr = mesaiTarihKisaTr(mesaiIzinYuklemeTarihi(ilkIseGiris, yil, adSoyad, kullaniciId));
  if (mesaiIzinFehimeKirazMi(adSoyad, kullaniciId)) {
    return 'Tarım danışmanı yıllık izni yılbaşında 20 gün olarak eklenir';
  }
  return 'İşe giriş yıldönümünde 30 gün olarak eklenir';
}

async function mesaiIzinKullaniciAdSoyadAl(kullaniciId) {
  const pool = await getPool();
  const r = await pool.request()
    .input('kid', sql.Int, kullaniciId)
    .query(`
      SELECT LTRIM(RTRIM(ISNULL(Ad,'') + ' ' + ISNULL(Soyad,''))) AS AdSoyad, KullaniciAdi
      FROM dbo.Kullanicilar WHERE Id = @kid
    `);
  if (!r.recordset.length) return '';
  const row = r.recordset[0];
  return (row.AdSoyad || '').trim() || row.KullaniciAdi || '';
}

async function mesaiIzinProfilGet(kullaniciId) {
  await mesaiDbHazirla();
  const pool = await getPool();
  const r = await pool.request()
    .input('kid', sql.Int, kullaniciId)
    .query(`
      SELECT IlkIseGiris, Unvan, Telefon, IzinAdres, GuncellemeZamani
      FROM dbo.PersonelIzinProfil
      WHERE KullaniciId = @kid
    `);
  return r.recordset[0] || null;
}

async function mesaiIzinProfilMerge(kullaniciId, patch, guncelleyenId) {
  await mesaiDbHazirla();
  const adSoyad = await mesaiIzinKullaniciAdSoyadAl(kullaniciId);
  const cur = await mesaiIzinProfilGet(kullaniciId);
  const pool = await getPool();

  const giris = patch.ilkIseGiris !== undefined
    ? mesaiTarihYilAyGun(patch.ilkIseGiris)
    : mesaiTarihYilAyGun(cur?.IlkIseGiris) || null;

  let unvan = cur?.Unvan != null ? String(cur.Unvan).trim() : '';
  if (patch.unvan !== undefined) {
    unvan = String(patch.unvan || '').trim().slice(0, 80);
  }

  let telefon = cur?.Telefon != null ? String(cur.Telefon).trim() : '';
  if (patch.telefon !== undefined) {
    telefon = String(patch.telefon || '').trim().slice(0, 30);
  }

  let izinAdres = cur?.IzinAdres != null ? String(cur.IzinAdres).trim() : '';
  if (patch.izinAdres !== undefined) {
    izinAdres = String(patch.izinAdres || '').trim().slice(0, 300);
  }

  await pool.request()
    .input('kid', sql.Int, kullaniciId)
    .input('giris', sql.Date, giris)
    .input('unvan', sql.NVarChar(80), unvan || null)
    .input('tel', sql.NVarChar(30), telefon || null)
    .input('adres', sql.NVarChar(300), izinAdres || null)
    .input('gid', sql.Int, guncelleyenId || null)
    .query(`
      MERGE dbo.PersonelIzinProfil AS t
      USING (SELECT @kid AS KullaniciId) AS s
      ON t.KullaniciId = s.KullaniciId
      WHEN MATCHED THEN
        UPDATE SET IlkIseGiris = @giris, Unvan = @unvan, Telefon = @tel, IzinAdres = @adres,
          GuncelleyenId = @gid, GuncellemeZamani = SYSDATETIME()
      WHEN NOT MATCHED THEN
        INSERT (KullaniciId, IlkIseGiris, Unvan, Telefon, IzinAdres, GuncelleyenId)
        VALUES (@kid, @giris, @unvan, @tel, @adres, @gid);
    `);

  if (patch.telefon !== undefined) {
    await pool.request()
      .input('kid', sql.Int, kullaniciId)
      .input('tel', sql.NVarChar(30), telefon || null)
      .query(`UPDATE dbo.Kullanicilar SET Telefon = @tel WHERE Id = @kid`);
  }

  return {
    ilkIseGiris: giris,
    unvan: mesaiIzinUnvanGoster(unvan, adSoyad, kullaniciId),
    unvanKayitli: unvan,
    unvanVarsayilan: mesaiIzinVarsayilanUnvan(adSoyad, kullaniciId),
    telefon,
    izinAdres
  };
}

async function mesaiIzinProfilKaydet(kullaniciId, ilkIseGiris, guncelleyenId) {
  return mesaiIzinProfilMerge(kullaniciId, { ilkIseGiris }, guncelleyenId);
}

async function mesaiIzinHareketVarMi(kullaniciId, yil, tur) {
  await mesaiDbHazirla();
  const pool = await getPool();
  const r = await pool.request()
    .input('kid', sql.Int, kullaniciId)
    .input('yil', sql.Int, yil)
    .input('tur', sql.NVarChar(30), tur)
    .query(`
      SELECT 1 AS ok FROM dbo.PersonelIzinHareket
      WHERE KullaniciId = @kid AND Yil = @yil AND Tur = @tur
    `);
  return !!r.recordset.length;
}

async function mesaiIzinHareketEkle(kullaniciId, yil, hareketTarihi, tur, gunSayisi, aciklama, guncelleyenId) {
  const gun = Math.round(Number(gunSayisi) * 10) / 10;
  if (gun <= 0) return false;
  if (await mesaiIzinHareketVarMi(kullaniciId, yil, tur)) return false;
  await mesaiDbHazirla();
  const pool = await getPool();
  const tarih = mesaiTarihYilAyGun(hareketTarihi) || `${yil}-01-01`;
  await pool.request()
    .input('kid', sql.Int, kullaniciId)
    .input('yil', sql.Int, yil)
    .input('tarih', sql.Date, tarih)
    .input('tur', sql.NVarChar(30), tur)
    .input('gun', sql.Decimal(6, 1), gun)
    .input('aciklama', sql.NVarChar(300), (aciklama || '').trim().slice(0, 300) || null)
    .input('gid', sql.Int, guncelleyenId || null)
    .query(`
      INSERT INTO dbo.PersonelIzinHareket (KullaniciId, Yil, HareketTarihi, Tur, GunSayisi, SaatSayisi, Aciklama, GuncelleyenId)
      VALUES (@kid, @yil, @tarih, @tur, @gun, NULL, @aciklama, @gid);
    `);
  return true;
}

async function mesaiIzinHareketSaatEkle(kullaniciId, yil, hareketTarihi, tur, saatSayisi, aciklama, guncelleyenId) {
  const saat = Math.round(Number(saatSayisi) * 100) / 100;
  if (saat <= 0) return false;
  if (await mesaiIzinHareketVarMi(kullaniciId, yil, tur)) return false;
  await mesaiDbHazirla();
  const pool = await getPool();
  const tarih = mesaiTarihYilAyGun(hareketTarihi) || `${yil}-01-01`;
  await pool.request()
    .input('kid', sql.Int, kullaniciId)
    .input('yil', sql.Int, yil)
    .input('tarih', sql.Date, tarih)
    .input('tur', sql.NVarChar(30), tur)
    .input('saat', sql.Decimal(7, 2), saat)
    .input('aciklama', sql.NVarChar(300), (aciklama || '').trim().slice(0, 300) || null)
    .input('gid', sql.Int, guncelleyenId || null)
    .query(`
      INSERT INTO dbo.PersonelIzinHareket (KullaniciId, Yil, HareketTarihi, Tur, GunSayisi, SaatSayisi, Aciklama, GuncelleyenId)
      VALUES (@kid, @yil, @tarih, @tur, 0, @saat, @aciklama, @gid);
    `);
  return true;
}

function mesaiIzinHareketSatirOlustur(row) {
  const tur = String(row.Tur || '').trim();
  const gun = Number(row.GunSayisi) || 0;
  const saat = Number(row.SaatSayisi) || 0;
  const tarihIso = mesaiTarihYilAyGun(row.HareketTarihi);
  const aciklama = (row.Aciklama || '').trim();
  if (tur === 'saatlik_yil_hak' || tur === 'saatlik_devir_onceki_yil') {
    const etiket = MESAI_IZIN_TURU_ETIKET[tur === 'saatlik_devir_onceki_yil' ? 'saatlik_devir' : 'saatlik_yukleme'] || aciklama || tur;
    return {
      id: 'h-' + row.Id,
      kaynak: 'hareket',
      izinTuru: tur === 'saatlik_devir_onceki_yil' ? 'saatlik_devir' : 'saatlik_yukleme',
      izinTuruEtiket: etiket,
      izinBaslangic: tarihIso,
      iseDonus: null,
      ozet: (mesaiTarihKisaTr(tarihIso) || tarihIso) + (aciklama ? ' — ' + aciklama : ''),
      gunSayisi: 0,
      saatSayisi: 0,
      sureMetin: '+' + mesaiIzinSaatSureMetin(saat),
      bakiyedenDus: false,
      bakiyeArtis: true,
      hareketSaat: saat,
      notlar: aciklama
    };
  }
  const etiket = MESAI_IZIN_TURU_ETIKET[tur === 'devir_onceki_yil' ? 'devir' : 'yukleme'] || aciklama || tur;
  return {
    id: 'h-' + row.Id,
    kaynak: 'hareket',
    izinTuru: tur === 'devir_onceki_yil' ? 'devir' : 'yukleme',
    izinTuruEtiket: etiket,
    izinBaslangic: tarihIso,
    iseDonus: null,
    ozet: (mesaiTarihKisaTr(tarihIso) || tarihIso) + (aciklama ? ' — ' + aciklama : ''),
    gunSayisi: 0,
    saatSayisi: 0,
    sureMetin: '+' + gun + ' gün',
    bakiyedenDus: false,
    bakiyeArtis: true,
    hareketGun: gun,
    notlar: aciklama
  };
}

const MESAI_IZIN_YUKLEME_TURLERI = new Set([
  'yil_hak', 'devir_onceki_yil', 'saatlik_yil_hak', 'saatlik_devir_onceki_yil'
]);

function mesaiIzinYuklemeHareketGosterilsinMi(hareketTarihi, tur) {
  const t = String(tur || '').trim();
  if (!MESAI_IZIN_YUKLEME_TURLERI.has(t)) return true;
  const iso = mesaiTarihYilAyGun(hareketTarihi);
  const bugun = bugunTarihStr();
  return !!iso && iso <= bugun;
}

/** Yıldönümü gelmeden oluşmuş yıllık yükleme / devir hareketlerini siler */
async function mesaiIzinGelecekYuklemeHareketTemizle(kullaniciId, yil, adSoyad = null) {
  const profil = await mesaiIzinProfilGet(kullaniciId);
  const ilkIso = mesaiTarihYilAyGun(profil?.IlkIseGiris);
  if (!ilkIso) return;
  const ad = adSoyad || (await mesaiIzinKullaniciAdSoyadAl(kullaniciId));
  if (mesaiIzinYuklemeHazirMi(ilkIso, yil, ad, null, kullaniciId)) return;
  const bugun = bugunTarihStr();
  await mesaiDbHazirla();
  const pool = await getPool();
  await pool.request()
    .input('kid', sql.Int, kullaniciId)
    .input('yil', sql.Int, yil)
    .input('bugun', sql.Date, bugun)
    .query(`
      DELETE FROM dbo.PersonelIzinHareket
      WHERE KullaniciId = @kid AND Yil = @yil
        AND Tur IN (N'yil_hak', N'devir_onceki_yil', N'saatlik_yil_hak', N'saatlik_devir_onceki_yil')
        AND HareketTarihi > @bugun
    `);
}

async function mesaiIzinHareketleriAl(kullaniciId, yil) {
  await mesaiDbHazirla();
  const pool = await getPool();
  const r = await pool.request()
    .input('kid', sql.Int, kullaniciId)
    .input('yil', sql.Int, yil)
    .query(`
      SELECT Id, HareketTarihi, Tur, GunSayisi, SaatSayisi, Aciklama
      FROM dbo.PersonelIzinHareket
      WHERE KullaniciId = @kid AND Yil = @yil
      ORDER BY HareketTarihi DESC, Id DESC
    `);
  return r.recordset
    .filter((row) => mesaiIzinYuklemeHareketGosterilsinMi(row.HareketTarihi, row.Tur))
    .map(mesaiIzinHareketSatirOlustur);
}

/** Mevcut yıl bakiyesi var ama hareket kaydı yoksa (eski kayıtlar) listeye ekle */
async function mesaiIzinHareketYilDevriBackfill(kullaniciId, yil, guncelleyenId = null, adSoyad = null) {
  const bakiye = await mesaiIzinBakiyeRowGet(kullaniciId, yil);
  if (!bakiye || Number(bakiye.YillikHak) <= 0) return;
  const profil = await mesaiIzinProfilGet(kullaniciId);
  const ilkIso = mesaiTarihYilAyGun(profil?.IlkIseGiris);
  if (!ilkIso) return;
  const ad = adSoyad || (await mesaiIzinKullaniciAdSoyadAl(kullaniciId));
  if (!mesaiIzinYuklemeHazirMi(ilkIso, yil, ad, null, kullaniciId)) return;
  if (await mesaiIzinHareketVarMi(kullaniciId, yil, 'yil_hak')) return;
  const kidem = mesaiIzinKidemYilSayisi(ilkIso, yil, ad, kullaniciId);
  const hakBase = mesaiIzinYillikHakGun(ilkIso, yil, ad, kullaniciId);
  const tarih = mesaiIzinYuklemeTarihi(ilkIso, yil, ad, kullaniciId) || `${yil}-01-01`;
  if (hakBase > 0) {
    await mesaiIzinHareketEkle(
      kullaniciId,
      yil,
      tarih,
      'yil_hak',
      hakBase,
      mesaiIzinYillikHakYuklemeAciklama(yil, kidem, ad, ilkIso, kullaniciId),
      guncelleyenId
    );
  }
  const toplamHak = Number(bakiye.YillikHak);
  const devirGun = Math.round((toplamHak - hakBase) * 10) / 10;
  if (devirGun > 0.01) {
    await mesaiIzinHareketEkle(
      kullaniciId,
      yil,
      tarih,
      'devir_onceki_yil',
      devirGun,
      `${yil - 1} yılından devreden kalan izin`,
      guncelleyenId
    );
  }
  await mesaiIzinSaatlikYilYukle(kullaniciId, yil, tarih, guncelleyenId);
}

/** Yıllık izin yüklendiğinde saatlik bakiye sıfırlanır, kalan 80 saat olur (devir yok) */
async function mesaiIzinSaatlikYilYukle(kullaniciId, yil, tarih, guncelleyenId = null) {
  if (await mesaiIzinHareketVarMi(kullaniciId, yil, 'saatlik_yil_hak')) return;
  const saatlikBase = mesaiIzinSaatlikYillikSaat();
  if (saatlikBase <= 0) return;
  const kullSaat = await mesaiIzinSaatlikKullanilanToplam(kullaniciId, yil);
  const saatlikHak = mesaiIzinDakikaToSaat(mesaiIzinSaatToDakika(kullSaat) + mesaiIzinSaatToDakika(saatlikBase));
  await mesaiDbHazirla();
  const pool = await getPool();
  await pool.request()
    .input('kid', sql.Int, kullaniciId)
    .input('yil', sql.Int, yil)
    .query(`
      DELETE FROM dbo.PersonelIzinHareket
      WHERE KullaniciId = @kid AND Yil = @yil AND Tur = N'saatlik_devir_onceki_yil'
    `);
  await pool.request()
    .input('kid', sql.Int, kullaniciId)
    .input('yil', sql.Int, yil)
    .input('saatlik', sql.Decimal(7, 2), saatlikHak)
    .input('gid', sql.Int, guncelleyenId || null)
    .query(`
      UPDATE dbo.PersonelIzinBakiye
      SET SaatlikIzinHak = @saatlik, GuncelleyenId = @gid, GuncellemeZamani = SYSDATETIME()
      WHERE KullaniciId = @kid AND Yil = @yil
    `);
  await mesaiIzinHareketSaatEkle(
    kullaniciId,
    yil,
    tarih,
    'saatlik_yil_hak',
    saatlikBase,
    `Yıllık saatlik izin yükleme (${saatlikBase} saat, kalan sıfırlandı)`,
    guncelleyenId
  );
}

/** Eski kayıtlarda saatlik yükleme hareketi yoksa tamamlar */
async function mesaiIzinSaatlikHakBackfill(kullaniciId, yil, guncelleyenId = null, adSoyad = null) {
  if (await mesaiIzinHareketVarMi(kullaniciId, yil, 'saatlik_yil_hak')) return;
  const profil = await mesaiIzinProfilGet(kullaniciId);
  const ilkIso = mesaiTarihYilAyGun(profil?.IlkIseGiris);
  if (!ilkIso) return;
  const ad = adSoyad || (await mesaiIzinKullaniciAdSoyadAl(kullaniciId));
  if (!mesaiIzinYuklemeHazirMi(ilkIso, yil, ad, null, kullaniciId)) return;
  if (!(await mesaiIzinHareketVarMi(kullaniciId, yil, 'yil_hak'))) return;
  const tarih = mesaiIzinYuklemeTarihi(ilkIso, yil, ad, kullaniciId) || `${yil}-01-01`;
  await mesaiIzinSaatlikYilYukle(kullaniciId, yil, tarih, guncelleyenId);
}

function mesaiIzinSaatlikHareketMi(k) {
  const t = String(k?.izinTuru || '').trim();
  return t === 'saatlik_yukleme' || t === 'saatlik_devir';
}

function mesaiIzinKullanimlarPersonelGoster(liste) {
  return (liste || []).filter((k) => !mesaiIzinSaatlikHareketMi(k));
}

async function mesaiIzinKalanSaatlikAl(kullaniciId, yil) {
  const bakiye = await mesaiIzinBakiyeRowGet(kullaniciId, yil);
  const hak = bakiye ? Number(bakiye.SaatlikIzinHak) : 0;
  const kull = await mesaiIzinSaatlikKullanilanToplam(kullaniciId, yil);
  const kalanDk = Math.max(0, mesaiIzinSaatToDakika(hak) - mesaiIzinSaatToDakika(kull));
  return mesaiIzinDakikaToSaat(kalanDk);
}

/** Yıl için bakiye satırı yoksa kıdem + devir ile otomatik yükler */
async function mesaiIzinBakiyeYilDevriEnsured(kullaniciId, yil, guncelleyenId = null, adSoyad = null) {
  const ad = adSoyad || (await mesaiIzinKullaniciAdSoyadAl(kullaniciId));
  const mevcut = await mesaiIzinBakiyeRowGet(kullaniciId, yil);
  if (mevcut) {
    await mesaiIzinHareketYilDevriBackfill(kullaniciId, yil, guncelleyenId, ad);
    return { yapildi: false };
  }
  const profil = await mesaiIzinProfilGet(kullaniciId);
  const ilk = profil?.IlkIseGiris;
  const ilkIso = mesaiTarihYilAyGun(ilk);
  if (!ilkIso) return { yapildi: false, sebep: 'ilk_giris_yok' };
  const yuklemeTarihi = mesaiIzinYuklemeTarihi(ilkIso, yil, ad, kullaniciId);
  if (!yuklemeTarihi) {
    return { yapildi: false, sebep: 'yildonumu_yok', yuklemeTarihi: null };
  }
  if (!mesaiIzinYuklemeHazirMi(ilkIso, yil, ad, null, kullaniciId)) {
    return { yapildi: false, sebep: 'yildonumu_bekleniyor', yuklemeTarihi };
  }
  const kidem = mesaiIzinKidemYilSayisi(ilkIso, yil, ad, kullaniciId);
  const hakBase = mesaiIzinYillikHakGun(ilkIso, yil, ad, kullaniciId);
  let prevKalan = 0;
  const devirAcik = String(process.env.MESAI_IZIN_DEVIR || '1') !== '0';
  if (devirAcik && yil > 1970) {
    const prevRow = await mesaiIzinBakiyeRowGet(kullaniciId, yil - 1);
    if (prevRow) {
      const kullanilan = await mesaiIzinKullanilanToplam(kullaniciId, yil - 1);
      prevKalan = Math.max(0, Math.round((Number(prevRow.YillikHak) - kullanilan) * 10) / 10);
    }
  }
  const hak = Math.round((hakBase + prevKalan) * 10) / 10;
  if (hak <= 0) return { yapildi: false, sebep: 'hak_sifir', yuklemeTarihi };
  const tarih = yuklemeTarihi;
  const kullSaatBas = await mesaiIzinSaatlikKullanilanToplam(kullaniciId, yil);
  const saatlikBase = hakBase > 0 ? mesaiIzinSaatlikYillikSaat() : 0;
  const saatlikHak = mesaiIzinDakikaToSaat(mesaiIzinSaatToDakika(kullSaatBas) + mesaiIzinSaatToDakika(saatlikBase));
  const pool = await getPool();
  await pool.request()
    .input('kid', sql.Int, kullaniciId)
    .input('yil', sql.Int, yil)
    .input('hak', sql.Decimal(6, 1), hak)
    .input('saatlik', sql.Decimal(7, 2), saatlikHak)
    .input('gid', sql.Int, guncelleyenId || null)
    .query(`
      INSERT INTO dbo.PersonelIzinBakiye (KullaniciId, Yil, YillikHak, SaatlikIzinHak, GuncelleyenId)
      VALUES (@kid, @yil, @hak, @saatlik, @gid);
    `);
  if (hakBase > 0) {
    await mesaiIzinHareketEkle(
      kullaniciId,
      yil,
      tarih,
      'yil_hak',
      hakBase,
      mesaiIzinYillikHakYuklemeAciklama(yil, kidem, ad, ilkIso, kullaniciId),
      guncelleyenId
    );
  }
  if (prevKalan > 0) {
    await mesaiIzinHareketEkle(
      kullaniciId,
      yil,
      tarih,
      'devir_onceki_yil',
      prevKalan,
      `${yil - 1} yılından devreden kalan izin`,
      guncelleyenId
    );
  }
  if (saatlikBase > 0) {
    await mesaiIzinHareketSaatEkle(
      kullaniciId,
      yil,
      tarih,
      'saatlik_yil_hak',
      saatlikBase,
      `Yıllık saatlik izin yükleme (${saatlikBase} saat, kalan sıfırlandı)`,
      guncelleyenId
    );
  }
  return { yapildi: true, yillikHak: hak, saatlikIzinHak: saatlikHak, yuklemeTarihi: tarih };
}

async function mesaiIzinBakiyeRowGet(kullaniciId, yil) {
  await mesaiDbHazirla();
  const pool = await getPool();
  const r = await pool.request()
    .input('kid', sql.Int, kullaniciId)
    .input('yil', sql.Int, yil)
    .query(`
      SELECT YillikHak, ISNULL(SaatlikIzinHak, 0) AS SaatlikIzinHak, Notlar, GuncellemeZamani,
             ISNULL(SaatlikIzinBakiyedenDus, 0) AS SaatlikIzinBakiyedenDus
      FROM dbo.PersonelIzinBakiye
      WHERE KullaniciId = @kid AND Yil = @yil
    `);
  return r.recordset[0] || null;
}

async function mesaiIzinBakiyeKaydet(kullaniciId, yil, kalanIzin, notlar, guncelleyenId, opts = {}) {
  const bakiyeRow = await mesaiIzinBakiyeRowGet(kullaniciId, yil);
  const mevcutHak = bakiyeRow ? Number(bakiyeRow.YillikHak) : 0;
  const mevcutSaatlikHak = bakiyeRow ? Number(bakiyeRow.SaatlikIzinHak) : 0;
  const kullanilan = await mesaiIzinKullanilanToplam(kullaniciId, yil);
  const kullanilanSaat = await mesaiIzinSaatlikKullanilanToplam(kullaniciId, yil);
  const kalanInput = Math.round(Number(kalanIzin) * 10) / 10;
  if (!Number.isFinite(kalanInput)) {
    return { ok: false, message: 'Geçerli bir kalan izin gün sayısı girin.' };
  }
  const eskiKalan = mevcutHak > 0
    ? Math.round((mevcutHak - kullanilan) * 10) / 10
    : null;
  let kalan;
  let yillikHak;
  if (mevcutHak > 0 && eskiKalan != null && Math.abs(kalanInput - eskiKalan) < 0.01) {
    yillikHak = mevcutHak;
    kalan = Math.round((yillikHak - kullanilan) * 10) / 10;
  } else {
    kalan = kalanInput;
    yillikHak = Math.round((kalan + kullanilan) * 10) / 10;
  }
  let saatlikIzinHak = mevcutSaatlikHak;
  let kalanSaatlik = mesaiIzinDakikaToSaat(
    Math.max(0, mesaiIzinSaatToDakika(saatlikIzinHak) - mesaiIzinSaatToDakika(kullanilanSaat))
  );
  if (opts.kalanSaatlikIzin != null && Number.isFinite(Number(opts.kalanSaatlikIzin))) {
    const kalanSaatInput = mesaiIzinDakikaToSaat(mesaiIzinSaatToDakika(opts.kalanSaatlikIzin));
    const eskiKalanSaat = mevcutSaatlikHak > 0
      ? mesaiIzinDakikaToSaat(Math.max(0, mesaiIzinSaatToDakika(mevcutSaatlikHak) - mesaiIzinSaatToDakika(kullanilanSaat)))
      : null;
    if (mevcutSaatlikHak > 0 && eskiKalanSaat != null && Math.abs(kalanSaatInput - eskiKalanSaat) < 0.01) {
      saatlikIzinHak = mevcutSaatlikHak;
      kalanSaatlik = eskiKalanSaat;
    } else {
      kalanSaatlik = kalanSaatInput;
      saatlikIzinHak = mesaiIzinDakikaToSaat(mesaiIzinSaatToDakika(kalanSaatlik) + mesaiIzinSaatToDakika(kullanilanSaat));
    }
  }
  await mesaiDbHazirla();
  const pool = await getPool();
  await pool.request()
    .input('kid', sql.Int, kullaniciId)
    .input('yil', sql.Int, yil)
    .input('hak', sql.Decimal(6, 1), yillikHak)
    .input('saatlik', sql.Decimal(7, 2), saatlikIzinHak)
    .input('notlar', sql.NVarChar(300), (notlar || '').trim().slice(0, 300) || null)
    .input('gid', sql.Int, guncelleyenId || null)
    .query(`
      MERGE dbo.PersonelIzinBakiye AS t
      USING (SELECT @kid AS KullaniciId, @yil AS Yil) AS s
      ON t.KullaniciId = s.KullaniciId AND t.Yil = s.Yil
      WHEN MATCHED THEN
        UPDATE SET YillikHak = @hak, SaatlikIzinHak = @saatlik, Notlar = @notlar,
          GuncelleyenId = @gid, GuncellemeZamani = SYSDATETIME()
      WHEN NOT MATCHED THEN
        INSERT (KullaniciId, Yil, YillikHak, SaatlikIzinHak, Notlar, GuncelleyenId)
        VALUES (@kid, @yil, @hak, @saatlik, @notlar, @gid);
    `);
  return {
    yillikHak,
    kullanilan,
    kalan: Math.round((yillikHak - kullanilan) * 10) / 10,
    saatlikIzinHak,
    saatlikIzinKullanilan: kullanilanSaat,
    kalanSaatlik
  };
}

function mesaiIzinFormAyarlari() {
  const vekalet = (process.env.MESAI_IZIN_VEKALET_AD || 'BAHRİ KARLI').trim();
  return {
    kurumAdi: (process.env.MESAI_IZIN_FORM_KURUM || 'SARAYÖNÜ ZİRAAT ODASI').trim(),
    baslik: (process.env.MESAI_IZIN_FORM_BASLIK || 'YILLIK İZİN TALEP FORMU').trim(),
    baslikSaatlik: (process.env.MESAI_IZIN_FORM_BASLIK_SAATLIK || 'Saatlik İzin Formu').trim(),
    sube: (process.env.MESAI_IZIN_FORM_SUBE || 'İDARİ BİRİM').trim(),
    vekaletAd: vekalet,
    birimAmiri: (process.env.MESAI_IZIN_BIRIM_AMIRI || vekalet).trim(),
    genelSekreter: (process.env.MESAI_IZIN_GENEL_SEKRETER || vekalet).trim(),
    onayAd: (process.env.MESAI_IZIN_ONAY_AD || 'ENGİN ÇELİK').trim(),
    onayUnvan: (process.env.MESAI_IZIN_ONAY_UNVAN || 'YÖN.KUR.BŞK.').trim()
  };
}

async function mesaiIzinBakiyeDetayAl(kullaniciId, yil, opts = {}) {
  const adminGoster = opts.adminGoster !== false;
  await mesaiDbHazirla();
  const pool = await getPool();
  const u = await pool.request()
    .input('kid', sql.Int, kullaniciId)
    .query(`
      SELECT Id,
             LTRIM(RTRIM(ISNULL(Ad,'') + ' ' + ISNULL(Soyad,''))) AS AdSoyad,
             KullaniciAdi,
             LTRIM(RTRIM(ISNULL(CAST(Telefon AS NVARCHAR(30)), ''))) AS Telefon
      FROM dbo.Kullanicilar WHERE Id = @kid
    `);
  if (!u.recordset.length) return null;
  const row = u.recordset[0];
  const adSoyad = (row.AdSoyad || '').trim() || row.KullaniciAdi;
  if (mesaiHaricMi(adSoyad)) return { haric: true, adSoyad };
  const profil = await mesaiIzinProfilGet(kullaniciId);
  const ilkIseGiris = mesaiTarihYilAyGun(profil?.IlkIseGiris) || null;
  const unvanVarsayilan = mesaiIzinVarsayilanUnvan(adSoyad, kullaniciId);
  const unvanKayitli = (profil?.Unvan || '').trim();
  const unvan = mesaiIzinUnvanGoster(unvanKayitli, adSoyad, kullaniciId);
  const profilTel = (profil?.Telefon || '').trim();
  const kullaniciTel = (row.Telefon || '').trim();
  const telefon = profilTel || kullaniciTel;
  const izinAdres = (profil?.IzinAdres || '').trim();
  const yuklemeTarihi = mesaiIzinYuklemeTarihi(ilkIseGiris, yil, adSoyad, kullaniciId);
  const yuklemeHazir = mesaiIzinYuklemeHazirMi(ilkIseGiris, yil, adSoyad, null, kullaniciId);
  const fehimeOzel = mesaiIzinFehimeKirazMi(adSoyad, kullaniciId);
  const kidemYil = fehimeOzel ? null : mesaiIzinKidemYilSayisi(ilkIseGiris, yil, adSoyad, kullaniciId);
  const hesaplananYillikHak = mesaiIzinYillikHakGun(ilkIseGiris, yil, adSoyad, kullaniciId);
  await mesaiIzinGelecekYuklemeHareketTemizle(kullaniciId, yil, adSoyad);
  const yilDevri = await mesaiIzinBakiyeYilDevriEnsured(kullaniciId, yil, null, adSoyad);
  let bakiye = await mesaiIzinBakiyeRowGet(kullaniciId, yil);
  await mesaiIzinSaatlikHakBackfill(kullaniciId, yil, null, adSoyad);
  bakiye = await mesaiIzinBakiyeRowGet(kullaniciId, yil);
  const kullanimlar = await mesaiIzinKullanimlariAl(kullaniciId, yil);
  const kullanilan = kullanimlar
    .filter((x) => x.bakiyedenDus)
    .reduce((s, x) => s + Number(x.gunSayisi || 0), 0);
  const kullanilanR = Math.round(kullanilan * 10) / 10;
  const saatlikIzinKullanilan = mesaiIzinSaatlikToplamHesapla(kullanimlar);
  const bakiyeKayitli = !!bakiye;
  const yillikHak = bakiye ? Number(bakiye.YillikHak) : 0;
  const saatlikIzinHak = bakiye ? Number(bakiye.SaatlikIzinHak) : 0;
  const kalan = Math.round((yillikHak - kullanilanR) * 10) / 10;
  const kalanSaatlik = mesaiIzinDakikaToSaat(
    Math.max(0, mesaiIzinSaatToDakika(saatlikIzinHak) - mesaiIzinSaatToDakika(saatlikIzinKullanilan))
  );
  const saatlikIzinYillikYukleme = mesaiIzinSaatlikYillikSaat();
  const kullanimlarGoster = adminGoster
    ? kullanimlar
    : mesaiIzinKullanimlarPersonelGoster(kullanimlar);
  const detay = {
    kullaniciId,
    yil,
    adSoyad,
    bakiyeKayitli,
    yillikHak,
    kullanilan: kullanilanR,
    kalan,
    kalanSaatlik,
    izinGunSaati: mesaiIzinGunSaat(),
    notlar: (bakiye?.Notlar || '').trim(),
    kullanimlar: kullanimlarGoster,
    ilkIseGiris,
    kidemYil,
    hesaplananYillikHak,
    izinHakKural: mesaiIzinHakKuralMetni(adSoyad, kullaniciId),
    kurumYillikGun: Number(process.env.MESAI_IZIN_YILLIK_GUN || 30),
    fehimeYillikGun: mesaiIzinDanismanYillikGun(),
    fehimeOzel,
    yuklemeTarihi,
    yuklemeTarihiTr: yuklemeTarihi ? mesaiTarihKisaTr(yuklemeTarihi) : null,
    yuklemeBekleniyor: !yuklemeHazir && !!ilkIseGiris,
    yilDevriYapildi: !!yilDevri.yapildi,
    adminDuzenleme: adminGoster,
    telefon,
    unvan,
    unvanKayitli,
    unvanVarsayilan,
    izinAdres,
    formAyarlari: mesaiIzinFormAyarlari(),
    durumSecenekleri: Object.entries(MESAI_DURUM_ETIKET).map(([k, v]) => ({ kod: k, etiket: v })),
    izinSecenekleri: Object.entries(MESAI_IZIN_ETIKET).map(([k, v]) => ({ kod: k, etiket: v })),
    zobisBekleyenSayi: mesaiIzinZobisBekleyenSayi(kullanimlar),
    zobisBekleyenListe: kullanimlar
      .filter((k) => k.kaynak === 'plan' && !mesaiIzinZobisIslendiMi(k.durum))
      .map((k) => ({ id: k.id, ozet: k.ozet, sureMetin: k.sureMetin, izinTuru: k.izinTuru }))
  };
  if (adminGoster) {
    detay.saatlikIzinHak = saatlikIzinHak;
    detay.saatlikIzinKullanilan = saatlikIzinKullanilan;
    detay.saatlikIzinYillikYukleme = saatlikIzinYillikYukleme;
    detay.saatlikIzinToplamSaat = saatlikIzinKullanilan;
  }
  return detay;
}

async function mesaiIzinBakiyePersonelOzetListe(yil) {
  const tumPersonel = await mesaiTakipPersonelAl({ adminDahil: true, whatsappHaric: true });
  const liste = [];
  for (const p of tumPersonel) {
    const d = await mesaiIzinBakiyeDetayAl(p.id, yil);
    if (!d || d.haric) continue;
    liste.push({
      id: p.id,
      adSoyad: d.adSoyad,
      kalan: d.kalan,
      kalanSaatlik: d.kalanSaatlik,
      kullanilan: d.kullanilan,
      yillikHak: d.yillikHak,
      saatlikIzinHak: d.saatlikIzinHak,
      bakiyeKayitli: !!d.bakiyeKayitli,
      zobisBekleyenSayi: d.zobisBekleyenSayi || 0
    });
  }
  return liste.sort((a, b) => a.adSoyad.localeCompare(b.adSoyad, 'tr'));
}

/** Personel kartı — mesai sekmesi: günlük giriş/çıkış + yarım / tam gün izin (tek satır) */
async function mesaiPersonelMesaiGecmisAl(kullaniciId, yil) {
  await mesaiDbHazirla();
  const y = Number(yil) || new Date().getFullYear();
  const aralik = mesaiSistemYilAraligi(y);
  const sistBas = mesaiSistemBaslangicIso();
  if (!aralik) {
    return {
      yil: y,
      satirlar: [],
      performans: null,
      sistemBaslangic: sistBas,
      mesaj: 'Mesai sistemi ' + mesaiTarihKisaTr(sistBas) + ' tarihinden itibaren kullanılmaktadır.'
    };
  }
  const { bas, bit, bitGoster } = aralik;
  const pool = await getPool();

  const logR = await pool.request()
    .input('kid', sql.Int, kullaniciId)
    .input('bas', sql.Date, bas)
    .input('bit', sql.Date, bit)
    .query(`
      SELECT CAST(m.Tarih AS DATE) AS Tarih,
        MIN(CASE WHEN m.Tip = N'giris' THEN CONVERT(VARCHAR(5), m.Zaman, 108) END) AS GirisSaati,
        MAX(CASE WHEN m.Tip = N'cikis' THEN CONVERT(VARCHAR(5), m.Zaman, 108) END) AS CikisSaati
      FROM dbo.PersonelMesaiLog m
      WHERE m.KullaniciId = @kid AND m.Tarih >= @bas AND m.Tarih <= @bit
      GROUP BY CAST(m.Tarih AS DATE)
    `);

  const planR = await pool.request()
    .input('kid', sql.Int, kullaniciId)
    .input('bas', sql.Date, bas)
    .input('bit', sql.Date, bit)
    .query(`
      SELECT Id, IzinTuru, IzinBaslangic, IseDonus, BaslangicSaat, BitisSaat
      FROM dbo.PersonelMesaiIzinPlan
      WHERE KullaniciId = @kid
        AND IzinBaslangic <= @bit
        AND (IseDonus IS NULL OR IseDonus > @bas)
      ORDER BY IzinBaslangic DESC
    `);

  const gunMap = new Map();

  const gunEkle = (tarihIso) => {
    const t = mesaiTarihYilAyGun(tarihIso);
    if (!t) return null;
    if (!gunMap.has(t)) {
      gunMap.set(t, {
        tarih: t,
        giris: null,
        cikis: null,
        yarim: false,
        yarimBas: '',
        yarimBit: '',
        tamGun: false,
        izinTuru: '',
        resmiTatil: '',
        haftaSonu: false,
        bosIsGunu: false
      });
    }
    return gunMap.get(t);
  };

  for (const row of logR.recordset) {
    const tLog = mesaiTarihYilAyGun(row.Tarih);
    if (!tLog || tLog < bas) continue;
    const g = gunEkle(row.Tarih);
    if (!g) continue;
    g.giris = row.GirisSaati ? String(row.GirisSaati).slice(0, 5) : null;
    g.cikis = row.CikisSaati ? String(row.CikisSaati).slice(0, 5) : null;
  }

  for (const plan of planR.recordset) {
    const tur = String(plan.IzinTuru || '').trim();
    const basP = mesaiTarihYilAyGun(plan.IzinBaslangic);
    const donP = mesaiTarihYilAyGun(plan.IseDonus);
    if (!basP) continue;

    if (tur === 'yarim_gun') {
      if (basP < bas) continue;
      const g = gunEkle(basP);
      if (!g) continue;
      g.yarim = true;
      g.yarimBas = plan.BaslangicSaat ? String(plan.BaslangicSaat).slice(0, 5) : '';
      g.yarimBit = plan.BitisSaat ? String(plan.BitisSaat).slice(0, 5) : '';
      g.izinTuru = tur;
      const yDet = await pool.request()
        .input('kid', sql.Int, kullaniciId)
        .input('tarih', sql.Date, basP)
        .input('bitSaat', sql.VarChar(5), g.yarimBit || '12:00')
        .query(`
          SELECT
            (SELECT MIN(CONVERT(VARCHAR(5), m.Zaman, 108))
             FROM dbo.PersonelMesaiLog m
             WHERE m.KullaniciId = @kid AND m.Tarih = @tarih AND m.Tip = N'giris'
               AND CAST(m.Zaman AS TIME) >= CAST(@bitSaat AS TIME)
            ) AS OglenGiris,
            (SELECT MAX(CONVERT(VARCHAR(5), m.Zaman, 108))
             FROM dbo.PersonelMesaiLog m
             WHERE m.KullaniciId = @kid AND m.Tarih = @tarih AND m.Tip = N'cikis'
               AND CAST(m.Zaman AS TIME) >= CAST(@bitSaat AS TIME)
            ) AS OglenCikis
        `);
      const yRow = yDet.recordset[0] || {};
      if (yRow.OglenGiris) g.giris = String(yRow.OglenGiris).slice(0, 5);
      if (yRow.OglenCikis) g.cikis = String(yRow.OglenCikis).slice(0, 5);
      continue;
    }

    if (tur === 'gunluk' || tur === 'uzun_sureli') {
      const donUse = donP || mesaiTarihEkle(basP, 1);
      const gunSay = Math.max(1, mesaiIzinGunSayisi(basP, donUse));
      for (let i = 0; i < gunSay; i++) {
        const t = mesaiTarihEkle(basP, i);
        if (t < bas || t > bit) continue;
        const g = gunEkle(t);
        if (!g) continue;
        g.tamGun = true;
        g.izinTuru = tur;
        g.giris = null;
        g.cikis = null;
      }
    }
  }

  for (let t = bas; t && t <= bitGoster; t = mesaiTarihEkle(t, 1)) {
    const g = gunMap.get(t);
    if (g && mesaiPersonelGunKayitliMi(g)) {
      const tb = mesaiResmiTatilBilgi(t);
      if (tb.tatil) g.resmiTatil = tb.ad;
      continue;
    }
    const tb = mesaiResmiTatilBilgi(t);
    if (tb.tatil) {
      const gn = gunEkle(t);
      gn.resmiTatil = tb.ad;
      gn.haftaSonu = false;
      gn.bosIsGunu = false;
    } else if (mesaiHaftaSonuMu(t)) {
      const gn = gunEkle(t);
      gn.haftaSonu = true;
    } else {
      const gn = gunEkle(t);
      gn.bosIsGunu = true;
    }
  }

  const gunler = Array.from(gunMap.values())
    .filter((g) => g.tarih >= bas)
    .sort((a, b) => b.tarih.localeCompare(a.tarih));
  const satirlar = gunler.map((g) => mesaiPersonelGunSatirOlustur(g));
  const bugunPerf = bugunTarihStr();
  let bitPerfNobet = bitGoster;
  if (bitPerfNobet >= bugunPerf) bitPerfNobet = mesaiTarihEkle(bugunPerf, -1);
  const nobetBit = bitPerfNobet >= bas ? bitPerfNobet : bas;
  const nobetHaftalar = await mesaiNobetHaftaSetAl(kullaniciId, bas, nobetBit);
  const performans = mesaiPersonelPerformansHesapla(gunMap, aralik, nobetHaftalar);

  return {
    yil: y,
    satirlar,
    performans,
    baslangicTarih: bas,
    bitisTarih: bitGoster,
    sistemBaslangic: aralik.sistBas,
    sistemBaslangicTr: mesaiTarihKisaTr(aralik.sistBas),
    dahilBaslangic: aralik.basDahil,
    dahilBaslangicTr: mesaiTarihKisaTr(aralik.basDahil),
    tatilTakvimi: mesaiYilTatilTakvimi(y, bas),
    bayramNotu:
      'Dini bayram günleri .env MESAI_WA_TATILLER ile tanımlanır. Liste ve istatistik '
      + mesaiTarihKisaTr(bas) + ' ve sonrasını gösterir (' + mesaiTarihKisaTr(aralik.sistBas) + ' dahil değil).'
  };
}

function mesaiIzinAralikMetni(izinTuru, izinBaslangic, iseDonus, baslangicSaat, bitisSaat) {
  const basIso = mesaiTarihYilAyGun(izinBaslangic);
  const donIso = mesaiTarihYilAyGun(iseDonus);
  if (izinTuru === 'yarim_gun') {
    const saat = baslangicSaat && bitisSaat ? ` ${baslangicSaat}-${bitisSaat}` : '';
    return `${mesaiTarihKisaTr(basIso)} yarım gün${saat}`;
  }
  if (!donIso || donIso <= basIso) {
    return `${mesaiTarihKisaTr(basIso)} (1 gün)`;
  }
  const n = mesaiIzinGunSayisi(basIso, donIso);
  const sonAbsent = mesaiTarihEkle(donIso, -1);
  if (n <= 1) return `${mesaiTarihKisaTr(basIso)} (1 gün)`;
  return `${mesaiTarihKisaTr(basIso)}-${mesaiTarihKisaTr(sonAbsent)} (${n} gün)`;
}

function mesaiPlanSatirToYoklama(row) {
  const izinBaslangic = row.IzinBaslangic;
  const iseDonus = row.IseDonus;
  return {
    durum: row.Durum || '',
    izinKaynagi: row.IzinKaynagi || '',
    izinTuru: row.IzinTuru || '',
    notlar: (row.Notlar || '').trim(),
    planId: row.Id,
    planAralik: mesaiIzinAralikMetni(
      row.IzinTuru,
      izinBaslangic,
      iseDonus,
      row.BaslangicSaat,
      row.BitisSaat
    ),
    baslangicSaat: row.BaslangicSaat || '',
    bitisSaat: row.BitisSaat || '',
    izinBaslangic,
    iseDonus
  };
}

async function mesaiIzinPlanMapForTarih(tarih) {
  await mesaiDbHazirla();
  const pool = await getPool();
  const r = await pool.request()
    .input('tarih', sql.Date, tarih)
    .query(`
      SELECT p.*
      FROM PersonelMesaiIzinPlan p
      INNER JOIN Kullanicilar u ON u.Id = p.KullaniciId
      WHERE
        (p.IzinTuru = N'yarim_gun' AND p.IzinBaslangic = @tarih)
        OR (
          p.IzinTuru IN (N'gunluk', N'uzun_sureli')
          AND p.IzinBaslangic <= @tarih
          AND p.IseDonus IS NOT NULL
          AND @tarih < p.IseDonus
        )
    `);
  const map = new Map();
  for (const row of r.recordset) {
    const kid = row.KullaniciId;
    const y = mesaiPlanSatirToYoklama(row);
    map.set(kid, y);
  }
  return map;
}

async function mesaiYoklamaEtkinMapAl(tarih) {
  const gunluk = await mesaiYoklamaMapAl(tarih);
  const plan = await mesaiIzinPlanMapForTarih(tarih);
  const merged = new Map();
  const tumId = new Set([...gunluk.keys(), ...plan.keys()]);
  for (const kid of tumId) {
    const p = plan.get(kid) || {};
    const g = gunluk.get(kid) || {};
    const gunlukVar = gunluk.has(kid);
    const birlesik = {
      durum: gunlukVar ? (g.durum || '') : (g.durum || p.durum || ''),
      izinKaynagi: gunlukVar ? (g.izinKaynagi || '') : (g.izinKaynagi || p.izinKaynagi || ''),
      izinTuru: gunlukVar ? (g.izinTuru || '') : (g.izinTuru || p.izinTuru || ''),
      notlar: gunlukVar ? (g.notlar || '') : (g.notlar || p.notlar || ''),
      planId: p.planId || null,
      planAralik: p.planAralik || '',
      baslangicSaat: g.baslangicSaat || p.baslangicSaat || '',
      bitisSaat: g.bitisSaat || p.bitisSaat || ''
    };
    if (!birlesik.planAralik && birlesik.izinTuru === 'yarim_gun' && birlesik.baslangicSaat && birlesik.bitisSaat) {
      birlesik.planAralik = `Yarım gün ${birlesik.baslangicSaat}-${birlesik.bitisSaat}`;
    }
    merged.set(kid, birlesik);
  }
  return merged;
}

async function mesaiIzinPlanGunlukSenkron(kullaniciId, izinTuru, izinBaslangic, iseDonus, veri, guncelleyenId) {
  const yoklamaVeri = {
    durum: veri.durum,
    izinKaynagi: veri.izinKaynagi,
    izinTuru: izinTuru,
    notlar: veri.notlar
  };
  if (izinTuru === 'yarim_gun') {
    await mesaiYoklamaKaydet(kullaniciId, izinBaslangic, yoklamaVeri, guncelleyenId);
    return;
  }
  const gunSay = mesaiIzinGunSayisi(izinBaslangic, iseDonus);
  for (let i = 0; i < gunSay; i++) {
    const t = mesaiTarihEkle(izinBaslangic, i);
    await mesaiYoklamaKaydet(kullaniciId, t, yoklamaVeri, guncelleyenId);
  }
}

/** İzin planında ZOBİS işlendi / bekliyor işaretler; yoklama günlerini senkronlar */
async function mesaiIzinPlanZobisIsaretle(planId, islendi, guncelleyenId) {
  await mesaiDbHazirla();
  const pool = await getPool();
  const r = await pool.request()
    .input('id', sql.Int, planId)
    .query(`
      SELECT KullaniciId, IzinTuru, IzinBaslangic, IseDonus, IzinKaynagi, Notlar
      FROM PersonelMesaiIzinPlan WHERE Id = @id
    `);
  if (!r.recordset.length) return { ok: false, message: 'Plan bulunamadı.' };
  const row = r.recordset[0];
  const durum = islendi ? 'izin_cikardi' : 'izin_cikarmadi';
  const notlar = mesaiNotlarZobisDurumaGore(row.Notlar, durum);
  await pool.request()
    .input('id', sql.Int, planId)
    .input('durum', sql.NVarChar(30), durum)
    .input('notlar', sql.NVarChar(500), notlar || null)
    .input('gid', sql.Int, guncelleyenId || null)
    .query(`
      UPDATE PersonelMesaiIzinPlan
      SET Durum = @durum, Notlar = @notlar, GuncelleyenId = @gid, GuncellemeZamani = SYSDATETIME()
      WHERE Id = @id
    `);
  await mesaiIzinPlanGunlukSenkron(
    row.KullaniciId,
    row.IzinTuru,
    row.IzinBaslangic,
    row.IseDonus,
    { durum, izinKaynagi: row.IzinKaynagi, notlar },
    guncelleyenId
  );
  return { ok: true, kullaniciId: row.KullaniciId, durum, zobisIslendi: islendi };
}

/** Plan satırına bağlı günlük yoklama kayıtlarını siler (plan silinmeden / güncellenmeden önce). */
async function mesaiIzinPlanYoklamaEskiSil(pool, kullaniciId, izinTuru, izinBaslangic, iseDonus) {
  if (izinTuru === 'yarim_gun') {
    await pool.request()
      .input('kid', sql.Int, kullaniciId)
      .input('t', sql.Date, izinBaslangic)
      .query(`DELETE FROM PersonelMesaiYoklama WHERE KullaniciId = @kid AND Tarih = @t`);
  } else if (iseDonus) {
    const gunSay = mesaiIzinGunSayisi(izinBaslangic, iseDonus);
    for (let i = 0; i < gunSay; i++) {
      const t = mesaiTarihEkle(izinBaslangic, i);
      await pool.request()
        .input('kid', sql.Int, kullaniciId)
        .input('t', sql.Date, t)
        .query(`DELETE FROM PersonelMesaiYoklama WHERE KullaniciId = @kid AND Tarih = @t`);
    }
  }
}

async function mesaiIzinPlanKaydet(veri, guncelleyenId) {
  await mesaiDbHazirla();
  const kullaniciId = Number(veri.kullaniciId);
  if (!kullaniciId) return { ok: false, message: 'Personel seçin.' };

  const izinTuru = String(veri.izinTuru || '').trim().toLowerCase();
  const izinBaslangic = String(veri.izinBaslangic || veri.tarih || '').slice(0, 10);
  let iseDonus = String(veri.iseDonus || '').slice(0, 10) || null;
  let durum = String(veri.durum || 'izin_cikarmadi').trim().toLowerCase();
  const izinKaynagi = String(veri.izinKaynagi || '').trim().toLowerCase();
  let notlar = mesaiNotlarZobisDurumaGore(veri.notlar, durum);
  const baslangicSaat = mesaiSaatNorm(veri.baslangicSaat);
  const bitisSaat = mesaiSaatNorm(veri.bitisSaat);

  if (!MESAI_GECERLI_IZIN_TURU.has(izinTuru)) {
    return { ok: false, message: 'İzin türü seçin.' };
  }
  if (!izinBaslangic) return { ok: false, message: 'Tarih girin.' };
  if (durum && !MESAI_GECERLI_DURUM.has(durum)) {
    return { ok: false, message: 'Geçersiz durum.' };
  }
  if (izinKaynagi && !MESAI_GECERLI_IZIN.has(izinKaynagi)) {
    return { ok: false, message: 'Geçersiz izin kaynağı.' };
  }

  if (izinTuru === 'yarim_gun') {
    if (!baslangicSaat || !bitisSaat) {
      return { ok: false, message: 'Yarım gün için saat aralığı girin (ör. 09:00 - 13:00).' };
    }
    iseDonus = mesaiTarihEkle(izinBaslangic, 1);
    const istenenSaat = mesaiIzinSaatFarki(baslangicSaat, bitisSaat);
    const yilPlan = mesaiIzinYilBul(izinBaslangic);
    const saatKontrol = await mesaiIzinSaatlikKalanKontrol(kullaniciId, yilPlan, istenenSaat);
    if (!saatKontrol.ok) return saatKontrol;
  } else {
    if (!iseDonus) {
      return { ok: false, message: 'İşe dönüş tarihini girin.' };
    }
    if (iseDonus <= izinBaslangic) {
      return { ok: false, message: 'İşe dönüş tarihi, izin başlangıcından sonra olmalı.' };
    }
  }

  const pool = await getPool();
  const ins = await pool.request()
    .input('kid', sql.Int, kullaniciId)
    .input('tur', sql.NVarChar(20), izinTuru)
    .input('bas', sql.Date, izinBaslangic)
    .input('don', sql.Date, iseDonus)
    .input('bsaat', sql.VarChar(5), baslangicSaat)
    .input('bsaat2', sql.VarChar(5), bitisSaat)
    .input('durum', sql.NVarChar(30), durum || null)
    .input('izin', sql.NVarChar(40), izinKaynagi || null)
    .input('notlar', sql.NVarChar(500), notlar || null)
    .input('gid', sql.Int, guncelleyenId || null)
    .query(`
      INSERT INTO PersonelMesaiIzinPlan
        (KullaniciId, IzinTuru, IzinBaslangic, IseDonus, BaslangicSaat, BitisSaat, Durum, IzinKaynagi, Notlar, GuncelleyenId)
      OUTPUT INSERTED.Id
      VALUES (@kid, @tur, @bas, @don, @bsaat, @bsaat2, @durum, @izin, @notlar, @gid)
    `);

  const planId = ins.recordset[0]?.Id;
  await mesaiIzinPlanGunlukSenkron(kullaniciId, izinTuru, izinBaslangic, iseDonus, {
    durum,
    izinKaynagi,
    notlar,
    baslangicSaat,
    bitisSaat
  }, guncelleyenId);

  const sonuc = {
    ok: true,
    planId,
    planAralik: mesaiIzinAralikMetni(izinTuru, izinBaslangic, iseDonus, baslangicSaat, bitisSaat),
    gunSayisi: izinTuru === 'yarim_gun'
      ? 0
      : mesaiIzinGunSayisi(izinBaslangic, iseDonus),
    saatSayisi: izinTuru === 'yarim_gun' ? mesaiIzinSaatFarki(baslangicSaat, bitisSaat) : 0
  };
  if (izinTuru === 'yarim_gun') {
    await mesaiIzinPlanSonucSaatlikEkle(sonuc, kullaniciId, izinBaslangic);
  }
  return sonuc;
}

async function mesaiIzinPlanSonucSaatlikEkle(sonuc, kullaniciId, izinBaslangic) {
  const yil = mesaiIzinYilBul(izinBaslangic);
  sonuc.kalanSaatlik = await mesaiIzinKalanSaatlikAl(kullaniciId, yil);
  sonuc.personelNo = kullaniciId;
  const ad = await mesaiIzinKullaniciAdSoyadAl(kullaniciId);
  sonuc.adSoyad = ad;
  const profil = await mesaiIzinProfilGet(kullaniciId);
  const pool = await getPool();
  const u = await pool.request()
    .input('kid', sql.Int, kullaniciId)
    .query(`SELECT LTRIM(RTRIM(ISNULL(CAST(Telefon AS NVARCHAR(30)), ''))) AS Telefon FROM dbo.Kullanicilar WHERE Id = @kid`);
  const kullaniciTel = (u.recordset[0]?.Telefon || '').trim();
  sonuc.telefon = (profil?.Telefon || '').trim() || kullaniciTel;
  sonuc.izinAdres = (profil?.IzinAdres || '').trim();
}

/** Mevcut izin planını günceller (yoklama eski aralık temizlenir, yeni senkron yazılır). */
async function mesaiIzinPlanGuncelle(veri, guncelleyenId) {
  await mesaiDbHazirla();
  const planId = Number(veri.planId || veri.id);
  if (!planId) return { ok: false, message: 'Düzenlenecek plan bulunamadı.' };

  const kullaniciId = Number(veri.kullaniciId);
  if (!kullaniciId) return { ok: false, message: 'Personel seçin.' };

  const izinTuru = String(veri.izinTuru || '').trim().toLowerCase();
  const izinBaslangic = String(veri.izinBaslangic || veri.tarih || '').slice(0, 10);
  let iseDonus = String(veri.iseDonus || '').slice(0, 10) || null;
  const durum = String(veri.durum || 'izin_cikardi').trim().toLowerCase();
  const izinKaynagi = String(veri.izinKaynagi || '').trim().toLowerCase();
  const notlar = mesaiNotlarZobisDurumaGore(veri.notlar, durum);
  const baslangicSaat = mesaiSaatNorm(veri.baslangicSaat);
  const bitisSaat = mesaiSaatNorm(veri.bitisSaat);

  if (!MESAI_GECERLI_IZIN_TURU.has(izinTuru)) {
    return { ok: false, message: 'İzin türü seçin.' };
  }
  if (!izinBaslangic) return { ok: false, message: 'Tarih girin.' };
  if (durum && !MESAI_GECERLI_DURUM.has(durum)) {
    return { ok: false, message: 'Geçersiz durum.' };
  }
  if (izinKaynagi && !MESAI_GECERLI_IZIN.has(izinKaynagi)) {
    return { ok: false, message: 'Geçersiz izin kaynağı.' };
  }

  if (izinTuru === 'yarim_gun') {
    if (!baslangicSaat || !bitisSaat) {
      return { ok: false, message: 'Yarım gün için saat aralığı girin (ör. 09:00 - 13:00).' };
    }
    iseDonus = mesaiTarihEkle(izinBaslangic, 1);
    const istenenSaat = mesaiIzinSaatFarki(baslangicSaat, bitisSaat);
    const yilPlan = mesaiIzinYilBul(izinBaslangic);
    const saatKontrol = await mesaiIzinSaatlikKalanKontrol(kullaniciId, yilPlan, istenenSaat, planId);
    if (!saatKontrol.ok) return saatKontrol;
  } else {
    if (!iseDonus) {
      return { ok: false, message: 'İşe dönüş tarihini girin.' };
    }
    if (iseDonus <= izinBaslangic) {
      return { ok: false, message: 'İşe dönüş tarihi, izin başlangıcından sonra olmalı.' };
    }
  }

  const pool = await getPool();
  const eskiR = await pool.request()
    .input('id', sql.Int, planId)
    .query(`
      SELECT Id, KullaniciId, IzinTuru, IzinBaslangic, IseDonus
      FROM PersonelMesaiIzinPlan WHERE Id = @id
    `);
  if (!eskiR.recordset.length) return { ok: false, message: 'Plan bulunamadı.' };
  const eski = eskiR.recordset[0];
  if (eski.KullaniciId !== kullaniciId) {
    return { ok: false, message: 'Bu plan size ait değil.' };
  }

  await mesaiIzinPlanYoklamaEskiSil(
    pool,
    eski.KullaniciId,
    eski.IzinTuru,
    eski.IzinBaslangic,
    eski.IseDonus
  );

  const upd = await pool.request()
    .input('id', sql.Int, planId)
    .input('kid', sql.Int, kullaniciId)
    .input('tur', sql.NVarChar(20), izinTuru)
    .input('bas', sql.Date, izinBaslangic)
    .input('don', sql.Date, iseDonus)
    .input('bsaat', sql.VarChar(5), baslangicSaat)
    .input('bsaat2', sql.VarChar(5), bitisSaat)
    .input('durum', sql.NVarChar(30), durum || null)
    .input('izin', sql.NVarChar(40), izinKaynagi || null)
    .input('notlar', sql.NVarChar(500), notlar || null)
    .input('gid', sql.Int, guncelleyenId || null)
    .query(`
      UPDATE PersonelMesaiIzinPlan SET
        IzinTuru = @tur,
        IzinBaslangic = @bas,
        IseDonus = @don,
        BaslangicSaat = @bsaat,
        BitisSaat = @bsaat2,
        Durum = @durum,
        IzinKaynagi = @izin,
        Notlar = @notlar,
        GuncelleyenId = @gid,
        GuncellemeZamani = SYSDATETIME()
      WHERE Id = @id AND KullaniciId = @kid
    `);

  const ra = upd.rowsAffected && (upd.rowsAffected[0] ?? upd.rowsAffected);
  if (!ra) return { ok: false, message: 'Güncelleme yapılamadı.' };

  await mesaiIzinPlanGunlukSenkron(kullaniciId, izinTuru, izinBaslangic, iseDonus, {
    durum,
    izinKaynagi,
    notlar,
    baslangicSaat,
    bitisSaat
  }, guncelleyenId);

  const sonuc = {
    ok: true,
    planId,
    planAralik: mesaiIzinAralikMetni(izinTuru, izinBaslangic, iseDonus, baslangicSaat, bitisSaat),
    gunSayisi: izinTuru === 'yarim_gun'
      ? 0
      : mesaiIzinGunSayisi(izinBaslangic, iseDonus),
    saatSayisi: izinTuru === 'yarim_gun' ? mesaiIzinSaatFarki(baslangicSaat, bitisSaat) : 0
  };
  if (izinTuru === 'yarim_gun') {
    await mesaiIzinPlanSonucSaatlikEkle(sonuc, kullaniciId, izinBaslangic);
  }
  return sonuc;
}

async function mesaiIzinPlanListeAl(baslangic, bitis) {
  await mesaiDbHazirla();
  const pool = await getPool();
  const r = await pool.request()
    .input('bas', sql.Date, baslangic)
    .input('bit', sql.Date, bitis)
    .query(`
      SELECT p.Id, p.KullaniciId,
             LTRIM(RTRIM(ISNULL(u.Ad,'') + ' ' + ISNULL(u.Soyad,''))) AS AdSoyad,
             p.IzinTuru, p.IzinBaslangic, p.IseDonus, p.BaslangicSaat, p.BitisSaat,
             p.Durum, p.IzinKaynagi, p.Notlar, p.GuncellemeZamani
      FROM PersonelMesaiIzinPlan p
      INNER JOIN Kullanicilar u ON u.Id = p.KullaniciId
      WHERE p.IzinBaslangic <= @bit
        AND (p.IseDonus IS NULL OR p.IseDonus > @bas)
      ORDER BY p.IzinBaslangic DESC, u.Ad
    `);
  return r.recordset
    .filter((row) => !mesaiHaricMi((row.AdSoyad || '').trim()))
    .map((row) => ({
      id: row.Id,
      kullaniciId: row.KullaniciId,
      adSoyad: (row.AdSoyad || '').trim(),
      izinTuru: row.IzinTuru,
      izinBaslangic: row.IzinBaslangic,
      iseDonus: row.IseDonus,
      baslangicSaat: row.BaslangicSaat,
      bitisSaat: row.BitisSaat,
      durum: row.Durum,
      zobisIslendi: mesaiIzinZobisIslendiMi(row.Durum),
      izinKaynagi: row.IzinKaynagi,
      notlar: row.Notlar,
      ozet: mesaiIzinAralikMetni(
        row.IzinTuru,
        row.IzinBaslangic,
        row.IseDonus,
        row.BaslangicSaat,
        row.BitisSaat
      ),
      gunSayisi: row.IzinTuru === 'yarim_gun'
        ? 0
        : mesaiIzinGunSayisi(row.IzinBaslangic, row.IseDonus),
      saatSayisi: row.IzinTuru === 'yarim_gun'
        ? mesaiIzinSaatFarki(row.BaslangicSaat, row.BitisSaat)
        : 0,
      sureMetin: row.IzinTuru === 'yarim_gun'
        ? (() => {
            const s = mesaiIzinSaatFarki(row.BaslangicSaat, row.BitisSaat);
            return s > 0 ? mesaiIzinSaatSureMetin(s) : '—';
          })()
        : (() => {
            const g = mesaiIzinGunSayisi(row.IzinBaslangic, row.IseDonus);
            return g > 0 ? `${g} gün` : '—';
          })()
    }));
}

async function mesaiYoklamaMapAl(tarih) {
  await mesaiDbHazirla();
  const pool = await getPool();
  const r = await pool.request()
    .input('tarih', sql.Date, tarih)
    .query(`
      SELECT KullaniciId, Durum, IzinKaynagi, IzinTuru, Notlar, GuncellemeZamani
      FROM PersonelMesaiYoklama
      WHERE Tarih = @tarih
    `);
  const map = new Map();
  for (const row of r.recordset) {
    map.set(row.KullaniciId, {
      durum: row.Durum || '',
      izinKaynagi: row.IzinKaynagi || '',
      izinTuru: row.IzinTuru || '',
      notlar: (row.Notlar || '').trim(),
      guncellemeZamani: row.GuncellemeZamani
    });
  }
  return map;
}

function mesaiYoklamaWhatsappEk(yoklama) {
  if (!yoklama) return '';
  const parcalar = [];
  if (yoklama.planAralik) parcalar.push(yoklama.planAralik);
  if (yoklama.durum && MESAI_DURUM_ETIKET[yoklama.durum]) {
    parcalar.push(MESAI_DURUM_ETIKET[yoklama.durum]);
  }
  if (yoklama.izinKaynagi && MESAI_IZIN_ETIKET[yoklama.izinKaynagi]) {
    parcalar.push(MESAI_IZIN_ETIKET[yoklama.izinKaynagi]);
  }
  if (!yoklama.planAralik && yoklama.izinTuru && MESAI_IZIN_TURU_ETIKET[yoklama.izinTuru]) {
    parcalar.push(MESAI_IZIN_TURU_ETIKET[yoklama.izinTuru]);
  }
  if (yoklama.notlar) {
    const d = String(yoklama.durum || '').toLowerCase();
    const n = String(yoklama.notlar).trim();
    const eskiBekleyen = /gelince\s*çıkar|kağıdını\s*gelince/i.test(n);
    if (!(d === 'izin_cikardi' && eskiBekleyen)) parcalar.push(n);
  }
  if (!parcalar.length) return '';
  return ' — _' + parcalar.join(' · ') + '_';
}

function mesaiYoklamaMazeretVarmi(yoklama) {
  return mesaiYoklamaWhatsappEk(yoklama || {}).length > 0;
}

/** Liste ekranı için kısa açıklama (plan + yoklama) */
function mesaiYoklamaListeEtiket(yoklama) {
  const y = yoklama || {};
  if (y.planAralik) return String(y.planAralik).trim();
  const ek = mesaiYoklamaWhatsappEk(y);
  if (!ek) return '';
  return ek.replace(/^ — _/, '').replace(/_$/, '').replace(/_/g, '').trim();
}

/** Yarım gün planı olanlar: izin bitiş saatinden sonraki ilk giriş / son çıkış saatleri */
async function mesaiYarimGunDetayListe(tarih) {
  await mesaiDbHazirla();
  const pool = await getPool();
  const r = await pool.request()
    .input('tarih', sql.Date, tarih)
    .query(`
      SELECT p.KullaniciId,
        LTRIM(RTRIM(ISNULL(u.Ad,'') + ' ' + ISNULL(u.Soyad,''))) AS AdSoyad,
        u.KullaniciAdi,
        p.BaslangicSaat,
        p.BitisSaat,
        (SELECT MIN(CONVERT(VARCHAR(5), m.Zaman, 108))
         FROM dbo.PersonelMesaiLog m
         WHERE m.KullaniciId = p.KullaniciId AND m.Tarih = @tarih AND m.Tip = N'giris'
           AND CAST(m.Zaman AS TIME) >= CAST(p.BitisSaat AS TIME)
        ) AS GirisSaat,
        (SELECT MAX(CONVERT(VARCHAR(5), m.Zaman, 108))
         FROM dbo.PersonelMesaiLog m
         WHERE m.KullaniciId = p.KullaniciId AND m.Tarih = @tarih AND m.Tip = N'cikis'
           AND CAST(m.Zaman AS TIME) >= CAST(p.BitisSaat AS TIME)
        ) AS CikisSaat
      FROM dbo.PersonelMesaiIzinPlan p
      INNER JOIN dbo.Kullanicilar u ON u.Id = p.KullaniciId
      WHERE p.IzinBaslangic = @tarih AND p.IzinTuru = N'yarim_gun'
      ORDER BY AdSoyad, u.KullaniciAdi
    `);
  return r.recordset
    .map((row) => ({
      kullaniciId: row.KullaniciId,
      adSoyad: (row.AdSoyad || '').trim() || row.KullaniciAdi,
      baslangicSaat: row.BaslangicSaat ? String(row.BaslangicSaat).slice(0, 5) : '',
      bitisSaat: row.BitisSaat ? String(row.BitisSaat).slice(0, 5) : '',
      girisSaat: row.GirisSaat || null,
      cikisSaat: row.CikisSaat || null
    }))
    .filter((row) => !mesaiHaricMi(row.adSoyad));
}

async function mesaiYarimGunWhatsappBlok(tarih) {
  const liste = await mesaiYarimGunDetayListe(tarih);
  if (!liste.length) return '';
  const satirlar = [
    `🕐 *Yarım gün izni (${liste.length}):*`,
    `İzin saatleri arasında izinli; *izin bitişinden sonra* mesai giriş / çıkış:`
  ];
  liste.forEach((x, i) => {
    const ar = x.baslangicSaat && x.bitisSaat ? `${x.baslangicSaat}–${x.bitisSaat}` : (x.bitisSaat || '?');
    const g = x.girisSaat || '—';
    const c = x.cikisSaat || '—';
    satirlar.push(`${i + 1}. ${x.adSoyad} (_${ar}_) — öğleden sonra giriş: *${g}* — çıkış: *${c}*`);
  });
  return satirlar.join('\n');
}

function mesaiKisiSatir(p, yoklamaMap, kullaniciId) {
  const ek = mesaiYoklamaWhatsappEk(
    kullaniciId != null ? yoklamaMap.get(kullaniciId) : null
  );
  const saatEk = p.saat ? ` — ${p.saat}` : '';
  return `${p.adSoyad}${saatEk}${ek}`;
}

async function mesaiYoklamaKaydet(kullaniciId, tarih, veri, guncelleyenId) {
  await mesaiDbHazirla();
  const pool = await getPool();
  const durum = String(veri.durum || '').trim().toLowerCase();
  const izinKaynagi = String(veri.izinKaynagi || '').trim().toLowerCase();
  const izinTuru = String(veri.izinTuru || '').trim().toLowerCase();
  const notlar = mesaiNotlarZobisDurumaGore(veri.notlar, durum);

  if (durum && !MESAI_GECERLI_DURUM.has(durum)) {
    return { ok: false, message: 'Geçersiz durum.' };
  }
  if (izinKaynagi && !MESAI_GECERLI_IZIN.has(izinKaynagi)) {
    return { ok: false, message: 'Geçersiz izin kaynağı.' };
  }
  if (izinTuru && !MESAI_GECERLI_IZIN_TURU.has(izinTuru)) {
    return { ok: false, message: 'Geçersiz izin türü.' };
  }

  if (!durum && !izinKaynagi && !izinTuru && !notlar) {
    await pool.request()
      .input('kid', sql.Int, kullaniciId)
      .input('tarih', sql.Date, tarih)
      .query(`DELETE FROM PersonelMesaiYoklama WHERE KullaniciId = @kid AND Tarih = @tarih`);
    return { ok: true, silindi: true };
  }

  await pool.request()
    .input('kid', sql.Int, kullaniciId)
    .input('tarih', sql.Date, tarih)
    .input('durum', sql.NVarChar(30), durum || null)
    .input('izin', sql.NVarChar(40), izinKaynagi || null)
    .input('izinTuru', sql.NVarChar(20), izinTuru || null)
    .input('notlar', sql.NVarChar(500), notlar || null)
    .input('gid', sql.Int, guncelleyenId || null)
    .query(`
      MERGE PersonelMesaiYoklama AS t
      USING (SELECT @kid AS KullaniciId, @tarih AS Tarih) AS s
      ON t.KullaniciId = s.KullaniciId AND t.Tarih = s.Tarih
      WHEN MATCHED THEN
        UPDATE SET Durum = @durum, IzinKaynagi = @izin, IzinTuru = @izinTuru, Notlar = @notlar,
          GuncelleyenId = @gid, GuncellemeZamani = SYSDATETIME()
      WHEN NOT MATCHED THEN
        INSERT (KullaniciId, Tarih, Durum, IzinKaynagi, IzinTuru, Notlar, GuncelleyenId)
        VALUES (@kid, @tarih, @durum, @izin, @izinTuru, @notlar, @gid);
    `);

  await pool.request()
    .input('kid', sql.Int, kullaniciId)
    .input('tarih', sql.Date, tarih)
    .input('durum', sql.NVarChar(30), durum || null)
    .input('notlar', sql.NVarChar(500), notlar || null)
    .input('gid', sql.Int, guncelleyenId || null)
    .query(`
      UPDATE PersonelMesaiIzinPlan SET
        Durum = @durum, Notlar = @notlar, GuncelleyenId = @gid, GuncellemeZamani = SYSDATETIME()
      WHERE KullaniciId = @kid AND (
        (IzinTuru = N'yarim_gun' AND IzinBaslangic = @tarih)
        OR (
          IzinTuru IN (N'gunluk', N'uzun_sureli')
          AND IzinBaslangic <= @tarih AND IseDonus IS NOT NULL AND @tarih < IseDonus
        )
      )
    `);

  return { ok: true };
}

async function mesaiYoklamaPanelAl(tarih) {
  const tarihIso = mesaiTarihYilAyGun(tarih) || bugunTarihStr();
  const sonDurum = await mesaiGunSonDurumAl(tarihIso);
  const yoklamaMap = await mesaiYoklamaEtkinMapAl(tarihIso);
  const tumPersonel = await mesaiTakipPersonelAl({ adminDahil: true, whatsappHaric: true });
  const pool = await getPool();

  const girisR = await pool.request()
    .input('tarih', sql.Date, tarihIso)
    .query(`
      SELECT u.Id,
             LTRIM(RTRIM(ISNULL(u.Ad,'') + ' ' + ISNULL(u.Soyad,''))) AS AdSoyad,
             u.KullaniciAdi,
             CONVERT(VARCHAR(5), MIN(m.Zaman), 108) AS GirisSaati
      FROM dbo.PersonelMesaiLog m
      INNER JOIN dbo.Kullanicilar u ON u.Id = m.KullaniciId
      WHERE CAST(m.Tarih AS DATE) = @tarih AND m.Tip = N'giris'
      GROUP BY u.Id, u.Ad, u.Soyad, u.KullaniciAdi
    `);

  const herhangiR = await pool.request()
    .input('tarih', sql.Date, tarihIso)
    .query(`SELECT DISTINCT KullaniciId FROM dbo.PersonelMesaiLog WHERE CAST(Tarih AS DATE) = @tarih`);

  const girisKayit = new Set(girisR.recordset.map((x) => x.Id));
  const herhangiKayit = new Set(herhangiR.recordset.map((x) => x.KullaniciId));
  const girenMap = new Map();
  for (const row of girisR.recordset) {
    girenMap.set(row.Id, {
      saat: row.GirisSaati,
      adSoyad: (row.AdSoyad || '').trim() || row.KullaniciAdi
    });
  }

  const personelMap = new Map();
  for (const p of tumPersonel) personelMap.set(p.id, { ...p });

  for (const [id, g] of girenMap) {
    if (mesaiHaricMi(g.adSoyad)) continue;
    if (!personelMap.has(id)) {
      personelMap.set(id, { id, adSoyad: g.adSoyad, rol: '' });
    }
  }

  let girenSay = 0;
  let gelmeyenSay = 0;
  let hicVeriSay = 0;

  const personeller = Array.from(personelMap.values())
    .sort((a, b) => a.adSoyad.localeCompare(b.adSoyad, 'tr'))
    .map((p) => {
      let kategori = 'gelmedi';
      if (girisKayit.has(p.id)) {
        kategori = 'girdi';
        girenSay++;
      } else if (!herhangiKayit.has(p.id)) {
        kategori = 'hic_veri';
        hicVeriSay++;
      } else {
        gelmeyenSay++;
      }

      const y = yoklamaMap.get(p.id) || { durum: '', izinKaynagi: '', izinTuru: '', notlar: '', planAralik: '' };
      const giris = girenMap.get(p.id);
      const icte = sonDurum.icteKalanlar.find((x) => x.adSoyad === p.adSoyad);

      return {
        id: p.id,
        adSoyad: p.adSoyad,
        kategori,
        girisSaati: giris?.saat || null,
        sonIslem: icte ? `giriş ${icte.saat}` : (girisKayit.has(p.id) ? 'giriş' : null),
        yoklama: y,
        planliIzin: !!(y.planId || y.planAralik)
      };
    });

  const planBas = mesaiTarihEkle(tarihIso, -14);
  const planBit = mesaiTarihEkle(tarihIso, 60);
  const izinPlanlari = await mesaiIzinPlanListeAl(planBas, planBit);
  const personelListe = tumPersonel.map((p) => ({ id: p.id, adSoyad: p.adSoyad }));

  return {
    tarih: tarihIso,
    etiket: mesaiTrTarihEtiket(tarihIso),
    tatil: mesaiResmiTatilBilgi(tarihIso),
    ozet: {
      giren: girenSay,
      gelmeyen: gelmeyenSay,
      hicVeri: hicVeriSay,
      cikisYapan: sonDurum.cikanlar.length,
      icteKalan: sonDurum.icteKalanlar.length
    },
    personeller,
    personelListe,
    izinPlanlari,
    durumSecenekleri: Object.entries(MESAI_DURUM_ETIKET).map(([k, v]) => ({ kod: k, etiket: v })),
    izinSecenekleri: Object.entries(MESAI_IZIN_ETIKET).map(([k, v]) => ({ kod: k, etiket: v })),
    izinTuruSecenekleri: Object.entries(MESAI_IZIN_TURU_ETIKET).map(([k, v]) => ({ kod: k, etiket: v })),
    formAyarlari: mesaiIzinFormAyarlari()
  };
}

/** Gün içi mesai logları: ilk giriş, son çıkış, son işlem tipi */
async function mesaiTakipMesaiKayitlariAl(tarih) {
  const tarihIso = mesaiTarihYilAyGun(tarih) || bugunTarihStr();
  await mesaiDbHazirla();
  const pool = await getPool();
  const r = await pool.request()
    .input('tarih', sql.Date, tarihIso)
    .query(`
      SELECT u.Id,
        LTRIM(RTRIM(ISNULL(u.Ad,'') + ' ' + ISNULL(u.Soyad,''))) AS AdSoyad,
        u.KullaniciAdi,
        g.GirisSaati,
        c.CikisSaati,
        s.SonTip
      FROM (
        SELECT DISTINCT m.KullaniciId
        FROM dbo.PersonelMesaiLog m
        WHERE CAST(m.Tarih AS DATE) = @tarih
      ) x
      INNER JOIN dbo.Kullanicilar u ON u.Id = x.KullaniciId
      OUTER APPLY (
        SELECT MIN(CONVERT(VARCHAR(5), m.Zaman, 108)) AS GirisSaati
        FROM dbo.PersonelMesaiLog m
        WHERE m.KullaniciId = u.Id AND CAST(m.Tarih AS DATE) = @tarih AND m.Tip = N'giris'
      ) g
      OUTER APPLY (
        SELECT MAX(CONVERT(VARCHAR(5), m.Zaman, 108)) AS CikisSaati
        FROM dbo.PersonelMesaiLog m
        WHERE m.KullaniciId = u.Id AND CAST(m.Tarih AS DATE) = @tarih AND m.Tip = N'cikis'
      ) c
      OUTER APPLY (
        SELECT TOP 1 m.Tip AS SonTip
        FROM dbo.PersonelMesaiLog m
        WHERE m.KullaniciId = u.Id AND CAST(m.Tarih AS DATE) = @tarih
        ORDER BY m.Zaman DESC
      ) s
      ORDER BY AdSoyad, u.KullaniciAdi
    `);

  return r.recordset
    .map((row) => {
      const adSoyad = (row.AdSoyad || '').trim() || row.KullaniciAdi;
      const sonTip = String(row.SonTip || '').toLowerCase();
      let durum = 'kayit';
      if (sonTip === 'cikis') durum = 'cikis';
      else if (row.GirisSaati) durum = 'icte';
      return {
        id: row.Id,
        adSoyad,
        girisSaati: row.GirisSaati || null,
        cikisSaati: row.CikisSaati || null,
        durum
      };
    })
    .filter((row) => !mesaiHaricMi(row.adSoyad));
}

/** Log listesi + yarım gün tablosundaki giriş/çıkışları tek listede birleştirir */
function mesaiKayitlariBirlestir(logListe, yarimListe) {
  const map = new Map();
  const ekle = (id, adSoyad, girisSaati, cikisSaati) => {
    if (!id) return;
    const mevcut = map.get(id) || { id, adSoyad, girisSaati: null, cikisSaati: null, durum: 'kayit' };
    mevcut.adSoyad = adSoyad || mevcut.adSoyad;
    if (girisSaati) mevcut.girisSaati = mevcut.girisSaati
      ? (mevcut.girisSaati < girisSaati ? mevcut.girisSaati : girisSaati)
      : girisSaati;
    if (cikisSaati) mevcut.cikisSaati = mevcut.cikisSaati
      ? (mevcut.cikisSaati > cikisSaati ? mevcut.cikisSaati : cikisSaati)
      : cikisSaati;
    if (mevcut.cikisSaati) mevcut.durum = 'cikis';
    else if (mevcut.girisSaati) mevcut.durum = 'icte';
    map.set(id, mevcut);
  };
  for (const p of logListe || []) {
    ekle(p.id, p.adSoyad, p.girisSaati, p.cikisSaati);
  }
  for (const y of yarimListe || []) {
    if (!y.girisSaat && !y.cikisSaat) continue;
    ekle(y.kullaniciId, y.adSoyad, y.girisSaat, y.cikisSaat);
  }
  return Array.from(map.values()).sort((a, b) =>
    (a.adSoyad || '').localeCompare(b.adSoyad || '', 'tr')
  );
}

/** Tek personel — seçilen gün mesai / izin / yarım gün özeti (personel kartı Bugün sekmesi) */
async function mesaiPersonelGunOzetAl(kullaniciId, tarih, izleyenId) {
  const kid = Number(kullaniciId);
  if (!kid) return { ok: false, message: 'Geçersiz personel.' };
  const tarihIso = mesaiTarihYilAyGun(tarih) || bugunTarihStr();
  const ad = await mesaiIzinKullaniciAdSoyadAl(kid);
  if (mesaiHaricMi(ad)) return { ok: false, message: 'Bu personel mesai takibinden hariç.' };

  const yarimListe = await mesaiYarimGunDetayListe(tarihIso);
  const yarimSatir = yarimListe.find((y) => Number(y.kullaniciId) === kid) || null;
  const logListe = await mesaiTakipMesaiKayitlariAl(tarihIso);
  const logSatir = logListe.find((p) => Number(p.id) === kid) || null;
  const mesaiKayitlari = mesaiKayitlariBirlestir(
    logSatir ? [logSatir] : [],
    yarimSatir
      ? [{
        kullaniciId: yarimSatir.kullaniciId,
        adSoyad: yarimSatir.adSoyad,
        girisSaat: yarimSatir.girisSaat,
        cikisSaat: yarimSatir.cikisSaat
      }]
      : []
  );
  const mesaiKayit = mesaiKayitlari[0] || null;

  const yMap = await mesaiYoklamaEtkinMapAl(tarihIso);
  const y = yMap.get(kid) || {};
  const yoklamaAciklama = mesaiYoklamaListeEtiket(y);
  const mazeret = mesaiYoklamaMazeretVarmi(y) || !!(y.planAralik || y.durum || y.izinTuru);
  let kategori = 'bekliyor';
  if (mesaiKayit) kategori = 'mesai';
  else if (mazeret) kategori = 'izinli';

  const planBas = mesaiTarihEkle(tarihIso, -90);
  const planBit = mesaiTarihEkle(tarihIso, 120);
  const tumPlan = await mesaiIzinPlanListeAl(planBas, planBit);
  const gunPlanlari = tumPlan.filter((p) => {
    if (Number(p.kullaniciId) !== kid) return false;
    const bas = mesaiTarihYilAyGun(p.izinBaslangic);
    if (!bas) return false;
    if (p.izinTuru === 'yarim_gun') return bas === tarihIso;
    const don = mesaiTarihYilAyGun(p.iseDonus);
    return bas <= tarihIso && (!don || don > tarihIso);
  });

  const tatil = mesaiResmiTatilBilgi(tarihIso);
  const etiket = mesaiTrTarihEtiket(tarihIso);
  const kendiKarti = Number(izleyenId) === kid;
  const zobisGunBekliyor = String(y.durum || '').toLowerCase() === 'izin_cikarmadi';
  const zobisPlanBekleyen = gunPlanlari.filter((p) => !mesaiIzinZobisIslendiMi(p.durum)).length;

  return {
    ok: true,
    kullaniciId: kid,
    adSoyad: ad,
    tarih: tarihIso,
    etiket,
    tatil,
    kategori,
    mesaiKayit,
    yoklama: {
      durum: y.durum || '',
      durumEtiket: MESAI_DURUM_ETIKET[y.durum] || '',
      izinKaynagi: y.izinKaynagi || '',
      izinTuru: y.izinTuru || '',
      planAralik: y.planAralik || '',
      aciklama: yoklamaAciklama,
      notlar: (y.notlar || '').trim()
    },
    yarimGun: yarimSatir,
    gunPlanlari,
    zobisGunBekliyor: kendiKarti && zobisGunBekliyor,
    zobisPlanBekleyen: kendiKarti ? zobisPlanBekleyen : 0,
    zobisBekliyor: kendiKarti && (zobisGunBekliyor || zobisPlanBekleyen > 0)
  };
}

/** Herkese açık mesai özeti + giriş yapanın kendi izin planları */
async function mesaiTakipOzetAl(tarih, benimId) {
  const tarihIso = mesaiTarihYilAyGun(tarih) || bugunTarihStr();
  const panel = await mesaiYoklamaPanelAl(tarihIso);
  const yMap = await mesaiYoklamaEtkinMapAl(tarihIso);
  const yarim = await mesaiYarimGunDetayListe(tarihIso);
  const logKayitlari = await mesaiTakipMesaiKayitlariAl(tarihIso);
  const mesaiKayitlari = mesaiKayitlariBirlestir(logKayitlari, yarim);
  const mesaiIdSet = new Set(mesaiKayitlari.map((p) => p.id));
  const tumPersonel = await mesaiTakipPersonelAl({ adminDahil: true, whatsappHaric: true });
  const planBas = mesaiTarihEkle(tarihIso, -90);
  const planBit = mesaiTarihEkle(tarihIso, 120);
  const tumPlan = benimId ? await mesaiIzinPlanListeAl(planBas, planBit) : [];
  const benimPlan = benimId ? tumPlan.filter((p) => p.kullaniciId === benimId) : [];

  const izinliler = [];
  const bekleyenler = [];
  for (const p of tumPersonel) {
    if (mesaiIdSet.has(p.id)) continue;
    const y = yMap.get(p.id) || {};
    const planli = !!(y.planAralik || y.durum || y.izinTuru);
    if (mesaiYoklamaMazeretVarmi(y) || planli) {
      izinliler.push({
        id: p.id,
        adSoyad: p.adSoyad,
        kategori: 'izinli',
        aciklama: mesaiYoklamaListeEtiket(y)
      });
    } else {
      bekleyenler.push({ id: p.id, adSoyad: p.adSoyad, kategori: 'bekliyor' });
    }
  }

  const ozet = {
    giren: mesaiKayitlari.filter((p) => p.girisSaati).length,
    gelmeyen: bekleyenler.length,
    hicVeri: tumPersonel.filter((p) => !mesaiIdSet.has(p.id) && !yMap.get(p.id)).length,
    cikisYapan: mesaiKayitlari.filter((p) => p.durum === 'cikis').length,
    icteKalan: mesaiKayitlari.filter((p) => p.durum === 'icte').length,
    mesaiKayit: mesaiKayitlari.length
  };

  return {
    tarih: panel.tarih,
    etiket: panel.etiket,
    tatil: panel.tatil,
    ozet,
    mesaiKayitlari,
    gelenler: mesaiKayitlari.filter((p) => p.girisSaati).map((p) => ({
      id: p.id,
      adSoyad: p.adSoyad,
      girisSaati: p.girisSaati,
      cikisSaati: p.cikisSaati,
      durum: p.durum
    })),
    cikanlar: mesaiKayitlari.filter((p) => p.durum === 'cikis').map((p) => ({
      id: p.id,
      adSoyad: p.adSoyad,
      girisSaati: p.girisSaati,
      cikisSaati: p.cikisSaati
    })),
    icteKalanlar: mesaiKayitlari.filter((p) => p.durum === 'icte').map((p) => ({
      id: p.id,
      adSoyad: p.adSoyad,
      girisSaati: p.girisSaati
    })),
    izinliler,
    bekleyenler,
    yarimGunler: yarim,
    benimIzinPlanlari: benimPlan,
    benimZobisBekleyenPlanSayi: benimPlan.filter((p) => !mesaiIzinZobisIslendiMi(p.durum)).length,
    benimZobisBekliyor: benimId
      ? (
        String((yMap.get(benimId) || {}).durum || '').toLowerCase() === 'izin_cikarmadi' ||
        benimPlan.some((p) => !mesaiIzinZobisIslendiMi(p.durum))
      )
      : false,
    durumSecenekleri: panel.durumSecenekleri,
    izinSecenekleri: panel.izinSecenekleri,
    izinTuruSecenekleri: panel.izinTuruSecenekleri
  };
}

async function mesaiRaporMetni(tarih, tur) {
  const tatil = mesaiResmiTatilBilgi(tarih);
  if (tatil.tatil) {
    return { metin: mesaiTatilRaporMetni(tarih, tatil.ad), ozet: { tatil: true }, tur: 'tatil' };
  }

  const etiket = mesaiTrTarihEtiket(tarih);
  const saat = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' });
  const yoklamaMap = await mesaiYoklamaEtkinMapAl(tarih);
  const tumPersonel = await mesaiTakipPersonelAl({ adminDahil: true, whatsappHaric: true });
  const adToId = new Map(tumPersonel.map((p) => [p.adSoyad, p.id]));

  if (tur === 'cikis') {
    const ozet = await mesaiGunSonDurumAl(tarih);
    const satirlar = [
      '📋 *Personel çıkış özeti*',
      `📅 ${etiket}`,
      `🕔 Rapor saati: ${saat}`,
      ''
    ];
    if (ozet.cikanlar.length) {
      satirlar.push(`✅ *Çıkış yapanlar (${ozet.cikanlar.length}):*`);
      ozet.cikanlar.forEach((p, i) => {
        satirlar.push(`${i + 1}. ${p.adSoyad} — ${p.saat}`);
      });
    } else {
      satirlar.push('✅ *Çıkış yapan:* Henüz kayıt yok.');
    }
    satirlar.push('');
    if (ozet.icteKalanlar.length) {
      satirlar.push(`⚠️ *Giriş var, çıkış yok (${ozet.icteKalanlar.length}):*`);
      ozet.icteKalanlar.forEach((p, i) => {
        const kid = adToId.get(p.adSoyad);
        satirlar.push(`${i + 1}. ${mesaiKisiSatir({ adSoyad: p.adSoyad, saat: `giriş ${p.saat}` }, yoklamaMap, kid)}`);
      });
    } else {
      satirlar.push('⚠️ Giriş yapıp çıkış yapmayan personel yok.');
    }
    satirlar.push('');
    if (ozet.veriGirmeyenler && ozet.veriGirmeyenler.length) {
      satirlar.push(`❌ *Hiç veri girmeyen (${ozet.veriGirmeyenler.length}) — başkan hariç:*`);
      ozet.veriGirmeyenler.forEach((p, i) => {
        const kid = p.id || adToId.get(p.adSoyad);
        satirlar.push(`${i + 1}. ${mesaiKisiSatir(p, yoklamaMap, kid)}`);
      });
    } else {
      satirlar.push('❌ Hiç veri girmeyen personel yok.');
    }
    const yarimWaCikis = await mesaiYarimGunWhatsappBlok(tarih);
    if (yarimWaCikis) {
      satirlar.push('');
      satirlar.push(yarimWaCikis);
    }
    satirlar.push('', '_Sarayönü Ziraat Odası_');
    return { metin: satirlar.join('\n'), ozet, tur: 'cikis' };
  }

  const ozet = await mesaiGunlukOzetAl(tarih);
  const satirlar = [
    '📋 *Personel giriş özeti*',
    `📅 ${etiket}`,
    `🕙 Rapor saati: ${saat}`,
    ''
  ];

  if (ozet.girenler.length) {
    satirlar.push(`✅ *Giriş yapanlar (${ozet.girenler.length}):*`);
    ozet.girenler.forEach((p, i) => {
      satirlar.push(`${i + 1}. ${p.adSoyad} — ${p.saat}`);
    });
  } else {
    satirlar.push('✅ *Giriş yapan:* Henüz kayıt yok.');
  }

  const yarimWaGiris = await mesaiYarimGunWhatsappBlok(tarih);
  if (yarimWaGiris) {
    satirlar.push('');
    satirlar.push(yarimWaGiris);
  }

  satirlar.push('');
  if (ozet.gelmeyenler.length) {
    const gelmeyenIzinli = [];
    const gelmeyenMazersiz = [];
    for (const p of ozet.gelmeyenler) {
      const y = yoklamaMap.get(p.id);
      if (mesaiYoklamaMazeretVarmi(y)) gelmeyenIzinli.push(p);
      else gelmeyenMazersiz.push(p);
    }
    if (gelmeyenIzinli.length) {
      satirlar.push(`📌 *İzinliler (${gelmeyenIzinli.length}):*`);
      gelmeyenIzinli.forEach((p, i) => {
        satirlar.push(`${i + 1}. ${mesaiKisiSatir(p, yoklamaMap, p.id)}`);
      });
      satirlar.push('');
    }
    if (gelmeyenMazersiz.length) {
      satirlar.push(`⏳ *Henüz giriş yok (${gelmeyenMazersiz.length}):*`);
      gelmeyenMazersiz.forEach((p, i) => {
        satirlar.push(`${i + 1}. ${p.adSoyad}`);
      });
    }
  } else {
    satirlar.push('⏳ Eksik giriş yok.');
  }

  satirlar.push('');
  const hicVeriFarkli = (ozet.veriGirmeyenler || []).filter(
    (p) => !ozet.gelmeyenler.some((g) => g.id === p.id)
  );
  if (hicVeriFarkli.length) {
    satirlar.push(`❌ *Kayıt var, giriş yok (${hicVeriFarkli.length}):*`);
    hicVeriFarkli.forEach((p, i) => {
      satirlar.push(`${i + 1}. ${mesaiKisiSatir(p, yoklamaMap, p.id)}`);
    });
  }

  satirlar.push('', '_Sarayönü Ziraat Odası_');
  return { metin: satirlar.join('\n'), ozet, tur: 'giris' };
}

/** ZOBİS'ten izin çıkmadı kaydı olan personel (bugünkü plan / yoklama) */
async function mesaiZobisIzinCikmadiPersonelListesi() {
  await mesaiDbHazirla();
  const tarih = bugunTarihStr();
  const etiket = mesaiTrTarihEtiket(tarih);
  const yMap = await mesaiYoklamaEtkinMapAl(tarih);
  const pool = await getPool();

  let kullanicilar;
  try {
    kullanicilar = await pool.request().query(`
      SELECT u.Id,
             u.KullaniciAdi,
             ISNULL(u.Ad, '') AS Ad,
             ISNULL(u.Soyad, '') AS Soyad,
             LTRIM(RTRIM(ISNULL(CAST(u.Telefon AS NVARCHAR(30)), ''))) AS Telefon
      FROM Kullanicilar u
      WHERE LTRIM(RTRIM(ISNULL(u.Ad, '') + ' ' + ISNULL(u.Soyad, ''))) <> ''
    `);
  } catch (telErr) {
    console.warn('[ZOBİS Hatırlatma] Telefon sütunu okunamadı, telefonsuz devam:', telErr.message);
    kullanicilar = await pool.request().query(`
      SELECT u.Id,
             u.KullaniciAdi,
             ISNULL(u.Ad, '') AS Ad,
             ISNULL(u.Soyad, '') AS Soyad,
             N'' AS Telefon
      FROM Kullanicilar u
      WHERE LTRIM(RTRIM(ISNULL(u.Ad, '') + ' ' + ISNULL(u.Soyad, ''))) <> ''
    `);
  }

  const liste = [];
  for (const row of kullanicilar.recordset) {
    const adSoyad = `${row.Ad || ''} ${row.Soyad || ''}`.trim() || row.KullaniciAdi;
    if (mesaiHaricMi(adSoyad)) continue;
    const y = yMap.get(row.Id);
    if (!y || String(y.durum || '').toLowerCase().trim() !== 'izin_cikarmadi') continue;
    liste.push({
      id: row.Id,
      adSoyad,
      telefon: (row.Telefon || '').trim(),
      planAralik: y.planAralik || '',
      tarihEtiket: etiket
    });
  }
  return liste;
}

async function mesaiZobisSistemGonderenId() {
  const pool = await getPool();
  const r = await pool.request().query(`
    SELECT TOP 1 Id FROM Kullanicilar
    WHERE LOWER(LTRIM(ISNULL(rol, 'user'))) = 'admin'
    ORDER BY Id
  `);
  if (r.recordset.length) return r.recordset[0].Id;
  const r2 = await pool.request().query(`SELECT TOP 1 Id FROM Kullanicilar ORDER BY Id`);
  return r2.recordset[0]?.Id || null;
}

function mesaiZobisHatirlatmaMetni(p) {
  const satirlar = [
    '⚠️ *ZOBİS izin hatırlatması*',
    '',
    `Sayın ${p.adSoyad},`,
    '',
    `${p.tarihEtiket || 'Bugün'} için kayıtlı izninizde *ZOBİS'ten izin çıkarılmamış* görünüyor.`,
    'Lütfen ZOBİS üzerinden izin işleminizi tamamlayın.'
  ];
  if (p.planAralik) satirlar.push('', `İzin: _${p.planAralik}_`);
  satirlar.push('', '_Sarayönü Ziraat Odası_');
  return satirlar.join('\n');
}

/** WhatsApp (telefon) + uygulama içi Mesajlar — 2 saatte bir cron */
async function mesaiZobisHatirlatmaGonder() {
  const tatil = mesaiResmiTatilBilgi(bugunTarihStr());
  if (tatil.tatil) {
    console.log('[ZOBİS Hatırlatma] Resmi tatil — atlandı.');
    return { ok: true, atlandi: 'tatil', adet: 0 };
  }

  const personeller = await mesaiZobisIzinCikmadiPersonelListesi();
  if (!personeller.length) {
    console.log('[ZOBİS Hatırlatma] ZOBİS’ten izin çıkmayan personel yok.');
    return { ok: true, adet: 0 };
  }

  const gonderenId = await mesaiZobisSistemGonderenId();
  const pool = await getPool();
  let waOk = 0;
  let waYok = 0;
  let mesajOk = 0;

  if (mesaiWa.waAktifMi()) mesaiWa.ensureMesaiWhatsApp();

  for (const p of personeller) {
    const metin = mesaiZobisHatirlatmaMetni(p);

    if (p.telefon && mesaiWa.waAktifMi()) {
      const waSonuc = await mesaiWa.mesaiWhatsAppGonder(metin, [p.telefon]);
      if (waSonuc.success) waOk++;
      else {
        waYok++;
        console.warn(`[ZOBİS Hatırlatma] WA ${p.adSoyad}:`, waSonuc.message);
      }
    } else if (!p.telefon) {
      waYok++;
    }

    if (gonderenId && p.id !== gonderenId) {
      try {
        await pool.request()
          .input('gonderen', sql.Int, gonderenId)
          .input('alici', sql.Int, p.id)
          .input('mesaj', sql.NVarChar, metin.replace(/\*/g, '').replace(/_/g, ''))
          .query(`
            INSERT INTO Mesajlar (GonderenId, AliciId, Mesaj, Tarih, OkunmaDurumu)
            VALUES (@gonderen, @alici, @mesaj, GETDATE(), 0)
          `);
        mesajOk++;
      } catch (err) {
        console.warn(`[ZOBİS Hatırlatma] Mesajlar ${p.adSoyad}:`, err.message);
      }
    }
  }

  console.log(
    `[ZOBİS Hatırlatma] ${personeller.length} personel — WA: ${waOk} ok, ${waYok} atlandı/hata; uygulama mesajı: ${mesajOk}`
  );
  return { ok: true, adet: personeller.length, waOk, waYok, mesajOk };
}

async function mesaiGunlukRaporMetni(tarih) {
  return mesaiRaporMetni(tarih, 'giris');
}

async function mesaiWhatsAppRaporGonder(tur) {
  const tip = tur === 'cikis' ? 'cikis' : 'giris';
  const tarih = bugunTarihStr();
  try {
    const rapor = await mesaiRaporMetni(tarih, tip);
    const sonuc = await mesaiWa.mesaiWhatsAppGonder(rapor.metin);
    if (sonuc.success) {
      if (rapor.tur === 'tatil') {
        console.log(`[Mesai WA] Resmi tatil bildirimi gönderildi (${tarih}).`);
      } else {
        console.log(`[Mesai WA] ${tip === 'cikis' ? 'Çıkış' : 'Giriş'} raporu gönderildi (${tarih}).`);
      }
    } else {
      console.warn('[Mesai WA] Rapor gönderilemedi:', sonuc.message);
    }
    return sonuc;
  } catch (err) {
    console.error('[Mesai WA] Rapor hatası:', err);
    return { success: false, message: err.message };
  }
}

app.get('/api/mesai/whatsapp-durum', authenticateToken, sadeceAdmin, (req, res) => {
  mesaiWa.ensureMesaiWhatsApp();
  res.json({ success: true, ...mesaiWa.mesaiWhatsAppDurum() });
});

app.post('/api/mesai/whatsapp-test', authenticateToken, sadeceAdmin, async (req, res) => {
  try {
    mesaiWa.ensureMesaiWhatsApp();
    const tur = String(req.body?.tur || req.query?.tur || 'giris').toLowerCase();
    const sonuc = await mesaiWhatsAppRaporGonder(tur === 'cikis' ? 'cikis' : 'giris');
    res.json(sonuc);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get('/api/mesai/yoklama-panel', authenticateToken, sadeceAdmin, async (req, res) => {
  try {
    const tarih = req.query.tarih || bugunTarihStr();
    const panel = await mesaiYoklamaPanelAl(tarih);
    res.json({ success: true, ...panel });
  } catch (err) {
    console.error('/api/mesai/yoklama-panel:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get('/api/mesai/personel-gun-ozet/:kullaniciId', authenticateToken, async (req, res) => {
  try {
    const kid = Number(req.params.kullaniciId);
    const isAdmin = String(req.user.rol || '').toLowerCase().trim() === 'admin';
    if (!isAdmin && kid !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Yalnızca kendi günlük özetinizi görüntüleyebilirsiniz.' });
    }
    const tarih = mesaiTarihYilAyGun(req.query.tarih) || bugunTarihStr();
    const data = await mesaiPersonelGunOzetAl(kid, tarih, req.user.id);
    if (!data.ok) return res.json({ success: false, message: data.message });
    res.json({ success: true, ...data });
  } catch (err) {
    console.error('/api/mesai/personel-gun-ozet:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get('/api/mesai/takip-ozet', authenticateToken, async (req, res) => {
  try {
    const tarih = mesaiTarihYilAyGun(req.query.tarih) || bugunTarihStr();
    const adSoyad = `${req.user.ad || ''} ${req.user.soyad || ''}`.trim() || req.user.kullaniciadi || '';
    const data = await mesaiTakipOzetAl(tarih, req.user.id);
    res.json({ success: true, izinKaydiAcik: !mesaiHaricMi(adSoyad), ...data });
  } catch (err) {
    console.error('/api/mesai/takip-ozet:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/mesai/izin-plan-self', authenticateToken, async (req, res) => {
  try {
    const adSoyad = `${req.user.ad || ''} ${req.user.soyad || ''}`.trim() || req.user.kullaniciadi || '';
    if (mesaiHaricMi(adSoyad)) {
      return res.json({ success: false, message: 'Bu ekran sizin hesabınız için kullanılamıyor.' });
    }
    const body = { ...(req.body || {}), kullaniciId: req.user.id };
    const sonuc = await mesaiIzinPlanKaydet(body, req.user.id);
    if (!sonuc.ok) return res.json({ success: false, message: sonuc.message });
    res.json({ success: true, ...sonuc });
  } catch (err) {
    console.error('/api/mesai/izin-plan-self:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/** İzin planında ZOBİS işlendi işareti (personel kendi planı; admin tüm planlar) */
app.post('/api/mesai/izin-plan/:id/zobis', authenticateToken, async (req, res) => {
  try {
    const planId = Number(req.params.id);
    if (!planId) return res.json({ success: false, message: 'Geçersiz plan.' });
    const islendi = req.body?.islendi !== false && req.body?.islendi !== 0 && req.body?.islendi !== '0';
    await mesaiDbHazirla();
    const pool = await getPool();
    const r = await pool.request()
      .input('id', sql.Int, planId)
      .query(`SELECT KullaniciId FROM PersonelMesaiIzinPlan WHERE Id = @id`);
    if (!r.recordset.length) return res.json({ success: false, message: 'Plan bulunamadı.' });
    const kid = r.recordset[0].KullaniciId;
    const isAdmin = String(req.user.rol || '').toLowerCase().trim() === 'admin';
    if (!isAdmin && kid !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Bu planı güncelleyemezsiniz.' });
    }
    const sonuc = await mesaiIzinPlanZobisIsaretle(planId, islendi, req.user.id);
    if (!sonuc.ok) return res.json(sonuc);
    res.json({
      success: true,
      message: islendi ? 'ZOBİS\'te işlendi olarak kaydedildi.' : 'ZOBİS bekliyor olarak işaretlendi.',
      ...sonuc
    });
  } catch (err) {
    console.error('/api/mesai/izin-plan zobis:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/** Personel: bugünkü kaydı "ZOBİS'ten izin çıkardı" yapar, eski "gelince çıkaracak" notunu temizler */
app.post('/api/mesai/zobis-cikardi-bugun', authenticateToken, async (req, res) => {
  try {
    const adSoyad = `${req.user.ad || ''} ${req.user.soyad || ''}`.trim() || req.user.kullaniciadi || '';
    if (mesaiHaricMi(adSoyad)) {
      return res.json({ success: false, message: 'Bu işlem hesabınız için kullanılamıyor.' });
    }
    const tarih = String(req.body?.tarih || req.query?.tarih || bugunTarihStr()).slice(0, 10);
    const yMap = await mesaiYoklamaEtkinMapAl(tarih);
    const y = yMap.get(req.user.id) || {};
    const sonuc = await mesaiYoklamaKaydet(req.user.id, tarih, {
      durum: 'izin_cikardi',
      izinKaynagi: y.izinKaynagi || '',
      izinTuru: y.izinTuru || '',
      notlar: ''
    }, req.user.id);
    if (!sonuc.ok) return res.json({ success: false, message: sonuc.message });
    res.json({
      success: true,
      message: 'ZOBİS\'ten izin çıkardı olarak kaydedildi. 2 saatlik hatırlatma mesajları durur.'
    });
  } catch (err) {
    console.error('/api/mesai/zobis-cikardi-bugun:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

app.put('/api/mesai/izin-plan-self/:id', authenticateToken, async (req, res) => {
  try {
    const adSoyad = `${req.user.ad || ''} ${req.user.soyad || ''}`.trim() || req.user.kullaniciadi || '';
    if (mesaiHaricMi(adSoyad)) {
      return res.json({ success: false, message: 'Bu ekran sizin hesabınız için kullanılamıyor.' });
    }
    const planId = Number(req.params.id);
    if (!planId) return res.json({ success: false, message: 'Geçersiz plan.' });
    const body = { ...(req.body || {}), kullaniciId: req.user.id, planId };
    const sonuc = await mesaiIzinPlanGuncelle(body, req.user.id);
    if (!sonuc.ok) return res.json({ success: false, message: sonuc.message });
    res.json({ success: true, ...sonuc });
  } catch (err) {
    console.error('/api/mesai/izin-plan-self güncelle:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

app.delete('/api/mesai/izin-plan-self/:id', authenticateToken, async (req, res) => {
  try {
    const adSoyad = `${req.user.ad || ''} ${req.user.soyad || ''}`.trim() || req.user.kullaniciadi || '';
    if (mesaiHaricMi(adSoyad)) {
      return res.json({ success: false, message: 'Bu ekran sizin hesabınız için kullanılamıyor.' });
    }
    const planId = Number(req.params.id);
    if (!planId) return res.json({ success: false, message: 'Geçersiz plan.' });
    await mesaiDbHazirla();
    const pool = await getPool();
    const r = await pool.request()
      .input('id', sql.Int, planId)
      .query(`SELECT KullaniciId, IzinTuru, IzinBaslangic, IseDonus FROM PersonelMesaiIzinPlan WHERE Id = @id`);
    if (!r.recordset.length) return res.json({ success: false, message: 'Plan bulunamadı.' });
    const row = r.recordset[0];
    if (row.KullaniciId !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Bu planı silemezsiniz.' });
    }
    await mesaiIzinPlanYoklamaEskiSil(pool, row.KullaniciId, row.IzinTuru, row.IzinBaslangic, row.IseDonus);
    await pool.request().input('id', sql.Int, planId).query(`DELETE FROM PersonelMesaiIzinPlan WHERE Id = @id`);
    res.json({ success: true });
  } catch (err) {
    console.error('/api/mesai/izin-plan-self sil:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/mesai/yoklama-kaydet', authenticateToken, sadeceAdmin, async (req, res) => {
  try {
    const { kullaniciId, tarih, durum, izinKaynagi, izinTuru, notlar } = req.body || {};
    const kid = Number(kullaniciId);
    if (!kid) return res.json({ success: false, message: 'Personel seçilmedi.' });
    const t = tarih || bugunTarihStr();
    const sonuc = await mesaiYoklamaKaydet(kid, t, { durum, izinKaynagi, izinTuru, notlar }, req.user.id);
    if (!sonuc.ok) return res.json({ success: false, message: sonuc.message });
    res.json({ success: true, silindi: !!sonuc.silindi });
  } catch (err) {
    console.error('/api/mesai/yoklama-kaydet:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/mesai/izin-plan-kaydet', authenticateToken, sadeceAdmin, async (req, res) => {
  try {
    const sonuc = await mesaiIzinPlanKaydet(req.body || {}, req.user.id);
    if (!sonuc.ok) return res.json({ success: false, message: sonuc.message });
    res.json({ success: true, ...sonuc });
  } catch (err) {
    console.error('/api/mesai/izin-plan-kaydet:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

app.delete('/api/mesai/izin-plan/:id', authenticateToken, sadeceAdmin, async (req, res) => {
  try {
    const sifre = req.body?.sifre;
    if (!(await mesaiKullaniciSifreDogrula(req.user.id, sifre))) {
      return res.json({ success: false, message: 'Hatalı şifre. İzin silinmedi.' });
    }
    const planId = Number(req.params.id);
    if (!planId) return res.json({ success: false, message: 'Geçersiz plan.' });
    await mesaiDbHazirla();
    const pool = await getPool();
    const r = await pool.request()
      .input('id', sql.Int, planId)
      .query(`SELECT KullaniciId, IzinTuru, IzinBaslangic, IseDonus FROM PersonelMesaiIzinPlan WHERE Id = @id`);
    if (!r.recordset.length) return res.json({ success: false, message: 'Plan bulunamadı.' });
    const row = r.recordset[0];
    await mesaiIzinPlanYoklamaEskiSil(pool, row.KullaniciId, row.IzinTuru, row.IzinBaslangic, row.IseDonus);
    await pool.request().input('id', sql.Int, planId).query(`DELETE FROM PersonelMesaiIzinPlan WHERE Id = @id`);
    const yil = mesaiIzinYilBul(row.IzinBaslangic);
    const detay = await mesaiIzinBakiyeDetayAl(row.KullaniciId, yil, { adminGoster: true });
    res.json({
      success: true,
      message: 'İzin silindi; bakiye güncellendi.',
      kullaniciId: row.KullaniciId,
      yil,
      kalan: detay.kalan,
      kalanSaatlik: detay.kalanSaatlik
    });
  } catch (err) {
    console.error('/api/mesai/izin-plan sil:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get('/api/mesai/izin-bakiye-liste', authenticateToken, sadeceAdmin, async (req, res) => {
  try {
    const yil = Number(req.query.yil) || mesaiIzinYilBul(req.query.tarih);
    const liste = await mesaiIzinBakiyePersonelOzetListe(yil);
    res.json({ success: true, yil, liste });
  } catch (err) {
    console.error('/api/mesai/izin-bakiye-liste:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get('/api/mesai/nobet', authenticateToken, sadeceAdmin, async (req, res) => {
  try {
    const yil = Number(req.query.yil) || new Date().getFullYear();
    const ay = Number(req.query.ay) || (new Date().getMonth() + 1);
    const data = await mesaiNobetAyListeAl(yil, ay);
    res.json({ success: true, ...data });
  } catch (err) {
    console.error('/api/mesai/nobet:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

app.put('/api/mesai/nobet', authenticateToken, sadeceAdmin, async (req, res) => {
  try {
    const data = await mesaiNobetKaydet(req.body || {}, req.user?.id);
    res.json({ success: true, message: 'Nöbet kaydedildi.', ...data });
  } catch (err) {
    console.error('/api/mesai/nobet PUT:', err);
    res.status(400).json({ success: false, message: err.message });
  }
});

app.delete('/api/mesai/nobet', authenticateToken, sadeceAdmin, async (req, res) => {
  try {
    const hafta = req.query.haftaBaslangic || req.query.hafta || req.body?.haftaBaslangic || req.body?.hafta;
    await mesaiNobetSil(hafta);
    res.json({ success: true, message: 'Nöbet kaydı silindi.' });
  } catch (err) {
    console.error('/api/mesai/nobet DELETE:', err);
    res.status(400).json({ success: false, message: err.message });
  }
});

app.get('/api/mesai/nobet/whatsapp-onizle', authenticateToken, sadeceAdmin, async (req, res) => {
  try {
    const yil = Number(req.query.yil) || new Date().getFullYear();
    const ay = Number(req.query.ay) || (new Date().getMonth() + 1);
    const veri = await mesaiNobetAyListeAl(yil, ay);
    res.json({
      success: true,
      metin: mesaiNobetListeMetni(veri),
      waDurum: mesaiWa.mesaiWhatsAppDurum(),
      telefonluPersonel: (await mesaiPersonelTelefonluListeAl()).length
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/mesai/nobet/whatsapp-gonder', authenticateToken, sadeceAdmin, async (req, res) => {
  try {
    const yil = Number(req.body?.yil || req.query?.yil) || new Date().getFullYear();
    const ay = Number(req.body?.ay || req.query?.ay) || (new Date().getMonth() + 1);
    const sonuc = await mesaiNobetWhatsappGonder(yil, ay);
    res.json({ success: sonuc.ok, ...sonuc });
  } catch (err) {
    console.error('/api/mesai/nobet/whatsapp-gonder:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get('/api/mesai/personel-mesai-gecmis/:kullaniciId', authenticateToken, async (req, res) => {
  try {
    const kid = Number(req.params.kullaniciId);
    if (!kid) return res.json({ success: false, message: 'Geçersiz personel.' });
    const isAdmin = String(req.user.rol || '').toLowerCase().trim() === 'admin';
    if (!isAdmin && kid !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Yalnızca kendi mesai geçmişinizi görüntüleyebilirsiniz.' });
    }
    const yil = Number(req.query.yil) || mesaiIzinYilBul(req.query.tarih);
    const data = await mesaiPersonelMesaiGecmisAl(kid, yil);
    res.json({ success: true, ...data });
  } catch (err) {
    console.error('/api/mesai/personel-mesai-gecmis:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get('/api/mesai/izin-bakiye/:kullaniciId', authenticateToken, async (req, res) => {
  try {
    const kid = Number(req.params.kullaniciId);
    if (!kid) return res.json({ success: false, message: 'Geçersiz personel.' });
    const isAdmin = String(req.user.rol || '').toLowerCase().trim() === 'admin';
    if (!isAdmin && kid !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Yalnızca kendi izin kartınızı görüntüleyebilirsiniz.' });
    }
    const yil = Number(req.query.yil) || mesaiIzinYilBul(req.query.tarih);
    const detay = await mesaiIzinBakiyeDetayAl(kid, yil, { adminGoster: isAdmin });
    if (!detay) return res.json({ success: false, message: 'Personel bulunamadı.' });
    if (detay.haric) return res.json({ success: false, message: 'Bu personel izin takibinden hariç.' });
    res.json({ success: true, ...detay });
  } catch (err) {
    console.error('/api/mesai/izin-bakiye:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

app.put('/api/mesai/izin-profil', authenticateToken, sadeceAdmin, async (req, res) => {
  try {
    const kid = Number(req.body?.kullaniciId);
    if (!kid) return res.json({ success: false, message: 'Personel seçilmedi.' });
    const sonuc = await mesaiIzinProfilMerge(
      kid,
      {
        unvan: req.body?.unvan,
        telefon: req.body?.telefon,
        izinAdres: req.body?.izinAdres
      },
      req.user.id
    );
    const yil = Number(req.body?.yil) || mesaiIzinYilBul();
    const detay = await mesaiIzinBakiyeDetayAl(kid, yil);
    res.json({ success: true, profil: sonuc, detay });
  } catch (err) {
    console.error('/api/mesai/izin-profil:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

app.put('/api/mesai/izin-bakiye', authenticateToken, sadeceAdmin, async (req, res) => {
  try {
    const kid = Number(req.body?.kullaniciId);
    const yil = Number(req.body?.yil) || mesaiIzinYilBul();
    const kalanIzin = Number(req.body?.kalanIzin);
    if (!kid) return res.json({ success: false, message: 'Personel seçilmedi.' });
    if (!Number.isFinite(kalanIzin)) {
      return res.json({ success: false, message: 'Geçerli bir kalan izin gün sayısı girin.' });
    }
    if (req.body?.ilkIseGiris !== undefined) {
      await mesaiIzinProfilKaydet(kid, req.body.ilkIseGiris || null, req.user.id);
    }
    const adPut = await mesaiIzinKullaniciAdSoyadAl(kid);
    await mesaiIzinBakiyeYilDevriEnsured(kid, yil, req.user.id, adPut);
    const kaydetOpts = {};
    if (req.body?.kalanSaatlikIzin != null && req.body.kalanSaatlikIzin !== '') {
      const ks = Number(req.body.kalanSaatlikIzin);
      if (!Number.isFinite(ks) || ks < 0) {
        return res.json({ success: false, message: 'Geçerli bir kalan saatlik izin girin.' });
      }
      kaydetOpts.kalanSaatlikIzin = ks;
    }
    const sonuc = await mesaiIzinBakiyeKaydet(
      kid,
      yil,
      kalanIzin,
      req.body?.notlar,
      req.user.id,
      kaydetOpts
    );
    const detay = await mesaiIzinBakiyeDetayAl(kid, yil);
    res.json({ success: true, ...sonuc, detay });
  } catch (err) {
    console.error('/api/mesai/izin-bakiye kaydet:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get('/api/mesai/gunluk-ozet', authenticateToken, sadeceAdmin, async (req, res) => {
  try {
    const tarih = req.query.tarih || bugunTarihStr();
    const tur = String(req.query.tur || 'giris').toLowerCase();
    const rapor = await mesaiRaporMetni(tarih, tur === 'cikis' ? 'cikis' : 'giris');
    res.json({ success: true, tarih, ...rapor });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/mesai/zobis-hatirlatma-test', authenticateToken, sadeceAdmin, async (req, res) => {
  try {
    const sonuc = await mesaiZobisHatirlatmaGonder();
    res.json({ success: true, ...sonuc });
  } catch (err) {
    console.error('/api/mesai/zobis-hatirlatma-test:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Hafta içi: 10:00 giriş, 17:10 çıkış özeti
const mesaiWaCronGiris = process.env.MESAI_WA_CRON || '0 10 * * 1-5';
const mesaiWaCronCikis = process.env.MESAI_WA_CRON_CIKIS || '10 17 * * 1-5';
if (!CKSPAKET_MOD && mesaiWa.waAktifMi()) {
  cron.schedule(mesaiWaCronGiris, () => {
    mesaiWhatsAppRaporGonder('giris');
  }, { timezone: 'Europe/Istanbul' });
  cron.schedule(mesaiWaCronCikis, () => {
    mesaiWhatsAppRaporGonder('cikis');
  }, { timezone: 'Europe/Istanbul' });
  console.log(`[Mesai WA] Giriş raporu: ${mesaiWaCronGiris} (Europe/Istanbul)`);
  console.log(`[Mesai WA] Çıkış raporu: ${mesaiWaCronCikis} (Europe/Istanbul)`);
  mesaiWa.initMesaiWhatsApp();
}

// ZOBİS'ten izin çıkmayan personele hatırlatma (varsayılan: her 2 saat)
const zobisHatirlatmaCron = process.env.ZOBIS_HATIRLATMA_CRON || '0 */2 * * *';
const zobisHatirlatmaAktif = String(process.env.ZOBIS_HATIRLATMA_AKTIF || 'true').trim().toLowerCase() !== 'false';
if (!CKSPAKET_MOD && zobisHatirlatmaAktif) {
  cron.schedule(zobisHatirlatmaCron, () => {
    mesaiZobisHatirlatmaGonder().catch((err) => {
      console.error('[ZOBİS Hatırlatma] Cron hatası:', err);
    });
  }, { timezone: 'Europe/Istanbul' });
  console.log(`[ZOBİS Hatırlatma] Aktif — ${zobisHatirlatmaCron} (Europe/Istanbul)`);
}

const http = require('http');
const net = require('net');
const os = require('os');
const { fork } = require('child_process');
const PORT = Number(process.env.PORT) || 3030;
const SELEKTOR_MOBIL_PORT = Number(process.env.SELEKTOR_MOBIL_PORT) || 4000;
let selektorMobilChild = null;

/** 3000 yalnizca ofis LAN (192.168.1.x) — VPN/dis arayuzlerine baglanmaz */
function lanBindHostBul() {
  const tercih = String(process.env.CKS_BIND_HOST || process.env.CKS_SUNUCU_IP || '').trim();
  const ipv4ler = [];
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const a of addrs) {
      if (a.family === 'IPv4' && !a.internal) ipv4ler.push(a.address);
    }
  }
  if (tercih && tercih !== '0.0.0.0' && ipv4ler.includes(tercih)) return tercih;
  if (tercih && tercih !== '0.0.0.0') {
    console.warn(`[Ag] CKS_BIND_HOST=${tercih} bu makinede yok — otomatik LAN IP kullanilacak`);
  }
  const lan = ipv4ler.find((ip) => ip.startsWith('192.168.1.'));
  if (lan) return lan;
  const ozel = ipv4ler.find((ip) => ip.startsWith('192.168.') || ip.startsWith('10.'));
  if (ozel) return ozel;
  return '127.0.0.1';
}

function portKullaniliyorMu(port) {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once('error', () => resolve(true));
    probe.once('listening', () => probe.close(() => resolve(false)));
    probe.listen(port, '0.0.0.0');
  });
}

function selektorMobilKapat() {
  if (selektorMobilChild && !selektorMobilChild.killed) {
    try { selektorMobilChild.kill('SIGTERM'); } catch (_) {}
    selektorMobilChild = null;
  }
}

function portDinleyenPid(port) {
  try {
    const { execSync } = require('child_process');
    const out = execSync(`netstat -ano | findstr :${port} | findstr LISTENING`, { encoding: 'utf8', windowsHide: true });
    const satir = out.trim().split(/\r?\n/).find((l) => l.includes('LISTENING'));
    if (!satir) return null;
    const pid = Number(satir.trim().split(/\s+/).pop());
    return Number.isFinite(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

async function selektorMobilPortTemizle() {
  selektorMobilKapat();
  await new Promise((r) => setTimeout(r, 400));
  const pid = portDinleyenPid(SELEKTOR_MOBIL_PORT);
  if (!pid) return;
  try {
    process.kill(pid, 'SIGTERM');
    await new Promise((r) => setTimeout(r, 600));
  } catch (_) {}
  const kalan = portDinleyenPid(SELEKTOR_MOBIL_PORT);
  if (kalan) {
    try {
      const { execSync } = require('child_process');
      execSync(`taskkill /PID ${kalan} /F`, { windowsHide: true });
      await new Promise((r) => setTimeout(r, 400));
    } catch (_) {}
  }
}

async function selektorMobilBaslat() {
  const script = path.join(__dirname, 'selektor_mobil_server.js');
  if (!fs.existsSync(script)) {
    console.warn('[Selektor Mobil] selektor_mobil_server.js bulunamadı — atlanıyor');
    return;
  }
  await selektorMobilPortTemizle();
  if (await portKullaniliyorMu(SELEKTOR_MOBIL_PORT)) {
    console.warn(`[Selektor Mobil] Port ${SELEKTOR_MOBIL_PORT} hâlâ dolu — atlanıyor`);
    return;
  }
  const selektorBind = lanBindHostBul();
  selektorMobilChild = fork(script, [], {
    cwd: __dirname,
    env: {
      ...process.env,
      SELEKTOR_MOBIL_PORT: String(SELEKTOR_MOBIL_PORT),
      SELEKTOR_BIND_HOST: selektorBind,
      SELEKTOR_IZINLI_AG: process.env.SELEKTOR_IZINLI_AG || '192.168.1.0/24,127.0.0.1,::1',
      SELEKTOR_AG_KONTROL: process.env.SELEKTOR_AG_KONTROL || '1',
      MESAI_BASE_URL: `http://127.0.0.1:${PORT}`,
      MARKET_BASE_URL: process.env.MARKET_BASE_URL || 'http://127.0.0.1:3001'
    },
    stdio: 'inherit'
  });
  selektorMobilChild.on('exit', (code, signal) => {
    selektorMobilChild = null;
    if (code && code !== 0 && signal !== 'SIGTERM') {
      console.warn(`[Selektor Mobil] süreç sonlandı (kod: ${code})`);
    }
  });
}

process.on('SIGINT', () => { selektorMobilKapat(); process.exit(0); });
process.on('SIGTERM', () => { selektorMobilKapat(); process.exit(0); });
process.on('exit', selektorMobilKapat);

(async () => {
  if (await portKullaniliyorMu(PORT)) {
    console.error(`\n❌ Port ${PORT} zaten kullanımda — ikinci kez başlatmayın.`);
    console.error('   1) Açık olan eski "node server.js" penceresini kapatın (Ctrl+C)');
    console.error('   2) veya: cks-sunucu-baslat.bat çalıştırın\n');
    process.exit(1);
  }

  const lanHost = lanBindHostBul();
  let sunucuHazir = false;

  const sunucuHazirLog = async () => {
    if (sunucuHazir) return;
    sunucuHazir = true;
    console.log(`\nSunucu çalışıyor → http://127.0.0.1:${PORT}  (PID: ${process.pid})`);
    if (lanHost !== '127.0.0.1') {
      console.log(`Yerel ag (ofis) → http://${lanHost}:${PORT}`);
      console.log('Dis erisim KAPALI (port 3000)');
    } else {
      console.warn('[Ag] LAN IP bulunamadi — sunucu yalnizca bu bilgisayardan erisilebilir');
    }
    if (CKSPAKET_MOD) {
      console.log('[CKS Paket] Mesai / Selektör / Market modülleri kapalı.\n');
      return;
    }
    const wa = mesaiWa.mesaiWhatsAppDurum();
    
    await selektorMobilBaslat();
    console.log(`Selektor mobil → http://${lanHost}:${SELEKTOR_MOBIL_PORT}  (yalnizca tesis WiFi)`);
    console.log(`[Mesai WA] .env aktif=${String(process.env.MESAI_WA_AKTIF || '').trim()} | servis=${wa.aktif} | QR=${wa.qrHazir ? 'hazır' : 'bekleniyor'}`);
    console.log('Mesai WhatsApp API: /api/mesai/whatsapp-durum, /api/mesai/whatsapp-test');
    console.log('Mesai yoklama: http://127.0.0.1:' + PORT + '/mesai-yoklama.html');
    console.log('QR ekranı: http://127.0.0.1:' + PORT + '/mesai-kart.html\n');
  };

  const dinle = (host) => new Promise((resolve, reject) => {
    const srv = http.createServer(app);
    srv.on('error', reject);
    srv.listen(PORT, host, () => resolve(srv));
  });

  try {
    await dinle(lanHost);
    if (lanHost !== '127.0.0.1') {
      await dinle('127.0.0.1');
    }
    await sunucuHazirLog();
  } catch (err) {
    console.error('\n❌ Sunucu hatası:', err.message);
    process.exit(1);
  }
})();