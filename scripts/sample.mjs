// Records how busy the Marino Center (and SquashBusters) is: one sample of
// every room's head count, appended to data/history.json. Run every 15 min by
// .github/workflows/sample.yml; aedinlai.com/projects/marino-tracker reads it.
//
// Source: the Connect2Concepts "Facility Count" feed behind
// recreation.northeastern.edu/live-facility-counts (staff update each room
// roughly hourly).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const API = 'https://goboardapi.azurewebsites.net/api/FacilityCount/GetCountsByAccount' +
  '?AccountAPIKey=2a2be0d8-df10-4a48-bedd-b3bc0cd628e7';
const FILE = new URL('../data/history.json', import.meta.url);
const KEEP_DAYS = 28;
// A count older than this is left out (the room is closed or nobody's
// counting), so an overnight leftover doesn't read as a busy gym.
const STALE_MINUTES = 120;

// The feed's times are Eastern local time without a zone.
function easternToEpoch(local) {
  const asUtc = Date.parse(local + 'Z');
  const d = new Date(asUtc);
  const utcWall = Date.parse(d.toLocaleString('en-US', { timeZone: 'UTC' }));
  const easternWall = Date.parse(d.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  return asUtc + (utcWall - easternWall);
}

const res = await fetch(API, { headers: { 'User-Agent': 'marino-tracker (github.com/Aedin-ctrl/marino-tracker)' } });
if (!res.ok) throw new Error(`feed returned HTTP ${res.status}`);
const rooms = await res.json();
if (!Array.isArray(rooms) || !rooms.length) throw new Error('feed returned no rooms');

const history = existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')) : { rooms: {}, samples: [] };
const now = Date.now();
const counts = {};
const countedAt = {};   // when staff last counted each room (unix seconds)
for (const r of rooms) {
  const id = String(r.LocationId);
  history.rooms[id] = {
    name: r.LocationName.replace(/\s*-\s*/g, ' - ').replace(/\s+/g, ' ').trim(),
    facility: r.FacilityName,
    capacity: r.TotalCapacity,
  };
  const counted = easternToEpoch(r.LastUpdatedDateAndTime);
  const ageMin = (now - counted) / 60000;
  counts[id] = r.IsClosed || !(ageMin < STALE_MINUTES) ? null : r.LastCount;
  countedAt[id] = Math.round(counted / 1000);
}

// The feed repeats a room's last count until staff count it again, so each
// sample also says when every count was taken (`u`); readers use that to
// avoid counting one headcount several times.
history.samples.push({ t: Math.round(now / 1000), c: counts, u: countedAt });
const cutoff = now / 1000 - KEEP_DAYS * 86400;
history.samples = history.samples.filter(s => s.t >= cutoff);
history.updated = new Date(now).toISOString();

writeFileSync(FILE, JSON.stringify(history) + '\n');
const open = Object.values(counts).filter(c => c !== null);
console.log(`recorded ${open.length}/${rooms.length} rooms open, ${open.reduce((a, b) => a + b, 0)} people; ${history.samples.length} samples kept`);
