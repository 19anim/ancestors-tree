import { useState } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { WakeUpScreen } from '../features/system';
import { routes } from './routes';

export function App() {
  const [router] = useState(() => createBrowserRouter(routes));
  return (
    <>
      <RouterProvider router={router} />
      {/* Beside the router, so a route error never unmounts it (spec §13.1). */}
      <WakeUpScreen />
    </>
  );
}
