import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { router } from './app/router';
import { FullPageMessage } from './components/FullPageMessage';
import { AuthProvider } from './features/auth/AuthProvider';
import { CompanyProvider } from './features/company/CompanyProvider';
import i18n from './i18n';
import { envError } from './lib/env';
import { queryClient } from './lib/query';
import './index.css';

const root = createRoot(document.getElementById('root')!);

if (envError) {
  root.render(<FullPageMessage>{i18n.t('errors.config')}</FullPageMessage>);
  console.error(envError);
} else {
  root.render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <CompanyProvider>
            <RouterProvider router={router} />
          </CompanyProvider>
        </AuthProvider>
      </QueryClientProvider>
    </StrictMode>,
  );
}
