/** Tanımlamalardaki kurum bilgisi (ayarlar tablosu) */
async function kurumGenelOku(getPool) {
  try {
    const pool = await getPool();
    const result = await pool.request().query(
      'SELECT TOP 1 kurum_adi, ortak_kurum_adi, ilce_adi, il_adi FROM ayarlar ORDER BY id DESC'
    );
    if (result.recordset.length > 0) {
      const row = result.recordset[0];
      return {
        success: true,
        kurum_adi: String(row.kurum_adi || '').trim(),
        ortak_kurum_adi: String(row.ortak_kurum_adi || '').trim(),
        ilce_adi: String(row.ilce_adi || '').trim(),
        il_adi: String(row.il_adi || '').trim()
      };
    }
  } catch (_) {}
  return { success: true, kurum_adi: '', ortak_kurum_adi: '', ilce_adi: '', il_adi: '' };
}

function htmlEsc(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Giriş / ana sayfa HTML içine kurum adını yazar */
function htmlKurumEnjekte(html, kurumAdi, titleSuffix) {
  if (!kurumAdi) return html;
  const esc = htmlEsc(kurumAdi);
  html = html.replace(/(<h2[^>]*id="kurum-baslik"[^>]*>)[\s\S]*?(<\/h2>)/i, `$1${esc}$2`);
  html = html.replace(/(<div[^>]*id="kurum-baslik"[^>]*>)[\s\S]*?(<\/div>)/i, `$1${esc}$2`);
  if (titleSuffix != null && titleSuffix !== '') {
    html = html.replace(/(<title>)[\s\S]*?(<\/title>)/i, `$1${esc}${titleSuffix}$2`);
  }
  html = html.replace(/SARAYÖNÜ ZİRAAT ODASI BAŞKANLIĞI/gi, esc);
  html = html.replace(/SARAYÖNÜ ZİRAAT ODASI/gi, esc);
  html = html.replace(/Sarayönü Ziraat Odası/gi, esc);
  return html;
}

module.exports = { kurumGenelOku, htmlKurumEnjekte, htmlEsc };
