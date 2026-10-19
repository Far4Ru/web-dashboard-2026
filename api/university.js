const ORIGIN = 'https://schedule.sutd.ru/api';
const PART_SIZE = 48;
const CONCURRENCY = 6;
const catalogCache = { groups: null, expires: 0 };

async function readJson(url) {
  let error;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(12000) });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (caught) {
      error = caught;
      if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 400));
    }
  }
  throw error;
}

async function getGroups() {
  if (catalogCache.groups && Date.now() < catalogCache.expires) return catalogCache.groups;
  const catalog = await readJson(`${ORIGIN}/student-filter-catalog/?lang=ru`);
  if (!Array.isArray(catalog?.groups)) throw new Error('Каталог групп недоступен');
  catalogCache.groups = catalog.groups;
  catalogCache.expires = Date.now() + 60 * 60 * 1000;
  return catalog.groups;
}

function anchorWeek(month) {
  const [year, number] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, number - 1, 15, 12));
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() || 7) - 1));
  return date.toISOString().slice(0, 10);
}

function compactLesson(lesson) {
  return {
    weekday: lesson.weekday,
    date: lesson.date,
    start_date: lesson.start_date,
    end_date: lesson.end_date,
    week_type: lesson.week_type,
    start_time: lesson.start_time,
    end_time: lesson.end_time,
    subject: lesson.subject,
    lesson_type: lesson.lesson_type,
    teacher: lesson.teacher,
    teachers: (lesson.teachers || []).map(({ id, full_name }) => ({ id, full_name })),
    classroom: lesson.classroom,
    building: lesson.building,
    building_link: lesson.building_link,
    subgroup: lesson.subgroup,
    is_exam: lesson.is_exam
  };
}

async function getGroup(group, weekStart) {
  const url = new URL(`${ORIGIN}/group_schedule/`);
  url.searchParams.set('group_id', group.value);
  url.searchParams.set('week_start', weekStart);
  const data = await readJson(url);
  if (!data) return null;
  return {
    id: group.value,
    label: group.label,
    instituteSlugs: group.institute_slugs || [],
    educationLevel: group.education_level,
    directionCode: group.direction_code,
    weekStart: data.week_start,
    weekType: data.week_type,
    semester: data.current_semester,
    lessons: (data.schedule || []).map(compactLesson)
  };
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const month = url.searchParams.get('month');
    const part = Number(url.searchParams.get('part'));
    if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month || '') || !Number.isSafeInteger(part) || part < 0) {
      return Response.json({ error: 'Неверный месяц или часть' }, { status: 400 });
    }
    try {
      const catalog = await getGroups();
      const totalParts = Math.ceil(catalog.length / PART_SIZE);
      if (part >= totalParts) return Response.json({ error: 'Часть не найдена' }, { status: 404 });
      const batch = catalog.slice(part * PART_SIZE, (part + 1) * PART_SIZE);
      const weekStart = anchorWeek(month);
      const groups = new Array(batch.length);
      const failures = [];
      let next = 0;
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, batch.length) }, async () => {
        while (next < batch.length) {
          const index = next++;
          try { groups[index] = await getGroup(batch[index], weekStart); }
          catch { failures.push(batch[index].value); }
        }
      }));
      if (failures.length) return Response.json({ error: 'Часть расписаний недоступна', failures }, { status: 502, headers: { 'Cache-Control': 'no-store' } });
      return Response.json({ month, part, totalParts, groups: groups.filter(Boolean), generatedAt: new Date().toISOString() }, {
        headers: { 'Cache-Control': 'public, max-age=0, s-maxage=21600, stale-while-revalidate=3600' }
      });
    } catch {
      return Response.json({ error: 'Не удалось получить расписание университета' }, { status: 502, headers: { 'Cache-Control': 'no-store' } });
    }
  }
};
