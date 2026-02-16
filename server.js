const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

// ─── Configuration ──────────────────────────────────────────────────────────

const NYC_API_URL = 'https://api.nyc.gov/public/api/GetCalendar';
const NYC_API_KEY = process.env.NYC_API_KEY; // NYC 311 API key
const API_TOKEN = process.env.API_TOKEN; // Shared secret for client auth
const POLL_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes default

// ─── In-Memory Cache ────────────────────────────────────────────────────────

let cachedData = null;       // Latest raw JSON from NYC API
let lastFetched = null;      // Timestamp of last successful fetch
let lastError = null;        // Last error message (if any)
let consecutiveErrors = 0;   // Track consecutive failures

// ─── NYC API Polling ────────────────────────────────────────────────────────

async function fetchFromNYC() {
  if (!NYC_API_KEY) {
    console.error('[ERROR] NYC_API_KEY environment variable is not set');
    lastError = 'NYC_API_KEY not configured';
    return;
  }

  try {
    // Build date strings in Eastern Time for today and tomorrow
    const now = new Date();
    const eastern = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const tomorrow = new Date(eastern);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const fmt = (d) =>
      `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;

    const fromDate = fmt(eastern);
    const toDate = fmt(tomorrow);
    const url = `${NYC_API_URL}?fromdate=${fromDate}&todate=${toDate}`;

    const response = await fetch(url, {
      headers: { 'Ocp-Apim-Subscription-Key': NYC_API_KEY },
    });

    if (!response.ok) {
      throw new Error(`NYC API returned ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    cachedData = data;
    lastFetched = new Date().toISOString();
    lastError = null;
    consecutiveErrors = 0;

    console.log(`[${lastFetched}] Fetched NYC calendar data for ${fromDate} – ${toDate}`);
  } catch (err) {
    consecutiveErrors++;
    lastError = err.message;
    console.error(`[ERROR] Failed to fetch NYC API (attempt #${consecutiveErrors}): ${err.message}`);
  }
}

// ─── CORS Middleware ────────────────────────────────────────────────────────

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }

  next();
});

// ─── Auth Middleware ────────────────────────────────────────────────────────
// Clients must send: Authorization: Bearer <API_TOKEN>
// Applied to /api/* routes only — /health stays open for uptime monitors

function requireAuth(req, res, next) {
  if (!API_TOKEN) {
    console.warn('[WARN] API_TOKEN not set — auth is disabled');
    return next();
  }

  // Check Authorization header first, then fall back to ?token= query param
  const authHeader = req.headers.authorization;
  let token;

  if (authHeader) {
    const [scheme, headerToken] = authHeader.split(' ');
    if (scheme === 'Bearer') token = headerToken;
  } else {
    token = req.query.token;
  }

  if (!token || token !== API_TOKEN) {
    return res.status(403).json({ error: 'Invalid or missing token' });
  }

  next();
}

// ─── Helpers ────────────────────────────────────────────────────────────────

// Extract parking data for a given day index (0 = today, 1 = tomorrow)
function getParkingForDay(dayIndex) {
  if (!cachedData || !cachedData.days || !cachedData.days[dayIndex]) {
    return null;
  }

  const day = cachedData.days[dayIndex];
  const parking = day.items.find((item) => item.type === 'Alternate Side Parking');

  if (!parking) return null;

  return {
    date: day.today_id,
    status: parking.status,
    details: parking.details,
    exceptionName: parking.exceptionName || null,
  };
}

// ─── Routes ─────────────────────────────────────────────────────────────────

// Full cached response (all services, both days)
app.get('/api/status', requireAuth, (req, res) => {
  if (!cachedData) {
    return res.status(503).json({
      error: 'No data available yet',
      message: lastError || 'Service is starting up, data will be available shortly.',
    });
  }

  res.json({ lastFetched, data: cachedData });
});

// Parking today + tomorrow in one response
app.get('/api/parking', requireAuth, (req, res) => {
  const today = getParkingForDay(0);

  if (!today) {
    return res.status(503).json({
      error: 'No data available yet',
      message: lastError || 'Service is starting up, data will be available shortly.',
    });
  }

  res.json({
    lastFetched,
    today,
    tomorrow: getParkingForDay(1) || null,
  });
});

// Parking today only
app.get('/api/parking/today', requireAuth, (req, res) => {
  const today = getParkingForDay(0);

  if (!today) {
    return res.status(503).json({
      error: 'No data available yet',
      message: lastError || 'Service is starting up, data will be available shortly.',
    });
  }

  res.json({ lastFetched, ...today });
});

// Parking tomorrow only
app.get('/api/parking/tomorrow', requireAuth, (req, res) => {
  const tomorrow = getParkingForDay(1);

  if (!tomorrow) {
    return res.status(503).json({
      error: 'No data available yet',
      message: lastError || 'Tomorrow data not available.',
    });
  }

  res.json({ lastFetched, ...tomorrow });
});

// Health check
app.get('/health', (req, res) => {
  const healthy = cachedData !== null && consecutiveErrors < 10;

  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'ok' : 'degraded',
    lastFetched,
    consecutiveErrors,
    lastError,
    uptime: process.uptime(),
  });
});

// ─── Start Server ───────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`NYC ASP Status service running on port ${PORT}`);

  if (!API_TOKEN) {
    console.warn('[WARN] API_TOKEN not set — all /api routes are unprotected');
  }

  // Fetch immediately on startup
  fetchFromNYC();

  // Then poll every 2 minutes
  setInterval(fetchFromNYC, POLL_INTERVAL_MS);
});