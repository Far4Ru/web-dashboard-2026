import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    proxy: {
      '/sutd-api': {
        target: 'https://schedule.sutd.ru',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/sutd-api/, '/api')
      },
      '/geo-api': {
        target: 'https://nominatim.openstreetmap.org',
        changeOrigin: true,
        secure: true,
        headers: { 'User-Agent': 'SUTD-Study-Dashboard/1.0' },
        rewrite: (path) => path.replace(/^\/geo-api/, '')
      },
      '/quotes-source': {
        target: 'https://citaty.info',
        changeOrigin: true,
        secure: true,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36',
          'Accept-Language': 'ru-RU,ru;q=0.9'
        },
        rewrite: (path) => path.replace(/^\/quotes-source/, '')
      }
    }
  }
});
