/**
 * Tarama havuzu PDF algılama API (senkron sonrası korunur)
 */
const fs = require('fs');
const path = require('path');
const { pdfDosyaAlgila, sadeceRakam } = require('./pdf-tc-algila');
const { sistemAyarBirlestir, taramaHavuzYol, VARSAYILAN } = require('./sistem-ayar');

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

function havuzPdfKullaniciyaAit(dosyaAdi, user) {
  if (!/\.pdf$/i.test(dosyaAdi)) return false;
  const dosya = trKucukMetin(dosyaAdi);
  return kullaniciTaramaOnEkleri(user).some((onEk) => dosya.startsWith(trKucukMetin(onEk)));
}

async function havuzYolAl(getPool) {
  try {
    const pool = await getPool();
    const r = await pool.request().query(`
      SELECT TOP 1 teknik_json FROM ayarlar WHERE teknik_json IS NOT NULL ORDER BY id DESC`);
    if (r.recordset.length && r.recordset[0].teknik_json) {
      return taramaHavuzYol(sistemAyarBirlestir(JSON.parse(r.recordset[0].teknik_json)));
    }
  } catch (_) {}
  return taramaHavuzYol(sistemAyarBirlestir(VARSAYILAN));
}

function registerPdfHavuzAlgila(app, opts) {
  const { CKSPAKET_MOD, authenticateToken, getPool, sql } = opts;
  if (!CKSPAKET_MOD || !app) return;

  app.get('/api/tarama-havuz-algila/:dosya', authenticateToken, async (req, res) => {
    try {
      const guvenli = path.basename(decodeURIComponent(req.params.dosya || ''));
      if (!guvenli || !havuzPdfKullaniciyaAit(guvenli, req.user)) {
        return res.status(403).json({ success: false, message: 'Bu dosyaya erişim yok.' });
      }

      const havuz = await havuzYolAl(getPool);
      const fp = path.join(havuz, guvenli);
      if (!fs.existsSync(fp)) {
        return res.status(404).json({ success: false, message: 'Dosya bulunamadı.' });
      }

      const { algilama, ocrKullanildi, metinKatmanVar } = await pdfDosyaAlgila(fp, guvenli);
      let kimlik = null;
      let adSoyad = (algilama.adSoyad || '').trim();
      let tc = algilama.tc || null;
      let vergino = algilama.vergino || null;
      let guven = algilama.guven;

      if (algilama.algilandi) {
        const pool = await getPool();
        if (tc) {
          const r = await pool.request()
            .input('tc', sql.NVarChar(20), tc)
            .query(`SELECT TOP 1 kimlik, [Adı Soyadı] AS adSoyad, [Tc Kimlik No] AS tc
                    FROM [çksdilekçe] WHERE LTRIM(RTRIM([Tc Kimlik No])) = @tc`);
          if (r.recordset.length) {
            kimlik = r.recordset[0].kimlik;
            adSoyad = r.recordset[0].adSoyad || adSoyad;
            tc = r.recordset[0].tc || tc;
            guven = 'yuksek';
          }
        } else if (vergino) {
          const v = sadeceRakam(vergino);
          const r = await pool.request()
            .input('v', sql.NVarChar(20), v)
            .query(`SELECT TOP 1 kimlik, [Adı Soyadı] AS adSoyad, vergino
                    FROM [çksdilekçe] WHERE LTRIM(RTRIM(vergino)) = @v`);
          if (r.recordset.length) {
            kimlik = r.recordset[0].kimlik;
            adSoyad = r.recordset[0].adSoyad || adSoyad;
            guven = 'yuksek';
          }
        }
      }

      let mesaj = '';
      if (!algilama.algilandi) {
        mesaj = ocrKullanildi
          ? 'OCR ile metin okundu ancak TC / isim bulunamadı. Manuel ekleyin.'
          : (metinKatmanVar
            ? 'PDF metninde TC / isim bulunamadı.'
            : 'Taranmış görüntü — OCR denendi, sonuç yok. Manuel ekleyin veya dosya adına TC yazın.');
      } else if (!kimlik) {
        mesaj = 'Kayıt bulunamadı — manuel seçim yapın.';
      }

      return res.json({
        success: true,
        algilandi: algilama.algilandi,
        tc,
        vergino,
        adSoyad,
        kimlik,
        kaynak: algilama.kaynak,
        guven,
        ocrKullanildi,
        metinVar: metinKatmanVar,
        mesaj
      });
    } catch (err) {
      console.error('tarama-havuz-algila:', err.message);
      return res.status(500).json({ success: false, message: err.message });
    }
  });
}

module.exports = { registerPdfHavuzAlgila };
