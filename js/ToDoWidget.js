import UIComponent from './UIComponent.js';

export default class ToDoWidget extends UIComponent {
  constructor(config) {
    super({ title: 'Мои задачи', ...config });
    this.type = 'todo';
    this.tasks = config.state?.tasks || [
      { id: crypto.randomUUID(), text: 'Подготовить презентацию', done: true },
      { id: crypto.randomUUID(), text: 'Ответить на важные письма', done: false },
      { id: crypto.randomUUID(), text: 'Спланировать следующую неделю', done: false }
    ];
  }

  render() {
    const { article, body } = this.createShell('✓', 'mint', 'На сегодня');
    body.innerHTML = '<form class="todo-form"><input aria-label="Новая задача" maxlength="80" placeholder="Добавить новую задачу…"><button type="submit" aria-label="Добавить задачу">＋</button></form><ul class="todo-list"></ul><div class="todo-footer"><span class="todo-progress"></span><button class="text-button clear-done" type="button">Убрать выполненные</button></div>';
    this.list = body.querySelector('.todo-list');
    this.progress = body.querySelector('.todo-progress');
    this.listen(body.querySelector('.todo-form'), 'submit', (event) => {
      event.preventDefault();
      const input = event.currentTarget.querySelector('input');
      const text = input.value.trim();
      if (!text) return;
      this.tasks.push({ id: crypto.randomUUID(), text, done: false });
      input.value = '';
      this.renderTasks();
    });
    this.listen(this.list, 'change', (event) => {
      const task = this.tasks.find((item) => item.id === event.target.dataset.taskId);
      if (task) { task.done = event.target.checked; this.renderTasks(); }
    });
    this.listen(this.list, 'click', (event) => {
      const button = event.target.closest('[data-delete-task]');
      if (!button) return;
      this.tasks = this.tasks.filter((item) => item.id !== button.dataset.deleteTask);
      this.renderTasks();
    });
    this.listen(body.querySelector('.clear-done'), 'click', () => {
      this.tasks = this.tasks.filter((item) => !item.done);
      this.renderTasks();
    });
    this.renderTasks();
    return article;
  }

  renderTasks() {
    this.list.replaceChildren();
    if (!this.tasks.length) {
      const empty = document.createElement('li');
      empty.className = 'empty-state';
      empty.textContent = 'Задач пока нет — отличный момент начать.';
      this.list.append(empty);
    }
    this.tasks.forEach((task) => {
      const li = document.createElement('li');
      li.className = task.done ? 'is-done' : '';
      const label = document.createElement('label');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox'; checkbox.checked = task.done; checkbox.dataset.taskId = task.id;
      const mark = document.createElement('span'); mark.className = 'checkmark';
      const text = document.createElement('span'); text.textContent = task.text;
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'task-delete'; remove.dataset.deleteTask = task.id; remove.setAttribute('aria-label', `Удалить: ${task.text}`); remove.textContent = '×';
      label.append(checkbox, mark, text); li.append(label, remove); this.list.append(li);
    });
    const done = this.tasks.filter((task) => task.done).length;
    this.progress.textContent = `${done} из ${this.tasks.length} выполнено`;
    this.onChange?.();
  }

  serialize() { return { ...super.serialize(), state: { tasks: this.tasks } }; }
}
