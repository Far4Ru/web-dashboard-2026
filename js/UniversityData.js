import { getLessonsForDate, getMoscowDate, getWeekStart } from './SutdApi.js';
import { loadUniversitySnapshot } from './UniversityParts.js';
import { pruneCache } from './DataCache.js';

const snapshots = new Map();
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
let worker;
try {
  if (typeof Worker !== 'undefined') worker = new Worker(new URL('./UniversityWorker.js', import.meta.url), { type: 'module' });
} catch { worker = null; }

function useDirectLoader() {
  worker?.terminate();
  worker = null;
  snapshots.forEach((entry, month) => {
    if (!entry.resolve) return;
    loadUniversitySnapshot(month, (loaded, total) => {
      entry.loaded = loaded; entry.total = total; entry.notify();
    }).then(entry.resolve, entry.reject);
    entry.resolve = null;
  });
}

if (worker) {
  worker.addEventListener('message', ({ data }) => {
    const entry = snapshots.get(data.month);
    if (!entry) return;
    if (data.type === 'progress') {
      entry.loaded = data.loaded; entry.total = data.total; entry.notify();
    } else if (data.type === 'result') {
      entry.resolve?.(data.snapshot); entry.resolve = null;
    } else if (data.type === 'error') {
      loadUniversitySnapshot(data.month, (loaded, total) => {
        entry.loaded = loaded; entry.total = total; entry.notify();
      }).then(entry.resolve, entry.reject);
      entry.resolve = null;
    }
  });
  worker.addEventListener('error', useDirectLoader, { once: true });
  if (!globalThis.navigator?.connection?.saveData) {
    const warm = () => worker?.postMessage({ type: 'warm', month: getMoscowDate().slice(0, 7) });
    if ('requestIdleCallback' in globalThis) requestIdleCallback(warm, { timeout: 5000 });
    else setTimeout(warm, 1500);
  }
}
pruneCache();

function weekTypeFor(group, date) {
  if (!['den', 'num'].includes(group.weekType)) return group.weekType;
  const difference = Math.round((Date.parse(getWeekStart(date)) - Date.parse(group.weekStart)) / WEEK_MS);
  return Math.abs(difference) % 2 === 0 ? group.weekType : group.weekType === 'den' ? 'num' : 'den';
}

export function getUniversitySnapshot(month = getMoscowDate().slice(0, 7), onProgress) {
  let entry = snapshots.get(month);
  if (!entry) {
    entry = { loaded: 0, total: 0, listeners: new Set(), notify() { this.listeners.forEach((listener) => listener(this.loaded, this.total)); } };
    if (worker) {
      entry.promise = new Promise((resolve, reject) => {
        entry.resolve = resolve; entry.reject = reject;
        worker.postMessage({ type: 'load', month });
      });
    } else {
      entry.promise = loadUniversitySnapshot(month, (loaded, total) => {
        entry.loaded = loaded; entry.total = total; entry.notify();
      });
    }
    entry.promise = entry.promise.catch((error) => { snapshots.delete(month); throw error; });
    snapshots.set(month, entry);
  }
  if (onProgress) { entry.listeners.add(onProgress); onProgress(entry.loaded, entry.total); entry.promise.finally(() => entry.listeners.delete(onProgress)).catch(() => {}); }
  return entry.promise;
}

export function lessonsForDate(snapshot, date) {
  const result = [];
  snapshot.groups.forEach((group) => {
    if (group.semester?.start && date < group.semester.start) return;
    if (group.semester?.end && date > group.semester.end) return;
    const payload = { schedule: group.lessons, week_type: weekTypeFor(group, date) };
    getLessonsForDate(payload, date).forEach((lesson) => result.push({ ...lesson, group: group.label, groupId: group.id }));
  });
  return result.sort((a, b) => a.start_time.localeCompare(b.start_time));
}

export function filterByTime(lessons, date, mode, from, to) {
  if (mode === 'all') return lessons;
  if (mode === 'remaining') {
    const today = getMoscowDate();
    if (date < today) return [];
    if (date > today) return lessons;
    const now = new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
    return lessons.filter((lesson) => (lesson.end_time || lesson.start_time) > now);
  }
  if (mode === 'interval') return lessons.filter((lesson) => lesson.start_time < to && (lesson.end_time || lesson.start_time) > from);
  return lessons;
}

export function filterByScope(lessons, scope, target, selection) {
  const query = (target || '').toLocaleLowerCase('ru');
  if (scope === 'all') return lessons;
  if (scope === 'my') return lessons.filter((lesson) => selection?.type === 'group'
    ? Number(lesson.groupId) === Number(selection.id)
    : lesson.teachers?.some((teacher) => Number(teacher.id) === Number(selection?.id)) || lesson.teacher === selection?.label);
  if (!query) return lessons;
  if (scope === 'address') return lessons.filter((lesson) => (lesson.building || '').toLocaleLowerCase('ru').includes(query));
  if (scope === 'teacher') return lessons.filter((lesson) => [lesson.teacher, ...(lesson.teachers || []).map((teacher) => teacher.full_name)].join(' ').toLocaleLowerCase('ru').includes(query));
  if (scope === 'group') return lessons.filter((lesson) => (lesson.group || '').toLocaleLowerCase('ru').includes(query));
  return lessons;
}

export function isActiveInSemester(group) {
  const { start, end } = group.semester || {};
  if (!start || !end) return false;
  return group.lessons.some((lesson) => lesson.date
    ? lesson.date >= start && lesson.date <= end
    : (!lesson.start_date || lesson.start_date <= end) && (!lesson.end_date || lesson.end_date >= start));
}

export function activeTeachers(snapshot) {
  const teachers = new Map();
  snapshot.groups.filter(isActiveInSemester).forEach((group) => group.lessons.forEach((lesson) => {
    const { start, end } = group.semester;
    if (lesson.date ? lesson.date < start || lesson.date > end : (lesson.start_date && lesson.start_date > end) || (lesson.end_date && lesson.end_date < start)) return;
    (lesson.teachers || []).forEach((teacher) => teachers.set(teacher.id, teacher.full_name));
  }));
  return teachers;
}

export function monthDates(month) {
  const [year, number] = month.split('-').map(Number);
  const count = new Date(Date.UTC(year, number, 0)).getUTCDate();
  return Array.from({ length: count }, (_, index) => `${month}-${String(index + 1).padStart(2, '0')}`);
}

export function semesterMonths(snapshot) {
  const semester = snapshot.groups.find((group) => group.semester?.start)?.semester;
  if (!semester) return [];
  const months = [];
  for (let cursor = semester.start.slice(0, 7); cursor <= semester.end.slice(0, 7);) {
    months.push(cursor);
    const [year, number] = cursor.split('-').map(Number);
    cursor = new Date(Date.UTC(year, number, 1)).toISOString().slice(0, 7);
  }
  return months;
}
