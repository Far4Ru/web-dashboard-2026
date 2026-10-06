import UIComponent from './UIComponent.js';
import { getScheduleForSelection, getLessonsForDate, getMoscowDate, getWeekDates } from './SutdApi.js';

export default class TodayScheduleWidget extends UIComponent {
  constructor(config) {
    super({ title: 'Пары по дням', span: 8, height: 430, ...config });
    this.type = 'today'; this.selection = config.state?.selection || { type: 'group', id: 2, label: '1-ГД-13' };
    this.payload = null; this.query = ''; this.selectedDate = getMoscowDate();
  }

  render() {
    const { article, body } = this.createShell('/assets/icons/lecture.svg', 'university-blue', this.subtitle());
    body.innerHTML = '<label class="widget-search"><span aria-hidden="true">⌕</span><input type="search" placeholder="Предмет, преподаватель или аудитория" aria-label="Поиск по парам"></label><div class="day-switcher" aria-label="День недели"></div><div class="api-state today-content" role="status"></div>';
    this.content = body.querySelector('.today-content');
    this.daySwitcher = body.querySelector('.day-switcher');
    this.listen(body.querySelector('input'), 'input', (event) => { this.query = event.target.value.trim().toLocaleLowerCase('ru'); this.showLessons(); });
    this.listen(this.daySwitcher, 'click', (event) => { const button = event.target.closest('[data-date]'); if (!button) return; this.selectedDate = button.dataset.date; this.renderDays(); this.showLessons(); });
    this.load(); return article;
  }

  async load() {
    this.abortController?.abort(); this.abortController = new AbortController();
    this.content.className = 'api-state today-content is-loading'; this.content.textContent = 'Загружаем пары на сегодня…';
    try { this.payload = await getScheduleForSelection(this.selection, this.abortController.signal); this.renderDays(); this.showLessons(); }
    catch (error) { if (error.name !== 'AbortError') { this.content.className = 'api-state today-content is-error'; this.content.textContent = 'Не удалось загрузить пары.'; } }
  }

  showLessons() {
    if (!this.payload) return;
    const lessons = getLessonsForDate(this.payload, this.selectedDate).filter((lesson) => [lesson.subject, lesson.teacher, lesson.classroom, lesson.building].join(' ').toLocaleLowerCase('ru').includes(this.query));
    this.content.className = 'today-content'; this.content.replaceChildren();
    if (!lessons.length) { this.content.classList.add('api-state', 'is-empty'); this.content.textContent = this.query ? 'По вашему запросу ничего не найдено.' : 'В этот день занятий нет.'; return; }
    const list = document.createElement('div'); list.className = 'today-list';
    lessons.forEach((lesson) => {
      const item = document.createElement('article'); item.className = 'today-lesson';
      const time = document.createElement('div'); time.className = 'today-time'; time.innerHTML = '<strong></strong><span></span>'; time.querySelector('strong').textContent = lesson.start_time; time.querySelector('span').textContent = lesson.end_time || '';
      const info = document.createElement('div'); info.className = 'today-info';
      const title = document.createElement('strong'); title.textContent = lesson.subject;
      const counterpart = this.selection.type === 'teacher' ? lesson.group : (lesson.teacher !== '–' ? lesson.teacher : null);
      const details = document.createElement('p'); details.textContent = [lesson.lesson_type, counterpart].filter(Boolean).join(' · ');
      const room = document.createElement('span'); room.textContent = `${lesson.classroom} · ${lesson.building}`;
      info.append(title, details, room); item.append(time, info); list.append(item);
    });
    this.content.append(list);
  }

  renderDays() {
    const days = getWeekDates(this.payload);
    if (!days.some((day) => day.value === this.selectedDate)) this.selectedDate = days[0].value;
    this.daySwitcher.replaceChildren();
    days.forEach((day) => {
      const button = document.createElement('button'); button.type = 'button'; button.dataset.date = day.value; button.textContent = day.label; button.className = day.value === this.selectedDate ? 'active' : '';
      this.daySwitcher.append(button);
    });
  }

  subtitle() { return `${this.selection.type === 'teacher' ? 'Преподаватель' : 'Группа'} ${this.selection.label}`; }
  setSelection(selection) { this.selection = selection; this.element.querySelector('.widget-heading small').textContent = this.subtitle(); this.load(); }
  serialize() { return { ...super.serialize(), state: { selection: this.selection } }; }
}
