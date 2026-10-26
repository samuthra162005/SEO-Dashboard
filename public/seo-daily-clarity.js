
/*
  KANAVU SEO HUB — CLEAR DAILY REPORT
  File: public/seo-daily-clarity.js

  Load after seo-report-tabs.js.

  Features:
  - Every date displayed separately
  - Bar and line graphs
  - GSC and GA4 metrics
  - Current versus previous period
  - Click a date for exact values
  - Full date-by-date table
  - No overlapping URL labels
  - Missing dates clearly marked
*/

(() => {
  "use strict";

  if (
    typeof reportTab !== "function" ||
    typeof range !== "function" ||
    typeof api !== "function"
  ) return;

  const oldReport = reportTab;

  let source = "gsc";
  let metric = "clicks";
  let type = "bar";
  let selected = "";

  const defs = {
    gsc: [
      ["clicks", "Clicks", "count"],
      ["impressions", "Impressions", "count"],
      ["ctr", "CTR", "percent"],
      ["position", "Average position", "decimal"]
    ],
    ga4: [
      ["sessions", "Sessions", "count"],
      ["organic", "Organic Search sessions", "count"],
      ["pageViews", "Page views", "count"],
      ["engagedSessions", "Engaged sessions", "count"],
      ["users", "Daily active users", "count"]
    ]
  };

  const e = value =>
    String(value ?? "").replace(
      /[&<>"']/g,
      ch => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      }[ch])
    );

  const n = value =>
    value == null ||
    value === "" ||
    !Number.isFinite(Number(value))
      ? null
      : Number(value);

  function fmt(value, kind) {
    if (value == null) return "Not reported";

    if (kind === "percent") {
      return (value * 100).toFixed(2) + "%";
    }

    if (kind === "decimal") {
      return value.toFixed(2);
    }

    return value.toLocaleString("en-IN", {
      maximumFractionDigits: 0
    });
  }

  function add(date, days) {
    const d = new Date(date + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }

  function dates(from, to) {
    const result = [];

    for (
      let d = from;
      d <= to && result.length < 366;
      d = add(d, 1)
    ) {
      result.push(d);
    }

    return result;
  }

  function showDate(date) {
    return new Date(
      date + "T00:00:00Z"
    ).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      timeZone: "UTC"
    });
  }

  function selectedDef() {
    return defs[source].find(
      item => item[0] === metric
    ) || defs[source][0];
  }

  function changeBadge(current, previous, key) {
    if (current == null || previous == null) {
      return '<span style="color:#777">Unavailable</span>';
    }

    const delta = current - previous;

    const improved = key === "position"
      ? delta < 0
      : delta > 0;

    const color = delta === 0
      ? "#666"
      : improved
        ? "#137e54"
        : "#c33838";

    const symbol = delta > 0
      ? "▲"
      : delta < 0
        ? "▼"
        : "●";

    const value = key === "ctr"
      ? (Math.abs(delta) * 100).toFixed(2) + " pp"
      : previous === 0
        ? "previous 0"
        : (
            Math.abs(delta / previous) * 100
          ).toFixed(1) + "%";

    return `
      <strong style="color:${color}">
        ${symbol} ${value}
      </strong>
    `;
  }

  function dailyGraph(rows, definition) {
    const [field, label, format] = definition;

    const width = Math.max(
      740,
      rows.length * 78
    );

    const height = 285;
    const left = 49;
    const right = 19;
    const top = 28;
    const bottom = 62;

    const plotWidth = width - left - right;
    const plotHeight = height - top - bottom;

    const maximum = Math.max(
      1,
      ...rows.flatMap(
        row => [row.now, row.before]
      ).filter(value => value != null)
    );

    const y = value =>
      top + plotHeight -
      (value / maximum) * plotHeight;

    const midpoint = index =>
      left +
      (index + 0.5) *
      plotWidth / rows.length;

    const grid = [0, .25, .5, .75, 1]
      .map(part => {
        const yy =
          top + plotHeight * (1 - part);

        return `
          <line
            x1="${left}"
            y1="${yy}"
            x2="${width - right}"
            y2="${yy}"
            stroke="#e3dff4"
          />

          <text
            x="${left - 8}"
            y="${yy + 4}"
            text-anchor="end"
            fill="#665b85"
            font-size="11">
            ${e(fmt(maximum * part, format))}
          </text>
        `;
      }).join("");

    let graphics = "";

    if (type === "line") {
      [
        ["now", "#7141d8"],
        ["before", "#259f91"]
      ].forEach(([key, color]) => {
        let segment = [];

        function flush() {
          if (segment.length > 1) {
            graphics += `
              <polyline
                points="${segment.join(" ")}"
                fill="none"
                stroke="${color}"
                stroke-width="3"
              />
            `;
          }

          segment = [];
        }

        rows.forEach((row, index) => {
          const value = row[key];

          if (value == null) {
            flush();
            return;
          }

          const xx = midpoint(index);
          const yy = y(value);

          segment.push(`${xx},${yy}`);

          graphics += `
            <circle
              cx="${xx}"
              cy="${yy}"
              r="5"
              fill="${color}"
              data-seo-date="${e(row.date)}"
              style="cursor:pointer">
              <title>
                ${e(row.date)}:
                ${e(fmt(value, format))}
              </title>
            </circle>
          `;
        });

        flush();
      });
    } else {
      rows.forEach((row, index) => {
        const xx = midpoint(index);

        [
          ["now", "#7141d8", -16],
          ["before", "#259f91", 2]
        ].forEach(([key, color, offset]) => {
          const value = row[key];

          if (value == null) return;

          const yy = y(value);

          graphics += `
            <rect
              x="${xx + offset}"
              y="${yy}"
              width="14"
              height="${
                Math.max(
                  1,
                  top + plotHeight - yy
                )
              }"
              rx="3"
              fill="${color}"
              data-seo-date="${e(row.date)}"
              style="cursor:pointer">
              <title>
                ${e(row.date)}:
                ${e(fmt(value, format))}
              </title>
            </rect>
          `;
        });
      });
    }

    const labels = rows.map(
      (row, index) => `
        <text
          x="${midpoint(index)}"
          y="${height - 32}"
          text-anchor="middle"
          font-size="11"
          fill="#554a79">
          ${e(showDate(row.date))}
        </text>
      `
    ).join("");

    return `
      <div style="
        overflow-x:auto;
        max-width:100%;
        border:1px solid #e9e3f8;
        border-radius:12px">

        <svg
          width="${width}"
          height="${height}"
          viewBox="0 0 ${width} ${height}"
          role="img"
          aria-label="${e(label)} by date">

          ${grid}
          ${graphics}
          ${labels}

        </svg>
      </div>
    `;
  }

  async function dailyReport(c) {
    const R = range(c);

    if (!c.gsc) return "";

    if (
      !defs[source].some(
        item => item[0] === metric
      )
    ) {
      metric = defs[source][0][0];
    }

    const definition = selectedDef();

    let response;

    try {
      response = await api("/daily", {
        project: c.gsc,
        from: R.pf,
        to: R.to
      });
    } catch (error) {
      return `
        <section class="card">
          <h3>Daily report unavailable</h3>
          <p>${e(error.message)}</p>
        </section>
      `;
    }

    const records = Array.isArray(response)
      ? response
      : Array.isArray(response?.rows)
        ? response.rows
        : [];

    const byDate = new Map(
      records.map(row => [row.date, row])
    );

    const selectedDates = dates(
      R.from,
      R.to
    );

    const rows = selectedDates.map(
      (date, index) => {
        const previousDate = add(
          R.pf,
          index
        );

        return {
          date,
          previousDate,
          now: n(
            byDate.get(date)?.[definition[0]]
          ),
          before: n(
            byDate.get(previousDate)?.[definition[0]]
          )
        };
      }
    );

    const currentDays = rows.filter(
      row => row.now != null
    ).length;

    const previousDays = rows.filter(
      row => row.before != null
    ).length;

    if (
      !selected ||
      !rows.some(row => row.date === selected)
    ) {
      selected = selectedDates[0] || "";
    }

    const active = rows.find(
      row => row.date === selected
    );

    return `
      <section class="card" style="
        margin:12px 0 20px;
        padding:18px;
        border:1px solid #ddd3f8;
        border-radius:18px">

        <div class="row sp"
          style="flex-wrap:wrap;gap:12px">

          <div>
            <h2 style="margin:0">
              Daily date-by-date report
            </h2>

            <p class="note" style="margin:5px 0">
              ${e(R.from)} – ${e(R.to)}
            </p>
          </div>

          <div class="row"
            style="gap:6px;flex-wrap:wrap">

            <button data-seo-source="gsc"
              class="${source === "gsc" ? "pri" : ""}">
              GSC
            </button>

            <button data-seo-source="ga4"
              class="${source === "ga4" ? "pri" : ""}">
              GA4
            </button>

            <button data-seo-chart="bar"
              class="${type === "bar" ? "pri" : ""}">
              Bar
            </button>

            <button data-seo-chart="line"
              class="${type === "line" ? "pri" : ""}">
              Line
            </button>

          </div>
        </div>

        <div class="row" style="
          gap:6px;
          flex-wrap:wrap;
          margin:12px 0">

          ${defs[source].map(item => `
            <button
              data-seo-metric="${e(item[0])}"
              class="${metric === item[0] ? "pri" : ""}">
              ${e(item[1])}
            </button>
          `).join("")}

        </div>

        <p class="note">
          Purple: current period |
          Teal: previous period |
          Available: current ${currentDays}/${rows.length},
          previous ${previousDays}/${rows.length}.
        </p>

        ${dailyGraph(rows, definition)}

        <p class="note">
          Every selected date is displayed individually.
          Scroll horizontally for longer periods.
          Click a bar or point to view its exact value.
        </p>

        <div style="
          background:#f4f0fe;
          padding:12px;
          border-radius:10px;
          margin:10px 0">

          <strong>
            ${e(definition[1])} —
            ${e(selected)}
          </strong>

          <p style="margin:7px 0 0">
            Current:
            <b>${e(fmt(active?.now, definition[2]))}</b>

            |

            Previous:
            <b>${e(fmt(active?.before, definition[2]))}</b>

            |

            ${changeBadge(
              active?.now,
              active?.before,
              definition[0]
            )}
          </p>
        </div>

        <div class="tw" style="overflow-x:auto">
          <table style="width:100%">
            <thead>
              <tr>
                <th>Date</th>
                <th>Current</th>
                <th>Comparison date</th>
                <th>Previous</th>
                <th>Change</th>
              </tr>
            </thead>

            <tbody>
              ${rows.map(row => `
                <tr
                  data-seo-row="${e(row.date)}"
                  style="
                    cursor:pointer;
                    ${
                      row.date === selected
                        ? "background:#f0eafb"
                        : ""
                    }">

                  <td>${e(showDate(row.date))}</td>

                  <td>
                    ${e(fmt(row.now, definition[2]))}
                  </td>

                  <td>
                    ${e(showDate(row.previousDate))}
                  </td>

                  <td>
                    ${e(fmt(row.before, definition[2]))}
                  </td>

                  <td>
                    ${changeBadge(
                      row.now,
                      row.before,
                      definition[0]
                    )}
                  </td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>

        <p class="note">
          ${
            currentDays === rows.length &&
            previousDays === rows.length
              ? "Both periods have date coverage."
              : "One or both periods have missing dates. Full-period changes are withheld."
          }
        </p>

        ${
          definition[0] === "users"
            ? `<p class="note">
                Daily active users must not be added
                to calculate unique users across
                the entire reporting period.
              </p>`
            : ""
        }

      </section>
    `;
  }

  reportTab = async function(c) {
    const [extra, original] = await Promise.all([
      dailyReport(c),
      oldReport(c)
    ]);

    return extra + original;
  };

  document.addEventListener(
    "click",
    event => {
      const button = event.target.closest(
        "[data-seo-source]," +
        "[data-seo-metric]," +
        "[data-seo-chart]," +
        "[data-seo-date]," +
        "[data-seo-row]"
      );

      if (!button) return;

      if (button.dataset.seoSource) {
        source = button.dataset.seoSource;
        metric = defs[source][0][0];
      }

      if (button.dataset.seoMetric) {
        metric = button.dataset.seoMetric;
      }

      if (button.dataset.seoChart) {
        type = button.dataset.seoChart;
      }

      if (button.dataset.seoDate) {
        selected = button.dataset.seoDate;
      }

      if (button.dataset.seoRow) {
        selected = button.dataset.seoRow;
      }

      event.preventDefault();

      if (typeof render === "function") {
        render();
      }
    },
    true
  );
})();
