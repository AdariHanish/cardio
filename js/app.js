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

function goHomeAndLogout(e) {
    if (e) e.preventDefault();
    sessionStorage.clear();
    window.location.replace('index.html');
}

// =============================================================
// CLINICAL HELPERS (SHARED ACROSS PAGES)
// =============================================================

function getRiskColor(v) {
  if (v > 70) return 'var(--red)';
  if (v > 40) return 'var(--orange)';
  return 'var(--green)';
}

function getStage(v) {
  if (v > 70) return 'Stage 4';
  if (v > 60) return 'Stage 3';
  if (v > 30) return 'Stage 2';
  return 'Stage 1';
}

function getStageClass(v) {
  if (v > 70) return 'stage-critical';
  if (v > 40) return 'stage-high';
  if (v > 20) return 'stage-medium';
  return 'stage-low';
}

function getRiskIcon(v) {
  if (v > 70) return '⚠️';
  if (v > 40) return '🟡';
  return '✅';
}

function showStageInfo(stageStr, diseaseName) {
  // Prevent duplicate modals
  if (document.getElementById('stageInfoModal')) return;

  const getDetails = (stage) => {
    switch (stage.toLowerCase()) {
      case 'stage 1':
        return {
          title: 'Normal / Low Risk',
          color: 'var(--green)',
          desc: 'Your risk level is low and within healthy bounds.',
          precautions: [
            'Maintain a balanced, nutritious diet',
            'Continue regular physical exercise (30 mins/day)',
            'Monitor blood pressure occasionally',
            'Get quality sleep and manage stress well'
          ]
        };
      case 'stage 2':
        return {
          title: 'Moderate Risk',
          color: '+var(--orange)',
          desc: 'Some indicators are elevated. Early intervention can reverse this.',
          precautions: [
            'Reduce dietary sodium, sugar, and processed foods',
            'Increase cardiovascular workouts',
            'Consult a doctor for a routine cardiovascular checkup',
            'Consider logging vitals weekly'
          ]
        };
      case 'stage 3':
        return {
          title: 'High Risk',
          color: 'var(--red)',
          desc: 'Significant clinical warning signs are present.',
          precautions: [
            'Schedule a specialist appointment immediately',
            'Strictly adhere to any prescribed medications',
            'Eliminate smoking and alcohol consumption',
            'Monitor vitals daily (BP, SpO2, Heart Rate)'
          ]
        };
      case 'stage 4':
        return {
          title: 'Critical Risk',
          color: 'var(--red)',
          desc: 'Immediate, potentially life-threatening danger.',
          precautions: [
            'Seek emergency medical intervention if symptoms appear',
            'Do NOT ignore chest pain, numbness, or severe dizziness',
            'Follow strict medical supervision protocols',
            'Complete bed rest or highly restricted physical activity as advised'
          ]
        };
      default:
        return {
          title: 'Unknown Stage',
          color: 'var(--cyan)',
          desc: 'No detailed clinical data available.',
          precautions: ['Consult your healthcare provider.']
        };
    }
  };

  const info = getDetails(stageStr);
  const isHighRisk = stageStr.includes('3') || stageStr.includes('4');
  const actualColor = info.color.replace('+', '');

  const modalHtml = `
    <div id="stageInfoModal" style="position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(0,0,0,0.6); backdrop-filter:blur(6px); z-index:99999; display:flex; align-items:center; justify-content:center; animation: fadeIn .2s ease;">
      <div style="background:#0a192f; border:1px solid ${actualColor}55; border-radius:16px; padding:30px; max-width:450px; width:90%; position:relative; box-shadow:0 15px 40px rgba(0,0,0,0.5); animation: slideUp .3s ease;">
        <button onclick="document.getElementById('stageInfoModal').remove()" style="position:absolute; top:20px; right:20px; background:transparent; border:none; color:var(--text-secondary); cursor:pointer; font-size:20px;">&times;</button>
        
        <div style="display:flex; align-items:center; gap:12px; margin-bottom:16px;">
          <div style="width:40px; height:40px; border-radius:50%; background:${actualColor}22; border:1px solid ${actualColor}55; display:flex; align-items:center; justify-content:center;">
             ${isHighRisk ? '<img src="assets/img/lucid_heart.png" style="width:20px">' : '<img src="assets/img/lucid_monitor.png" style="width:20px">'}
          </div>
          <div>
            <div style="font-size:12px; color:var(--text-muted); text-transform:uppercase; letter-spacing:1px;">${diseaseName}</div>
            <div style="font-size:20px; font-weight:700; color:${actualColor}">${stageStr}: ${info.title}</div>
          </div>
        </div>

        <p style="color:var(--text-secondary); font-size:14px; line-height:1.6; margin-bottom:20px;">
          ${info.desc}
        </p>

        <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.06); padding:16px; border-radius:12px;">
          <div style="font-size:13px; font-weight:600; color:white; margin-bottom:12px;">Recommended Precautions</div>
          <ul style="margin:0; padding-left:20px; color:var(--text-secondary); font-size:13px; line-height:1.6;">
            ${info.precautions.map(p => `<li style="margin-bottom:6px;">${p}</li>`).join('')}
          </ul>
        </div>
        
        <button onclick="document.getElementById('stageInfoModal').remove()" class="btn" style="width:100%; margin-top:20px; background:rgba(255,255,255,0.05); color:white; border:1px solid rgba(255,255,255,0.1)">Understand</button>
      </div>
    </div>
    <style>
      @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
      @keyframes slideUp { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
    </style>
  `;
  document.body.insertAdjacentHTML('beforeend', modalHtml);
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
let globalSearchTimeout;

function debounceGlobalSearch() {
  clearTimeout(globalSearchTimeout);
  const val = document.getElementById('globalSearchInput')?.value?.trim() || '';
  // Require minimum 3 characters before searching
  if (val.length > 0 && val.length < 3) return;
  globalSearchTimeout = setTimeout(() => {
      executeGlobalSearch();
  }, 500);
}

async function executeGlobalSearch() {
  const input = document.getElementById('globalSearchInput');
  if (!input) return;
  const query = input.value.trim();
  if (!query) return;

  // If on admin page, trigger specific list refreshes cleanly
  if (window.location.pathname.includes('admin_dashboard.html')) {
    const adminSearch = document.getElementById('adminSearchInput');
    if (adminSearch) {
      adminSearch.value = query;
      if (typeof executeSearch === 'function') executeSearch('patients');
    }
    return;
  }
  
  // If we are already on the history page, route directly to the active search instead of a hard redirect
  if (window.location.pathname.includes('history.html')) {
      const historyInput = document.getElementById('pidInput');
      if (historyInput) {
          historyInput.value = query;
          if (typeof searchPatient === 'function') searchPatient();
      }
      return;
  }

  // Otherwise, fallback to history search redirect
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
// Handle incoming search query from URL (for History page)
// Also rigorously clear admin credentials if landing on a non-admin page
window.addEventListener('DOMContentLoaded', () => {
    // 1. Auto-wipe Admin Session on public pages
    if (!window.location.pathname.includes('admin')) {
        sessionStorage.removeItem('adminToken');
        sessionStorage.removeItem('adminUser');
    }

    // 2. Extract global search routing
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