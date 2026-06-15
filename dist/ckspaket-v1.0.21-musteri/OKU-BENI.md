# CKS Paket

Sade ofis sistemi — ana `c:\cks` projesinin hafif sürümü.

## Modüller

| Kart | Açıklama |
|------|----------|
| Personel Paneli | Kullanıcı yönetimi (admin) |
| Çiftçi Kayıt | `cks.html` + `dilekce.html`, formlar, eksikler vb. |
| Arşiv | Odalar + ÇKS Dosyaları (hangi klasör hangi odada) |
| Profilim | Ad, soyad, e-posta, şifre |
| Mesajlar | Personel arası mesajlaşma |

**Dahil değil:** Market, sıramatik, mesai, belgenet robot, demirbaş, yazışmalar vb.

## Kurulum

1. `.env` — SQL bağlantısı: varsayılan veritabanı **`ckspaketdata`** (ana CKS `demoanaa` ile karışmasın).
2. `.env` içinde **`PORT=3030`** olmalı (ana CKS'ten kopyaladıysanız 3000 kalmış olabilir).
3. `npm install`
4. `ckspaket-baslat.bat` veya `node server.js` — sunucu **port 3030**'da açılır.

## Adresler

- Yerel: http://127.0.0.1:3030
- Ağ: http://192.168.1.123:3030 (IP'yi `ckspaket-ayar.bat` içinde düzenleyin)

## Ana CKS'ten güncelleme (senkron)

`c:\cks` içinde değişiklik yaptıysanız:

| Ne | Komut (`c:\cks` içinde) |
|----|-------------------------|
| **İkisi birlikte** (belgenet + çiftçi paket) | `cks-guncelle.bat` |
| Sadece ckspaket (çiftçi kayıt) | `ckspaket-sync.bat` |
| Sadece yenıservercks (belgenet) | `yenıservercks-guncelle.bat` |

**Kopyalanır:** `server.js`, `cks.html`, `dilekce.html`, formlar, eksikler vb.  
**Korunur:** `anasayfa.html`, `arsiv.html`, `sistem-ayar.js`, `.env`, `taramalar/` içeriği  
**Otomatik yama:** port 3030, `C:\ckspaket\taramalar`, göreli PDF/API yolları

Senkron sonrası ckspaket sunucusunu yeniden başlatın.

## Oda resimleri

`public\img\odalar\1.jpg`, `2.jpg` … şeklinde kaydedin.

## ÇKS dosyaları

`VTÇKS` tablosu — her kayıt bir **klasör numarası (Alan1)** ve **oda** bilgisi tutar.  
Çiftçi kayıt ekranındaki Arşiv Analiz Paneli de aynı yıl klasör yollarını gösterir.

## Taramalar klasörü (boş şablon)

Paketle birlikte boş klasör yapısı gelir — PDF kopyalanmaz:

```
c:\ckspaket\taramalar\
  ckstaramalar\   ← tarama havuzu (personel adıyla başlayan PDF'ler)
  2026cks\        ← onaylanan yıllık arşiv
  2027cks\
  ib\             ← IB form arşivi
  ibtaramalar\    ← IB tarama havuzu
```

Varsayılan kök yol: `C:\ckspaket\taramalar` (`sistem-ayar.js` ve Çiftçi Kayıt → Tanımlamalar).  
Yeni yıl için `2028cks` gibi alt klasörü elle ekleyebilirsiniz.

### Ağ paylaşımı (tarayıcı UNC yolu)

`C:\ckspaket\taramalar` için ağ yolları **`\\SUNUCU-IP\ckspaket\taramalar\...`** şeklinde üretilir.

Sunucuda bir kez yapın:
1. `C:\ckspaket` klasörüne sağ tık → **Paylaş** → paylaşım adı: **`ckspaket`**
2. Tarayıcı kayıt yolu (tüm PC’lerde): `\\192.168.1.120\ckspaket\taramalar\ckstaramalar`

Eski ana CKS (`C:\cks\taramalar`) hâlâ `\\sunucu\cks\taramalar` olarak kalır.

## Müşteri kurulumu (SQL Express + localhost)

1. SQL Server 2022 Express kur → `MUSTERI-SQL-KURULUM.txt`
2. `ckspaket-musteri-surum.bat` ile paket oluştur (önce `ckspaket-sema-yedek-al.bat`)
3. Müşteriye `dist\ckspaket-vX-musteri.zip` ver
4. Müşteri: `C:\ckspaket` → `ckspaketdata-musteri-kur.bat` → `MUSTERI-KUR.bat`

Müşteri `.env`:
```
DB_SERVER=localhost
DB_USER=sa
DB_PASS=189189
DB_NAME=ckspaketdata
```

---

## Müşteri sürüm paketi (C:\ckspaket — kopyala çalıştır)

Müşteriye USB / ağ ile verilecek paket:

```
ckspaket-musteri-surum.bat
```

Oluşur:
- `dist\ckspaket-v1.0.1-musteri\` — klasör (C:\ckspaket'e kopyalanır)
- `dist\ckspaket-v1.0.1-musteri.zip` — aynı içerik ZIP

**Müşteri adımları:**
1. ZIP'i açıp içeriği **`C:\ckspaket`** klasörüne kopyalar
2. **`MUSTERI-KUR.bat`** çalıştırır (.env + npm install + sunucu açılır)
3. Tarayıcı: http://127.0.0.1:3030

Sonraki günler: **`ckspaket-baslat.bat`**  
Güncelleme: **`ckspaket-musteri-guncelle.bat`**

---

## Müşteri paketi oluşturma (TEK BAT — Git)

### İlk kez (bir defa) Git kurulumu

```bat
cd c:\ckspaket
git init
git remote add origin https://github.com/bahrikarli/ckspaket.git
git add .
git commit -m "Ilk surum"
git branch -M main
git push -u origin main
```

GitHub'da `ckspaket` adında boş repo oluşturun (veya kendi repo URL'nizi kullanın).

### Her yeni sürüm

```
ckspaket-yayinla.bat
```

Otomatik yapılanlar:
1. Ana CKS senkronu
2. Sürüm artırma (`1.0.0` → `1.0.1`)
3. **Git commit + push + tag** → müşteriler ana sayfada bildirim görür
4. Git yoksa ZIP yedek oluşturur

---

## Müşteri kurulumu (Git — önerilen)

```bat
git clone https://github.com/bahrikarli/ckspaket.git C:\ckspaket
cd C:\ckspaket
copy .env.example .env
npm install
ckspaket-baslat.bat
```

`.env` içinde (clone ile gelir veya elle ekleyin):

```
GIT_REPO_URL=https://github.com/bahrikarli/ckspaket.git
GIT_BRANCH=main
```

---

## Müşteri güncelleme (TEK BAT)

```
ckspaket-musteri-guncelle.bat
```

Git modunda otomatik:
1. GitHub'dan yeni sürümü kontrol eder
2. `git pull` ile indirir (`.env` + `taramalar/` korunur)
3. `npm install`
4. Sunucuyu yeniden başlatır

Siz `git push` yaptığınızda müşteri programı açıkken **“Yeni sürüm mevcut”** bildirimi görür.

### Program içinden (admin)

Ana sayfada **“Şimdi Güncelle”** → aynı bat otomatik çalışır.

---

## ZIP yedek yöntem (Git kullanmayanlar)

Git yoksa `.env` içine:

```
GUNCELLEME_URL=http://192.168.1.123:3030/guncellemeler/guncelleme.json
```

`ckspaket-yayinla.bat` Git bulamazsa otomatik ZIP oluşturur.
