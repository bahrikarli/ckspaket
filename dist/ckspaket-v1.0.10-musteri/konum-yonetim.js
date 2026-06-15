/** İl / İlçe / Mahalle tanımları — kurum tanımlamaları ekranı */

function normKonum(s) {
  return String(s || '').trim().toLocaleUpperCase('tr-TR');
}

function hamKonum(s) {
  return String(s || '').trim();
}

async function tabloKimlikVar(pool, sql, tablo) {
  const r = await pool.request().input('t', sql.NVarChar, tablo).query(`
    SELECT TOP 1 c.name
    FROM sys.columns c
    INNER JOIN sys.tables t ON c.object_id = t.object_id
    WHERE t.name = @t AND c.name IN ('kimlik', 'Kimlik', 'KIMLIK', 'id', 'Id', 'ID')
  `);
  return r.recordset[0]?.name || null;
}

function registerKonumYonetim(app, opts) {
  const { getPool, authenticateToken, sadeceAdmin, sql } = opts;
  if (!app || !getPool) return;

  app.get('/api/konum-yonetim', authenticateToken, async (req, res) => {
    try {
      const pool = await getPool();
      const tip = String(req.query.tip || 'mahalle').toLowerCase();
      const ilF = normKonum(req.query.il);
      const ilceF = normKonum(req.query.ilce);

      if (tip === 'il') {
        const r = await pool.request().query(`
          SELECT DISTINCT LTRIM(RTRIM([İL])) AS il
          FROM [İL]
          WHERE [İL] IS NOT NULL AND LTRIM(RTRIM([İL])) <> ''
          ORDER BY il
        `);
        return res.json({ success: true, tip: 'il', liste: r.recordset.map(x => ({ il: x.il })) });
      }

      if (tip === 'ilce') {
        const reqDb = pool.request();
        let where = `WHERE [İL] IS NOT NULL AND LTRIM(RTRIM([İL])) <> ''`;
        if (ilF) {
          reqDb.input('il', sql.NVarChar, ilF);
          where += ` AND UPPER(LTRIM(RTRIM([İL]))) COLLATE Turkish_CI_AS = @il COLLATE Turkish_CI_AS`;
        }
        const r = await reqDb.query(`
          SELECT LTRIM(RTRIM([İL])) AS il, LTRIM(RTRIM([İLÇE])) AS ilce
          FROM [İLÇE]
          ${where}
          ORDER BY il, ilce
        `);
        return res.json({ success: true, tip: 'ilce', liste: r.recordset });
      }

      const kimlikKol = await tabloKimlikVar(pool, sql, 'planlıMAHALLE');
      const reqDb = pool.request();
      let where = `WHERE [MAHALLE] IS NOT NULL AND LTRIM(RTRIM([MAHALLE])) <> ''`;
      if (ilF) {
        reqDb.input('il', sql.NVarChar, ilF);
        where += ` AND UPPER(LTRIM(RTRIM([İL]))) COLLATE Turkish_CI_AS = @il COLLATE Turkish_CI_AS`;
      }
      if (ilceF) {
        reqDb.input('ilce', sql.NVarChar, ilceF);
        where += ` AND UPPER(LTRIM(RTRIM([İLÇE]))) COLLATE Turkish_CI_AS = @ilce COLLATE Turkish_CI_AS`;
      }
      const kimlikSel = kimlikKol ? `[${kimlikKol}] AS kimlik,` : '';
      const r = await reqDb.query(`
        SELECT ${kimlikSel}
          LTRIM(RTRIM([İL])) AS il,
          LTRIM(RTRIM([İLÇE])) AS ilce,
          LTRIM(RTRIM([MAHALLE])) AS mahalle
        FROM planlıMAHALLE
        ${where}
        ORDER BY il, ilce, mahalle
      `);
      res.json({ success: true, tip: 'mahalle', liste: r.recordset, kimlikKolon: !!kimlikKol });
    } catch (err) {
      console.error('konum-yonetim GET:', err.message);
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.post('/api/konum-yonetim/il', authenticateToken, sadeceAdmin, async (req, res) => {
    try {
      const il = normKonum(req.body.il);
      if (!il) return res.status(400).json({ success: false, message: 'İl adı boş olamaz.' });
      const pool = await getPool();
      const varMi = await pool.request().input('il', sql.NVarChar, il).query(`
        SELECT TOP 1 1 FROM [İL]
        WHERE UPPER(LTRIM(RTRIM([İL]))) COLLATE Turkish_CI_AS = @il COLLATE Turkish_CI_AS
      `);
      if (varMi.recordset.length) {
        return res.json({ success: false, message: 'Bu il zaten kayıtlı.' });
      }
      await pool.request().input('il', sql.NVarChar, il).query(`INSERT INTO [İL] ([İL]) VALUES (@il)`);
      res.json({ success: true, message: 'İl eklendi.' });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.post('/api/konum-yonetim/ilce', authenticateToken, sadeceAdmin, async (req, res) => {
    try {
      const il = normKonum(req.body.il);
      const ilce = normKonum(req.body.ilce);
      if (!il || !ilce) return res.status(400).json({ success: false, message: 'İl ve ilçe gerekli.' });
      const pool = await getPool();
      const varMi = await pool.request()
        .input('il', sql.NVarChar, il)
        .input('ilce', sql.NVarChar, ilce)
        .query(`
          SELECT TOP 1 1 FROM [İLÇE]
          WHERE UPPER(LTRIM(RTRIM([İL]))) COLLATE Turkish_CI_AS = @il COLLATE Turkish_CI_AS
            AND UPPER(LTRIM(RTRIM([İLÇE]))) COLLATE Turkish_CI_AS = @ilce COLLATE Turkish_CI_AS
        `);
      if (varMi.recordset.length) {
        return res.json({ success: false, message: 'Bu ilçe zaten kayıtlı.' });
      }
      await pool.request()
        .input('il', sql.NVarChar, il)
        .input('ilce', sql.NVarChar, ilce)
        .query(`INSERT INTO [İLÇE] ([İL], [İLÇE]) VALUES (@il, @ilce)`);
      res.json({ success: true, message: 'İlçe eklendi.' });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.post('/api/konum-yonetim/mahalle', authenticateToken, sadeceAdmin, async (req, res) => {
    try {
      const il = normKonum(req.body.il);
      const ilce = normKonum(req.body.ilce);
      const mahalle = normKonum(req.body.mahalle);
      if (!il || !ilce || !mahalle) {
        return res.status(400).json({ success: false, message: 'İl, ilçe ve mahalle/köy gerekli.' });
      }
      const pool = await getPool();
      const varMi = await pool.request()
        .input('il', sql.NVarChar, il)
        .input('ilce', sql.NVarChar, ilce)
        .input('mahalle', sql.NVarChar, mahalle)
        .query(`
          SELECT TOP 1 1 FROM planlıMAHALLE
          WHERE UPPER(LTRIM(RTRIM([İL]))) COLLATE Turkish_CI_AS = @il COLLATE Turkish_CI_AS
            AND UPPER(LTRIM(RTRIM([İLÇE]))) COLLATE Turkish_CI_AS = @ilce COLLATE Turkish_CI_AS
            AND UPPER(LTRIM(RTRIM([MAHALLE]))) COLLATE Turkish_CI_AS = @mahalle COLLATE Turkish_CI_AS
        `);
      if (varMi.recordset.length) {
        return res.json({ success: false, message: 'Bu mahalle/köy zaten kayıtlı.' });
      }
      await pool.request()
        .input('il', sql.NVarChar, il)
        .input('ilce', sql.NVarChar, ilce)
        .input('mahalle', sql.NVarChar, mahalle)
        .query(`INSERT INTO planlıMAHALLE ([İL], [İLÇE], [MAHALLE]) VALUES (@il, @ilce, @mahalle)`);
      res.json({ success: true, message: 'Mahalle/köy eklendi.' });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.put('/api/konum-yonetim/il', authenticateToken, sadeceAdmin, async (req, res) => {
    try {
      const eskiIlHam = hamKonum(req.body.eskiIl);
      const yeniIlHam = hamKonum(req.body.yeniIl);
      const eskiIl = normKonum(eskiIlHam);
      const yeniIl = normKonum(yeniIlHam);
      if (!eskiIl || !yeniIl) return res.status(400).json({ success: false, message: 'Eski ve yeni il adı gerekli.' });
      if (eskiIlHam === yeniIlHam) return res.json({ success: true, message: 'Değişiklik yok.' });
      const pool = await getPool();
      await pool.request().input('eski', sql.NVarChar, eskiIl).input('yeni', sql.NVarChar, yeniIl).query(`
        UPDATE [İLÇE] SET [İL] = @yeni
        WHERE UPPER(LTRIM(RTRIM([İL]))) COLLATE Turkish_CI_AS = @eski COLLATE Turkish_CI_AS;
        UPDATE planlıMAHALLE SET [İL] = @yeni
        WHERE UPPER(LTRIM(RTRIM([İL]))) COLLATE Turkish_CI_AS = @eski COLLATE Turkish_CI_AS;
        UPDATE [İL] SET [İL] = @yeni
        WHERE UPPER(LTRIM(RTRIM([İL]))) COLLATE Turkish_CI_AS = @eski COLLATE Turkish_CI_AS;
      `);
      res.json({ success: true, message: 'İl güncellendi.' });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.put('/api/konum-yonetim/ilce', authenticateToken, sadeceAdmin, async (req, res) => {
    try {
      const il = normKonum(req.body.il);
      const eskiIlceHam = hamKonum(req.body.eskiIlce);
      const yeniIlceHam = hamKonum(req.body.yeniIlce);
      const eskiIlce = normKonum(eskiIlceHam);
      const yeniIlce = normKonum(yeniIlceHam);
      if (!il || !eskiIlce || !yeniIlce) {
        return res.status(400).json({ success: false, message: 'İl ve ilçe adları gerekli.' });
      }
      if (eskiIlceHam === yeniIlceHam) return res.json({ success: true, message: 'Değişiklik yok.' });
      const pool = await getPool();
      await pool.request()
        .input('il', sql.NVarChar, il)
        .input('eski', sql.NVarChar, eskiIlce)
        .input('yeni', sql.NVarChar, yeniIlce)
        .query(`
          UPDATE planlıMAHALLE SET [İLÇE] = @yeni
          WHERE UPPER(LTRIM(RTRIM([İL]))) COLLATE Turkish_CI_AS = @il COLLATE Turkish_CI_AS
            AND UPPER(LTRIM(RTRIM([İLÇE]))) COLLATE Turkish_CI_AS = @eski COLLATE Turkish_CI_AS;
          UPDATE [İLÇE] SET [İLÇE] = @yeni
          WHERE UPPER(LTRIM(RTRIM([İL]))) COLLATE Turkish_CI_AS = @il COLLATE Turkish_CI_AS
            AND UPPER(LTRIM(RTRIM([İLÇE]))) COLLATE Turkish_CI_AS = @eski COLLATE Turkish_CI_AS;
        `);
      res.json({ success: true, message: 'İlçe güncellendi.' });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.put('/api/konum-yonetim/mahalle', authenticateToken, sadeceAdmin, async (req, res) => {
    try {
      const eskiIlHam = hamKonum(req.body.eskiIl);
      const eskiIlceHam = hamKonum(req.body.eskiIlce);
      const eskiMahalleHam = hamKonum(req.body.eskiMahalle);
      const yeniIlHam = hamKonum(req.body.yeniIl || req.body.eskiIl);
      const yeniIlceHam = hamKonum(req.body.yeniIlce || req.body.eskiIlce);
      const yeniMahalleHam = hamKonum(req.body.yeniMahalle);
      const eskiIl = normKonum(eskiIlHam);
      const eskiIlce = normKonum(eskiIlceHam);
      const eskiMahalle = normKonum(eskiMahalleHam);
      const yeniIl = normKonum(yeniIlHam);
      const yeniIlce = normKonum(yeniIlceHam);
      const yeniMahalle = normKonum(yeniMahalleHam);
      const kimlik = req.body.kimlik;
      if (!eskiIl || !eskiIlce || !eskiMahalle || !yeniMahalle) {
        return res.status(400).json({ success: false, message: 'Tüm alanlar gerekli.' });
      }
      if (eskiIlHam === yeniIlHam && eskiIlceHam === yeniIlceHam && eskiMahalleHam === yeniMahalleHam) {
        return res.json({ success: true, message: 'Değişiklik yok.' });
      }
      const pool = await getPool();
      const kimlikKol = await tabloKimlikVar(pool, sql, 'planlıMAHALLE');
      const reqDb = pool.request()
        .input('eskiIl', sql.NVarChar, eskiIl)
        .input('eskiIlce', sql.NVarChar, eskiIlce)
        .input('eskiMahalle', sql.NVarChar, eskiMahalle)
        .input('yeniIl', sql.NVarChar, yeniIl)
        .input('yeniIlce', sql.NVarChar, yeniIlce)
        .input('yeniMahalle', sql.NVarChar, yeniMahalle);
      if (kimlikKol && kimlik != null && kimlik !== '') {
        await reqDb.input('id', sql.Int, Number(kimlik)).query(`
          UPDATE planlıMAHALLE SET [İL] = @yeniIl, [İLÇE] = @yeniIlce, [MAHALLE] = @yeniMahalle
          WHERE [${kimlikKol}] = @id
        `);
      } else {
        await reqDb.query(`
          UPDATE planlıMAHALLE SET [İL] = @yeniIl, [İLÇE] = @yeniIlce, [MAHALLE] = @yeniMahalle
          WHERE UPPER(LTRIM(RTRIM([İL]))) COLLATE Turkish_CI_AS = @eskiIl COLLATE Turkish_CI_AS
            AND UPPER(LTRIM(RTRIM([İLÇE]))) COLLATE Turkish_CI_AS = @eskiIlce COLLATE Turkish_CI_AS
            AND UPPER(LTRIM(RTRIM([MAHALLE]))) COLLATE Turkish_CI_AS = @eskiMahalle COLLATE Turkish_CI_AS
        `);
      }
      res.json({ success: true, message: 'Mahalle/köy güncellendi.' });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.delete('/api/konum-yonetim/il', authenticateToken, sadeceAdmin, async (req, res) => {
    try {
      const il = normKonum(req.body.il);
      if (!il) return res.status(400).json({ success: false, message: 'İl gerekli.' });
      const pool = await getPool();
      const bagli = await pool.request().input('il', sql.NVarChar, il).query(`
        SELECT TOP 1 1 FROM [İLÇE]
        WHERE UPPER(LTRIM(RTRIM([İL]))) COLLATE Turkish_CI_AS = @il COLLATE Turkish_CI_AS
      `);
      if (bagli.recordset.length) {
        return res.json({ success: false, message: 'Önce bu ile bağlı ilçeleri silin.' });
      }
      await pool.request().input('il', sql.NVarChar, il).query(`
        DELETE FROM [İL]
        WHERE UPPER(LTRIM(RTRIM([İL]))) COLLATE Turkish_CI_AS = @il COLLATE Turkish_CI_AS
      `);
      res.json({ success: true, message: 'İl silindi.' });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.delete('/api/konum-yonetim/ilce', authenticateToken, sadeceAdmin, async (req, res) => {
    try {
      const il = normKonum(req.body.il);
      const ilce = normKonum(req.body.ilce);
      if (!il || !ilce) return res.status(400).json({ success: false, message: 'İl ve ilçe gerekli.' });
      const pool = await getPool();
      const bagli = await pool.request()
        .input('il', sql.NVarChar, il)
        .input('ilce', sql.NVarChar, ilce)
        .query(`
          SELECT TOP 1 1 FROM planlıMAHALLE
          WHERE UPPER(LTRIM(RTRIM([İL]))) COLLATE Turkish_CI_AS = @il COLLATE Turkish_CI_AS
            AND UPPER(LTRIM(RTRIM([İLÇE]))) COLLATE Turkish_CI_AS = @ilce COLLATE Turkish_CI_AS
        `);
      if (bagli.recordset.length) {
        return res.json({ success: false, message: 'Önce bu ilçeye bağlı mahalle/köyleri silin.' });
      }
      await pool.request()
        .input('il', sql.NVarChar, il)
        .input('ilce', sql.NVarChar, ilce)
        .query(`
          DELETE FROM [İLÇE]
          WHERE UPPER(LTRIM(RTRIM([İL]))) COLLATE Turkish_CI_AS = @il COLLATE Turkish_CI_AS
            AND UPPER(LTRIM(RTRIM([İLÇE]))) COLLATE Turkish_CI_AS = @ilce COLLATE Turkish_CI_AS
        `);
      res.json({ success: true, message: 'İlçe silindi.' });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.delete('/api/konum-yonetim/mahalle', authenticateToken, sadeceAdmin, async (req, res) => {
    try {
      const il = normKonum(req.body.il);
      const ilce = normKonum(req.body.ilce);
      const mahalle = normKonum(req.body.mahalle);
      const kimlik = req.body.kimlik;
      if (!il || !ilce || !mahalle) {
        return res.status(400).json({ success: false, message: 'İl, ilçe ve mahalle gerekli.' });
      }
      const pool = await getPool();
      const kimlikKol = await tabloKimlikVar(pool, sql, 'planlıMAHALLE');
      if (kimlikKol && kimlik != null && kimlik !== '') {
        await pool.request()
          .input('id', sql.Int, Number(kimlik))
          .query(`DELETE FROM planlıMAHALLE WHERE [${kimlikKol}] = @id`);
      } else {
        await pool.request()
          .input('il', sql.NVarChar, il)
          .input('ilce', sql.NVarChar, ilce)
          .input('mahalle', sql.NVarChar, mahalle)
          .query(`
            DELETE FROM planlıMAHALLE
            WHERE UPPER(LTRIM(RTRIM([İL]))) COLLATE Turkish_CI_AS = @il COLLATE Turkish_CI_AS
              AND UPPER(LTRIM(RTRIM([İLÇE]))) COLLATE Turkish_CI_AS = @ilce COLLATE Turkish_CI_AS
              AND UPPER(LTRIM(RTRIM([MAHALLE]))) COLLATE Turkish_CI_AS = @mahalle COLLATE Turkish_CI_AS
          `);
      }
      res.json({ success: true, message: 'Mahalle/köy silindi.' });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });
}

module.exports = { registerKonumYonetim, normKonum };
