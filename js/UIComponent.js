export default class UIComponent {
  constructor({ id, title, size = 'medium', span, height, onRemove, onChange }) {
    if (new.target === UIComponent) throw new Error('UIComponent — абстрактный класс');
    this.id = id;
    this.title = title;
    this.size = size;
    this.span = span || (size === 'large' ? 12 : 6);
    this.height = height || 320;
    this.onRemove = onRemove;
    this.onChange = onChange;
    this.element = null;
    this.listeners = [];
    this.abortController = null;
  }

  createShell(icon, accent, subtitle = '') {
    const article = document.createElement('article');
    article.className = `widget widget--${this.size}`;
    article.dataset.widgetId = this.id;
    article.style.setProperty('--widget-span', this.span);
    article.style.setProperty('--widget-height', `${this.height}px`);
    article.tabIndex = 0;

    const header = document.createElement('header');
    header.className = 'widget-header drag-handle';
    const iconMarkup = icon.endsWith?.('.svg') ? `<img src="${icon}" alt="">` : icon;
    header.innerHTML = `<div class="widget-heading"><span class="widget-icon ${accent}" aria-hidden="true">${iconMarkup}</span><span><strong></strong><small></small></span></div>`;
    header.querySelector('strong').textContent = this.title;
    header.querySelector('small').textContent = subtitle;

    const controls = document.createElement('div');
    controls.className = 'widget-controls';
    controls.innerHTML = '<button class="widget-action close" type="button" aria-label="Удалить виджет"><span class="close-default">×</span><span class="close-hover">−</span></button>';
    header.append(controls);

    const body = document.createElement('div');
    body.className = 'widget-body';
    const resize = document.createElement('span');
    resize.className = 'resize-handle';
    resize.setAttribute('aria-hidden', 'true');
    article.append(header, body, resize);
    this.element = article;

    this.listen(controls.querySelector('.close'), 'click', () => this.onRemove?.(this.id));
    return { article, body };
  }

  listen(target, event, handler, options) {
    target.addEventListener(event, handler, options);
    this.listeners.push(() => target.removeEventListener(event, handler, options));
  }

  serialize() { return { id: this.id, type: this.type, size: this.size, span: this.span, height: this.height }; }

  destroy() {
    this.abortController?.abort();
    this.listeners.splice(0).forEach((remove) => remove());
    this.element?.remove();
    this.element = null;
  }
}
