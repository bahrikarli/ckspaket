/** Giriş ve genel sayfalarda kurum adını tanımlamalardan (ayarlar.kurum_adi) yükler */
async function kurumBaslikYukle(opts) {
  opts = opts || {};
  const titleSuffix = opts.titleSuffix != null ? opts.titleSuffix : '';
  try {
    const res = await fetch('/api/kurum-genel', { cache: 'no-store' });
    const data = await res.json();
    if (!data.success || !data.kurum_adi) return;
    const ad = String(data.kurum_adi).trim();
    const hedefler = opts.el
      ? [opts.el]
      : Array.from(document.querySelectorAll('#kurum-baslik, .dinamik-kurum'));
    hedefler.forEach((el) => {
      if (el) el.textContent = ad;
    });
    if (titleSuffix) document.title = ad + titleSuffix;
  } catch (_) {}
}
