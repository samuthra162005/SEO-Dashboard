
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function setupDatabase() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS clients (
        id SERIAL PRIMARY KEY,
        name VARCHAR(150) NOT NULL,
        website TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS team_members (
        id SERIAL PRIMARY KEY,
        name VARCHAR(150) NOT NULL,
        email VARCHAR(255) UNIQUE,
        role VARCHAR(50),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS seo_records (
        id SERIAL PRIMARY KEY,
        client_id INTEGER REFERENCES clients(id),
        record_type VARCHAR(50) NOT NULL,
        data JSONB NOT NULL DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS seo_audits (
        id SERIAL PRIMARY KEY,
        client_id INTEGER REFERENCES clients(id),
        page_url TEXT NOT NULL,
        audit_type VARCHAR(50),
        score INTEGER,
        audit_data JSONB NOT NULL DEFAULT '{}',
        checked_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_seo_records_client
        ON seo_records(client_id, record_type);

      CREATE INDEX IF NOT EXISTS idx_seo_audits_client
        ON seo_audits(client_id, checked_at);
    `);

    console.log('SUCCESS! Kanavu SEO Hub database tables created.');
    console.log('Tables: clients, team_members, seo_records, seo_audits');

  } catch (error) {
    console.error('Database setup failed:', error.message);
  } finally {
    await pool.end();
  }
}

setupDatabase();
