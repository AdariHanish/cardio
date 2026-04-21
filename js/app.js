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

// API Base URL
// - On local dev (localhost/127.0.0.1): Use port 5000
// - On Production (Vercel): Use relative paths ('')
const API_BASE = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  ? 'http://localhost:5000'
  : '';

// Block non-numeric characters in input fields
function blockNonNumeric(event, allowDecimal = false) {
  // Common allowed keys: Backspace, Tab, Enter, Escape, Delete
  const allowedKeys = ['Backspace', 'Tab', 'Enter', 'Escape', 'Delete', 'ArrowLeft', 'ArrowRight', 'Home', 'End'];
  if (allowedKeys.includes(event.key) || (event.ctrlKey && ['a', 'c', 'v', 'x'].includes(event.key.toLowerCase()))) {
    return;
  }
  
  if (allowDecimal && event.key === '.') {
    // Only allow one decimal point
    if (event.target.value.includes('.')) {
      event.preventDefault();
    }
    return;
  }

  // Block any non-digit character
  if (!/^[0-9]$/.test(event.key)) {
    event.preventDefault();
  }
}

// Show alert message
function showAlert(containerId, type, message) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const icons = { success: '✅', error: '❌', info: 'ℹ️' };
  container.innerHTML = `
    <div class="alert alert-${type}">
      ${icons[type] || ''}
      <span>${message}</span>
    </div>
  `;

  // Auto-clear after 5 seconds
  setTimeout(() => {
    if (container) container.innerHTML = '';
  }, 5000);
}

// Get risk color based on percentage
function getRiskColor(pct) {
  if (pct > 70) return 'var(--red)';
  if (pct > 40) return 'var(--orange)';
  if (pct > 20) return '#ffeb3b';
  return 'var(--green)';
}

// Get stage from percentage
function getStage(pct) {
  if (pct > 70) return 'Stage 4';
  if (pct > 60) return 'Stage 3';
  if (pct > 30) return 'Stage 2';
  return 'Stage 1';
}

// Get progress bar class
function getProgressClass(pct) {
  if (pct > 70) return 'progress-critical';
  if (pct > 50) return 'progress-high';
  if (pct > 25) return 'progress-medium';
  return 'progress-low';
}

// Format timestamp
function formatTimestamp(ts) {
  if (!ts) return '—';
  try {
    return new Date(ts).toLocaleString('en-IN', {
      day   : '2-digit',
      month : 'short',
      year  : 'numeric',
      hour  : '2-digit',
      minute: '2-digit'
    });
  } catch(e) { return ts; }
}

// Fetch with timeout
async function fetchWithTimeout(url, options={}, timeout=8000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(id);
    return response;
  } catch(e) {
    clearTimeout(id);
    throw e;
  }
}

// Admin auth check
function checkAdminAuth() {
  const token = sessionStorage.getItem('adminToken');
  if (!token) {
    window.location.href = 'admin.html';
    return false;
  }
  const user = sessionStorage.getItem('adminUser');
  const disp = document.getElementById('adminUserDisp');
  if (disp) disp.textContent = user || 'Admin';
  return true;
}

function adminLogout() {
  sessionStorage.removeItem('adminToken');
  sessionStorage.removeItem('adminUser');
  window.location.href = 'admin.html';
}