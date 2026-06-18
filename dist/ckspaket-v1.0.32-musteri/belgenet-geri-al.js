/**
 * Belgenet tarama kaydını geri al — PDF ortak havuza, tarama adıyla yeniden adlandır
 */
const fs = require('fs');
const path = require('path');
const { taramaHavuzYol, taramaYilKlasorYol, sistemAyarBirlestir, VARSAYILAN } = require('./sistem-ayar');

function trKucukMetin(s) {
  try { return String(s).toLocaleLowerCase('tr-TR'); } catch (_) { return String(s).toLowerCase(); }
}

function kullaniciTaramaOnEkleri(user) {
  const ozel = String(user?.taramaOnEk || user?.TaramaOnEk || '').trim();
  if (ozel) {
    return [...new Set(ozel.split(/[,;]/).map((s) => s.trim()).filter(Boolean))];
  }
  return [...new Set(
    [user?.kullaniciadi, user?.ad, user?.KullaniciAdi, user?.Ad]
      .map((s) => String(s || '').trim())
      .filter(Boolean)
  )];
}

function havuzBenzersizDosyaAdi(havuzYol, tabanAd) {
  const temiz = String(tabanAd || 'tarama').replace(/\.pdf$/i, '').trim() || 'tarama';
  const ilk = `${temiz}.pdf`;
  if (!fs.existsSync(path.join(havuzYol, ilk))) return ilk;
  for (let n = 2; n < 1000; n++) {
    const ad = `${temiz}${n}.pdf`;
    if (!fs.existsSync(path.join(havuzYol, ad))) return ad;
  }
  return `${temiz}_${Date.now()}.pdf`;
}

async function sistemAyarOku(getPool) {
  try {
    const pool = await getPool();
    const r = await pool.request().query(`
      SELECT TOP 1 teknik_json FROM ayarlar WHERE teknik_json IS NOT NULL ORDER BY id DESC`);
    if (r.recordset.length && r.recordset[0].teknik_json) {
      return sistemAyarBirlestir(JSON.parse(r.recordset[0].teknik_json));
    }
  } catch (_) {}
  return sistemAyarBirlestir(VARSAYILAN);
}

function registerBelgenetGeriAl(app, opts) {
  const { CKSPAKET_MOD, authenticateToken, getPool, sql } = opts;
  if (!CKSPAKET_MOD || !app) return;

  app.post('/api/belgenet-geri-al', authenticateToken, async (req, res) => {
    try {
      const { dosyaadi, dosyadı, yil, kimlikid, kimlik } = req.body || {};
      const gelenDosya = String(dosyaadi || dosyadı || '').replace(/\.pdf$/i, '').trim();
      const kid = parseInt(kimlikid || kimlik, 10);
      const yilHam = String(yil || '').trim();
      let yilNum = parseInt(yilHam, 10);
      if (!yilNum || yilHam === '-' || yilHam === 'undefined') {
        yilNum = new Date().getFullYear();
      }

      if (!gelenDosya) {
        return res.json({ success: false, message: 'Dosya adı belirtilmedi.' });
      }
      if (!kid) {
        return res.json({ success: false, message: 'Çiftçi kimlik no eksik.' });
      }

      const pool = await getPool();
      const kayit = await pool.request()
        .input('dosya', sql.NVarChar(260), gelenDosya)
        .input('kid', sql.Int, kid)
        .input('yil', sql.SmallInt, yilNum)
        .query(`
          SELECT TOP 1 [dosyadı] AS dosyadi
          FROM belgenet
          WHERE kimlikid = @kid AND yil = @yil
            AND (LTRIM(RTRIM([dosyadı])) = @dosya OR LTRIM(RTRIM([dosyadı])) = @dosya + '.pdf')
        `);

      if (!kayit.recordset.length) {
        return res.json({ success: false, message: 'Tabloda ilgili tarama kaydı bulunamadı.' });
      }

      const sa = await sistemAyarOku(getPool);
      const arsivKlasor = taramaYilKlasorYol(sa, yilNum);
      const havuz = taramaHavuzYol(sa);
      const arsivYol = path.join(arsivKlasor, `${gelenDosya}.pdf`);

      if (!fs.existsSync(arsivYol)) {
        return res.json({
          success: false,
          message: `PDF arşivde bulunamadı: ${arsivYol}`
        });
      }

      const onEkler = kullaniciTaramaOnEkleri(req.user);
      const tabanAd = onEkler[0] || req.user?.kullaniciadi || 'tarama';
      if (!fs.existsSync(havuz)) fs.mkdirSync(havuz, { recursive: true });

      const yeniAd = havuzBenzersizDosyaAdi(havuz, tabanAd);
      const havuzYol = path.join(havuz, yeniAd);

      try {
        fs.renameSync(arsivYol, havuzYol);
      } catch (moveErr) {
        return res.json({
          success: false,
          message: `PDF havuza taşınamadı: ${moveErr.message}`
        });
      }

      await pool.request()
        .input('dosya', sql.NVarChar(260), gelenDosya)
        .input('kid', sql.Int, kid)
        .input('yil', sql.SmallInt, yilNum)
        .query(`
          DELETE FROM belgenet
          WHERE kimlikid = @kid AND yil = @yil
            AND (LTRIM(RTRIM([dosyadı])) = @dosya OR LTRIM(RTRIM([dosyadı])) = @dosya + '.pdf')
        `);

      return res.json({
        success: true,
        message: `Ortak havuza geri alındı: ${yeniAd}`,
        havuzDosya: yeniAd,
        havuzYol: havuz,
        taramaAdi: tabanAd
      });
    } catch (err) {
      console.error('belgenet-geri-al:', err.message);
      return res.status(500).json({ success: false, message: err.message });
    }
  });
}

module.exports = { registerBelgenetGeriAl, havuzBenzersizDosyaAdi };
