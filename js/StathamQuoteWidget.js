import UIComponent from './UIComponent.js';

const SOURCE_URL = 'https://citaty.info/selection/citaty-stethema';

export default class StathamQuoteWidget extends UIComponent {
  constructor(config) {
    super({ title: 'Цитаты Стэтхема', span: 12, height: 270, ...config });
    this.type = 'statham'; this.quotes = []; this.queue = []; this.currentQuote = ''; this.changeTimer = null;
  }

  render() {
    const { article, body } = this.createShell('assets/icons/quote.svg', 'violet', 'Нажмите, чтобы сменить цитату');
    article.classList.add('statham-widget');
    body.innerHTML = '<button class="statham-quote api-state is-loading" type="button" aria-label="Показать следующую цитату">Загружаем цитаты…</button><a class="quote-source" href="https://citaty.info/selection/citaty-stethema" target="_blank" rel="noreferrer">Источник: citaty.info ↗</a>';
    this.content = body.querySelector('.statham-quote');
    this.listen(this.content, 'click', () => this.nextQuote());
    this.loadQuotes(); return article;
  }

  async loadQuotes() {
    this.abortController?.abort(); this.abortController = new AbortController();
    this.content.disabled = true; this.content.className = 'statham-quote api-state is-loading'; this.content.textContent = 'Загружаем цитаты…';
    try {
      const html = await this.fetchSource();
      this.quotes = this.extractQuotes(html);
      if (!this.quotes.length) throw new Error('Цитаты не найдены в разметке страницы');
      this.refillQueue(); this.content.disabled = false; this.nextQuote(false);
    } catch (error) {
      if (error.name === 'AbortError' && this.abortController.signal.aborted) return;
      this.content.className = 'statham-quote api-state is-error';
      this.content.textContent = 'Не удалось загрузить цитаты. Нажмите, чтобы повторить.';
      this.content.disabled = false;
    }
  }

  async fetchSource() {
    const sourcePath = '/quotes-source/selection/citaty-stethema';
    const fallbackUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(SOURCE_URL)}`;
    let lastError;
    for (const url of [sourcePath, fallbackUrl]) {
      const attemptController = new AbortController();
      const abortAttempt = () => attemptController.abort();
      const timeout = window.setTimeout(abortAttempt, 9000);
      this.abortController.signal.addEventListener('abort', abortAttempt, { once: true });
      try {
        const response = await fetch(url, { signal: attemptController.signal, headers: { Accept: 'text/html' } });
        if (!response.ok) throw new Error(`Источник вернул HTTP ${response.status}`);
        return await response.text();
      } catch (error) {
        if (this.abortController.signal.aborted) throw error;
        lastError = error;
      } finally {
        clearTimeout(timeout);
        this.abortController.signal.removeEventListener('abort', abortAttempt);
      }
    }
    throw lastError;
  }

  extractQuotes(html) {
    const documentNode = new DOMParser().parseFromString(html, 'text/html');
    const selectors = [
      '.node-citaty .field-name-body .field-item',
      '.node--type-citaty .field--name-body',
      '.view-content .views-row blockquote',
      '.view-content .views-row .field-name-body',
      'article blockquote',
      'main blockquote'
    ];
    let nodes = [];
    for (const selector of selectors) {
      nodes = [...documentNode.querySelectorAll(selector)];
      if (nodes.length > 1) break;
    }
    const ignored = /^(джейсон стэтхэм|цитаты|поделиться|добавить комментарий|читать дальше)$/i;
    return [...new Set(nodes
      .map((node) => node.textContent.replace(/\s+/g, ' ').trim().replace(/^[«“"]|[»”"]$/g, ''))
      .filter((text) => text.length >= 12 && text.length <= 600 && !ignored.test(text))
    )];
  }

  refillQueue() {
    this.queue = [...this.quotes];
    for (let index = this.queue.length - 1; index > 0; index -= 1) {
      const randomIndex = Math.floor(Math.random() * (index + 1));
      [this.queue[index], this.queue[randomIndex]] = [this.queue[randomIndex], this.queue[index]];
    }
    if (this.queue.at(-1) === this.currentQuote && this.queue.length > 1) [this.queue[0], this.queue[this.queue.length - 1]] = [this.queue.at(-1), this.queue[0]];
  }

  nextQuote(animate = true) {
    if (!this.quotes.length) { this.loadQuotes(); return; }
    if (!this.queue.length) this.refillQueue();
    const change = () => {
      this.currentQuote = this.queue.pop();
      this.content.className = 'statham-quote';
      this.content.textContent = `«${this.currentQuote}»`;
      requestAnimationFrame(() => this.content.classList.remove('is-changing'));
    };
    clearTimeout(this.changeTimer);
    if (!animate) { change(); return; }
    this.content.classList.add('is-changing');
    this.changeTimer = window.setTimeout(change, 230);
  }

  destroy() { clearTimeout(this.changeTimer); super.destroy(); }
}
