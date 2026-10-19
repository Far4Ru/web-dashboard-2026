import UIComponent from './UIComponent.js';
import { getMoscowDate } from './SutdApi.js';
import { activeTeachers, getUniversitySnapshot, isActiveInSemester, lessonsForDate, monthDates, semesterMonths } from './UniversityData.js';

const formatNumber = (value) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(value);

export default class StatsWidget extends UIComponent {
  constructor(config) {
    super({ title: 'Университет сегодня', span: 6, height: 650, ...config });
    this.type = 'stats';
    this.stats = config.state?.stats?.version === 2 ? config.state.stats : null;
  }

  render() {
    const { article, body } = this.createShell('assets/icons/university.svg', 'university-blue', 'По расписаниям всех групп');
    body.innerHTML = '<div class="api-state stats-content" role="status"></div>';
    this.content = body.querySelector('.stats-content');
    if (this.stats) this.showStats();
    if (!this.hidden) this.loadStats();
    return article;
  }

  async loadStats() {
    this.abortController?.abort(); this.abortController = new AbortController();
    const signal = this.abortController.signal;
    if (!this.stats) { this.content.className = 'api-state stats-content is-loading'; this.content.textContent = 'Собираем статистику университета…'; }
    try {
      const snapshot = await getUniversitySnapshot(getMoscowDate().slice(0, 7), (loaded, total) => {
        if (!signal.aborted && !this.stats && total) this.content.textContent = `Собираем расписания: ${loaded} из ${total} частей…`;
      });
      if (signal.aborted) return;
      const groups = snapshot.groups.filter(isActiveInSemester);
      const teachers = activeTeachers(snapshot);
      const institutes = new Set(groups.flatMap((group) => group.instituteSlugs));
      const monthSeries = semesterMonths(snapshot).map((month) => {
        let groupPairs = 0; let teacherPairs = 0;
        monthDates(month).forEach((date) => lessonsForDate(snapshot, date).forEach((lesson) => {
          groupPairs += 1;
          teacherPairs += lesson.teachers?.length || 0;
        }));
        return { month, perGroup: groups.length ? groupPairs / groups.length : 0, perTeacher: teachers.size ? teacherPairs / teachers.size : 0 };
      });
      this.stats = {
        version: 2,
        groups: groups.length,
        teachers: teachers.size,
        institutes: institutes.size,
        lessonsToday: lessonsForDate(snapshot, getMoscowDate()).length,
        monthSeries,
        updatedAt: snapshot.generatedAt,
        archivedParts: snapshot.archivedParts
      };
      this.showStats(); this.onChange?.();
    } catch (error) {
      if (signal.aborted) return;
      if (!this.stats) { this.content.className = 'api-state stats-content is-error'; this.content.textContent = 'Не удалось собрать общую статистику. Попробуйте обновить страницу.'; }
    }
  }

  createChart(title, key, denominator) {
    const chart = document.createElement('section'); chart.className = 'load-chart';
    const heading = document.createElement('div'); heading.className = 'load-chart-heading';
    const name = document.createElement('strong'); name.textContent = title;
    const unit = document.createElement('span'); unit.textContent = `пар / ${denominator} в месяц`;
    heading.append(name, unit);
    const bars = document.createElement('div'); bars.className = 'load-chart-bars';
    const maximum = Math.max(1, ...this.stats.monthSeries.map((point) => point[key]));
    this.stats.monthSeries.forEach((point) => {
      const bar = document.createElement('div'); bar.className = 'load-chart-bar';
      bar.title = `${point.month}: ${formatNumber(point[key])} пар на ${denominator}`;
      const value = document.createElement('strong'); value.textContent = formatNumber(point[key]);
      const column = document.createElement('i'); column.style.setProperty('--bar-height', `${Math.max(4, Math.round(point[key] / maximum * 100))}%`);
      const label = document.createElement('span');
      label.textContent = new Intl.DateTimeFormat('ru-RU', { month: 'short', timeZone: 'UTC' }).format(new Date(`${point.month}-01T12:00:00Z`)).replace('.', '');
      bar.append(value, column, label); bars.append(bar);
    });
    chart.append(heading, bars); return chart;
  }

  showStats() {
    this.content.className = 'stats-content'; this.content.replaceChildren();
    const grid = document.createElement('div'); grid.className = 'stats-grid';
    [
      ['Активные группы', this.stats.groups],
      ['Активные преподаватели', this.stats.teachers],
      ['Институты', this.stats.institutes],
      ['Занятий сегодня', this.stats.lessonsToday]
    ].forEach(([label, value]) => {
      const item = document.createElement('div'); const number = document.createElement('strong'); const caption = document.createElement('span');
      number.textContent = Number.isFinite(value) ? formatNumber(value) : '—'; caption.textContent = label; item.append(number, caption); grid.append(item);
    });
    const note = document.createElement('small'); note.className = 'stats-context';
    note.textContent = this.stats.archivedParts
      ? `Показаны архивные данные: ${this.stats.archivedParts} из 28 частей. Активность рассчитана по расписаниям групп текущего семестра.`
      : 'Активность и нагрузка рассчитаны по расписаниям групп текущего семестра.';
    const updated = document.createElement('small');
    updated.textContent = `Обновлено ${new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(this.stats.updatedAt))}`;
    this.content.append(grid, this.createChart('Загруженность преподавателей', 'perTeacher', 'преподавателя'), this.createChart('Загруженность студентов', 'perGroup', 'группу'), note, updated);
  }

  serialize() { return { ...super.serialize(), state: { stats: this.stats } }; }
}
