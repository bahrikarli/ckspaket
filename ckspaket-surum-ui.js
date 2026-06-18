/**
 * Ana sayfada sürüm gösterimi, güncelleme bildirimi ve geliştirici sürüm çıkarma
 */
(function () {
  const bannerId = 'paket-guncelleme-banner';
  const surumId = 'paket-surum-etiket';
  const modalId = 'paket-guncelleme-modal';
  let kullaniciAdmin = false;
  let gelistiriciMod = false;

  function bannerOlustur() {
    if (document.getElementById(bannerId)) return;
    const el = document.createElement('div');
    el.id = bannerId;
    el.style.cssText = [
      'display:none',
      'position:fixed',
      'top:0',
      'left:0',
      'right:0',
      'z-index:100001',
      'background:linear-gradient(90deg,#c0392b,#e67e22)',
      'color:white',
      'padding:14px 20px',
      'box-shadow:0 4px 20px rgba(0,0,0,0.25)',
      'font-family:Segoe UI,Arial,sans-serif'
    ].join(';');
    el.innerHTML = [
      '<div style="max-width:1100px;margin:0 auto;display:flex;flex-wrap:wrap;align-items:center;gap:12px;justify-content:space-between;">',
      '  <div>',
      '    <strong id="paket-guncelleme-baslik"><i class="fas fa-download"></i> Yeni sürüm mevcut</strong>',
      '    <div id="paket-guncelleme-detay" style="font-size:14px;margin-top:4px;opacity:0.95;"></div>',
      '  </div>',
      '  <div style="display:flex;gap:10px;flex-wrap:wrap;">',
      '    <button type="button" id="paket-guncelleme-kapat" style="background:rgba(255,255,255,0.2);border:none;color:white;padding:10px 16px;border-radius:8px;cursor:pointer;">Sonra</button>',
      '    <button type="button" id="paket-guncelleme-aksiyon" style="background:white;border:none;color:#c0392b;padding:10px 18px;border-radius:8px;cursor:pointer;font-weight:bold;">Şimdi Güncelle</button>',
      '  </div>',
      '</div>'
    ].join('');
    document.body.prepend(el);
    document.getElementById('paket-guncelleme-kapat').onclick = () => {
      el.style.display = 'none';
      document.body.style.paddingTop = '';
      try { sessionStorage.setItem('paketGuncellemeGizle', el.dataset.surum || ''); } catch (_) {}
    };
  }

  function modalOlustur() {
    if (document.getElementById(modalId)) return;
    const el = document.createElement('div');
    el.id = modalId;
    el.style.cssText = 'display:none;position:fixed;inset:0;z-index:200002;background:rgba(0,0,0,0.75);font-family:Segoe UI,Arial,sans-serif;';
    el.innerHTML = [
      '<div style="background:white;max-width:480px;margin:12vh auto;padding:32px;border-radius:16px;box-shadow:0 20px 60px rgba(0,0,0,0.35);text-align:center;">',
      '  <div id="paket-modal-ikon" style="font-size:48px;color:#006400;margin-bottom:12px;"><i class="fas fa-sync fa-spin"></i></div>',
      '  <h2 id="paket-modal-baslik" style="color:#006400;margin:0 0 8px;font-size:22px;">Güncelleniyor</h2>',
      '  <p id="paket-modal-mesaj" style="color:#555;margin:0 0 20px;font-size:15px;">Hazırlanıyor…</p>',
      '  <div style="background:#e8f5e9;border-radius:10px;height:14px;overflow:hidden;margin-bottom:8px;">',
      '    <div id="paket-modal-bar" style="background:linear-gradient(90deg,#006400,#228B22);height:100%;width:0%;transition:width 0.4s ease;border-radius:10px;"></div>',
      '  </div>',
      '  <div id="paket-modal-yuzde" style="font-size:13px;color:#888;">0%</div>',
      '</div>'
    ].join('');
    document.body.appendChild(el);
  }

  function modalGoster(baslik, mesaj, yuzde) {
    modalOlustur();
    const el = document.getElementById(modalId);
    el.style.display = 'block';
    document.body.style.overflow = 'hidden';
    if (baslik) document.getElementById('paket-modal-baslik').textContent = baslik;
    if (mesaj) document.getElementById('paket-modal-mesaj').textContent = mesaj;
    if (typeof yuzde === 'number') {
      document.getElementById('paket-modal-bar').style.width = Math.min(100, Math.max(0, yuzde)) + '%';
      document.getElementById('paket-modal-yuzde').textContent = Math.round(yuzde) + '%';
    }
  }

  function modalBasarili(mesaj) {
    document.getElementById('paket-modal-ikon').innerHTML = '<i class="fas fa-check-circle"></i>';
    document.getElementById('paket-modal-ikon').style.color = '#27ae60';
    document.getElementById('paket-modal-baslik').textContent = 'Tamamlandı';
    document.getElementById('paket-modal-mesaj').textContent = mesaj || 'Sayfa yenileniyor…';
    document.getElementById('paket-modal-bar').style.width = '100%';
    document.getElementById('paket-modal-yuzde').textContent = '100%';
  }

  function modalHata(mesaj) {
    document.getElementById('paket-modal-ikon').innerHTML = '<i class="fas fa-times-circle"></i>';
    document.getElementById('paket-modal-ikon').style.color = '#c0392b';
    document.getElementById('paket-modal-baslik').textContent = 'Hata';
    document.getElementById('paket-modal-mesaj').textContent = mesaj;
    document.body.style.overflow = '';
    setTimeout(() => {
      const el = document.getElementById(modalId);
      if (el) el.style.display = 'none';
    }, 8000);
  }

  function surumEtiketiEkle() {
    if (document.getElementById(surumId)) return;
    const alt = document.querySelector('.subtitle');
    if (!alt) return;
    const wrap = document.createElement('div');
    wrap.id = surumId;
    wrap.style.cssText = 'margin-top:6px;font-size:13px;opacity:0.85;display:flex;align-items:center;justify-content:center;gap:10px;flex-wrap:wrap;';
    wrap.innerHTML = '<span id="paket-surum-metin"></span>';
    alt.after(wrap);
  }

  function surumCikButonuGoster() {
    if (!kullaniciAdmin || !gelistiriciMod) return;
    const wrap = document.getElementById(surumId);
    if (!wrap || document.getElementById('paket-surum-cik-btn')) return;
    const btn = document.createElement('button');
    btn.id = 'paket-surum-cik-btn';
    btn.type = 'button';
    btn.textContent = 'Sürüm Çık';
    btn.title = 'Sürüm artır, Git\'e push et — müşteriler otomatik günceller';
    btn.style.cssText = 'background:#006400;color:white;border:none;padding:4px 12px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;';
    btn.onclick = surumCikBaslat;
    wrap.appendChild(btn);
  }

  async function durumDosyadanOku() {
    try {
      const res = await fetch('/guncellemeler/guncelleme-durum.json?t=' + Date.now(), { cache: 'no-store' });
      if (!res.ok) return null;
      return await res.json();
    } catch (_) {
      return null;
    }
  }

  async function durumApidenOku() {
    try {
      const res = await fetch('/api/paket-guncelle-durum', { cache: 'no-store' });
      if (!res.ok) return null;
      const data = await res.json();
      return data.durum || null;
    } catch (_) {
      return null;
    }
  }

  async function sunucuHazirMi() {
    const urls = ['/api/health', '/api/paket-surum', '/api/kurum-genel'];
    for (const url of urls) {
      try {
        const res = await fetch(url, { cache: 'no-store' });
        if (res.ok) return true;
      } catch (_) {}
    }
    return false;
  }

  async function kuruluSurumOku() {
    try {
      const res = await fetch('/api/paket-surum', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.surum) return data.surum;
      }
    } catch (_) {}
    try {
      const sj = await fetch('/surum.json', { cache: 'no-store' });
      if (sj.ok) {
        const d = await sj.json();
        return String(d.surum || d.version || '').trim();
      }
    } catch (_) {}
    return '';
  }

  async function githubGuncellemeKontrol(mevcutSurum) {
    const mevcut = String(mevcutSurum || '').trim();
    if (!mevcut) return null;
    try {
      let repo = 'bahrikarli/ckspaket';
      let branch = 'main';
      try {
        const sj = await fetch('/surum.json', { cache: 'no-store' });
        if (sj.ok) {
          const d = await sj.json();
          if (d.repo) {
            repo = String(d.repo)
              .replace(/^https?:\/\/github\.com\//i, '')
              .replace(/\.git$/i, '')
              .replace(/\/$/, '');
          }
          if (d.branch) branch = String(d.branch).trim();
        }
      } catch (_) {}
      const url = `https://raw.githubusercontent.com/${repo}/${branch}/package.json?t=${Date.now()}`;
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) return null;
      const pkg = await res.json();
      const yeniSurum = String(pkg.version || '').trim();
      if (!yeniSurum || surumKarsilastir(yeniSurum, mevcut) <= 0) return null;
      let notlar = '';
      try {
        const sn = await fetch(`https://raw.githubusercontent.com/${repo}/${branch}/surum.json?t=${Date.now()}`, { cache: 'no-store' });
        if (sn.ok) {
          const sd = await sn.json();
          notlar = sd.notlar || '';
        }
      } catch (_) {}
      return {
        guncellemeVar: true,
        mevcutSurum: mevcut,
        yeniSurum,
        notlar,
        yontem: 'github'
      };
    } catch (_) {
      return null;
    }
  }

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

  async function guncellemeIlerlemeIzle(hedefSurum) {
    modalGoster('Güncelleniyor', 'Güncelleme başlatılıyor…', 5);
    const baslangic = Date.now();
    const maxMs = 15 * 60 * 1000;
    let sunucuKapandi = false;
    let guncellemeBitti = false;
    let sonYuzde = 5;

    while (Date.now() - baslangic < maxMs) {
      await new Promise((r) => setTimeout(r, 2000));

      let durum = await durumApidenOku();
      if (!durum) durum = await durumDosyadanOku();

      if (durum) {
        if (durum.hata && durum.bitti) {
          modalHata(durum.mesaj || durum.hata);
          return;
        }
        if (typeof durum.yuzde === 'number') {
          sonYuzde = Math.max(sonYuzde, durum.yuzde);
          modalGoster('Güncelleniyor', durum.mesaj || 'İşlem sürüyor…', sonYuzde);
        }
        if (durum.bitti && durum.asama === 'tamam') {
          guncellemeBitti = true;
          sonYuzde = 92;
          modalGoster('Güncelleniyor', 'Sunucu yeniden başlatılıyor…', sonYuzde);
        }
      }

      const hazir = await sunucuHazirMi();
      if (!hazir) {
        sunucuKapandi = true;
        if (sonYuzde < 45) sonYuzde = 45;
        modalGoster(
          'Güncelleniyor',
          guncellemeBitti ? 'Sunucu yeniden başlatılıyor…' : 'Dosyalar güncelleniyor… Lütfen bekleyin.',
          sonYuzde
        );
        continue;
      }

      if (sunucuKapandi || guncellemeBitti) {
        const kurulu = await kuruluSurumOku();
        const surumUygun = !hedefSurum || !kurulu || kurulu === hedefSurum || surumKarsilastir(kurulu, hedefSurum) >= 0;
        if (surumUygun) {
          modalBasarili(kurulu ? `v${kurulu} yüklendi. Sayfa yenileniyor…` : 'Güncelleme tamamlandı. Sayfa yenileniyor…');
          setTimeout(() => location.reload(), 1200);
          return;
        }
        modalBasarili(`Sunucu hazır (v${kurulu}). Sayfa yenileniyor…`);
        setTimeout(() => location.reload(), 1200);
        return;
      }
    }

    if (await sunucuHazirMi()) {
      modalBasarili('Sunucu hazır. Sayfa yenileniyor…');
      setTimeout(() => location.reload(), 1200);
    } else {
      modalHata('Güncelleme uzun sürdü. baslat.bat çalıştırın, ardından sayfayı yenileyin (F5).');
    }
  }

  async function guncellemeBaslat() {
    if (kullaniciAdmin) {
      if (!confirm('Güncelleme başlatılsın mı?\n\nSunucu kapanacak, dosyalar güncellenecek ve otomatik yeniden açılacak.')) return;

      const hedefSurum = document.getElementById(bannerId)?.dataset?.surum || '';
      const btn = document.getElementById('paket-guncelleme-aksiyon');
      btn.disabled = true;
      btn.textContent = 'Başlatılıyor…';

      try {
        const token = localStorage.getItem('token');
        const res = await fetch('/api/paket-guncelle-uygula', {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + token }
        });
        let data;
        try { data = await res.json(); } catch (_) {
          data = { success: false, message: 'Sunucu yanıt vermedi (HTTP ' + res.status + ')' };
        }
        if (!res.ok || !data.success) {
          alert(data.message || 'Güncelleme başlatılamadı.');
          btn.disabled = false;
          btn.textContent = 'Şimdi Güncelle';
          return;
        }

        const banner = document.getElementById(bannerId);
        if (banner) banner.style.display = 'none';
        document.body.style.paddingTop = '';
        guncellemeIlerlemeIzle(hedefSurum);
      } catch (_) {
        alert('Bağlantı hatası. Sunucu bilgisayarında ckspaket-musteri-guncelle.bat dosyasını çalıştırın.');
        btn.disabled = false;
        btn.textContent = 'Şimdi Güncelle';
      }
      return;
    }
    alert('Güncelleme için sunucu bilgisayarında yönetici olarak giriş yapıp "Şimdi Güncelle" butonunu kullanın.');
  }

  async function surumCikBaslat() {
    const notlar = prompt('Sürüm notu (isteğe bağlı):', '') || '';
    const btn = document.getElementById('paket-surum-cik-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Paketleniyor…'; }

    modalGoster('Sürüm Çıkılıyor', 'Sürüm artırılıyor ve Git\'e gönderiliyor…', 10);

    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/paket-yayinla', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ notlar })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        modalHata(data.message || 'Sürüm çıkarma başlatılamadı');
        if (btn) { btn.disabled = false; btn.textContent = 'Sürüm Çık'; }
        return;
      }

      const baslangic = Date.now();
      while (Date.now() - baslangic < 10 * 60 * 1000) {
        await new Promise((r) => setTimeout(r, 2000));
        const durumRes = await fetch('/api/paket-yayinla-durum', { cache: 'no-store' });
        const durumData = await durumRes.json();
        const durum = durumData.durum;
        if (durum) {
          modalGoster('Sürüm Çıkılıyor', durum.mesaj || 'Git\'e gönderiliyor…', durum.yuzde || 15);
          if (durum.bitti) {
            if (durum.hata) {
              modalHata(durum.mesaj || durum.hata);
            } else {
              modalBasarili(durum.mesaj || 'Paket hazır');
              const metin = document.getElementById('paket-surum-metin');
              if (metin && durum.surum) metin.textContent = 'Sürüm v' + durum.surum;
              setTimeout(() => {
                const el = document.getElementById(modalId);
                if (el) el.style.display = 'none';
                document.body.style.overflow = '';
              }, 4000);
            }
            if (btn) { btn.disabled = false; btn.textContent = 'Sürüm Çık'; }
            return;
          }
        }
      }
      modalHata('Paketleme zaman aşımına uğradı');
    } catch (_) {
      modalHata('Bağlantı hatası');
    }
    if (btn) { btn.disabled = false; btn.textContent = 'Sürüm Çık'; }
  }

  function bannerGoster(data) {
    bannerOlustur();
    const el = document.getElementById(bannerId);
    el.dataset.surum = data.yeniSurum || '';
    try {
      if (sessionStorage.getItem('paketGuncellemeGizle') === el.dataset.surum) return;
    } catch (_) {}
    document.getElementById('paket-guncelleme-baslik').innerHTML =
      `<i class="fas fa-download"></i> Yeni sürüm: v${data.yeniSurum}`;
    const detay = [];
    if (data.mevcutSurum) detay.push(`Kurulu: v${data.mevcutSurum}`);
    if (data.tarih) detay.push(`Yayın: ${data.tarih}`);
    if (data.notlar) detay.push(String(data.notlar));
    document.getElementById('paket-guncelleme-detay').textContent = detay.join(' · ');
    const btn = document.getElementById('paket-guncelleme-aksiyon');
    btn.textContent = kullaniciAdmin ? 'Şimdi Güncelle' : 'Nasıl Güncellerim?';
    btn.onclick = guncellemeBaslat;
    el.style.display = 'block';
    document.body.style.paddingTop = '72px';
  }

  async function surumKontrol() {
    surumEtiketiEkle();
    try {
      const token = localStorage.getItem('token');
      const meRes = await fetch('/api/me', { headers: { Authorization: 'Bearer ' + token } });
      const me = await meRes.json();
      if (me.success) kullaniciAdmin = String(me.user.rol || '').toLowerCase().trim() === 'admin';
    } catch (_) {}

    try {
      const gelRes = await fetch('/api/paket-gelistirici');
      const gelData = await gelRes.json();
      if (gelData.success) gelistiriciMod = !!gelData.gelistirici;
    } catch (_) {}

    try {
      const surumRes = await fetch('/api/paket-surum', { cache: 'no-store' });
      const metin = document.getElementById('paket-surum-metin');
      if (surumRes.ok) {
        const surumData = await surumRes.json();
        if (surumData.success && metin) {
          metin.textContent = `Sürüm v${surumData.surum}`;
        }
      } else if (metin && !metin.textContent.replace(/…/g, '').trim()) {
        const sj = await fetch('/surum.json', { cache: 'no-store' });
        if (sj.ok) {
          const d = await sj.json();
          if (d.surum || d.version) metin.textContent = `Sürüm v${d.surum || d.version}`;
        }
      }
    } catch (_) {
      try {
        const metin = document.getElementById('paket-surum-metin');
        const sj = await fetch('/surum.json', { cache: 'no-store' });
        if (sj.ok && metin) {
          const d = await sj.json();
          if (d.surum || d.version) metin.textContent = `Sürüm v${d.surum || d.version}`;
        }
      } catch (_2) {}
    }

    surumCikButonuGoster();

    let guncelleme = null;
    try {
      const res = await fetch('/api/paket-guncelle-kontrol', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.guncellemeVar) guncelleme = data;
      }
    } catch (_) {}

    if (!guncelleme) {
      const kurulu = await kuruluSurumOku();
      guncelleme = await githubGuncellemeKontrol(kurulu);
    }
    if (guncelleme && guncelleme.guncellemeVar) bannerGoster(guncelleme);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', surumKontrol);
  } else {
    surumKontrol();
  }
})();
