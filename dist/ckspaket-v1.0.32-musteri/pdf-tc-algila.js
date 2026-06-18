/**
 * PDF metninden / OCR (1. sayfa) / dosya adından TC ve isim çıkarma
 */
const fs = require('fs');

let ocrWorker = null;
let ocrWorkerHazirlaniyor = null;

function sadeceRakam(s) {
  return String(s || '').replace(/\D/g, '');
}

function gecerliTc(tc) {
  const t = sadeceRakam(tc);
  if (!/^[1-9][0-9]{10}$/.test(t)) return false;
  const d = t.split('').map(Number);
  const h10 = ((d[0] + d[2] + d[4] + d[6] + d[8]) * 7 - (d[1] + d[3] + d[5] + d[7])) % 10;
  if (h10 !== d[9]) return false;
  const h11 = d.slice(0, 10).reduce((a, b) => a + b, 0) % 10;
  return h11 === d[10];
}

function metindenTcBul(metin) {
  if (!metin) return null;
  const parcalar = metin.replace(/[^\d]+/g, ' ').split(/\s+/).filter(Boolean);
  for (const p of parcalar) {
    if (p.length === 11 && gecerliTc(p)) return p;
    if (p.length > 11) {
      for (let i = 0; i <= p.length - 11; i++) {
        const sub = p.slice(i, i + 11);
        if (gecerliTc(sub)) return sub;
      }
    }
  }
  return null;
}

function metindenIsimBul(metin, tc) {
  if (!metin) return '';
  const m = String(metin).replace(/\r/g, '\n');

  const labelRe = /(?:Ad[ıi]\s*Soyad[ıi]|Ad\s+Soyad|ADI\s+SOYADI)\s*[:\-]?\s*([A-ZÇĞİÖŞÜ][A-ZÇĞİÖŞÜa-zçğıöşü\s.'-]{2,60})/i;
  const lm = m.match(labelRe);
  if (lm) return lm[1].trim().replace(/\s+/g, ' ');

  if (tc) {
    const idx = m.indexOf(tc);
    if (idx > 0) {
      const once = m.slice(Math.max(0, idx - 160), idx);
      const satirlar = once.split('\n').map((s) => s.trim()).filter(Boolean);
      for (let i = satirlar.length - 1; i >= 0; i--) {
        const s = satirlar[i];
        if (/^(?:T\.?C\.?|Kimlik|TC|Vergi)/i.test(s)) continue;
        if (/^[A-ZÇĞİÖŞÜ][A-ZÇĞİÖŞÜa-zçğıöşü]+(?:\s+[A-ZÇĞİÖŞÜ][A-ZÇĞİÖŞÜa-zçğıöşü]+){1,4}$/.test(s)) return s;
        if (/^[A-ZÇĞİÖŞÜ\s.'-]{4,50}$/.test(s) && !/\d{5,}/.test(s)) return s.trim();
      }
    }
  }
  return '';
}

function dosyadanKimlikNoCikar(dosyaAdi) {
  const base = String(dosyaAdi || '').replace(/\.pdf$/i, '');
  const parcalar = base.split('-').reverse();
  for (const p of parcalar) {
    const n = sadeceRakam(p);
    if (n.length === 11 && gecerliTc(n)) return { tc: n, vergino: null };
    if (n.length === 10) return { tc: null, vergino: n };
  }
  const tum = sadeceRakam(base);
  if (tum.length >= 11) {
    for (let i = 0; i <= tum.length - 11; i++) {
      const parca = tum.slice(i, i + 11);
      if (gecerliTc(parca)) return { tc: parca, vergino: null };
    }
  }
  if (tum.length >= 10) {
    const son10 = tum.slice(-10);
    if (son10.length === 10) return { tc: null, vergino: son10 };
  }
  return null;
}

function metinKatmanindanOku(sonuc) {
  if (typeof sonuc === 'string') return sonuc;
  if (sonuc && typeof sonuc.text === 'string') return sonuc.text;
  if (sonuc?.pages?.length) return sonuc.pages.map((p) => p.text || '').join('\n');
  return '';
}

function screenshotToBuffer(page) {
  if (!page) return null;
  const d = page.data ?? page.imageBuffer ?? page;
  if (Buffer.isBuffer(d)) return d;
  if (d instanceof Uint8Array) return Buffer.from(d);
  if (d && typeof d === 'object') return Buffer.from(Object.values(d));
  return null;
}

async function ocrWorkerAl() {
  if (ocrWorker) return ocrWorker;
  if (ocrWorkerHazirlaniyor) return ocrWorkerHazirlaniyor;
  ocrWorkerHazirlaniyor = (async () => {
    const { createWorker } = require('tesseract.js');
    const w = await createWorker('tur+eng', 1, { logger: () => {} });
    ocrWorker = w;
    ocrWorkerHazirlaniyor = null;
    return w;
  })();
  return ocrWorkerHazirlaniyor;
}

async function pdfMetinOku(pdfYol) {
  try {
    const buf = fs.readFileSync(pdfYol);
    const { PDFParse } = require('pdf-parse');
    const parser = new PDFParse(new Uint8Array(buf));
    const sonuc = await parser.getText();
    if (typeof parser.destroy === 'function') await parser.destroy();
    return metinKatmanindanOku(sonuc);
  } catch (_) {
    return '';
  }
}

/** Yalnızca 1. sayfa — taranmış PDF için OCR */
async function pdfIlkSayfaOcr(pdfYol) {
  try {
    const buf = fs.readFileSync(pdfYol);
    const { PDFParse } = require('pdf-parse');
    const parser = new PDFParse(new Uint8Array(buf));
    const shot = await parser.getScreenshot({ partial: [1], desiredWidth: 1500 });
    if (typeof parser.destroy === 'function') await parser.destroy();

    const png = screenshotToBuffer(shot?.pages?.[0]);
    if (!png || png.length < 80) return '';

    const worker = await ocrWorkerAl();
    const { data } = await worker.recognize(png);
    return String(data?.text || '').trim();
  } catch (err) {
    console.warn('PDF OCR (1. sayfa):', err.message);
    return '';
  }
}

function pdfIcerikAlgila(metin, dosyaAdi, kaynakZorla) {
  let tc = metindenTcBul(metin);
  let vergino = null;
  let kaynak = kaynakZorla || 'pdf_metin';
  let adSoyad = metindenIsimBul(metin, tc);

  if (!tc) {
    const dosyadan = dosyadanKimlikNoCikar(dosyaAdi);
    if (dosyadan) {
      tc = dosyadan.tc;
      vergino = dosyadan.vergino;
      kaynak = 'dosya_adi';
    }
  }

  if (!tc && !vergino && !adSoyad) {
    return {
      algilandi: false,
      tc: null,
      vergino: null,
      adSoyad: '',
      kaynak: null,
      guven: 'yok',
      metinVar: Boolean(String(metin || '').trim())
    };
  }

  let guven = kaynak === 'ocr' ? 'orta' : 'dusuk';
  if (kaynak === 'pdf_metin' && tc) guven = 'orta';
  if ((kaynak === 'pdf_metin' || kaynak === 'ocr') && tc && adSoyad) guven = 'orta';

  return {
    algilandi: true,
    tc,
    vergino,
    adSoyad,
    kaynak,
    guven,
    metinVar: Boolean(String(metin || '').trim())
  };
}

function algilamaYeterliMi(alg) {
  return Boolean(alg?.algilandi && (alg.tc || alg.vergino));
}

async function pdfDosyaAlgila(pdfYol, dosyaAdi) {
  const metinKatman = await pdfMetinOku(pdfYol);
  let algilama = pdfIcerikAlgila(metinKatman, dosyaAdi);
  let ocrKullanildi = false;

  const metinAz = String(metinKatman).replace(/\s+/g, '').length < 40;
  const tcYok = !algilama.tc && !algilama.vergino;

  if (!algilamaYeterliMi(algilama) || (metinAz && tcYok)) {
    const ocrMetin = await pdfIlkSayfaOcr(pdfYol);
    if (ocrMetin) {
      ocrKullanildi = true;
      const ocrAlg = pdfIcerikAlgila(ocrMetin, dosyaAdi, 'ocr');
      if (algilamaYeterliMi(ocrAlg) || (!algilamaYeterliMi(algilama) && ocrAlg.algilandi)) {
        algilama = ocrAlg;
      } else if (!algilama.adSoyad && ocrAlg.adSoyad) {
        algilama = { ...algilama, adSoyad: ocrAlg.adSoyad, kaynak: 'ocr' };
      }
    }
  }

  return {
    algilama,
    ocrKullanildi,
    metinKatmanVar: Boolean(String(metinKatman).trim())
  };
}

module.exports = {
  sadeceRakam,
  gecerliTc,
  metindenTcBul,
  metindenIsimBul,
  dosyadanKimlikNoCikar,
  pdfMetinOku,
  pdfIlkSayfaOcr,
  pdfIcerikAlgila,
  pdfDosyaAlgila
};
