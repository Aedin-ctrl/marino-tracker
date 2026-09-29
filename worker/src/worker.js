// Records how busy Northeastern's Marino Center (and SquashBusters) is.
//
// Every 10 minutes (cron in wrangler.toml) it reads the public facility-count
// feed behind recreation.northeastern.edu/live-facility-counts and stores each
// new staff headcount once (a room's count repeats in the feed until staff
// count it again). GET /history returns the last 28 days in the same shape as
// the GitHub-recorded data/history.json, so aedinlai.com/gym can merge both.

const FEED = 'https://goboardapi.azurewebsites.net/api/FacilityCount/GetCountsByAccount' +
  '?AccountAPIKey=2a2be0d8-df10-4a48-bedd-b3bc0cd628e7';
const KEEP_DAYS = 28;
const STALE_MINUTES = 120;   // an older count means the room is closed or not being counted
const ALLOWED_ORIGINS = ['https://www.aedinlai.com', 'https://aedinlai.com', 'http://127.0.0.1:8932'];

// The feed's times are Eastern local time without a zone.
function easternToEpoch(local) {
  const asUtc = Date.parse(local + 'Z');
  const d = new Date(asUtc);
  const utcWall = Date.parse(d.toLocaleString('en-US', { timeZone: 'UTC' }));
  const easternWall = Date.parse(d.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  return asUtc + (utcWall - easternWall);
}

async function record(env) {
  const res = await fetch(FEED, { headers: { 'User-Agent': 'marino-tracker (aedinlai.com)' } });
  if (!res.ok) throw new Error(`feed returned HTTP ${res.status}`);
  const rooms = await res.json();
  if (!Array.isArray(rooms) || !rooms.length) throw new Error('feed returned no rooms');
  const now = Date.now();
  const statements = [];
  for (const r of rooms) {
    const id = String(r.LocationId);
    statements.push(env.DB.prepare(
      'INSERT INTO rooms (id, name, facility, capacity) VALUES (?, ?, ?, ?) ' +
      'ON CONFLICT(id) DO UPDATE SET name = excluded.name, facility = excluded.facility, capacity = excluded.capacity')
      .bind(id, r.LocationName.replace(/\s*-\s*/g, ' - ').replace(/\s+/g, ' ').trim(), r.FacilityName, r.TotalCapacity));
    const counted = easternToEpoch(r.LastUpdatedDateAndTime);
    if (r.IsClosed || !(now - counted < STALE_MINUTES * 60000) || !Number.isInteger(r.LastCount)) continue;
    statements.push(env.DB.prepare('INSERT OR IGNORE INTO readings (room_id, counted_at, count) VALUES (?, ?, ?)')
      .bind(id, Math.round(counted / 1000), r.LastCount));
  }
  statements.push(env.DB.prepare('DELETE FROM readings WHERE counted_at < ?').bind(Math.floor(now / 1000) - KEEP_DAYS * 86400));
  await env.DB.batch(statements);
}

function cors(request) {
  const origin = request.headers.get('Origin');
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Vary': 'Origin',
  };
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(record(env));
  },

  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method !== 'GET' || url.pathname !== '/history') {
      return new Response('Not found', { status: 404, headers: cors(request) });
    }
    const since = Math.floor(Date.now() / 1000) - KEEP_DAYS * 86400;
    const [rooms, readings] = await Promise.all([
      env.DB.prepare('SELECT * FROM rooms').all(),
      env.DB.prepare('SELECT room_id, counted_at, count FROM readings WHERE counted_at >= ? ORDER BY counted_at').bind(since).all(),
    ]);
    const body = {
      rooms: Object.fromEntries(rooms.results.map(r => [r.id, { name: r.name, facility: r.facility, capacity: r.capacity }])),
      // One entry per headcount, shaped like history.json samples (t, c, u).
      samples: readings.results.map(r => ({ t: r.counted_at, c: { [r.room_id]: r.count }, u: { [r.room_id]: r.counted_at } })),
      updated: new Date().toISOString(),
    };
    return new Response(JSON.stringify(body), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=120', ...cors(request) },
    });
  },
};
