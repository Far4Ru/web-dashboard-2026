import UIComponent from './UIComponent.js';

const weekDays = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];

function getMonday(date = new Date()) {
  const result = new Date(date);
  const day = result.getDay() || 7;
  result.setDate(result.getDate() - day + 1);
  return result.toISOString().slice(0, 10);
}

export default class ScheduleWidget extends UIComponent {
  constructor(config) {
    super({ title: 'Расписание занятий', span: 12, height: 520, ...config });
    this.type = 'schedule';
    this.groupId = config.state?.groupId || 2;
    this.groupLabel = config.state?.groupLabel || '1-ГД-13';
    this.schedule = config.state?.schedule || null;
  }

  render() {
    const { article, body } = this.createShell('/assets/icons/lecture.svg', 'university-blue', `Группа ${this.groupLabel}`);
    article.classList.add('schedule-widget');
    body.innerHTML = '<div class="api-state schedule-content" role="status"></div><div class="schedule-source">Данные: официальное расписание СПбГУПТД</div>';
    this.content = body.querySelector('.schedule-content');
    if (this.schedule) this.showSchedule(); else this.loadSchedule();
    return article;
  }

  async loadSchedule() {
    this.abortController?.abort();
    this.abortController = new AbortController();
    this.content.className = 'api-state schedule-content is-loading';
    this.content.textContent = `Загружаем расписание группы ${this.groupLabel}…`;
    try {
      const weekStart = getMonday();
      const response = await fetch(`/sutd-api/group_schedule/?group_id=${encodeURIComponent(this.groupId)}&week_start=${weekStart}`, { signal: this.abortController.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      this.groupLabel = data.group || this.groupLabel;
      this.schedule = {
        weekType: data.week_type,
        weekTypeRu: data.week_type_ru,
        weekStart: data.week_start,
        weekEnd: data.week_end,
        lessons: Array.isArray(data.schedule) ? data.schedule : []
      };
      this.element.querySelector('.widget-heading small').textContent = `Группа ${this.groupLabel}`;
      this.showSchedule(); this.onChange?.();
    } catch (error) {
      if (error.name === 'AbortError') return;
      this.content.className = 'api-state schedule-content is-error';
      this.content.textContent = 'Не удалось загрузить расписание. Попробуйте позже.';
    }
  }

  showSchedule() {
    const lessons = this.schedule.lessons.filter((lesson) => {
      if (lesson.date) return lesson.date >= this.schedule.weekStart && lesson.date <= this.schedule.weekEnd;
      return lesson.week_type === 'both' || lesson.week_type === this.schedule.weekType;
    });
    this.content.className = 'schedule-content';
    this.content.replaceChildren();

    if (!lessons.length) {
      this.content.classList.add('api-state', 'is-empty');
      this.content.textContent = 'На выбранной неделе занятий нет.';
      return;
    }

    const meta = document.createElement('div');
    meta.className = 'schedule-meta';
    meta.textContent = `${this.formatDate(this.schedule.weekStart)} — ${this.formatDate(this.schedule.weekEnd)} · ${this.schedule.weekTypeRu || 'учебная неделя'}`;
    const grid = document.createElement('div'); grid.className = 'schedule-days';
    weekDays.forEach((day) => {
      const dayLessons = lessons.filter((lesson) => lesson.weekday === day).sort((a, b) => a.start_time.localeCompare(b.start_time));
      if (!dayLessons.length) return;
      const column = document.createElement('section'); column.className = 'schedule-day';
      const title = document.createElement('h3'); title.textContent = day;
      column.append(title);
      dayLessons.forEach((lesson) => {
        const item = document.createElement('article'); item.className = 'lesson-card';
        const time = document.createElement('strong'); time.className = 'lesson-time'; time.textContent = lesson.end_time ? `${lesson.start_time}–${lesson.end_time}` : lesson.start_time;
        const subject = document.createElement('p'); subject.textContent = lesson.subject;
        const details = document.createElement('small'); details.textContent = [lesson.lesson_type, lesson.classroom, lesson.teacher !== '–' ? lesson.teacher : null].filter(Boolean).join(' · ');
        item.append(time, subject, details); column.append(item);
      });
      grid.append(column);
    });
    this.content.append(meta, grid);
  }

  formatDate(value) { return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' }).format(new Date(`${value}T12:00:00`)); }
  serialize() { return { ...super.serialize(), state: { groupId: this.groupId, groupLabel: this.groupLabel, schedule: this.schedule } }; }
}
