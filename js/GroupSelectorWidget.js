import UIComponent from './UIComponent.js';
import { getCatalog, getInstitutes, getTeachers } from './SutdApi.js';

export default class GroupSelectorWidget extends UIComponent {
  constructor(config) {
    super({ title: 'Выбор расписания', span: 12, height: 350, ...config });
    this.type = 'selector';
    this.selection = config.state?.selection || { type: 'group', id: config.state?.groupId || 2, label: config.state?.groupLabel || '1-ГД-13' };
    this.name = config.state?.name || '';
    this.mode = this.selection.type; this.onProfileSave = config.onProfileSave; this.groups = []; this.teachers = []; this.institutes = [];
  }

  render() {
    const { article, body } = this.createShell('assets/icons/student.svg', 'university-blue', 'Управляет связанными виджетами');
    body.innerHTML = '<div class="entity-toggle" role="group" aria-label="Тип расписания"><button type="button" data-mode="group">Группа</button><button type="button" data-mode="teacher">Преподаватель</button></div><details class="selector-filters"><summary>Расширенный поиск</summary><div class="selector-filter-grid"><label>Институт<select data-filter="institute"><option value="">Любой</option></select></label><label>Уровень<select data-filter="level"><option value="">Любой</option><option value="bachelor">Бакалавриат</option><option value="master">Магистратура</option><option value="specialist">Специалитет</option><option value="secondary_vocational">Колледж</option></select></label><label>Курс<select data-filter="course"><option value="">Любой</option><option value="1">1</option><option value="2">2</option><option value="3">3</option><option value="4">4</option><option value="5">5</option><option value="6">6</option></select></label><label>Направление<select data-filter="direction"><option value="">Любое</option></select></label></div></details><form class="selector-form"><label class="selector-name-field"><span>Как к вам обращаться (необязательно)</span><input class="selector-name-input" type="text" autocomplete="nickname" maxlength="80" placeholder="Ваше имя"></label><label><span class="selector-label"></span><input class="selector-entity-input" autocomplete="off"></label><datalist></datalist><button type="submit">Сохранить</button></form><small class="selector-status" role="status">Загружаем каталог…</small>';
    this.nameInput = body.querySelector('.selector-name-input'); this.nameInput.value = this.name;
    this.input = body.querySelector('.selector-entity-input'); this.input.value = this.selection.label;
    this.list = body.querySelector('datalist'); this.status = body.querySelector('.selector-status');
    const listId = `selector-options-${this.id}`; this.list.id = listId; this.input.setAttribute('list', listId);
    this.listen(body.querySelector('.entity-toggle'), 'click', (event) => { const button = event.target.closest('[data-mode]'); if (button) this.setMode(button.dataset.mode); });
    this.listen(body.querySelector('.selector-filters'), 'change', () => this.renderOptions());
    this.listen(body.querySelector('form'), 'submit', (event) => this.submit(event)); this.renderMode(); this.loadOptions(); return article;
  }

  async loadOptions() {
    this.abortController?.abort(); this.abortController = new AbortController();
    try {
      const [catalog, teachers, institutes] = await Promise.all([getCatalog(this.abortController.signal), getTeachers(this.abortController.signal), getInstitutes(this.abortController.signal)]);
      this.groups = [...new Map((catalog.groups || []).map((item) => [item.value, { id: item.value, label: item.label, type: 'group', educationLevel: item.education_level, directionCode: item.direction_code, instituteSlugs: item.institute_slugs || [] }])).values()];
      this.teachers = [...new Map((teachers.items || []).map((item) => [item.id, { id: item.id, label: item.full_name, type: 'teacher' }])).values()];
      this.institutes = institutes.items || [];
      this.renderFilters();
      this.renderOptions();
    } catch (error) { if (error.name !== 'AbortError') this.status.textContent = 'Не удалось загрузить каталог'; }
  }

  submit(event) {
    event.preventDefault(); const query = this.input.value.trim().toLocaleLowerCase('ru');
    const item = this.getOptions().find((option) => option.label.toLocaleLowerCase('ru') === query)
      || (!this.hasActiveFilters() && this.mode === this.selection.type && this.selection.label.toLocaleLowerCase('ru') === query ? this.selection : null);
    if (!item) { this.status.textContent = `Выберите ${this.mode === 'group' ? 'группу' : 'преподавателя'} из списка`; this.input.focus(); return; }
    this.selection = item; this.name = this.nameInput.value.trim(); this.onProfileSave?.(item, this.name);
  }

  hasActiveFilters() { return this.mode === 'group' && [...this.element.querySelectorAll('[data-filter]')].some((field) => field.value); }
  getOptions() {
    if (this.mode === 'teacher') return this.teachers;
    const filters = Object.fromEntries([...this.element.querySelectorAll('[data-filter]')].map((field) => [field.dataset.filter, field.value]));
    return this.groups.filter((group) =>
      (!filters.institute || group.instituteSlugs.includes(filters.institute)) &&
      (!filters.level || group.educationLevel === filters.level) &&
      (!filters.course || group.label.match(/^([1-6])/)?.[1] === filters.course) &&
      (!filters.direction || group.directionCode === filters.direction));
  }
  renderFilters() {
    const institute = this.element.querySelector('[data-filter="institute"]');
    const direction = this.element.querySelector('[data-filter="direction"]');
    this.institutes.forEach((item) => { const option = document.createElement('option'); option.value = item.value; option.textContent = item.label; institute.append(option); });
    [...new Set(this.groups.map((group) => group.directionCode).filter(Boolean))].sort().forEach((code) => {
      const option = document.createElement('option'); option.value = code; option.textContent = code; direction.append(option);
    });
  }
  setMode(mode) { this.mode = mode; this.input.value = this.selection.type === mode ? this.selection.label : ''; this.renderMode(); this.renderOptions(); }
  renderMode() {
    this.element.querySelectorAll('[data-mode]').forEach((button) => button.classList.toggle('active', button.dataset.mode === this.mode));
    this.element.querySelector('.selector-label').textContent = this.mode === 'group' ? 'Группа' : 'Преподаватель';
    this.input.placeholder = this.mode === 'group' ? 'Начните вводить номер группы' : 'Начните вводить фамилию';
    this.element.querySelector('.selector-filters').hidden = this.mode !== 'group';
    const icon = this.element.querySelector('.widget-icon img');
    if (icon) icon.src = this.mode === 'group' ? 'assets/icons/student.svg' : 'assets/icons/teacher.svg';
  }
  renderOptions() {
    const fragment = document.createDocumentFragment(); this.getOptions().forEach((item) => { const option = document.createElement('option'); option.value = item.label; fragment.append(option); });
    this.list.replaceChildren(fragment); this.status.textContent = `Доступно: ${this.getOptions().length}`;
  }
  setSelection(selection) { this.selection = selection; this.mode = selection.type; if (this.input) { this.input.value = selection.label; this.renderMode(); this.renderOptions(); } }
  serialize() { return { ...super.serialize(), state: { selection: this.selection, name: this.name } }; }
}
