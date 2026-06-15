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

  async function healthKontrol() {
    try {
      const res = await fetch('/api/health', { cache: 'no-store' });
      return res.ok;
    } catch (_) {
      return false;
    }
  }

  async function guncellemeIlerlemeIzle(hedefSurum) {
    modalGoster('Güncelleniyor', 'Güncelleme başlatılıyor…', 5);
    const baslangic = Date.now();
    const maxMs = 12 * 60 * 1000;
    let sunucuKapandi = false;
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
          sonYuzde = durum.yuzde;
          modalGoster('Güncelleniyor', durum.mesaj || 'İşlem sürüyor…', durum.yuzde);
        }
        if (durum.bitti && durum.asama === 'tamam') {
          sonYuzde = 95;
          modalGoster('Güncelleniyor', 'Sunucu yeniden başlatılıyor…', 95);
          break;
        }
      }

      const saglik = await healthKontrol();
      if (!saglik) {
        sunucuKapandi = true;
        if (sonYuzde < 40) sonYuzde = 40;
        modalGoster('Güncelleniyor', 'Dosyalar güncelleniyor… Lütfen bekleyin.', sonYuzde);
      } else if (sunucuKapandi) {
        try {
          const surumRes = await fetch('/api/paket-surum', { cache: 'no-store' });
          const surumData = await surumRes.json();
          if (surumData.success) {
            if (!hedefSurum || surumData.surum === hedefSurum) {
              modalBasarili(`v${surumData.surum} yüklendi. Sayfa yenileniyor…`);
              setTimeout(() => location.reload(), 1500);
              return;
            }
          }
        } catch (_) {}
        modalGoster('Güncelleniyor', 'Sunucu hazırlanıyor…', 95);
      }
    }

    if (await healthKontrol()) {
      modalBasarili('Güncelleme tamamlandı. Sayfa yenileniyor…');
      setTimeout(() => location.reload(), 1500);
    } else {
      modalHata('Güncelleme uzun sürdü. Birkaç dakika sonra sayfayı yenileyin veya baslat.bat çalıştırın.');
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
          modalGoster('Sürüm Çıkılıyor', durum.mesaj || 'Git\'e gönderiliyor…', durum.yuzde || 50);
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
      const surumRes = await fetch('/api/paket-surum');
      const surumData = await surumRes.json();
      const metin = document.getElementById('paket-surum-metin');
      if (surumData.success && metin) {
        metin.textContent = `Sürüm v${surumData.surum}`;
      }
    } catch (_) {}

    surumCikButonuGoster();

    try {
      const res = await fetch('/api/paket-guncelle-kontrol');
      const data = await res.json();
      if (data.success && data.guncellemeVar) bannerGoster(data);
    } catch (_) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', surumKontrol);
  } else {
    surumKontrol();
  }
})();
