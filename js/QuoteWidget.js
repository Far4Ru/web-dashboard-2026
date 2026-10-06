import UIComponent from './UIComponent.js';

export default class QuoteWidget extends UIComponent {
  constructor(config) {
    super({ title: 'Мысль дня', ...config });
    this.type = 'quote';
    this.quote = config.state?.quote || null;
  }

  render() {
    const { article, body } = this.createShell('assets/icons/quote.svg', 'violet', 'Немного вдохновения');
    body.innerHTML = '<div class="api-state quote-content" role="status"></div><button class="refresh-button" type="button"><span>↻</span> Новая цитата</button>';
    this.content = body.querySelector('.quote-content');
    this.listen(body.querySelector('.refresh-button'), 'click', () => this.loadQuote());
    if (this.quote) this.showQuote(); else this.loadQuote();
    return article;
  }

  async loadQuote() {
    this.abortController?.abort();
    this.abortController = new AbortController();
    this.content.className = 'api-state quote-content is-loading';
    this.content.textContent = 'Ищем подходящую мысль…';
    try {
      const response = await fetch('https://dummyjson.com/quotes/random', { signal: this.abortController.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (!data.quote) throw new Error('Пустой ответ');
      this.quote = { text: data.quote, author: data.author || 'Неизвестный автор' };
      this.showQuote(); this.onChange?.();
    } catch (error) {
      if (error.name === 'AbortError') return;
      this.content.className = 'api-state quote-content is-error';
      this.content.textContent = 'Не удалось получить цитату. Попробуйте ещё раз.';
    }
  }

  showQuote() {
    this.content.className = 'quote-content';
    this.content.replaceChildren();
    const text = document.createElement('blockquote'); text.textContent = `“${this.quote.text}”`;
    const author = document.createElement('cite'); author.textContent = `— ${this.quote.author}`;
    this.content.append(text, author);
  }

  serialize() { return { ...super.serialize(), state: { quote: this.quote } }; }
}
