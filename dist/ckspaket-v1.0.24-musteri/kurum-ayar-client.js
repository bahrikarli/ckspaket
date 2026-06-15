/** Tanımlamalardaki il / ilçe — formlarda varsayılan konum */
(function (global) {
  const VARSAYILAN = { il_adi: 'KONYA', ilce_adi: 'SARAYÖNÜ' };
  global.kurumAyar = Object.assign({}, VARSAYILAN, global.kurumAyar || {});
  let yukleme = null;

  function norm(s) {
    return String(s || '').trim().toLocaleUpperCase('tr-TR');
  }

  function kurumIlBuyuk() {
    return norm(global.kurumAyar.il_adi || VARSAYILAN.il_adi);
  }

  function kurumIlceBuyuk() {
    return norm(global.kurumAyar.ilce_adi || VARSAYILAN.ilce_adi);
  }

  function kurumIlSec(liste) {
    const hedef = kurumIlBuyuk();
    if (!Array.isArray(liste)) return hedef;
    const bul = liste.find(x => norm(x.İL || x.il) === hedef);
    return bul ? String(bul.İL || bul.il).trim() : hedef;
  }

  function kurumIlceSec(liste, il) {
    const hedefIl = norm(il || kurumIlBuyuk());
    const hedefIlce = kurumIlceBuyuk();
    if (!Array.isArray(liste)) return hedefIlce;
    const bul = liste.find(x => norm(x.İL || x.il) === hedefIl && norm(x.İLÇE || x.ilce) === hedefIlce);
    return bul ? String(bul.İLÇE || bul.ilce).trim() : hedefIlce;
  }

  async function kurumAyarYukle() {
    if (yukleme) return yukleme;
    yukleme = (async () => {
      try {
        const token = global.localStorage && global.localStorage.getItem('token');
        const hdrs = {};
        if (token) hdrs.Authorization = 'Bearer ' + token;
        let res = await fetch('/api/kurum-ayarlari', { headers: hdrs, cache: 'no-store' });
        if (res.ok) {
          const sonuc = await res.json();
          if (sonuc && sonuc.success && sonuc.data) {
            Object.assign(global.kurumAyar, sonuc.data);
            return global.kurumAyar;
          }
        }
        res = await fetch('/api/kurum-genel', { cache: 'no-store' });
        if (res.ok) {
          const d = await res.json();
          if (d && d.success) Object.assign(global.kurumAyar, d);
        }
      } catch (_) {}
      return global.kurumAyar;
    })();
    return yukleme;
  }

  global.kurumIlBuyuk = kurumIlBuyuk;
  global.kurumIlceBuyuk = kurumIlceBuyuk;
  global.kurumIlSec = kurumIlSec;
  global.kurumIlceSec = kurumIlceSec;
  global.kurumAyarYukle = kurumAyarYukle;

  if (global.document) {
    const baslat = () => { kurumAyarYukle(); };
    if (global.document.readyState === 'loading') {
      global.document.addEventListener('DOMContentLoaded', baslat);
    } else {
      baslat();
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);
