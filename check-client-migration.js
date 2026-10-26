
require('dotenv').config();

const fs = require('fs');
const { pool } = require('./db');

const backupPath =
  'C:\\Users\\Work\\Desktop\\kanavu-private-backups\\kanavu-clients-backup.json';

const normalize = value =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

async function checkMigration() {
  try {
    const backup = JSON.parse(
      fs.readFileSync(backupPath, 'utf8')
    );

    if (!Array.isArray(backup.clients)) {
      throw new Error('Invalid client backup');
    }

    const result = await pool.query(
      'SELECT id, name, archived FROM clients'
    );

    const existing = result.rows;

    let matched = 0;
    let newClients = 0;
    let review = 0;

    console.log('\nKANAVU SEO HUB - MIGRATION PREVIEW');
    console.log('----------------------------------');
    console.log('Backup clients:', backup.clients.length);
    console.log('Database clients:', existing.length);
    console.log('');

    for (const client of backup.clients) {
      const name = String(client.name || '').trim();
      const gsc = String(client.gsc || '').trim();

      if (!name) {
        console.log('REVIEW: Client without a name');
        review++;
        continue;
      }

      const nameMatches = existing.filter(
        row => normalize(row.name) === normalize(name)
      );

      const gscMatches = gsc
        ? existing.filter(
            row => normalize(row.name) === normalize(gsc)
          )
        : [];

      const matches = [
        ...new Map(
          [...nameMatches, ...gscMatches]
            .map(row => [row.id, row])
        ).values()
      ];

      if (matches.length === 1) {
        console.log(
          'MATCH:',
          name,
          '=>',
          matches[0].name
        );
        matched++;
      } else if (matches.length > 1) {
        console.log('REVIEW: Multiple matches for', name);
        review++;
      } else {
        console.log('NEW:', name);
        newClients++;
      }
    }

    console.log('\n----------------------------------');
    console.log('Already matched:', matched);
    console.log('Potential new clients:', newClients);
    console.log('Need manual review:', review);
    console.log('----------------------------------');
    console.log('PREVIEW ONLY - No database changes made.');

  } catch (error) {
    console.error('Migration check failed:', error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

checkMigration();
