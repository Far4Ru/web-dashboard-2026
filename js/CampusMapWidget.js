import UIComponent from './UIComponent.js';
import DayControls from './DayControls.js';
import { getLessonsForDate, getScheduleForSelectionWeek, getWeekStart } from './SutdApi.js';
import { filterByTime, getUniversitySnapshot, lessonsForDate } from './UniversityData.js';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const knownLocations = {
  'ул. Большая Морская, д. 18': [59.9362, 30.3124],
  'пр. Вознесенский, д. 46': [59.9270, 30.3090],
  'ул. Садовая, д. 54': [59.9198, 30.3168],
  'ул. Розенштейна, д. 8-12': [59.9072, 30.3016]
};

export default class CampusMapWidget extends UIComponent {
  constructor(config) {
    super({ title: 'Карта занятий', span: 8, height: 480, ...config });
    this.type = 'map'; this.selection = config.state?.selection || { type: 'group', id: 2, label: '1-ГД-13' };
    this.controlState = config.state?.controls || {}; this.map = null; this.lessons = []; this.renderVersion = 0;
  }

  render() {
    const { article, body } = this.createShell('assets/icons/map.svg', 'mint', this.subtitle());
    body.classList.add('map-widget-body');
    body.innerHTML = '<div class="api-state map-content is-loading" role="status">Строим карту занятий…</div>';
    this.content = body.querySelector('.map-content');
    this.controls = new DayControls(this, body, ['my', 'all'], this.controlState, (kind) => kind === 'data' ? this.load() : this.showPlaces());
    if (!this.hidden) this.load(); return article;
  }

  async load() {
    this.abortController?.abort(); this.abortController = new AbortController();
    const signal = this.abortController.signal;
    const { scope, date } = this.controls.state;
    this.clearMap();
    this.content.className = 'api-state map-content is-loading'; this.content.textContent = 'Строим карту занятий…';
    try {
      if (scope === 'my') {
        const payload = await getScheduleForSelectionWeek(this.selection, getWeekStart(date), signal);
        this.lessons = getLessonsForDate(payload, date);
      } else {
        const snapshot = await getUniversitySnapshot(date.slice(0, 7), (loaded, total) => {
          if (!signal.aborted && total) this.content.textContent = `Собираем расписания: ${loaded} из ${total} частей…`;
        });
        if (signal.aborted) return;
        this.lessons = lessonsForDate(snapshot, date);
      }
      if (!signal.aborted) this.showPlaces();
    } catch (error) {
      if (!signal.aborted) { this.content.className = 'api-state map-content is-error'; this.content.textContent = 'Не удалось построить карту.'; }
    }
  }

  clearMap() { this.renderVersion += 1; this.map?.remove(); this.map = null; }

  async showPlaces() {
    if (!this.controls) return;
    this.clearMap();
    const version = this.renderVersion;
    const { date, period, from, to } = this.controls.state;
    const lessons = filterByTime(this.lessons, date, period, from, to);
    const places = [...lessons.reduce((map, lesson) => {
      const key = lesson.building && lesson.building !== '–' && !/дистанц|онлайн/i.test(lesson.building) ? lesson.building : null;
      if (!key) return map;
      const current = map.get(key) || { address: key, count: 0, link: lesson.building_link };
      current.count += 1; map.set(key, current); return map;
    }, new Map()).values()];
    if (!places.length) { this.content.className = 'api-state map-content is-empty'; this.content.textContent = 'На выбранное время занятий нет.'; return; }
    this.content.className = 'api-state map-content is-loading'; this.content.textContent = 'Определяем адреса…';
    try {
      for (const place of places) place.coordinates = await this.getCoordinates(place.address);
      if (version !== this.renderVersion || this.abortController?.signal.aborted) return;
      this.showMap(places.filter((place) => place.coordinates));
    } catch (error) {
      if (version === this.renderVersion && error.name !== 'AbortError') { this.content.className = 'api-state map-content is-error'; this.content.textContent = 'Не удалось определить адреса.'; }
    }
  }

  async getCoordinates(address) {
    if (knownLocations[address]) return knownLocations[address];
    const cacheKey = `sutd-geo:${address}`;
    try { const cached = JSON.parse(localStorage.getItem(cacheKey)); if (cached) return cached; } catch { /* ignore invalid cache */ }
    const cleanAddress = address.replace(/^Корпус [А-ЯA-Z]+\s*[—–-]\s*/u, '');
    const response = await fetch(`/geo-api/search?format=json&limit=1&countrycodes=ru&q=${encodeURIComponent(`${cleanAddress}, Санкт-Петербург`)}`, { signal: this.abortController.signal });
    if (!response.ok) return null;
    const result = await response.json();
    if (!result[0]) return null;
    const coordinates = [Number(result[0].lat), Number(result[0].lon)]; localStorage.setItem(cacheKey, JSON.stringify(coordinates)); return coordinates;
  }

  showMap(places) {
    if (!places.length) { this.content.className = 'api-state map-content is-empty'; this.content.textContent = 'Не удалось определить адреса на карте.'; return; }
    this.content.className = 'map-content'; this.content.replaceChildren();
    const mapElement = document.createElement('div'); mapElement.className = 'leaflet-map'; this.content.append(mapElement);
    this.map = L.map(mapElement, { zoomControl: true, attributionControl: true, scrollWheelZoom: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap', maxZoom: 18 }).addTo(this.map);
    const bounds = [];
    places.forEach((place) => {
      bounds.push(place.coordinates);
      const diameter = 34 + Math.min(place.count, 4) * 3;
      const badge = document.createElement('span'); badge.className = 'map-badge'; badge.textContent = String(place.count);
      const marker = L.marker(place.coordinates, { icon: L.divIcon({ html: badge, className: 'map-marker', iconSize: [diameter, diameter], iconAnchor: [diameter / 2, diameter / 2] }) }).addTo(this.map);
      const popup = document.createElement('div'); const title = document.createElement('strong'); const count = document.createElement('span');
      title.textContent = place.address; count.textContent = `${place.count} ${this.pluralize(place.count, ['пара', 'пары', 'пар'])}`; popup.append(title, document.createElement('br'), count);
      marker.bindPopup(popup);
    });
    if (bounds.length === 1) this.map.setView(bounds[0], 14); else this.map.fitBounds(bounds, { padding: [35, 35] });
    requestAnimationFrame(() => this.map?.invalidateSize());
  }

  pluralize(value, forms) { const mod100 = value % 100; const mod10 = value % 10; return forms[mod100 > 10 && mod100 < 20 ? 2 : mod10 === 1 ? 0 : mod10 > 1 && mod10 < 5 ? 1 : 2]; }
  onResize() { this.map?.invalidateSize({ pan: false, animate: false }); }
  subtitle() { return `Адреса · ${this.selection.type === 'teacher' ? 'преподаватель' : 'группа'} ${this.selection.label}`; }
  setSelection(selection) { this.selection = selection; this.element.querySelector('.widget-heading small').textContent = this.subtitle(); if (!this.hidden && this.controls?.state.scope === 'my') this.load(); }
  serialize() { return { ...super.serialize(), state: { selection: this.selection, controls: this.controls?.state || this.controlState } }; }
  destroy() { this.clearMap(); super.destroy(); }
}
