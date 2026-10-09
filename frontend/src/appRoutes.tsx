import type { ReactNode } from 'react';
import type { RouteObject } from 'react-router-dom';
import { AppRouteError } from './components/AppErrorBoundary';

export function appRoutes(app: ReactNode): RouteObject[] {
  return [{ path: '*', element: app, errorElement: <AppRouteError /> }];
}
