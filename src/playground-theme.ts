import { mdiWeatherSunny, mdiWeatherNight } from '@mdi/js';

const themeToggle = document.getElementById('theme-toggle')!;
const mkIcon = (d: string) =>
  `<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" style="flex-shrink:0"><path d="${d}" fill="currentColor"/></svg>`;

function applyTheme(theme: string) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem('theme', theme);
  themeToggle.innerHTML =
    theme === 'dark'
      ? mkIcon(mdiWeatherSunny) + ' Light'
      : mkIcon(mdiWeatherNight) + ' Dark';
}
themeToggle.addEventListener('click', () => {
  applyTheme(
    document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark',
  );
});
applyTheme(document.documentElement.dataset.theme || 'light');
