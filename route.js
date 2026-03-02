// route.js – populate individual route pages with data from the merged dataset
console.log('[route.js] loaded');

// simple palette of ten distinct colors; these are also used on the
// main map so that each "top 10" route keeps the same hue everywhere.
const ROUTE_COLORS = [
  '#3b82f6', // blue
  '#10b981', // green
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#14b8a6', // teal
  '#f43f5e', // rose
  '#0ea5e9', // light blue
  '#a855f7', // purple
];

async function populateRoutePage() {
  // determine which page we're on (route1.html -> 1)
  const match = window.location.pathname.match(/route(\d+)\.html$/i);
  if (!match) return;
  const pageIndex = parseInt(match[1], 10) - 1; // 0-based
  if (pageIndex < 0 || pageIndex >= ROUTE_COLORS.length) return;

  // allow data to be injected directly in the HTML for offline/file use
  let route = null;
  if (window.ROUTE_PAGE_DATA) {
    console.log('using embedded ROUTE_PAGE_DATA');
    route = window.ROUTE_PAGE_DATA;
  }

  try {
    if (!route) {
      const resp = await fetch('combined_routes.json');
      if (!resp.ok) {
        console.warn('could not fetch combined_routes.json', resp.status);
        return;
      }
      const data = await resp.json();
      // sort by "busyness" metric – we use mean_flow_ratio as a proxy for
      // how many people are travelling the segment.  the larger, the more
      // flow relative to a free‑flow baseline.
      const top = data.slice().sort((a, b) => (b.mean_flow_ratio || 0) - (a.mean_flow_ratio || 0)).slice(0, 10);
      route = top[pageIndex];
    }
    if (!route) return;
    console.log('populating page', pageIndex+1, 'with route', route);

    // colour‑code header so it matches the map
    const header = document.querySelector('.route-header h2');
    if (header) {
      header.style.borderLeftColor = ROUTE_COLORS[pageIndex];
    }

    const sub = document.querySelector('.route-header .sub');
    if (sub) {
      let txt = `Mean flow ratio ${(route.mean_flow_ratio || 0).toFixed(2)}`;
      if (route.origin_lat != null && route.origin_lon != null &&
          route.dest_lat != null && route.dest_lon != null) {
        txt += ` – ${(route.origin_lat).toFixed(4)},${(route.origin_lon).toFixed(4)} → ${(route.dest_lat).toFixed(4)},${(route.dest_lon).toFixed(4)}`;
      }
      sub.textContent = txt;
    }

    function setStat(labelText, value, note) {
      document.querySelectorAll('.stat-card').forEach(card => {
        const lbl = card.querySelector('.label');
        if (lbl && lbl.textContent.trim() === labelText) {
          const v = card.querySelector('.empty-val');
          if (v) v.textContent = value;
          const n = card.querySelector('.empty-note');
          if (n) n.textContent = note || '';
        }
      });
    }

    // compute derived values
    const avgSpeed = (route.fast_dist_m && route.fast_time_s) ?
      (route.fast_dist_m / route.fast_time_s) * 3.6 :
      null; // km/h
    setStat('Avg Speed', avgSpeed ? `${avgSpeed.toFixed(1)} km/h` : '—', '');
    setStat('Daily Volume', route.mean_flow_ratio != null ? route.mean_flow_ratio.toFixed(2) : '—', 'flow ratio');
    setStat('Avg Delay', route.time_saved_s != null ? `${route.time_saved_s}s` : '—', '');

    // add any remaining stats as new cards
    const extraStats = [
      ['Short distance', route.short_dist_m != null ? `${route.short_dist_m} m` : '—'],
      ['Short time', route.short_time_s != null ? `${route.short_time_s}s` : '—'],
      ['Fast distance', route.fast_dist_m != null ? `${route.fast_dist_m} m` : '—'],
      ['Fast time', route.fast_time_s != null ? `${route.fast_time_s}s` : '—'],
      ['Time saved', route.time_saved_s != null ? `${route.time_saved_s}s` : '—'],
      ['Congestion', route.congestion_label || '—'],
      ['Flow agreement', route.flow_agreement_score != null ? route.flow_agreement_score.toFixed(3) : '—'],
    ];
    const body = document.querySelector('.route-body');
    if (body) {
      extraStats.forEach(([label, val]) => {
        const card = document.createElement('div');
        card.className = 'stat-card';
        card.innerHTML = `<div class="label">${label}</div><div class="empty-val">${val}</div>`;
        body.appendChild(card);
      });

      // Information section – full-width card at the bottom for manual notes
      // Only add if it doesn't already exist in the HTML
      if (!body.querySelector('.info-card')) {
        const infoCard = document.createElement('div');
        infoCard.className = 'info-card';
        infoCard.innerHTML = `<div class="label">Information</div><div class="info-content"></div>`;
        body.appendChild(infoCard);
      }
    }


    // other cards (charts, incidents) are left as placeholders; you can
    // extend this script to pull real-time data from your own APIs.
  } catch (e) {
    console.error('route.js error', e);
  }
}

document.addEventListener('DOMContentLoaded', populateRoutePage);
