import StatsWidget from './StatsWidget.js';
import CampusMapWidget from './CampusMapWidget.js';
import TodayScheduleWidget from './TodayScheduleWidget.js';
import RoomsWidget from './RoomsWidget.js';
import StathamQuoteWidget from './StathamQuoteWidget.js';
import GroupSelectorWidget from './GroupSelectorWidget.js';
import MonthLoadWidget from './MonthLoadWidget.js';

const types = { selector: GroupSelectorWidget, stats: StatsWidget, map: CampusMapWidget, today: TodayScheduleWidget, rooms: RoomsWidget, statham: StathamQuoteWidget, monthLoad: MonthLoadWidget };
const defaultLayout = [
  { id: 'selector-main', type: 'selector', span: 12, height: 250 },
  { id: 'stats-main', type: 'stats', span: 4, height: 300 },
  { id: 'map-main', type: 'map', span: 8, height: 360 },
  { id: 'today-main', type: 'today', span: 8, height: 430 },
  { id: 'rooms-main', type: 'rooms', span: 4, height: 430 },
  { id: 'month-load-main', type: 'monthLoad', span: 12, height: 500 },
  { id: 'statham-main', type: 'statham', span: 12, height: 270 }
];

export default class Dashboard {
  constructor(container, { onCountChange, onToast, currentSelection } = {}) {
    this.container = container;
    this.widgets = [];
    this.onCountChange = onCountChange;
    this.onToast = onToast;
    this.currentSelection = currentSelection || { type: 'group', id: 2, label: '1-ГД-13' };
    this.draggedId = null;
    this.resizing = null;
    this.listeners = [];
  }

  render() {
    let saved;
    try { saved = JSON.parse(localStorage.getItem('sutd-dashboard-layout-v6')); } catch { saved = null; }
    const layout = Array.isArray(saved) && saved.length ? saved : defaultLayout;
    layout.forEach((config) => this.addWidget(config.type, config, false));
    this.bindInteractions();
    this.updateCount();
  }

  addWidget(widgetType, config = {}, announce = true) {
    const WidgetClass = types[widgetType];
    if (!WidgetClass) return;
    const state = ['selector', 'stats', 'map', 'today', 'rooms', 'monthLoad'].includes(widgetType)
      ? { ...config.state, selection: this.currentSelection }
      : config.state;
    const widget = new WidgetClass({
      id: config.id || `${widgetType}-${crypto.randomUUID()}`,
      size: config.size || 'medium',
      span: config.span,
      height: config.height,
      state,
      onSelectionSelect: (selection) => this.setSelection(selection),
      onRemove: (id) => this.removeWidget(id),
      onChange: () => this.save()
    });
    this.widgets.push(widget);
    this.container.append(widget.render());
    this.save(); this.updateCount();
    if (announce) this.onToast?.(`Виджет «${widget.title}» добавлен`);
    return widget;
  }

  removeWidget(widgetId) {
    const index = this.widgets.findIndex((widget) => widget.id === widgetId);
    if (index < 0) return;
    const [widget] = this.widgets.splice(index, 1);
    const title = widget.title; widget.destroy();
    this.save(); this.updateCount(); this.onToast?.(`Виджет «${title}» удалён`);
  }

  setSelection(selection) {
    this.currentSelection = selection;
    localStorage.setItem('sutd-selected-entity', JSON.stringify(selection));
    this.widgets.forEach((widget) => widget.setSelection?.(selection));
    this.save();
    this.onToast?.(`Расписание обновлено: ${selection.label}`);
  }

  bindInteractions() {
    this.listen(this.container, 'pointerdown', (event) => this.handlePointerDown(event));
    this.listen(this.container, 'keydown', (event) => this.handleKeyDown(event));
  }

  handlePointerDown(event) {
    const card = event.target.closest('.widget');
    if (!card || event.button !== 0) return;
    if (event.target.closest('.resize-handle')) return this.startResize(event, card);
    if (!event.target.closest('.drag-handle') || event.target.closest('button')) return;
    event.preventDefault();
    this.draggedId = card.dataset.widgetId;
    const rect = card.getBoundingClientRect();
    const offsetX = event.clientX - rect.left;
    const offsetY = event.clientY - rect.top;
    const ghost = card.cloneNode(true);
    ghost.className = `${card.className} drag-ghost`;
    ghost.removeAttribute('tabindex');
    ghost.setAttribute('aria-hidden', 'true');
    ghost.style.width = `${rect.width}px`;
    ghost.style.height = `${rect.height}px`;
    ghost.style.left = '0';
    ghost.style.top = '0';
    ghost.style.transform = `translate3d(${rect.left}px, ${rect.top}px, 0) rotate(.7deg)`;
    document.body.append(ghost);
    card.classList.add('is-dragging');
    let frame = null;
    const move = (moveEvent) => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        ghost.style.transform = `translate3d(${moveEvent.clientX - offsetX}px, ${moveEvent.clientY - offsetY}px, 0) rotate(.7deg)`;
        const target = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY)?.closest('.widget:not(.drag-ghost)');
        if (!target || target === card || !this.container.contains(target)) return;
        const targetRect = target.getBoundingClientRect();
        const before = moveEvent.clientY < targetRect.top + targetRect.height / 2 || (Math.abs(moveEvent.clientY - (targetRect.top + targetRect.height / 2)) < targetRect.height / 3 && moveEvent.clientX < targetRect.left + targetRect.width / 2);
        this.animateReorder(() => this.container.insertBefore(card, before ? target : target.nextSibling), card);
      });
    };
    const up = () => {
      if (frame) cancelAnimationFrame(frame);
      ghost.remove(); card.classList.remove('is-dragging');
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); this.syncOrder();
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up, { once: true });
  }

  startResize(event, card) {
    event.preventDefault();
    const startX = event.clientX; const startY = event.clientY;
    const startRect = card.getBoundingClientRect();
    const startSpan = Number.parseInt(getComputedStyle(card).getPropertyValue('--widget-span'), 10) || 6;
    const gridWidth = this.container.getBoundingClientRect().width;
    const columnWidth = gridWidth / 12;
    const widget = this.widgets.find((item) => item.id === card.dataset.widgetId);
    card.classList.add('is-resizing');
    const move = (moveEvent) => {
      const nextSpan = Math.max(4, Math.min(12, Math.round(startSpan + (moveEvent.clientX - startX) / columnWidth)));
      const nextHeight = Math.max(260, Math.round(startRect.height + moveEvent.clientY - startY));
      card.style.setProperty('--widget-span', nextSpan);
      card.style.setProperty('--widget-height', `${nextHeight}px`);
      widget?.onResize?.();
    };
    const up = () => {
      card.classList.remove('is-resizing'); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
      if (widget) {
        widget.span = Number.parseInt(getComputedStyle(card).getPropertyValue('--widget-span'), 10) || 6;
        widget.height = Math.round(card.getBoundingClientRect().height);
        widget.size = widget.span > 6 ? 'large' : 'medium';
      }
      this.save();
      widget?.onResize?.();
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up, { once: true });
  }

  handleKeyDown(event) {
    if (!event.altKey) return;
    const card = event.target.closest('.widget');
    if (!card) return;
    if (event.key === 'ArrowLeft') { event.preventDefault(); card.previousElementSibling?.before(card); this.syncOrder(); this.onToast?.('Виджет перемещён назад'); }
    if (event.key === 'ArrowRight') { event.preventDefault(); card.nextElementSibling?.after(card); this.syncOrder(); this.onToast?.('Виджет перемещён вперёд'); }
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      const widget = this.widgets.find((item) => item.id === card.dataset.widgetId);
      if (!widget) return;
      widget.span = Math.max(4, Math.min(12, widget.span + (event.key === 'ArrowUp' ? 1 : -1)));
      widget.size = widget.span > 6 ? 'large' : 'medium';
      card.style.setProperty('--widget-span', widget.span);
      this.save(); this.onToast?.(event.key === 'ArrowUp' ? 'Виджет расширен' : 'Виджет уменьшен');
    }
  }

  animateReorder(change, draggedCard) {
    const cards = [...this.container.children].filter((item) => item !== draggedCard);
    const before = new Map(cards.map((item) => [item, item.getBoundingClientRect()]));
    change();
    cards.forEach((item) => {
      const first = before.get(item); const last = item.getBoundingClientRect();
      const x = first.left - last.left; const y = first.top - last.top;
      if (!x && !y) return;
      item.animate([{ transform: `translate(${x}px, ${y}px)` }, { transform: 'translate(0, 0)' }], { duration: 220, easing: 'cubic-bezier(.2,.8,.2,1)' });
    });
  }

  syncOrder() { const ids = [...this.container.children].map((item) => item.dataset.widgetId); this.widgets.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id)); this.save(); }
  updateCount() { this.onCountChange?.(this.widgets.length); }
  save() { localStorage.setItem('sutd-dashboard-layout-v6', JSON.stringify(this.widgets.map((widget) => widget.serialize()))); }
  listen(target, event, handler) { target.addEventListener(event, handler); this.listeners.push(() => target.removeEventListener(event, handler)); }
  destroy() { this.listeners.forEach((remove) => remove()); this.widgets.forEach((widget) => widget.destroy()); this.widgets = []; }
}
