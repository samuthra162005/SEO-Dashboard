
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

const textOrNull = value =>
  typeof value === 'string' && value.trim()
    ? value.trim()
    : null;

const meetingOrNull = value =>
  value == null ? null : JSON.stringify(value);

async function migrateClients() {
  const backup = JSON.parse(
    fs.readFileSync(backupPath, 'utf8')
  );

  if (!Array.isArray(backup.clients) ||
      backup.clients.length !== 39) {
    throw new Error('Expected 39 clients in backup.');
  }

  const connection = await pool.connect();

  let added = 0;
  let matched = 0;
  let preserved = 0;

  try {
    await connection.query('BEGIN');

    const original = await connection.query(
      'SELECT id, name FROM clients'
    );

    const databaseClients = [...original.rows];

    for (const client of backup.clients) {
      const name = textOrNull(client.name);
      const gsc = textOrNull(client.gsc);

      if (!name || name.length > 150) {
        throw new Error('Invalid client name: ' + name);
      }

      const matches = databaseClients.filter(row =>
        normalize(row.name) === normalize(name) ||
        (gsc && normalize(row.name) === normalize(gsc))
      );

      if (matches.length > 1) {
        throw new Error('Multiple matches for ' + name);
      }

      const website = Array.isArray(client.sites)
        ? textOrNull(client.sites[0])
        : null;

      const director = textOrNull(client.director);
      const whatsapp = textOrNull(client.wa);
      const clientMeeting = meetingOrNull(client.cm);
      const internalMeeting = meetingOrNull(client.im);
      const notes = textOrNull(client.note);

      let clientId;

      if (matches.length === 1) {
        clientId = matches[0].id;

        await connection.query(`
          UPDATE clients
          SET
            website = COALESCE(
              NULLIF(website, ''), $1
            ),
            director = COALESCE(
              NULLIF(director, ''), $2
            ),
            whatsapp_group = COALESCE(
              NULLIF(whatsapp_group, ''), $3
            ),
            client_meeting = COALESCE(
              NULLIF(client_meeting, ''), $4
            ),
            internal_meeting = COALESCE(
              NULLIF(internal_meeting, ''), $5
            ),
            notes = COALESCE(
              NULLIF(notes, ''), $6
            ),
            updated_at = NOW()
          WHERE id = $7
        `, [
          website,
          director,
          whatsapp,
          clientMeeting,
          internalMeeting,
          notes,
          clientId
        ]);

        matched++;
        console.log('UPDATED:', name);

      } else {
        const result = await connection.query(`
          INSERT INTO clients (
            name, website, director, whatsapp_group,
            client_meeting, internal_meeting, notes
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING id, name
        `, [
          name,
          website,
          director,
          whatsapp,
          clientMeeting,
          internalMeeting,
          notes
        ]);

        clientId = result.rows[0].id;
        databaseClients.push(result.rows[0]);

        added++;
        console.log('ADDED:', name);
      }

      // Preserve the complete original dashboard client record.
      // This includes audit data and other fields that do not
      // yet have dedicated PostgreSQL columns.
      const saved = await connection.query(`
        SELECT id
        FROM seo_records
        WHERE client_id = $1
          AND record_type = 'legacy_client_backup'
        LIMIT 1
      `, [clientId]);

      if (saved.rows.length) {
        await connection.query(`
          UPDATE seo_records
          SET data = $1::jsonb,
              updated_at = NOW()
          WHERE id = $2
        `, [
          JSON.stringify(client),
          saved.rows[0].id
        ]);
      } else {
        await connection.query(`
          INSERT INTO seo_records (
            client_id, record_type, data
          )
          VALUES ($1, 'legacy_client_backup', $2::jsonb)
        `, [
          clientId,
          JSON.stringify(client)
        ]);
      }

      preserved++;
    }

    const totals = await connection.query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (
          WHERE archived = FALSE
        )::int AS active,
        COUNT(*) FILTER (
          WHERE archived = TRUE
        )::int AS archived
      FROM clients
    `);

    const records = await connection.query(`
      SELECT COUNT(*)::int AS total
      FROM seo_records
      WHERE record_type = 'legacy_client_backup'
    `);

    if (
      added !== 32 ||
      matched !== 7 ||
      preserved !== 39 ||
      totals.rows[0].total !== 40 ||
      records.rows[0].total !== 39
    ) {
      throw new Error(
        'Migration totals do not match expectations. ' +
        'All database changes have been cancelled.'
      );
    }

    await connection.query('COMMIT');

    console.log('\nSUCCESS! CLIENT MIGRATION COMPLETE');
    console.log('New clients:', added);
    console.log('Existing clients updated:', matched);
    console.log('Original records preserved:', preserved);
    console.log('Active clients:', totals.rows[0].active);
    console.log('Archived clients:', totals.rows[0].archived);
    console.log('Total database clients:', totals.rows[0].total);

  } catch (error) {
    await connection.query('ROLLBACK');

    console.error('\nMIGRATION FAILED:', error.message);
    console.error('Database changes rolled back.');

    process.exitCode = 1;
  } finally {
    connection.release();
    await pool.end();
  }
}

migrateClients().catch(error => {
  console.error('Migration could not start:', error.message);
  process.exitCode = 1;
});
