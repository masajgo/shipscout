const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS detained_vessels (
      id SERIAL PRIMARY KEY,
      imo VARCHAR(20) UNIQUE,
      name VARCHAR(255),
      flag VARCHAR(100),
      vessel_type VARCHAR(100),
      port VARCHAR(255),
      country VARCHAR(100),
      detention_date DATE,
      release_date DATE,
      deficiencies INT DEFAULT 0,
      mou VARCHAR(20),
      inspection_id VARCHAR(100),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  console.log('DB ready');
}

async function upsertVessel(vessel) {
  const {
    imo, name, flag, vessel_type, port, country,
    detention_date, release_date, deficiencies, mou, inspection_id
  } = vessel;

  await pool.query(
    `INSERT INTO detained_vessels
       (imo, name, flag, vessel_type, port, country, detention_date, release_date, deficiencies, mou, inspection_id, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW())
     ON CONFLICT (imo) DO UPDATE SET
       name = EXCLUDED.name,
       flag = EXCLUDED.flag,
       vessel_type = EXCLUDED.vessel_type,
       port = EXCLUDED.port,
       country = EXCLUDED.country,
       detention_date = EXCLUDED.detention_date,
       release_date = EXCLUDED.release_date,
       deficiencies = EXCLUDED.deficiencies,
       mou = EXCLUDED.mou,
       inspection_id = EXCLUDED.inspection_id,
       updated_at = NOW()`,
    [imo, name, flag, vessel_type, port, country, detention_date, release_date, deficiencies, mou, inspection_id]
  );
}

async function getDetainedVessels({ mou } = {}) {
  const query = mou
    ? `SELECT * FROM detained_vessels WHERE mou = $1 ORDER BY detention_date DESC`
    : `SELECT * FROM detained_vessels ORDER BY detention_date DESC`;
  const result = await pool.query(query, mou ? [mou] : []);
  return result.rows;
}

module.exports = { pool, initDB, upsertVessel, getDetainedVessels };
