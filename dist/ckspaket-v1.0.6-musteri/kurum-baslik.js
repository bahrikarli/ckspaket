/** Giriş ve genel sayfalarda kurum adını tanımlamalardan (ayarlar.kurum_adi) yükler */
async function kurumBaslikYukle(opts) {
  opts = opts || {};
  const el = opts.el || document.getElementById('kurum-baslik');
  const titleSuffix = opts.titleSuffix != null ? opts.titleSuffix : '';
  try {
    const res = await fetch('/api/kurum-genel');
    const data = await res.json();
    if (!data.success || !data.kurum_adi) return;
    const ad = String(data.kurum_adi).trim();
    if (el) el.textContent = ad;
    if (titleSuffix) document.title = ad + titleSuffix;
  } catch (_) {}
}
