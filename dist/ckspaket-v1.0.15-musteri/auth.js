// auth.js – DÜZ ŞİFRE, HİÇ HATA VERMEZ
const express = require('express');
const sql = require('mssql');
const jwt = require('jsonwebtoken');
const getPool = require('./config');

const router = express.Router();
const SECRET_KEY = "besiktas1903kartal";

router.post('/login', async (req, res) => {
  const { kullaniciadi, email, sifre } = req.body;
  const giris = (kullaniciadi || email || '').trim();

  if (!giris || !sifre) {
    return res.json({ success: false, message: "Boş alan bırakma" });
  }

  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('giris', sql.NVarChar, giris)
      .query(`
        SELECT Id, KullaniciAdi, Email, sifre, ISNULL(Ad,'') Ad, ISNULL(Soyad,'') Soyad, ISNULL(rol,'user') rol 
        FROM Kullanicilar 
        WHERE KullaniciAdi = @giris OR Email = @giris
      `);

    if (result.recordset.length === 0) {
      return res.json({ success: false, message: "Kullanıcı yok" });
    }

    const user = result.recordset[0];

    // DÜZ ŞİFRE KARŞILAŞTIRMASI
    if (user.sifre !== sifre) {
      return res.json({ success: false, message: "Şifre yanlış" });
    }

    const token = jwt.sign(
      { id: user.Id, kullaniciadi: user.KullaniciAdi, rol: user.rol },
      SECRET_KEY,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      message: "Hoş geldin!",
      token,
      user: { id: user.Id, kullaniciadi: user.KullaniciAdi, rol: user.rol }
    });

  } catch (err) {
    console.error("Login hatası:", err);
    res.json({ success: false, message: "Bağlantı hatası" });
  }
});

module.exports = router;