-- Biçerdöver ruhsat tablosu (ckspaket / demoanaa)
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'bicerdover_ruhsat')
BEGIN
  CREATE TABLE dbo.bicerdover_ruhsat (
    id INT IDENTITY(1,1) PRIMARY KEY,
    tescil_sira_no NVARCHAR(50) NULL,
    belge_seri_no NVARCHAR(50) NULL,
    tescil_tarihi DATE NULL,
    tescil_plaka_no NVARCHAR(50) NULL,
    aracin_cinsi NVARCHAR(100) NULL,
    markasi NVARCHAR(100) NULL,
    tipi NVARCHAR(100) NULL,
    sasi_no NVARCHAR(100) NULL,
    motor_no NVARCHAR(100) NULL,
    motor_gucu NVARCHAR(50) NULL,
    model_yili NVARCHAR(20) NULL,
    yuruyus_takimi NVARCHAR(50) NULL,
    yuruyus_tk_ozellikleri NVARCHAR(200) NULL,
    yakit_cinsi NVARCHAR(50) NULL,
    diger_ozellikleri NVARCHAR(MAX) NULL,
    sahip_ad_soyad NVARCHAR(200) NULL,
    sahip_tc NVARCHAR(20) NULL,
    sahip_ana_adi NVARCHAR(100) NULL,
    sahip_baba_adi NVARCHAR(100) NULL,
    sahip_dogum_yeri NVARCHAR(100) NULL,
    sahip_dogum_tarihi NVARCHAR(50) NULL,
    sahip_adres NVARCHAR(MAX) NULL
  );
END
GO
