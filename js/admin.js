// =============================================================
// CardioCare AI — Admin Dashboard
// js/admin.js — Complete Final Version
// =============================================================

// =============================================================
// GLOBAL STATE
// =============================================================
let allPatients = [];
let activeReadingsPatients = [];
let currentPatient = null;
let currentTableName = null;
let currentTablePage = 1;
let currentSearch = '';
let currentSortBy = 'id';
let currentSortOrder = 'DESC';

// Pagination State
let patientsPage = 1;
let readingsPage = 1;
const PER_PAGE = 50;

// =============================================================
// ON PAGE LOAD
// =============================================================
window.onload = function () {
    if (!checkAdminAuth()) return;
    loadAdminData();
};

// =============================================================
// LOAD ALL DATA
// =============================================================
async function loadAdminData() {
    patientsPage = 1;
    readingsPage = 1;
    await Promise.all([
        loadPatients(true),
        loadAllReadings(true),
        loadStats(),
    ]);
}

// =============================================================
// STATS
// =============================================================
async function loadStats() {
    const data = await api.get('/api/admin/stats');
    if (!data.success) return;

    setEl('statPatients', data.total_patients || '0');
    setEl('statReadings', data.total_readings || '0');
    setEl('statToday', data.today_readings || '0');
    setEl('totalPat', data.total_patients || '0');
    setEl('totalRead', data.total_readings || '0');
    setEl('dbSize', data.db_size_mb || '< 1');
}

// =============================================================
// LOAD PATIENTS TABLE
// =============================================================
/**
 * EXECUTE SEARCH (Standard Trigger)
 */
async function executeSearch(type) {
    if (type === 'patients') {
        patientsPage = 1;
        await loadPatients(true);
    } else if (type === 'readings') {
        readingsPage = 1;
        await loadAllReadings(true);
    }
}

/**
 * LOAD PATIENTS (Paginated)
 */
async function loadPatients(isNewSearch = false) {
    const tbody = document.getElementById('patientsTableBody');
    const loadMoreContainer = document.getElementById('patientsLoadMore');
    const query = document.getElementById('adminSearchInput')?.value || '';
    const gender = document.getElementById('genderFilter')?.value || '';

    if (isNewSearch && tbody) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:40px"><div class="spinner"></div></td></tr>`;
    }

    const data = await api.get(`/api/admin/patients?q=${encodeURIComponent(query)}&page=${patientsPage}`);

    if (data.success) {
        let patients = data.patients || [];
        
        // Frontend post-filtering for gender if needed (though we could move this to server too)
        if (gender) {
            patients = patients.filter(p => p.gender === gender);
        }

        if (isNewSearch) {
            allPatients = patients;
            renderPatientsTable(patients);
        } else {
            allPatients = [...allPatients, ...patients];
            appendPatientsTable(patients);
        }

        // Handle "Load More" button
        if (data.total > allPatients.length) {
            loadMoreContainer.innerHTML = `<button class="btn-load-more" onclick="loadMore('patients')"><svg class="lucid-svg-sm" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> + Add More Patients</button>`;
        } else {
            loadMoreContainer.innerHTML = '';
        }
    } else {
        showAlert('patientsTableBody', 'error', data.message || 'Error loading patients');
    }
}

async function loadMore(type) {
    if (type === 'patients') {
        patientsPage++;
        await loadPatients(false);
    } else if (type === 'readings') {
        readingsPage++;
        await loadAllReadings(false);
    }
}

// =============================================================
// RENDER PATIENTS TABLE
// ===========================================================
    function renderPatientsTable(patients) {
    const tbody = document.getElementById('patientsTableBody');
    if (!tbody) return;

    if (!patients || patients.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:var(--text-muted);padding:40px"> No patients found.</td></tr>`;
        return;
    }

    tbody.innerHTML = patients.map(p => buildPatientRow(p)).join('');
    }

function appendPatientsTable(patients) {
    const tbody = document.getElementById('patientsTableBody');
    if (!tbody) return;
    tbody.insertAdjacentHTML('beforeend', patients.map(p => buildPatientRow(p)).join(''));
}

function buildPatientRow(p) {
    return `
        <tr style="cursor:pointer" onclick="openPatientModal('${p.patient_id}')">
            <td class="text-cyan" style="font-weight:700">${p.patient_id || '—'}</td>
            <td style="font-weight:600">${p.name || '—'}</td>
            <td>${p.age || '—'} yrs</td>
            <td>${p.gender || '—'}</td>
            <td>${p.weight || '—'} kg</td>
            <td><span class="badge badge-online" style="font-size:11px">${p.reading_count || 0} readings</span></td>
            <td style="color:var(--text-secondary);font-size:12px">${formatTimestamp(p.last_visit) || 'No visits'}</td>
            <td>
                <div style="display:flex;gap:6px" onclick="event.stopPropagation()">
                    <button class="btn btn-outline btn-sm" onclick="openPatientModal('${p.patient_id}')">View</button>
                    <button class="btn btn-sm" style="background:rgba(255,68,68,0.15); color:var(--red); border:1px solid rgba(255,68,68,0.3)"
                        onclick="confirmDeletePatient('${p.patient_id}','${escStr(p.name)}',${p.reading_count || 0})">
                        Delete
                    </button>
                </div>
            </td>
        </tr>`;
}

// =============================================================
// LOAD ALL READINGS (Paginated)
// =============================================================
async function loadAllReadings(isNewSearch = false) {
    const tbody = document.getElementById('readingsTableBody');
    const loadMoreContainer = document.getElementById('readingsLoadMore');
    const query = document.getElementById('readingsSearchInput')?.value || '';

    if (isNewSearch && tbody) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:40px"><div class="spinner"></div></td></tr>`;
    }

    const data = await api.get(`/api/admin/readings?q=${encodeURIComponent(query)}&page=${readingsPage}`);

    if (data.success) {
        const patients = data.patients || []; // Backend returns patients for the active readings view

        if (isNewSearch) {
            activeReadingsPatients = patients;
            renderReadingsTable(patients);
        } else {
            activeReadingsPatients = [...activeReadingsPatients, ...patients];
            appendReadingsTable(patients);
        }

        if (data.total > activeReadingsPatients.length) {
            loadMoreContainer.innerHTML = `<button class="btn-load-more" onclick="loadMore('readings')"><svg class="lucid-svg-sm" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> + Add More Records</button>`;
        } else {
            loadMoreContainer.innerHTML = '';
        }
    } else {
        showAlert('readingsTableBody', 'error', data.message || 'Error loading readings');
    }
}

function renderReadingsTable(patients) {
    const tbody = document.getElementById('readingsTableBody');
    if (!tbody) return;
    if (!patients || patients.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:40px"> No active readings found.</td></tr>`;
        return;
    }
    tbody.innerHTML = patients.map(p => buildReadingRow(p)).join('');
}

function appendReadingsTable(patients) {
    const tbody = document.getElementById('readingsTableBody');
    if (!tbody) return;
    tbody.insertAdjacentHTML('beforeend', patients.map(p => buildReadingRow(p)).join(''));
}

function buildReadingRow(p) {
    return `
        <tr style="cursor:pointer" onclick="openPatientModal('${p.patient_id}')">
            <td class="text-cyan" style="font-weight:700">${p.patient_id}</td>
            <td style="font-weight:600">${p.name}</td>
            <td>${p.age} yrs</td>
            <td>${p.gender}</td>
            <td style="text-align:center">
                <span class="badge badge-online">${p.reading_count} records</span>
            </td>
            <td style="color:var(--text-secondary);font-size:12px">
                ${formatTimestamp(p.last_visit)}
            </td>
            <td style="text-align:center">
                <button class="btn btn-primary btn-sm" onclick="openPatientModal('${p.patient_id}'); setTimeout(loadPatientHistoryInModal, 200)">
                    View Readings
                </button>
            </td>
        </tr>`;
}

// =============================================================
// FILTER PATIENTS
// =============================================================
function filterPatients() {
    const q = (document.getElementById('adminSearchInput')
        ?.value || '').toLowerCase();
    const gender = document.getElementById('genderFilter')
        ?.value || '';
    const ageRng = document.getElementById('ageFilter')
        ?.value || '';

    const filtered = allPatients.filter(p => {
        const matchQ = !q ||
            (p.name || '').toLowerCase().includes(q) ||
            (p.patient_id || '').toLowerCase().includes(q) ||
            String(p.age || '').includes(q);

        const matchG = !gender || p.gender === gender;

        let matchA = true;
        if (ageRng) {
            const [mn, mx] = ageRng.split('-').map(Number);
            matchA = (p.age || 0) >= mn &&
                (p.age || 0) <= mx;
        }

        return matchQ && matchG && matchA;
    });

    renderPatientsTable(filtered);
}

// =============================================================
// OPEN PATIENT DETAIL MODAL
// =============================================================
async function openPatientModal(patientId) {
    const patient = allPatients.find(
        p => p.patient_id === patientId
    );
    if (!patient) return;

    currentPatient = patient;

    // Reset modal state
    const histArea = document.getElementById('modalHistoryArea');
    const histBtn = document.getElementById('checkHistoryBtn');
    if (histArea) histArea.style.display = 'none';
    if (histBtn) histBtn.style.display = 'block';

    // Avatar
    setEl('modalAvatar', '');
    const avatarEl = document.getElementById('modalAvatar');
    if (avatarEl) {
        avatarEl.innerHTML = `<img src="assets/img/lucid_patient.png" style="width:32px">`;
    }

    setEl('modalName', patient.name || '—');
    setEl('modalMeta',
        `${patient.patient_id} • ` +
        `${patient.age} years • ` +
        `${patient.gender}`
    );

    // Details grid
    const details = [
        ['<img src="assets/img/lucid_patient.png" style="width:12px; margin-right:4px"> Patient ID', patient.patient_id],
        ['<svg class="lucid-svg" style="width:12px; height:12px; margin-right:4px" viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> Full Name', patient.name],
        ['<svg class="lucid-svg" style="width:12px; height:12px; margin-right:4px" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> Age', `${patient.age} years`],
        ['<svg class="lucid-svg" style="width:12px; height:12px; margin-right:4px" viewBox="0 0 24 24"><path d="M11 12h2a2 2 0 1 0 0-4h-2v4z"/><path d="m15 18 3 3"/><path d="M15 18H9V4h4.14a2 2 0 1 1 0 4H9"/></svg> Weight', `${patient.weight} kg`],
        ['<img src="assets/img/lucid_ai_brain.png" style="width:12px; margin-right:4px"> Gender', patient.gender],
        ['<img src="assets/img/lucid_monitor.png" style="width:12px; margin-right:4px"> Readings', patient.reading_count || 0],
        ['<svg class="lucid-svg" style="width:12px; height:12px; margin-right:4px" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> Registered',
            formatTimestamp(patient.registered_on)],
        ['<svg class="lucid-svg" style="width:12px; height:12px; margin-right:4px" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg> History',
            patient.medical_history || 'None recorded'],
    ];

    const grid = document.getElementById('modalDetailsGrid');
    if (grid) {
        grid.innerHTML = details.map(([k, v]) => `
            <div style="padding:10px 12px;
                         background:rgba(255,255,255,0.03);
                         border-radius:8px;
                         border:1px solid
                         rgba(255,255,255,0.06)">
                <div style="font-size:11px;
                             color:var(--text-muted);
                             margin-bottom:4px">${k}</div>
                <div style="font-size:14px;
                             font-weight:500">
                    ${v || '—'}
                </div>
            </div>
        `).join('');
    }

    // Show modal
    const modal = document.getElementById('patientModal');
    if (modal) modal.classList.add('show');
}

function closeModal() {
    const modal = document.getElementById('patientModal');
    if (modal) modal.classList.remove('show');
}

// =============================================================
// LOAD PATIENT HISTORY IN MODAL
// =============================================================
async function loadPatientHistoryInModal() {
    if (!currentPatient) return;

    const histBtn = document.getElementById('checkHistoryBtn');
    const histArea = document.getElementById('modalHistoryArea');
    const accordion = document.getElementById('historyAccordion');

    if (histBtn) histBtn.style.display = 'none';
    if (histArea) histArea.style.display = 'block';

    if (accordion) {
        accordion.innerHTML = `
            <div style="text-align:center;padding:30px">
                <div class="spinner"></div>
                <div style="margin-top:12px; color:var(--text-secondary)">
                    Loading history...
                </div>
            </div>`;
    }

    const data = await api.get(`/api/admin/readings?patient_id=${currentPatient.patient_id}`);
    const readings = data.readings || [];

    if (!accordion) return;

    if (!data.success) {
        accordion.innerHTML = `
            <div style="color:var(--red); text-align:center; padding:20px">
                <svg class="lucid-svg" style="width:24px; height:24px; margin-bottom:8px" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg><br>
                ${data.message || 'Failed to load history'}
            </div>`;
        return;
    }

    if (readings.length === 0) {
        accordion.innerHTML = `
            <div style="text-align:center;padding:40px; color:var(--text-muted)">
                <img src="assets/img/lucid_search.png" style="width:40px; opacity:0.3; margin-bottom:12px"><br>
                No readings recorded yet for this patient.
            </div>`;
        return;
    }

    accordion.innerHTML = readings.map((r, i) => {
        const maxR = Math.max(
            r.arrhythmia_risk || 0,
            r.heartattack_risk || 0,
            r.stroke_risk || 0,
            r.hypertension_risk || 0
        );

        return `
        <div class="accordion-item">
            <div class="accordion-header" onclick="toggleAccordion(this)">
                <div>
                    <span style="font-weight:700">Reading #${i + 1}</span>
                    <span style="font-size:12px; color:var(--text-secondary); margin-left:12px">
                        ${formatTimestamp(r.timestamp)}
                    </span>
                </div>
                <div style="display:flex; align-items:center; gap:10px">
                        Max: ${maxR.toFixed(0)}%
                    </span>
                    <button class="btn btn-sm" style="background:rgba(255,68,68,0.15); color:var(--red); border:1px solid rgba(255,68,68,0.3); padding:4px 8px; display:flex; align-items:center"
                        onclick="event.stopPropagation(); confirmDeleteReading(${r.id}, ${i + 1})" title="Delete this reading">
                        <svg class="lucid-svg" style="width:12px; height:12px" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                    </button>
                    <span style="color:var(--text-muted); font-size:10px">▼</span>
                </div>
            </div>
            <div class="accordion-body">
                <div class="risk-grid-mini">
                    ${buildMiniRisk('Arrhythmia', r.arrhythmia_risk || 0)}
                    ${buildMiniRisk('Heart Attack', r.heartattack_risk || 0)}
                    ${buildMiniRisk('Stroke Risk', r.stroke_risk || 0)}
                    ${buildMiniRisk('Hypertension', r.hypertension_risk || 0)}
                </div>
                <div style="display:flex;gap:20px; font-size:13px; color:var(--text-secondary); flex-wrap:wrap; padding-top:10px; border-top:1px solid rgba(255,255,255,0.05); margin-top:10px">
                    <span><img src="assets/img/lucid_heart.png" style="width:14px; vertical-align:middle; margin-right:4px"> HR: ${r.heart_rate || '--'} bpm</span>
                    <span><img src="assets/img/lucid_monitor.png" style="width:14px; vertical-align:middle; margin-right:4px"> SpO2: ${r.spo2 || '--'}%</span>
                    <span><img src="assets/img/lucid_monitor.png" style="width:14px; vertical-align:middle; margin-right:4px"> BP: ${r.sbp || '--'}/${r.dbp || '--'} mmHg</span>
                    <span><svg class="lucid-svg" style="width:14px; height:14px; vertical-align:middle; margin-right:4px" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> PTT: ${r.ptt_ms || '--'} ms</span>
                </div>
                ${r.future_risk ? `<div style="margin-top:12px; padding:10px 14px; background:rgba(0,229,255,0.05); border:1px solid rgba(0,229,255,0.15); border-radius:8px; font-size:13px; color:var(--text-secondary)"><img src="assets/img/lucid_ai_brain.png" style="width:16px; margin-right:8px; vertical-align:middle"> <strong>Future Prediction:</strong> ${r.future_risk}</div>` : ''}
                ${r.overall_condition ? `<div style="margin-top:10px; padding:10px 14px; border-radius:8px; font-size:13px; font-weight:600; ${getConditionStyle(r.overall_condition)}"><img src="assets/img/lucid_monitor.png" style="width:16px; margin-right:8px; vertical-align:middle"> ${r.overall_condition}</div>` : ''}
            </div>
        </div>`;
    }).join('');
}

// =============================================================
// DELETE PATIENT — Confirmation
// =============================================================
function confirmDeletePatient(patientId, patientName,
    readingCount) {
    const html = `
        <div style="text-align:center;padding:10px">

            <div style="margin-bottom:16px">
                <svg class="lucid-svg" style="width:60px; height:60px" viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            </div>

            <h2 style="color:var(--red);
                        margin-bottom:8px;
                        font-size:22px">
                Delete Patient?
            </h2>

            <p style="color:var(--text-secondary);
                       margin-bottom:20px;
                       line-height:1.6;
                       font-size:14px">
                You are about to permanently delete:
            </p>

            <div style="background:rgba(255,68,68,0.08);
                         border:1px solid rgba(255,68,68,0.3);
                         border-radius:12px;
                         padding:20px;
                         margin-bottom:20px;
                         text-align:left">
                <div class="del-info-row">
                    <span style="color:var(--text-muted)">
                        Patient ID
                    </span>
                    <span style="color:var(--red);
                                  font-weight:700">
                        ${patientId}
                    </span>
                </div>
                <div class="del-info-row">
                    <span style="color:var(--text-muted)">
                        Name
                    </span>
                    <span style="font-weight:600">
                        ${patientName}
                    </span>
                </div>
                <div class="del-info-row"
                     style="border-bottom:none">
                    <span style="color:var(--text-muted)">
                        Readings to delete
                    </span>
                    <span style="color:var(--orange);
                                  font-weight:700">
                        ${readingCount} readings
                    </span>
                </div>
            </div>

            <div style="background:rgba(255,152,0,0.08);
                         border:1px solid rgba(255,152,0,0.3);
                         border-radius:10px;
                         padding:12px;
                         margin-bottom:24px;
                         font-size:13px;
                         color:var(--orange)">
                ⚠️ This action is
                <strong>permanent</strong>
                and cannot be undone.
                All health readings will also be deleted.
            </div>

            <div style="display:flex;gap:12px">
                <button class="btn btn-outline"
                        style="flex:1"
                        onclick="closeDeleteModal()">
                    <svg class="lucid-svg" style="width:14px; height:14px; margin-right:6px" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> Cancel
                </button>
                <button
                    class="btn"
                    style="flex:1;
                           background:linear-gradient(
                               135deg,#c62828,#b71c1c);
                           color:white;
                           box-shadow:0 4px 20px
                               rgba(198,40,40,0.4)"
                    onclick="executeDeletePatient(
                        '${patientId}'
                    )">
                    <svg class="lucid-svg" style="width:14px; height:14px; margin-right:6px" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg> Yes, Delete Permanently
                </button>
            </div>
        </div>
    `;

    showDeleteModal(html);
}

// =============================================================
// DELETE PATIENT — Execute
// =============================================================
async function executeDeletePatient(patientId) {
    const modalBox = document.querySelector('#deleteModal .modal-box');
    showModalLoading(modalBox, 'Deleting patient...');

    const data = await api.delete(`/api/admin/patients/${patientId}/delete`);

    if (data.success) {
        showModalSuccess(modalBox, 'Patient Deleted!', `${data.message || 'Removed from database'}`);
        setTimeout(async () => {
            closeDeleteModal();
            closeModal();
            await loadAdminData();
        }, 1500);
    } else {
        showModalError(modalBox, data.message || 'Delete failed');
    }
}

// =============================================================
// DELETE SINGLE READING — Confirmation
// =============================================================
function confirmDeleteReading(readingId, readingNumber) {
    const html = `
        <div style="text-align:center;padding:10px">

            <div style="font-size:50px;margin-bottom:16px">
                🗑️
            </div>

            <h3 style="color:var(--red);margin-bottom:12px">
                Delete Reading #${readingNumber}?
            </h3>

            <p style="color:var(--text-secondary);
                       margin-bottom:24px;
                       font-size:14px;
                       line-height:1.6">
                This will permanently delete reading
                <strong>#${readingNumber}</strong>
                from the database.
                This cannot be undone.
            </p>

            <div style="display:flex;gap:12px">
                <button class="btn btn-outline"
                        style="flex:1"
                        onclick="closeDeleteModal()">
                    <svg class="lucid-svg" style="width:14px; height:14px; margin-right:6px" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> Cancel
                </button>
                <button
                    class="btn"
                    style="flex:1;
                           background:linear-gradient(
                               135deg,#c62828,#b71c1c);
                           color:white"
                    onclick="executeDeleteReading(
                        ${readingId}
                    )">
                    <svg class="lucid-svg" style="width:14px; height:14px; margin-right:6px" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg> Delete Reading
                </button>
            </div>
        </div>
    `;

    showDeleteModal(html);
}

// =============================================================
// DELETE READING — Execute
// =============================================================
async function executeDeleteReading(readingId) {
    const modalBox = document.querySelector('#deleteModal .modal-box');
    showModalLoading(modalBox, 'Deleting reading...');

    const data = await api.delete(`/api/admin/readings/${readingId}/delete`);

    if (data.success) {
        showModalSuccess(modalBox, 'Reading Deleted!', data.message || 'Successfully removed');
        setTimeout(async () => {
            closeDeleteModal();
            await loadPatientHistoryInModal();
            await loadPatients();
            await loadStats();
        }, 1200);
    } else {
        showModalError(modalBox, data.message || 'Delete failed');
    }
}

// =============================================================
// DATABASE TABLE VIEWER
// =============================================================
async function loadDbTables() {
    const container = document.getElementById('dbTablesContent');
    if (!container) return;

    container.innerHTML = `<div style="text-align:center;padding:30px"><div class="spinner"></div><div style="margin-top:12px; color:var(--text-secondary)">Loading database tables...</div></div>`;

    const data = await api.get('/api/admin/db/tables');

    if (!data.success) {
        container.innerHTML = `<div class="alert alert-error"><svg class="lucid-svg" style="width:16px; height:16px; margin-right:8px" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> ${data.message || 'Failed to load tables'}</div>`;
        return;
    }

    let html = `<div style="display:grid;gap:16px; margin-bottom:24px; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr))">`;
    data.tables.forEach(table => {
        const colList = table.columns.map(c => c.name).join(', ');
        let iconHtml = `<img src="assets/img/lucid_database.png" style="width:24px">`;
        if (table.table_name === 'patients') iconHtml = `<img src="assets/img/lucid_patient.png" style="width:24px">`;
        if (table.table_name === 'readings') iconHtml = `<img src="assets/img/lucid_monitor.png" style="width:24px">`;
        if (table.table_name === 'admin') iconHtml = `<img src="assets/img/lucid_ai_brain.png" style="width:24px">`;
        
        const isActive = table.table_name === currentTableName;

        html += `
        <div style="padding:20px; background:var(--bg-card); backdrop-filter:blur(20px); border:1px solid ${isActive ? 'var(--cyan)' : 'var(--border-glass)'}; border-radius:16px; cursor:pointer; transition:var(--transition); ${isActive ? 'box-shadow:0 0 20px var(--cyan-glow);' : ''}"
             onclick="loadTableData('${table.table_name}', 1)" onmouseover="this.style.borderColor='var(--cyan)'" onmouseout="this.style.borderColor='${isActive ? 'var(--cyan)' : 'var(--border-glass)'}'">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px">
                <div style="display:flex; align-items:center; gap:10px">
                    ${iconHtml}
                    <div>
                        <div style="font-weight:700; font-size:16px; color:var(--cyan)">${table.table_name}</div>
                        <div style="font-size:11px; color:var(--text-muted)">${table.columns.length} columns</div>
                    </div>
                </div>
                <span class="badge badge-online" style="font-size:12px">${table.row_count} rows</span>
            </div>
            <div style="font-size:12px; color:var(--text-secondary); line-height:1.8; padding:10px; background:rgba(255,255,255,0.03); border-radius:8px; margin-bottom:10px">${colList}</div>
            <div style="text-align:center; font-size:12px; color:var(--cyan)">Click to view data →</div>
        </div>`;
    });

    html += `</div><div id="tableDataViewer" style="display:none"></div>`;
    container.innerHTML = html;

    if (currentTableName) loadTableData(currentTableName, currentTablePage);
}

// =============================================================
// LOAD TABLE DATA
// =============================================================
async function loadTableData(tableName, page) {
    currentTableName = tableName;
    currentTablePage = page || currentTablePage || 1;

    const viewer = document.getElementById('tableDataViewer');
    if (!viewer) return;

    viewer.style.display = 'block';
    viewer.innerHTML = `<div style="text-align:center;padding:30px"><div class="spinner"></div><div style="margin-top:12px; color:var(--text-secondary)">Loading ${tableName} data...</div></div>`;
    viewer.scrollIntoView({ behavior: 'smooth' });

    const params = new URLSearchParams({
        page: currentTablePage,
        per_page: 50,
        search: currentSearch,
        sort_by: currentSortBy,
        sort_order: currentSortOrder,
    });

    const data = await api.get(`/api/admin/db/tables/${tableName}?${params}`);

    if (!data.success) {
        viewer.innerHTML = `<div class="alert alert-error"><svg class="lucid-svg" style="width:16px; height:16px; margin-right:8px" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> ${data.message || 'Failed to load data'}</div>`;
        return;
    }

    renderTableData(data, viewer);
}

// =============================================================
// RENDER TABLE DATA
// =============================================================
function renderTableData(data, viewer) {
    const {
        table_name, columns, rows,
        total_rows, page, total_pages
    } = data;

    const isProtected = table_name === 'admin';

    // ── Header ────────────────────────────────────────────────
    let html = `
    <div style="background:var(--bg-card);
                 backdrop-filter:blur(20px);
                 border:1px solid var(--border-glass);
                 border-radius:20px;
                 padding:28px;
                 margin-top:20px;
                 position:relative">

        <div style="display:flex;
                     justify-content:space-between;
                     align-items:center;
                     flex-wrap:wrap;
                     gap:12px;
                     margin-bottom:20px">
            <div>
                <div style="font-size:18px;
                             font-weight:700;
                             color:var(--cyan);
                             display:flex;
                             align-items:center;
                             gap:8px">
                    ${table_name === 'patients' ? '<img src="assets/img/lucid_patient.png" style="width:20px">' :
            table_name === 'readings' ? '<img src="assets/img/lucid_monitor.png" style="width:20px">' : '<img src="assets/img/lucid_database.png" style="width:20px">' }
                    ${table_name}
                    <span class="badge badge-online"
                          style="font-size:11px">
                        ${total_rows} rows
                    </span>
                </div>
                <div style="font-size:12px;
                             color:var(--text-muted);
                             margin-top:4px">
                    Page ${page} of ${total_pages}
                    · Showing ${rows.length} of ${total_rows} rows
                </div>
            </div>

            <div style="display:flex;
                         gap:10px;
                         align-items:center;
                         flex-wrap:wrap">
                <input type="text"
                       class="form-input"
                       id="tableSearchInput"
                       style="width:220px;
                               padding:10px 14px;
                               font-size:13px"
                       placeholder="Search ${table_name}..."
                       value="${escStr(currentSearch)}"
                       oninput="debounceTableSearch(
                           this.value, '${table_name}'
                       )">
                <button class="btn btn-outline btn-sm"
                        onclick="closeTableViewer()">
                    <svg class="lucid-svg" style="width:14px; height:14px; margin-right:6px" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> Close
                </button>
            </div>
        </div>

        <!-- DATA TABLE -->
        <div style="overflow-x:auto;
                     max-height:550px;
                     overflow-y:auto">
            <table class="data-table">
                <thead>
                    <tr>
    `;

    // Column headers
    columns.forEach(col => {
        const isSorted = col === currentSortBy;
        const arrow = isSorted
            ? (currentSortOrder === 'ASC' ? ' ↑' : ' ↓')
            : '';
        const nextOrder = (isSorted &&
            currentSortOrder === 'DESC')
            ? 'ASC' : 'DESC';

        html += `
            <th style="cursor:pointer;
                        user-select:none;
                        white-space:nowrap;
                        ${isSorted
                ? 'color:var(--cyan);'
                : ''}"
                onclick="sortTable(
                    '${col}',
                    '${nextOrder}',
                    '${table_name}'
                )">
                ${col}${arrow}
            </th>`;
    });

    if (!isProtected) {
        html += `
            <th style="width:80px;text-align:center">
                Delete
            </th>`;
    }

    html += `
                    </tr>
                </thead>
                <tbody>
    `;

    // ── Rows ──────────────────────────────────────────────────
    if (rows.length === 0) {
        const colspan = columns.length + (isProtected ? 0 : 1);
        html += `
            <tr>
                <td colspan="${colspan}"
                    style="text-align:center;
                            padding:40px;
                            color:var(--text-muted)">
                    <div style="margin-bottom:10px">
                        <img src="assets/img/lucid_search.png" style="width:40px; opacity:0.3">
                    </div>
                    ${currentSearch
                ? `No results for "${currentSearch}"`
                : 'Table is empty'}
                </td>
            </tr>`;
    } else {
        rows.forEach(row => {
            html += '<tr>';

            columns.forEach(col => {
                const val = row[col];
                let display = val;
                let style = '';

                if (val === null || val === undefined) {
                    display = `<span style="color:var(--text-muted);
                                            font-style:italic">
                                   NULL
                               </span>`;
                } else if (col === 'patient_id') {
                    style = 'color:var(--cyan);font-weight:700';
                } else if (col.includes('_risk')) {
                    const num = parseFloat(val) || 0;
                    style = `color:${getRiskColor(num)};
                                font-weight:600`;
                    display = num.toFixed(1) + '%';
                } else if (col === 'timestamp' ||
                    col === 'registered_on') {
                    display = formatTimestamp(val);
                    style = 'font-size:12px;' +
                        'color:var(--text-secondary);' +
                        'white-space:nowrap';
                } else if (col === 'password' ||
                    col === 'token') {
                    display = `<span class="sensitive-value" data-raw="••••••••">••••••••</span>
                               <button class="btn btn-sm" 
                                       style="padding: 2px 6px; font-size: 10px; margin-left: 8px;"
                                       onmousedown="revealValue('${table_name}', ${row.id}, '${col}', this)"
                                       onmouseup="maskValue(this)"
                                       onmouseleave="maskValue(this)">👁</button>`;
                    style = 'color:var(--text-muted);' +
                        'letter-spacing:1px; white-space:nowrap';
                } else if (typeof val === 'string' &&
                    val.length > 40) {
                    display = `<span title="${escStr(val)}">
                                   ${val.substring(0, 38)}...
                               </span>`;
                }

                html += `
                    <td style="${style};
                                max-width:200px;
                                overflow:hidden;
                                text-overflow:ellipsis">
                        ${display}
                    </td>`;
            });

            // Delete button
            if (!isProtected) {
                const displayName =
                    row.patient_id ||
                    row.name ||
                    `Row ${row.id}`;

                const rowType =
                    table_name === 'patients'
                        ? 'patient'
                        : 'reading';

                html += `
                    <td style="text-align:center">
                        <button
                            class="btn btn-sm"
                            style="background:rgba(255,68,68,0.1);
                                   color:var(--red);
                                   border:1px solid
                                   rgba(255,68,68,0.25);
                                   padding:4px 8px;
                                   display:flex; align-items:center; justify-content:center"
                            onclick="confirmDeleteRow(
                                '${table_name}',
                                ${row.id},
                                '${escStr(String(displayName))}',
                                '${rowType}'
                            )"
                            title="Delete row ${row.id}">
                            <svg class="lucid-svg" style="width:12px; height:12px" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                        </button>
                    </td>`;
            }

            html += '</tr>';
        });
    }

    html += `
                </tbody>
            </table>
        </div>
    `;

    // ── Pagination ────────────────────────────────────────────
    if (total_pages > 1) {
        html += `
            <div style="display:flex;
                         justify-content:center;
                         align-items:center;
                         gap:6px;
                         margin-top:20px;
                         flex-wrap:wrap">
        `;

        if (page > 1) {
            html += `
                <button class="btn btn-outline btn-sm"
                        onclick="loadTableData(
                            '${table_name}', ${page - 1}
                        )">
                    ← Prev
                </button>`;
        }

        const startPage = Math.max(1, page - 2);
        const endPage = Math.min(total_pages, page + 2);

        if (startPage > 1) {
            html += pageBtn(table_name, 1, page);
            if (startPage > 2) {
                html += `<span style="color:var(--text-muted)">
                             ...
                         </span>`;
            }
        }

        for (let p = startPage; p <= endPage; p++) {
            html += pageBtn(table_name, p, page);
        }

        if (endPage < total_pages) {
            if (endPage < total_pages - 1) {
                html += `<span style="color:var(--text-muted)">
                             ...
                         </span>`;
            }
            html += pageBtn(table_name, total_pages, page);
        }

        if (page < total_pages) {
            html += `
                <button class="btn btn-outline btn-sm"
                        onclick="loadTableData(
                            '${table_name}', ${page + 1}
                        )">
                    Next →
                </button>`;
        }

        html += '</div>';
    }

    html += '</div>';
    viewer.innerHTML = html;
}

// Helper: pagination button
function pageBtn(tableName, p, currentPage) {
    const isActive = p === currentPage;
    return `
        <button class="btn btn-sm"
                style="${isActive
            ? 'background:var(--cyan);color:#000;' +
            'font-weight:700'
            : 'background:rgba(255,255,255,0.05);' +
            'color:var(--text-secondary)'}"
                onclick="loadTableData('${tableName}', ${p})">
            ${p}
        </button>`;
}

// =============================================================
// TABLE CONTROLS
// =============================================================
function debounceTableSearch(value, tableName) {
    currentSearch = value;
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        currentTablePage = 1;
        loadTableData(tableName, 1);
    }, 400);
}

function sortTable(column, order, tableName) {
    currentSortBy = column;
    currentSortOrder = order;
    loadTableData(tableName, currentTablePage);
}

function closeTableViewer() {
    const viewer = document.getElementById('tableDataViewer');
    if (viewer) {
        viewer.style.display = 'none';
        viewer.innerHTML = '';
    }
    currentTableName = null;
    currentSearch = '';
    currentSortBy = 'id';
    currentSortOrder = 'DESC';
}

// =============================================================
// DELETE ROW (from table viewer)
// =============================================================
function confirmDeleteRow(tableName, rowId,
    displayName, rowType) {
    const html = `
        <div style="text-align:center;padding:10px">

            <div style="font-size:50px;margin-bottom:16px">
                🗑️
            </div>

            <h3 style="color:var(--red);margin-bottom:12px">
                Delete ${rowType}?
            </h3>

            <div style="background:rgba(255,68,68,0.08);
                         border:1px solid rgba(255,68,68,0.3);
                         border-radius:12px;
                         padding:16px;
                         margin-bottom:20px;
                         text-align:left">
                <div class="del-info-row">
                    <span style="color:var(--text-muted)">
                        Table
                    </span>
                    <span style="color:var(--cyan);
                                  font-weight:600">
                        ${tableName}
                    </span>
                </div>
                <div class="del-info-row">
                    <span style="color:var(--text-muted)">
                        Row ID
                    </span>
                    <span style="font-weight:600">
                        ${rowId}
                    </span>
                </div>
                <div class="del-info-row"
                     style="border-bottom:none">
                    <span style="color:var(--text-muted)">
                        Record
                    </span>
                    <span style="font-weight:600">
                        ${displayName}
                    </span>
                </div>
            </div>

            ${tableName === 'patients' ? `
            <div style="background:rgba(255,152,0,0.08);
                         border:1px solid rgba(255,152,0,0.3);
                         border-radius:8px;
                         padding:10px;
                         margin-bottom:20px;
                         font-size:13px;
                         color:var(--orange)">
                ⚠️ Deleting a patient will also permanently
                delete <strong>ALL their readings</strong>
            </div>` : ''}

            <div style="display:flex;gap:12px">
                <button class="btn btn-outline"
                        style="flex:1"
                        onclick="closeDeleteModal()">
                    ✕ Cancel
                </button>
                <button
                    class="btn"
                    style="flex:1;
                           background:linear-gradient(
                               135deg,#c62828,#b71c1c);
                           color:white"
                    onclick="executeDeleteRow(
                        '${tableName}', ${rowId}
                    )">
                    <svg class="lucid-svg" style="width:14px; height:14px; margin-right:6px" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg> Delete
                </button>
            </div>
        </div>
    `;

    showDeleteModal(html);
}

async function executeDeleteRow(tableName, rowId) {
    const token = sessionStorage.getItem('adminToken');
    const modalBox = document.querySelector(
        '#deleteModal .modal-box'
    );

    showModalLoading(modalBox, 'Deleting...');

    try {
        const data = await api.delete(`/api/admin/db/tables/${tableName}/rows/${rowId}`);

        if (data.success) {
            showModalSuccess(
                modalBox,
                'Deleted!',
                `${data.message}${data.readings_deleted
                    ? '<br>' + data.readings_deleted +
                    ' readings also removed'
                    : ''
                }`
            );
            setTimeout(async () => {
                closeDeleteModal();
                await loadTableData(
                    tableName, currentTablePage
                );
                await loadPatients();
                await loadStats();
            }, 1200);

        } else {
            showModalError(
                modalBox,
                data.message || 'Delete failed'
            );
        }

    } catch (e) {
        showModalError(modalBox, 'Connection error');
    }
}

// =============================================================
// SECTION NAVIGATION
// =============================================================
function showSection(name) {
    const sections = [
        'patients', 'readings', 'database', 'settings'
    ];
    sections.forEach(s => {
        const el = document.getElementById(`section-${s}`);
        if (el) {
            el.style.display = s === name ? 'block' : 'none';
        }
    });

    // Sidebar active state
    document.querySelectorAll('.sidebar-menu a')
        .forEach(a => a.classList.remove('active'));

    if (name === 'readings') loadAllReadings(true);
    if (name === 'database') {
        currentTableName = null;
        loadDbTables();
    }
}

async function loadAllReadings() {
    const tbody = document.getElementById('readingsTableBody');
    if (!tbody) return;

    tbody.innerHTML = `
        <tr>
            <td colspan="7" style="text-align:center; padding:20px">
                <div class="spinner"></div>
            </td>
        </tr>`;

    try {
        const data = await api.get('/api/admin/patients');
        const allStats = data.patients || [];
        // Filter: only patients who have at least one reading
        activeReadingsPatients = allStats.filter(p => (p.reading_count || 0) > 0);

        renderReadingsTable(activeReadingsPatients);

    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:var(--red); padding:20px"><svg class="lucid-svg" style="width:24px; height:24px; margin-bottom:8px" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg><br>Failed to load active patients</td></tr>`;
    }
}

function filterReadingsPatients() {
    const q = (document.getElementById('readingsSearchInput')?.value || '').toLowerCase();
    
    const filtered = activeReadingsPatients.filter(p => {
        return (p.name || '').toLowerCase().includes(q) ||
               (p.patient_id || '').toLowerCase().includes(q) ||
               (p.contact || '').toLowerCase().includes(q);
    });

    renderReadingsTable(filtered);
}

function renderReadingsTable(patients) {
    const tbody = document.getElementById('readingsTableBody');
    if (!tbody) return;

    if (patients.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align:center; padding:30px; color:var(--text-muted)">
                    <img src="assets/img/lucid_search.png" style="width:40px; opacity:0.3; margin-bottom:12px"><br>
                    No matching patients found.
                </td>
            </tr>`;
        return;
    }

    tbody.innerHTML = patients.map(p => `
        <tr>
            <td class="text-cyan" style="font-weight:700">${p.patient_id}</td>
            <td style="font-weight:600">${p.name}</td>
            <td>${p.age} yrs</td>
            <td>${p.gender}</td>
            <td>
                <span class="badge badge-online" style="font-size:11px">
                    ${p.reading_count} readings
                </span>
            </td>
            <td style="font-size:12px; color:var(--text-secondary)">
                ${formatTimestamp(p.last_visit)}
            </td>
            <td style="text-align:center">
                <button class="btn btn-outline btn-sm" 
                        onclick="openPatientModal('${p.patient_id}'); setTimeout(() => loadPatientHistoryInModal(), 100);">
                    <img src="assets/img/lucid_monitor.png" style="width:14px; margin-right:4px; vertical-align:middle"> View Readings
                </button>
            </td>
        </tr>
    `).join('');
}

async function registerNewAdmin() {
    const user = (document.getElementById('regAdminUser')?.value || '').trim();
    const pass = document.getElementById('regAdminPass')?.value || '';
    const conf = document.getElementById('regAdminConfirm')?.value || '';

    if (!user || !pass) {
        alert('Please fill in all fields.');
        return;
    }
    if (pass !== conf) {
        alert('Passwords do not match.');
        return;
    }

    try {
        const data = await api.post('/api/admin/register', { username: user, password: pass });
        if (data.success) {
            alert('Success: ' + data.message);
            document.getElementById('regAdminUser').value = '';
            document.getElementById('regAdminPass').value = '';
            document.getElementById('regAdminConfirm').value = '';
        } else {
            alert('Error: ' + data.message);
        }
    } catch (e) {
        alert('Registration failed. Try again.');
    }
}

async function revealValue(table, id, col, btn) {
    const span = btn.previousElementSibling;
    if (!span) return;

    // Track press state to prevent race conditions
    btn.isPressed = true;

    try {
        const data = await api.get(`/api/admin/db/reveal?table=${table}&id=${id}&column=${col}`);
        // Only reveal if the user is STILL holding the button
        if (data.success && btn.isPressed) {
            span.textContent = data.value;
            span.style.letterSpacing = 'normal';
            span.style.color = 'var(--cyan)';
        }
    } catch (e) {
        console.error('Reveal failed:', e);
    }
}

function maskValue(btn) {
    btn.isPressed = false;
    const span = btn.previousElementSibling;
    if (!span) return;
    span.textContent = '••••••••';
    span.style.letterSpacing = '1px';
    span.style.color = 'var(--text-muted)';
}

// =============================================================
// DB TABLES INFO (sidebar section)
// =============================================================
function loadDbTablesInfo() {
    const el = document.getElementById('dbTablesContent');
    if (el) loadDbTables();
}

// =============================================================
// UPDATE CREDENTIALS
// =============================================================
async function updateCredentials() {
    const user = (document.getElementById('newAdminUser')
        ?.value || '').trim();
    const pass = document.getElementById('newAdminPass')
        ?.value || '';

    if (!user || !pass) {
        alert('Please fill in both username and password.');
        return;
    }

    try {
        const data = await api.post('/api/admin/update-creds', {
            username: user,
            password: pass
        });

        if (data.success) {
            alert('Success: Credentials updated successfully!\n' +
                'Please log in again with new credentials.');
            adminLogout();
        } else {
            alert(`Error: Failed to update credentials: ${data.message || 'Unknown error'}`);
        }

    } catch (e) {
        alert('Error: Connection error. Try again.');
    }
}

function refreshAllData() {
    loadAdminData();
}

// =============================================================
// DELETE MODAL HELPERS
// =============================================================
function showDeleteModal(html) {
    let modal = document.getElementById('deleteModal');

    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'deleteModal';
        modal.className = 'modal-overlay';
        modal.innerHTML = `<div class="modal-box"
                                style="max-width:480px">
                           </div>`;
        document.body.appendChild(modal);

        modal.addEventListener('click', function (e) {
            if (e.target === modal) closeDeleteModal();
        });
    }

    modal.querySelector('.modal-box').innerHTML = html;
    modal.classList.add('show');
}

function closeDeleteModal() {
    const modal = document.getElementById('deleteModal');
    if (modal) modal.classList.remove('show');
}

function showModalLoading(box, message) {
    if (!box) return;
    box.innerHTML = `
        <div style="text-align:center;padding:40px">
            <div class="spinner"></div>
            <div style="margin-top:16px;
                         color:var(--text-secondary)">
                ${message}
            </div>
        </div>`;
}

function showModalSuccess(box, title, message) {
    if (!box) return;
    box.innerHTML = `
        <div style="text-align:center;padding:40px">
            <div style="margin-bottom:16px">
                <svg class="lucid-svg" style="width:56px; height:56px" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <h3 style="color:var(--green);
                        margin-bottom:10px">
                ${title}
            </h3>
            <p style="color:var(--text-secondary);
                       font-size:14px;
                       line-height:1.6">
                ${message}
            </p>
        </div>`;
}

function showModalError(box, message) {
    if (!box) return;
    box.innerHTML = `
        <div style="text-align:center;padding:40px">
            <div style="margin-bottom:16px">
                <svg class="lucid-svg" style="width:56px; height:56px" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            </div>
            <h3 style="color:var(--red);
                        margin-bottom:10px">
                Failed
            </h3>
            <p style="color:var(--text-secondary);
                       margin-bottom:24px;
                       font-size:14px">
                ${message}
            </p>
            <button class="btn btn-outline"
                    onclick="closeDeleteModal()">
                Close
            </button>
        </div>`;
}

// =============================================================
// ACCORDION
// =============================================================
function toggleAccordion(header) {
    const body = header?.nextElementSibling;
    if (body) body.classList.toggle('show');
}

// =============================================================
// HELPER FUNCTIONS
// =============================================================

// Set element text content safely
function setEl(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

// Escape string for use in HTML attributes
function escStr(str) {
    return String(str || '')
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

// Build mini risk box for accordion history
function buildMiniRisk(name, risk) {
    const num = parseFloat(risk) || 0;
    const color = getRiskColor(num);
    const stage = getStage(num);

    return `
        <div class="risk-mini-item">
            <div style="font-size:11px;
                         color:var(--text-muted);
                         margin-bottom:4px">
                ${name}
            </div>
            <div style="font-size:20px;
                         font-weight:700;
                         color:${color}">
                ${num.toFixed(1)}%
            </div>
            <div style="font-size:11px;
                         color:var(--text-muted);
                         margin-top:2px">
                ${stage}
            </div>
        </div>`;
}

// Condition banner style
function getConditionStyle(condition) {
    const c = (condition || '').toLowerCase();
    if (c.includes('high') || c.includes('critical') ||
        c.includes('doctor')) {
        return 'background:rgba(255,68,68,0.1);' +
            'border:1px solid rgba(255,68,68,0.2);' +
            'color:var(--red)';
    }
    if (c.includes('moderate') || c.includes('monitor') ||
        c.includes('caution')) {
        return 'background:rgba(255,152,0,0.1);' +
            'border:1px solid rgba(255,152,0,0.2);' +
            'color:var(--orange)';
    }
    return 'background:rgba(0,230,118,0.1);' +
        'border:1px solid rgba(0,230,118,0.2);' +
        'color:var(--green)';
}