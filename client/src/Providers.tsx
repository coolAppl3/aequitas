import { JSX, ReactNode } from 'react';

type ProvidersProps = {
  children: ReactNode;
};

export default function Providers({ children }: ProvidersProps): JSX.Element {
  return <>{children}</>;
}
