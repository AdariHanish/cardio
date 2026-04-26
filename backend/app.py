# =============================================================
# CardioCare AI — Flask Backend Server
# website/backend/app.py
# =============================================================

from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from dotenv import load_dotenv
import os
import sys

# =============================================================
# PATHS & ENV SETUP
# =============================================================
BASE_DIR    = os.path.dirname(os.path.abspath(__file__))
WEBSITE_DIR = os.path.abspath(os.path.join(BASE_DIR, '..'))
load_dotenv(os.path.join(WEBSITE_DIR, '.env'))

# Frontend is the WEBSITE_DIR
FRONTEND_DIR = WEBSITE_DIR

# Add backend/ to path
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)
import database as db

# =============================================================
# FLASK APP SETUP
# =============================================================
app = Flask(
    __name__,
    static_folder   = FRONTEND_DIR,
    static_url_path = ''
)

app.secret_key = os.getenv('FLASK_SECRET_KEY', 'cardiocare-secure-default-2024')
CORS(app)

# =============================================================
# IN-MEMORY LIVE DATA (IOT)
# =============================================================
LIVE_DATA = {
    "device_state"       : "IDLE",
    "vitals"             : {},
    "ecg_samples"        : [],
    "predictions"        : {},
    "predictions_ready"  : False,
    "countdown_remaining": 0,
    "current_patient"    : None,
}

# =============================================================
# INIT DATABASE
# =============================================================
try:
    db.init_database()
except Exception as e:
    print(f"[ERROR] Database init failed: {e}")

# =============================================================
# ── SECTION 1: SERVE FRONTEND ────────────────────────────────
# =============================================================
@app.route('/')
def index():
    return send_from_directory(FRONTEND_DIR, 'index.html')

@app.route('/<path:filename>')
def serve_static(filename):
    file_path = os.path.join(FRONTEND_DIR, filename)
    if os.path.isfile(file_path):
        return send_from_directory(FRONTEND_DIR, filename)
    
    # Fallback to .html for cleaner URLs
    html_path = os.path.join(FRONTEND_DIR, filename + '.html')
    if os.path.isfile(html_path):
        return send_from_directory(FRONTEND_DIR, filename + '.html')
        
    return jsonify({"error": "Resource not found"}), 404

# =============================================================
# ── SECTION 2: PATIENT ENDPOINTS ─────────────────────────────
# =============================================================
@app.route('/api/patients/register', methods=['POST'])
def register_patient():
    try:
        data = request.json or {}
        if not data.get('name'):
            return jsonify({"success": False, "message": "Name is required"}), 400
            
        result = db.register_patient(
            name            = data.get('name'),
            age             = data.get('age', 0),
            weight          = data.get('weight', 0),
            gender          = data.get('gender', 'Unknown'),
            contact         = data.get('contact', ''),
            medical_history = data.get('medical_history', '')
        )
        return jsonify(result)
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500

@app.route('/api/patients/search')
def search_patient():
    q = request.args.get('q', '').strip()
    page = int(request.args.get('page', 1))
    
    if not q:
        return jsonify({"success": False, "message": "Search query empty"}), 400
        
    try:
        # returns {success, patients, total}
        result = db.search_patients(q, page=page, per_page=10)
        return jsonify(result)
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500

@app.route('/api/patients/<pid>')
def get_patient(pid):
    try:
        patient = db.get_patient_by_id(pid)
        if not patient:
            return jsonify({"success": False, "message": "Patient not found"}), 404
        readings = db.get_patient_readings(pid)
        return jsonify({
            "success": True,
            "patient": patient,
            "readings": readings
        })
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500

@app.route('/api/patients/age-group')
def patients_age_group():
    try:
        age = int(request.args.get('age', 0))
        pts = db.get_patients_by_age(age)
        return jsonify({"success": True, "patients": pts})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500

@app.route('/api/stats')
def stats():
    try:
        return jsonify(db.get_stats())
    except Exception as e:
        return jsonify({"error": "Failed to fetch stats"}), 500

# =============================================================
# ── SECTION 3: ADMIN ENDPOINTS ───────────────────────────────
# =============================================================
@app.route('/api/admin/login', methods=['POST'])
def admin_login():
    data = request.json or {}
    return jsonify(db.admin_login(data.get('username'), data.get('password')))

@app.route('/api/admin/stats')
def admin_stats():
    token = request.headers.get('X-Admin-Token', '')
    if not db.verify_token(token):
        return jsonify({"error": "Unauthorized"}), 401
    stats_data = db.get_stats()
    return jsonify({"success": True, **stats_data})

@app.route('/api/admin/patients')
def admin_patients():
    token = request.headers.get('X-Admin-Token', '')
    if not db.verify_token(token):
        return jsonify({"error": "Unauthorized"}), 401
    
    q = request.args.get('q', '').strip()
    page = int(request.args.get('page', 1))
    return jsonify(db.get_all_patients(query=q, page=page))

@app.route('/api/admin/readings')
def admin_readings():
    token = request.headers.get('X-Admin-Token', '')
    if not db.verify_token(token):
        return jsonify({"error": "Unauthorized"}), 401
    
    pid = request.args.get('patient_id')
    if pid:
        return jsonify({"success": True, "readings": db.get_patient_readings(pid)})
    
    q = request.args.get('q', '').strip()
    page = int(request.args.get('page', 1))
    return jsonify(db.get_active_patients(query=q, page=page))

@app.route('/api/admin/readings/today')
def admin_todays_readings():
    token = request.headers.get('X-Admin-Token', '')
    if not db.verify_token(token):
        return jsonify({"error": "Unauthorized"}), 401
    
    return jsonify(db.get_todays_readings())

@app.route('/api/admin/db/tables')
def admin_tables():
    try:
        token = request.headers.get('X-Admin-Token', '')
        if not db.verify_token(token):
            return jsonify({"error": "Unauthorized"}), 401
        
        tables = db.get_table_names()
        table_info = []
        for t in tables:
            try:
                info = db.get_table_info(t)
                if info.get('success'):
                    table_info.append(info)
            except Exception as e:
                print(f"[ERROR] Table info failed for {t}: {e}")
                
        return jsonify({"success": True, "tables": table_info})
    except Exception as e:
        print(f"[CRITICAL] admin_tables route failed: {e}")
        return jsonify({"success": False, "message": f"Server introspection failed: {str(e)}"}), 500

@app.route('/api/admin/db/tables/<table_name>')
def admin_table_data(table_name):
    token = request.headers.get('X-Admin-Token', '')
    if not db.verify_token(token):
        return jsonify({"error": "Unauthorized"}), 401
    
    page = int(request.args.get('page', 1))
    search = request.args.get('search', '')
    sort_by = request.args.get('sort_by', 'id')
    sort_order = request.args.get('sort_order', 'DESC')
    
    return jsonify(db.get_table_data(table_name, page=page, search=search, sort_by=sort_by, sort_order=sort_order))

@app.route('/api/admin/db/reveal')
def admin_reveal_value():
    token = request.headers.get('X-Admin-Token', '')
    if not db.verify_token(token):
        return jsonify({"error": "Unauthorized"}), 401
    
    table = request.args.get('table', '')
    row_id = request.args.get('id', '')
    column = request.args.get('column', '')
    
    if not table or not row_id or not column:
        return jsonify({"success": False, "message": "Missing parameters"})
    
    # Only allow revealing from admin table for security
    if column not in ('password', 'token'):
        return jsonify({"success": False, "message": "Cannot reveal this column"})
    
    try:
        conn = db.get_connection()
        if not conn:
            return jsonify({"success": False, "message": "DB connection failed"})
        with conn.cursor() as cur:
            cur.execute(f"SELECT `{column}` FROM `{table}` WHERE id = %s", (row_id,))
            row = cur.fetchone()
            if row:
                return jsonify({"success": True, "value": str(row[column])})
            return jsonify({"success": False, "message": "Row not found"})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)})
    finally:
        if conn: conn.close()

@app.route('/api/admin/db/tables/<table_name>/rows/<row_id>', methods=['DELETE'])
def admin_delete_table_row(table_name, row_id):
    token = request.headers.get('X-Admin-Token', '')
    return jsonify(db.delete_table_row(table_name, row_id, token))

@app.route('/api/admin/patients/<pid>/delete', methods=['DELETE'])
def admin_delete_patient(pid):
    token = request.headers.get('X-Admin-Token', '')
    return jsonify(db.delete_patient(pid, token))

@app.route('/api/admin/readings/<int:rid>/delete', methods=['DELETE'])
def admin_delete_reading(rid):
    token = request.headers.get('X-Admin-Token', '')
    return jsonify(db.delete_reading(rid, token))

@app.route('/api/admin/register', methods=['POST'])
def admin_register():
    token = request.headers.get('X-Admin-Token', '')
    if not db.verify_token(token):
        return jsonify({"error": "Unauthorized"}), 401
    
    data = request.json or {}
    username = data.get('username')
    password = data.get('password')
    
    if not username or not password:
        return jsonify({"success": False, "message": "Missing username or password"}), 400
        
    return jsonify(db.add_admin(username, password))

@app.route('/api/admin/db/reveal')
def admin_reveal():
    token = request.headers.get('X-Admin-Token', '')
    if not db.verify_token(token):
        return jsonify({"error": "Unauthorized"}), 401
    
    table = request.args.get('table')
    row_id = request.args.get('id')
    col = request.args.get('column')
    
    if not table or not row_id or not col:
        return jsonify({"success": False, "message": "Missing parameters"}), 400
        
    val = db.get_raw_value(table, row_id, col)
    if val is not None:
        return jsonify({"success": True, "value": val})
    return jsonify({"success": False, "message": "Value not found or forbidden"}), 404

# =============================================================
# ── SECTION 4: MONITOR & IOT ─────────────────────────────────
# =============================================================
@app.route('/api/monitor/set-patient', methods=['POST'])
def set_monitor_patient():
    data = request.json or {}
    pid = data.get('patient_id')
    if pid:
        LIVE_DATA['current_patient'] = pid
        return jsonify({"success": True})
    return jsonify({"success": False, "message": "Patient ID missing"}), 400

@app.route('/api/monitor/start', methods=['POST'])
def start_monitor():
    pid = (request.json or {}).get('patient_id')
    if not pid:
        return jsonify({"success": False, "message": "No Patient ID provided"}), 400
    
    # Transition device to measuring state
    LIVE_DATA['device_state'] = 'MEASURING'
    LIVE_DATA['countdown_remaining'] = 10 # 10 second simulation
    LIVE_DATA['predictions_ready'] = False
    return jsonify({"success": True})

@app.route('/api/monitor/live')
def live_data():
    now = time.time()
    last_ping = LIVE_DATA.get('last_ping', 0)
    
    # Strictly check if IoT device is alive (ping within 5 seconds)
    if now - last_ping > 5:
        LIVE_DATA['device_state'] = 'OFFLINE'
        LIVE_DATA['iot_connected'] = False
    else:
        LIVE_DATA['iot_connected'] = True
        
    return jsonify(LIVE_DATA)

import json
import threading
import time
import datetime

# --- GPIO Setup ---
try:
    import RPi.GPIO as GPIO
    GPIO.setmode(GPIO.BCM)
    GPIO_BUTTON_SAVE = 25
    GPIO.setup(GPIO_BUTTON_SAVE, GPIO.IN, pull_up_down=GPIO.PUD_UP)
    HAS_GPIO = True
except Exception as e:
    print(f"[SYSTEM] GPIO Init Failed/Skipped: {e}")
    HAS_GPIO = False

# --- Persistence Helpers ---
def save_measurement_result(pid, preds, vitals):
    """Saves result to both TiDB and Local Pi Memory"""
    if not pid: return False

    # 1. Prepare Payload
    risks = [
        preds.get('arrhythmia', {}).get('risk_pct', 0),
        preds.get('heartattack', {}).get('risk_pct', 0),
        preds.get('stroke', {}).get('risk_pct', 0),
        preds.get('hypertension', {}).get('risk_pct', 0)
    ]
    max_risk = max(risks) if risks else 0
    cond = "Good Overall Condition"
    if max_risk > 70: cond = "High Risk — Consult Doctor"
    elif max_risk > 40: cond = "Moderate — Monitor Closely"

    reading_payload = {
        "heart_rate": vitals.get('heart_rate', 0),
        "spo2": vitals.get('spo2', 0),
        "sbp": vitals.get('sbp', 0),
        "dbp": vitals.get('dbp', 80),
        "ptt_ms": vitals.get('ptt', 0),
        "arrhythmia_risk": preds.get('arrhythmia', {}).get('risk_pct', 0),
        "arrhythmia_type": preds.get('arrhythmia', {}).get('type', 'Normal'),
        "heartattack_risk": preds.get('heartattack', {}).get('risk_pct', 0),
        "stroke_risk": preds.get('stroke', {}).get('risk_pct', 0),
        "hypertension_risk": preds.get('hypertension', {}).get('risk_pct', 0),
        "overall_condition": cond,
        "future_risk": preds.get('future', {}).get('overall', 'Healthy stable prediction'),
        "timestamp": str(datetime.datetime.now())
    }

    # 2. Save to TiDB Cloud
    print(f"[SYNC] Saving to TiDB for Patient {pid}...")
    db.add_patient_reading(pid, reading_payload)

    # 3. Save to Local Pi Memory (JSON Backup)
    try:
        backup_path = os.path.join(BASE_DIR, 'local_backup.json')
        backups = []
        if os.path.exists(backup_path):
            with open(backup_path, 'r') as f:
                backups = json.load(f)
        
        backups.append({"patient_id": pid, "data": reading_payload})
        with open(backup_path, 'w') as f:
            json.dump(backups, f, indent=4)
        print(f"[LOCAL] Backup saved to {backup_path}")
    except Exception as e:
        print(f"[ERROR] Local backup failed: {e}")
    
    return True

# --- Background GPIO Listener ---
def gpio_listener():
    if not HAS_GPIO: return
    print(f"[SYSTEM] Hardware Button Listener Active (GPIO {GPIO_BUTTON_SAVE})")
    while True:
        try:
            # Button is PUD_UP (Pressed = Low/0)
            if GPIO.input(GPIO_BUTTON_SAVE) == GPIO.LOW:
                pid = LIVE_DATA.get('current_patient')
                ready = LIVE_DATA.get('predictions_ready')
                
                if pid and ready:
                    print(f"[HARDWARE] Button 25 Pressed! Manual Trigger Save for {pid}")
                    save_measurement_result(pid, LIVE_DATA.get('predictions', {}), LIVE_DATA.get('vitals', {}))
                    # Debounce
                    time.sleep(1)
                else:
                    print("[HARDWARE] Button pressed but no active patient/ready data.")
                    time.sleep(0.5)
            time.sleep(0.1)
        except Exception as e:
            print(f"[SYSTEM] GPIO Thread Error: {e}")
            time.sleep(1)

# Start GPIO thread
thread = threading.Thread(target=gpio_listener, daemon=True)
thread.start()

@app.route('/api/monitor/update', methods=['POST'])
def update_live():
    data = request.json or {}
    
    # Save only if predictions_ready transitioned to True AND we have a patient
    was_ready = LIVE_DATA.get('predictions_ready', False)
    is_ready  = data.get('predictions_ready', False)
    current_pid = LIVE_DATA.get('current_patient')
    
    LIVE_DATA.update(data)
    LIVE_DATA['last_ping'] = time.time() # Track heartbeat from IoT device
    
    if is_ready and not was_ready and current_pid:
        print(f"[AUTO] Triggering Auto-Save for {current_pid}")
        save_measurement_result(current_pid, LIVE_DATA.get('predictions', {}), LIVE_DATA.get('vitals', {}))

    return jsonify({"success": True})

@app.route('/api/status')
def system_status():
    state = LIVE_DATA.get('device_state', 'IDLE')
    return jsonify({
        "iot_connected": state != 'IDLE',
        "db_connected": True,
        "device_state": state
    })

# =============================================================
# RUN APP
# =============================================================
if __name__ == '__main__':
    host = os.getenv('FLASK_HOST', '0.0.0.0')
    port = int(os.getenv('FLASK_PORT', 5000))
    debug = os.getenv('FLASK_DEBUG', 'True').lower() == 'true'
    
    print(f"CardioCare AI Server starting on http://{host}:{port}")
    app.run(host=host, port=port, debug=debug)