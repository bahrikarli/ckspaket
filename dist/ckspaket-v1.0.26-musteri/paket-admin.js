/**
 * CKS Paket — admin kullanıcı yönetimi API
 */
const crypto = require('crypto');

function geciciSifreOlustur() {
  const harf = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz';
  const rakam = '23456789';
  let s = '';
  for (let i = 0; i < 4; i++) s += harf[crypto.randomInt(harf.length)];
  for (let i = 0; i < 4; i++) s += rakam[crypto.randomInt(rakam.length)];
  return s.split('').sort(() => crypto.randomInt(3) - 1).join('');
}

function registerPaketAdmin(app, opts) {
  const { CKSPAKET_MOD, authenticateToken, sadeceAdmin, sql, getPool } = opts;
  if (!CKSPAKET_MOD) return;

  app.post('/api/yenikullanici', authenticateToken, sadeceAdmin, async (req, res) => {
    try {
      const ka = String(req.body.ka || req.body.kullaniciadi || '').trim();
      const ad = String(req.body.ad || '').trim();
      const soyad = String(req.body.soyad || '').trim();
      const email = String(req.body.email || '').trim();
      const taramaOnEk = String(req.body.taramaOnEk || req.body.tarama_on_ek || '').trim();
      let rol = String(req.body.rol || 'user').toLowerCase().trim();
      if (!['admin', 'user'].includes(rol)) rol = 'user';

      if (!ka) {
        return res.status(400).json({ success: false, message: 'Kullanıcı adı zorunludur.' });
      }

      let sifre = String(req.body.sifre || '').trim();
      const otomatik = !sifre;
      if (otomatik) sifre = geciciSifreOlustur();

      const pool = await getPool();
      const varMi = await pool.request()
        .input('ka', sql.NVarChar(50), ka)
        .query(`SELECT Id FROM Kullanicilar WHERE KullaniciAdi = @ka`);
      if (varMi.recordset.length) {
        return res.status(409).json({ success: false, message: 'Bu kullanıcı adı zaten kayıtlı.' });
      }

      await pool.request()
        .input('ka', sql.NVarChar(50), ka)
        .input('sifre', sql.NVarChar(255), sifre)
        .input('ad', sql.NVarChar(50), ad || null)
        .input('soyad', sql.NVarChar(50), soyad || null)
        .input('email', sql.NVarChar(100), email || null)
        .input('rol', sql.NVarChar(20), rol)
        .input('taramaOnEk', sql.NVarChar(100), taramaOnEk || null)
        .query(`
          INSERT INTO Kullanicilar (KullaniciAdi, sifre, Ad, Soyad, Email, rol, TaramaOnEk)
          VALUES (@ka, @sifre, @ad, @soyad, @email, @rol, @taramaOnEk)
        `);

      res.json({
        success: true,
        message: otomatik ? 'Kullanıcı oluşturuldu. Geçici şifreyi personele verin.' : 'Kullanıcı oluşturuldu.',
        kullaniciadi: ka,
        geciciSifre: otomatik ? sifre : undefined
      });
    } catch (err) {
      console.error('/api/yenikullanici:', err.message);
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.put('/api/kullanici/:id', authenticateToken, sadeceAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (!id) return res.status(400).json({ success: false, message: 'Geçersiz kullanıcı.' });

      const { ad, soyad, email, rol, sifre, taramaOnEk, tarama_on_ek } = req.body || {};
      const pool = await getPool();
      const request = pool.request().input('id', sql.Int, id);
      const updates = [];

      if (ad !== undefined) {
        updates.push('Ad = @ad');
        request.input('ad', sql.NVarChar(50), String(ad).trim());
      }
      if (soyad !== undefined) {
        updates.push('Soyad = @soyad');
        request.input('soyad', sql.NVarChar(50), String(soyad).trim());
      }
      if (email !== undefined) {
        updates.push('Email = @email');
        request.input('email', sql.NVarChar(100), String(email).trim());
      }
      if (rol !== undefined) {
        let r = String(rol).toLowerCase().trim();
        if (!['admin', 'user'].includes(r)) r = 'user';
        updates.push('rol = @rol');
        request.input('rol', sql.NVarChar(20), r);
      }
      if (sifre && String(sifre).trim()) {
        updates.push('sifre = @sifre');
        request.input('sifre', sql.NVarChar(255), String(sifre).trim());
      }
      if (taramaOnEk !== undefined || tarama_on_ek !== undefined) {
        const v = String(taramaOnEk !== undefined ? taramaOnEk : tarama_on_ek).trim();
        updates.push('TaramaOnEk = @taramaOnEk');
        request.input('taramaOnEk', sql.NVarChar(100), v || null);
      }

      if (!updates.length) {
        return res.json({ success: false, message: 'Güncellenecek alan yok.' });
      }

      await request.query(`UPDATE Kullanicilar SET ${updates.join(', ')} WHERE Id = @id`);
      res.json({ success: true, message: 'Kullanıcı güncellendi.' });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.post('/api/kullanici/:id/sifre-sifirla', authenticateToken, sadeceAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (!id) return res.status(400).json({ success: false, message: 'Geçersiz kullanıcı.' });

      const yeniSifre = geciciSifreOlustur();
      const pool = await getPool();
      const r = await pool.request()
        .input('id', sql.Int, id)
        .input('sifre', sql.NVarChar(255), yeniSifre)
        .query(`UPDATE Kullanicilar SET sifre = @sifre WHERE Id = @id; SELECT KullaniciAdi FROM Kullanicilar WHERE Id = @id`);

      if (!r.recordset.length) {
        return res.status(404).json({ success: false, message: 'Kullanıcı bulunamadı.' });
      }

      res.json({
        success: true,
        message: 'Geçici şifre oluşturuldu.',
        kullaniciadi: r.recordset[0].KullaniciAdi,
        geciciSifre: yeniSifre
      });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.delete('/api/sil/:id', authenticateToken, sadeceAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (!id) return res.status(400).json({ success: false, message: 'Geçersiz kullanıcı.' });
      if (id === req.user.id) {
        return res.status(400).json({ success: false, message: 'Kendi hesabınızı silemezsiniz.' });
      }

      const pool = await getPool();
      await pool.request()
        .input('id', sql.Int, id)
        .query(`DELETE FROM Kullanicilar WHERE Id = @id`);

      res.json({ success: true, message: 'Kullanıcı silindi.' });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });
}

module.exports = { registerPaketAdmin, geciciSifreOlustur };
