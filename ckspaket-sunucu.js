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

function registerCkspaketSunucu(app, opts) {
  const { getPool, gercekKlasor, CKSPAKET_MOD, authenticateToken, sadeceAdmin } = opts;
  if (!CKSPAKET_MOD || !app) return;

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
}

function registerCkspaketStatic(app, gercekKlasor) {
  if (!app || !gercekKlasor) return;
  app.use(express.static(gercekKlasor));
}

module.exports = { registerCkspaketSunucu, registerCkspaketStatic };
