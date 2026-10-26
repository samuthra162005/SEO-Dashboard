
require('dotenv').config();

const { pool } = require('./db');

async function updateClientsDatabase() {
  try {
    await pool.query(`
      ALTER TABLE clients
        ADD COLUMN IF NOT EXISTS director TEXT,
        ADD COLUMN IF NOT EXISTS whatsapp_group TEXT,
        ADD COLUMN IF NOT EXISTS client_meeting TEXT,
        ADD COLUMN IF NOT EXISTS internal_meeting TEXT,
        ADD COLUMN IF NOT EXISTS notes TEXT,
        ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
    `);

    const result = await pool.query(`
      SELECT
        id,
        name,
        website,
        archived
      FROM clients
      ORDER BY name;
    `);

    console.log('SUCCESS! Client management fields created.');
    console.log('Existing client records:', result.rows.length);
    console.table(result.rows);

  } catch (error) {
    console.error('Database update failed:', error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

updateClientsDatabase();
