
/*
  KANAVU SEO HUB — REPORT TABS
  File: public/seo-report-tabs.js

  Requires the original index.html helpers:
  reportTab, render, range, api, E, RS, SERVER,
  card, catChart, fd, shift, nf, cf, aud.

  Uses existing server endpoints:
  /api/daily
  /api/compare
  /api/detail/:type
  /api/vitals

  Optional expanded endpoints:
  /api/report/users
  /api/detail/useracquisition
  /api/detail/engagement
  /api/detail/countries
  /api/detail/cities
  /api/detail/devices
  /api/detail/browsers
  /api/detail/events
  /api/detail/gsccountries
  /api/detail/gscdevices

  Notes:
  - Does not add daily active users into unique
    users for a complete date range.
  - Does not invent unavailable measurements.
  - Backlinks are manual SEO Audit values.
*/

(() => {
  "use strict";

  const originalReportTab = reportTab;

  const NAV = {
    gsc: [
      ["overview", "Overview"],
      ["keywords", "Ranking Keywords"],
      ["pages", "Top Clicked Pages"],
      ["countries", "Countries"],
      ["devices", "Devices"]
    ],
    ga4: [
      ["overview", "Overview"],
      ["users", "Users"],
      ["acquisition", "User Acquisition"],
      ["traffic", "Traffic Acquisition"],
      ["pages", "Viewed Pages"],
      ["landing", "Landing Pages"],
      ["engagement", "Engagement"],
      ["countries", "Countries"],
      ["cities", "Cities"],
      ["devices", "Devices"],
      ["browsers", "Browsers"],
      ["events", "Events"]
    ],
    technical: [
      ["vitals", "Web Vitals"],
      ["indexing", "Indexing"],
      ["backlinks", "Backlinks"]
    ]
  };

  let mainTab = "gsc";
  let subTab = {
    gsc: "overview",
    ga4: "overview",
    technical: "vitals"
  };

  const STORAGE_KEY = "kanavu_report_navigation_v2";

  try {
    const saved = JSON.parse(
      sessionStorage.getItem(STORAGE_KEY) || "null"
    );

    if (saved && NAV[saved.main]) {
      mainTab = saved.main;
    }

    if (saved && saved.sub) {
      for (const key of Object.keys(NAV)) {
        if (
          NAV[key].some(
            item => item[0] === saved.sub[key]
          )
        ) {
          subTab[key] = saved.sub[key];
        }
      }
    }
  } catch (_) {}

  function saveNavigation() {
    try {
      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          main: mainTab,
          sub: subTab
        })
      );
    } catch (_) {}
  }

  function escapeHTML(value) {
    return E(String(value ?? ""));
  }

  function formatNumber(value, digits = 0) {
    if (
      value === null ||
      value === undefined ||
      value === "" ||
      !Number.isFinite(Number(value))
    ) {
      return "—";
    }

    return Number(value).toLocaleString("en-IN", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits
    });
  }

  function numeric(value) {
    if (
      value === null ||
      value === undefined ||
      value === ""
    ) {
      return null;
    }

    const n = Number(value);

    return Number.isFinite(n) ? n : null;
  }

  function total(rows, field) {
    const numbers = rows
      .map(row => numeric(row[field]))
      .filter(value => value !== null);

    if (!numbers.length) return null;

    return numbers.reduce((a, b) => a + b, 0);
  }

  function percent(a, b) {
    if (
      a === null ||
      b === null ||
      b === 0
    ) {
      return null;
    }

    return ((a - b) / Math.abs(b)) * 100;
  }

  function sameLengthPeriods(R) {
    return {
      currentFrom: R.from,
      currentTo: R.to,
      previousFrom: R.pf,
      previousTo: R.pt,
      days: R.n
    };
  }

  function dateList(start, end) {
    const result = [];

    for (
      let date = start;
      date <= end;
      date = shift(date, 1)
    ) {
      result.push(date);
    }

    return result;
  }

  function rowsOnly(value) {
    return Array.isArray(value)
      ? value
      : Array.isArray(value?.rows)
        ? value.rows
        : [];
  }

  async function fetchSafe(path, params) {
    try {
      const data = await api(path, params);

      return {
        ok: true,
        rows: rowsOnly(data),
        data,
        error: null,
        note: data?.note || null
      };
    } catch (error) {
      return {
        ok: false,
        rows: [],
        data: null,
        error: error.message,
        note: null
      };
    }
  }

  function params(c, from, to) {
    return {
      project: c.gsc,
      from,
      to
    };
  }

  async function fetchPeriods(c, R, path) {
    const [current, previous] = await Promise.all([
      fetchSafe(
        path,
        params(c, R.from, R.to)
      ),
      fetchSafe(
        path,
        params(c, R.pf, R.pt)
      )
    ]);

    return {current, previous};
  }

  function dailyCoverage(rows, R, field) {
    const seen = new Set(
      rows
        .filter(row =>
          row.date >= R.from &&
          row.date <= R.to &&
          numeric(row[field]) !== null
        )
        .map(row => row.date)
    );

    return {
      found: seen.size,
      expected: R.n,
      complete: seen.size === R.n
    };
  }

  function compareCoverage(daily, R, field) {
    const current = dailyCoverage(
      daily,
      R,
      field
    );

    const previous = dailyCoverage(
      daily,
      {
        from: R.pf,
        to: R.pt,
        n: R.n
      },
      field
    );

    return {
      current,
      previous,
      complete:
        current.complete &&
        previous.complete
    };
  }

  function note(message) {
    return `
      <p class="note">
        ${escapeHTML(message)}
      </p>
    `;
  }

  function warning(message) {
    return `
      <div class="card"
        style="border-left:4px solid var(--wa);
               margin:12px 0">
        <p style="margin:0">
          ${escapeHTML(message)}
        </p>
      </div>
    `;
  }

  function sectionTitle(text) {
    return `
      <div class="sec">
        <h2>${escapeHTML(text)}</h2>
      </div>
    `;
  }

  function tiles(items) {
    return `
      <div class="grid g4">
        ${items.map(item => {
          const [
            label,
            value,
            description,
            digits
          ] = item;

          return `
            <div class="card kpi">
              <small>${escapeHTML(label)}</small>

              <span class="num">
                ${formatNumber(value, digits || 0)}
              </span>

              ${
                description
                  ? `<small>${escapeHTML(description)}</small>`
                  : ""
              }
            </div>
          `;
        }).join("")}
      </div>
    `;
  }

  function comparisonTile(
    title,
    current,
    previous,
    coverage,
    options = {}
  ) {
    const digits = options.digits || 0;
    const change = (
      coverage.complete
        ? percent(current, previous)
        : null
    );

    let label = "Comparison unavailable";
    let css = "fl";

    if (change !== null) {
      const absolute = Math.abs(change);

      label = (
        change > 0 ? "+" : change < 0 ? "−" : ""
      ) + absolute.toFixed(1) + "%";

      let positive = change >= 0;

      if (options.lowerIsBetter) {
        positive = change <= 0;
      }

      css = positive ? "up" : "dn";
    }

    return `
      <div class="card kpi">

        <small>${escapeHTML(title)}</small>

        <span class="num">
          ${formatNumber(current, digits)}
        </span>

        <div class="row sp">
          <small>
            Previous:
            ${formatNumber(previous, digits)}
          </small>

          <span class="chip ${css}">
            ${escapeHTML(label)}
          </span>
        </div>

      </div>
    `;
  }

  function comparisonGrid(items, coverage) {
    return `
      <div class="grid g4">
        ${items.map(item =>
          comparisonTile(
            item.label,
            item.current,
            item.previous,
            coverage,
            item
          )
        ).join("")}
      </div>
    `;
  }

  function coverageNotice(coverage, name) {
    if (coverage.complete) {
      return note(
        name +
        ": both selected periods contain all expected daily records."
      );
    }

    return warning(
      name +
      ": incomplete data. Current period " +
      coverage.current.found +
      "/" +
      coverage.current.expected +
      " dates; previous period " +
      coverage.previous.found +
      "/" +
      coverage.previous.expected +
      " dates. Percentage changes are hidden."
    );
  }

  function table(title, columns, rows, limit = 100) {
    const displayed = rows.slice(0, limit);

    return `
      <section class="card">
        <div class="row sp">
          <h3>${escapeHTML(title)}</h3>
          <small>${rows.length} rows</small>
        </div>

        <div class="tw" style="margin-top:12px">
          <table>
            <thead>
              <tr>
                ${columns.map(col =>
                  `<th>${escapeHTML(col)}</th>`
                ).join("")}
              </tr>
            </thead>

            <tbody>
              ${
                displayed.length
                  ? displayed.map(row => `
                    <tr>
                      ${row.map(value => `
                        <td style="overflow-wrap:anywhere">
                          ${escapeHTML(value)}
                        </td>
                      `).join("")}
                    </tr>
                  `).join("")
                  : `
                    <tr>
                      <td colspan="${columns.length}">
                        No collected records for this range.
                      </td>
                    </tr>
                  `
              }
            </tbody>
          </table>
        </div>
      </section>
    `;
  }

  function aggregate(rows, dimension, metric) {
    const groups = new Map();

    for (const row of rows) {
      const name = String(
        row[dimension] || "(not set)"
      );

      if (!groups.has(name)) {
        groups.set(name, []);
      }

      groups.get(name).push(row);
    }

    return [...groups].map(([name, data]) => ({
      name,
      value: total(data, metric),
      rows: data
    })).sort(
      (a, b) =>
        (b.value || 0) - (a.value || 0)
    );
  }

  function gscAggregate(rows, dimension) {
    const groups = new Map();

    rows.forEach(row => {
      const name = String(
        row[dimension] || "(not set)"
      );

      if (!groups.has(name)) {
        groups.set(name, []);
      }

      groups.get(name).push(row);
    });

    return [...groups].map(([name, data]) => {
      const clicks = total(data, "clicks");
      const impressions = total(
        data, "impressions"
      );

      const weightedPosition =
        impressions
          ? data.reduce((sum, row) => {
              const impressions =
                numeric(row.impressions) || 0;

              const position =
                numeric(row.position) || 0;

              return (
                sum +
                impressions * position
              );
            }, 0) / impressions
          : null;

      return {
        name,
        clicks,
        impressions,
        ctr:
          impressions && clicks !== null
            ? clicks / impressions * 100
            : null,
        position: weightedPosition
      };
    }).sort(
      (a, b) =>
        (b.clicks || 0) - (a.clicks || 0)
    );
  }

  function gscTable(title, rows) {
    return table(
      title,
      [
        "Query / URL",
        "Clicks",
        "Impressions",
        "CTR",
        "Avg. position"
      ],
      rows.map(row => [
        row.name,
        formatNumber(row.clicks),
        formatNumber(row.impressions),
        row.ctr === null
          ? "—"
          : row.ctr.toFixed(2) + "%",
        row.position === null
          ? "—"
          : row.position.toFixed(2)
      ]),
      100
    );
  }

  function comparisonTable(
    title,
    currentRows,
    previousRows,
    key,
    metric
  ) {
    const current = aggregate(
      currentRows, key, metric
    );

    const previous = aggregate(
      previousRows, key, metric
    );

    const prevMap = new Map(
      previous.map(x => [x.name, x.value])
    );

    return table(
      title,
      [
        key,
        "Current period",
        "Previous period",
        "Difference"
      ],
      current.map(item => {
        const before = prevMap.get(item.name);
        const difference = (
          item.value !== null &&
          before != null
        )
          ? item.value - before
          : null;

        return [
          item.name,
          formatNumber(item.value),
          formatNumber(before),
          difference === null
            ? "—"
            : (difference > 0 ? "+" : "") +
              formatNumber(difference)
        ];
      })
    );
  }

  /*
    DAILY / WEEKLY / MONTHLY COMPARISON

    Day:
      Date-by-date alignment.
    Week:
      Consecutive 7-day blocks from
      each reporting period's start.
    Month:
      Calendar-month buckets.

    Previous-period series are plotted
    by equivalent sequence number.
  */

  function bucketKey(date, from, mode) {
    if (mode === "week") {
      const index = Math.floor(
        (
          Date.parse(date + "T00:00:00Z") -
          Date.parse(from + "T00:00:00Z")
        ) / 86400000 / 7
      );

      return "week-" + index;
    }

    if (mode === "month") {
      return date.slice(0, 7);
    }

    return date;
  }

  function bucketValues(rows, from, to, metric, mode) {
    const buckets = new Map();

    for (const date of dateList(from, to)) {
      const key = bucketKey(date, from, mode);

      if (!buckets.has(key)) {
        buckets.set(key, {
          key,
          value: 0,
          measured: 0
        });
      }
    }

    for (const row of rows) {
      if (row.date < from || row.date > to) {
        continue;
      }

      const value = numeric(row[metric]);
      if (value === null) continue;

      const key = bucketKey(
        row.date,
        from,
        mode
      );

      const bucket = buckets.get(key);

      if (!bucket) continue;

      bucket.value += value;
      bucket.measured++;
    }

    return [...buckets.values()].map(bucket => ({
      ...bucket,
      value:
        bucket.measured > 0
          ? bucket.value
          : null
    }));
  }

  function trendChart(
    id,
    title,
    rows,
    R,
    metric,
    invert = false
  ) {
    const mode = RS.gran || "day";

    const current = bucketValues(
      rows, R.from, R.to, metric, mode
    );

    const previous = bucketValues(
      rows, R.pf, R.pt, metric, mode
    );

    const count = Math.max(
      current.length,
      previous.length
    );

    const labels = Array.from(
      {length: count},
      (_, i) => {
        if (mode === "day") {
          return "Day " + (i + 1);
        }

        if (mode === "week") {
          return "Week " + (i + 1);
        }

        return current[i]?.key ||
          "Month " + (i + 1);
      }
    );

    return card({
      id,
      title: title + " — " + mode,
      metric: "comparison",
      type: mode === "month" ? "bar" : "line",
      cat: false,
      invert,
      labels,
      xl: labels,
      f: cf,
      ff: nf,
      series: [
        {
          name: "Current period",
          c: 0,
          values: Array.from(
            {length: count},
            (_, i) => current[i]?.value ?? null
          )
        },
        {
          name: "Previous period",
          c: 1,
          dash: true,
          values: Array.from(
            {length: count},
            (_, i) => previous[i]?.value ?? null
          )
        }
      ]
    });
  }

  function categoryChart(
    id,
    title,
    rows,
    dimension,
    metric
  ) {
    const items = aggregate(
      rows,
      dimension,
      metric
    ).filter(x => x.value !== null)
     .slice(0, 10);

    if (!items.length) {
      return warning(
        title +
        ": no category measurements were collected."
      );
    }

    return card(catChart(
      id,
      title,
      items.map(x => x.name),
      items.map(x => x.value),
      "bar",
      nf
    ));
  }

  function categoryComparisonChart(
    id,
    title,
    currentRows,
    previousRows,
    dimension,
    metric
  ) {
    const current = aggregate(
      currentRows,
      dimension,
      metric
    );

    const previous = aggregate(
      previousRows,
      dimension,
      metric
    );

    const ranked = [
      ...new Set([
        ...current.map(x => x.name),
        ...previous.map(x => x.name)
      ])
    ].map(name => ({
      name,
      current: current.find(x => x.name === name),
      previous: previous.find(x => x.name === name)
    })).sort(
      (a, b) =>
        (b.current?.value || 0) -
        (a.current?.value || 0)
    ).slice(0, 8);

    if (!ranked.length) {
      return warning(
        title + ": no measurements available."
      );
    }

    return card({
      id,
      title,
      metric: "comparison",
      type: "bar",
      cat: false,
      labels: ranked.map(x => x.name),
      xl: ranked.map(x => x.name),
      f: cf,
      ff: nf,
      series: [
        {
          name: "Current",
          c: 0,
          values: ranked.map(x =>
            x.current?.value ?? null
          )
        },
        {
          name: "Previous",
          c: 1,
          values: ranked.map(x =>
            x.previous?.value ?? null
          )
        }
      ]
    });
  }

  function controls(R) {
    return `
      <div class="card noprint"
        style="margin-bottom:14px">

        <div class="row sp">
          <div class="row">
            <span class="seg">
              ${[
                [7, "7 days"],
                [28, "28 days"],
                [90, "90 days"]
              ].map(([days, label]) => `
                <button
                  data-act="days"
                  data-v="${days}"
                  class="${
                    !RS.from && RS.days === days
                      ? "on"
                      : ""
                  }">
                  ${label}
                </button>
              `).join("")}
            </span>
          </div>

          <div class="row">
            <span class="seg">
              ${["day", "week", "month"].map(mode => `
                <button
                  data-act="gran"
                  data-v="${mode}"
                  class="${
                    RS.gran === mode
                      ? "on"
                      : ""
                  }">
                  ${mode}
                </button>
              `).join("")}
            </span>
          </div>
        </div>

        <div class="row" style="margin-top:12px">
          <label class="row">
            <small>From</small>
            <input
              type="date"
              id="rf"
              value="${R.from}">
          </label>

          <label class="row">
            <small>To</small>
            <input
              type="date"
              id="rt"
              value="${R.to}">
          </label>

          <button data-act="rapply">
            Apply dates
          </button>
        </div>

        <p class="note">
          Current: ${R.from} to ${R.to}.
          Previous: ${R.pf} to ${R.pt}.
          Both periods contain ${R.n} calendar days.
        </p>
      </div>
    `;
  }

  function navigation() {
    const top = [
      ["gsc", "Google Search Console"],
      ["ga4", "Google Analytics 4"],
      ["technical", "Technical SEO"]
    ];

    return `
      <div class="card noprint"
        style="margin-bottom:14px">

        <div class="row" style="gap:8px">
          ${top.map(([key, label]) => `
            <button
              class="${mainTab === key ? "pri" : ""}"
              data-kr-main="${key}">
              ${label}
            </button>
          `).join("")}
        </div>

        <div class="row"
          style="margin-top:14px;gap:7px">

          ${NAV[mainTab].map(([key, label]) => `
            <button
              data-kr-sub="${key}"
              class="${
                subTab[mainTab] === key ? "pri" : ""
              }">
              ${label}
            </button>
          `).join("")}

        </div>
      </div>
    `;
  }

  function reportError(result, title) {
    if (!result.ok) {
      return warning(
        title + ": " + result.error
      );
    }

    if (!result.rows.length) {
      return warning(
        title +
        ": no records collected for these dates." +
        (result.note ? " " + result.note : "")
      );
    }

    return "";
  }

  /*
    GOOGLE SEARCH CONSOLE
  */

  async function gscDetails(c, R, type) {
    const path = {
      keywords: "/detail/queries",
      pages: "/detail/pages",
      countries: "/detail/gsccountries",
      devices: "/detail/gscdevices"
    }[type];

    const d = await fetchPeriods(
      c, R, path
    );

    const dimension = {
      keywords: "query",
      pages: "page",
      countries: "country",
      devices: "device"
    }[type];

    const title = {
      keywords: "Ranking Keywords",
      pages: "Most Clicked Pages",
      countries: "Search Traffic by Country",
      devices: "Search Traffic by Device"
    }[type];

    const current = gscAggregate(
      d.current.rows,
      dimension
    );

    const previous = gscAggregate(
      d.previous.rows,
      dimension
    );

    const clicked = total(
      d.current.rows,
      "clicks"
    );

    return `
      ${sectionTitle("GSC — " + title)}

      ${tiles([
        ["Returned rows", current.length],
        ["Clicks in returned rows", clicked],
        [
          "Highest clicks",
          current[0]?.clicks ?? null
        ],
        [
          "Previous returned rows",
          previous.length
        ]
      ])}

      ${reportError(d.current, title)}

      <div class="grid g2"
        style="margin-top:14px">

        ${categoryComparisonChart(
          "kr-gsc-" + type + "-" + c.id,
          title + " — Current vs Previous",
          d.current.rows,
          d.previous.rows,
          dimension,
          "clicks"
        )}

        ${categoryChart(
          "kr-gsc-cat-" + type + "-" + c.id,
          "Current clicks by " + dimension,
          d.current.rows,
          dimension,
          "clicks"
        )}

      </div>

      <div style="margin-top:14px">
        ${gscTable(
          title + " — Current period",
          current
        )}
      </div>

      ${note(
        "Results are sorted by Google Search clicks. " +
        "Average position is impression-weighted. " +
        "Search Console can omit anonymized queries " +
        "and limit rows, so detail totals may be " +
        "smaller than Overview totals."
      )}
    `;
  }

  /*
    GOOGLE ANALYTICS 4 — DAILY OVERVIEW
  */

  async function ga4Daily(c, R) {
    return fetchSafe(
      "/daily",
      params(c, R.pf, R.to)
    );
  }

  async function ga4Overview(c, R) {
    const result = await ga4Daily(c, R);

    const rows = result.rows;

    const current = rows.filter(
      r => r.date >= R.from &&
           r.date <= R.to
    );

    const previous = rows.filter(
      r => r.date >= R.pf &&
           r.date <= R.pt
    );

    const coverage = compareCoverage(
      rows, R, "sessions"
    );

    const measures = [
      {
        label: "Sessions",
        key: "sessions"
      },
      {
        label: "Organic Search Sessions",
        key: "organic"
      },
      {
        label: "Page Views",
        key: "pageViews"
      },
      {
        label: "Engaged Sessions",
        key: "engagedSessions"
      }
    ];

    return `
      ${sectionTitle("GA4 — Overview")}

      ${comparisonGrid(
        measures.map(m => ({
          label: m.label,
          current: total(current, m.key),
          previous: total(previous, m.key)
        })),
        coverage
      )}

      ${coverageNotice(
        coverage, "GA4 sessions"
      )}

      ${reportError(
        result, "GA4 overview"
      )}

      <div class="grid g2"
        style="margin-top:14px">

        ${measures.map(m =>
          trendChart(
            "kr-ga4-" + m.key + "-" + c.id,
            m.label,
            rows,
            R,
            m.key
          )
        ).join("")}

      </div>

      ${note(
        "These are session-based and page-view " +
        "metrics. Daily Total Users and Active Users " +
        "must not be summed to calculate unique " +
        "people for the whole period."
      )}
    `;
  }

  /*
    GA4 UNIQUE USERS

    Only accepts exact-period totals when
    a compatible backend endpoint exists.

    Backend response expected:
    {
      totalUsers,
      activeUsers,
      newUsers,
      returningUsers
    }
  */

  async function ga4Users(c, R) {
    const [current, previous, daily] =
      await Promise.all([
        fetchSafe(
          "/report/users",
          params(c, R.from, R.to)
        ),
        fetchSafe(
          "/report/users",
          params(c, R.pf, R.pt)
        ),
        ga4Daily(c, R)
      ]);

    const read = response => {
      const data = response.data || {};

      return (
        data.totals ||
        data.current ||
        data
      );
    };

    const now = read(current);
    const before = read(previous);

    const fields = [
      ["Total Users", "totalUsers"],
      ["Active Users", "activeUsers"],
      ["New Users", "newUsers"],
      ["Returning Users", "returningUsers"]
    ];

    const covered = compareCoverage(
      daily.rows,
      R,
      "sessions"
    );

    const reliable = {
      complete:
        current.ok &&
        previous.ok &&
        covered.complete
    };

    const chartRows = daily.rows;

    const activeChart = trendChart(
      "kr-active-users-" + c.id,
      "Daily Active Users",
      chartRows.map(r => ({
        ...r,
        dailyActive: r.users
      })),
      R,
      "dailyActive"
    );

    return `
      ${sectionTitle("GA4 — Users")}

      ${comparisonGrid(
        fields.map(([label, field]) => ({
          label,
          current: numeric(now[field]),
          previous: numeric(before[field])
        })),
        reliable
      )}

      ${
        !current.ok || !previous.ok
          ? warning(
              "Full-period unique-user reporting " +
              "requires a compatible /api/report/users " +
              "backend endpoint. Do not add daily " +
              "users together."
            )
          : ""
      }

      ${coverageNotice(
        covered, "GA4 daily coverage"
      )}

      <div class="grid g2"
        style="margin-top:14px">

        ${activeChart}

        <section class="card">
          <h3>Understanding User Metrics</h3>

          <p>
            <b>Total Users:</b>
            distinct people recorded during
            the full reporting period.
          </p>

          <p>
            <b>Active Users:</b>
            users meeting GA4's active-user
            definition.
          </p>

          <p>
            <b>New Users:</b>
            users who first interacted
            with the site.
          </p>

          <p>
            <b>Returning Users:</b>
            users who previously interacted
            with the site and returned.
          </p>

          <p class="note">
            These measures have different
            definitions and should not be
            treated as interchangeable.
          </p>
        </section>

      </div>
    `;
  }

  /*
    GA4 CATEGORY REPORTS
  */

  async function ga4Category(
    c, R, configuration
  ) {
    const d = await fetchPeriods(
      c, R, configuration.endpoint
    );

    const current = aggregate(
      d.current.rows,
      configuration.dimension,
      configuration.metric
    );

    const previous = aggregate(
      d.previous.rows,
      configuration.dimension,
      configuration.metric
    );

    const previousMap = new Map(
      previous.map(r => [r.name, r.value])
    );

    return `
      ${sectionTitle(
        "GA4 — " + configuration.title
      )}

      ${tiles([
        [
          "Categories returned",
          current.length
        ],
        [
          "Current " + configuration.metric,
          total(d.current.rows, configuration.metric)
        ],
        [
          "Previous " + configuration.metric,
          total(d.previous.rows, configuration.metric)
        ],
        [
          "Top category " + configuration.metric,
          current[0]?.value ?? null
        ]
      ])}

      ${reportError(
        d.current,
        configuration.title
      )}

      <div class="grid g2"
        style="margin-top:14px">

        ${categoryComparisonChart(
          "kr-" + configuration.id + "-" + c.id,
          configuration.title +
          " — Current vs Previous",
          d.current.rows,
          d.previous.rows,
          configuration.dimension,
          configuration.metric
        )}

        ${categoryChart(
          "kr-current-" +
          configuration.id + "-" + c.id,
          configuration.title +
          " — Current",
          d.current.rows,
          configuration.dimension,
          configuration.metric
        )}

      </div>

      <div style="margin-top:14px">
        ${table(
          configuration.title +
          " — Detailed Comparison",
          [
            configuration.dimension,
            "Current",
            "Previous",
            "Difference"
          ],
          current.map(row => {
            const before =
              previousMap.get(row.name);

            const delta = before == null
              ? null
              : row.value - before;

            return [
              row.name,
              formatNumber(row.value),
              formatNumber(before),
              delta == null
                ? "—"
                : (
                    delta > 0 ? "+" : ""
                  ) + formatNumber(delta)
            ];
          })
        )}
      </div>

      ${note(
        "Category totals reflect the rows " +
        "collected from GA4. Some reports may " +
        "be thresholded, sampled, limited, " +
        "or subject to different attribution. " +
        "Do not interpret missing rows as zero."
      )}

    `;
  }

  const GA4_CATEGORIES = {
    acquisition: {
      id: "acquisition",
      title: "User Acquisition",
      endpoint: "/detail/useracquisition",
      dimension: "firstUserChannel",
      metric: "newUsers"
    },
    traffic: {
      id: "traffic",
      title: "Traffic Acquisition",
      endpoint: "/detail/channels",
      dimension: "channel",
      metric: "sessions"
    },
    pages: {
      id: "pages",
      title: "Most Viewed Pages",
      endpoint: "/detail/ga4pages",
      dimension: "path",
      metric: "views"
    },
    landing: {
      id: "landing",
      title: "Landing Pages",
      endpoint: "/detail/landing",
      dimension: "landingPage",
      metric: "sessions"
    },
    countries: {
      id: "countries",
      title: "Countries",
      endpoint: "/detail/countries",
      dimension: "country",
      metric: "sessions"
    },
    cities: {
      id: "cities",
      title: "Cities",
      endpoint: "/detail/cities",
      dimension: "city",
      metric: "sessions"
    },
    devices: {
      id: "devices",
      title: "Devices",
      endpoint: "/detail/devices",
      dimension: "device",
      metric: "sessions"
    },
    browsers: {
      id: "browsers",
      title: "Browsers",
      endpoint: "/detail/browsers",
      dimension: "browser",
      metric: "sessions"
    },
    events: {
      id: "events",
      title: "Events",
      endpoint: "/detail/events",
      dimension: "eventName",
      metric: "eventCount"
    }
  };

  async function ga4Engagement(c, R) {
    const data = await fetchPeriods(
      c,
      R,
      "/detail/engagement"
    );

    const current = data.current.rows;
    const previous = data.previous.rows;

    // Daily rows: duration metrics require
    // weighted/period-level interpretation.
    const measures = [
      ["Sessions", "sessions"],
      ["Engaged Sessions", "engagedSessions"],
      [
        "Engagement Duration (seconds)",
        "userEngagementDuration"
      ]
    ];

    return `
      ${sectionTitle("GA4 — Engagement")}

      ${tiles(
        measures.map(([label, key]) => [
          label,
          total(current, key)
        ])
      )}

      ${reportError(
        data.current,
        "Engagement"
      )}

      <div class="grid g2"
        style="margin-top:14px">

        ${measures.map(([label, key]) => {
          const combined = [
            ...current,
            ...previous
          ];

          return trendChart(
            "kr-eng-" + key + "-" + c.id,
            label,
            combined,
            R,
            key
          );
        }).join("")}

      </div>

      ${table(
        "Engagement by Date",
        [
          "Date",
          "Sessions",
          "Engaged Sessions",
          "Engagement Rate",
          "Engagement Duration (s)",
          "Average Session Duration (s)"
        ],
        current.map(r => [
          r.date,
          formatNumber(r.sessions),
          formatNumber(r.engagedSessions),
          numeric(r.engagementRate) === null
            ? "—"
            : (
                Number(r.engagementRate) * 100
              ).toFixed(2) + "%",
          formatNumber(
            r.userEngagementDuration,
            1
          ),
          formatNumber(
            r.averageSessionDuration,
            1
          )
        ])
      )}

      ${note(
        "Average session duration and engagement " +
        "rate must not be summed over dates. " +
        "Calculate period totals and weighted " +
        "rates from the correct GA4 aggregation."
      )}
    `;
  }

  /*
    TECHNICAL SEO
  */

  function webVitals(c) {
    const website =
      c.sites && c.sites[0]
        ? c.sites[0]
        : "";

    return `
      ${sectionTitle("Core Web Vitals")}

      <section class="card">

        <div class="row sp">
          <h3>Google PageSpeed Insights</h3>

          <div class="row noprint">
            <button
              data-kr-vitals="mobile"
              data-url="${escapeHTML(website)}">
              Mobile
            </button>

            <button
              data-kr-vitals="desktop"
              data-url="${escapeHTML(website)}">
              Desktop
            </button>
          </div>
        </div>

        <p class="note">
          Website:
          ${escapeHTML(website || "Not configured")}
        </p>

        <div id="kr-vitals-results">
          Select a device to run PageSpeed.
        </div>

        ${note(
          "Performance tests are current snapshots, " +
          "not GA4 traffic graphs. Google may return " +
          "a quota error. Field Core Web Vitals " +
          "are available only when sufficient " +
          "real-user data exists."
        )}
      </section>
    `;
  }

  function indexing(c) {
    const data = c.audit?.idx || {};

    return `
      ${sectionTitle("Google Indexing")}

      ${tiles([
        ["Indexed Pages", numeric(data.indexed)],
        [
          "Not Indexed",
          numeric(data.notindexed)
        ],
        [
          "Pages with Issues",
          numeric(data.issues)
        ]
      ])}

      ${warning(
        "Indexing numbers above come from your " +
        "saved SEO Audit, not an automated " +
        "Search Console Page Indexing API."
      )}

      <section class="card">
        <h3>How to verify indexing</h3>

        <p>
          Open Google Search Console,
          select the project property,
          then open Indexing → Pages.
        </p>

        <p>
          Record verified indexed,
          not-indexed and issue totals
          under your existing SEO Audit tab.
        </p>
      </section>
    `;
  }

  function backlinks(c) {
    const data = c.audit?.bl || {};

    return `
      ${sectionTitle("Backlink Report")}

      ${tiles([
        [
          "Backlinks",
          numeric(data.bl)
        ],
        [
          "Referring Domains",
          numeric(data.rd)
        ],
        [
          "Domain Authority",
          numeric(data.da)
        ],
        [
          "Spam Score",
          numeric(data.spam)
        ]
      ])}

      <section class="card"
        style="margin-top:14px">

        <h3>Backlink Data Source</h3>

        <p>
          These are values saved manually
          in your existing SEO Audit tab.
        </p>

        <p>
          To automate referring domains,
          referring pages, anchor text,
          new backlinks and lost backlinks,
          connect a supported backlink provider.
        </p>

        <p class="note">
          Domain Authority and Spam Score
          are third-party metrics, not
          official Google ranking metrics.
          Historical backlink comparison
          requires dated snapshots.
        </p>

      </section>
    `;
  }

  /*
    ROUTER
  */

  async function reportContent(c, R) {
    if (mainTab === "gsc") {
      if (subTab.gsc === "overview") {
        return originalReportTab(c);
      }

      return gscDetails(
        c, R, subTab.gsc
      );
    }

    if (mainTab === "ga4") {
      const category = subTab.ga4;

      if (category === "overview") {
        return ga4Overview(c, R);
      }

      if (category === "users") {
        return ga4Users(c, R);
      }

      if (category === "engagement") {
        return ga4Engagement(c, R);
      }

      const config = GA4_CATEGORIES[category];

      if (config) {
        return ga4Category(c, R, config);
      }

      return warning(
        "Unknown GA4 report category."
      );
    }

    if (subTab.technical === "vitals") {
      return webVitals(c);
    }

    if (subTab.technical === "indexing") {
      return indexing(c);
    }

    return backlinks(c);
  }

  /*
    REPLACE ONLY SEO REPORT RENDERER
    All other Hub pages remain untouched.
  */

  reportTab = async function(c) {
    const R = range(c);

    let content = "";

    try {
      content = await reportContent(c, R);
    } catch (error) {
      content = warning(
        "Report unavailable: " + error.message
      );
    }

    const originalControls =
      mainTab === "gsc" &&
      subTab.gsc === "overview";

    return `
      ${navigation()}

      ${originalControls ? "" : controls(R)}

      <div id="kr-report-body">
        ${content}
      </div>
    `;
  };

  /*
    EVENTS
  */

  document.addEventListener(
    "click",
    async event => {
      const main = event.target.closest(
        "[data-kr-main]"
      );

      if (main) {
        const selected =
          main.dataset.krMain;

        if (NAV[selected]) {
          mainTab = selected;
          saveNavigation();
          await render();
        }

        return;
      }

      const sub = event.target.closest(
        "[data-kr-sub]"
      );

      if (sub) {
        const selected =
          sub.dataset.krSub;

        if (
          NAV[mainTab].some(
            item => item[0] === selected
          )
        ) {
          subTab[mainTab] = selected;
          saveNavigation();
          await render();
        }

        return;
      }

      const button = event.target.closest(
        "[data-kr-vitals]"
      );

      if (!button) return;

      const result = document.getElementById(
        "kr-vitals-results"
      );

      if (!result) return;

      const website = button.dataset.url;
      const strategy =
        button.dataset.krVitals;

      if (!website) {
        result.textContent =
          "Website URL is not configured.";

        return;
      }

      result.textContent =
        "Loading PageSpeed Insights...";

      button.disabled = true;

      try {
        const data = await api(
          "/vitals",
          {
            url: website,
            strategy
          }
        );

        result.innerHTML = tiles([
          ["Performance Score", data.score],
          ["LCP (seconds)", data.lcp, "", 2],
          ["CLS", data.cls, "", 3],
          ["INP field (ms)", data.inp],
          ["TBT (ms)", data.tbt],
          ["FCP (seconds)", data.fcp, "", 2],
          [
            "Speed Index (seconds)",
            data.si,
            "",
            2
          ]
        ]);

      } catch (error) {
        result.textContent =
          "PageSpeed unavailable: " +
          error.message;
      } finally {
        button.disabled = false;
      }
    }
  );

})();
