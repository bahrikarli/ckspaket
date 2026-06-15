/**
 * CKS Paket — sürüm bilgisi ve uzaktan güncelleme kontrolü
 */
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const axios = require('axios');

function mevcutSurumAl(kok) {
  const pkgPath = path.join(kok, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  return {
    surum: pkg.version || '0.0.0',
    ad: pkg.name || 'ckspaket',
    aciklama: pkg.description || ''
  };
}

/** a > b → pozitif, eşit → 0 */
function surumKarsilastir(a, b) {
  const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map((n) => parseInt(n, 10) || 0);
  const uzun = Math.max(pa.length, pb.length);
  for (let i = 0; i < uzun; i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function surumArtir(mevcut, tip = 'patch') {
  const p = String(mevcut).split('.').map((n) => parseInt(n, 10) || 0);
  while (p.length < 3) p.push(0);
  if (tip === 'major') {
    p[0] += 1;
    p[1] = 0;
    p[2] = 0;
  } else if (tip === 'minor') {
    p[1] += 1;
    p[2] = 0;
  } else {
    p[2] += 1;
  }
  return p.join('.');
}

function surumYaz(kok, yeniSurum) {
  const pkgPath = path.join(kok, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  pkg.version = yeniSurum;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
  return yeniSurum;
}

/** package.json + surum.json aynı sürümde tutulur */
function surumSenkronYaz(kok, surum, notlar) {
  surumYaz(kok, surum);
  const hedef = path.join(kok, 'surum.json');
  fs.writeFileSync(
    hedef,
    JSON.stringify(
      { surum, tarih: new Date().toISOString().slice(0, 10), notlar: notlar || '' },
      null,
      2
    ) + '\n',
    'utf8'
  );
  return surum;
}

function manifestYaz(kok, surum, zipAdi, ip, port, notlar) {
  const guncellemeKlasor = path.join(kok, 'guncellemeler');
  fs.mkdirSync(guncellemeKlasor, { recursive: true });
  const sunucuIp = ip || process.env.CKS_SUNUCU_IP || '127.0.0.1';
  const sunucuPort = port || process.env.CKS_PORT || process.env.PORT || '3030';
  const manifest = {
    surum,
    tarih: new Date().toISOString().slice(0, 10),
    notlar: notlar || `${surum} sürüm güncellemesi`,
    indirmeUrl: `http://${sunucuIp}:${sunucuPort}/guncellemeler/${zipAdi}`
  };
  fs.writeFileSync(path.join(guncellemeKlasor, 'guncelleme.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  return manifest;
}

function envGuncellemeUrlAyarla(kok, ip, port) {
  const url = `http://${ip}:${port}/guncellemeler/guncelleme.json`;
  const envPath = path.join(kok, '.env');
  let s = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
  if (/^GUNCELLEME_URL=/m.test(s)) {
    s = s.replace(/^GUNCELLEME_URL=.*$/m, `GUNCELLEME_URL=${url}`);
  } else {
    if (s && !s.endsWith('\n')) s += '\n';
    s += `GUNCELLEME_URL=${url}\n`;
  }
  fs.writeFileSync(envPath, s, 'utf8');
  return url;
}

async function uzakManifestAl(url) {
  const res = await axios.get(url, {
    timeout: 15000,
    validateStatus: (s) => s === 200,
    headers: { Accept: 'application/json' }
  });
  return res.data;
}

function registerPaketGuncelleme(app, opts) {
  const { gercekKlasor, CKSPAKET_MOD, authenticateToken, sadeceAdmin } = opts;
  if (!CKSPAKET_MOD) return;

  const { durumBaslat, durumOku } = require('./guncelleme-durum');
  let yayinlaCalisiyor = false;

  const guncellemeKlasor = path.join(gercekKlasor, 'guncellemeler');
  if (!fs.existsSync(guncellemeKlasor)) {
    fs.mkdirSync(guncellemeKlasor, { recursive: true });
  }
  app.use('/guncellemeler', require('express').static(guncellemeKlasor));

  app.get('/api/paket-surum', (_req, res) => {
    try {
      res.json({ success: true, ...mevcutSurumAl(gercekKlasor) });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.get('/api/paket-guncelle-kontrol', async (_req, res) => {
    try {
      const mevcut = mevcutSurumAl(gercekKlasor);

      if (require('./git-guncelleme').gitGuncellemeAktifMi(gercekKlasor)) {
        const gitSonuc = await require('./git-guncelleme').gitUzakSurumKontrol(gercekKlasor);
        if (gitSonuc) {
          return res.json({ success: true, ...gitSonuc });
        }
      }

      const manifestUrl = String(process.env.GUNCELLEME_URL || '').trim();
      if (!manifestUrl) {
        return res.json({
          success: true,
          guncellemeVar: false,
          mevcutSurum: mevcut.surum,
          mesaj: 'GIT_REPO_URL veya GUNCELLEME_URL tanımlı değil (.env)'
        });
      }
      const manifest = await uzakManifestAl(manifestUrl);
      const yeniSurum = String(manifest.surum || manifest.version || '').trim();
      const guncellemeVar = Boolean(yeniSurum && surumKarsilastir(yeniSurum, mevcut.surum) > 0);
      res.json({
        success: true,
        guncellemeVar,
        mevcutSurum: mevcut.surum,
        yeniSurum,
        tarih: manifest.tarih || manifest.releaseDate || '',
        notlar: manifest.notlar || manifest.notes || manifest.changelog || '',
        indirmeUrl: manifest.indirmeUrl || manifest.downloadUrl || ''
      });
    } catch (err) {
      res.json({
        success: false,
        guncellemeVar: false,
        message: err.message || 'Güncelleme sunucusuna ulaşılamadı'
      });
    }
  });

  app.get('/api/paket-guncelle-durum', (_req, res) => {
    try {
      const durum = durumOku(gercekKlasor, 'guncelleme');
      res.json({ success: true, durum: durum || { yuzde: 0, mesaj: 'Bekleniyor…', bitti: false } });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.get('/api/paket-gelistirici', (_req, res) => {
    const paketle = path.join(gercekKlasor, 'ckspaket-paketle.js');
    res.json({ success: true, gelistirici: fs.existsSync(paketle) });
  });

  if (authenticateToken && sadeceAdmin) {
    app.get('/api/paket-yayinla-durum', (_req, res) => {
      try {
        const durum = durumOku(gercekKlasor, 'yayinla');
        res.json({
          success: true,
          calisiyor: yayinlaCalisiyor,
          durum: durum || { yuzde: 0, mesaj: 'Hazır', bitti: true }
        });
      } catch (err) {
        res.status(500).json({ success: false, message: err.message });
      }
    });

    app.post('/api/paket-yayinla', authenticateToken, sadeceAdmin, (req, res) => {
      try {
        const paketle = path.join(gercekKlasor, 'ckspaket-paketle.js');
        if (!fs.existsSync(paketle)) {
          return res.status(403).json({
            success: false,
            message: 'Geliştirici paketleme modülü yok (müşteri kurulumu)'
          });
        }
        if (yayinlaCalisiyor) {
          return res.status(409).json({ success: false, message: 'Sürüm çıkarma zaten çalışıyor' });
        }

        const notlar = String(req.body?.notlar || '').trim();
        const { durumGuncelle, durumBitir } = require('./guncelleme-durum');
        durumBaslat(gercekKlasor, 'yayinla', 'Müşteri paketi hazırlanıyor…');
        yayinlaCalisiyor = true;

        res.json({ success: true, message: 'Sürüm çıkarma başlatıldı' });

        const args = ['ckspaket-paketle.js', '--musteri', '--artir'];
        if (notlar) args.push(notlar);

        durumGuncelle(gercekKlasor, 15, 'Dosyalar paketleniyor…', 'paketle', 'yayinla');

        const child = spawn(process.execPath, args, {
          cwd: gercekKlasor,
          env: process.env,
          windowsHide: true
        });

        child.on('close', (code) => {
          yayinlaCalisiyor = false;
          if (code === 0) {
            const surum = mevcutSurumAl(gercekKlasor).surum;
            durumBitir(gercekKlasor, true, `v${surum} müşteri paketi hazır`, surum, 'yayinla');
          } else {
            durumBitir(gercekKlasor, false, `Paketleme başarısız (kod ${code})`, null, 'yayinla');
          }
        });

        child.on('error', (err) => {
          yayinlaCalisiyor = false;
          durumBitir(gercekKlasor, false, err.message, null, 'yayinla');
        });
      } catch (err) {
        yayinlaCalisiyor = false;
        res.status(500).json({ success: false, message: err.message });
      }
    });

    app.post('/api/paket-guncelle-uygula', authenticateToken, sadeceAdmin, (req, res) => {
      try {
        const bat = path.join(gercekKlasor, 'ckspaket-musteri-guncelle.bat');
        const vbs = path.join(gercekKlasor, 'ckspaket-musteri-guncelle-gizli.vbs');
        if (!fs.existsSync(bat)) {
          return res.status(404).json({ success: false, message: 'ckspaket-musteri-guncelle.bat bulunamadı' });
        }

        durumBaslat(gercekKlasor, 'guncelleme', 'Güncelleme başlatılıyor…');

        res.json({
          success: true,
          message: 'Güncelleme başlatıldı. Sunucu kapanıp güncelleme uygulanacak ve otomatik yeniden açılacak.'
        });

        setTimeout(() => {
          try {
            const logsDir = path.join(gercekKlasor, 'logs');
            if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
            fs.appendFileSync(
              path.join(logsDir, 'guncelleme-ui.log'),
              `\n[${new Date().toISOString()}] Arayuzden guncelleme tetiklendi\n`
            );
          } catch (_) {}

          if (fs.existsSync(vbs)) {
            const child = spawn('wscript.exe', ['//Nologo', vbs], {
              detached: true,
              stdio: 'ignore',
              cwd: gercekKlasor,
              windowsHide: true
            });
            child.unref();
            return;
          }

          const logFile = path.join(gercekKlasor, 'logs', 'guncelleme-ui.log');
          const batQ = bat.replace(/"/g, '""');
          const logQ = logFile.replace(/"/g, '""');
          const child = spawn(
            'cmd.exe',
            ['/c', `start "" /MIN cmd /c "${batQ}" >> "${logQ}" 2>&1`],
            { detached: true, stdio: 'ignore', cwd: gercekKlasor, windowsHide: true }
          );
          child.unref();
        }, 800);
      } catch (err) {
        res.status(500).json({ success: false, message: err.message });
      }
    });
  }
}

module.exports = {
  mevcutSurumAl,
  surumKarsilastir,
  surumArtir,
  surumYaz,
  surumSenkronYaz,
  manifestYaz,
  envGuncellemeUrlAyarla,
  registerPaketGuncelleme
};
