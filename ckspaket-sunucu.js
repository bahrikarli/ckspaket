/**
 * CKS Paket — kurum, guncelleme, health (server.js senkronundan sonra require ile yuklenir)
 */
const express = require('express');
const fs = require('fs');
const path = require('path');

function paketSurumAl(kok) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(kok, 'package.json'), 'utf8'));
    return String(pkg.version || '').trim();
  } catch (_) {
    return '';
  }
}

/** iframe/modal sayfalari — server.js senkronundan ONCE kayit (Bearer GET tasimaz) */
const HTML_IFRAME_SAYFALAR = [
  'cks.html',
  'mesajlar.html',
  'profil.html',
  'personel-pdf-havuz.html',
  'dashboard.html',
  'arsiv.html',
  'dilekce.html',
  'mesai-kart.html',
  'mesai-yoklama.html',
  'mesai-takip.html',
  'mesai-zobis-hatirlatma-test.html',
  'ruhsat.html',
  'tarim-rehber.html'
];

function registerCkspaketHtmlSayfalari(app, gercekKlasor) {
  for (const dosya of HTML_IFRAME_SAYFALAR) {
    const webYol = '/' + dosya;
    app.get(webYol, (req, res) => {
      const tam = path.join(gercekKlasor, dosya);
      if (!fs.existsSync(tam)) return res.status(404).send(dosya + ' bulunamadi');
      res.sendFile(tam);
    });
  }
}

function registerCkspaketSunucu(app, opts) {
  const { getPool, gercekKlasor, CKSPAKET_MOD, authenticateToken, sadeceAdmin } = opts;
  if (!CKSPAKET_MOD || !app) return;

  registerCkspaketHtmlSayfalari(app, gercekKlasor);
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, ckspaket: true, pid: process.pid });
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

  try {
    const { registerKurumSunucu } = require('./kurum-sunucu');
    registerKurumSunucu(app, { getPool, gercekKlasor, authenticateToken });
  } catch (err) {
    console.warn('[kurum-sunucu]', err.message);
  }

  try {
    const { registerPaketGuncelleme } = require('./paket-guncelleme');
    registerPaketGuncelleme(app, { gercekKlasor, CKSPAKET_MOD, authenticateToken, sadeceAdmin });
  } catch (err) {
    console.warn('[paket-guncelleme]', err.message);
  }

  try {
    const { registerPaketAdmin } = require('./paket-admin');
    registerPaketAdmin(app, { CKSPAKET_MOD, authenticateToken, sadeceAdmin, sql: require('mssql'), getPool });
  } catch (err) {
    console.warn('[paket-admin]', err.message);
  }
}

function registerCkspaketStatic(app, gercekKlasor) {
  if (!app || !gercekKlasor) return;
  app.use(express.static(gercekKlasor));
}

module.exports = { registerCkspaketSunucu, registerCkspaketStatic };
