import { JSX, useEffect } from 'react';
import { Location, Outlet, useLocation } from 'react-router-dom';
import Providers from './Providers';

export default function App(): JSX.Element {
  const { pathname }: Location = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <Providers>
      <Outlet />
    </Providers>
  );
}
