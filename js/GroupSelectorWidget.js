import UIComponent from './UIComponent.js';
import { getCatalog, getTeachers } from './SutdApi.js';

export default class GroupSelectorWidget extends UIComponent {
  constructor(config) {
    super({ title: 'Выбор расписания', span: 12, height: 250, ...config });
    this.type = 'selector';
    this.selection = config.state?.selection || { type: 'group', id: config.state?.groupId || 2, label: config.state?.groupLabel || '1-ГД-13' };
    this.mode = this.selection.type; this.onSelectionSelect = config.onSelectionSelect; this.groups = []; this.teachers = [];
  }

  render() {
    const { article, body } = this.createShell('/assets/icons/student.svg', 'university-blue', 'Управляет связанными виджетами');
    body.innerHTML = '<div class="entity-toggle" role="group" aria-label="Тип расписания"><button type="button" data-mode="group">Группа</button><button type="button" data-mode="teacher">Преподаватель</button></div><form class="selector-form"><label><span class="selector-label"></span><input autocomplete="off"></label><datalist></datalist><button type="submit">Показать</button></form><small class="selector-status" role="status">Загружаем каталог…</small>';
    this.input = body.querySelector('input'); this.input.value = this.selection.label;
    this.list = body.querySelector('datalist'); this.status = body.querySelector('.selector-status');
    const listId = `selector-options-${this.id}`; this.list.id = listId; this.input.setAttribute('list', listId);
    this.listen(body.querySelector('.entity-toggle'), 'click', (event) => { const button = event.target.closest('[data-mode]'); if (button) this.setMode(button.dataset.mode); });
    this.listen(body.querySelector('form'), 'submit', (event) => this.submit(event)); this.renderMode(); this.loadOptions(); return article;
  }

  async loadOptions() {
    this.abortController?.abort(); this.abortController = new AbortController();
    try {
      const [catalog, teachers] = await Promise.all([getCatalog(this.abortController.signal), getTeachers(this.abortController.signal)]);
      this.groups = [...new Map((catalog.groups || []).map((item) => [item.value, { id: item.value, label: item.label, type: 'group' }])).values()];
      this.teachers = [...new Map((teachers.items || []).map((item) => [item.id, { id: item.id, label: item.full_name, type: 'teacher' }])).values()];
      this.renderOptions();
    } catch (error) { if (error.name !== 'AbortError') this.status.textContent = 'Не удалось загрузить каталог'; }
  }

  submit(event) {
    event.preventDefault(); const query = this.input.value.trim().toLocaleLowerCase('ru');
    const item = this.getOptions().find((option) => option.label.toLocaleLowerCase('ru') === query);
    if (!item) { this.status.textContent = `Выберите ${this.mode === 'group' ? 'группу' : 'преподавателя'} из списка`; this.input.focus(); return; }
    this.selection = item; this.status.textContent = `Выбрано: ${item.label}`; this.onSelectionSelect?.(item);
  }

  getOptions() { return this.mode === 'group' ? this.groups : this.teachers; }
  setMode(mode) { this.mode = mode; if (this.selection.type !== mode) this.input.value = ''; this.renderMode(); this.renderOptions(); }
  renderMode() {
    this.element.querySelectorAll('[data-mode]').forEach((button) => button.classList.toggle('active', button.dataset.mode === this.mode));
    this.element.querySelector('.selector-label').textContent = this.mode === 'group' ? 'Группа' : 'Преподаватель';
    this.input.placeholder = this.mode === 'group' ? 'Начните вводить номер группы' : 'Начните вводить фамилию';
    const icon = this.element.querySelector('.widget-icon img');
    if (icon) icon.src = this.mode === 'group' ? '/assets/icons/student.svg' : '/assets/icons/teacher.svg';
  }
  renderOptions() {
    const fragment = document.createDocumentFragment(); this.getOptions().forEach((item) => { const option = document.createElement('option'); option.value = item.label; fragment.append(option); });
    this.list.replaceChildren(fragment); this.status.textContent = `Доступно: ${this.getOptions().length}`;
  }
  setSelection(selection) { this.selection = selection; this.mode = selection.type; if (this.input) { this.input.value = selection.label; this.renderMode(); this.renderOptions(); } }
  serialize() { return { ...super.serialize(), state: { selection: this.selection } }; }
}
