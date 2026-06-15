/** Kurum tanımlamaları — il / ilçe / mahalle yönetim paneli */

const konumTanimState = { sekme: 'mahalle', iller: [], ilceler: [] };
let konumAcilisBaglami = { fromKurum: false, varsayilanIl: '', varsayilanIlce: '', sekme: 'mahalle' };

const konumToast = Swal.mixin({
  toast: true,
  position: 'top-end',
  showConfirmButton: false,
  timer: 1800,
  timerProgressBar: true
});

function konumMevcutBaglam() {
  return {
    il: konumFiltIl(),
    ilce: konumFiltIlce(),
    sekme: konumTanimState.sekme,
    fromKurum: konumAcilisBaglami.fromKurum
  };
}

function konumListeAcik() {
  return !!document.getElementById('konum-liste');
}

function konumAuthHdr() {
  return {
    Authorization: 'Bearer ' + localStorage.getItem('token'),
    'Content-Type': 'application/json'
  };
}

function konumEsc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}

function konumNorm(s) {
  return String(s || '').trim().toLocaleUpperCase('tr-TR');
}

async function konumApiJson(url, opts) {
  try {
    const res = await fetch(url, opts);
    const d = await res.json().catch(() => ({}));
    if (!res.ok) {
      d.success = false;
      if (!d.message) {
        if (res.status === 404) d.message = 'API bulunamadı — sunucuyu yeniden başlatın (durdur.bat → baslat.bat).';
        else if (res.status === 403) d.message = 'Bu işlem için admin yetkisi gerekir.';
        else if (res.status === 401) d.message = 'Oturum süresi doldu — tekrar giriş yapın.';
        else d.message = 'İstek başarısız (HTTP ' + res.status + ')';
      }
    }
    return d;
  } catch (_) {
    return { success: false, message: 'Sunucuya bağlanılamadı.' };
  }
}

async function konumPublicIller() {
  const res = await fetch('/api/IL');
  if (!res.ok) return [];
  const raw = await res.json().catch(() => []);
  return (raw || []).map(x => String(x.İL || x.il || '').trim()).filter(Boolean);
}

async function konumPublicIlceler(il) {
  const res = await fetch('/api/ILCE');
  if (!res.ok) return [];
  const raw = await res.json().catch(() => []);
  const hedef = konumNorm(il);
  return (raw || [])
    .filter(x => !hedef || konumNorm(x.İL || x.il) === hedef)
    .map(x => String(x.İLÇE || x.ilce || '').trim())
    .filter(Boolean);
}

async function konumPublicMahalleler(il, ilce) {
  const res = await fetch('/api/MAHALLE');
  if (!res.ok) return [];
  const raw = await res.json().catch(() => []);
  const hedefIl = konumNorm(il);
  const hedefIlce = konumNorm(ilce);
  return (raw || [])
    .filter(x => {
      if (hedefIl && konumNorm(x.İL || x.il) !== hedefIl) return false;
      if (hedefIlce && konumNorm(x.İLÇE || x.ilce) !== hedefIlce) return false;
      return true;
    })
    .map(x => ({
      il: String(x.İL || x.il || '').trim(),
      ilce: String(x.İLÇE || x.ilce || '').trim(),
      mahalle: String(x.MAHALLE || x.mahalle || '').trim()
    }))
    .filter(x => x.mahalle);
}

function konumFiltIl() {
  return konumNorm(document.getElementById('konum-filt-il')?.value);
}

function konumFiltIlce() {
  return konumNorm(document.getElementById('konum-filt-ilce')?.value);
}

function konumSekmeAktif(tip) {
  konumTanimState.sekme = tip;
  document.querySelectorAll('.konum-sekme-btn').forEach(btn => {
    const aktif = btn.dataset.sekme === tip;
    btn.style.background = aktif ? '#006400' : '#fff';
    btn.style.color = aktif ? '#fff' : '#006400';
    btn.classList.toggle('aktif', aktif);
  });
  const ilceWrap = document.getElementById('konum-filt-ilce-wrap');
  const mahInfo = document.getElementById('konum-mahalle-bilgi');
  const yeniIl = document.getElementById('konum-yeni-il-wrap');
  const yeniIlce = document.getElementById('konum-yeni-ilce-wrap');
  if (ilceWrap) ilceWrap.style.display = (tip === 'il') ? 'none' : 'block';
  if (mahInfo) mahInfo.style.display = (tip === 'mahalle') ? 'block' : 'none';
  if (yeniIl) yeniIl.style.display = (tip === 'il') ? 'block' : 'none';
  if (yeniIlce) yeniIlce.style.display = (tip === 'ilce') ? 'block' : 'none';
  const ph = document.getElementById('konum-yeni-ad');
  if (ph) {
    ph.placeholder = tip === 'ilce' ? 'Yeni ilçe adı' : 'Yeni mahalle/köy adı';
    ph.style.display = (tip === 'il') ? 'none' : 'block';
  }
  konumListele();
}

async function konumIlleriYukle(seciliIl, seciliIlce) {
  let iller = [];
  const d = await konumApiJson('/api/konum-yonetim?tip=il', { headers: konumAuthHdr() });
  if (d.success && Array.isArray(d.liste)) {
    iller = d.liste.map(x => x.il).filter(Boolean);
  } else {
    iller = await konumPublicIller();
  }
  konumTanimState.iller = iller;
  const sel = document.getElementById('konum-filt-il');
  if (!sel) return;
  if (!iller.length) {
    sel.innerHTML = '<option value="">— İl bulunamadı —</option>';
    return;
  }
  sel.innerHTML = iller.map(il => `<option value="${konumEsc(il)}">${konumEsc(il)}</option>`).join('');
  if (seciliIl && iller.some(x => konumNorm(x) === konumNorm(seciliIl))) {
    sel.value = iller.find(x => konumNorm(x) === konumNorm(seciliIl)) || seciliIl;
  } else if (iller.length) {
    sel.selectedIndex = 0;
  }
  await konumIlceleriYukle(seciliIlce);
}

async function konumIlceleriYukle(seciliIlce) {
  const il = konumFiltIl();
  let ilceler = [];
  const d = await konumApiJson('/api/konum-yonetim?tip=ilce&il=' + encodeURIComponent(il), { headers: konumAuthHdr() });
  if (d.success && Array.isArray(d.liste)) {
    ilceler = d.liste.map(x => x.ilce).filter(Boolean);
  } else {
    ilceler = await konumPublicIlceler(il);
  }
  konumTanimState.ilceler = ilceler;
  const sel = document.getElementById('konum-filt-ilce');
  if (!sel) return;
  if (!ilceler.length) {
    sel.innerHTML = '<option value="">— İlçe bulunamadı —</option>';
    return;
  }
  const tumIlce = konumTanimState.sekme === 'mahalle' ? '<option value="">— Tüm ilçeler —</option>' : '';
  sel.innerHTML = tumIlce + ilceler.map(ilce => `<option value="${konumEsc(ilce)}">${konumEsc(ilce)}</option>`).join('');
  if (seciliIlce && ilceler.some(x => konumNorm(x) === konumNorm(seciliIlce))) {
    sel.value = ilceler.find(x => konumNorm(x) === konumNorm(seciliIlce)) || seciliIlce;
  } else if (konumTanimState.sekme !== 'mahalle' && ilceler.length) {
    sel.selectedIndex = 0;
  } else {
    sel.value = '';
  }
}

async function konumListele() {
  const listeEl = document.getElementById('konum-liste');
  const sayacEl = document.getElementById('konum-sayac');
  if (!listeEl) return;
  listeEl.innerHTML = '<div style="padding:16px;text-align:center;color:#888;font-size:12px;"><i class="fas fa-spinner fa-spin"></i> Yükleniyor...</div>';
  const tip = konumTanimState.sekme;
  const il = konumFiltIl();
  const ilce = konumFiltIlce();
  let url = '/api/konum-yonetim?tip=' + tip;
  if (tip !== 'il') url += '&il=' + encodeURIComponent(il);
  if (tip === 'mahalle' && ilce) url += '&ilce=' + encodeURIComponent(ilce);
  const d = await konumApiJson(url, { headers: konumAuthHdr() });
  let liste = d.success ? (d.liste || []) : null;
  if (!liste) {
    if (tip === 'il') {
      liste = (await konumPublicIller()).map(il => ({ il }));
    } else if (tip === 'ilce') {
      liste = (await konumPublicIlceler(il)).map(ilce => ({ il, ilce }));
    } else {
      liste = await konumPublicMahalleler(il, ilce);
    }
    if (!liste.length && !d.success) {
      listeEl.innerHTML = `<div style="padding:12px;color:#c62828;font-size:12px;">${konumEsc(d.message || 'Liste alınamadı')}</div>`;
      return;
    }
  }
  if (sayacEl) sayacEl.textContent = liste.length + ' kayıt';
  if (!liste.length) {
    listeEl.innerHTML = '<div style="padding:16px;text-align:center;color:#888;font-size:12px;">Kayıt yok — aşağıdan ekleyebilirsiniz.</div>';
    return;
  }
  let html = '<table style="width:100%;border-collapse:collapse;font-size:13px;">';
  const satirStil = 'cursor:pointer;border-bottom:1px solid #eee;transition:background 0.15s;';
  const satirHover = 'onmouseover="this.style.background=\'#f5fbf5\'" onmouseout="this.style.background=\'\'"';
  if (tip === 'il') {
    html += '<thead><tr style="background:#eef6ee;"><th style="padding:8px;text-align:left;">İl</th><th style="width:56px;"></th></tr></thead><tbody>';
    liste.forEach(row => {
      html += `<tr class="konum-satir" style="${satirStil}" ${satirHover} title="Düzenlemek için çift tıklayın" data-tip="il" data-il="${konumEsc(row.il)}">
        <td style="padding:8px;">${konumEsc(row.il)}</td>
        <td style="padding:4px;text-align:center;"><button type="button" class="konum-sil-btn" data-tip="il" data-il="${konumEsc(row.il)}" style="border:none;background:#ffebee;color:#c62828;border-radius:4px;padding:4px 8px;cursor:pointer;font-size:11px;">Sil</button></td></tr>`;
    });
  } else if (tip === 'ilce') {
    html += '<thead><tr style="background:#eef6ee;"><th style="padding:8px;text-align:left;">İl</th><th style="padding:8px;text-align:left;">İlçe</th><th style="width:56px;"></th></tr></thead><tbody>';
    liste.forEach(row => {
      html += `<tr class="konum-satir" style="${satirStil}" ${satirHover} title="Düzenlemek için çift tıklayın" data-tip="ilce" data-il="${konumEsc(row.il)}" data-ilce="${konumEsc(row.ilce)}">
        <td style="padding:8px;">${konumEsc(row.il)}</td><td style="padding:8px;">${konumEsc(row.ilce)}</td>
        <td style="padding:4px;text-align:center;"><button type="button" class="konum-sil-btn" data-tip="ilce" data-il="${konumEsc(row.il)}" data-ilce="${konumEsc(row.ilce)}" style="border:none;background:#ffebee;color:#c62828;border-radius:4px;padding:4px 8px;cursor:pointer;font-size:11px;">Sil</button></td></tr>`;
    });
  } else {
    html += '<thead><tr style="background:#eef6ee;"><th style="padding:8px;text-align:left;">İl</th><th style="padding:8px;text-align:left;">İlçe</th><th style="padding:8px;text-align:left;">Mahalle / Köy</th><th style="width:56px;"></th></tr></thead><tbody>';
    liste.forEach(row => {
      const rIl = row.il || il;
      const rIlce = row.ilce || ilce;
      html += `<tr class="konum-satir" style="${satirStil}" ${satirHover} title="Düzenlemek için çift tıklayın" data-tip="mahalle" data-il="${konumEsc(rIl)}" data-ilce="${konumEsc(rIlce)}" data-mahalle="${konumEsc(row.mahalle)}" data-kimlik="${row.kimlik != null ? row.kimlik : ''}">
        <td style="padding:8px;">${konumEsc(rIl)}</td>
        <td style="padding:8px;">${konumEsc(rIlce)}</td>
        <td style="padding:8px;font-weight:600;">${konumEsc(row.mahalle)}</td>
        <td style="padding:4px;text-align:center;"><button type="button" class="konum-sil-btn" data-tip="mahalle" data-il="${konumEsc(rIl)}" data-ilce="${konumEsc(rIlce)}" data-mahalle="${konumEsc(row.mahalle)}" data-kimlik="${row.kimlik != null ? row.kimlik : ''}" style="border:none;background:#ffebee;color:#c62828;border-radius:4px;padding:4px 8px;cursor:pointer;font-size:11px;">Sil</button></td></tr>`;
    });
  }
  html += '</tbody></table>';
  listeEl.innerHTML = html;
  listeEl.querySelectorAll('.konum-sil-btn').forEach(btn => {
    btn.addEventListener('click', (e) => { e.stopPropagation(); konumSil(btn.dataset); });
  });
  listeEl.querySelectorAll('.konum-satir').forEach(tr => {
    tr.addEventListener('dblclick', () => konumDuzenleModalAc({ ...tr.dataset }));
  });
}

async function konumGuncelle(body) {
  const tip = body.tip;
  const d = await konumApiJson('/api/konum-yonetim/' + tip, {
    method: 'PUT',
    headers: konumAuthHdr(),
    body: JSON.stringify(body)
  });
  if (!d.success) {
    konumToast.fire({ icon: 'error', title: d.message || 'Kaydedilemedi' });
    return false;
  }
  if (konumListeAcik()) {
    await konumIlleriYukle(konumFiltIl(), konumFiltIlce());
    konumListele();
  }
  konumToast.fire({ icon: 'success', title: d.message || 'Kaydedildi' });
  return true;
}

async function konumDuzenleModalAc(data) {
  const geri = konumMevcutBaglam();
  const tip = data.tip || konumTanimState.sekme;
  if (tip === 'il') {
    const r = await Swal.fire({
      title: '<span style="color:#004d00;">İl Düzenle</span>',
      input: 'text',
      inputLabel: 'İl adı',
      inputValue: data.il || '',
      showCancelButton: true,
      confirmButtonText: 'Kaydet',
      confirmButtonColor: '#006400',
      cancelButtonText: 'Vazgeç',
      inputValidator: (v) => !String(v || '').trim() ? 'İl adı boş olamaz' : undefined
    });
    if (!r.isConfirmed) {
      konumTanimlariModalAc(geri.il, geri.ilce, { fromKurum: geri.fromKurum, sekme: geri.sekme });
      return;
    }
    await konumGuncelle({ tip: 'il', eskiIl: data.il, yeniIl: konumNorm(r.value) });
    konumTanimlariModalAc(geri.il, geri.ilce, { fromKurum: geri.fromKurum, sekme: geri.sekme });
    return;
  }
  if (tip === 'ilce') {
    const r = await Swal.fire({
      title: '<span style="color:#004d00;">İlçe Düzenle</span>',
      html: `<div style="text-align:left;font-size:13px;">
        <label style="font-weight:bold;display:block;margin-bottom:4px;">İl</label>
        <input id="konum-ed-il" class="swal2-input" value="${konumEsc(data.il)}" readonly style="width:100%;margin:0 0 12px;background:#f5f5f5;">
        <label style="font-weight:bold;display:block;margin-bottom:4px;">İlçe adı</label>
        <input id="konum-ed-ilce" class="swal2-input" value="${konumEsc(data.ilce)}" style="width:100%;margin:0;">
      </div>`,
      showCancelButton: true,
      confirmButtonText: 'Kaydet',
      confirmButtonColor: '#006400',
      cancelButtonText: 'Vazgeç',
      focusConfirm: false,
      preConfirm: () => {
        const v = document.getElementById('konum-ed-ilce')?.value;
        if (!String(v || '').trim()) { Swal.showValidationMessage('İlçe adı boş olamaz'); return false; }
        return konumNorm(v);
      }
    });
    if (!r.isConfirmed) {
      konumTanimlariModalAc(geri.il, geri.ilce, { fromKurum: geri.fromKurum, sekme: geri.sekme });
      return;
    }
    await konumGuncelle({ tip: 'ilce', il: data.il, eskiIlce: data.ilce, yeniIlce: r.value });
    konumTanimlariModalAc(geri.il, geri.ilce, { fromKurum: geri.fromKurum, sekme: geri.sekme });
    return;
  }
  const iller = konumTanimState.iller.length ? konumTanimState.iller : await konumPublicIller();
  let ilceler = await konumPublicIlceler(data.il);
  const ilOpts = iller.map(i => `<option value="${konumEsc(i)}" ${konumNorm(i) === konumNorm(data.il) ? 'selected' : ''}>${konumEsc(i)}</option>`).join('');
  const ilceOpts = ilceler.map(i => `<option value="${konumEsc(i)}" ${konumNorm(i) === konumNorm(data.ilce) ? 'selected' : ''}>${konumEsc(i)}</option>`).join('');
  const r = await Swal.fire({
    title: '<span style="color:#004d00;">Mahalle / Köy Düzenle</span>',
    width: 520,
    html: `<div style="text-align:left;font-size:13px;">
      <label style="font-weight:bold;display:block;margin-bottom:4px;">İl</label>
      <select id="konum-ed-il" style="width:100%;padding:10px;border:1px solid #ccc;border-radius:8px;margin-bottom:12px;font-size:13px;">${ilOpts}</select>
      <label style="font-weight:bold;display:block;margin-bottom:4px;">İlçe</label>
      <select id="konum-ed-ilce" style="width:100%;padding:10px;border:1px solid #ccc;border-radius:8px;margin-bottom:12px;font-size:13px;">${ilceOpts}</select>
      <label style="font-weight:bold;display:block;margin-bottom:4px;">Mahalle / Köy</label>
      <input id="konum-ed-mahalle" class="swal2-input" value="${konumEsc(data.mahalle)}" style="width:100%;margin:0;">
    </div>`,
    showCancelButton: true,
    confirmButtonText: 'Kaydet',
    confirmButtonColor: '#006400',
    cancelButtonText: 'Vazgeç',
    focusConfirm: false,
    didOpen: () => {
      const ilSel = document.getElementById('konum-ed-il');
      const ilceSel = document.getElementById('konum-ed-ilce');
      if (ilSel && ilceSel) {
        ilSel.onchange = async () => {
          const yeniIlceler = await konumPublicIlceler(ilSel.value);
          ilceSel.innerHTML = yeniIlceler.map(i => `<option value="${konumEsc(i)}">${konumEsc(i)}</option>`).join('');
        };
      }
    },
    preConfirm: () => {
      const yeniIl = document.getElementById('konum-ed-il')?.value;
      const yeniIlce = document.getElementById('konum-ed-ilce')?.value;
      const yeniMahalle = document.getElementById('konum-ed-mahalle')?.value;
      if (!yeniIl || !yeniIlce || !String(yeniMahalle || '').trim()) {
        Swal.showValidationMessage('Tüm alanları doldurun');
        return false;
      }
      return { yeniIl: konumNorm(yeniIl), yeniIlce: konumNorm(yeniIlce), yeniMahalle: konumNorm(yeniMahalle) };
    }
  });
  if (!r.isConfirmed) {
    konumTanimlariModalAc(geri.il, geri.ilce, { fromKurum: geri.fromKurum, sekme: geri.sekme });
    return;
  }
  await konumGuncelle({
    tip: 'mahalle',
    eskiIl: data.il,
    eskiIlce: data.ilce,
    eskiMahalle: data.mahalle,
    yeniIl: r.value.yeniIl,
    yeniIlce: r.value.yeniIlce,
    yeniMahalle: r.value.yeniMahalle,
    kimlik: data.kimlik || null
  });
  konumTanimlariModalAc(geri.il, geri.ilce, { fromKurum: geri.fromKurum, sekme: geri.sekme });
}

async function konumEkle() {
  const tip = konumTanimState.sekme;
  let body = {};
  let url = '/api/konum-yonetim/';
  if (tip === 'il') {
    const il = konumNorm(document.getElementById('konum-yeni-il')?.value);
    if (!il) {
      konumToast.fire({ icon: 'warning', title: 'İl adı girin' });
      return;
    }
    body = { il };
    url += 'il';
  } else if (tip === 'ilce') {
    const il = konumFiltIl();
    const ilce = konumNorm(document.getElementById('konum-yeni-ad')?.value);
    if (!il || !ilce) {
      konumToast.fire({ icon: 'warning', title: 'İl seçin ve ilçe adı girin' });
      return;
    }
    body = { il, ilce };
    url += 'ilce';
  } else {
    const il = konumFiltIl();
    const ilce = konumFiltIlce();
    const mahalle = konumNorm(document.getElementById('konum-yeni-ad')?.value);
    if (!il || !ilce || !mahalle) {
      konumToast.fire({ icon: 'warning', title: 'İl, ilçe seçin ve mahalle/köy adı girin' });
      return;
    }
    body = { il, ilce, mahalle };
    url += 'mahalle';
  }
  const d = await konumApiJson(url, { method: 'POST', headers: konumAuthHdr(), body: JSON.stringify(body) });
  if (!d.success) {
    konumToast.fire({ icon: 'error', title: d.message || 'Eklenemedi' });
    return;
  }
  if (tip === 'il') document.getElementById('konum-yeni-il').value = '';
  else document.getElementById('konum-yeni-ad').value = '';
  await konumIlleriYukle(konumFiltIl(), konumFiltIlce());
  konumSekmeAktif(tip);
  konumToast.fire({ icon: 'success', title: d.message || 'Eklendi' });
}

async function konumSil(data) {
  const geri = konumMevcutBaglam();
  const tip = data.tip;
  let mesaj = 'Bu kaydı silmek istediğinize emin misiniz?';
  if (tip === 'il') mesaj = `"${data.il}" ilini silmek istediğinize emin misiniz? (Bağlı ilçe varsa silinmez)`;
  else if (tip === 'ilce') mesaj = `"${data.ilce}" ilçesini silmek istediğinize emin misiniz?`;
  else mesaj = `"${data.mahalle}" mahalle/köyünü silmek istediğinize emin misiniz?`;
  const onay = await Swal.fire({ title: 'Silinsin mi?', text: mesaj, icon: 'warning', showCancelButton: true, confirmButtonColor: '#c62828', confirmButtonText: 'Sil', cancelButtonText: 'Vazgeç' });
  if (!onay.isConfirmed) {
    konumTanimlariModalAc(geri.il, geri.ilce, { fromKurum: geri.fromKurum, sekme: geri.sekme });
    return;
  }
  let url = '/api/konum-yonetim/' + tip;
  const body = { il: data.il, ilce: data.ilce, mahalle: data.mahalle, kimlik: data.kimlik || null };
  const d = await konumApiJson(url, { method: 'DELETE', headers: konumAuthHdr(), body: JSON.stringify(body) });
  if (!d.success) {
    konumToast.fire({ icon: 'error', title: d.message || 'Silinemedi' });
    konumTanimlariModalAc(geri.il, geri.ilce, { fromKurum: geri.fromKurum, sekme: geri.sekme });
    return;
  }
  konumToast.fire({ icon: 'success', title: d.message || 'Silindi' });
  konumTanimlariModalAc(geri.il, geri.ilce, { fromKurum: geri.fromKurum, sekme: geri.sekme });
}

function konumTanimlariBaslat(varsayilanIl, varsayilanIlce, sekme = 'mahalle') {
  document.querySelectorAll('.konum-sekme-btn').forEach(btn => {
    btn.onclick = () => konumSekmeAktif(btn.dataset.sekme);
  });
  const filIl = document.getElementById('konum-filt-il');
  const filIlce = document.getElementById('konum-filt-ilce');
  if (filIl) filIl.onchange = async () => { await konumIlceleriYukle(); konumListele(); };
  if (filIlce) filIlce.onchange = () => konumListele();
  const ekleBtn = document.getElementById('konum-ekle-btn');
  if (ekleBtn) ekleBtn.onclick = () => konumEkle();
  const yeniAd = document.getElementById('konum-yeni-ad');
  if (yeniAd) yeniAd.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); konumEkle(); } };
  const yeniIl = document.getElementById('konum-yeni-il');
  if (yeniIl) yeniIl.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); konumEkle(); } };
  konumIlleriYukle(varsayilanIl, varsayilanIlce).then(() => konumSekmeAktif(sekme));
}

function konumTanimlariHtml() {
  return `
        <div id="swal-konum-panel" style="text-align:left;font-family:sans-serif;padding:4px 2px;">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;flex-wrap:wrap;gap:8px;">
                <p style="font-size:12px;color:#555;margin:0;line-height:1.45;flex:1;min-width:220px;">Formlardaki il, ilçe ve mahalle/köy listeleri buradan yönetilir. Önce il, sonra ilçe, en son mahalle/köy ekleyin.</p>
                <span id="konum-sayac" style="font-size:12px;color:#006400;background:#eef6ee;padding:4px 12px;border-radius:20px;border:1px solid #b8d4c4;font-weight:700;">—</span>
            </div>
            <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;">
                <button type="button" class="konum-sekme-btn" data-sekme="il" style="flex:1;min-width:100px;padding:10px 14px;border:1px solid #006400;border-radius:8px;background:#fff;color:#006400;font-weight:700;font-size:13px;cursor:pointer;">İl</button>
                <button type="button" class="konum-sekme-btn" data-sekme="ilce" style="flex:1;min-width:100px;padding:10px 14px;border:1px solid #006400;border-radius:8px;background:#fff;color:#006400;font-weight:700;font-size:13px;cursor:pointer;">İlçe</button>
                <button type="button" class="konum-sekme-btn aktif" data-sekme="mahalle" style="flex:1;min-width:100px;padding:10px 14px;border:1px solid #006400;border-radius:8px;background:#006400;color:#fff;font-weight:700;font-size:13px;cursor:pointer;">Mahalle / Köy</button>
            </div>
            <div style="display:flex;gap:12px;margin-bottom:12px;flex-wrap:wrap;">
                <div style="flex:1;min-width:180px;">
                    <label style="font-size:12px;font-weight:bold;color:#333;display:block;margin-bottom:4px;">Filtre — İl</label>
                    <select id="konum-filt-il" style="width:100%;padding:10px;border:1px solid #ccc;border-radius:8px;font-size:13px;"></select>
                </div>
                <div id="konum-filt-ilce-wrap" style="flex:1;min-width:180px;">
                    <label style="font-size:12px;font-weight:bold;color:#333;display:block;margin-bottom:4px;">Filtre — İlçe</label>
                    <select id="konum-filt-ilce" style="width:100%;padding:10px;border:1px solid #ccc;border-radius:8px;font-size:13px;"></select>
                </div>
            </div>
            <div id="konum-liste" style="max-height:min(52vh,480px);overflow-y:auto;background:#fff;border:1px solid #d0ddd0;border-radius:8px;margin-bottom:12px;box-shadow:inset 0 1px 4px rgba(0,0,0,0.04);"></div>
            <p style="font-size:11px;color:#888;margin:-6px 0 10px;"><i class="fas fa-info-circle"></i> Düzenlemek için satıra <b>çift tıklayın</b>.</p>
            <div id="konum-yeni-il-wrap" style="display:none;margin-bottom:10px;">
                <input id="konum-yeni-il" type="text" placeholder="Yeni il adı yazın..." style="width:100%;padding:11px 12px;border:1px solid #ccc;border-radius:8px;font-size:14px;box-sizing:border-box;">
            </div>
            <div style="display:flex;gap:8px;align-items:stretch;">
                <input id="konum-yeni-ad" type="text" placeholder="Yeni mahalle/köy adı yazın..." style="flex:1;padding:11px 12px;border:1px solid #ccc;border-radius:8px;font-size:14px;">
                <button type="button" id="konum-ekle-btn" style="white-space:nowrap;padding:11px 22px;background:#006400;color:#fff;border:none;border-radius:8px;font-weight:700;font-size:14px;cursor:pointer;"><i class="fas fa-plus"></i> Ekle</button>
            </div>
            <p id="konum-mahalle-bilgi" style="font-size:11px;color:#888;margin:8px 0 0;">Mahalle/köy eklerken üstteki il ve ilçe filtreleri kullanılır. İlçe filtresi boş bırakılırsa seçili ildeki tüm mahalleler listelenir.</p>
        </div>`;
}

/** Kurum tanımlarından veya doğrudan çağrılır — geniş modal */
function konumTanimlariModalAc(varsayilanIl, varsayilanIlce, opts = {}) {
  const fromKurum = opts.fromKurum !== undefined ? opts.fromKurum : konumAcilisBaglami.fromKurum;
  const sekme = opts.sekme || 'mahalle';
  konumAcilisBaglami = {
    fromKurum,
    varsayilanIl: varsayilanIl || '',
    varsayilanIlce: varsayilanIlce || '',
    sekme
  };
  Swal.fire({
    title: '<span style="color:#004d00;"><i class="fas fa-map-marked-alt"></i> Mahalle / Köy Tanımlamaları</span>',
    width: 980,
    html: konumTanimlariHtml(),
    showConfirmButton: false,
    showCancelButton: true,
    cancelButtonText: 'Kapat',
    focusCancel: false,
    customClass: { popup: 'konum-tanim-genis-modal', htmlContainer: 'konum-tanim-html' },
    didOpen: () => konumTanimlariBaslat(varsayilanIl || '', varsayilanIlce || '', sekme)
  }).then((result) => {
    if (result.dismiss && konumAcilisBaglami.fromKurum && typeof tanimlarModalAc === 'function') {
      tanimlarModalAc();
    }
  });
}
