/**
 * CKS Paket — kurum adi (Tanimlamalar) API ve giris/anasayfa enjeksiyonu
 */
const fs = require('fs');
const path = require('path');
const { kurumGenelOku, htmlKurumEnjekte } = require('./kurum-ayar');

function registerKurumSunucu(app, opts) {
  const { getPool, gercekKlasor, authenticateToken } = opts;
  if (!app || !getPool || !gercekKlasor) return;

  app.get('/api/kurum-genel', async (_req, res) => {
    try {
      res.json(await kurumGenelOku(getPool));
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  async function indexHtmlGonder(res, titleSuffix) {
    try {
      const kurum = await kurumGenelOku(getPool);
      let html = fs.readFileSync(path.join(gercekKlasor, 'index.html'), 'utf8');
      html = htmlKurumEnjekte(html, kurum.kurum_adi, titleSuffix);
      res.type('html').send(html);
    } catch (_) {
      res.sendFile(path.join(gercekKlasor, 'index.html'));
    }
  }

  app.get('/', (req, res) => indexHtmlGonder(res, ' - Personel Girişi'));
  app.get('/index.html', (req, res) => indexHtmlGonder(res, ' - Personel Girişi'));

  app.get('/anasayfa.html', async (req, res) => {
    // Oturum kontrolu istemcide (localStorage + /api/me); HTML GET Bearer tasimaz
    try {
      const kurum = await kurumGenelOku(getPool);
      let html = fs.readFileSync(path.join(gercekKlasor, 'anasayfa.html'), 'utf8');
      html = htmlKurumEnjekte(html, kurum.kurum_adi, ' — CKS Paket');
      res.type('html').send(html);
    } catch (_) {
      res.sendFile(path.join(gercekKlasor, 'anasayfa.html'));
    }
  });
}

module.exports = { registerKurumSunucu };
