
const express = require('express');
const { query } = require('./db');

const router = express.Router();

// GET: List clients
router.get('/', async (req, res) => {
  try {
    const result = await query(`
      SELECT *
      FROM clients
      ORDER BY archived ASC, name ASC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('Load clients:', error.message);
    res.status(500).json({ error: 'Unable to load clients' });
  }
});

// POST: Add a new client
router.post('/', async (req, res) => {
  try {
    const {
      name,
      website,
      director,
      whatsapp_group,
      client_meeting,
      internal_meeting,
      notes
    } = req.body;

    if (typeof name !== 'string' || !name.trim() || name.length > 150) {
      return res.status(400).json({
        error: 'Enter a valid client name (up to 150 characters)'
      });
    }

    const existing = await query(
      'SELECT id FROM clients WHERE LOWER(name) = LOWER($1)',
      [name.trim()]
    );

    if (existing.rows.length) {
      return res.status(409).json({
        error: 'A client with this name already exists'
      });
    }

    const result = await query(`
      INSERT INTO clients (
        name, website, director, whatsapp_group,
        client_meeting, internal_meeting, notes
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [
      name.trim(),
      website || null,
      director || null,
      whatsapp_group || null,
      client_meeting || null,
      internal_meeting || null,
      notes || null
    ]);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Add client:', error.message);
    res.status(500).json({ error: 'Unable to add client' });
  }
});

// PUT: Edit an existing client
router.put('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isSafeInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Invalid client ID' });
    }

    const {
      name,
      website,
      director,
      whatsapp_group,
      client_meeting,
      internal_meeting,
      notes
    } = req.body;

    if (typeof name !== 'string' || !name.trim() || name.length > 150) {
      return res.status(400).json({
        error: 'Enter a valid client name (up to 150 characters)'
      });
    }

    const result = await query(`
      UPDATE clients
      SET name = $1,
          website = $2,
          director = $3,
          whatsapp_group = $4,
          client_meeting = $5,
          internal_meeting = $6,
          notes = $7,
          updated_at = NOW()
      WHERE id = $8
      RETURNING *
    `, [
      name.trim(),
      website || null,
      director || null,
      whatsapp_group || null,
      client_meeting || null,
      internal_meeting || null,
      notes || null,
      id
    ]);

    if (!result.rows.length) {
      return res.status(404).json({ error: 'Client not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Edit client:', error.message);
    res.status(500).json({ error: 'Unable to edit client' });
  }
});

// PATCH: Archive or restore a client
router.patch('/:id/archive', async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isSafeInteger(id) || id <= 0 ||
        typeof req.body.archived !== 'boolean') {
      return res.status(400).json({
        error: 'Provide a valid client ID and archived true/false'
      });
    }

    const result = await query(`
      UPDATE clients
      SET archived = $1,
          updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `, [req.body.archived, id]);

    if (!result.rows.length) {
      return res.status(404).json({ error: 'Client not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Archive client:', error.message);
    res.status(500).json({ error: 'Unable to update client status' });
  }
});

module.exports = router;
