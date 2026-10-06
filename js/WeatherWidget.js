import UIComponent from './UIComponent.js';

const weatherCodes = {
  0: ['Ясно', '☀'], 1: ['Преимущественно ясно', '🌤'], 2: ['Переменная облачность', '⛅'], 3: ['Пасмурно', '☁'],
  45: ['Туман', '≋'], 48: ['Изморозь', '≋'], 51: ['Морось', '🌦'], 61: ['Дождь', '🌧'], 63: ['Дождь', '🌧'],
  65: ['Сильный дождь', '🌧'], 71: ['Снег', '❄'], 73: ['Снег', '❄'], 80: ['Ливень', '🌦'], 95: ['Гроза', '⛈']
};

export default class WeatherWidget extends UIComponent {
  constructor(config) {
    super({ title: 'Погода', ...config });
    this.type = 'weather';
    this.city = config.state?.city || 'Москва';
    this.data = config.state?.data || null;
  }

  render() {
    const { article, body } = this.createShell('☼', 'amber', 'Open-Meteo · сейчас');
    body.innerHTML = '<form class="weather-search"><input aria-label="Город" maxlength="50"><button type="submit">Найти</button></form><div class="api-state weather-content" role="status"></div>';
    const input = body.querySelector('input'); input.value = this.city;
    this.content = body.querySelector('.weather-content');
    this.listen(body.querySelector('form'), 'submit', (event) => { event.preventDefault(); const city = input.value.trim(); if (city) { this.city = city; this.loadWeather(); } });
    if (this.data) this.showWeather(); else this.loadWeather();
    return article;
  }

  async loadWeather() {
    this.abortController?.abort();
    this.abortController = new AbortController();
    this.content.className = 'api-state weather-content is-loading';
    this.content.textContent = `Загружаем погоду для города ${this.city}…`;
    try {
      const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(this.city)}&count=1&language=ru&format=json`;
      const geoResponse = await fetch(geoUrl, { signal: this.abortController.signal });
      if (!geoResponse.ok) throw new Error(`HTTP ${geoResponse.status}`);
      const geo = await geoResponse.json();
      if (!geo.results?.length) { this.showEmpty(); return; }
      const place = geo.results[0];
      const forecastUrl = `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m&timezone=auto`;
      const forecastResponse = await fetch(forecastUrl, { signal: this.abortController.signal });
      if (!forecastResponse.ok) throw new Error(`HTTP ${forecastResponse.status}`);
      const forecast = await forecastResponse.json();
      if (!forecast.current) throw new Error('Пустой ответ');
      this.city = place.name;
      this.data = { ...forecast.current, country: place.country };
      this.showWeather(); this.onChange?.();
    } catch (error) {
      if (error.name === 'AbortError') return;
      this.content.className = 'api-state weather-content is-error';
      this.content.textContent = 'Погода временно недоступна. Проверьте соединение и повторите поиск.';
    }
  }

  showEmpty() { this.data = null; this.content.className = 'api-state weather-content is-empty'; this.content.textContent = 'Город не найден. Уточните название.'; }

  showWeather() {
    const [label, icon] = weatherCodes[this.data.weather_code] || ['Погода', '◌'];
    this.content.className = 'weather-content';
    this.content.innerHTML = '<div class="weather-main"><span class="weather-symbol"></span><div><strong class="temperature"></strong><p class="weather-label"></p></div></div><div class="weather-details"><span><small>Ощущается</small><strong class="feels"></strong></span><span><small>Влажность</small><strong class="humidity"></strong></span><span><small>Ветер</small><strong class="wind"></strong></span></div><p class="location"></p>';
    this.content.querySelector('.weather-symbol').textContent = icon;
    this.content.querySelector('.temperature').textContent = `${Math.round(this.data.temperature_2m)}°`;
    this.content.querySelector('.weather-label').textContent = label;
    this.content.querySelector('.feels').textContent = `${Math.round(this.data.apparent_temperature)}°`;
    this.content.querySelector('.humidity').textContent = `${this.data.relative_humidity_2m}%`;
    this.content.querySelector('.wind').textContent = `${Math.round(this.data.wind_speed_10m)} км/ч`;
    this.content.querySelector('.location').textContent = `${this.city}, ${this.data.country || ''}`;
  }

  serialize() { return { ...super.serialize(), state: { city: this.city, data: this.data } }; }
}
