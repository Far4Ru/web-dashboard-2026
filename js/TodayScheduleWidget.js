import UIComponent from './UIComponent.js';
import DayControls from './DayControls.js';
import { getLessonsForDate, getScheduleForSelectionWeek, getWeekStart } from './SutdApi.js';
import { filterByScope, filterByTime, getUniversitySnapshot, lessonsForDate } from './UniversityData.js';
import { groupLessons } from './LessonGroups.js';

export default class TodayScheduleWidget extends UIComponent {
  constructor(config) {
    super({ title: 'Пары по дням', span: 8, height: 560, ...config });
    this.type = 'today'; this.selection = config.state?.selection || { type: 'group', id: 2, label: '1-ГД-13' };
    this.controlState = config.state?.controls || {}; this.query = config.state?.query || ''; this.lessons = []; this.snapshot = null;
  }

  render() {
    const { article, body } = this.createShell('assets/icons/lecture.svg', 'university-blue', this.subtitle());
    body.innerHTML = '<label class="widget-search"><span aria-hidden="true">⌕</span><input type="search" placeholder="Предмет, преподаватель, группа или аудитория" aria-label="Поиск по парам"></label><div class="api-state today-content" role="status"></div>';
    this.content = body.querySelector('.today-content');
    const search = body.querySelector('.widget-search input'); search.value = this.query;
    this.listen(search, 'input', () => { this.query = search.value.trim().toLocaleLowerCase('ru'); this.showLessons(); this.onChange?.(); });
    this.controls = new DayControls(this, body, ['my', 'all', 'address', 'teacher'], this.controlState, (kind) => kind === 'data' ? this.load() : this.showLessons());
    if (!this.hidden) this.load(); return article;
  }

  async load() {
    this.abortController?.abort(); this.abortController = new AbortController();
    const signal = this.abortController.signal;
    const { scope, date } = this.controls.state;
    this.content.className = 'api-state today-content is-loading'; this.content.textContent = 'Загружаем пары…';
    try {
      if (scope === 'my') {
        const payload = await getScheduleForSelectionWeek(this.selection, getWeekStart(date), signal);
        this.lessons = getLessonsForDate(payload, date).map((lesson) => ({ ...lesson, group: lesson.group || (this.selection.type === 'group' ? this.selection.label : ''), groupId: this.selection.type === 'group' ? this.selection.id : null }));
      } else {
        const snapshot = await getUniversitySnapshot(date.slice(0, 7), (loaded, total) => {
          if (!signal.aborted && total) this.content.textContent = `Собираем расписания: ${loaded} из ${total} частей…`;
        });
        if (signal.aborted) return;
        this.snapshot = snapshot;
        this.controls.setSnapshot(snapshot);
        this.lessons = lessonsForDate(snapshot, date);
      }
      if (!signal.aborted) this.showLessons();
    } catch (error) {
      if (!signal.aborted) { this.content.className = 'api-state today-content is-error'; this.content.textContent = 'Не удалось загрузить пары.'; }
    }
  }

  showLessons() {
    if (!this.controls) return;
    const { scope, target, date, period, from, to } = this.controls.state;
    let lessons = scope === 'my' ? this.lessons : filterByScope(this.lessons, scope, target, this.selection);
    lessons = filterByTime(lessons, date, period, from, to).filter((lesson) =>
      [lesson.subject, lesson.teacher, lesson.group, lesson.classroom, lesson.building].join(' ').toLocaleLowerCase('ru').includes(this.query));
    this.content.className = 'today-content'; this.content.replaceChildren();
    if (!lessons.length) { this.content.classList.add('api-state', 'is-empty'); this.content.textContent = this.query || target ? 'По вашему запросу ничего не найдено.' : 'На выбранное время занятий нет.'; return; }
    const list = document.createElement('div'); list.className = 'today-list';
    groupLessons(lessons).forEach((lesson) => {
      const item = document.createElement('article'); item.className = 'today-lesson';
      const time = document.createElement('div'); time.className = 'today-time'; time.innerHTML = '<strong></strong><span></span>'; time.querySelector('strong').textContent = lesson.start_time; time.querySelector('span').textContent = lesson.end_time || '';
      const info = document.createElement('div'); info.className = 'today-info';
      const title = document.createElement('strong'); title.textContent = lesson.subject;
      const details = document.createElement('p'); details.textContent = [lesson.lesson_type, lesson.teachers.length && `Преподаватели: ${lesson.teachers.join(', ')}`].filter(Boolean).join(' · ');
      const groups = document.createElement('p'); groups.textContent = lesson.groups.length ? `Группы: ${lesson.groups.join(', ')}` : '';
      const room = document.createElement('span'); room.textContent = [lesson.classroom, lesson.building].filter(Boolean).join(' · ');
      info.append(title, details, groups, room); item.append(time, info); list.append(item);
    });
    this.content.append(list);
  }

  subtitle() { return `${this.selection.type === 'teacher' ? 'Преподаватель' : 'Группа'} ${this.selection.label}`; }
  setSelection(selection) { this.selection = selection; this.element.querySelector('.widget-heading small').textContent = this.subtitle(); if (!this.hidden && this.controls?.state.scope === 'my') this.load(); }
  serialize() { return { ...super.serialize(), state: { selection: this.selection, controls: this.controls?.state || this.controlState, query: this.query } }; }
}
