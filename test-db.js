
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function testConnection() {
  try {
    const result = await pool.query(`
      SELECT
        current_database() AS database_name,
        NOW() AS server_time
    `);

    console.log('SUCCESS! Connected to Neon PostgreSQL.');
    console.log('Database:', result.rows[0].database_name);
    console.log('Server time:', result.rows[0].server_time);
  } catch (error) {
    console.error('Connection failed:', error.message);
  } finally {
    await pool.end();
  }
}

testConnection();
