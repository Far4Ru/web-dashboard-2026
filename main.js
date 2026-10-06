import Dashboard from './js/Dashboard.js';

const dashboardElement = document.querySelector('#dashboard');
const toastRegion = document.querySelector('#toast-region');
const widgetModal = document.querySelector('#widget-modal');
let currentSelection;
try { currentSelection = JSON.parse(localStorage.getItem('sutd-selected-entity')); } catch { currentSelection = null; }
if (!currentSelection?.id) currentSelection = { type: 'group', id: 2, label: '1-ГД-13' };

function showToast(message) {
  const toast = document.createElement('div'); toast.className = 'toast'; toast.textContent = message; toastRegion.append(toast);
  window.setTimeout(() => toast.remove(), 2600);
}

function openModal(modal) { modal.hidden = false; requestAnimationFrame(() => modal.classList.add('is-open')); modal.querySelector('button')?.focus(); }
function closeModal(modal) { modal.classList.remove('is-open'); window.setTimeout(() => { modal.hidden = true; }, 180); }

const dashboard = new Dashboard(dashboardElement, {
  onCountChange: () => {},
  onToast: showToast,
  currentSelection
});
dashboard.render();

const moscowHour = Number(new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', hour: '2-digit', hour12: false }).format(new Date()));
document.querySelector('#greeting-label').textContent = moscowHour < 12 ? 'Доброе утро' : moscowHour < 18 ? 'Добрый день' : 'Добрый вечер';
document.querySelector('#today-label').textContent = `Сегодня, ${new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date())}`;
document.querySelector('#add-widget-button').addEventListener('click', () => openModal(widgetModal));
document.querySelector('[data-close-modal]').addEventListener('click', () => closeModal(widgetModal));
document.querySelectorAll('[data-widget-type]').forEach((button) => button.addEventListener('click', () => { dashboard.addWidget(button.dataset.widgetType); closeModal(widgetModal); }));
widgetModal.addEventListener('click', (event) => { if (event.target === widgetModal) closeModal(widgetModal); });
document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !widgetModal.hidden) closeModal(widgetModal); });

window.addEventListener('beforeunload', () => dashboard.destroy());
