import { lazy } from 'react';
import type { RouteObject } from 'react-router';
import { HomePage } from '../features/home';
import { AppShell } from './AppShell';
import { NotFoundPage } from './NotFoundPage';
import { RouteError } from './RouteError';

// Only the gallery's own code is a separate chunk that home-page visitors never download.
// Shared components it uses (such as Dialog and TextField) stay in the main bundle.
const DesignGalleryPage = lazy(() =>
  import('../features/design-gallery').then((module) => ({ default: module.DesignGalleryPage })),
);

/** Shared by the browser router (App) and memory routers in tests (renderRoute). */
export const routes: RouteObject[] = [
  {
    path: '/',
    element: <AppShell />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'design', element: <DesignGalleryPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];
