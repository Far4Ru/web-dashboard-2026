import UIComponent from './UIComponent.js';
import {
  getCatalog,
  getInstitutes,
  getScheduleForSelection,
  getTeachers,
  getTodayLessons
} from './SutdApi.js';

export default class StatsWidget extends UIComponent {
  constructor(config) {
    super({ title: 'Университет сегодня', span: 4, height: 390, ...config });
    this.type = 'stats';
    this.stats = config.state?.stats || null;
    this.selection = config.state?.selection || { type: 'group', id: 2, label: '1-ГД-13' };
  }

  render() {
    const { article, body } = this.createShell('assets/icons/university.svg', 'university-blue', 'Актуальные данные API');
    body.innerHTML = '<div class="api-state stats-content" role="status"></div>';
    this.content = body.querySelector('.stats-content');
    if (this.stats) this.showStats();
    this.loadStats();
    return article;
  }

  async loadStats() {
    this.abortController?.abort();
    this.abortController = new AbortController();
    if (!this.stats) { this.content.className = 'api-state stats-content is-loading'; this.content.textContent = 'Обновляем статистику…'; }
    try {
      const [catalog, teachers, institutes, schedule] = await Promise.all([
        getCatalog(this.abortController.signal),
        getTeachers(this.abortController.signal),
        getInstitutes(this.abortController.signal),
        getScheduleForSelection(this.selection, this.abortController.signal)
      ]);
      const uniqueGroups = new Map((catalog.groups || []).map((group) => [group.value, group]));
      const uniqueTeachers = new Map((teachers.items || []).map((teacher) => [teacher.id, teacher]));
      const uniqueInstitutes = new Set((institutes.items || []).map((institute) => institute.value));
      const courses = new Map(Array.from({ length: 6 }, (_, index) => [index + 1, 0]));
      uniqueGroups.forEach((group) => {
        const match = String(group.label || '').match(/^([1-6])-/);
        if (match) courses.set(Number(match[1]), courses.get(Number(match[1])) + 1);
      });
      const todayLessons = getTodayLessons(schedule);
      const uniqueLessons = new Set(todayLessons.map((lesson) => [
        lesson.date || '', lesson.start_time || '', lesson.end_time || '',
        lesson.discipline || lesson.subject || '', lesson.classroom || lesson.room || ''
      ].join('|')));
      this.stats = {
        groups: uniqueGroups.size,
        teachers: uniqueTeachers.size,
        institutes: uniqueInstitutes.size,
        lessonsToday: uniqueLessons.size,
        courses: [...courses].map(([course, count]) => ({ course, count })),
        selectionLabel: this.selection.label,
        selectionKey: `${this.selection.type}:${this.selection.id}`,
        updatedAt: new Date().toISOString()
      };
      this.showStats(); this.onChange?.();
    } catch (error) {
      if (error.name === 'AbortError') return;
      if (!this.stats) { this.content.className = 'api-state stats-content is-error'; this.content.textContent = 'Не удалось обновить статистику.'; }
    }
  }

  showStats() {
    this.content.className = 'stats-content'; this.content.replaceChildren();
    const grid = document.createElement('div'); grid.className = 'stats-grid';
    [
      ['Групп', this.stats.groups],
      ['Преподавателей', this.stats.teachers],
      ['Институтов', this.stats.institutes],
      ['Занятий сегодня', this.stats.lessonsToday]
    ].forEach(([label, value]) => {
      const item = document.createElement('div'); const number = document.createElement('strong'); const caption = document.createElement('span');
      number.textContent = Number.isFinite(value) ? new Intl.NumberFormat('ru-RU').format(value) : '—'; caption.textContent = label; item.append(number, caption); grid.append(item);
    });
    const chart = document.createElement('section'); chart.className = 'course-chart';
    const chartTitle = document.createElement('div'); chartTitle.className = 'course-chart-title';
    chartTitle.innerHTML = '<strong>Группы по курсам</strong><span>курс / групп</span>';
    const bars = document.createElement('div'); bars.className = 'course-bars';
    const maximum = Math.max(1, ...(this.stats.courses || []).map(({ count }) => count));
    (this.stats.courses || []).forEach(({ course, count }) => {
      const bar = document.createElement('div'); bar.className = 'course-bar';
      bar.title = `${course}-й курс: ${count} групп`;
      const value = document.createElement('strong'); value.textContent = count;
      const column = document.createElement('i'); column.style.setProperty('--bar-height', `${Math.max(4, Math.round(count / maximum * 100))}%`);
      const label = document.createElement('span'); label.textContent = course;
      bar.append(value, column, label); bars.append(bar);
    });
    chart.append(chartTitle, bars);
    const context = document.createElement('small');
    context.className = 'stats-context';
    context.textContent = `Занятия: ${this.stats.selectionLabel || this.selection.label}`;
    const updated = document.createElement('small'); updated.textContent = `Обновлено ${new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(new Date(this.stats.updatedAt))}`;
    this.content.append(grid, chart, context, updated);
  }

  setSelection(selection) {
    if (`${selection.type}:${selection.id}` === `${this.selection.type}:${this.selection.id}`) return;
    this.selection = selection;
    this.loadStats();
  }

  serialize() { return { ...super.serialize(), state: { stats: this.stats, selection: this.selection } }; }
}
