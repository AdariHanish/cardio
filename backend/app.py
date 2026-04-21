# =============================================================
# CardioCare AI — Flask Backend Server
# website/backend/app.py
# ALL ROUTES BEFORE app.run() — CORRECT ORDER
# =============================================================

from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from dotenv import load_dotenv
import os
import sys
import time
import threading
import webbrowser

# =============================================================
# PATHS & ENV SETUP
# =============================================================
BASE_DIR    = os.path.dirname(os.path.abspath(__file__))
WEBSITE_DIR = os.path.abspath(os.path.join(BASE_DIR, '..'))
ENV_PATH    = os.path.join(WEBSITE_DIR, '.env')

load_dotenv(ENV_PATH)

FRONTEND_DIR = WEBSITE_DIR

print(f"[APP] Base dir      : {BASE_DIR}")
print(f"[APP] Website dir   : {WEBSITE_DIR}")
print(f"[APP] Frontend dir  : {FRONTEND_DIR}")
print(f"[APP] .env exists   : {os.path.exists(ENV_PATH)}")

# Check index.html exists
index_check = os.path.join(FRONTEND_DIR, 'index.html')
if not os.path.exists(index_check):
    print(f"[ERROR] index.html not found at: {index_check}")
    sys.exit(1)
else:
    print(f"[APP] index.html    : FOUND ✅")

# Add backend/ to path so we can import database.py
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

app.secret_key = os.getenv(
    'FLASK_SECRET_KEY',
    'cardiocare-fallback-secret-2024'
)

CORS(app)

# =============================================================
# IN-MEMORY LIVE DATA
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
db.init_database()

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
    html_path = os.path.join(FRONTEND_DIR, filename + '.html')
    if os.path.isfile(html_path):
        return send_from_directory(
            FRONTEND_DIR, filename + '.html'
        )
    return jsonify({
        "error"     : "File not found",
        "requested" : filename,
        "looked_in" : FRONTEND_DIR,
    }), 404


# =============================================================
# ── SECTION 2: PATIENT ROUTES ────────────────────────────────
# =============================================================
@app.route('/api/patients/register', methods=['POST'])
def register_patient():
    data = request.json or {}
    result = db.register_patient(
        name            = data.get('name', ''),
        age             = data.get('age', 0),
        weight          = data.get('weight', 0),
        gender          = data.get('gender', ''),
        contact         = data.get('contact', ''),
        medical_history = data.get('medical_history', ''),
    )
    return jsonify(result)


@app.route('/api/patients/search')
def search_patient():
    q = request.args.get('q', '').strip()
    if not q:
        return jsonify({
            "success": False,
            "message": "No query provided"
        })
    patient = db.search_patient(q)
    if not patient:
        return jsonify({"success": False, "patient": None})
    readings = db.get_patient_readings(patient['patient_id'])
    return jsonify({
        "success"  : True,
        "patient"  : patient,
        "readings" : readings,
    })


@app.route('/api/patients/age-group')
def patients_by_age():
    try:
        age = int(request.args.get('age', 30))
    except ValueError:
        age = 30
    patients = db.get_patients_by_age(age)
    return jsonify({"success": True, "patients": patients})


@app.route('/api/patients/<patient_id>/readings')
def patient_readings(patient_id):
    token = request.headers.get('X-Admin-Token', '')
    if not db.verify_token(token):
        return jsonify({"error": "Unauthorized"}), 401
    readings = db.get_patient_readings(patient_id)
    return jsonify({"success": True, "readings": readings})


@app.route('/api/stats')
def stats():
    return jsonify(db.get_stats())


# =============================================================
# ── SECTION 3: ADMIN ROUTES ──────────────────────────────────
# =============================================================
@app.route('/api/admin/login', methods=['POST'])
def admin_login():
    data = request.json or {}
    result = db.admin_login(
        username = data.get('username', ''),
        password = data.get('password', ''),
    )
    return jsonify(result)


@app.route('/api/admin/patients')
def admin_patients():
    token = request.headers.get('X-Admin-Token', '')
    if not db.verify_token(token):
        return jsonify({"error": "Unauthorized"}), 401
    patients = db.get_all_patients()
    return jsonify({"success": True, "patients": patients})


@app.route('/api/admin/readings')
def admin_readings():
    token = request.headers.get('X-Admin-Token', '')
    if not db.verify_token(token):
        return jsonify({"error": "Unauthorized"}), 401
    readings = db.get_all_readings()
    return jsonify({"success": True, "readings": readings})


@app.route('/api/admin/stats')
def admin_stats():
    token = request.headers.get('X-Admin-Token', '')
    if not db.verify_token(token):
        return jsonify({"error": "Unauthorized"}), 401
    return jsonify(db.get_stats())


@app.route('/api/admin/update-creds', methods=['POST'])
def update_creds():
    token = request.headers.get('X-Admin-Token', '')
    if not db.verify_token(token):
        return jsonify({"error": "Unauthorized"}), 401
    data = request.json or {}
    success = db.update_credentials(
        token        = token,
        new_username = data.get('username', ''),
        new_password = data.get('password', ''),
    )
    return jsonify({"success": success})


# =============================================================
# ── SECTION 4: DELETE ROUTES ─────────────────────────────────
# =============================================================
@app.route(
    '/api/admin/patients/<patient_id>/delete',
    methods=['DELETE']
)
def delete_patient(patient_id):
    token = request.headers.get('X-Admin-Token', '')
    if not db.verify_token(token):
        return jsonify({"error": "Unauthorized"}), 401
    result = db.delete_patient(patient_id, token)
    return jsonify(result)


@app.route(
    '/api/admin/readings/<int:reading_id>/delete',
    methods=['DELETE']
)
def delete_reading(reading_id):
    token = request.headers.get('X-Admin-Token', '')
    if not db.verify_token(token):
        return jsonify({"error": "Unauthorized"}), 401
    result = db.delete_reading(reading_id, token)
    return jsonify(result)


# =============================================================
# ── SECTION 5: DATABASE VIEWER ROUTES ────────────────────────
# =============================================================
@app.route('/api/admin/db/tables')
def get_tables():
    token = request.headers.get('X-Admin-Token', '')
    if not db.verify_token(token):
        return jsonify({"error": "Unauthorized"}), 401

    tables     = db.get_table_names()
    table_list = []
    for table in tables:
        info = db.get_table_info(table)
        if info.get('success'):
            table_list.append(info)

    return jsonify({"success": True, "tables": table_list})


@app.route('/api/admin/db/tables/<table_name>')
def get_table_data(table_name):
    token = request.headers.get('X-Admin-Token', '')
    if not db.verify_token(token):
        return jsonify({"error": "Unauthorized"}), 401

    try:
        page     = int(request.args.get('page',     1))
        per_page = int(request.args.get('per_page', 50))
    except ValueError:
        page, per_page = 1, 50

    result = db.get_table_data(
        table_name = table_name,
        page       = page,
        per_page   = per_page,
        search     = request.args.get('search',     ''),
        sort_by    = request.args.get('sort_by',    'id'),
        sort_order = request.args.get('sort_order', 'DESC'),
    )
    return jsonify(result)


@app.route(
    '/api/admin/db/tables/<table_name>/rows/<int:row_id>',
    methods=['DELETE']
)
def delete_table_row(table_name, row_id):
    token = request.headers.get('X-Admin-Token', '')
    if not db.verify_token(token):
        return jsonify({"error": "Unauthorized"}), 401
    result = db.delete_row(table_name, row_id, token)
    return jsonify(result)


# =============================================================
# ── SECTION 6: LIVE MONITOR ROUTES ───────────────────────────
# =============================================================
@app.route('/api/monitor/live')
def live_data():
    return jsonify(LIVE_DATA)


@app.route('/api/monitor/set-patient', methods=['POST'])
def set_patient():
    data = request.json or {}
    LIVE_DATA['current_patient'] = data.get('patient_id')
    return jsonify({"success": True})


@app.route('/api/monitor/update', methods=['POST'])
def update_live():
    data = request.json or {}
    LIVE_DATA.update(data)
    return jsonify({"success": True})


@app.route('/api/monitor/save-reading', methods=['POST'])
def save_reading():
    data = request.json or {}
    success = db.save_reading(
        patient_id  = data.get('patient_id', 'UNKNOWN'),
        vitals      = data.get('vitals',      {}),
        predictions = data.get('predictions', {}),
        future      = data.get('future',      {}),
    )
    return jsonify({"success": success})


# =============================================================
# ── SECTION 7: SYSTEM STATUS ─────────────────────────────────
# =============================================================
@app.route('/api/status')
def system_status():
    state     = LIVE_DATA.get('device_state', 'IDLE')
    is_online = state not in ['IDLE', 'OFFLINE']
    return jsonify({
        "iot_connected" : is_online,
        "models_loaded" : state in [
            'READY', 'MEASURING', 'PREDICTING', 'DONE'
        ],
        "db_connected"  : True,
        "ecg_detected"  : is_online,
        "ppg_detected"  : is_online,
        "device_state"  : state,
    })


# =============================================================
# ── SECTION 8: DEBUG ROUTE ───────────────────────────────────
# =============================================================
@app.route('/api/debug')
def debug_info():
    all_files = []
    for root, dirs, files in os.walk(FRONTEND_DIR):
        dirs[:] = [
            d for d in dirs
            if d not in ['__pycache__', '.git',
                         'node_modules']
        ]
        for file in files:
            rel = os.path.relpath(
                os.path.join(root, file), FRONTEND_DIR
            )
            all_files.append(rel)

    all_routes = sorted([
        str(rule) for rule in app.url_map.iter_rules()
    ])

    return jsonify({
        "status"       : "✅ Server running",
        "frontend_dir" : FRONTEND_DIR,
        "total_routes" : len(all_routes),
        "all_routes"   : all_routes,
        "all_files"    : sorted(all_files),
        "live_state"   : LIVE_DATA['device_state'],
    })


# =============================================================
# AUTO OPEN BROWSER
# =============================================================
def open_browser(url):
    time.sleep(1.5)
    print(f"\n[APP] 🌐 Opening: {url}\n")

    try:
        # Windows Chrome paths
        chrome_paths = [
            r"C:\Program Files\Google\Chrome"
            r"\Application\chrome.exe",
            r"C:\Program Files (x86)\Google\Chrome"
            r"\Application\chrome.exe",
            os.path.expanduser(
                r"~\AppData\Local\Google\Chrome"
                r"\Application\chrome.exe"
            ),
        ]
        for path in chrome_paths:
            if os.path.exists(path):
                webbrowser.register(
                    'chrome', None,
                    webbrowser.BackgroundBrowser(path)
                )
                webbrowser.get('chrome').open(url)
                print("[APP] ✅ Opened in Chrome (Windows)")
                return

        # Linux / Raspberry Pi
        for browser in ['google-chrome', 'chromium-browser',
                         'chromium', 'firefox']:
            try:
                webbrowser.get(browser).open(url)
                print(f"[APP] ✅ Opened in {browser}")
                return
            except Exception:
                continue

        # Fallback
        webbrowser.open(url)
        print("[APP] ✅ Opened in default browser")

    except Exception as e:
        print(f"[APP] ⚠️  Browser error: {e}")
        print(f"[APP] 👉 Open manually: {url}")


# =============================================================
# ── MAIN ENTRY POINT ─────────────────────────────────────────
# app.run() MUST BE LAST — nothing after this runs
# =============================================================
if __name__ == '__main__':
    host  = os.getenv('FLASK_HOST',  '0.0.0.0')
    port  = int(os.getenv('FLASK_PORT', '5000'))
    debug = os.getenv('FLASK_DEBUG', 'False').lower() == 'true'
    url   = f"http://localhost:{port}"

    print()
    print("=" * 55)
    print("  🫀  CardioCare AI — Starting")
    print("=" * 55)
    print(f"  Website dir : {WEBSITE_DIR}")
    print(f"  Server URL  : {url}")
    print(f"  Debug mode  : {debug}")
    print()
    print("  Routes registered:")
    for rule in sorted(app.url_map.iter_rules(),
                       key=lambda r: str(r)):
        print(f"    {str(rule)}")
    print("=" * 55)
    print()
    print("  Press CTRL+C to stop")
    print()

    # Open browser (Disabled on Vercel)
    if not os.getenv('VERCEL'):
        threading.Thread(
            target = open_browser,
            args   = (url,),
            daemon = True
        ).start()

    # START SERVER — MUST BE LAST LINE
    app.run(
        host         = host,
        port         = port,
        debug        = debug,
        use_reloader = False
    )