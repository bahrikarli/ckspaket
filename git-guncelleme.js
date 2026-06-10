/**
 * Git tabanlı sürüm kontrolü ve güncelleme
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const axios = require('axios');
const { mevcutSurumAl, surumKarsilastir } = require('./paket-guncelleme');

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

function gitPullUygula(kok, koruFn) {
  const repoUrl = repoUrlAl(kok);
  if (!repoUrl) throw new Error('GIT_REPO_URL tanimli degil (.env)');

  const branch = dalAl();

  if (!gitVarMi(kok)) {
    if (typeof koruFn === 'function') koruFn('yedek');
    const tmp = path.join(kok, '_git_klon');
    if (fs.existsSync(tmp)) fs.rmSync(tmp, { recursive: true, force: true });
    execSync(`git clone --depth 1 -b ${branch} "${repoUrl}" "${tmp}"`, {
      cwd: kok,
      stdio: 'inherit'
    });
    for (const ad of fs.readdirSync(tmp)) {
      if (ad === '.git') continue;
      const src = path.join(tmp, ad);
      const dst = path.join(kok, ad);
      if (fs.statSync(src).isDirectory()) {
        if (fs.existsSync(dst)) fs.rmSync(dst, { recursive: true, force: true });
        execSync(`xcopy "${src}" "${dst}\\" /E /I /Y /Q`, { stdio: 'inherit' });
      } else {
        fs.copyFileSync(src, dst);
      }
    }
    fs.rmSync(tmp, { recursive: true, force: true });
    execSync('git init', { cwd: kok, stdio: 'pipe' });
    try { execSync(`git remote add origin "${repoUrl}"`, { cwd: kok, stdio: 'pipe' }); } catch (_) {}
    execSync(`git fetch origin ${branch}`, { cwd: kok, stdio: 'inherit' });
    execSync(`git checkout -B ${branch} FETCH_HEAD`, { cwd: kok, stdio: 'pipe' });
    execSync(`git branch --set-upstream-to=origin/${branch} ${branch}`, { cwd: kok, stdio: 'pipe' });
    if (typeof koruFn === 'function') koruFn('geri');
    return { guncellendi: true, yontem: 'clone' };
  }

  if (typeof koruFn === 'function') koruFn('yedek');
  try {
    gitCalistir(`git fetch origin ${branch}`, kok, false);
    const local = gitCalistir('git rev-parse HEAD', kok);
    const remote = gitCalistir(`git rev-parse origin/${branch}`, kok);
    if (local === remote) {
      if (typeof koruFn === 'function') koruFn('geri');
      return { guncellendi: false };
    }
    gitCalistir(`git pull origin ${branch} --ff-only`, kok, false);
    if (typeof koruFn === 'function') koruFn('geri');
    return { guncellendi: true, yontem: 'pull' };
  } catch (err) {
    if (typeof koruFn === 'function') koruFn('geri');
    throw err;
  }
}

module.exports = {
  gitVarMi,
  gitGuncellemeAktifMi,
  gitUzakSurumKontrol,
  gitPullUygula,
  gitYayinla,
  envGitAyarla,
  surumJsonYaz,
  repoUrlAl,
  dalAl
};
