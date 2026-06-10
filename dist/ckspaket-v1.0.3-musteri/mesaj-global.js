/**
 * Tüm giriş yapılmış sayfalarda: yeni mesaj → ses + köşe bildirimi + tıklayınca sohbet modalı.
 * mesajlar.html sayfasında çalışmaz (orada zaten tam ekran sohbet var).
 */
(function () {
  'use strict';

  const token = localStorage.getItem('token');
  if (!token) return;
  if (/mesajlar\.html/i.test(window.location.pathname)) return;
  if (window.__mesajGlobalYuklendi) return;
  window.__mesajGlobalYuklendi = true;

  const POLL_MS = 3000;
  const MESAJ_MODAL_Z = 1000020;
  const MESAJ_BILDIRIM_Z = 1000010;
  const SES_URL = '/sounds/whatsapp-notification.mp3';
  const SES_YEDEK =
    'https://cdn.jsdelivr.net/gh/ekmancy/message-sound@master/whatsapp.mp3';

  let benimId = null;
  let ilkTarama = true;
  let sesKilidiAcik = false;
  const gosterilenMesajIds = new Set();
  const aktifKutular = {};

  let ses = null;
  function sesOlustur() {
    if (ses) return ses;
    ses = new Audio(SES_URL);
    ses.volume = 0.85;
    ses.addEventListener('error', () => {
      ses = new Audio(SES_YEDEK);
      ses.volume = 0.85;
    }, { once: true });
    return ses;
  }

  function acSesKilidi() {
    if (sesKilidiAcik) return;
    const a = sesOlustur();
    const onceki = a.volume;
    a.volume = 0.01;
    a.play()
      .then(() => {
        a.pause();
        a.currentTime = 0;
        a.volume = onceki || 0.85;
        sesKilidiAcik = true;
        const bar = document.getElementById('mesajSesKilidiBar');
        if (bar) bar.classList.remove('goster');
      })
      .catch(() => {});
  }

  function sesCal() {
    if (!sesKilidiAcik) {
      const bar = document.getElementById('mesajSesKilidiBar');
      if (bar) bar.classList.add('goster');
      return;
    }
    const a = sesOlustur();
    a.currentTime = 0;
    a.play().catch(() => {});
  }

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function kisaMetin(metin, max) {
    const t = String(metin || '').trim();
    if (t.length <= max) return t;
    return t.slice(0, max - 1) + '…';
  }

  function rozetGuncelle(adet) {
    ['mesaj-badge', 'yeni-mesaj-rozeti'].forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      if (adet > 0) {
        el.innerText = adet > 99 ? '99+' : String(adet);
        el.style.display = el.id === 'mesaj-badge' ? 'flex' : 'flex';
      } else {
        el.style.display = 'none';
      }
    });
  }

  function modalAcikVeAyniKisi(gonderenId) {
    const modal = document.getElementById('mesajGlobalModal');
    if (!modal || !modal.classList.contains('active')) return false;
    const iframe = document.getElementById('mesajGlobalIframe');
    if (!iframe || !iframe.src) return false;
    return iframe.src.indexOf('targetUser=' + gonderenId) !== -1 ||
      iframe.src.indexOf('id=' + gonderenId) !== -1;
  }

  function tarayiciBildirimi(m) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    if (!document.hidden) return;
    try {
      const n = new Notification(m.GonderenIsim || 'Yeni mesaj', {
        body: kisaMetin(m.Mesaj, 120),
        icon: '/tzob-logo.png',
        tag: 'mesaj-' + m.GonderenId
      });
      n.onclick = () => {
        window.focus();
        mesajModalAc(m.GonderenId);
        n.close();
      };
    } catch (_) {}
  }

  function bildirimGuncelle(m) {
    const kutu = aktifKutular[m.GonderenId];
    const konteynir = document.getElementById('bildirim-konteynir');
    if (!kutu) return;
    const mesajAlani = kutu.querySelector('.bildirim-mesaj-metni');
    if (mesajAlani) mesajAlani.textContent = m.Mesaj;
    kutu.classList.add('guncellendi');
    setTimeout(() => kutu.classList.remove('guncellendi'), 500);
    if (konteynir) konteynir.appendChild(kutu);
  }

  function bildirimKutusuEkle(m) {
    const konteynir = document.getElementById('bildirim-konteynir');
    if (!konteynir) return;

    const div = document.createElement('div');
    div.className = 'tekil-bildirim';
    div.setAttribute('role', 'button');
    div.innerHTML =
      '<div class="b-ikon-yuvarlak">' +
      escapeHtml((m.GonderenIsim || 'M')[0]).toUpperCase() +
      '</div>' +
      '<div style="flex:1;overflow:hidden;">' +
      '<div style="font-weight:bold;font-size:14px;color:#333;">' +
      escapeHtml(m.GonderenIsim || 'Mesaj') +
      '</div>' +
      '<div class="bildirim-mesaj-metni">' +
      escapeHtml(kisaMetin(m.Mesaj, 80)) +
      '</div></div>';

    div.onclick = () => {
      div.remove();
      delete aktifKutular[m.GonderenId];
      mesajModalAc(m.GonderenId);
    };

    aktifKutular[m.GonderenId] = div;
    konteynir.appendChild(div);
    konteynir.scrollLeft = konteynir.scrollWidth;

    setTimeout(() => {
      if (div.parentNode) {
        div.remove();
        delete aktifKutular[m.GonderenId];
      }
    }, 45000);
  }

  function yeniMesajIsle(mesaj) {
    if (gosterilenMesajIds.has(mesaj.Id)) return;
    gosterilenMesajIds.add(mesaj.Id);

    if (modalAcikVeAyniKisi(mesaj.GonderenId)) return;

    if (aktifKutular[mesaj.GonderenId] && document.body.contains(aktifKutular[mesaj.GonderenId])) {
      bildirimGuncelle(mesaj);
    } else {
      bildirimKutusuEkle(mesaj);
    }

    sesCal();
    tarayiciBildirimi(mesaj);

    const eskiBaslik = document.title.replace(/^\(\d+\+?\)\s*/, '');
    document.title = '(1) ' + eskiBaslik;
    setTimeout(() => {
      document.title = document.title.replace(/^\(\d+\+?\)\s*/, '');
    }, 4000);
  }

  async function mesajDenetle() {
    if (!benimId) return;
    try {
      const r = await fetch('/api/mesajlar', {
        headers: { Authorization: 'Bearer ' + token }
      });
      const veriler = await r.json();
      if (!Array.isArray(veriler)) return;

      const okunmamislar = veriler.filter(
        (m) =>
          Number(m.OkunmaDurumu) === 0 &&
          String(m.GonderenId) !== String(benimId) &&
          String(m.AliciId) === String(benimId)
      );

      rozetGuncelle(okunmamislar.length);

      if (ilkTarama) {
        okunmamislar.forEach((m) => gosterilenMesajIds.add(m.Id));
        ilkTarama = false;
        return;
      }

      okunmamislar.forEach((m) => yeniMesajIsle(m));
    } catch (e) {
      console.warn('[mesaj-global]', e);
    }
  }

  function domHazirla() {
    if (!document.getElementById('bildirim-konteynir')) {
      const k = document.createElement('div');
      k.id = 'bildirim-konteynir';
      k.setAttribute('aria-live', 'polite');
      document.body.appendChild(k);
    }

    if (!document.getElementById('mesajSesKilidiBar')) {
      const bar = document.createElement('div');
      bar.id = 'mesajSesKilidiBar';
      bar.innerHTML =
        '<strong>🔔 Mesaj sesleri</strong>Duymak için bir kez tıklayın';
      bar.onclick = () => {
        acSesKilidi();
        sesCal();
      };
      document.body.appendChild(bar);
    }

    if (!document.getElementById('mesajGlobalModal')) {
      const modal = document.createElement('div');
      modal.id = 'mesajGlobalModal';
      modal.className = 'overlay';
      modal.style.zIndex = String(MESAJ_MODAL_Z);
      modal.innerHTML =
        '<div class="mesaj-modal-ic">' +
        '<span class="mesaj-modal-kapat" onclick="mesajModalKapat()" aria-label="Kapat">&times;</span>' +
        '<div class="mesaj-modal-baslik"><i class="fas fa-comments"></i> Mesajlar</div>' +
        '<iframe id="mesajGlobalIframe" title="Mesajlar"></iframe>' +
        '</div>';
      modal.addEventListener('click', (e) => {
        if (e.target === modal) mesajModalKapat();
      });
      document.body.appendChild(modal);
    }
  }

  window.mesajModalAc = function mesajModalAc(gonderenId) {
    domHazirla();
    const modal = document.getElementById('mesajGlobalModal');
    const iframe = document.getElementById('mesajGlobalIframe');
    if (!modal || !iframe) {
      location.href = gonderenId
        ? '/mesajlar.html?targetUser=' + gonderenId
        : '/mesajlar.html';
      return;
    }
    iframe.src = gonderenId
      ? '/mesajlar.html?targetUser=' + encodeURIComponent(gonderenId)
      : '/mesajlar.html';
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
    acSesKilidi();
  };

  window.mesajModalKapat = function mesajModalKapat() {
    const modal = document.getElementById('mesajGlobalModal');
    if (modal) modal.classList.remove('active');
    document.body.style.overflow = '';
  };

  function baslat() {
    domHazirla();

    document.body.addEventListener(
      'click',
      () => acSesKilidi(),
      { once: true, capture: true }
    );

    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }

    fetch('/api/me', { headers: { Authorization: 'Bearer ' + token } })
      .then((r) => r.json())
      .then((d) => {
        if (d.success && d.user?.id) {
          benimId = d.user.id;
          mesajDenetle();
          setInterval(mesajDenetle, POLL_MS);
        }
      })
      .catch(() => {});
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', baslat);
  } else {
    baslat();
  }
})();
