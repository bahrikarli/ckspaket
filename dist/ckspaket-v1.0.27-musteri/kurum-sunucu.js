/**
 * CKS Paket — kurum adi (Tanimlamalar) API ve giris/anasayfa enjeksiyonu
 */
const fs = require('fs');
const path = require('path');
const { kurumGenelOku, htmlKurumEnjekte } = require('./kurum-ayar');

function paketSurumAl(kok) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(kok, 'package.json'), 'utf8'));
    return String(pkg.version || '').trim();
  } catch (_) {
    return '';
  }
}

function htmlSurumEnjekte(html, surum) {
  if (!surum) return html;
  const etiket = `Sürüm v${surum}`;
  if (/id="paket-surum-metin"/i.test(html)) {
    return html.replace(
      /(<[^>]*id="paket-surum-metin"[^>]*>)[^<]*(<\/[^>]+>)/i,
      `$1${etiket}$2`
    );
  }
  return html.replace(
    /(<div class="subtitle">CKS Paket[^<]*<\/div>)/i,
    `$1\n  <div id="paket-surum-etiket" style="margin-top:6px;font-size:13px;opacity:0.85;"><span id="paket-surum-metin">${etiket}</span></div>`
  );
}

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

  app.get('/api/paket-surum', (_req, res) => {
    try {
      const surum = paketSurumAl(gercekKlasor);
      if (!surum) return res.status(500).json({ success: false, message: 'package.json okunamadi' });
      res.json({ success: true, surum, ad: 'ckspaket' });
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
      html = htmlSurumEnjekte(html, paketSurumAl(gercekKlasor));
      res.type('html').send(html);
    } catch (_) {
      let html = fs.readFileSync(path.join(gercekKlasor, 'anasayfa.html'), 'utf8');
      html = htmlSurumEnjekte(html, paketSurumAl(gercekKlasor));
      res.type('html').send(html);
    }
  });
}

module.exports = { registerKurumSunucu };
