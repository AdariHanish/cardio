// =============================================================
// CardioCare AI — Admin Dashboard
// js/admin.js — Complete Final Version
// =============================================================

// =============================================================
// GLOBAL STATE
// =============================================================
let allPatients = [];
let currentPatient = null;
let currentTableName = null;
let currentTablePage = 1;
let currentSearch = '';
let currentSortBy = 'id';
let currentSortOrder = 'DESC';
let searchTimeout = null;

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
    await Promise.all([
        loadPatients(),
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
async function loadPatients() {
    const tbody = document.getElementById('patientsTableBody');
    if (tbody) {
        tbody.innerHTML = `
            <tr>
                <td colspan="9" style="text-align:center; padding:30px">
                    <div class="spinner"></div>
                    <div style="margin-top:12px; color:var(--text-secondary)">
                        Loading patients...
                    </div>
                </td>
            </tr>`;
    }

    const data = await api.get('/api/admin/patients');
    
    if (data.success) {
        allPatients = data.patients || [];
        renderPatientsTable(allPatients);
    } else {
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="9" style="text-align:center; color:var(--red); padding:30px">
                        ❌ ${data.message || 'Failed to load patients'}
                    </td>
                </tr>`;
        }
    }
}

// =============================================================
// RENDER PATIENTS TABLE
// =============================================================
function renderPatientsTable(patients) {
    const tbody = document.getElementById('patientsTableBody');
    if (!tbody) return;

    if (!patients || patients.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="9" style="text-align:center;
                    color:var(--text-muted);padding:40px">
                    <div style="font-size:40px;
                                margin-bottom:12px">👥</div>
                    No patients registered yet.
                </td>
            </tr>`;
        return;
    }

    tbody.innerHTML = patients.map(p => `
        <tr style="cursor:pointer"
            onclick="openPatientModal('${p.patient_id}')">
            <td class="text-cyan" style="font-weight:700">
                ${p.patient_id || '—'}
            </td>
            <td style="font-weight:600">
                ${p.name || '—'}
            </td>
            <td>${p.age || '—'} yrs</td>
            <td>${p.gender || '—'}</td>
            <td>${p.weight || '—'} kg</td>
            <td>
                <span class="badge badge-online"
                      style="font-size:11px">
                    ${p.reading_count || 0} readings
                </span>
            </td>
            <td style="color:var(--text-secondary);
                        font-size:12px">
                ${formatTimestamp(p.last_visit) || 'No visits'}
            </td>
            <td>
                <div style="display:flex;gap:6px"
                     onclick="event.stopPropagation()">
                    <button
                        class="btn btn-outline btn-sm"
                        onclick="openPatientModal(
                            '${p.patient_id}'
                        )"
                        title="View patient details">
                        👁 View
                    </button>
                    <button
                        class="btn btn-sm"
                        style="background:rgba(255,68,68,0.15);
                               color:var(--red);
                               border:1px solid
                               rgba(255,68,68,0.3)"
                        onclick="confirmDeletePatient(
                            '${p.patient_id}',
                            '${escStr(p.name)}',
                            ${p.reading_count || 0}
                        )"
                        title="Delete patient permanently">
                        🗑 Delete
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
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
    setEl('modalAvatar',
        patient.gender === 'Female' ? '👩' : '👨'
    );
    setEl('modalName', patient.name || '—');
    setEl('modalMeta',
        `${patient.patient_id} • ` +
        `${patient.age} years • ` +
        `${patient.gender}`
    );

    // Details grid
    const details = [
        ['🆔 Patient ID', patient.patient_id],
        ['👤 Full Name', patient.name],
        ['🎂 Age', `${patient.age} years`],
        ['⚖️ Weight', `${patient.weight} kg`],
        ['⚤ Gender', patient.gender],
        ['📋 Readings', patient.reading_count || 0],
        ['📅 Registered',
            formatTimestamp(patient.registered_on)],
        ['🏥 History',
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
                ❌ ${data.message || 'Failed to load history'}
            </div>`;
        return;
    }

    if (readings.length === 0) {
        accordion.innerHTML = `
            <div style="text-align:center;padding:40px; color:var(--text-muted)">
                <div style="font-size:36px; margin-bottom:12px">📭</div>
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
                    <span class="badge ${maxR > 70 ? 'badge-offline' : 'badge-online'}" style="font-size:11px">
                        Max: ${maxR.toFixed(0)}%
                    </span>
                    <button class="btn btn-sm" style="background:rgba(255,68,68,0.15); color:var(--red); border:1px solid rgba(255,68,68,0.3); padding:4px 10px; font-size:11px"
                        onclick="event.stopPropagation(); confirmDeleteReading(${r.id}, ${i + 1})" title="Delete this reading">🗑</button>
                    <span style="color:var(--text-muted)">▼</span>
                </div>
            </div>
            <div class="accordion-body">
                <div class="risk-grid-mini">
                    ${buildMiniRisk('🔴 Arrhythmia', r.arrhythmia_risk || 0)}
                    ${buildMiniRisk('❤️ Heart Attack', r.heartattack_risk || 0)}
                    ${buildMiniRisk('🧠 Stroke Risk', r.stroke_risk || 0)}
                    ${buildMiniRisk('💊 Hypertension', r.hypertension_risk || 0)}
                </div>
                <div style="display:flex;gap:20px; font-size:13px; color:var(--text-secondary); flex-wrap:wrap; padding-top:10px; border-top:1px solid rgba(255,255,255,0.05); margin-top:10px">
                    <span>❤️ HR: ${r.heart_rate || '--'} bpm</span>
                    <span>🫁 SpO2: ${r.spo2 || '--'}%</span>
                    <span>🩸 BP: ${r.sbp || '--'}/${r.dbp || '--'} mmHg</span>
                    <span>⏱ PTT: ${r.ptt_ms || '--'} ms</span>
                </div>
                ${r.future_risk ? `<div style="margin-top:12px; padding:10px 14px; background:rgba(0,229,255,0.05); border:1px solid rgba(0,229,255,0.15); border-radius:8px; font-size:13px; color:var(--text-secondary)">🔮 <strong>Future Prediction:</strong> ${r.future_risk}</div>` : ''}
                ${r.overall_condition ? `<div style="margin-top:10px; padding:10px 14px; border-radius:8px; font-size:13px; font-weight:600; ${getConditionStyle(r.overall_condition)}">📋 ${r.overall_condition}</div>` : ''}
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

            <div style="font-size:60px;margin-bottom:16px">
                ⚠️
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
                    ✕ Cancel
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
                    🗑 Yes, Delete Permanently
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
                    ✕ Cancel
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
                    🗑 Delete Reading
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
        container.innerHTML = `<div class="alert alert-error">❌ ${data.message || 'Failed to load tables'}</div>`;
        return;
    }

    let html = `<div style="display:grid;gap:16px; margin-bottom:24px">`;
    data.tables.forEach(table => {
        const colList = table.columns.map(c => c.name).join(', ');
        const icon = table.table_name === 'patients' ? '👥' : table.table_name === 'readings' ? '📊' : table.table_name === 'admin' ? '🛡️' : '📋';
        const isActive = table.table_name === currentTableName;

        html += `
        <div style="padding:20px; background:var(--bg-card); backdrop-filter:blur(20px); border:1px solid ${isActive ? 'var(--cyan)' : 'var(--border-glass)'}; border-radius:16px; cursor:pointer; transition:var(--transition); ${isActive ? 'box-shadow:0 0 20px var(--cyan-glow);' : ''}"
             onclick="loadTableData('${table.table_name}', 1)" onmouseover="this.style.borderColor='var(--cyan)'" onmouseout="this.style.borderColor='${isActive ? 'var(--cyan)' : 'var(--border-glass)'}'">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px">
                <div style="display:flex; align-items:center; gap:10px">
                    <span style="font-size:24px">${icon}</span>
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
        viewer.innerHTML = `<div class="alert alert-error">❌ ${data.message || 'Failed to load data'}</div>`;
        return;
    }

    currentTableData = data.rows || []; // Cache for Detail View
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
                    ${table_name === 'patients' ? '👥' :
            table_name === 'readings' ? '📊' : '🛡️'}
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
                       placeholder="🔍 Search ${table_name}..."
                       value="${escStr(currentSearch)}"
                       oninput="debounceTableSearch(
                           this.value, '${table_name}'
                       )">
                <button class="btn btn-outline btn-sm"
                        onclick="closeTableViewer()">
                    ✕ Close
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

        // Action Column
        html += `
            <th style="width:120px;text-align:center">
                Actions
            </th>`;

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
                    <div style="font-size:30px;
                                 margin-bottom:10px">📭</div>
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
                    display = '••••••••';
                    style = 'color:var(--text-muted);' +
                        'letter-spacing:2px';
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

            // Action buttons
            html += `
                <td style="text-align:center">
                    <div style="display:flex;gap:6px;justify-content:center">
                        <button
                            class="btn btn-outline btn-sm"
                            style="padding:5px 10px; font-size:12px"
                            onclick="showRowDetail('${table_name}', ${row.id})"
                            title="View full details">
                            👁
                        </button>`;

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
                        <button
                            class="btn btn-sm"
                            style="background:rgba(255,68,68,0.1);
                                   color:var(--red);
                                   border:1px solid
                                   rgba(255,68,68,0.25);
                                   padding:5px 10px;
                                   font-size:12px"
                            onclick="confirmDeleteRow(
                                '${table_name}',
                                ${row.id},
                                '${escStr(String(displayName))}',
                                '${rowType}'
                            )"
                            title="Delete row ${row.id}">
                            🗑
                        </button>`;
            }
            html += `</div></td>`;
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
    loadDbTables();
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
                    🗑 Delete
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

    if (name === 'readings') loadAllReadings();
    if (name === 'database') {
        currentTableName = null;
        loadDbTables();
    }
}

async function loadAllReadings() {
    const tbody = document.getElementById('readingsPatientsTableBody');
    if (!tbody) return;

    tbody.innerHTML = `
        <tr>
            <td colspan="6" style="text-align:center; padding:20px">
                <div class="spinner"></div>
            </td>
        </tr>`;

    try {
        const data = await api.get('/api/admin/patients');
        const patients = data.patients || [];

        if (patients.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" style="text-align:center; padding:30px; color:var(--text-muted)">
                        No patients found to view readings for.
                    </td>
                </tr>`;
            return;
        }

        tbody.innerHTML = patients.map(p => `
            <tr>
                <td class="text-cyan" style="font-weight:700">${p.patient_id}</td>
                <td style="font-weight:600">${p.name}</td>
                <td style="font-size:13px; color:var(--text-secondary)">${p.contact || 'No contact'}</td>
                <td>${p.gender}</td>
                <td>
                    <span class="badge ${p.reading_count > 0 ? 'badge-online' : 'badge-offline'}">
                        ${p.reading_count || 0} readings
                    </span>
                </td>
                <td>
                    <button class="btn btn-primary btn-sm" onclick="viewPatientHistoryFromReadings('${p.patient_id}')">
                        📋 View Readings
                    </button>
                </td>
            </tr>
        `).join('');

    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--red); padding:20px">❌ Failed to load patient list</td></tr>`;
    }
}

function viewPatientHistoryFromReadings(pid) {
    // We reuse the existing modal logic since it is already perfect for viewing history
    openPatientModal(pid);
    setTimeout(() => {
        loadPatientHistoryInModal();
    }, 300);
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
            alert('✅ Credentials updated successfully!\nPlease log in again with new credentials.');
            adminLogout();
        } else {
            alert(`❌ Failed to update credentials: ${data.message || 'Unknown error'}`);
        }

    } catch (e) {
        alert('❌ Connection error. Try again.');
    }
}

async function submitAddAdmin() {
    const name = document.getElementById('addAdminName')?.value.trim();
    const pass = document.getElementById('addAdminPass')?.value;
    const conf = document.getElementById('addAdminConfirm')?.value;

    if (!name || !pass || !conf) {
        alert('All fields are required.');
        return;
    }

    if (pass !== conf) {
        alert('Passwords do not match!');
        return;
    }

    try {
        const data = await api.post('/api/admin/add-admin', {
            username: name,
            password: pass
        });

        if (data.success) {
            alert(`✅ Admin "${name}" created successfully!`);
            document.getElementById('addAdminName').value = '';
            document.getElementById('addAdminPass').value = '';
            document.getElementById('addAdminConfirm').value = '';
            loadDbTables(); // Refresh table counts
        } else {
            alert(`❌ Failed: ${data.message}`);
        }
    } catch (e) {
        alert('❌ Connection error adding admin.');
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
            <div style="font-size:56px;
                         margin-bottom:16px">✅</div>
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
            <div style="font-size:56px;
                         margin-bottom:16px">❌</div>
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

// =============================================================
// ROW DETAIL VIEW (Database Tables)
// =============================================================
let currentTableData = null; // Cache last loaded table rows

function showRowDetail(tableName, rowId) {
    // In a real app we'd fetch specific ID or use cache
    // For now, search in DOM or refetch. Since we just rendered the table, 
    // we can use a simpler approach: finding the row in the viewer's data
    // But since `renderTableData` doesn't save to global yet, let's just use currentTableData if available
    
    // Actually, it's better to refetch specific record or pass it as JSON to the button
    // I will modify the loop to pass the row index
    // Wait, let's keep it simple: fetch all data for that specific ID or find in global
    // I'll modify `renderTableData` slightly to cache the rows
    
    const row = currentTableData.find(r => r.id === rowId);
    if (!row) return;

    const modal = document.getElementById('rowDetailModal');
    const content = document.getElementById('rowDetailContent');
    const title = document.getElementById('rowDetailTitle');
    
    title.textContent = `📋 Record: ${tableName} #${rowId}`;
    
    let html = '';
    for (const [key, val] of Object.entries(row)) {
        let displayVal = val;
        let isSensitive = (key === 'password' || key === 'token');
        
        if (val === null) displayVal = 'NULL';
        else if (isSensitive) {
            // Here we show the actual value (unmasked) for official admin view
            // as requested "add view option to the details when opened in website"
            displayVal = `<span style="color:var(--cyan); word-break:break-all">${val}</span>`;
        }

        html += `
            <div style="padding:12px; background:rgba(255,255,255,0.03); border-radius:10px; border:1px solid rgba(255,255,255,0.06)">
                <div style="font-size:11px; color:var(--text-muted); text-transform:uppercase; margin-bottom:4px">${key}</div>
                <div style="font-size:14px; color:white; font-family:monospace">${displayVal}</div>
            </div>
        `;
    }
    
    content.innerHTML = html;
    modal.classList.add('show');
}

function closeRowDetailModal() {
    const modal = document.getElementById('rowDetailModal');
    if (modal) modal.classList.remove('show');
}