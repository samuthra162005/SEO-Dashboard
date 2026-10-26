
require('dotenv').config();

const { pool } = require('./db');

const clients = [
  ['GFC', 'https://www.fortunecity.in/'],
  ['Whatsscore', 'https://whatsscore.com/'],
  ['Thalir', 'https://thalirkidsdental.com/'],
  ['Digital', 'https://tech.kanavu.org/'],
  ['Tech', 'https://tech.kanavu.org/'],
  ['Vibe Haus', 'https://vibehausbrew.com/'],
  ['Achaani', 'https://achaani.org/']
];

async function addClients() {
  const connection = await pool.connect();

  try {
    await connection.query('BEGIN');

    for (const [name, website] of clients) {
      const existing = await connection.query(
        'SELECT id FROM clients WHERE LOWER(name) = LOWER($1)',
        [name]
      );

      if (existing.rows.length > 0) {
        console.log('Already exists:', name);
        continue;
      }

      await connection.query(
        'INSERT INTO clients (name, website) VALUES ($1, $2)',
        [name, website]
      );

      console.log('Added:', name);
    }

    await connection.query('COMMIT');

    const result = await connection.query(
      'SELECT id, name, website FROM clients ORDER BY name'
    );

    console.log('\nSUCCESS! Client records:');
    console.table(result.rows);

  } catch (error) {
    await connection.query('ROLLBACK');
    console.error('Error:', error.message);
  } finally {
    connection.release();
    await pool.end();
  }
}

addClients();
