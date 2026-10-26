
const express = require('express');
const { query } = require('./db');

const router = express.Router();



const ALLOWED_TYPES = new Set([
  'meeting_schedule',
  'tracker',
  'work_history',
  'task_progress'
]);


// GET records for a client.
router.get('/:clientId/:recordType', async (req, res) => {
  try {
    const clientId = Number(req.params.clientId);
    const recordType = req.params.recordType;

    if (
      !Number.isSafeInteger(clientId) ||
      clientId <= 0 ||
      !ALLOWED_TYPES.has(recordType)
    ) {
      return res.status(400).json({
        error: 'Invalid client ID or record type'
      });
    }

    const result = await query(`
      SELECT id, client_id, record_type, data,
             created_at, updated_at
      FROM seo_records
      WHERE client_id = $1 AND record_type = $2
      ORDER BY updated_at DESC, id DESC
    `, [clientId, recordType]);

    res.json(result.rows);

  } catch (error) {
    console.error('Load shared records:', error.message);
    res.status(500).json({
      error: 'Unable to load records'
    });
  }
});

// POST: Save a new shared record.
// Existing records are never overwritten.
router.post('/:clientId/:recordType', async (req, res) => {
  try {
    const clientId = Number(req.params.clientId);
    const recordType = req.params.recordType;
    const data = req.body?.data;

    if (
      !Number.isSafeInteger(clientId) ||
      clientId <= 0 ||
      !ALLOWED_TYPES.has(recordType)
    ) {
      return res.status(400).json({
        error: 'Invalid client ID or record type'
      });
    }

    if (
      !data ||
      typeof data !== 'object' ||
      Array.isArray(data)
    ) {
      return res.status(400).json({
        error: 'Provide a valid data object'
      });
    }

    const result = await query(`
      INSERT INTO seo_records (
        client_id, record_type, data
      )
      SELECT id, $2, $3::jsonb
      FROM clients
      WHERE id = $1
      RETURNING id, client_id, record_type,
                data, created_at, updated_at
    `, [
      clientId,
      recordType,
      JSON.stringify(data)
    ]);

    if (!result.rows.length) {
      return res.status(404).json({
        error: 'Client not found'
      });
    }

    res.status(201).json(result.rows[0]);

  } catch (error) {
    console.error('Save shared record:', error.message);
    res.status(500).json({
      error: 'Unable to save record'
    });
  }
});


// PUT: Update an existing shared record safely.
// Rejects an update if another user has changed the record.
router.put('/:clientId/:recordType/:recordId', async (req, res) => {
  try {
    const clientId = Number(req.params.clientId);
    const recordId = Number(req.params.recordId);
    const recordType = req.params.recordType;

    const { data, expectedData } = req.body || {};

    if (
      !Number.isSafeInteger(clientId) ||
      clientId <= 0 ||
      !Number.isSafeInteger(recordId) ||
      recordId <= 0 ||
      !ALLOWED_TYPES.has(recordType)
    ) {
      return res.status(400).json({
        error: 'Invalid client, record type or record ID'
      });
    }

    const validObject = value =>
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value);

    if (
      !validObject(data) ||
      !validObject(expectedData)
    ) {
      return res.status(400).json({
        error: 'Valid data and expectedData objects are required'
      });
    }

    const result = await query(`
      UPDATE seo_records
      SET
        data = $4::jsonb,
        updated_at = NOW()
      WHERE
        id = $1
        AND client_id = $2
        AND record_type = $3
        AND data = $5::jsonb
      RETURNING
        id,
        client_id,
        record_type,
        data,
        created_at,
        updated_at
    `, [
      recordId,
      clientId,
      recordType,
      JSON.stringify(data),
      JSON.stringify(expectedData)
    ]);

    if (result.rows.length > 0) {
      return res.json(result.rows[0]);
    }

    // Distinguish a missing record from a stale edit.
    const existing = await query(`
      SELECT id
      FROM seo_records
      WHERE
        id = $1
        AND client_id = $2
        AND record_type = $3
    `, [recordId, clientId, recordType]);

    if (!existing.rows.length) {
      return res.status(404).json({
        error: 'Record not found'
      });
    }

    return res.status(409).json({
      error: 'Record was changed by another user. Reload before editing.'
    });

  } catch (error) {
    console.error('Update shared record:', error.message);

    res.status(500).json({
      error: 'Unable to update record'
    });
  }
});

module.exports = router;
