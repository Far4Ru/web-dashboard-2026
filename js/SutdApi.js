const API_BASE = '/sutd-api';

export async function fetchJson(path, signal) {
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(`${API_BASE}${path}`, { signal, headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error(`API вернул HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      if (error.name === 'AbortError') throw error;
      lastError = error;
      if (!attempt) await new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, 450);
        signal?.addEventListener('abort', () => { clearTimeout(timer); reject(new DOMException('Запрос отменён', 'AbortError')); }, { once: true });
      });
    }
  }
  throw lastError;
}

export const getCatalog = (signal) => fetchJson('/student-filter-catalog/?lang=ru', signal);
export const getTeachers = (signal) => fetchJson('/teachers/', signal);
export const getInstitutes = (signal) => fetchJson('/institutes/', signal);
export const getGroupSchedule = (groupId, signal) => fetchJson(`/group_schedule/?group_id=${encodeURIComponent(groupId)}&week_start=${getWeekStart()}`, signal);
export const getGroupScheduleForWeek = (groupId, weekStart, signal) => fetchJson(`/group_schedule/?group_id=${encodeURIComponent(groupId)}&week_start=${weekStart}`, signal);
export const getTeacherSchedule = (teacherId, signal) => fetchJson(`/teacher_schedule/?teacher_id=${encodeURIComponent(teacherId)}&week_start=${getWeekStart()}`, signal);
export const getScheduleForSelection = (selection, signal) => selection.type === 'teacher'
  ? getTeacherSchedule(selection.id, signal)
  : getGroupSchedule(selection.id, signal);
export const getScheduleForSelectionWeek = (selection, weekStart, signal) => selection.type === 'teacher'
  ? fetchJson(`/teacher_schedule/?teacher_id=${encodeURIComponent(selection.id)}&week_start=${weekStart}`, signal)
  : getGroupScheduleForWeek(selection.id, weekStart, signal);

export function getMoscowDate() {
  const parts = new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export function getWeekStart(dateString = getMoscowDate()) {
  const date = new Date(`${dateString}T12:00:00Z`);
  const weekday = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - weekday + 1);
  return date.toISOString().slice(0, 10);
}

export function getTodayLessons(payload) {
  return getLessonsForDate(payload, getMoscowDate());
}

export function getLessonsForDate(payload, dateString) {
  if (!payload?.schedule) return [];
  const weekday = new Intl.DateTimeFormat('ru-RU', { timeZone: 'UTC', weekday: 'long' }).format(new Date(`${dateString}T12:00:00Z`));
  const normalizedWeekday = weekday[0].toUpperCase() + weekday.slice(1);
  return payload.schedule
    .filter((lesson) => {
      if (lesson.date) return lesson.date === dateString;
      if (lesson.weekday !== normalizedWeekday) return false;
      if (lesson.start_date && dateString < lesson.start_date) return false;
      if (lesson.end_date && dateString > lesson.end_date) return false;
      return lesson.week_type === 'both' || lesson.week_type === payload.week_type;
    })
    .sort((a, b) => a.start_time.localeCompare(b.start_time));
}

export function getWeekDates(payload) {
  const start = payload?.week_start || getWeekStart();
  const base = new Date(`${start}T12:00:00Z`);
  return Array.from({ length: 6 }, (_, index) => {
    const date = new Date(base); date.setUTCDate(base.getUTCDate() + index);
    const value = date.toISOString().slice(0, 10);
    const weekday = new Intl.DateTimeFormat('ru-RU', { weekday: 'short', timeZone: 'UTC' }).format(date).replace('.', '');
    return { value, label: `${weekday[0].toUpperCase()}${weekday.slice(1)} ${date.getUTCDate()}` };
  });
}

export function formatCurrentDate() {
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Europe/Moscow', weekday: 'long', day: 'numeric', month: 'long'
  }).format(new Date());
}
