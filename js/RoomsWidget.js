import UIComponent from './UIComponent.js';
import { getScheduleForSelection, getLessonsForDate, getMoscowDate, getWeekDates } from './SutdApi.js';

export default class RoomsWidget extends UIComponent {
  constructor(config) {
    super({ title: 'Аудитории по дням', span: 4, height: 430, ...config });
    this.type = 'rooms'; this.selection = config.state?.selection || { type: 'group', id: 2, label: '1-ГД-13' }; this.payload = null; this.selectedDate = getMoscowDate();
  }

  render() {
    const { article, body } = this.createShell('assets/icons/classroom.svg', 'amber', this.subtitle());
    body.innerHTML = '<label class="widget-search"><span aria-hidden="true">⌕</span><input type="search" placeholder="Найти аудиторию" aria-label="Поиск аудитории"></label><div class="day-switcher" aria-label="День недели"></div><div class="api-state rooms-content" role="status"></div>';
    this.content = body.querySelector('.rooms-content');
    this.daySwitcher = body.querySelector('.day-switcher');
    this.listen(body.querySelector('input'), 'input', (event) => this.showRooms(event.target.value));
    this.listen(this.daySwitcher, 'click', (event) => { const button = event.target.closest('[data-date]'); if (!button) return; this.selectedDate = button.dataset.date; this.renderDays(); this.showRooms(); });
    this.load(); return article;
  }

  async load() {
    this.abortController?.abort(); this.abortController = new AbortController();
    this.content.className = 'api-state rooms-content is-loading'; this.content.textContent = 'Проверяем аудитории…';
    try { this.payload = await getScheduleForSelection(this.selection, this.abortController.signal); this.renderDays(); this.showRooms(); }
    catch (error) { if (error.name !== 'AbortError') { this.content.className = 'api-state rooms-content is-error'; this.content.textContent = 'Не удалось получить аудитории.'; } }
  }

  showRooms(query = '') {
    const search = query.trim().toLocaleLowerCase('ru');
    const lessons = getLessonsForDate(this.payload, this.selectedDate).filter((lesson) => `${lesson.classroom} ${lesson.building}`.toLocaleLowerCase('ru').includes(search));
    this.content.className = 'rooms-content'; this.content.replaceChildren();
    if (!lessons.length) { this.content.classList.add('api-state', 'is-empty'); this.content.textContent = search ? 'Аудитория не найдена.' : 'В этот день занятых аудиторий нет.'; return; }
    const list = document.createElement('div'); list.className = 'rooms-list';
    lessons.forEach((lesson) => {
      const item = document.createElement('article');
      const room = document.createElement('strong'); room.textContent = lesson.classroom;
      const time = document.createElement('span'); time.textContent = `${lesson.start_time}–${lesson.end_time || '—'}`;
      const subject = document.createElement('p'); subject.textContent = lesson.subject;
      const address = document.createElement('small'); address.textContent = lesson.building;
      item.append(room, time, subject, address); list.append(item);
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
