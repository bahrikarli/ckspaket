/** Tanımlamalardaki kurum bilgisi (ayarlar tablosu) */

function alanOku(row, ad) {
  if (!row || typeof row !== 'object') return '';
  if (row[ad] != null && String(row[ad]).trim()) return String(row[ad]).trim();
  const key = Object.keys(row).find((k) => k.toLowerCase() === ad.toLowerCase());
  if (key && row[key] != null && String(row[key]).trim()) return String(row[key]).trim();
  return '';
}

async function kurumGenelOku(getPool) {
  try {
    const pool = await getPool();
    let result = await pool.request().query(`
      SELECT TOP 1 kurum_adi, ortak_kurum_adi, ilce_adi, il_adi
      FROM ayarlar
      WHERE NULLIF(LTRIM(RTRIM(kurum_adi)), '') IS NOT NULL
      ORDER BY id DESC
    `);
    if (!result.recordset.length) {
      result = await pool.request().query(`
        SELECT TOP 1 kurum_adi, ortak_kurum_adi, ilce_adi, il_adi
        FROM ayarlar ORDER BY id DESC
      `);
    }
    if (result.recordset.length > 0) {
      const row = result.recordset[0];
      return {
        success: true,
        kurum_adi: alanOku(row, 'kurum_adi'),
        ortak_kurum_adi: alanOku(row, 'ortak_kurum_adi'),
        ilce_adi: alanOku(row, 'ilce_adi'),
        il_adi: alanOku(row, 'il_adi')
      };
    }
  } catch (err) {
    console.warn('kurumGenelOku:', err.message);
  }
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
  html = html.replace(/(<h2[^>]*id="kurum-baslik"[^>]*>)\s*[.\u2026…]+\s*(<\/h2>)/i, `$1${esc}$2`);
  html = html.replace(/(<div[^>]*id="kurum-baslik"[^>]*>)\s*[.\u2026…]+\s*(<\/div>)/i, `$1${esc}$2`);
  if (titleSuffix != null && titleSuffix !== '') {
    html = html.replace(/(<title>)[\s\S]*?(<\/title>)/i, `$1${esc}${titleSuffix}$2`);
  }
  html = html.replace(/(<h2(?![^>]*\bid=)[^>]*>)\s*SARAYÖNÜ[^<]*(<\/h2>)/gi, `$1${esc}$2`);
  html = html.replace(/SARAYÖNÜ ZİRAAT ODASI BAŞKANLIĞI/gi, esc);
  html = html.replace(/SARAYÖNÜ ZİRAAT ODASI/gi, esc);
  html = html.replace(/Sarayönü Ziraat Odası/gi, esc);
  return html;
}

module.exports = { kurumGenelOku, htmlKurumEnjekte, htmlEsc, alanOku };
