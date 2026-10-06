import UIComponent from './UIComponent.js';
import { getScheduleForSelection, getTodayLessons } from './SutdApi.js';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const knownLocations = {
  'ул. Большая Морская, д. 18': [59.9362, 30.3124],
  'пр. Вознесенский, д. 46': [59.9270, 30.3090],
  'ул. Садовая, д. 54': [59.9198, 30.3168],
  'ул. Розенштейна, д. 8-12': [59.9072, 30.3016],
  'Дистанционное обучение': [59.9311, 30.3159]
};

export default class CampusMapWidget extends UIComponent {
  constructor(config) {
    super({ title: 'Карта занятий', span: 8, height: 360, ...config });
    this.type = 'map'; this.selection = config.state?.selection || { type: 'group', id: 2, label: '1-ГД-13' }; this.map = null;
  }

  render() {
    const { article, body } = this.createShell('assets/icons/map.svg', 'mint', this.subtitle());
    body.classList.add('map-widget-body');
    body.innerHTML = '<div class="api-state map-content is-loading" role="status">Строим карту занятий…</div>';
    this.content = body.querySelector('.map-content'); this.load(); return article;
  }

  async load() {
    this.abortController?.abort(); this.abortController = new AbortController(); this.map?.remove(); this.map = null;
    this.content.className = 'api-state map-content is-loading'; this.content.textContent = 'Строим карту занятий…';
    try {
      const payload = await getScheduleForSelection(this.selection, this.abortController.signal);
      const lessons = getTodayLessons(payload);
      const places = [...lessons.reduce((map, lesson) => {
        const key = lesson.building || 'Адрес не указан';
        const current = map.get(key) || { address: key, count: 0, link: lesson.building_link };
        current.count += 1; map.set(key, current); return map;
      }, new Map()).values()];
      if (!places.length) { this.content.className = 'api-state map-content is-empty'; this.content.textContent = 'Сегодня адресов занятий нет.'; return; }
      for (const place of places) place.coordinates = await this.getCoordinates(place.address);
      this.showMap(places.filter((place) => place.coordinates));
    } catch (error) {
      if (error.name !== 'AbortError') { this.content.className = 'api-state map-content is-error'; this.content.textContent = 'Не удалось построить карту.'; }
    }
  }

  async getCoordinates(address) {
    if (knownLocations[address]) return knownLocations[address];
    const cacheKey = `sutd-geo:${address}`;
    try { const cached = JSON.parse(localStorage.getItem(cacheKey)); if (cached) return cached; } catch { /* ignore invalid cache */ }
    const response = await fetch(`/geo-api/search?format=json&limit=1&countrycodes=ru&q=${encodeURIComponent(`${address}, Санкт-Петербург`)}`, { signal: this.abortController.signal });
    if (!response.ok) return null;
    const result = await response.json();
    if (!result[0]) return null;
    const coordinates = [Number(result[0].lat), Number(result[0].lon)]; localStorage.setItem(cacheKey, JSON.stringify(coordinates)); return coordinates;
  }

  showMap(places) {
    if (!places.length) { this.content.className = 'api-state map-content is-empty'; this.content.textContent = 'Не удалось определить адреса на карте.'; return; }
    this.content.className = 'map-content'; this.content.replaceChildren();
    const mapElement = document.createElement('div'); mapElement.className = 'leaflet-map'; this.content.append(mapElement);
    this.map = L.map(mapElement, { zoomControl: false, attributionControl: true, scrollWheelZoom: false });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap', maxZoom: 18 }).addTo(this.map);
    const bounds = [];
    places.forEach((place) => {
      bounds.push(place.coordinates);
      const marker = L.circleMarker(place.coordinates, { radius: 16 + Math.min(place.count, 4) * 2, color: '#fff', weight: 3, fillColor: '#4b86c5', fillOpacity: .95 }).addTo(this.map);
      const popup = document.createElement('div'); const title = document.createElement('strong'); const count = document.createElement('span');
      title.textContent = place.address; count.textContent = `${place.count} ${this.pluralize(place.count, ['пара', 'пары', 'пар'])} сегодня`; popup.append(title, document.createElement('br'), count);
      marker.bindTooltip(String(place.count), { permanent: true, direction: 'center', className: 'map-count' }); marker.bindPopup(popup);
    });
    if (bounds.length === 1) this.map.setView(bounds[0], 14); else this.map.fitBounds(bounds, { padding: [35, 35] });
    requestAnimationFrame(() => this.map?.invalidateSize());
  }

  pluralize(value, forms) { const mod100 = value % 100; const mod10 = value % 10; return forms[mod100 > 10 && mod100 < 20 ? 2 : mod10 === 1 ? 0 : mod10 > 1 && mod10 < 5 ? 1 : 2]; }
  onResize() { this.map?.invalidateSize({ pan: false, animate: false }); }
  subtitle() { return `Адреса · ${this.selection.type === 'teacher' ? 'преподаватель' : 'группа'} ${this.selection.label}`; }
  setSelection(selection) { this.selection = selection; this.element.querySelector('.widget-heading small').textContent = this.subtitle(); this.load(); }
  serialize() { return { ...super.serialize(), state: { selection: this.selection } }; }
  destroy() { this.map?.remove(); this.map = null; super.destroy(); }
}
