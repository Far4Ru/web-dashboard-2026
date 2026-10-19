import UIComponent from './UIComponent.js';
import { getScheduleForSelectionWeek, getLessonsForDate, getMoscowDate, getWeekStart } from './SutdApi.js';
import { filterByScope, getUniversitySnapshot, lessonsForDate } from './UniversityData.js';
import { getScheduleSuggestions } from './ScheduleSuggestions.js';

const weekdays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const modes = { my: 'Мои занятия', all: 'Все занятия', address: 'По адресу', teacher: 'По преподавателю', group: 'По группе' };

export default class MonthLoadWidget extends UIComponent {
  constructor(config) {
    super({ title: 'Загрузка месяца', span: 12, height: 500, ...config });
    this.type = 'monthLoad';
    this.selection = config.state?.selection || { type: 'group', id: 2, label: '1-ГД-13' };
    this.month = config.state?.month || getMoscowDate().slice(0, 7);
    this.scope = config.state?.scope || 'my';
    this.target = config.state?.target || '';
    this.counts = new Map();
  }

  render() {
    const { article, body } = this.createShell('assets/icons/lecture.svg', 'university-blue', this.subtitle());
    body.innerHTML = '<div class="month-controls"><select data-month-scope aria-label="Какие занятия показывать"></select><input data-month-target type="search" aria-label="Уточнить занятия" hidden><datalist data-month-options></datalist></div><div class="month-toolbar"><button type="button" data-month-prev aria-label="Предыдущий месяц">←</button><strong></strong><button type="button" data-month-next aria-label="Следующий месяц">→</button></div><div class="api-state month-content" role="status"></div>';
    this.content = body.querySelector('.month-content');
    this.monthLabel = body.querySelector('.month-toolbar strong');
    this.scopeSelect = body.querySelector('[data-month-scope]');
    this.targetInput = body.querySelector('[data-month-target]');
    this.suggestions = body.querySelector('[data-month-options]');
    this.suggestions.id = `month-target-${this.id}`;
    this.targetInput.setAttribute('list', this.suggestions.id);
    Object.entries(modes).forEach(([value, label]) => {
      const option = document.createElement('option'); option.value = value; option.textContent = label; this.scopeSelect.append(option);
    });
    this.scopeSelect.value = this.scope;
    this.targetInput.value = this.target;
    this.updateControls();
    this.listen(this.scopeSelect, 'change', () => {
      this.scope = this.scopeSelect.value; this.target = ''; this.targetInput.value = '';
      this.updateControls(); this.refreshSuggestions(); this.load(); this.onChange?.();
    });
    this.listen(this.targetInput, 'input', () => { this.target = this.targetInput.value.trim(); this.load(); this.onChange?.(); });
    this.listen(body.querySelector('[data-month-prev]'), 'click', () => this.shiftMonth(-1));
    this.listen(body.querySelector('[data-month-next]'), 'click', () => this.shiftMonth(1));
    if (!this.hidden) this.refreshSuggestions();
    if (!this.hidden) this.load(); return article;
  }

  async refreshSuggestions() {
    const scope = this.scope;
    const version = this.suggestionsVersion = (this.suggestionsVersion || 0) + 1;
    const values = await getScheduleSuggestions(scope, this.snapshot);
    if (version !== this.suggestionsVersion) return;
    const fragment = document.createDocumentFragment();
    values.forEach((value) => {
      const option = document.createElement('option');
      option.value = value;
      fragment.append(option);
    });
    this.suggestions.replaceChildren(fragment);
  }

  updateControls() {
    this.targetInput.hidden = !['address', 'teacher', 'group'].includes(this.scope);
    this.targetInput.placeholder = { address: 'Адрес', teacher: 'Преподаватель', group: 'Группа' }[this.scope] || '';
  }

  buildCalendar() {
    const [year, month] = this.month.split('-').map(Number);
    const first = new Date(Date.UTC(year, month - 1, 1, 12));
    const last = new Date(Date.UTC(year, month, 0, 12));
    const start = new Date(first); start.setUTCDate(first.getUTCDate() - ((first.getUTCDay() || 7) - 1));
    const end = new Date(last); end.setUTCDate(last.getUTCDate() + (7 - (last.getUTCDay() || 7)));
    const dates = [];
    for (const cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) dates.push(cursor.toISOString().slice(0, 10));
    return { dates, year, month };
  }

  async load() {
    this.abortController?.abort(); this.abortController = new AbortController();
    const signal = this.abortController.signal;
    const calendar = this.buildCalendar();
    this.monthLabel.textContent = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(calendar.year, calendar.month - 1, 1, 12)));
    this.content.className = 'api-state month-content is-loading';
    this.content.textContent = 'Считаем пары за месяц…';
    try {
      this.counts = new Map();
      if (this.scope === 'my') {
        const weeks = [...new Set(calendar.dates.map(getWeekStart))];
        const schedules = await Promise.all(weeks.map((week) => getScheduleForSelectionWeek(this.selection, week, signal)));
        if (signal.aborted) return;
        const byWeek = new Map(weeks.map((week, index) => [week, schedules[index]]));
        calendar.dates.forEach((date) => this.counts.set(date, getLessonsForDate(byWeek.get(getWeekStart(date)), date).length));
      } else {
        const snapshot = await getUniversitySnapshot(this.month, (loaded, total) => {
          if (!signal.aborted && total) this.content.textContent = `Собираем расписания: ${loaded} из ${total} частей…`;
        });
        if (signal.aborted) return;
        this.snapshot = snapshot;
        this.refreshSuggestions();
        calendar.dates.forEach((date) => this.counts.set(date, filterByScope(lessonsForDate(snapshot, date), this.scope, this.target, this.selection).length));
      }
      this.showCalendar(calendar);
    } catch (error) {
      if (!signal.aborted) { this.content.className = 'api-state month-content is-error'; this.content.textContent = 'Не удалось рассчитать загрузку месяца.'; }
    }
  }

  showCalendar({ dates, month }) {
    this.content.className = 'month-content'; this.content.replaceChildren();
    const weeks = []; for (let index = 0; index < dates.length; index += 7) weeks.push(dates.slice(index, index + 7));
    const table = document.createElement('div'); table.className = 'month-heatmap'; table.style.setProperty('--weeks', weeks.length);
    const corner = document.createElement('span'); corner.className = 'heatmap-corner'; table.append(corner);
    weeks.forEach((_, index) => { const header = document.createElement('span'); header.className = 'heatmap-week'; header.textContent = `${index + 1} нед.`; table.append(header); });
    weekdays.forEach((label, dayIndex) => {
      const rowLabel = document.createElement('strong'); rowLabel.className = 'heatmap-day'; rowLabel.textContent = label; table.append(rowLabel);
      weeks.forEach((week) => {
        const date = week[dayIndex]; const count = this.counts.get(date) || 0; const cell = document.createElement('button');
        cell.type = 'button'; cell.className = 'heatmap-cell'; cell.dataset.level = String(Math.min(count, 5));
        if (Number(date.slice(5, 7)) !== month) cell.classList.add('outside');
        cell.innerHTML = '<span></span><strong></strong>';
        cell.querySelector('span').textContent = String(Number(date.slice(8, 10)));
        cell.querySelector('strong').textContent = count ? String(count) : '—';
        cell.title = `${new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`))}: ${count} пар`;
        table.append(cell);
      });
    });
    const legend = document.createElement('div'); legend.className = 'heatmap-legend'; legend.innerHTML = '<span>Меньше</span><i data-level="0"></i><i data-level="1"></i><i data-level="2"></i><i data-level="3"></i><i data-level="4"></i><i data-level="5"></i><span>Больше</span>';
    this.content.append(table, legend);
  }

  shiftMonth(delta) {
    const [year, month] = this.month.split('-').map(Number);
    this.month = new Date(Date.UTC(year, month - 1 + delta, 1)).toISOString().slice(0, 7);
    this.load(); this.onChange?.();
  }
  subtitle() { return `${this.selection.type === 'teacher' ? 'Преподаватель' : 'Группа'} ${this.selection.label}`; }
  setSelection(selection) { this.selection = selection; this.element.querySelector('.widget-heading small').textContent = this.subtitle(); if (!this.hidden && this.scope === 'my') this.load(); }
  serialize() { return { ...super.serialize(), state: { selection: this.selection, month: this.month, scope: this.scope, target: this.target } }; }
}
