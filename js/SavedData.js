import { clearCacheGroup, getCacheUsage } from './DataCache.js';

const localGroups = {
  profile: ['sutd-user-name', 'sutd-selected-entity'],
  layout: ['sutd-dashboard-layout-v6', 'sutd-stats-expanded-v2', 'sutd-day-controls-expanded-v1']
};

function matchingLocalKeys(group) {
  const keys = Object.keys(localStorage);
  if (group === 'geo') return keys.filter((key) => key.startsWith('sutd-geo:'));
  return keys.filter((key) => localGroups[group]?.includes(key));
}

function localUsage(group) {
  const keys = matchingLocalKeys(group);
  return {
    count: keys.length,
    bytes: keys.reduce((size, key) => size + new TextEncoder().encode(key + (localStorage.getItem(key) || '')).length, 0)
  };
}

export async function getSavedDataUsage() {
  const cached = await getCacheUsage();
  return { ...cached, profile: localUsage('profile'), layout: localUsage('layout'), geo: localUsage('geo') };
}

export async function clearSavedData(group) {
  if (['university', 'catalogs', 'schedules'].includes(group)) await clearCacheGroup(group);
  else matchingLocalKeys(group).forEach((key) => localStorage.removeItem(key));
}
