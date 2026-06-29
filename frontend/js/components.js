/**
 * Component Loader
 * Handles dynamic fetching and injection of HTML components (Sidebar, Topbar, etc.)
 */

const PAGE_TITLES = {
  'index': 'لوحة التحكم',
  'categories': 'الأقسام',
  'suppliers': 'الموردين',
  'products': 'المنتجات',
  'customers': 'العملاء',
  'orders': 'الطلبات (نقطة البيع)',
  'sales': 'سجل المبيعات',
  'installments': 'إدارة الأقساط',
  'backup': 'النسخ الاحتياطي والاستعادة'
};

async function loadComponent(selector, path) {
  try {
    const response = await fetch(path);
    if (!response.ok) throw new Error(`Failed to load ${path}`);
    const html = await response.text();
    const container = document.querySelector(selector);
    if (container) {
      container.innerHTML = html;
    }
  } catch (err) {
    console.error('Error loading component:', err);
  }
}

function highlightActiveLink() {
  const current = location.pathname.split('/').pop().replace('.html', '') || 'index';
  const activeLink = document.querySelector(`.sidebar-nav a[data-page="${current}"]`);
  
  if (activeLink) {
    activeLink.classList.add('active');
  }
  
  // Set page title in topbar
  const pageTitleElement = document.getElementById('page-title');
  if (pageTitleElement) {
    const title = PAGE_TITLES[current] || 'FarahStore';
    pageTitleElement.textContent = `الرئيسية / ${title}`;
    document.title = `${title} | FarahStore`;
  }
}

window.loadLayout = async function() {
  await loadComponent('#sidebar-container', 'components/sidebar.html');
  await loadComponent('#topbar-container', 'components/topbar.html');
  
  highlightActiveLink();
  
  // Custom event to notify page scripts that DOM is ready
  document.dispatchEvent(new Event('LayoutLoaded'));
};
