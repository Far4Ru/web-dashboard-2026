import Dashboard from './js/Dashboard.js';
import { clearSavedData, getSavedDataUsage } from './js/SavedData.js';

const dashboardElement = document.querySelector('#dashboard');
const toastRegion = document.querySelector('#toast-region');
const settingsModal = document.querySelector('#settings-modal');
const savedDataList = document.querySelector('#saved-data-list');
const settingsWidgetList = document.querySelector('#settings-widget-list');
const savedGroups = [
  ['university', 'Общее расписание'],
  ['schedules', 'Расписания групп и преподавателей'],
  ['catalogs', 'Каталоги групп и преподавателей'],
  ['geo', 'Адреса на карте'],
  ['profile', 'Имя и выбранное расписание'],
  ['layout', 'Расположение виджетов']
];
let currentSelection;
try { currentSelection = JSON.parse(localStorage.getItem('sutd-selected-entity')); } catch { currentSelection = null; }
const hasSavedSelection = Boolean(currentSelection?.id && currentSelection?.label && ['group', 'teacher'].includes(currentSelection.type));
if (!hasSavedSelection) currentSelection = { type: 'group', id: 2, label: '1-ГД-13' };
const currentName = (localStorage.getItem('sutd-user-name') || '').trim();
const greetingLabel = document.querySelector('#greeting-label');
const profileButton = document.querySelector('#profile-button');
function updateGreeting(name) { greetingLabel.textContent = name ? `Добрый день, ${name}` : 'Добрый день'; }

function showToast(message) {
  const toast = document.createElement('div'); toast.className = 'toast'; toast.textContent = message; toastRegion.append(toast);
  window.setTimeout(() => toast.remove(), 2600);
}

function openModal(modal) { modal.hidden = false; requestAnimationFrame(() => modal.classList.add('is-open')); modal.querySelector('button')?.focus(); }
function closeModal(modal) { modal.classList.remove('is-open'); window.setTimeout(() => { modal.hidden = true; }, 180); }
function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} Б`;
  return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(bytes / (bytes < 1048576 ? 1024 : 1048576))} ${bytes < 1048576 ? 'КБ' : 'МБ'}`;
}

const dashboard = new Dashboard(dashboardElement, {
  onCountChange: () => {},
  onToast: showToast,
  currentSelection,
  currentName,
  showProfileOnStart: !hasSavedSelection,
  onNameChange: updateGreeting,
  onProfileVisibilityChange: (visible) => profileButton.setAttribute('aria-expanded', String(visible))
});
dashboard.render();

function renderWidgetSettings() {
  settingsWidgetList.replaceChildren();
  const counts = new Map();
  dashboard.widgets.filter((widget) => widget.type !== 'selector').forEach((widget) => {
    const count = (counts.get(widget.title) || 0) + 1; counts.set(widget.title, count);
    const row = document.createElement('div'); row.className = 'settings-row';
    const name = document.createElement('strong'); name.textContent = count > 1 ? `${widget.title} · ${count}` : widget.title;
    const button = document.createElement('button'); button.type = 'button'; button.dataset.widgetId = widget.id;
    button.textContent = widget.hidden ? 'Показать' : 'Скрыть';
    button.setAttribute('aria-label', `${button.textContent} виджет «${widget.title}»`);
    row.append(name, button); settingsWidgetList.append(row);
  });
}

async function renderSavedData() {
  savedDataList.textContent = 'Считаем сохранённые данные…';
  try {
    const usage = await getSavedDataUsage();
    const fragment = document.createDocumentFragment();
    savedGroups.forEach(([key, label]) => {
      const data = usage[key]; const row = document.createElement('div'); row.className = 'settings-row';
      const info = document.createElement('span'); const name = document.createElement('strong'); const size = document.createElement('small');
      name.textContent = label; size.textContent = `${data.count} записей · ≈ ${formatBytes(data.bytes)}`;
      info.append(name, size);
      const button = document.createElement('button'); button.type = 'button'; button.dataset.clearGroup = key;
      button.textContent = 'Очистить'; button.disabled = !data.count;
      row.append(info, button); fragment.append(row);
    });
    savedDataList.replaceChildren(fragment);
  } catch { savedDataList.textContent = 'Не удалось прочитать сведения о кэше.'; }
}

updateGreeting(currentName);
const todayLabel = document.querySelector('#today-label');
const moscowDateTime = new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
let clockTimer;
function updateClock() {
  const now = new Date();
  todayLabel.textContent = `Сегодня, ${moscowDateTime.format(now)}`;
  clockTimer = window.setTimeout(updateClock, 60000 - now.getSeconds() * 1000 - now.getMilliseconds());
}
updateClock();
document.addEventListener('visibilitychange', () => { if (!document.hidden) { clearTimeout(clockTimer); updateClock(); } });
profileButton.addEventListener('click', () => dashboard.toggleProfileEditor());
document.querySelector('#settings-button').addEventListener('click', () => {
  renderWidgetSettings(); renderSavedData(); openModal(settingsModal);
});
document.querySelector('[data-close-modal]').addEventListener('click', () => closeModal(settingsModal));
settingsWidgetList.addEventListener('click', (event) => {
  const button = event.target.closest('[data-widget-id]');
  if (!button) return;
  const widget = dashboard.widgets.find((item) => item.id === button.dataset.widgetId);
  if (widget) dashboard.setWidgetVisible(widget.id, widget.hidden);
  renderWidgetSettings();
});
document.querySelector('#settings-add-widget').addEventListener('click', () => {
  dashboard.addWidget(document.querySelector('#settings-add-type').value);
  renderWidgetSettings();
});
savedDataList.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-clear-group]');
  if (!button) return;
  button.disabled = true;
  await clearSavedData(button.dataset.clearGroup);
  showToast('Сохранённые данные очищены');
  if (['profile', 'layout'].includes(button.dataset.clearGroup)) window.location.reload();
  else renderSavedData();
});
settingsModal.addEventListener('click', (event) => { if (event.target === settingsModal) closeModal(settingsModal); });
document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !settingsModal.hidden) closeModal(settingsModal); });

window.addEventListener('beforeunload', () => { clearTimeout(clockTimer); dashboard.destroy(); });
