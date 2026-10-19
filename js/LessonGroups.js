const remotePattern = /дот|дистанц|онлайн|online|remote/i;

export const isRemoteLesson = (lesson) => remotePattern.test(`${lesson.building || ''} ${lesson.classroom || ''}`);

export function groupLessons(lessons) {
  const grouped = new Map();
  for (const lesson of lessons) {
    const key = [lesson.date, lesson.start_time, lesson.end_time, lesson.subject, lesson.lesson_type, lesson.building, lesson.classroom]
      .map((value) => String(value ?? '').trim()).join('\u001f');
    if (!grouped.has(key)) grouped.set(key, { ...lesson, groups: new Set(), teachers: new Set() });
    const entry = grouped.get(key);
    if (lesson.group && lesson.group !== '–') entry.groups.add(lesson.group);
    if (lesson.teachers?.length) {
      lesson.teachers.forEach((teacher) => {
        const name = teacher.full_name || teacher.name;
        if (name) entry.teachers.add(name);
      });
    } else if (lesson.teacher && lesson.teacher !== '–') entry.teachers.add(lesson.teacher);
  }
  return [...grouped.values()].map((lesson) => ({
    ...lesson,
    groups: [...lesson.groups].sort((a, b) => a.localeCompare(b, 'ru')),
    teachers: [...lesson.teachers].sort((a, b) => a.localeCompare(b, 'ru'))
  })).sort((a, b) => (a.start_time || '').localeCompare(b.start_time || '') || (a.subject || '').localeCompare(b.subject || '', 'ru'));
}
