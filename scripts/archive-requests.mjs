import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const origin = process.env.SUTD_ARCHIVE_ORIGIN || 'https://web-disign-dashboard-2026.vercel.app';
const month = process.argv[2] || new Date().toISOString().slice(0, 7);
const root = path.resolve('requests');
const refresh = process.argv.includes('--refresh');

async function fetchJson(route) {
  let error;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(new URL(route, origin), { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(65000) });
      if (!response.ok) throw new Error(`${route}: HTTP ${response.status}`);
      return await response.json();
    } catch (caught) {
      error = caught;
      if (attempt < 4) await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
    }
  }
  throw error;
}

async function saveJson(relative, value) {
  const file = path.join(root, relative);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(value));
}

async function readExisting(relative) {
  if (refresh) return null;
  try { return JSON.parse(await readFile(path.join(root, relative), 'utf8')); }
  catch { return null; }
}

async function archive(relative, route, valid) {
  const saved = await readExisting(relative);
  if (saved && valid(saved)) return saved;
  const value = await fetchJson(route);
  if (!valid(value)) throw new Error(`Некорректный ответ: ${route}`);
  await saveJson(relative, value);
  return value;
}

const catalog = await archive('catalog/groups.json', '/sutd-api/student-filter-catalog/?lang=ru', (value) => Array.isArray(value.groups));
const teachers = await archive('catalog/teachers.json', '/sutd-api/teachers/', (value) => Array.isArray(value.items));
const institutes = await archive('catalog/institutes.json', '/sutd-api/institutes/', (value) => Array.isArray(value.items));
const first = await archive(`university/${month}/part-0.json`, `/api/university?month=${month}&part=0`, (value) => Array.isArray(value.groups) && value.part === 0);
const total = first.totalParts;
let next = 1;
let completed = 1;
const groups = [...first.groups];
await Promise.all(Array.from({ length: 2 }, async () => {
  while (next < total) {
    const part = next++;
    const value = await archive(`university/${month}/part-${part}.json`, `/api/university?month=${month}&part=${part}`, (item) => Array.isArray(item.groups) && item.part === part && item.totalParts === total);
    groups.push(...value.groups);
    completed += 1;
    console.log(`Сохранено частей: ${completed}/${total}`);
  }
}));

const semester = groups.find((group) => group.semester?.start)?.semester || null;
const manifest = {
  month,
  archivedAt: new Date().toISOString(),
  totalParts: total,
  partSize: 48,
  groupCount: groups.length,
  teacherCount: teachers.items.length,
  instituteCount: institutes.items.length,
  semester
};
await saveJson('manifest.json', manifest);
console.log(JSON.stringify(manifest, null, 2));
