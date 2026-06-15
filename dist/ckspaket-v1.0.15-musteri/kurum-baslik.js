/** Giriş ve genel sayfalarda kurum adını tanımlamalardan (ayarlar.kurum_adi) yükler */
async function kurumBaslikYukle(opts) {
  opts = opts || {};
  const titleSuffix = opts.titleSuffix != null ? opts.titleSuffix : '';
  let data = null;

  try {
    const res = await fetch('/api/kurum-genel', { cache: 'no-store' });
    if (res.ok) data = await res.json();
  } catch (_) {}

  if ((!data || !data.success || !String(data.kurum_adi || '').trim()) && typeof localStorage !== 'undefined') {
    const token = localStorage.getItem('token');
    if (token) {
      try {
        const res = await fetch('/api/kurum-ayarlari', {
          headers: { Authorization: 'Bearer ' + token },
          cache: 'no-store'
        });
        if (res.ok) {
          const j = await res.json();
          if (j && j.success && j.data) {
            data = {
              success: true,
              kurum_adi: j.data.kurum_adi,
              ortak_kurum_adi: j.data.ortak_kurum_adi,
              ilce_adi: j.data.ilce_adi,
              il_adi: j.data.il_adi
            };
          }
        }
      } catch (_) {}
    }
  }

  if (!data || !data.success || !String(data.kurum_adi || '').trim()) return;

  const ad = String(data.kurum_adi).trim();
  const hedefler = opts.el
    ? [opts.el]
    : Array.from(document.querySelectorAll('#kurum-baslik, .dinamik-kurum'));
  hedefler.forEach((el) => {
    if (el) el.textContent = ad;
  });
  if (titleSuffix) document.title = ad + titleSuffix;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => kurumBaslikYukle());
} else {
  kurumBaslikYukle();
}
