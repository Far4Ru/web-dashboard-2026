import UIComponent from './UIComponent.js';

export default class FocusWidget extends UIComponent {
  constructor(config) {
    super({ title: 'Время фокуса', ...config });
    this.type = 'focus';
    this.seconds = config.state?.seconds ?? 25 * 60;
    this.running = false;
    this.timer = null;
  }

  render() {
    const { article, body } = this.createShell('◷', 'blue', 'Сессия Pomodoro');
    body.innerHTML = '<div class="focus-timer"><div class="timer-ring"><strong></strong><span>минут</span></div><p>Один важный шаг за раз.</p><div><button class="primary-button timer-toggle" type="button">Начать фокус</button><button class="secondary-button timer-reset" type="button">Сбросить</button></div></div>';
    this.timeLabel = body.querySelector('.timer-ring strong'); this.toggleButton = body.querySelector('.timer-toggle');
    this.listen(this.toggleButton, 'click', () => this.toggle());
    this.listen(body.querySelector('.timer-reset'), 'click', () => this.reset());
    this.updateTime();
    return article;
  }

  toggle() {
    this.running = !this.running; this.toggleButton.textContent = this.running ? 'Пауза' : 'Продолжить';
    if (this.running) this.timer = window.setInterval(() => { this.seconds = Math.max(0, this.seconds - 1); this.updateTime(); if (!this.seconds) this.toggle(); }, 1000);
    else { clearInterval(this.timer); this.timer = null; }
  }

  reset() { clearInterval(this.timer); this.timer = null; this.running = false; this.seconds = 25 * 60; this.toggleButton.textContent = 'Начать фокус'; this.updateTime(); }
  updateTime() { this.timeLabel.textContent = `${String(Math.floor(this.seconds / 60)).padStart(2, '0')}:${String(this.seconds % 60).padStart(2, '0')}`; this.onChange?.(); }
  serialize() { return { ...super.serialize(), state: { seconds: this.seconds } }; }
  destroy() { clearInterval(this.timer); super.destroy(); }
}
