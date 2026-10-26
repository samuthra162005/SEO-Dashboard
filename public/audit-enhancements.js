
/*
  KANAVU SEO HUB — LIVE AUDIT ENHANCEMENTS

  File: public/audit-enhancements.js

  Preserves:
  - Existing purple dashboard theme
  - Manual SEO health scores
  - Priority action plan
  - Rank.ai report import
  - Backlink audit
  - Indexing audit
  - Keyword tracking
  - All saved Client Tracker data

  Uses existing server endpoints:
  /api/daily
  /api/detail/queries
  /api/detail/pages

  Does not invent missing data.
*/

(() => {
  "use strict";

  if (
    typeof auditTab !== "function" ||
    typeof api !== "function"
  ) {
    return;
  }

  const originalAuditTab = auditTab;

  const cache = new Map();

  // ====================================
  // GENERAL HELPERS
  // ====================================

  function esc(value) {
    return String(value ?? "").replace(
      /[&<>"']/g,
      character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      }[character])
    );
  }

  function number(value) {
    if (
      value === null ||
      value === undefined ||
      value === "" ||
      !Number.isFinite(Number(value))
    ) {
      return null;
    }

    return Number(value);
  }

  function fmt(value) {
    const n = number(value);

    return n === null
      ? "—"
      : n.toLocaleString("en-IN", {
          maximumFractionDigits: 2
        });
  }

  function addDays(date, days) {
    const d = new Date(
      date + "T00:00:00Z"
    );

    d.setUTCDate(
      d.getUTCDate() + days
    );

    return d.toISOString().slice(0, 10);
  }

  function todayIST() {
    const parts = new Intl.DateTimeFormat(
      "en-GB",
      {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      }
    ).formatToParts(new Date());

    const get = type =>
      parts.find(
        part => part.type === type
      ).value;

    return (
      get("year") + "-" +
      get("month") + "-" +
      get("day")
    );
  }

  function sum(rows, field) {
    const values = rows
      .map(row => number(row[field]))
      .filter(value => value !== null);

    return values.length
      ? values.reduce(
          (total, value) => total + value,
          0
        )
      : null;
  }

  // ====================================
  // KPI CARD
  // ====================================

  function metricCard(
    label,
    value,
    description
  ) {
    const display =
      typeof value === "string" &&
      value.endsWith("%")
        ? value
        : fmt(value);

    return `
      <div style="
        border:1px solid var(--bd);
        background:var(--soft);
        border-radius:14px;
        padding:14px;
        min-width:0;
      ">

        <small>
          ${esc(label)}
        </small>

        <div class="num" style="
          font-size:25px;
          margin:7px 0;
        ">
          ${esc(display)}
        </div>

        <small>
          ${esc(description)}
        </small>

      </div>
    `;
  }

  function status(message, isError = false) {
    return `
      <p class="note" style="
        margin:9px 0;
        color:${
          isError
            ? "var(--no)"
            : "var(--mu)"
        };
      ">
        ${esc(message)}
      </p>
    `;
  }

  // ====================================
  // TEXT / URL DISPLAY
  // ====================================

  function entry(value, max = 90) {
    const full = String(
      value || "(not set)"
    );

    const short =
      full.length > max
        ? full.slice(0, max - 1) + "…"
        : full;

    return `
      <span
        title="${esc(full)}"
        style="
          display:block;
          overflow-wrap:anywhere;
        ">
        ${esc(short)}
      </span>
    `;
  }

  // ====================================
  // SEARCH RANKING TABLE
  // ====================================

  function topTable(
    title,
    items,
    firstColumn
  ) {
    return `
      <div style="min-width:0">

        <h3 style="margin-bottom:10px">
          ${esc(title)}
        </h3>

        <div class="tw">

          <table>

            <thead>
              <tr>
                <th>${esc(firstColumn)}</th>
                <th>Clicks</th>
                <th>Impressions</th>
                <th>Avg. Position</th>
              </tr>
            </thead>

            <tbody>

              ${
                items.length
                  ? items.map(item => `
                    <tr>

                      <td>
                        ${entry(item.name)}
                      </td>

                      <td>
                        ${fmt(item.clicks)}
                      </td>

                      <td>
                        ${fmt(item.impressions)}
                      </td>

                      <td>
                        ${
                          item.position === null
                            ? "—"
                            : item.position.toFixed(2)
                        }
                      </td>

                    </tr>
                  `).join("")
                  : `
                    <tr>
                      <td colspan="4">
                        No records collected
                        for this period.
                      </td>
                    </tr>
                  `
              }

            </tbody>

          </table>

        </div>

      </div>
    `;
  }

  // ====================================
  // AGGREGATE GSC QUERIES AND PAGES
  // ====================================

  function ranked(rows, dimension) {
    const map = new Map();

    for (const row of rows) {
      const name = String(
        row[dimension] || "(not set)"
      );

      if (!map.has(name)) {
        map.set(name, {
          name,
          clicks: 0,
          impressions: 0,
          weightedPosition: 0
        });
      }

      const item = map.get(name);

      const clicks =
        number(row.clicks) || 0;

      const impressions =
        number(row.impressions) || 0;

      const position =
        number(row.position) || 0;

      item.clicks += clicks;

      item.impressions += impressions;

      item.weightedPosition +=
        position * impressions;
    }

    return [...map.values()]
      .map(item => ({
        name: item.name,
        clicks: item.clicks,
        impressions: item.impressions,

        position: item.impressions
          ? item.weightedPosition /
            item.impressions
          : null
      }))
      .sort(
        (a, b) => b.clicks - a.clicks
      )
      .slice(0, 5);
  }

  // ====================================
  // SAFE API REQUESTS
  // ====================================

  async function safe(path, query) {
    try {
      const data = await api(
        path,
        query
      );

      return {
        data,
        error: null
      };
    } catch (error) {
      return {
        data: null,
        error: String(
          error.message || error
        )
      };
    }
  }

  async function load(
    client,
    from,
    to
  ) {
    const query = {
      project: client.gsc,
      from,
      to
    };

    const [
      daily,
      queryRows,
      pageRows
    ] = await Promise.all([
      safe("/daily", query),
      safe("/detail/queries", query),
      safe("/detail/pages", query)
    ]);

    return {
      daily,
      queryRows,
      pageRows
    };
  }

  // ====================================
  // BUILD LIVE AUDIT REPORT
  // ====================================

  function renderLive(
    element,
    result,
    from,
    to
  ) {
    const {
      daily,
      queryRows,
      pageRows
    } = result;

    const rows = Array.isArray(
      daily.data
    ) ? daily.data : [];

    const gsc = rows.filter(row =>
      number(row.clicks) !== null &&
      row.date >= from &&
      row.date <= to
    );

    const ga4 = rows.filter(row =>
      number(row.sessions) !== null &&
      row.date >= from &&
      row.date <= to
    );

    const days =
      Math.round(
        (
          Date.parse(to) -
          Date.parse(from)
        ) / 86400000
      ) + 1;

    // GSC totals
    const clicks = sum(
      gsc,
      "clicks"
    );

    const impressions = sum(
      gsc,
      "impressions"
    );

    const ctr = impressions
      ? (
          clicks / impressions * 100
        ).toFixed(2) + "%"
      : "—";

    // Impression-weighted position
    const weightedRows = gsc.filter(
      row =>
        number(row.position) !== null &&
        number(row.impressions) > 0
    );

    const weightedDenominator = sum(
      weightedRows,
      "impressions"
    );

    const position =
      weightedDenominator
        ? weightedRows.reduce(
            (total, row) =>
              total +
              Number(row.impressions) *
              Number(row.position),
            0
          ) / weightedDenominator
        : null;

    // GSC details
    const queries = Array.isArray(
      queryRows.data?.rows
    ) ? queryRows.data.rows : [];

    const pages = Array.isArray(
      pageRows.data?.rows
    ) ? pageRows.data.rows : [];

    // ====================================
    // HTML OUTPUT
    // ====================================

    element.innerHTML = `

      <div class="row sp"
        style="margin-bottom:14px">

        <div>

          <h3>
            Connected performance snapshot
          </h3>

          <small>
            ${esc(from)} to ${esc(to)}
            · Google reporting data
          </small>

        </div>

        <span class="pill">
          GSC ${gsc.length}/${days} days
          ·
          GA4 ${ga4.length}/${days} days
        </span>

      </div>

      <!-- LIVE METRIC CARDS -->

      <div class="grid g4"
        style="gap:12px">

        ${metricCard(
          "GSC Clicks",
          clicks,
          "Clicks from Google Search"
        )}

        ${metricCard(
          "GSC Impressions",
          impressions,
          "Appearances in Google Search"
        )}

        ${metricCard(
          "GSC CTR",
          ctr,
          "Clicks divided by impressions"
        )}

        ${metricCard(
          "GSC Average Position",
          position,
          "Lower usually means higher position"
        )}

        ${metricCard(
          "GA4 Sessions",
          sum(ga4, "sessions"),
          "All traffic sources"
        )}

        ${metricCard(
          "Organic Search Sessions",
          sum(ga4, "organic"),
          "Organic traffic in GA4"
        )}

        ${metricCard(
          "GA4 Page Views",
          sum(ga4, "pageViews"),
          "Tracked page views"
        )}

        ${metricCard(
          "Engaged Sessions",
          sum(ga4, "engagedSessions"),
          "GA4 engaged sessions"
        )}

      </div>

      ${status(
        "Missing days are not counted as zero. " +
        "Unique users are not displayed because " +
        "daily unique-user counts cannot be " +
        "added to calculate full-period users."
      )}

      ${
        daily.error
          ? status(
              "Daily report: " +
              daily.error,
              true
            )
          : ""
      }

      <!-- QUERIES AND PAGES -->

      <div class="grid g2"
        style="
          margin-top:18px;
          align-items:start;
        ">

        ${topTable(
          "Top Google Search Queries",
          ranked(
            queries,
            "query"
          ),
          "Query"
        )}

        ${topTable(
          "Pages Receiving Google Search Clicks",
          ranked(
            pages,
            "page"
          ),
          "Page URL"
        )}

      </div>

      ${
        queryRows.error
          ? status(
              "Keywords: " +
              queryRows.error,
              true
            )
          : ""
      }

      ${
        pageRows.error
          ? status(
              "Pages: " +
              pageRows.error,
              true
            )
          : ""
      }

      ${status(
        "These measurements do not overwrite " +
        "your manually entered SEO health " +
        "scores, indexing figures or backlinks."
      )}

    `;
  }

  // ====================================
  // LOAD DATA INTO AUDIT PAGE
  // ====================================

  async function loadInto(
    element,
    client
  ) {
    if (!client.gsc) {
      element.innerHTML = status(
        "This client does not have a " +
        "connected SEO project."
      );

      return;
    }

    // Use last 28 completed reporting days.
    // GSC is normally delayed.
    const to = addDays(
      todayIST(),
      -3
    );

    const from = addDays(
      to,
      -27
    );

    const key =
      client.gsc + "|" +
      from + "|" + to;

    let saved = cache.get(key);

    if (
      !saved ||
      Date.now() - saved.time >
        120000
    ) {
      const result = await load(
        client,
        from,
        to
      );

      saved = {
        result,
        time: Date.now()
      };

      cache.set(
        key,
        saved
      );
    }

    if (
      !element.isConnected ||
      element.dataset.auditProject !==
        client.id
    ) {
      return;
    }

    renderLive(
      element,
      saved.result,
      from,
      to
    );
  }

  // ====================================
  // PRESERVE EXISTING AUDIT PAGE
  // ====================================

  auditTab = function(client) {
    const originalHTML =
      originalAuditTab(client);

    const intro = `

      <section class="card"
        style="margin-bottom:18px">

        <div class="row sp">

          <div>

            <h2>
              Live SEO Audit Summary
            </h2>

            <p class="note"
              style="margin:6px 0">

              Google Search Console and
              GA4 measurements, separate
              from your editable SEO Audit.

            </p>

          </div>

          <button
            class="mini"
            data-live-audit-refresh="${esc(client.id)}">

            Refresh Snapshot

          </button>

        </div>

        <div
          id="audit-live-${esc(client.id)}"
          data-audit-project="${esc(client.id)}">

          <p class="note">
            Loading connected SEO metrics...
          </p>

        </div>

      </section>

    `;

    // Render original audit first.
    // Populate the live summary after it mounts.
    setTimeout(() => {
      const element =
        document.getElementById(
          "audit-live-" + client.id
        );

      if (!element) return;

      loadInto(element, client)
        .catch(error => {
          if (element.isConnected) {
            element.textContent =
              "Live summary unavailable: " +
              error.message;
          }
        });
    }, 0);

    return intro + originalHTML;
  };

  // ====================================
  // MANUAL REFRESH BUTTON
  // ====================================

  document.addEventListener(
    "click",
    event => {
      const button =
        event.target.closest(
          "[data-live-audit-refresh]"
        );

      if (!button) return;

      event.preventDefault();
      event.stopPropagation();

      const clientId =
        button.dataset.liveAuditRefresh;

      const selectedClient =
        typeof client === "function"
          ? client(clientId)
          : null;

      if (!selectedClient) return;

      cache.clear();

      const element =
        document.getElementById(
          "audit-live-" +
          selectedClient.id
        );

      if (!element) return;

      element.innerHTML = `
        <p class="note">
          Refreshing connected SEO metrics...
        </p>
      `;

      loadInto(
        element,
        selectedClient
      ).catch(error => {
        element.textContent =
          "Refresh failed: " +
          error.message;
      });
    },
    true
  );

})();
