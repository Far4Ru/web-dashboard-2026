import { getCatalog, getTeachers } from './SutdApi.js';

let catalogPromise;
let teachersPromise;

function uniqueSorted(values) {
  return [...new Set(values.filter((value) => typeof value === 'string' && value.trim() && value !== '–'))]
    .sort((a, b) => a.localeCompare(b, 'ru', { numeric: true }));
}

export async function getScheduleSuggestions(scope, snapshot) {
  if (scope === 'address') {
    return uniqueSorted((snapshot?.groups || []).flatMap((group) => group.lessons.map((lesson) => lesson.building)));
  }
  if (scope === 'group') {
    try {
      catalogPromise ||= getCatalog().catch((error) => { catalogPromise = null; throw error; });
      return uniqueSorted((await catalogPromise).groups.map((group) => group.label));
    } catch {
      return uniqueSorted((snapshot?.groups || []).map((group) => group.label));
    }
  }
  if (scope === 'teacher') {
    try {
      teachersPromise ||= getTeachers().catch((error) => { teachersPromise = null; throw error; });
      return uniqueSorted((await teachersPromise).items.map((teacher) => teacher.full_name));
    } catch {
      return uniqueSorted((snapshot?.groups || []).flatMap((group) => group.lessons.flatMap((lesson) => (lesson.teachers || []).map((teacher) => teacher.full_name))));
    }
  }
  return [];
}
