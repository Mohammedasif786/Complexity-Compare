import { useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { CssBaseline, ThemeProvider, createTheme, useMediaQuery } from '@mui/material';
import App from './App';

function Root() {
  const dark = useMediaQuery('(prefers-color-scheme: dark)');
  const theme = useMemo(
    () =>
      createTheme({
        palette: { mode: dark ? 'dark' : 'light', primary: { main: '#0f766e' }, secondary: { main: '#b45309' } },
        shape: { borderRadius: 8 },
        typography: { fontFamily: 'system-ui, "Segoe UI", Roboto, sans-serif' },
      }),
    [dark],
  );
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <App />
    </ThemeProvider>
  );
}

createRoot(document.getElementById('root')!).render(<Root />);
