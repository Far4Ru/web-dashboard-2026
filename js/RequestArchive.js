const files = new Map();
let teacherIndexPromise;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function readFile(relative) {
  if (!files.has(relative)) {
    const promise = fetch(`/requests/${relative}`, { headers: { Accept: 'application/json' } })
      .then((response) => {
        if (!response.ok) throw new Error(`Архив недоступен: ${relative}`);
        return response.json();
      })
      .catch((error) => { files.delete(relative); throw error; });
    files.set(relative, promise);
  }
  return files.get(relative);
}

export const getArchiveManifest = () => readFile('manifest.json');
export const getArchivedCatalog = (kind) => readFile(`catalog/${kind}.json`);

export async function getArchivedPart(part) {
  const manifest = await getArchiveManifest();
  return readFile(`university/${manifest.month}/part-${part}.json`);
}

function weekTypeAt(type, anchor, requested) {
  if (!['den', 'num'].includes(type)) return type;
  const difference = Math.round((Date.parse(requested) - Date.parse(anchor)) / WEEK_MS);
  return Math.abs(difference) % 2 === 0 ? type : type === 'den' ? 'num' : 'den';
}

function weekEnd(weekStart) {
  const date = new Date(`${weekStart}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 6);
  return date.toISOString().slice(0, 10);
}

export async function getArchivedGroupSchedule(groupId, weekStart) {
  const [manifest, catalog] = await Promise.all([getArchiveManifest(), getArchivedCatalog('groups')]);
  const index = catalog.groups.findIndex((group) => Number(group.value) === Number(groupId));
  if (index < 0) throw new Error('Группа отсутствует в архиве');
  const part = await getArchivedPart(Math.floor(index / manifest.partSize));
  const group = part.groups.find((item) => Number(item.id) === Number(groupId));
  if (!group) throw new Error('Расписание группы отсутствует в архиве');
  return {
    group: { id: group.id, label: group.label },
    week_start: weekStart,
    week_end: weekEnd(weekStart),
    week_type: weekTypeAt(group.weekType, group.weekStart, weekStart),
    current_semester: group.semester,
    schedule: group.lessons,
    __archived: true
  };
}

async function buildTeacherIndex() {
  const manifest = await getArchiveManifest();
  const teachers = new Map();
  let next = 0;
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (next < manifest.totalParts) {
      const part = await getArchivedPart(next++);
      part.groups.forEach((group) => group.lessons.forEach((lesson) => {
        (lesson.teachers || []).forEach((teacher) => {
          if (!teachers.has(teacher.id)) teachers.set(teacher.id, { name: teacher.full_name, lessons: [], anchor: group.weekStart, weekType: group.weekType });
          teachers.get(teacher.id).lessons.push({ ...lesson, group: group.label, group_id: group.id });
        });
      }));
    }
  }));
  return teachers;
}

export async function getArchivedTeacherSchedule(teacherId, weekStart) {
  teacherIndexPromise ||= buildTeacherIndex().catch((error) => { teacherIndexPromise = null; throw error; });
  const [index, manifest] = await Promise.all([teacherIndexPromise, getArchiveManifest()]);
  const teacher = index.get(Number(teacherId));
  if (!teacher) throw new Error('Расписание преподавателя отсутствует в архиве');
  return {
    teacher: { id: Number(teacherId), full_name: teacher.name },
    week_start: weekStart,
    week_end: weekEnd(weekStart),
    week_type: weekTypeAt(teacher.weekType, teacher.anchor, weekStart),
    current_semester: manifest.semester,
    schedule: teacher.lessons,
    __archived: true
  };
}
