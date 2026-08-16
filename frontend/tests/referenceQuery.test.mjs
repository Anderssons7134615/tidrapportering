import assert from 'node:assert/strict';
import test from 'node:test';
import { QueryClient, QueryObserver } from '@tanstack/query-core';
import { referenceQueryCache } from '../src/utils/referenceQuery.ts';

function waitForFreshProject(observer) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      unsubscribe();
      reject(new Error('Projektlistan uppdaterades inte'));
    }, 1000);
    const unsubscribe = observer.subscribe((result) => {
      if (result.data?.some((project) => project.id === 'new')) {
        clearTimeout(timeout);
        unsubscribe();
        resolve(result.data);
      }
    });
  });
}

test('cached reference data is shown while a fresh project list is fetched immediately', async () => {
  const cachedProjects = [{ id: 'old', name: 'Gammalt projekt' }];
  const freshProjects = [...cachedProjects, { id: 'new', name: 'Nytt projekt' }];
  let fetchCount = 0;

  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: 5 * 60 * 1000, retry: false } },
  });
  const observer = new QueryObserver(client, {
    queryKey: ['projects', 'active', 'employee'],
    queryFn: async () => {
      fetchCount += 1;
      return freshProjects;
    },
    ...referenceQueryCache(() => cachedProjects),
  });

  const freshResult = waitForFreshProject(observer);

  assert.deepEqual(observer.getCurrentResult().data, cachedProjects);
  const result = await freshResult;

  assert.equal(fetchCount, 1);
  assert.deepEqual(result, freshProjects);
});

test('a fresh in-memory project cache is still refreshed when the form is reopened', async () => {
  const cachedProjects = [{ id: 'old', name: 'Gammalt projekt' }];
  const freshProjects = [...cachedProjects, { id: 'new', name: 'Nytt projekt' }];
  let fetchCount = 0;
  const queryKey = ['projects', 'active', 'employee'];
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: 5 * 60 * 1000, retry: false } },
  });
  client.setQueryData(queryKey, cachedProjects);

  const observer = new QueryObserver(client, {
    queryKey,
    queryFn: async () => {
      fetchCount += 1;
      return freshProjects;
    },
    ...referenceQueryCache(() => cachedProjects),
  });

  const result = await waitForFreshProject(observer);

  assert.equal(fetchCount, 1);
  assert.deepEqual(result, freshProjects);
});

test('cached projects remain selectable when the refresh fails', async () => {
  const cachedProjects = [{ id: 'old', name: 'Sparat projekt' }];
  let fetchCount = 0;
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: 5 * 60 * 1000, retry: false } },
  });
  const observer = new QueryObserver(client, {
    queryKey: ['projects', 'active', 'employee'],
    queryFn: async () => {
      fetchCount += 1;
      throw new Error('Nätfel');
    },
    ...referenceQueryCache(() => cachedProjects),
  });

  const failedResult = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      unsubscribe();
      reject(new Error('Projektlistans felstatus kom inte'));
    }, 1000);
    const unsubscribe = observer.subscribe((result) => {
      if (result.isError) {
        clearTimeout(timeout);
        unsubscribe();
        resolve(result);
      }
    });
  });

  assert.equal(fetchCount, 1);
  assert.deepEqual(failedResult.data, cachedProjects);
});
