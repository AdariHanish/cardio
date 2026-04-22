// =============================================================
// Vercel Analytics Initialization
// =============================================================
(function() {
  window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };
  var script = document.createElement('script');
  script.src = '/_vercel/insights/script.js';
  script.defer = true;
  document.head.appendChild(script);
})();

// =============================================================
// CardioCare AI — Global Utilities
// =============================================================

const API_BASE = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  ? 'http://localhost:5000'
  : '';

// ── CENTRALIZED API HANDLER ──────────────────────────────────
/**
 * Robust fetch wrapper with timeout and error handling.
 */
const api = {
  async request(endpoint, options = {}, timeout = 10000) {
    const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint}`;
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);

    const defaultHeaders = {
      'Content-Type': 'application/json',
      'X-Admin-Token': sessionStorage.getItem('adminToken') || ''
    };

    try {
      const response = await fetch(url, {
        ...options,
        headers: { ...defaultHeaders, ...options.headers },
        signal: controller.signal
      });

      clearTimeout(id);

      if (response.status === 401) {
        console.warn('[API] Unauthorized access - redirecting to login');
        sessionStorage.clear();
        if (!window.location.href.includes('admin.html')) {
          window.location.href = 'admin.html';
        }
        return { success: false, message: 'Session expired' };
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return { 
          success: false, 
          message: errorData.message || `Error ${response.status}: ${response.statusText}`,
          status: response.status 
        };
      }

      return await response.json();
    } catch (error) {
      clearTimeout(id);
      if (error.name === 'AbortError') {
        return { success: false, message: 'Request timed out. Please check your connection.' };
      }
      console.error(`[API] ${options.method || 'GET'} ${endpoint} failed:`, error);
      return { success: false, message: 'Connection failed. Is the server running?' };
    }
  },

  get(endpoint, options = {}) {
    return this.request(endpoint, { ...options, method: 'GET' });
  },

  post(endpoint, body, options = {}) {
    return this.request(endpoint, { ...options, method: 'POST', body: JSON.stringify(body) });
  },

  delete(endpoint, options = {}) {
    return this.request(endpoint, { ...options, method: 'DELETE' });
  }
};

// ── UTILITIES ────────────────────────────────────────────────

function blockNonNumeric(event, allowDecimal = false) {
  const allowedKeys = ['Backspace', 'Tab', 'Enter', 'Escape', 'Delete', 'ArrowLeft', 'ArrowRight', 'Home', 'End'];
  if (allowedKeys.includes(event.key) || (event.ctrlKey && ['a', 'c', 'v', 'x'].includes(event.key.toLowerCase()))) {
    return;
  }
  if (allowDecimal && event.key === '.') {
    if (event.target.value.includes('.')) event.preventDefault();
    return;
  }
  if (!/^[0-9]$/.test(event.key)) event.preventDefault();
}

function showAlert(containerId, type, message) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const icons = { success: '✅', error: '❌', info: 'ℹ️' };
  container.innerHTML = `<div class="alert alert-${type}">${icons[type] || ''} <span>${message}</span></div>`;
  setTimeout(() => { if (container) container.innerHTML = ''; }, 5000);
}

function getRiskColor(pct) {
  if (pct > 70) return 'var(--red)';
  if (pct > 40) return 'var(--orange)';
  if (pct > 20) return '#ffeb3b';
  return 'var(--green)';
}

function formatTimestamp(ts) {
  if (!ts) return '—';
  try {
    return new Date(ts).toLocaleString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  } catch(e) { return ts; }
}

function checkAdminAuth() {
  const token = sessionStorage.getItem('adminToken');
  if (!token) {
    if (!window.location.href.includes('admin.html')) window.location.href = 'admin.html';
    return false;
  }
  const user = sessionStorage.getItem('adminUser');
  const disp = document.getElementById('adminUserDisp');
  if (disp) disp.textContent = user || 'Admin';
  return true;
}

function adminLogout() {
  sessionStorage.clear();
  window.location.href = 'admin.html';
}

function setEl(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

// ── GLOBAL SEARCH & MOBILE NAV ───────────────────────────

function toggleMobileMenu() {
  const menu = document.getElementById('navbarMenu');
  if (menu) menu.classList.toggle('show');
}

/**
 * Global Search execution from navbar
 */
async function executeGlobalSearch() {
  const input = document.getElementById('globalSearchInput');
  if (!input) return;
  const query = input.value.trim();
  if (!query) return;

  // If on admin page, we might want to trigger specific list refreshes
  if (window.location.pathname.includes('admin_dashboard.html')) {
    const adminSearch = document.getElementById('adminSearchInput');
    if (adminSearch) {
      adminSearch.value = query;
      if (typeof executeSearch === 'function') executeSearch('patients');
    }
    return;
  }

  // Otherwise, redirect to history page with the query
  window.location.href = `history.html?q=${encodeURIComponent(query)}`;
}

// Auto-close mobile menu on link click
document.addEventListener('click', (e) => {
  const menu = document.getElementById('navbarMenu');
  const toggle = document.getElementById('mobileToggle');
  if (menu && menu.classList.contains('show')) {
    if (!menu.contains(e.target) && !toggle.contains(e.target)) {
      menu.classList.remove('show');
    }
  }
});

// Handle incoming search query from URL (for History page)
window.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    const q = params.get('q');
    if (q && window.location.pathname.includes('history.html')) {
        const inp = document.getElementById('pidInput');
        if (inp) {
            inp.value = q;
            // The searchPatient function exists in history.html's scope
            if (typeof searchPatient === 'function') setTimeout(searchPatient, 100);
        }
    }
});