import { getMoscowDate } from './SutdApi.js';
import { getScheduleSuggestions } from './ScheduleSuggestions.js';

const labels = { my: 'Мои занятия', all: 'Все занятия', address: 'По адресу', teacher: 'По преподавателю', group: 'По группе' };
const placeholders = { address: 'Введите адрес', teacher: 'Введите преподавателя', group: 'Введите группу' };

export default class DayControls {
  constructor(owner, container, scopes, state = {}, onChange) {
    this.owner = owner;
    this.onChange = onChange;
    this.element = document.createElement('div'); this.element.className = 'schedule-controls';
    this.element.innerHTML = '<div class="schedule-scope"><select data-scope aria-label="Какие занятия показывать"></select><input data-target type="search" hidden><datalist data-target-options></datalist></div><div class="schedule-day"><button type="button" data-day-prev aria-label="Предыдущий день">←</button><input data-date type="date" aria-label="Дата занятий"><button type="button" data-day-next aria-label="Следующий день">→</button></div><div class="schedule-period"><select data-period aria-label="Время занятий"><option value="all">Целый день</option><option value="remaining">Оставшиеся занятия</option><option value="interval">Интервал</option></select><input data-from type="time" aria-label="Начало интервала" hidden><input data-to type="time" aria-label="Конец интервала" hidden></div>';
    this.scope = this.element.querySelector('[data-scope]');
    scopes.forEach((scope) => { const option = document.createElement('option'); option.value = scope; option.textContent = labels[scope]; this.scope.append(option); });
    this.target = this.element.querySelector('[data-target]');
    this.suggestions = this.element.querySelector('[data-target-options]');
    this.suggestions.id = `schedule-target-${owner.id}`;
    this.target.setAttribute('list', this.suggestions.id);
    this.date = this.element.querySelector('[data-date]');
    this.period = this.element.querySelector('[data-period]');
    this.from = this.element.querySelector('[data-from]');
    this.to = this.element.querySelector('[data-to]');
    this.scope.value = scopes.includes(state.scope) ? state.scope : 'my';
    this.target.value = state.target || '';
    this.date.value = state.date || getMoscowDate();
    this.period.value = ['all', 'remaining', 'interval'].includes(state.period) ? state.period : 'all';
    this.from.value = state.from || '08:00'; this.to.value = state.to || '21:00';
    this.updateVisibility(); container.prepend(this.element);
    owner.listen(this.scope, 'change', () => { this.target.value = ''; this.updateVisibility(); this.refreshSuggestions(); this.changed('data'); });
    owner.listen(this.target, 'input', () => this.changed('view'));
    owner.listen(this.date, 'change', () => this.changed('data'));
    owner.listen(this.element.querySelector('[data-day-prev]'), 'click', () => this.shiftDay(-1));
    owner.listen(this.element.querySelector('[data-day-next]'), 'click', () => this.shiftDay(1));
    owner.listen(this.period, 'change', () => { this.updateVisibility(); this.changed('view'); });
    owner.listen(this.from, 'change', () => this.changed('view'));
    owner.listen(this.to, 'change', () => this.changed('view'));
    if (!owner.hidden) this.refreshSuggestions();
  }

  shiftDay(delta) {
    const date = new Date(`${this.date.value}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + delta);
    this.date.value = date.toISOString().slice(0, 10);
    this.changed('data');
  }

  changed(kind) { this.onChange(kind); this.owner.onChange?.(); }

  setSnapshot(snapshot) { this.snapshot = snapshot; this.refreshSuggestions(); }

  async refreshSuggestions() {
    const scope = this.scope.value;
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

  updateVisibility() {
    const targetMode = ['address', 'teacher', 'group'].includes(this.scope.value);
    this.target.hidden = !targetMode;
    this.target.placeholder = placeholders[this.scope.value] || '';
    this.target.setAttribute('aria-label', placeholders[this.scope.value] || 'Фильтр');
    this.from.hidden = this.to.hidden = this.period.value !== 'interval';
  }

  get state() {
    return { scope: this.scope.value, target: this.target.value.trim(), date: this.date.value, period: this.period.value, from: this.from.value, to: this.to.value };
  }
}
