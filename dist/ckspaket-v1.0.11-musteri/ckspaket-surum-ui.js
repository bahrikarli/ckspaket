/**
 * Ana sayfada sürüm gösterimi ve güncelleme bildirimi
 */
(function () {
  const bannerId = 'paket-guncelleme-banner';
  const surumId = 'paket-surum-etiket';
  let kullaniciAdmin = false;

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

  function surumEtiketiEkle() {
    if (document.getElementById(surumId)) return;
    const alt = document.querySelector('.subtitle');
    if (!alt) return;
    const span = document.createElement('div');
    span.id = surumId;
    span.style.cssText = 'margin-top:6px;font-size:13px;opacity:0.85;';
    alt.after(span);
  }

  async function sunucuYenidenBekle(hedefSurum) {
    const detay = document.getElementById('paket-guncelleme-detay');
    const baslangic = Date.now();
    const maxMs = 10 * 60 * 1000;
    let sunucuKapandi = false;

    while (Date.now() - baslangic < maxMs) {
      await new Promise((r) => setTimeout(r, 3000));
      try {
        const res = await fetch('/api/paket-surum', { cache: 'no-store' });
        if (!res.ok) continue;
        const data = await res.json();
        if (!data.success) continue;
        if (hedefSurum && data.surum === hedefSurum) {
          location.reload();
          return;
        }
        if (sunucuKapandi) {
          location.reload();
          return;
        }
      } catch (_) {
        sunucuKapandi = true;
        if (detay) {
          detay.textContent = 'Sunucu güncelleniyor… Konsol penceresindeki ilerlemeyi izleyin. Birkaç dakika sürebilir.';
        }
      }
    }
    if (detay) {
      detay.textContent = 'Güncelleme sürüyor olabilir. Birkaç dakika sonra sayfayı yenileyin veya ckspaket-musteri-guncelle.bat çalıştırın.';
    }
  }

  async function guncellemeBaslat() {
    if (kullaniciAdmin) {
      if (!confirm('Güncelleme başlatılsın mı?\n\nSunucu kapanacak, dosyalar güncellenecek ve otomatik yeniden açılacak.\n\nckspaket-musteri-guncelle.bat ile aynı işlem yapılır.')) return;

      const btn = document.getElementById('paket-guncelleme-aksiyon');
      const detay = document.getElementById('paket-guncelleme-detay');
      const hedefSurum = document.getElementById(bannerId)?.dataset?.surum || '';
      btn.disabled = true;
      btn.textContent = 'Başlatılıyor…';

      try {
        const token = localStorage.getItem('token');
        const res = await fetch('/api/paket-guncelle-uygula', {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + token }
        });
        let data;
        try {
          data = await res.json();
        } catch (_) {
          data = { success: false, message: 'Sunucu yanıt vermedi (HTTP ' + res.status + ')' };
        }
        if (!res.ok || !data.success) {
          alert(data.message || 'Güncelleme başlatılamadı.');
          btn.disabled = false;
          btn.textContent = 'Şimdi Güncelle';
          return;
        }

        btn.textContent = 'Güncelleniyor…';
        if (detay) {
          detay.textContent = 'Güncelleme penceresi açılıyor… Sunucu kapanınca otomatik yenilenecek.';
        }
        sunucuYenidenBekle(hedefSurum);
      } catch (_) {
        alert('Bağlantı hatası. Sunucu bilgisayarında ckspaket-musteri-guncelle.bat dosyasını çalıştırın.');
        btn.disabled = false;
        btn.textContent = 'Şimdi Güncelle';
      }
      return;
    }
    alert('Güncelleme için sunucu bilgisayarında ckspaket-musteri-guncelle.bat dosyasını çalıştırın.\n\nGit modunda tek tıkla: git pull + npm install + sunucu yeniden başlar.');
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
      const surumRes = await fetch('/api/paket-surum');
      const surumData = await surumRes.json();
      if (surumData.success && document.getElementById(surumId)) {
        document.getElementById(surumId).textContent = `Sürüm v${surumData.surum}`;
      }
    } catch (_) {}

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
