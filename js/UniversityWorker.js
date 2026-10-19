import { pruneCache } from './DataCache.js';
import { loadUniversitySnapshot } from './UniversityParts.js';

const tasks = new Map();
pruneCache();

function ensure(month) {
  if (!tasks.has(month)) {
    const task = { loaded: 0, total: 0 };
    task.promise = loadUniversitySnapshot(month, (loaded, total) => {
      task.loaded = loaded; task.total = total;
      self.postMessage({ type: 'progress', month, loaded, total });
    });
    task.promise.catch(() => { tasks.delete(month); });
    tasks.set(month, task);
  }
  return tasks.get(month);
}

self.addEventListener('message', ({ data }) => {
  if (!data || !['load', 'warm'].includes(data.type)) return;
  const task = ensure(data.month);
  if (data.type === 'warm') return;
  self.postMessage({ type: 'progress', month: data.month, loaded: task.loaded, total: task.total });
  task.promise.then(
    (snapshot) => self.postMessage({ type: 'result', month: data.month, snapshot }),
    (error) => self.postMessage({ type: 'error', month: data.month, message: error.message })
  );
});
