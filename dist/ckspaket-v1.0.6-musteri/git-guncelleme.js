/**
 * Git tabanlı sürüm kontrolü ve güncelleme
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const axios = require('axios');
const { mevcutSurumAl, surumKarsilastir } = require('./paket-guncelleme');
const { koruMu } = require('./guncelleme-koru');

function gitVarMi(kok) {
  return fs.existsSync(path.join(kok, '.git'));
}

function gitCalistir(komut, kok, sessiz = true) {
  const out = execSync(komut, {
    cwd: kok,
    encoding: 'utf8',
    stdio: sessiz ? ['pipe', 'pipe', 'pipe'] : 'inherit'
  });
  if (out == null || out === undefined) return '';
  return String(out).trim();
}

function dalAl() {
  return String(process.env.GIT_BRANCH || 'main').trim() || 'main';
}

function repoUrlAl(kok) {
  const env = String(process.env.GIT_REPO_URL || '').trim();
  if (env) return env;
  if (!gitVarMi(kok)) return '';
  try {
    return gitCalistir('git remote get-url origin', kok);
  } catch (_) {
    return '';
  }
}

function gitGuncellemeAktifMi(kok) {
  return Boolean(repoUrlAl(kok));
}

function githubParcala(repoUrl) {
  const m = String(repoUrl).match(/github\.com[/:]([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/i);
  if (!m) return null;
  return { sahip: m[1], repo: m[2] };
}

function githubRawUrl(repoUrl, branch, dosya) {
  const p = githubParcala(repoUrl);
  if (!p) return null;
  return `https://raw.githubusercontent.com/${p.sahip}/${p.repo}/${branch}/${dosya}`;
}

async function githubDosyaOku(repoUrl, branch, dosya) {
  const url = githubRawUrl(repoUrl, branch, dosya);
  if (!url) return null;
  const headers = { Accept: 'application/json' };
  const token = String(process.env.GIT_TOKEN || '').trim();
  if (token) headers.Authorization = `token ${token}`;
  const res = await axios.get(url, {
    timeout: 15000,
    validateStatus: (s) => s === 200,
    headers
  });
  return res.data;
}

async function gitUzakSurumKontrol(kok) {
  const repoUrl = repoUrlAl(kok);
  if (!repoUrl) return null;

  const branch = dalAl();
  const mevcut = mevcutSurumAl(kok);

  if (gitVarMi(kok)) {
    try {
      gitCalistir(`git fetch origin ${branch}`, kok, true);
      const remotePkgJson = gitCalistir(`git show origin/${branch}:package.json`, kok);
      const remotePkg = JSON.parse(remotePkgJson);
      const yeniSurum = String(remotePkg.version || '').trim();
      let notlar = '';
      try {
        const surumJson = gitCalistir(`git show origin/${branch}:surum.json`, kok);
        notlar = JSON.parse(surumJson).notlar || '';
      } catch (_) {}
      const localHash = gitCalistir('git rev-parse HEAD', kok);
      const remoteHash = gitCalistir(`git rev-parse origin/${branch}`, kok);
      const guncellemeVar = localHash !== remoteHash || surumKarsilastir(yeniSurum, mevcut.surum) > 0;
      return {
        guncellemeVar,
        mevcutSurum: mevcut.surum,
        yeniSurum,
        notlar,
        yontem: 'git',
        commit: remoteHash.slice(0, 7)
      };
    } catch (_) {}
  }

  try {
    const remotePkg = await githubDosyaOku(repoUrl, branch, 'package.json');
    if (!remotePkg) return null;
    const yeniSurum = String(remotePkg.version || '').trim();
    let notlar = '';
    try {
      const surum = await githubDosyaOku(repoUrl, branch, 'surum.json');
      notlar = surum?.notlar || '';
    } catch (_) {}
    return {
      guncellemeVar: Boolean(yeniSurum && surumKarsilastir(yeniSurum, mevcut.surum) > 0),
      mevcutSurum: mevcut.surum,
      yeniSurum,
      notlar,
      yontem: 'github'
    };
  } catch (_) {
    return null;
  }
}

function envGitAyarla(kok, repoUrl, branch) {
  const envPath = path.join(kok, '.env');
  let s = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
  const satirlar = {
    GIT_REPO_URL: repoUrl,
    GIT_BRANCH: branch || 'main'
  };
  for (const [anahtar, deger] of Object.entries(satirlar)) {
    const rx = new RegExp(`^${anahtar}=.*$`, 'm');
    if (rx.test(s)) s = s.replace(rx, `${anahtar}=${deger}`);
    else {
      if (s && !s.endsWith('\n')) s += '\n';
      s += `${anahtar}=${deger}\n`;
    }
  }
  fs.writeFileSync(envPath, s, 'utf8');
}

function surumJsonYaz(kok, surum, notlar) {
  const hedef = path.join(kok, 'surum.json');
  fs.writeFileSync(
    hedef,
    JSON.stringify({ surum, tarih: new Date().toISOString().slice(0, 10), notlar }, null, 2) + '\n',
    'utf8'
  );
}

function gitYayinla(kok, surum, notlar) {
  if (!gitVarMi(kok)) {
    console.log('  ATLA: Git deposu yok (git init yapilmamis)');
    return false;
  }
  const branch = dalAl();
  surumJsonYaz(kok, surum, notlar);
  gitCalistir('git add -A', kok, false);
  try {
    gitCalistir(`git diff --cached --quiet`, kok);
    console.log('  ATLA: Commit edilecek degisiklik yok');
    return false;
  } catch (_) {}
  gitCalistir(`git commit -m "v${surum}: ${notlar.replace(/"/g, '\\"')}"`, kok, false);
  try {
    gitCalistir(`git tag -f v${surum}`, kok, true);
  } catch (_) {
    gitCalistir(`git tag v${surum}`, kok, true);
  }
  gitCalistir(`git push origin ${branch}`, kok, false);
  try {
    gitCalistir(`git push origin v${surum} --force`, kok, false);
  } catch (_) {
    gitCalistir(`git push origin v${surum}`, kok, false);
  }
  console.log('  OK: Git push + tag v' + surum);
  return true;
}

function gitEnv() {
  return { ...process.env, GIT_TERMINAL_PROMPT: '0' };
}

function gitExec(komut, kok, stdio = 'inherit') {
  execSync(komut, { cwd: kok, stdio, env: gitEnv() });
}

const GIT_KORU_SKIP = koruMu;

function gitDosyalariKopyala(tmp, hedef) {
  console.log('Korunan (atlanir): taramalar, uploads, dist, .env, node_modules');
  for (const ad of fs.readdirSync(tmp)) {
    if (ad === '.git' || GIT_KORU_SKIP(ad)) {
      console.log('  atla:', ad);
      continue;
    }
    const src = path.join(tmp, ad);
    const dst = path.join(hedef, ad);
    console.log('  ->', ad);
    if (fs.statSync(src).isDirectory()) {
      if (fs.existsSync(dst)) fs.rmSync(dst, { recursive: true, force: true });
      execSync(`xcopy "${src}" "${dst}\\" /E /I /Y /Q`, { stdio: 'inherit' });
    } else {
      fs.copyFileSync(src, dst);
    }
  }
}

function gitKuruluMu() {
  try {
    execSync('git --version', { stdio: 'pipe', encoding: 'utf8' });
    return true;
  } catch (_) {
    return false;
  }
}

function zipAc(zipYol, hedefKlasor) {
  fs.mkdirSync(hedefKlasor, { recursive: true });
  const ps = [
    `$zip = '${zipYol.replace(/'/g, "''")}'`,
    `$dst = '${hedefKlasor.replace(/'/g, "''")}'`,
    'Expand-Archive -Path $zip -DestinationPath $dst -Force'
  ].join('; ');
  execSync(`powershell -NoProfile -Command "${ps}"`, { stdio: 'inherit' });
}

async function githubZipGuncelle(kok, koruFn) {
  const repoUrl = repoUrlAl(kok);
  const p = githubParcala(repoUrl);
  if (!p) throw new Error('GIT_REPO_URL gecersiz');
  const branch = dalAl();
  const url = `https://codeload.github.com/${p.sahip}/${p.repo}/zip/refs/heads/${branch}`;

  console.log('Git kurulu degil — GitHub ZIP indiriliyor...');
  if (typeof koruFn === 'function') koruFn('yedek');

  const tmpKok = path.join(kok, '_git_klon');
  const tmpZip = path.join(tmpKok, 'repo.zip');
  const tmpAc = path.join(tmpKok, 'acilan');
  if (fs.existsSync(tmpKok)) fs.rmSync(tmpKok, { recursive: true, force: true });
  fs.mkdirSync(tmpKok, { recursive: true });

  try {
    const headers = {};
    const token = String(process.env.GIT_TOKEN || '').trim();
    if (token) headers.Authorization = `token ${token}`;
    console.log('Indiriliyor:', url);
    const res = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 180000,
      validateStatus: (s) => s === 200,
      headers
    });
    fs.writeFileSync(tmpZip, Buffer.from(res.data));
    console.log('ZIP aciliyor...');
    zipAc(tmpZip, tmpAc);
    const ust = fs.readdirSync(tmpAc).filter((ad) => !ad.startsWith('.'));
    let kaynak = tmpAc;
    if (ust.length === 1) {
      const pth = path.join(tmpAc, ust[0]);
      if (fs.statSync(pth).isDirectory()) kaynak = pth;
    }
    console.log('Dosyalar uygulaniyor...');
    gitDosyalariKopyala(kaynak, kok);
    if (typeof koruFn === 'function') koruFn('geri');
    return { guncellendi: true, yontem: 'github-zip' };
  } finally {
    if (fs.existsSync(tmpKok)) fs.rmSync(tmpKok, { recursive: true, force: true });
  }
}

function gitPullUygula(kok, koruFn) {
  if (!gitKuruluMu()) {
    throw new Error('Git kurulu degil — githubZipGuncelle kullanin');
  }
  const repoUrl = repoUrlAl(kok);
  if (!repoUrl) throw new Error('GIT_REPO_URL tanimli degil (.env)');

  const branch = dalAl();

  if (!gitVarMi(kok)) {
    console.log('GitHub indiriliyor (ilk kurulum)...');
    if (typeof koruFn === 'function') koruFn('yedek');
    const tmp = path.join(kok, '_git_klon');
    if (fs.existsSync(tmp)) fs.rmSync(tmp, { recursive: true, force: true });
    console.log('git clone...');
    gitExec(`git clone --depth 1 -b ${branch} "${repoUrl}" "${tmp}"`, kok);
    console.log('Dosyalar uygulaniyor...');
    gitDosyalariKopyala(tmp, kok);
    fs.rmSync(tmp, { recursive: true, force: true });
    gitExec('git init', kok, 'pipe');
    try { gitExec(`git remote add origin "${repoUrl}"`, kok, 'pipe'); } catch (_) {}
    gitExec(`git fetch origin ${branch}`, kok);
    gitExec(`git checkout -B ${branch} FETCH_HEAD`, kok, 'pipe');
    gitExec(`git branch --set-upstream-to=origin/${branch} ${branch}`, kok, 'pipe');
    if (typeof koruFn === 'function') koruFn('geri');
    return { guncellendi: true, yontem: 'clone' };
  }

  if (typeof koruFn === 'function') koruFn('yedek');
  try {
    console.log('git fetch...');
    gitCalistir(`git fetch origin ${branch}`, kok, true);
    const local = gitCalistir('git rev-parse HEAD', kok);
    const remote = gitCalistir(`git rev-parse origin/${branch}`, kok);
    if (local === remote) {
      if (typeof koruFn === 'function') koruFn('geri');
      return { guncellendi: false };
    }
    console.log('git pull...');
    gitCalistir(`git pull origin ${branch} --ff-only`, kok, true);
    if (typeof koruFn === 'function') koruFn('geri');
    return { guncellendi: true, yontem: 'pull' };
  } catch (err) {
    if (typeof koruFn === 'function') koruFn('geri');
    throw err;
  }
}

module.exports = {
  gitVarMi,
  gitKuruluMu,
  gitGuncellemeAktifMi,
  gitUzakSurumKontrol,
  gitPullUygula,
  githubZipGuncelle,
  gitYayinla,
  envGitAyarla,
  surumJsonYaz,
  repoUrlAl,
  dalAl
};
