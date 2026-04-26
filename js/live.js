// =============================================================
// CardioCare AI — Live Monitor
// Polls RPi backend for real-time data
// =============================================================

let currentPatientId = null;
let pollInterval     = null;
let ecgData          = [];
let animFrame        = null;
const ECG_MAX_POINTS = 300;

// Initialize on page load
window.onload = function() {
  // Check URL for patient ID
  const params = new URLSearchParams(window.location.search);
  const pid    = params.get('pid');
  if (pid) {
    document.getElementById('pidInput').value = pid;
    setPatient();
  }

  // Start ECG canvas loop
  initECGCanvas();

  // Start polling
  startPolling();
};

function setPatient() {
  const pid = document.getElementById('pidInput').value.trim();
  if (!pid) return;

  currentPatientId = pid;
  document.getElementById('currentPatientInfo').textContent = `Active Patient: ${pid}`;
  
  // Enable start button
  const startBtn = document.getElementById('startMeasureBtn');
  if (startBtn) startBtn.disabled = false;

  // Notify backend
  api.post('/api/monitor/set-patient', { patient_id: pid }).catch(() => {});
}

function startMeasurement() {
  if (!currentPatientId) return;
  api.post('/api/monitor/start', { patient_id: currentPatientId })
    .then(res => {
       if (res.success) {
         console.log("Measurement started for patient", currentPatientId);
       }
    });
}

function startPolling() {
  if (pollInterval) clearTimeout(pollInterval);
  fetchLiveDataLoop();
}

async function fetchLiveDataLoop() {
  await fetchLiveData();
  // Safe recursive ultra-fast polling (10ms)
  pollInterval = setTimeout(fetchLiveDataLoop, 10);
}

async function fetchLiveData() {
  const data = await api.get('/api/monitor/live');

  if (data.success !== false) {
    updateDeviceStatus(data.device_state || 'IDLE');
    
    // REQUIRE PATIENT ID TO SHOW DATA
    if (!currentPatientId) {
      document.getElementById('liveStatus').textContent = 'Please set Patient ID to begin';
      return;
    }

    updateVitals(data.vitals || {});
    updateECGBuffer(data.ecg_samples || []);

    if (data.predictions && data.predictions_ready) {
      updatePredictions(data.predictions);
      updateCountdown(0);
    } else if (data.countdown_remaining > 0) {
      updateCountdown(data.countdown_remaining);
    }
  } else {
    updateDeviceStatus('OFFLINE');
  }
}

function updateDeviceStatus(state) {
  const badge  = document.getElementById('liveDevStatus');
  const status = document.getElementById('liveStatus');
  const session= document.getElementById('sessionBadge');

  if (state === 'OFFLINE' || state === 'IDLE') {
    badge.className = 'badge badge-offline';
    badge.innerHTML = '<span class="pulse-dot red"></span>Offline';
    status.textContent = currentPatientId ? 'Waiting for device...' : 'Set Patient ID to Begin';
    session.className  = 'badge badge-warning';
    session.textContent= 'IDLE';
  } else if (state === 'READY') {
    badge.className = 'badge badge-online';
    badge.innerHTML = '<span class="pulse-dot green"></span>Online';
    status.textContent = 'Device Ready';
    session.className  = 'badge badge-online';
    session.textContent= 'READY';
  } else if (state === 'MEASURING') {
    badge.className = 'badge badge-online';
    badge.innerHTML = '<span class="pulse-dot green"></span>Online';
    status.textContent = '📊 Measuring...';
    session.className  = 'badge badge-warning';
    session.textContent= 'MEASURING';
    document.getElementById('countdownSection').style.display = 'block';
  } else if (state === 'PREDICTING') {
    status.textContent = '🧠 AI Predicting...';
    session.textContent= 'PREDICTING';
  }
}

function updateCountdown(seconds) {
  if (seconds <= 0) {
    document.getElementById('countdownSection').style.display = 'none';
    return;
  }

  document.getElementById('countdownSection').style.display = 'block';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms   = Math.floor((seconds % 1) * 1000);

  document.getElementById('countdownDisplay').textContent =
    `${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}:${String(ms).padStart(3,'0')}`;
}

function updateVitals(vitals) {
  if (vitals.heart_rate) {
    document.getElementById('hrValue').textContent =
      Math.round(vitals.heart_rate);
  }
  if (vitals.spo2) {
    document.getElementById('spo2Value').textContent =
      vitals.spo2.toFixed(1);
  }
  if (vitals.sbp) {
    document.getElementById('sbpValue').textContent =
      Math.round(vitals.sbp);
  }
  if (vitals.ptt) {
    document.getElementById('pttValue').textContent =
      Math.round(vitals.ptt);
  }
}

function updateECGBuffer(newSamples) {
  if (!newSamples || newSamples.length === 0) return;
  ecgData.push(...newSamples);
  if (ecgData.length > ECG_MAX_POINTS) {
    ecgData = ecgData.slice(-ECG_MAX_POINTS);
  }
  document.getElementById('ecgWaiting').style.display = 'none';
}

function updatePredictions(preds) {
  updateDiseaseRow('arr', preds.arrhythmia || {});
  updateDiseaseRow('ha',  preds.heartattack || {});
  updateDiseaseRow('str', preds.stroke || {});
  updateDiseaseRow('htn', preds.hypertension || {});

  // Overall condition
  const risks = [
    preds.arrhythmia?.risk_pct || 0,
    preds.heartattack?.risk_pct || 0,
    preds.stroke?.risk_pct || 0,
    preds.hypertension?.risk_pct || 0,
  ];
  const maxRisk = Math.max(...risks);
  const overallEl = document.getElementById('overallText');
  if (!overallEl) return;

  if (maxRisk > 70) {
    overallEl.textContent = '⚠️ High Risk — Consult Doctor';
    overallEl.style.color = 'var(--red)';
  } else if (maxRisk > 40) {
    overallEl.textContent = '🟡 Moderate — Monitor Closely';
    overallEl.style.color = 'var(--orange)';
  } else {
    overallEl.textContent = '✅ Good Overall Condition';
    overallEl.style.color = 'var(--green)';
  }

  // Future risk
  if (preds.future) {
    const fSect = document.getElementById('futureRiskSection');
    const fText = document.getElementById('futureRiskText');
    if (fSect) fSect.style.display = 'block';
    if (fText) fText.textContent = preds.future.overall || '';
  }
}

function getProgressClass(risk) {
  if (risk > 70) return 'progress-critical';
  if (risk > 40) return 'progress-high';
  if (risk > 20) return 'progress-medium';
  return 'progress-low';
}

function updateDiseaseRow(prefix, data) {
  const risk  = data.risk_pct || 0;
  const stage = typeof getStage === 'function' ? getStage(risk) : 'Stage 1';
  const color = typeof getRiskColor === 'function' ? getRiskColor(risk) : 'var(--green)';
  const cls   = getProgressClass(risk);

  const valEl   = document.getElementById(`${prefix}Value`);
  const barEl   = document.getElementById(`${prefix}Bar`);
  const stageEl = document.getElementById(`${prefix}Stage`);

  if (valEl) {
    valEl.textContent = `${risk.toFixed(1)}%`;
    valEl.style.color = color;
  }
  if (barEl) {
    barEl.style.width = `${risk}%`;
    barEl.className   = `progress-bar-fill ${cls}`;
  }
  if (stageEl) {
    stageEl.textContent = `${stage} (${data.type || 'Normal'})`;
  }
}

// ECG Canvas Drawing
function initECGCanvas() {
  const canvas = document.getElementById('ecgCanvas');
  if (!canvas) return;

  function draw() {
    const ctx = canvas.getContext('2d');
    canvas.width  = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (ecgData.length < 2) {
      animFrame = requestAnimationFrame(draw);
      return;
    }

    const W = canvas.width;
    const H = canvas.height;
    const step = W / ECG_MAX_POINTS;

    ctx.strokeStyle = '#00e5ff';
    ctx.lineWidth   = 2;
    ctx.shadowBlur  = 8;
    ctx.shadowColor = '#00e5ff';
    ctx.beginPath();

    const data = ecgData.slice(-ECG_MAX_POINTS);
    const minV = Math.min(...data);
    const maxV = Math.max(...data);
    const range= maxV - minV || 1;

    data.forEach((v, i) => {
      const x = i * step;
      const y = H - ((v - minV) / range) * (H - 20) - 10;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });

    ctx.stroke();
    animFrame = requestAnimationFrame(draw);
  }

  draw();
}

window.onbeforeunload = function() {
  if (pollInterval) clearInterval(pollInterval);
  if (animFrame)    cancelAnimationFrame(animFrame);
};