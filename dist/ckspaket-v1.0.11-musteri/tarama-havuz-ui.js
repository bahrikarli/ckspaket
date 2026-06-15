/** Ortak havuzdan kullanıcıya ait PDF seçimi (büyük okunabilir önizleme). */
async function taramaHavuzListesiAl(token) {
    const t = token || localStorage.getItem('token');
    const res = await fetch('/api/tarama-havuz-listesi', {
        headers: { Authorization: 'Bearer ' + t }
    });
    return res.json();
}

function havuzDosyaAdiEsc(s) {
    return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/"/g, '&quot;');
}

function havuzOnizlemeUrl(d) {
    if (d.onizlemeUrl) return d.onizlemeUrl;
    return '/pdf-arsivi/' + encodeURIComponent(d.dosya);
}

function havuzPdfIframeSrc(d) {
    return havuzOnizlemeUrl(d) + '#toolbar=0&navpanes=0&scrollbar=1&page=1&zoom=page-width';
}

function havuzBuyukOnizlemeGuncelle(meta) {
    const wrap = document.getElementById('havuzBuyukIframeWrap');
    const baslik = document.getElementById('havuzBuyukBaslik');
    if (!wrap || !meta) return;
    if (baslik) baslik.textContent = meta.dosya;
    wrap.innerHTML = `<iframe src="${havuzPdfIframeSrc(meta)}" title="Büyük önizleme"></iframe>`;
}

function havuzKartSec(kart, meta, list) {
    document.querySelectorAll('.havuz-sec-kart').forEach((k) => k.classList.remove('secili'));
    kart.classList.add('secili');
    havuzBuyukOnizlemeGuncelle(meta);
    return decodeURIComponent(kart.getAttribute('data-dosya-raw') || '');
}

async function taramaHavuzDosyaSec(opts) {
    opts = opts || {};
    const token = opts.token || localStorage.getItem('token');
    const Sw = typeof Swal !== 'undefined' ? Swal : null;

    if (opts.loading !== false && Sw) {
        Sw.fire({
            title: 'Havuz kontrol ediliyor…',
            html: 'PDF listesi alınıyor.',
            allowOutsideClick: false,
            didOpen: () => Sw.showLoading()
        });
    }

    let data;
    try {
        data = await taramaHavuzListesiAl(token);
    } catch (e) {
        if (Sw) Sw.close();
        if (Sw) await Sw.fire('Bağlantı Hatası', 'Sunucuya ulaşılamadı.', 'error');
        else alert('Sunucuya ulaşılamadı.');
        return null;
    }

    if (Sw) Sw.close();

    if (!data.success) {
        const msg = data.message || 'Havuz okunamadı.';
        if (Sw) await Sw.fire('Hata', msg, 'error');
        else alert(msg);
        return null;
    }

    const list = data.dosyalar || [];
    if (!list.length) {
        const msg = 'Havuzda size ait PDF bulunamadı.';
        if (Sw) await Sw.fire('Hata', msg, 'error');
        else alert(msg);
        return null;
    }

    if (list.length === 1) return list[0].dosya;

    let secilen = null;
    const kartlar = list.map((d, i) => {
        const ad = havuzDosyaAdiEsc(d.dosya);
        return `
            <div class="havuz-sec-kart" data-dosya-raw="${encodeURIComponent(d.dosya)}" data-list-idx="${i}">
                <div class="havuz-kucuk-onizleme">
                    <iframe src="${havuzPdfIframeSrc(d)}" title="${ad}" loading="lazy"></iframe>
                </div>
                <div class="havuz-sec-bilgi">
                    <div class="havuz-sec-ad">${ad}</div>
                    <div class="havuz-sec-meta">${d.sayfa ? d.sayfa + ' sayfa' : ''}${d.boyutKb ? ' · ' + d.boyutKb + ' KB' : ''}</div>
                </div>
            </div>`;
    }).join('');

    if (!Sw) {
        const ad = prompt('Havuzda ' + list.length + ' PDF var. Dosya adını yazın:\n' + list.map((x) => x.dosya).join('\n'));
        return ad && list.some((x) => x.dosya === ad) ? ad : null;
    }

    const sonuc = await Sw.fire({
        title: 'Havuzdan Tarama Seçin',
        html: `
            <p class="havuz-sec-aciklama">Alttaki küçük kartlara tıklayın — üstte <b>büyük önizleme</b> açılır. Okuyup <b>Seçileni Ekle</b> deyin.</p>
            <div id="havuzBuyukOnizle">
                <div id="havuzBuyukBaslik" class="havuz-buyuk-baslik">${havuzDosyaAdiEsc(list[0].dosya)}</div>
                <div id="havuzBuyukIframeWrap"><span class="havuz-yukleniyor">Yükleniyor…</span></div>
            </div>
            <div id="havuzSecGrid">${kartlar}</div>
        `,
        width: Math.min(window.innerWidth * 0.97, 1280),
        padding: '0.6em 0.9em 0.9em',
        showCancelButton: true,
        confirmButtonText: 'Seçileni Ekle',
        cancelButtonText: 'Vazgeç',
        confirmButtonColor: '#1a5928',
        customClass: {
            popup: 'havuz-sec-swal-popup',
            htmlContainer: 'havuz-sec-swal-html',
            actions: 'havuz-sec-swal-actions'
        },
        didOpen: () => {
            secilen = list[0].dosya;
            havuzBuyukOnizlemeGuncelle(list[0]);
            document.querySelectorAll('.havuz-sec-kart').forEach((kart) => {
                const idx = parseInt(kart.getAttribute('data-list-idx'), 10);
                const meta = list[idx];
                if (idx === 0) kart.classList.add('secili');
                kart.addEventListener('click', () => {
                    secilen = havuzKartSec(kart, meta, list);
                });
            });
        },
        preConfirm: () => {
            if (!secilen) {
                Sw.showValidationMessage('Lütfen bir tarama seçin');
                return false;
            }
            return secilen;
        }
    });

    return sonuc.isConfirmed ? sonuc.value : null;
}

(function havuzSecStilEnjekte() {
    if (typeof document === 'undefined') return;
    let st = document.getElementById('havuzSecSwalStil');
    if (!st) {
        st = document.createElement('style');
        st.id = 'havuzSecSwalStil';
        document.head.appendChild(st);
    }
    st.textContent = `
        .havuz-sec-swal-popup {
            width: min(97vw, 1280px) !important;
            max-width: min(97vw, 1280px) !important;
            max-height: 94vh !important;
            overflow: hidden !important;
            display: flex !important;
            flex-direction: column !important;
        }
        .havuz-sec-swal-html {
            overflow: hidden !important;
            max-height: calc(94vh - 118px) !important;
            margin: 0 !important;
            padding: 0 2px !important;
            box-sizing: border-box !important;
        }
        .havuz-sec-swal-actions { margin-top: 6px !important; flex-shrink: 0 !important; }
        .havuz-sec-aciklama {
            font-size: 13px; color: #444; margin: 0 0 8px; text-align: left; line-height: 1.4;
        }
        #havuzBuyukOnizle {
            border: 2px solid #c8e6c9;
            border-radius: 10px;
            overflow: hidden;
            background: #fafafa;
            margin-bottom: 10px;
            flex-shrink: 0;
        }
        .havuz-buyuk-baslik {
            background: linear-gradient(180deg, #e8f5e9, #f1f8f2);
            padding: 7px 12px;
            font-size: 12px;
            font-weight: 700;
            color: #1b5e20;
            border-bottom: 1px solid #c8e6c9;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        #havuzBuyukIframeWrap {
            width: 100%;
            height: min(52vh, 620px);
            min-height: 380px;
            background: #eceff1;
            position: relative;
            box-sizing: border-box;
        }
        #havuzBuyukIframeWrap .havuz-yukleniyor {
            position: absolute; inset: 0;
            display: flex; align-items: center; justify-content: center;
            color: #78909c; font-size: 13px;
        }
        #havuzBuyukIframeWrap iframe {
            width: 100%;
            height: 100%;
            border: none;
            display: block;
            background: #fff;
        }
        #havuzSecGrid {
            display: flex;
            gap: 10px;
            overflow-x: auto;
            overflow-y: hidden;
            max-width: 100%;
            padding: 2px 2px 6px;
            box-sizing: border-box;
        }
        #havuzSecGrid::-webkit-scrollbar { height: 8px; }
        #havuzSecGrid::-webkit-scrollbar-thumb { background: #90a4ae; border-radius: 4px; }
        .havuz-sec-kart {
            flex: 0 0 200px;
            width: 200px;
            box-sizing: border-box;
            border: 2px solid #cfd8dc;
            border-radius: 8px;
            padding: 6px;
            cursor: pointer;
            background: #fff;
            transition: border-color 0.15s, box-shadow 0.15s;
            overflow: hidden;
        }
        .havuz-sec-kart.secili {
            border-color: #27ae60;
            box-shadow: 0 0 0 2px rgba(39,174,96,0.35);
            background: #f1fbf3;
        }
        .havuz-kucuk-onizleme {
            width: 100%;
            height: 140px;
            background: #eceff1;
            border-radius: 5px;
            overflow: hidden;
            pointer-events: none;
        }
        .havuz-kucuk-onizleme iframe {
            width: 100%;
            height: 100%;
            border: none;
            display: block;
            background: #fff;
            pointer-events: none;
        }
        .havuz-sec-bilgi { margin-top: 6px; min-width: 0; }
        .havuz-sec-ad {
            font-size: 10px; font-weight: 700; color: #1a5928;
            word-break: break-all; line-height: 1.2;
            display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
        }
        .havuz-sec-meta { font-size: 9px; color: #666; margin-top: 3px; }
    `;
})();

if (typeof window !== 'undefined') {
    window.taramaHavuzDosyaSec = taramaHavuzDosyaSec;
    window.taramaHavuzListesiAl = taramaHavuzListesiAl;
}
