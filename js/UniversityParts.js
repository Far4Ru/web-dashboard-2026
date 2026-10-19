import { cachedJson } from './DataCache.js';
import { getArchivedPart } from './RequestArchive.js';

const TTL = 6 * 60 * 60 * 1000;
let outageUntil = 0;

async function requestPart(month, part) {
  if (Date.now() < outageUntil) throw new Error('Общий API временно недоступен');
  let error;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(`/api/university?month=${month}&part=${part}`, { headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error(`Часть ${part}: HTTP ${response.status}`);
      return await response.json();
    } catch (caught) {
      error = caught;
      if (attempt < 4) await new Promise((resolve) => setTimeout(resolve, 750 * 2 ** attempt));
    }
  }
  outageUntil = Date.now() + 5 * 60 * 1000;
  throw error;
}

export const readUniversityPart = (month, part) => cachedJson(
  `university:${month}:${part}`,
  () => requestPart(month, part),
  TTL,
  async () => ({ ...await getArchivedPart(part), __archived: true })
);

export async function loadUniversitySnapshot(month, onProgress = () => {}) {
  const first = await readUniversityPart(month, 0);
  const parts = new Array(first.totalParts); parts[0] = first;
  let loaded = 1; onProgress(loaded, first.totalParts);
  let next = 1;
  await Promise.all(Array.from({ length: Math.min(2, first.totalParts - 1) }, async () => {
    while (next < first.totalParts) {
      const part = next++;
      parts[part] = await readUniversityPart(month, part);
      loaded += 1; onProgress(loaded, first.totalParts);
    }
  }));
  return {
    month,
    groups: parts.flatMap((part) => part.groups),
    generatedAt: first.generatedAt,
    archivedParts: parts.filter((part) => part.__archived).length
  };
}
