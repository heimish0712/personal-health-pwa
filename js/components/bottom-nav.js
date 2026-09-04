const ITEMS = [
  { route: '/home', label: '홈', icon: '⌂' },
  { route: '/calendar', label: '캘린더', icon: '▦' },
  { route: '/exercise', label: '운동', icon: '◉' },
  { route: '/diet', label: '식단', icon: '◫' },
  { route: '/weight', label: '체중', icon: '◇' }
];

export function renderBottomNav(container, currentRoute) {
  container.innerHTML = ITEMS.map((item) => `
    <a class="nav-item ${currentRoute === item.route ? 'active' : ''}"
       href="#${item.route}"
       ${currentRoute === item.route ? 'aria-current="page"' : ''}>
      <span class="nav-icon" aria-hidden="true">${item.icon}</span>
      <span>${item.label}</span>
    </a>
  `).join('');
}
