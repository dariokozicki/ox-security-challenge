import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from './App';
import './index.css';

const client = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 1000 } } });
const root = document.getElementById('root');
if (!root) throw new Error('Application root is missing.');
createRoot(root).render(
  <QueryClientProvider client={client}>
    <App />
  </QueryClientProvider>,
);
