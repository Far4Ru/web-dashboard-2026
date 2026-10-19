import UIComponent from './UIComponent.js';
import DayControls from './DayControls.js';
import { getLessonsForDate, getScheduleForSelectionWeek, getWeekStart } from './SutdApi.js';
import { filterByScope, filterByTime, getUniversitySnapshot, lessonsForDate } from './UniversityData.js';
import { groupLessons, isRemoteLesson } from './LessonGroups.js';

const roomKey = (lesson) => `${lesson.building || ''}|${lesson.classroom || ''}`;
const isPhysicalRoom = (lesson) => lesson.classroom && lesson.building && !isRemoteLesson(lesson);

export default class RoomsWidget extends UIComponent {
  constructor(config) {
    super({ title: 'Аудитории по дням', span: 4, height: 560, ...config });
    this.type = 'rooms'; this.selection = config.state?.selection || { type: 'group', id: 2, label: '1-ГД-13' };
    this.controlState = config.state?.controls || {}; this.query = config.state?.query || ''; this.occupancy = config.state?.occupancy || 'busy';
    this.lessons = []; this.snapshot = null;
  }

  render() {
    const { article, body } = this.createShell('assets/icons/classroom.svg', 'amber', this.subtitle());
    body.innerHTML = '<label class="widget-search"><span aria-hidden="true">⌕</span><input type="search" placeholder="Найти аудиторию или адрес" aria-label="Поиск аудитории"></label><label class="room-occupancy"><span>Занятость</span><select aria-label="Занятость аудиторий"><option value="busy">Занятые</option><option value="free">Свободные</option><option value="all">Все</option></select></label><div class="api-state rooms-content" role="status"></div>';
    this.content = body.querySelector('.rooms-content');
    const search = body.querySelector('.widget-search input'); search.value = this.query;
    this.listen(search, 'input', () => { this.query = search.value.trim().toLocaleLowerCase('ru'); this.showRooms(); this.onChange?.(); });
    this.occupancySelect = body.querySelector('.room-occupancy select'); this.occupancySelect.value = this.occupancy;
    this.listen(this.occupancySelect, 'change', () => { this.occupancy = this.occupancySelect.value; this.load(); this.onChange?.(); });
    this.controls = new DayControls(this, body, ['my', 'all', 'address'], this.controlState, (kind) => kind === 'data' ? this.load() : this.showRooms());
    if (!this.hidden) this.load(); return article;
  }

  async load() {
    this.abortController?.abort(); this.abortController = new AbortController();
    const signal = this.abortController.signal;
    const { scope, date } = this.controls.state;
    this.content.className = 'api-state rooms-content is-loading'; this.content.textContent = 'Проверяем аудитории…';
    try {
      if (scope === 'my' && this.occupancy === 'busy') {
        const payload = await getScheduleForSelectionWeek(this.selection, getWeekStart(date), signal);
        this.snapshot = null;
        this.lessons = getLessonsForDate(payload, date).map((lesson) => ({ ...lesson, group: lesson.group || (this.selection.type === 'group' ? this.selection.label : ''), groupId: this.selection.type === 'group' ? this.selection.id : null }));
      } else {
        this.snapshot = await getUniversitySnapshot(date.slice(0, 7), (loaded, total) => {
          if (!signal.aborted && total) this.content.textContent = `Собираем расписания: ${loaded} из ${total} частей…`;
        });
        if (signal.aborted) return;
        this.controls.setSnapshot(this.snapshot);
        this.lessons = lessonsForDate(this.snapshot, date);
      }
      if (!signal.aborted) this.showRooms();
    } catch (error) {
      if (!signal.aborted) { this.content.className = 'api-state rooms-content is-error'; this.content.textContent = 'Не удалось получить аудитории.'; }
    }
  }

  roomsUsedBySelection() {
    if (!this.snapshot) return new Set();
    const keys = new Set();
    this.snapshot.groups.forEach((group) => {
      group.lessons.forEach((lesson) => {
        const matches = this.selection.type === 'group'
          ? Number(group.id) === Number(this.selection.id)
          : lesson.teachers?.some((teacher) => Number(teacher.id) === Number(this.selection.id));
        if (matches && isPhysicalRoom(lesson)) keys.add(roomKey(lesson));
      });
    });
    return keys;
  }

  showRooms() {
    if (!this.controls) return;
    const { scope, target, date, period, from, to } = this.controls.state;
    const search = this.query;
    const allTimed = filterByTime(this.lessons, date, period, from, to).filter(isPhysicalRoom);
    const visibleLessons = scope === 'my' && !this.snapshot ? allTimed : filterByScope(allTimed, scope, target, this.selection);
    const occupied = new Set(allTimed.map(roomKey));
    const busy = new Map();
    visibleLessons.forEach((lesson) => {
      const key = roomKey(lesson);
      if (!busy.has(key)) busy.set(key, []);
      busy.get(key).push(lesson);
    });
    const universe = new Map();
    if (this.snapshot) this.snapshot.groups.forEach((group) => group.lessons.filter(isPhysicalRoom).forEach((lesson) => universe.set(roomKey(lesson), { building: lesson.building, classroom: lesson.classroom })));
    else visibleLessons.forEach((lesson) => universe.set(roomKey(lesson), { building: lesson.building, classroom: lesson.classroom }));
    const myRooms = scope === 'my' && this.snapshot ? this.roomsUsedBySelection() : null;
    let rooms = [...universe].filter(([key, room]) =>
      (!myRooms || myRooms.has(key)) &&
      (scope !== 'address' || !target || room.building.toLocaleLowerCase('ru').includes(target.toLocaleLowerCase('ru'))) &&
      `${room.classroom} ${room.building}`.toLocaleLowerCase('ru').includes(search));
    if (this.occupancy === 'busy') rooms = rooms.filter(([key]) => busy.has(key));
    if (this.occupancy === 'free') rooms = rooms.filter(([key]) => !occupied.has(key));
    rooms.sort((a, b) => `${a[1].building} ${a[1].classroom}`.localeCompare(`${b[1].building} ${b[1].classroom}`, 'ru'));
    this.content.className = 'rooms-content'; this.content.replaceChildren();
    if (!rooms.length) { this.content.classList.add('api-state', 'is-empty'); this.content.textContent = 'Аудитории не найдены.'; return; }
    const summary = document.createElement('small'); summary.className = 'rooms-summary';
    summary.textContent = `Найдено аудиторий: ${rooms.length}. Свободные — среди помещений, встречающихся в расписании семестра.`;
    const list = document.createElement('div'); list.className = 'rooms-list';
    rooms.slice(0, 200).forEach(([key, room]) => {
      const lessons = groupLessons(busy.get(key) || []);
      const groups = new Set(lessons.flatMap((lesson) => lesson.groups));
      const teachers = new Set(lessons.flatMap((lesson) => lesson.teachers));
      const item = document.createElement('article');
      const header = document.createElement('div'); header.className = 'room-header';
      const title = document.createElement('strong'); title.textContent = room.classroom;
      const status = document.createElement('span'); status.textContent = lessons.length ? `${lessons.length} пар` : occupied.has(key) ? 'Занята' : 'Свободна';
      header.append(title, status);
      const address = document.createElement('small'); address.textContent = `${room.building} · ${groups.size} групп · ${teachers.size} преподавателей`;
      const details = document.createElement('div'); details.className = 'room-lessons';
      if (!lessons.length) { details.textContent = occupied.has(key) && scope === 'my' ? 'Моих занятий на выбранное время нет' : 'На выбранное время занятий нет'; }
      lessons.forEach((lesson) => {
        const row = document.createElement('div'); row.className = 'room-lesson';
        const heading = document.createElement('strong'); heading.textContent = `${lesson.start_time}${lesson.end_time ? `–${lesson.end_time}` : ''} · ${lesson.subject}`;
        const meta = document.createElement('small'); meta.textContent = [lesson.lesson_type, lesson.teachers.length && `Преподаватели: ${lesson.teachers.join(', ')}`, lesson.groups.length && `Группы: ${lesson.groups.join(', ')}`].filter(Boolean).join(' · ');
        row.append(heading, meta); details.append(row);
      });
      item.append(header, address, details); list.append(item);
    });
    this.content.append(summary, list);
    if (rooms.length > 200) { const more = document.createElement('small'); more.textContent = 'Показаны первые 200. Уточните поиск, чтобы увидеть остальные.'; this.content.append(more); }
  }

  subtitle() { return `${this.selection.type === 'teacher' ? 'Преподаватель' : 'Группа'} ${this.selection.label}`; }
  setSelection(selection) { this.selection = selection; this.element.querySelector('.widget-heading small').textContent = this.subtitle(); if (!this.hidden && this.controls?.state.scope === 'my') this.load(); }
  serialize() { return { ...super.serialize(), state: { selection: this.selection, controls: this.controls?.state || this.controlState, occupancy: this.occupancy, query: this.query } }; }
}
