import UIComponent from './UIComponent.js';
import { getScheduleForSelectionWeek, getLessonsForDate, getMoscowDate, getWeekStart } from './SutdApi.js';

const weekDayLabels = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

export default class MonthLoadWidget extends UIComponent {
  constructor(config) {
    super({ title: 'Загрузка месяца', span: 12, height: 500, ...config });
    this.type = 'monthLoad'; this.selection = config.state?.selection || { type: 'group', id: 2, label: '1-ГД-13' };
    const today = getMoscowDate(); this.month = config.state?.month || today.slice(0, 7); this.counts = new Map();
  }

  render() {
    const { article, body } = this.createShell('/assets/icons/lecture.svg', 'university-blue', this.subtitle());
    body.innerHTML = '<div class="month-toolbar"><button type="button" data-month-prev aria-label="Предыдущий месяц">←</button><strong></strong><button type="button" data-month-next aria-label="Следующий месяц">→</button></div><div class="api-state month-content" role="status"></div>';
    this.content = body.querySelector('.month-content'); this.monthLabel = body.querySelector('.month-toolbar strong');
    this.listen(body.querySelector('[data-month-prev]'), 'click', () => this.shiftMonth(-1));
    this.listen(body.querySelector('[data-month-next]'), 'click', () => this.shiftMonth(1));
    this.load(); return article;
  }

  buildCalendar() {
    const [year, month] = this.month.split('-').map(Number);
    const first = new Date(Date.UTC(year, month - 1, 1, 12)); const last = new Date(Date.UTC(year, month, 0, 12));
    const gridStart = new Date(first); gridStart.setUTCDate(first.getUTCDate() - ((first.getUTCDay() || 7) - 1));
    const gridEnd = new Date(last); gridEnd.setUTCDate(last.getUTCDate() + (7 - (last.getUTCDay() || 7)));
    const dates = [];
    for (const cursor = new Date(gridStart); cursor <= gridEnd; cursor.setUTCDate(cursor.getUTCDate() + 1)) dates.push(cursor.toISOString().slice(0, 10));
    return { dates, year, month };
  }

  async load() {
    this.abortController?.abort(); this.abortController = new AbortController();
    const calendar = this.buildCalendar(); const monthDate = new Date(Date.UTC(calendar.year, calendar.month - 1, 1, 12));
    this.monthLabel.textContent = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(monthDate);
    this.content.className = 'api-state month-content is-loading'; this.content.textContent = 'Считаем пары за месяц…';
    try {
      const weekStarts = [...new Set(calendar.dates.map((date) => getWeekStart(date)))];
      const schedules = await Promise.all(weekStarts.map((week) => getScheduleForSelectionWeek(this.selection, week, this.abortController.signal)));
      this.counts = new Map();
      calendar.dates.forEach((date) => {
        const schedule = schedules[weekStarts.indexOf(getWeekStart(date))];
        this.counts.set(date, getLessonsForDate(schedule, date).length);
      });
      this.showCalendar(calendar);
    } catch (error) { if (error.name !== 'AbortError') { this.content.className = 'api-state month-content is-error'; this.content.textContent = 'Не удалось рассчитать загрузку месяца.'; } }
  }

  showCalendar({ dates, month }) {
    this.content.className = 'month-content'; this.content.replaceChildren();
    const weeks = []; for (let index = 0; index < dates.length; index += 7) weeks.push(dates.slice(index, index + 7));
    const table = document.createElement('div'); table.className = 'month-heatmap'; table.style.setProperty('--weeks', weeks.length);
    const corner = document.createElement('span'); corner.className = 'heatmap-corner'; table.append(corner);
    weeks.forEach((_, index) => { const header = document.createElement('span'); header.className = 'heatmap-week'; header.textContent = `${index + 1} нед.`; table.append(header); });
    weekDayLabels.forEach((label, dayIndex) => {
      const rowLabel = document.createElement('strong'); rowLabel.className = 'heatmap-day'; rowLabel.textContent = label; table.append(rowLabel);
      weeks.forEach((week) => {
        const date = week[dayIndex]; const count = this.counts.get(date) || 0; const cell = document.createElement('button');
        cell.type = 'button'; cell.className = 'heatmap-cell'; cell.dataset.level = String(Math.min(count, 5));
        if (Number(date.slice(5, 7)) !== month) cell.classList.add('outside');
        cell.innerHTML = '<span></span><strong></strong>';
        cell.querySelector('span').textContent = String(Number(date.slice(8, 10))); cell.querySelector('strong').textContent = count ? String(count) : '—';
        cell.title = `${new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`))}: ${count} пар`;
        table.append(cell);
      });
    });
    const legend = document.createElement('div'); legend.className = 'heatmap-legend'; legend.innerHTML = '<span>Меньше</span><i data-level="0"></i><i data-level="1"></i><i data-level="2"></i><i data-level="3"></i><i data-level="4"></i><i data-level="5"></i><span>Больше</span>';
    this.content.append(table, legend);
  }

  shiftMonth(delta) { const [year, month] = this.month.split('-').map(Number); const next = new Date(Date.UTC(year, month - 1 + delta, 1)); this.month = next.toISOString().slice(0, 7); this.load(); this.onChange?.(); }
  subtitle() { return `${this.selection.type === 'teacher' ? 'Преподаватель' : 'Группа'} ${this.selection.label}`; }
  setSelection(selection) { this.selection = selection; this.element.querySelector('.widget-heading small').textContent = this.subtitle(); this.load(); }
  serialize() { return { ...super.serialize(), state: { selection: this.selection, month: this.month } }; }
}
