
'use strict';

/*
  KANAVU SEO HUB
  Existing Google Sheets reporting + Neon PostgreSQL

  Preserves:
  - Google Search Console reports
  - Google Analytics 4 reports
  - Daily metrics
  - Period comparisons
  - GSC pages and queries
  - GA4 channels, pages and landing pages
  - Google PageSpeed Insights
  - Existing APP_TOKEN authentication
  - Existing dashboard API routes

  Adds:
  - Neon PostgreSQL client API
  - Database connection status API

  Required existing files:
  - .env
  - key.json
  - db.js
  - clients-api.js
  - public/index.html
*/

require('dotenv').config();

const express = require('express');
const path = require('path');
const { google } = require('googleapis');

const { query } = require('./db');
const clientsApi = require('./clients-api');
const recordsApi = require('./records-api');

const app = express();

const PORT = Number(process.env.PORT || 3000);

const SHEET_ID =
  process.env.GOOGLE_SHEET_ID ||
  '1XWBf4xDDblK8cRdAtyr6uRjVNeItvbM8eYqKlGRvboI';

const APP_TOKEN = process.env.APP_TOKEN;

const PAGESPEED_KEY = process.env.PAGESPEED_KEY || '';

/* =========================================================
   GOOGLE SHEETS CONNECTION
========================================================= */

const auth = new google.auth.GoogleAuth({
  keyFile: path.resolve(
    __dirname,
    process.env.GOOGLE_KEY_FILE || 'key.json'
  ),

  scopes: [
    'https://www.googleapis.com/auth/spreadsheets.readonly'
  ]
});

const sheets = google.sheets({
  version: 'v4',
  auth
});

/* =========================================================
   EXISTING SEO PROJECTS

   These names must match your Google Sheets data.
   PostgreSQL can hold additional clients independently.
========================================================= */

const PROJECTS = [
  {
    name: 'GFC',
    label: 'Fortune City',
    website: 'https://www.fortunecity.in/'
  },
  {
    name: 'Whatsscore',
    label: 'WhatsScore',
    website: 'https://whatsscore.com/'
  },
  {
    name: 'Thalir',
    label: 'Thalir Kids Dental',
    website: 'https://thalirkidsdental.com/'
  },
  {
    name: 'Digital',
    label: 'Kanavu Digital',
    website: 'https://tech.kanavu.org/digital/'
  },
  {
    name: 'Tech',
    label: 'Kanavu Technologies',
    website: 'https://tech.kanavu.org/'
  },
  {
    name: 'Vibe Haus',
    label: 'Vibe Haus',
    website: 'https://vibehausbrew.com/'
  },
  {
    name: 'Achaani',
    label: 'Achaani',
    website: 'https://achaani.org/'
  }
];

/* =========================================================
   REPORT CONFIGURATION
========================================================= */

const REPORTS = {
  
  gscdevices: {
    tab: 'GSC_Devices',
    fields: [
      'project',
      'date',
      'device',
      'clicks',
      'impressions',
      'ctr',
      'position'
    ]
  },

  
gsccountries: {
  tab: 'GSC_Countries',
  fields: [
    'project',
    'date',
    'country',
    'clicks',
    'impressions',
    'ctr',
    'position'
  ]
},


  pages: {
    tab: 'GSC_Pages',
    fields: [
      'project',
      'date',
      'page',
      'clicks',
      'impressions',
      'ctr',
      'position'
    ]
  },

  queries: {
    tab: 'GSC_Queries',
    fields: [
      'project',
      'date',
      'query',
      'clicks',
      'impressions',
      'ctr',
      'position'
    ]
  },

  channels: {
    tab: 'GA4_Channels',
    fields: [
      'project',
      'date',
      'channel',
      'sessions',
      'totalUsers',
      'activeUsers'
    ]
  },

  ga4pages: {
    tab: 'GA4_Pages',
    fields: [
      'project',
      'date',
      'title',
      'path',
      'views',
      'activeUsers'
    ]
  },

  landing: {
    tab: 'GA4_Landing',
    fields: [
      'project',
      'date',
      'landingPage',
      'sessions',
      'totalUsers'
    ]
  }
};

const GSC_FIELDS = [
  'project',
  'date',
  'clicks',
  'impressions',
  'ctr',
  'position'
];

const GA4_FIELDS = [
  'project',
  'date',
  'users',
  'sessions',
  'organic',
  'pageViews',
  'engagedSessions',
  'totalUsers'
];

const NUMERIC = [
  'clicks',
  'impressions',
  'ctr',
  'position',
  'users',
  'activeUsers',
  'totalUsers',
  'sessions',
  'organic',
  'pageViews',
  'engagedSessions',
  'views'
];

/* =========================================================
   CACHE
========================================================= */

const CACHE = new Map();

const CACHE_MS = 5 * 60 * 1000;

/* =========================================================
   EXPRESS CONFIGURATION
========================================================= */

app.disable('x-powered-by');

app.use(express.json({
  limit: '1mb'
}));

/* =========================================================
   API AUTHENTICATION

   Existing dashboard uses x-token header.
========================================================= */

app.use('/api', (req, res, next) => {
  if (!APP_TOKEN) {
    return res.status(503).json({
      error: 'Set APP_TOKEN in .env'
    });
  }

  if (req.header('x-token') !== APP_TOKEN) {
    return res.status(401).json({
      error: 'Incorrect dashboard token'
    });
  }

  next();
});

/* =========================================================
   NEON POSTGRESQL CLIENT API

   GET /api/db/clients

   This route is protected by the APP_TOKEN middleware above.
========================================================= */

app.use('/api/db/clients', clientsApi);

// Shared Neon PostgreSQL records API
app.use('/api/db/records', recordsApi);

/* =========================================================
   DATABASE CONNECTION STATUS

   GET /api/db/status
========================================================= */

app.get('/api/db/status', async (req, res) => {
  try {
    const result = await query(`
  SELECT
    current_database() AS database_name,
    (SELECT COUNT(*)::int FROM clients) AS clients
`);

    res.json({
      connected: true,
      database: result.rows[0].database_name,
      clients: result.rows[0].clients,
      provider: 'Neon PostgreSQL'
    });

  } catch (error) {
    console.error(
      'PostgreSQL status error:',
      error.message
    );

    res.status(500).json({
      connected: false,
      error: 'Unable to connect to PostgreSQL'
    });
  }
});

/* =========================================================
   HELPERS
========================================================= */

const validProject = name => {
  return PROJECTS.some(project => project.name === name);
};

const validDate = value => {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))
  ) {
    return false;
  }

  const date = new Date(value + 'T00:00:00Z');

  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
  );
};

const offsetDate = (date, days) => {
  const result = new Date(date + 'T00:00:00Z');

  result.setUTCDate(
    result.getUTCDate() + days
  );

  return result.toISOString().slice(0, 10);
};

function todayIST() {
  const parts = new Intl.DateTimeFormat(
    'en-GB',
    {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }
  ).formatToParts(new Date());

  const value = name => {
    return parts.find(
      part => part.type === name
    ).value;
  };

  return (
    value('year') +
    '-' +
    value('month') +
    '-' +
    value('day')
  );
}

function getRange(req) {
  const end = offsetDate(
    todayIST(),
    -3
  );

  const from = String(
    req.query.from ||
    offsetDate(end, -27)
  );

  const to = String(
    req.query.to ||
    end
  );

  if (
    !validDate(from) ||
    !validDate(to) ||
    from > to
  ) {
    throw new Error(
      'Invalid date range'
    );
  }

  return {
    from,
    to
  };
}

function numeric(value, field) {
  if (
    value === '' ||
    value === undefined ||
    value === null
  ) {
    return null;
  }

  const string = String(value).replace(/,/g, '');

  if (
    field === 'ctr' &&
    string.endsWith('%')
  ) {
    return Number(
      string.slice(0, -1)
    ) / 100;
  }

  const result = Number(string);

  return Number.isFinite(result)
    ? result
    : null;
}

function normalizeDate(value) {
  const text = String(value || '').trim();

  if (validDate(text)) {
    return text;
  }

  const match = text.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/
  );

  if (!match) {
    return null;
  }

  const date =
    match[3] +
    '-' +
    match[2].padStart(2, '0') +
    '-' +
    match[1].padStart(2, '0');

  return validDate(date)
    ? date
    : null;
}

/* =========================================================
   GOOGLE SHEETS READER
========================================================= */

async function readSheet(tab) {
  const cached = CACHE.get(tab);

  if (
    cached &&
    cached.until > Date.now()
  ) {
    return cached.rows;
  }

  let rows = [];

  try {
    const response =
      await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,

        range: `'${tab}'!A:Z`,

        valueRenderOption: 'FORMATTED_VALUE'
      });

    rows = response.data.values || [];

  } catch (error) {
    if (
      !(
        error.code === 400 &&
        /range|parse/i.test(error.message)
      )
    ) {
      throw error;
    }

    console.warn(
      'Missing sheet tab:',
      tab
    );
  }

  CACHE.set(tab, {
    rows,
    until: Date.now() + CACHE_MS
  });

  return rows;
}

function records(rows, fields) {
  return rows.slice(1)
    .map(row => {
      const item = {};

      fields.forEach((field, index) => {
        const raw = row[index] ?? '';

        item[field] =
          field === 'date'
            ? normalizeDate(raw)
            : NUMERIC.includes(field)
              ? numeric(raw, field)
              : String(raw);
      });

      return item;
    })
    .filter(item => {
      return (
        validProject(item.project) &&
        item.date
      );
    });
}

/* =========================================================
   DAILY GSC + GA4 DATA
========================================================= */

async function dailyData() {
  const [gsc, ga4] = await Promise.all([
    readSheet('GSC_Data'),
    readSheet('GA4_Data')
  ]);

  const rows = new Map();

  const get = (project, date) => {
    const key =
      project + '|' + date;

    if (!rows.has(key)) {
      rows.set(key, {
        project,
        date,

        clicks: null,
        impressions: null,
        ctr: null,
        position: null,

        users: null,
        sessions: null,
        organic: null,
        pageViews: null,
        engagedSessions: null,
        totalUsers: null
      });
    }

    return rows.get(key);
  };

  for (const row of records(
    gsc,
    GSC_FIELDS
  )) {
    Object.assign(
      get(row.project, row.date),
      row
    );
  }

  for (const row of records(
    ga4,
    GA4_FIELDS
  )) {
    Object.assign(
      get(row.project, row.date),
      row
    );
  }

  return [...rows.values()].sort(
    (a, b) => a.date.localeCompare(b.date)
  );
}

/* =========================================================
   SUMMARY HELPERS
========================================================= */

function sum(rows, key) {
  const values = rows
    .map(row => row[key])
    .filter(value => {
      return (
        value !== null &&
        value !== undefined
      );
    });

  return values.length
    ? values.reduce(
        (total, value) => total + value,
        0
      )
    : null;
}

function summarize(rows) {
  const clicks = sum(
    rows,
    'clicks'
  );

  const impressions = sum(
    rows,
    'impressions'
  );

  const ranked = rows.filter(row => {
    return (
      row.position !== null &&
      row.impressions > 0
    );
  });

  const weight = sum(
    ranked,
    'impressions'
  );

  return {
    clicks,
    impressions,

    ctr: impressions
      ? clicks / impressions
      : impressions === 0
        ? 0
        : null,

    position: weight
      ? ranked.reduce(
          (total, row) => {
            return total +
              row.position * row.impressions;
          },
          0
        ) / weight
      : null,

    users: sum(rows, 'users'),
    sessions: sum(rows, 'sessions'),
    organic: sum(rows, 'organic'),
    pageViews: sum(rows, 'pageViews'),
    engagedSessions: sum(rows, 'engagedSessions'),
    totalUsers: sum(rows, 'totalUsers'),

    days: rows.length
  };
}

/*
  Note:
  Daily GA4 user values are retained to preserve the existing
  dashboard behavior, but summing daily users is not the
  same as calculating deduplicated unique users for a period.
*/

/* =========================================================
   EXISTING PROJECTS ENDPOINT
========================================================= */

app.get('/api/projects', (req, res) => {
  res.json(PROJECTS);
});

/* =========================================================
   DAILY REPORT
========================================================= */

app.get('/api/daily', async (req, res) => {
  try {
    const project = req.query.project;

    if (!validProject(project)) {
      return res.status(400).json({
        error: 'Invalid project'
      });
    }

    const { from, to } = getRange(req);

    const rows = await dailyData();

    res.json(
      rows.filter(row => {
        return (
          row.project === project &&
          row.date >= from &&
          row.date <= to
        );
      })
    );

  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
});

/* =========================================================
   PERIOD COMPARISON
========================================================= */

app.get('/api/compare', async (req, res) => {
  try {
    const project = req.query.project;

    if (!validProject(project)) {
      return res.status(400).json({
        error: 'Invalid project'
      });
    }

    const { from, to } = getRange(req);

    const days =
      Math.round(
        (
          Date.parse(to) -
          Date.parse(from)
        ) / 864e5
      ) + 1;

    const previousTo =
      offsetDate(from, -1);

    const previousFrom =
      offsetDate(
        previousTo,
        1 - days
      );

    const all = await dailyData();

    const pick = (start, end) => {
      return all.filter(row => {
        return (
          row.project === project &&
          row.date >= start &&
          row.date <= end
        );
      });
    };

    const current = summarize(
      pick(from, to)
    );

    const previous = summarize(
      pick(previousFrom, previousTo)
    );

    const comparison = {};

    for (const key of [
      'clicks',
      'impressions',
      'sessions',
      'organic',
      'pageViews',
      'engagedSessions'
    ]) {
      const a = current[key];
      const b = previous[key];

      comparison[key] =
        a === null ||
        b === null ||
        b === 0
          ? null
          : (
              (a - b) /
              Math.abs(b)
            ) * 100;
    }

    comparison.positionChange =
      current.position !== null &&
      previous.position !== null
        ? current.position -
          previous.position
        : null;

    comparison.ctrPoints =
      current.ctr !== null &&
      previous.ctr !== null
        ? (
            current.ctr -
            previous.ctr
          ) * 100
        : null;

    res.json({
      project,

      currentPeriod: {
        from,
        to
      },

      previousPeriod: {
        from: previousFrom,
        to: previousTo
      },

      current,
      previous,
      comparison,

      complete:
        current.days === days &&
        previous.days === days,

      note:
        'Some days are missing in the sheet, so read the comparison with care.'
    });

  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
});

/* =========================================================
   DETAILED REPORTS

   pages
   queries
   channels
   ga4pages
   landing
========================================================= */

app.get('/api/detail/:type', async (req, res) => {
  try {
    const project =
      req.query.project;

    const config =
      REPORTS[req.params.type];

    if (!validProject(project)) {
      return res.status(400).json({
        error: 'Invalid project'
      });
    }

    if (!config) {
      return res.status(404).json({
        error: 'Unknown report type'
      });
    }

    const { from, to } =
      getRange(req);

    if (
      project === 'Digital' &&
      ['channels', 'landing'].includes(
        req.params.type
      )
    ) {
      return res.json({
        rows: [],
        note:
          'Digital shares a GA4 property with Tech, so site-wide traffic cannot be split safely.'
      });
    }

    const rows = records(
      await readSheet(config.tab),
      config.fields
    ).filter(row => {
      return (
        row.project === project &&
        row.date >= from &&
        row.date <= to
      );
    });

    res.json({
      rows,

      note: rows.length
        ? null
        : 'No collected records for this project and date range.'
    });

  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
});

/* =========================================================
   GOOGLE PAGESPEED INSIGHTS
========================================================= */

app.get('/api/vitals', async (req, res) => {
  try {
    const url = new URL(
      String(req.query.url || '')
    );

    const host = hostname => {
      return hostname.replace(
        /^www\./,
        ''
      );
    };

    const allowed = PROJECTS.some(project => {
      const projectURL =
        new URL(project.website);

      return (
        host(projectURL.hostname) ===
        host(url.hostname)
      );
    });

    if (
      !/^https?:$/.test(url.protocol) ||
      !allowed
    ) {
      return res.status(400).json({
        error:
          'That URL is not one of your project websites'
      });
    }

    const strategy =
      req.query.strategy === 'desktop'
        ? 'desktop'
        : 'mobile';

    const params =
      new URLSearchParams({
        url: url.href,
        strategy,
        category: 'performance'
      });

    if (PAGESPEED_KEY) {
      params.set(
        'key',
        PAGESPEED_KEY
      );
    }

    const endpoint =
      'https://www.googleapis.com/pagespeedonline/v5/runPagespeed?' +
      params.toString();

    const response = await fetch(
      endpoint,
      {
        signal:
          AbortSignal.timeout(90000)
      }
    );

    const json =
      await response.json();

    if (!response.ok) {
      throw new Error(
        json.error?.message ||
        'PageSpeed error ' +
        response.status
      );
    }

    const audits =
      json.lighthouseResult.audits;

    const field =
      json.loadingExperience?.metrics || {};

    res.json({
      url: url.href,
      strategy,

      score: Math.round(
        (
          json.lighthouseResult
            .categories
            .performance
            .score || 0
        ) * 100
      ),

      lcp:
        audits[
          'largest-contentful-paint'
        ].numericValue / 1000,

      cls:
        audits[
          'cumulative-layout-shift'
        ].numericValue,

      tbt:
        audits[
          'total-blocking-time'
        ].numericValue,

      fcp:
        audits[
          'first-contentful-paint'
        ].numericValue / 1000,

      si:
        audits[
          'speed-index'
        ].numericValue / 1000,

      inp:
        field.INTERACTION_TO_NEXT_PAINT
          ? field.INTERACTION_TO_NEXT_PAINT
              .percentile
          : null
    });

  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
});

/* =========================================================
   EXISTING GOOGLE SHEETS STATUS
========================================================= */

app.get('/api/status', async (req, res) => {
  try {
    const rows =
      await dailyData();

    res.json({
      connected: true,
      projects: PROJECTS.length,
      rows: rows.length,

      lastDate:
        rows
          .map(row => row.date)
          .sort()
          .at(-1) || null
    });

  } catch (error) {
    res.status(500).json({
      connected: false,
      error: error.message
    });
  }
});

/* =========================================================
   FRONTEND

   Keep your current public/index.html
   and other existing scripts.
========================================================= */

app.use(
  express.static(
    path.join(__dirname, 'public')
  )
);

/* =========================================================
   SERVER START
========================================================= */

app.listen(
  PORT,
  '0.0.0.0',
  () => {
    console.log(
      'Kanavu SEO Hub: http://localhost:' +
      PORT
    );

    console.log(
      PROJECTS.length +
      ' projects enabled.'
    );

    console.log(
      'Google Sheets reporting enabled.'
    );

    console.log(
      'Neon PostgreSQL client API enabled.'
    );
  }
);
