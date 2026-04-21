# =============================================================
# CardioCare AI — SQLite Database Manager
# Runs on Raspberry Pi
# =============================================================

import sqlite3
import os
import hashlib
import uuid
import datetime
import random
from dotenv import load_dotenv

# Load .env FIRST
load_dotenv()

# DB path from .env (with fallback)
# On Vercel, we must use /tmp since it's the only writable directory
if os.getenv('VERCEL'):
    DB_PATH = '/tmp/cardiocare.db'
    print(f"[DB] Running on Vercel - Using temporary DB: {DB_PATH}")
else:
    env_db_path = os.getenv('DB_PATH', 'cardiocare.db')
    if os.path.isabs(env_db_path):
        DB_PATH = env_db_path
    else:
        # Resolve relative to the backend directory
        DB_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), env_db_path))

# =============================================================
# CONNECTION
# =============================================================
def get_connection():
    """Get SQLite connection"""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

# =============================================================
# INITIALIZE DATABASE
# =============================================================
def init_database():
    """Create all tables on first run + load admin from .env"""
    conn = get_connection()
    cur  = conn.cursor()

    # ── Patients Table ────────────────────────────────────────
    cur.execute('''
        CREATE TABLE IF NOT EXISTS patients (
            id               INTEGER PRIMARY KEY AUTOINCREMENT,
            patient_id       TEXT    UNIQUE NOT NULL,
            name             TEXT    NOT NULL,
            age              INTEGER NOT NULL,
            weight           REAL    NOT NULL,
            gender           TEXT    NOT NULL,
            contact          TEXT    DEFAULT '',
            medical_history  TEXT    DEFAULT '',
            registered_on    TEXT    NOT NULL
        )
    ''')

    # ── Readings Table ────────────────────────────────────────
    cur.execute('''
        CREATE TABLE IF NOT EXISTS readings (
            id                 INTEGER PRIMARY KEY AUTOINCREMENT,
            patient_id         TEXT    NOT NULL,
            timestamp          TEXT    NOT NULL,
            heart_rate         REAL    DEFAULT 0,
            spo2               REAL    DEFAULT 0,
            sbp                REAL    DEFAULT 0,
            dbp                REAL    DEFAULT 0,
            ptt_ms             REAL    DEFAULT 0,
            arrhythmia_risk    REAL    DEFAULT 0,
            arrhythmia_type    TEXT    DEFAULT '',
            heartattack_risk   REAL    DEFAULT 0,
            stroke_risk        REAL    DEFAULT 0,
            hypertension_risk  REAL    DEFAULT 0,
            overall_condition  TEXT    DEFAULT '',
            future_risk        TEXT    DEFAULT '',
            FOREIGN KEY (patient_id)
                REFERENCES patients(patient_id)
        )
    ''')

    # ── Admin Table ───────────────────────────────────────────
    cur.execute('''
        CREATE TABLE IF NOT EXISTS admin (
            id        INTEGER PRIMARY KEY AUTOINCREMENT,
            username  TEXT UNIQUE NOT NULL,
            password  TEXT NOT NULL,
            token     TEXT DEFAULT ''
        )
    ''')

    # ── Insert Admin From .env ────────────────────────────────
    admin_user = os.getenv('ADMIN_USERNAME', 'admin')
    admin_pass = os.getenv('ADMIN_PASSWORD', 'admin123')
    admin_hash = hashlib.sha256(
        admin_pass.encode()
    ).hexdigest()

    cur.execute('''
        INSERT OR IGNORE INTO admin (username, password)
        VALUES (?, ?)
    ''', (admin_user, admin_hash))

    conn.commit()
    conn.close()

    print(f"[DB] Database ready       : {DB_PATH}")
    print(f"[DB] Admin user from .env : {admin_user}")

    # ── Seed Sample Data if empty ─────────────────────────────
    seed_sample_data()

def seed_sample_data():
    """Populate with sample data if the patients table is empty"""
    conn = get_connection()
    cur  = conn.cursor()

    cur.execute("SELECT COUNT(*) FROM patients")
    if cur.fetchone()[0] > 0:
        conn.close()
        return

    print("[DB] 🧬 Seeding database with sample data...")

    samples = [
        ('58806', 'Adari Hanish', 21, 72.5, 'Male',   '9876543210', 'None'),
        ('10234', 'Sarah Miller', 45, 64.0, 'Female', '9988776655', 'Hypertension'),
        ('44219', 'Robert Chen',  62, 81.0, 'Male',   '8877665544', 'Type 2 Diabetes')
    ]

    for pid, name, age, weight, gender, contact, history in samples:
        registered = (datetime.datetime.now() - datetime.timedelta(days=7)).isoformat()
        cur.execute('''
            INSERT INTO patients (patient_id, name, age, weight, gender, contact, medical_history, registered_on)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ''', (pid, name, age, weight, gender, contact, history, registered))

        # Add 2-3 sample readings for each patient
        for i in range(random.randint(2, 4)):
            ts = (datetime.datetime.now() - datetime.timedelta(days=i, hours=random.randint(1, 12))).isoformat()
            hr = random.randint(65, 85)
            sp = random.randint(95, 99)
            risk = random.uniform(5, 35) if i > 0 else random.uniform(30, 75)
            
            cur.execute('''
                INSERT INTO readings (patient_id, timestamp, heart_rate, spo2, sbp, dbp, 
                                     arrhythmia_risk, heartattack_risk, stroke_risk, hypertension_risk)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (pid, ts, hr, sp, 120 + i, 80 + i, risk, risk*0.8, risk*0.5, risk+5))

    conn.commit()
    conn.close()
    print("[DB] ✅ Seeding complete")

# =============================================================
# PATIENT FUNCTIONS
# =============================================================
def generate_patient_id():
    """Generate unique 5-digit random patient ID (e.g. 34213)"""
    conn = get_connection()
    cur  = conn.cursor()

    while True:
        # Generate random 5-digit number (10000 to 99999)
        new_id = str(random.randint(10000, 99999))
        
        # Check if it already exists
        cur.execute("SELECT patient_id FROM patients WHERE patient_id = ?", (new_id,))
        if not cur.fetchone():
            conn.close()
            return new_id

def register_patient(name, age, weight, gender,
                      contact='', medical_history=''):
    """Register a new patient"""
    conn       = get_connection()
    cur        = conn.cursor()
    pid        = generate_patient_id()
    registered = datetime.datetime.now().isoformat()

    try:
        cur.execute('''
            INSERT INTO patients
            (patient_id, name, age, weight, gender,
             contact, medical_history, registered_on)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            pid, name, age, weight,
            gender, contact, medical_history, registered
        ))
        conn.commit()
        return {"success": True, "patient_id": pid}

    except Exception as e:
        return {"success": False, "message": str(e)}

    finally:
        conn.close()

def search_patient(query):
    """Search patient by ID or name"""
    conn = get_connection()
    cur  = conn.cursor()

    cur.execute('''
        SELECT p.*,
               COUNT(r.id)      AS reading_count,
               MAX(r.timestamp) AS last_visit
        FROM   patients p
        LEFT JOIN readings r
               ON p.patient_id = r.patient_id
        WHERE  p.patient_id = ?
           OR  LOWER(p.name) LIKE LOWER(?)
        GROUP  BY p.patient_id
        LIMIT  1
    ''', (query.upper(), f'%{query}%'))

    row = cur.fetchone()
    conn.close()

    if not row:
        return None
    return dict(row)

def get_patient_readings(patient_id):
    """Get all readings for a patient (newest first)"""
    conn = get_connection()
    cur  = conn.cursor()

    cur.execute('''
        SELECT * FROM readings
        WHERE  patient_id = ?
        ORDER  BY timestamp DESC
    ''', (patient_id,))

    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows

def get_patients_by_age(age):
    """Get patients within ±5 years of given age"""
    conn = get_connection()
    cur  = conn.cursor()

    cur.execute('''
        SELECT p.*,
               COUNT(r.id) AS reading_count
        FROM   patients p
        LEFT JOIN readings r
               ON p.patient_id = r.patient_id
        WHERE  p.age BETWEEN ? AND ?
        GROUP  BY p.patient_id
        ORDER  BY p.age
    ''', (max(0, age - 5), age + 5))

    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows

def get_all_patients():
    """Get all patients with reading count (admin)"""
    conn = get_connection()
    cur  = conn.cursor()

    cur.execute('''
        SELECT p.*,
               COUNT(r.id)      AS reading_count,
               MAX(r.timestamp) AS last_visit
        FROM   patients p
        LEFT JOIN readings r
               ON p.patient_id = r.patient_id
        GROUP  BY p.patient_id
        ORDER  BY p.registered_on DESC
    ''')

    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows

def get_all_readings(limit=100):
    """Get all readings newest first (admin)"""
    conn = get_connection()
    cur  = conn.cursor()

    cur.execute('''
        SELECT * FROM readings
        ORDER  BY timestamp DESC
        LIMIT  ?
    ''', (limit,))

    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows

# =============================================================
# READINGS SAVE
# =============================================================
def save_reading(patient_id, vitals, predictions, future):
    """Save a complete reading to the database"""
    conn      = get_connection()
    cur       = conn.cursor()
    timestamp = datetime.datetime.now().isoformat()

    try:
        cur.execute('''
            INSERT INTO readings
            (patient_id, timestamp,
             heart_rate, spo2, sbp, dbp, ptt_ms,
             arrhythmia_risk, arrhythmia_type,
             heartattack_risk, stroke_risk,
             hypertension_risk,
             overall_condition, future_risk)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            patient_id,
            timestamp,
            vitals.get('heart_rate', 0),
            vitals.get('spo2', 0),
            predictions.get('hypertension', {}).get('est_sbp', 0),
            predictions.get('hypertension', {}).get('est_dbp', 0),
            predictions.get('hypertension', {}).get('ptt_ms',  0),
            predictions.get('arrhythmia',   {}).get('risk_pct', 0),
            predictions.get('arrhythmia',   {}).get('type', ''),
            predictions.get('heartattack',  {}).get('risk_pct', 0),
            predictions.get('stroke',       {}).get('risk_pct', 0),
            predictions.get('hypertension', {}).get('risk_pct', 0),
            future.get('overall', ''),
            future.get('overall', ''),
        ))
        conn.commit()
        return True

    except Exception as e:
        print(f"[DB] Save reading error: {e}")
        return False

    finally:
        conn.close()

# =============================================================
# STATS
# =============================================================
def get_stats():
    """Get database statistics for dashboard"""
    conn = get_connection()
    cur  = conn.cursor()

    cur.execute("SELECT COUNT(*) FROM patients")
    total_patients = cur.fetchone()[0]

    cur.execute("SELECT COUNT(*) FROM readings")
    total_readings = cur.fetchone()[0]

    today = datetime.date.today().isoformat()
    cur.execute(
        "SELECT COUNT(*) FROM readings WHERE timestamp LIKE ?",
        (f'{today}%',)
    )
    today_readings = cur.fetchone()[0]

    conn.close()

    db_size = (
        round(os.path.getsize(DB_PATH) / (1024 * 1024), 2)
        if os.path.exists(DB_PATH) else 0
    )

    return {
        "total_patients" : total_patients,
        "total_readings" : total_readings,
        "today_readings" : today_readings,
        "db_size_mb"     : db_size,
    }

# =============================================================
# ADMIN AUTH
# =============================================================
def admin_login(username, password):
    """Verify admin credentials and return session token"""
    conn   = get_connection()
    cur    = conn.cursor()
    hashed = hashlib.sha256(password.encode()).hexdigest()

    cur.execute(
        "SELECT * FROM admin WHERE username = ? AND password = ?",
        (username, hashed)
    )
    row = cur.fetchone()

    if row:
        token = str(uuid.uuid4())
        cur.execute(
            "UPDATE admin SET token = ? WHERE username = ?",
            (token, username)
        )
        conn.commit()
        conn.close()
        return {"success": True, "token": token}

    conn.close()
    return {"success": False}

def verify_token(token):
    """Verify admin session token"""
    if not token:
        return False

    conn = get_connection()
    cur  = conn.cursor()
    cur.execute("SELECT * FROM admin WHERE token = ?", (token,))
    row = cur.fetchone()
    conn.close()
    return row is not None

def update_credentials(token, new_username, new_password):
    """Update admin credentials"""
    if not verify_token(token):
        return False

    hashed = hashlib.sha256(new_password.encode()).hexdigest()
    conn   = get_connection()

    try:
        conn.execute(
            "UPDATE admin SET username = ?, password = ? "
            "WHERE token = ?",
            (new_username, hashed, token)
        )
        conn.commit()
        return True
    except Exception as e:
        print(f"[DB] Update creds error: {e}")
        return False
    finally:
        conn.close()
# =============================================================
# DELETE PATIENT
# =============================================================
def delete_patient(patient_id, token):
    """
    Delete a patient and ALL their readings.
    Requires valid admin token for safety.
    """
    if not verify_token(token):
        return {"success": False, "message": "Unauthorized"}

    conn = get_connection()
    cur  = conn.cursor()

    try:
        # Check patient exists first
        cur.execute(
            "SELECT * FROM patients WHERE patient_id = ?",
            (patient_id,)
        )
        patient = cur.fetchone()

        if not patient:
            return {
                "success": False,
                "message": f"Patient {patient_id} not found"
            }

        patient_name = patient['name']

        # Delete all readings first (foreign key)
        cur.execute(
            "DELETE FROM readings WHERE patient_id = ?",
            (patient_id,)
        )
        readings_deleted = cur.rowcount

        # Delete patient
        cur.execute(
            "DELETE FROM patients WHERE patient_id = ?",
            (patient_id,)
        )

        conn.commit()

        print(f"[DB] Deleted patient : {patient_id} ({patient_name})")
        print(f"[DB] Readings deleted: {readings_deleted}")

        return {
            "success"         : True,
            "message"         : f"Patient {patient_name} deleted",
            "patient_id"      : patient_id,
            "readings_deleted": readings_deleted
        }

    except Exception as e:
        print(f"[DB] Delete error: {e}")
        return {"success": False, "message": str(e)}

    finally:
        conn.close()


def delete_reading(reading_id, token):
    """
    Delete a single reading by ID.
    Requires valid admin token.
    """
    if not verify_token(token):
        return {"success": False, "message": "Unauthorized"}

    conn = get_connection()
    cur  = conn.cursor()

    try:
        cur.execute(
            "SELECT * FROM readings WHERE id = ?",
            (reading_id,)
        )
        reading = cur.fetchone()

        if not reading:
            return {
                "success": False,
                "message": f"Reading {reading_id} not found"
            }

        cur.execute(
            "DELETE FROM readings WHERE id = ?",
            (reading_id,)
        )
        conn.commit()

        return {
            "success"   : True,
            "message"   : f"Reading {reading_id} deleted",
            "reading_id": reading_id
        }

    except Exception as e:
        return {"success": False, "message": str(e)}

    finally:
        conn.close()
# =============================================================
# DATABASE TABLE VIEWER FUNCTIONS
# =============================================================
def get_table_names():
    """Get all table names in the database"""
    conn = get_connection()
    cur  = conn.cursor()
    cur.execute("""
        SELECT name FROM sqlite_master
        WHERE type = 'table'
        AND name NOT LIKE 'sqlite_%'
        ORDER BY name
    """)
    tables = [row['name'] for row in cur.fetchall()]
    conn.close()
    return tables


def get_table_info(table_name):
    """
    Get column names and types for a table.
    Uses PRAGMA to read table schema safely.
    """
    # Whitelist allowed table names to prevent SQL injection
    allowed_tables = ['patients', 'readings', 'admin']
    if table_name not in allowed_tables:
        return {
            "success" : False,
            "message" : f"Table '{table_name}' not allowed"
        }

    conn = get_connection()
    cur  = conn.cursor()

    # Get column info
    cur.execute(f"PRAGMA table_info({table_name})")
    columns = []
    for row in cur.fetchall():
        columns.append({
            "cid"     : row['cid'],
            "name"    : row['name'],
            "type"    : row['type'],
            "notnull" : row['notnull'],
            "pk"      : row['pk'],
        })

    # Get row count
    cur.execute(f"SELECT COUNT(*) as cnt FROM {table_name}")
    row_count = cur.fetchone()['cnt']

    conn.close()

    return {
        "success"   : True,
        "table_name": table_name,
        "columns"   : columns,
        "row_count" : row_count,
    }


def get_table_data(table_name, page=1, per_page=50,
                    search='', sort_by='id', sort_order='DESC'):
    """
    Get paginated data from a table.
    Includes search across all text columns.
    """
    allowed_tables = ['patients', 'readings', 'admin']
    if table_name not in allowed_tables:
        return {
            "success": False,
            "message": f"Table '{table_name}' not allowed"
        }

    conn = get_connection()
    cur  = conn.cursor()

    # Get column names first
    cur.execute(f"PRAGMA table_info({table_name})")
    columns = [row['name'] for row in cur.fetchall()]

    # Validate sort_by column
    if sort_by not in columns:
        sort_by = 'id'

    # Validate sort order
    sort_order = 'DESC' if sort_order.upper() == 'DESC' else 'ASC'

    # Build search condition
    search_clause = ""
    search_params = []

    if search and search.strip():
        # Search across all TEXT columns
        text_columns = []
        cur.execute(f"PRAGMA table_info({table_name})")
        for row in cur.fetchall():
            col_type = row['type'].upper()
            if col_type in ['TEXT', 'VARCHAR', '']:
                text_columns.append(row['name'])

        if text_columns:
            conditions = [
                f"CAST({col} AS TEXT) LIKE ?"
                for col in text_columns
            ]
            search_clause = "WHERE " + " OR ".join(conditions)
            search_params = [f"%{search}%"] * len(text_columns)

    # Get total count (with search)
    count_sql = f"SELECT COUNT(*) as cnt FROM {table_name} {search_clause}"
    cur.execute(count_sql, search_params)
    total_rows = cur.fetchone()['cnt']

    # Calculate pagination
    total_pages = max(1, (total_rows + per_page - 1) // per_page)
    page        = max(1, min(page, total_pages))
    offset      = (page - 1) * per_page

    # Get data
    data_sql = f"""
        SELECT * FROM {table_name}
        {search_clause}
        ORDER BY {sort_by} {sort_order}
        LIMIT ? OFFSET ?
    """
    cur.execute(data_sql, search_params + [per_page, offset])

    rows = []
    for row in cur.fetchall():
        row_dict = dict(row)
        # Mask password field for admin table
        if table_name == 'admin' and 'password' in row_dict:
            row_dict['password'] = '••••••••'
        if table_name == 'admin' and 'token' in row_dict:
            row_dict['token'] = '••••••••'
        rows.append(row_dict)

    conn.close()

    return {
        "success"     : True,
        "table_name"  : table_name,
        "columns"     : columns,
        "rows"        : rows,
        "total_rows"  : total_rows,
        "page"        : page,
        "per_page"    : per_page,
        "total_pages" : total_pages,
    }


def delete_row(table_name, row_id, token):
    """
    Delete a single row from any table by ID.
    Requires admin token for security.
    """
    if not verify_token(token):
        return {"success": False, "message": "Unauthorized"}

    allowed_tables = ['patients', 'readings']
    if table_name not in allowed_tables:
        return {
            "success": False,
            "message": f"Cannot delete from '{table_name}'"
        }

    conn = get_connection()
    cur  = conn.cursor()

    try:
        # If deleting patient, also delete their readings
        if table_name == 'patients':
            # Get patient_id first
            cur.execute(
                "SELECT patient_id FROM patients WHERE id = ?",
                (row_id,)
            )
            patient_row = cur.fetchone()

            if not patient_row:
                return {
                    "success": False,
                    "message": "Row not found"
                }

            pid = patient_row['patient_id']

            # Delete readings first
            cur.execute(
                "DELETE FROM readings WHERE patient_id = ?",
                (pid,)
            )
            readings_deleted = cur.rowcount

            # Delete patient
            cur.execute(
                "DELETE FROM patients WHERE id = ?",
                (row_id,)
            )
            conn.commit()

            return {
                "success"         : True,
                "message"         : f"Patient {pid} deleted",
                "readings_deleted": readings_deleted
            }

        else:
            # Delete from readings table
            cur.execute(
                f"DELETE FROM {table_name} WHERE id = ?",
                (row_id,)
            )
            deleted = cur.rowcount
            conn.commit()

            if deleted == 0:
                return {
                    "success": False,
                    "message": "Row not found"
                }

            return {
                "success": True,
                "message": f"Row {row_id} deleted from {table_name}"
            }

    except Exception as e:
        return {"success": False, "message": str(e)}

    finally:
        conn.close()