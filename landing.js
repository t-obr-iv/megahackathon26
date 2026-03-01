// landing.js v3 – using Leaflet instead of TomTom SDK
console.log('[landing.js] loaded');

// if you don't supply a key via ?key=... we fall back to a hardcoded
// example so the map still appears.  the warning message is kept for
// clarity but the developer can ignore it in production.
const DEFAULT_API_KEY = 'XLQo2TtzklMGi5tST0tITQ8KHu1yFcGt';

// top-10 routes cached after first load so the panel can use them without
// re-fetching when the user clicks a sidebar button.
let cachedRoutes = null;

// Leaflet map instance stored globally so MTA toggle can add/remove layers.
let leafletMap = null;

// MTA subway layer and cached GeoJSON
let mtaLayer = null;
let mtaGeoJSON = null;

// Official NYC MTA subway line colors
const MTA_LINE_COLORS = {
  'A': '#0039A6', 'C': '#0039A6', 'E': '#0039A6',
  'B': '#FF6319', 'D': '#FF6319', 'F': '#FF6319', 'M': '#FF6319',
  'G': '#6CBE45',
  'J': '#996633', 'Z': '#996633',
  'L': '#A7A9AC',
  'N': '#FCCC0A', 'Q': '#FCCC0A', 'R': '#FCCC0A', 'W': '#FCCC0A',
  '1': '#EE352E', '2': '#EE352E', '3': '#EE352E',
  '4': '#00933C', '5': '#00933C', '6': '#00933C',
  '7': '#B933AD',
  'S': '#808183', 'FS': '#808183', 'GS': '#808183',
  'H': '#0039A6', 'SI': '#0039A6',
};

// palette for the ten busiest routes.  kept at top-level so other helpers can
// reference it (e.g. sidebar styling, hover highlights).
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

function getKeyFromQuery() {
  const params = new URLSearchParams(window.location.search);
  // prefer the user-supplied key; if none provided we return the default
  // which prevents the "API key missing" alert message from showing up.
  return params.get('key') || DEFAULT_API_KEY;
}

function showMapMessage(msg) {
  const el = document.getElementById('map-error');
  if (el) el.textContent = msg;
}

function clearMapMessage() {
  const el = document.getElementById('map-error');
  if (el) {
    el.textContent = '';
    el.style.display = 'none';
  }
}

// sidebar highlight helpers — called on polyline hover
function highlightSidebar(idx) {
  console.log('highlightSidebar', idx);
  const btn = document.querySelector(`.sidebar .route-btn[data-index="${idx}"]`);
  if (!btn) return;
  const color = ROUTE_COLORS[idx] || 'var(--accent)';
  // store colour in a custom property so CSS can handle the rest
  btn.style.setProperty('--route-color', color);
  btn.classList.add('highlight');
}
function unhighlightSidebar(idx) {
  console.log('unhighlightSidebar', idx);
  const btn = document.querySelector(`.sidebar .route-btn[data-index="${idx}"]`);
  if (!btn) return;
  btn.classList.remove('highlight');
  btn.style.removeProperty('--route-color');
}

// apply colours to sidebar dots so they always match ROUTE_COLORS
function styleSidebar() {
  document.querySelectorAll('.sidebar .route-btn').forEach(el => {
    const idx = parseInt(el.getAttribute('data-index'), 10);
    if (!isNaN(idx) && ROUTE_COLORS[idx]) {
      const dot = el.querySelector('.dot');
      if (dot) dot.style.background = ROUTE_COLORS[idx];
    }
  });
}

async function initMap() {
  const apiKey = getKeyFromQuery();
  
  if (!apiKey) {
    // the default key above should normally prevent us reaching here, but in
    // case it ever happens we still display a gentle message rather than
    // breaking entirely.
    showMapMessage(
      'API key missing.\n\n' +
      'Add to URL: ?key=XLQo2TtzklMGi5tST0tITQ8KHu1yFcGt'
    );
    // continue anyway; the map call will most likely fail when loading
    // tiles but at least the user sees the message.
  }

  showMapMessage('Loading map...');
  
  // load Leaflet library
  const leafletScript = document.createElement('script');
  leafletScript.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
  leafletScript.onload = () => setupLeafletMap(apiKey);
  leafletScript.onerror = () => {
    console.error('Failed to load Leaflet');
    showMapMessage('Failed to load map library');
  };
  document.head.appendChild(leafletScript);
}

function setupLeafletMap(apiKey) {
  try {
    console.log('Setting up Leaflet map');
    const mapEl = document.querySelector('.map-content');
    console.log('Map container:', mapEl, 'Size:', mapEl?.offsetWidth, 'x', mapEl?.offsetHeight);
    
    leafletMap = L.map(mapEl, { attributionControl: true }).setView([40.7128, -74.0060], 12);
    const map = leafletMap;
    console.log('Leaflet map created');
    
    // Use OpenStreetMap tiles (free, no key needed, always works)
    const osmUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
    console.log('OSM tile URL:', osmUrl);
    L.tileLayer(osmUrl, {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);
    console.log('OSM tile layer added');
    
    // Try to add TomTom traffic as overlay (non-critical if it fails)
    const trafficTileUrl = 'https://api.tomtom.com/map/1/tile/Traffic/Absolute/{z}/{x}/{y}.png?key=' + apiKey;
    console.log('Attempting traffic overlay:', trafficTileUrl);
    L.tileLayer(trafficTileUrl, {
      attribution: '© TomTom Traffic',
      maxZoom: 19,
      opacity: 0.5,
    }).addTo(map);
    
    clearMapMessage();
    styleSidebar();
    addBusyRoads(map);
    console.log('Map setup complete');
  } catch (e) {
    console.error('Error initializing map', e);
    showMapMessage('Map initialization failed: ' + e.message);
  }
}

// helper that attempts to load a merged dataset first, then falls back
// to the original busy_roads.json.  This lets you supply both CSVs via a
// Python preprocessing step (see combine_routes.py) and get up to 200
// routes on the map.  If the combined file is absent we gracefully
// degrade to the single-source file.
async function loadRoutes() {
  try {
    let resp = await fetch('combined_routes.json');
    if (resp.ok) {
      console.log('Loaded combined_routes.json (merged)');
      return resp.json();
    }
    console.warn('combined_routes.json not found (status ' + resp.status + '); falling back to busy_roads.json');

    resp = await fetch('busy_roads.json');
    if (!resp.ok) {
      console.warn('No busy_roads.json found (status ' + resp.status + ')');
      return [];
    }
    return resp.json();
  } catch (err) {
    console.error('loadRoutes fetch error', err);
    return [];
  }
}

async function addBusyRoads(map) {
  try {
    let routes = await loadRoutes();
    console.log('Loaded', routes.length, 'routes');
    if (!routes || !routes.length) {
      showMapMessage('No traffic routes available (check console for fetch errors)');
      return;
    }
    // keep only the ten busiest by mean_flow_ratio
    routes = routes.slice().sort((a,b)=>(b.mean_flow_ratio||0)-(a.mean_flow_ratio||0)).slice(0,10);
    console.log('Reducing to top 10 busiest routes');
    // cache so the panel can use them without re-fetching
    cachedRoutes = routes;

    // palette for the ten busiest routes.  these colours match the
    // header borders on route1.html…route10.html, and ensure the map and
    // individual pages use a consistent key.
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

    // colour code by congestion level – still used for fallback/OSRM
    // lines when the route-specific palette isn't available.  this gives a
    // reasonable default if you ever load more than ten routes.
    const colorMap = {
      'free': '#00cc00',        // green
      'moderate': '#ffaa00',    // orange
      'heavy': '#ff0000',       // red
    };

    // Store the fallback polylines so they can be removed once we have a
    // proper OSRM geometry.  These thin dashed lines correspond to the raw
    // TomTom sample points and are the "dotted lines in the water" that you
    // asked about – they are merely a quick approximation that may cut
    // straight across bodies of water or other off‑road areas.  They are
    // intentionally styled lightly (weight 1, low opacity, dashed) so you can
    // tell them apart from the real routed traffic overlay.
    const fallbackLines = [];

    function drawFallback(route, index) {
      // when route_points exist (the original dataset) use them; otherwise
      // draw a straight line between origin and destination so the user can
      // still see every route from the merged CSV.  The dashed styling
      // indicates the geometry might be approximate.
      let latlngs;
      if (route.route_points && route.route_points.length) {
        latlngs = route.route_points.map(p => [p[0], p[1]]);
      } else {
        latlngs = [[route.origin_lat, route.origin_lon], [route.dest_lat, route.dest_lon]];
      }
      const color = ROUTE_COLORS[index] || colorMap[route.congestion_label] || '#888';
      // use the same appearance as the eventual OSRM line so there's no
      // visual difference between routes from the two CSVs.  opacity is a
      // little lower just to hint that this is the "initial" geometry.
      const line = L.polyline(latlngs, {
        color: color,
        weight: 5,
        opacity: 0.7,
        lineCap: 'round',
        smoothFactor: 1,
      }).addTo(map);
      // hover highlight
      line.on('mouseover', () => highlightSidebar(index));
      line.on('mouseout', () => unhighlightSidebar(index));
      fallbackLines.push(line);
    }

    // track which fallback lines can be removed once OSRM succeeds
    const routeFallbackMap = new Map();

    const modifiedFetchAndDrawOSRM = async function(route, index) {
      const { origin_lat, origin_lon, dest_lat, dest_lon } = route;
      const coordStr = `${origin_lon},${origin_lat};${dest_lon},${dest_lat}`;
      const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${coordStr}?overview=full&geometries=geojson`;

      try {
        const r = await fetch(osrmUrl);
        if (!r.ok) throw new Error(`OSRM ${r.status}`);
        const data = await r.json();
        if (!data.routes || !data.routes[0]) {
          // OSRM succeeded but no route found; draw fallback as last resort
          drawFallback(route, index);
          return;
        }
        const coords = data.routes[0].geometry.coordinates; // [lon,lat]
        const latlngs = coords.map(c => [c[1], c[0]]);
        const color = ROUTE_COLORS[index] || colorMap[route.congestion_label] || '#ff0000';
        const flow = route.mean_flow_ratio || 0.5;
        const popupText = `
          <div>
            <strong>Congestion: ${route.congestion_label}</strong><br/>
            Flow: ${(flow * 100).toFixed(0)}% of free-flow<br/>
            Time saved: ${route.time_saved_s}s<br/>
            Score: ${route.flow_agreement_score.toFixed(3)}
          </div>
        `;
        // remove fallback if it exists
        const fallback = routeFallbackMap.get(index);
        if (fallback) {
          map.removeLayer(fallback);
          routeFallbackMap.delete(index);
        }
        const osrmLine = L.polyline(latlngs, {
          color: color,
          weight: 5,
          opacity: 0.9,
          lineCap: 'round',
          smoothFactor: 1,
        }).bindPopup(popupText).addTo(map);
        osrmLine.on('mouseover', () => highlightSidebar(index));
        osrmLine.on('mouseout', () => unhighlightSidebar(index));
      } catch (e) {
        // OSRM failed; draw fallback as last resort only
        console.error('OSRM route failed for', coordStr, e);
        drawFallback(route, index);
      }
    };

    // fetch OSRM geometry for all routes; fallback lines only drawn if OSRM fails
    console.log(`Drawing ${routes.length} busiest routes...`);
    for (let i = 0; i < routes.length; i++) {
      await modifiedFetchAndDrawOSRM(routes[i], i);
      await new Promise(r => setTimeout(r, 200));
    }

    console.log('All traffic routes overlaid on map');
  } catch (err) {
    console.error('Failed to load busy roads', err);
  }
}

// intercept sidebar route-button clicks to show an in-page panel instead of
// navigating to routeN.html.  if routes haven't finished loading yet the
// click falls through to the normal href so the user still gets the info.
function setupRouteButtons() {
  document.querySelectorAll('.sidebar .route-btn[data-index]').forEach(btn => {
    btn.addEventListener('click', e => {
      if (!cachedRoutes) return; // routes not loaded yet – allow normal navigation
      e.preventDefault();
      const idx = parseInt(btn.getAttribute('data-index'), 10);
      showRoutePanel(idx);
    });
  });

  const closeBtn = document.getElementById('panel-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      const panel = document.getElementById('route-panel');
      if (panel) panel.style.display = 'none';
    });
  }
}

function showRoutePanel(index) {
  const panel = document.getElementById('route-panel');
  if (!panel) return;

  const route = cachedRoutes && cachedRoutes[index];
  const color = ROUTE_COLORS[index] || 'var(--accent)';

  const title = document.getElementById('panel-title');
  if (title) {
    title.textContent = `Route ${index + 1}`;
    title.style.paddingLeft = '14px';
    title.style.borderLeft = `3px solid ${color}`;
  }

  const sub = document.getElementById('panel-sub');
  if (sub) {
    if (route) {
      let txt = `Mean flow ratio ${(route.mean_flow_ratio || 0).toFixed(2)}`;
      if (route.origin_lat != null) {
        txt += ` – ${route.origin_lat.toFixed(4)},${route.origin_lon.toFixed(4)} → ${route.dest_lat.toFixed(4)},${route.dest_lon.toFixed(4)}`;
      }
      sub.textContent = txt;
    } else {
      sub.textContent = '';
    }
  }

  const body = document.getElementById('panel-body');
  if (body) {
    if (!route) {
      body.innerHTML = '<div class="stat-card"><div class="label">Loading…</div></div>';
    } else {
      const avgSpeed = (route.fast_dist_m && route.fast_time_s)
        ? ((route.fast_dist_m / route.fast_time_s) * 3.6).toFixed(1) + ' km/h'
        : '—';
      const stats = [
        ['Avg Speed',       avgSpeed,                                                         ''],
        ['Daily Volume',    route.mean_flow_ratio != null ? route.mean_flow_ratio.toFixed(2) : '—', 'flow ratio'],
        ['Avg Delay',       route.time_saved_s    != null ? route.time_saved_s + 's'         : '—', ''],
        ['Short distance',  route.short_dist_m    != null ? route.short_dist_m + ' m'        : '—', ''],
        ['Short time',      route.short_time_s    != null ? route.short_time_s + 's'         : '—', ''],
        ['Fast distance',   route.fast_dist_m     != null ? route.fast_dist_m + ' m'         : '—', ''],
        ['Fast time',       route.fast_time_s     != null ? route.fast_time_s + 's'          : '—', ''],
        ['Time saved',      route.time_saved_s    != null ? route.time_saved_s + 's'         : '—', ''],
        ['Congestion',      route.congestion_label || '—',                                    ''],
        ['Flow agreement',  route.flow_agreement_score != null ? route.flow_agreement_score.toFixed(3) : '—', ''],
      ];
      body.innerHTML = stats.map(([label, val, note]) => `
        <div class="stat-card">
          <div class="label">${label}</div>
          <div class="empty-val">${val}</div>
          ${note ? `<div class="empty-note">${note}</div>` : ''}
        </div>
      `).join('') + `
        <div class="info-card">
          <div class="label">Information</div>
          <div class="info-content"></div>
        </div>
      `;
    }
  }

  // hide the overview panel if it's currently covering the map area
  const overviewPanel = document.getElementById('overview-panel');
  if (overviewPanel) overviewPanel.style.display = 'none';

  panel.style.display = 'flex';
}

function getMtaLineColor(feature) {
  // _color is pre-computed from the route relation's colour/ref tags
  return feature.properties._color || '#888888';
}

async function loadMtaOverlay() {
  if (!leafletMap) throw new Error('Map not ready yet – try again in a moment');
  if (!mtaGeoJSON) {
    // Use Overpass named-set syntax:
    //   ->.routes  stores the matched route relations
    //   .routes out body;   outputs relations with tags + member ID lists (no geometry)
    //   way(r.routes);      selects all way-members of those relations
    //   out geom;           outputs ways with inline node coordinates
    // Bounding box covers all five NYC boroughs; avoids relying on network= tag
    // which may be missing or differently cased on some relations.
    const bbox = '40.4774,-74.2591,40.9176,-73.7004';
    const query = `[out:json][timeout:120];
relation["type"="route"]["route"="subway"](${bbox})->.routes;
.routes out body;
way(r.routes);
out geom;`;

    console.log('[MTA] fetching from Overpass...');
    const resp = await fetch(
      'https://overpass-api.de/api/interpreter?data=' + encodeURIComponent(query)
    );
    if (!resp.ok) throw new Error('Overpass fetch failed: ' + resp.status);
    const data = await resp.json();

    const relations = (data.elements || []).filter(e => e.type === 'relation');
    const ways      = (data.elements || []).filter(e => e.type === 'way');
    console.log('[MTA] relations:', relations.length, '| ways:', ways.length);

    if (!relations.length) throw new Error('Overpass: no subway route relations in bbox');

    // Build wayId → color from relation membership + colour/ref tags
    const wayColorMap = new Map();
    for (const rel of relations) {
      if (!rel.tags) continue;
      const ref   = (rel.tags.ref || '').trim().toUpperCase();
      const color = rel.tags.colour || MTA_LINE_COLORS[ref] || '#888888';
      const name  = rel.tags.name || '';
      for (const m of (rel.members || [])) {
        if (m.type === 'way' && !wayColorMap.has(m.ref)) {
          wayColorMap.set(m.ref, { color, ref, name });
        }
      }
    }
    console.log('[MTA] way→color entries:', wayColorMap.size);

    const waysWithGeom = ways.filter(w => w.geometry && w.geometry.length >= 2);
    console.log('[MTA] ways with geometry:', waysWithGeom.length, '/ total ways:', ways.length);

    const features = waysWithGeom.map(w => {
      const info = wayColorMap.get(w.id) || {};
      return {
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: w.geometry.map(p => [p.lon, p.lat]),
        },
        properties: {
          _color: info.color || '#888888',
          _ref:   info.ref   || '',
          _name:  info.name  || '',
        },
      };
    });

    console.log('[MTA]', features.length, 'features ready');
    if (!features.length) throw new Error('No subway features after processing');
    mtaGeoJSON = { type: 'FeatureCollection', features };
  }

  mtaLayer = L.geoJSON(mtaGeoJSON, {
    style: feature => ({
      color: getMtaLineColor(feature),
      weight: 3,
      opacity: 0.85,
    }),
    onEachFeature: (feature, layer) => {
      const ref   = feature.properties._ref;
      const name  = feature.properties._name;
      const label = name || (ref ? ref + ' Train' : 'Subway Line');
      layer.bindPopup(`<strong>${label}</strong>`, { maxWidth: 220 });
    },
  }).addTo(leafletMap);
  console.log('[MTA] layer drawn:', mtaLayer.getLayers().length, 'polylines');
}

function setupMtaToggle() {
  const toggle = document.getElementById('mta-toggle');
  if (!toggle) return;
  const label = toggle.closest('.mta-toggle');

  toggle.addEventListener('change', async () => {
    if (toggle.checked) {
      toggle.disabled = true;
      label.classList.add('mta-loading');
      try {
        await loadMtaOverlay();
      } catch (e) {
        console.error('Failed to load MTA subway lines', e);
        toggle.checked = false;
      } finally {
        toggle.disabled = false;
        label.classList.remove('mta-loading');
      }
    } else {
      if (mtaLayer && leafletMap) {
        leafletMap.removeLayer(mtaLayer);
        mtaLayer = null;
      }
    }
  });
}

function setupOverviewButton() {
  const overviewBtn = document.querySelector('.sidebar .overview-btn');
  if (overviewBtn) {
    overviewBtn.addEventListener('click', e => {
      e.preventDefault();
      // hide route panel if open
      const routePanel = document.getElementById('route-panel');
      if (routePanel) routePanel.style.display = 'none';
      const panel = document.getElementById('overview-panel');
      if (panel) panel.style.display = 'flex';
    });
  }

  const closeBtn = document.getElementById('overview-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      const panel = document.getElementById('overview-panel');
      if (panel) panel.style.display = 'none';
    });
  }
}

window.addEventListener('DOMContentLoaded', () => {
  initMap();
  setupRouteButtons();
  setupMtaToggle();
  setupOverviewButton();
});
