import type { QueryClient } from '@tanstack/react-query';

export function refreshProjectQueries(client: QueryClient) {
  return Promise.all(['project', 'projects', 'project-control', 'project-portfolio', 'dashboard'].map((key) =>
    client.invalidateQueries({ queryKey: [key] })
  ));
}
