# =============================================================
# CardioCare AI — TiDB Database Manager (MySQL Compatible)
# Distributed SQL for High Availability
# =============================================================

import pymysql
import pymysql.cursors
import os
import hashlib
import uuid
import datetime
import random
import certifi
from dotenv import load_dotenv

# Load .env
load_dotenv()

# =============================================================
# CONNECTION CONFIG
# =============================================================
TIDB_HOST = os.environ.get('TIDB_HOST', 'localhost')
TIDB_PORT = int(os.environ.get('TIDB_PORT', 4000))
TIDB_USER = os.environ.get('TIDB_USER', 'root')
TIDB_PASS = os.environ.get('TIDB_PASSWORD', '')
TIDB_NAME = os.environ.get('TIDB_DATABASE', 'cardiocare')

def get_connection(with_db=True):
    """Get TiDB (MySQL) connection"""
    conn_params = {
        'host': TIDB_HOST,
        'port': TIDB_PORT,
        'user': TIDB_USER,
        'password': TIDB_PASS,
        'cursorclass': pymysql.cursors.DictCursor,
        'autocommit': True,
        'ssl': {'ca': certifi.where()}
    }
    
    if with_db:
        conn_params['database'] = TIDB_NAME

    try:
        return pymysql.connect(**conn_params)
    except pymysql.err.OperationalError as e:
        if e.args[0] == 1049 and with_db: # Unknown database
            print(f"[DB] Database '{TIDB_NAME}' does not exist. Creating it...")
            try:
                # Connect without database and create it
                root_conn = get_connection(with_db=False)
                if root_conn:
                    with root_conn.cursor() as cur:
                        cur.execute(f"CREATE DATABASE IF NOT EXISTS {TIDB_NAME}")
                    root_conn.close()
                    # Now try connecting again with the database
                    return pymysql.connect(**conn_params)
            except Exception as e2:
                print(f"[DB] Failed to create database: {e2}")
        
        print(f"[DB] Connection Error: {e}")
        return None
    except Exception as e:
        print(f"[DB] General Error: {e}")
        return None

# =============================================================
# INITIALIZE DATABASE
# =============================================================
def init_database():
    """Create all tables on first run + load admin from .env"""
    conn = get_connection()
    if not conn:
        print("[DB] Could not initialize database - check credentials.")
        return

    try:
        with conn.cursor() as cur:
            # ── Patients Table ────────────────────────────────────────
            cur.execute('''
                CREATE TABLE IF NOT EXISTS patients (
                    id               INT PRIMARY KEY AUTO_INCREMENT,
                    patient_id       VARCHAR(50) UNIQUE NOT NULL,
                    name             VARCHAR(255) NOT NULL,
                    age              INT NOT NULL,
                    weight           FLOAT NOT NULL,
                    gender           VARCHAR(20) NOT NULL,
                    contact          VARCHAR(50) DEFAULT '',
                    medical_history  TEXT,
                    registered_on    DATETIME NOT NULL,
                    INDEX idx_name (name),
                    INDEX idx_contact (contact)
                )
            ''')

            # ── Readings Table ────────────────────────────────────────
            cur.execute('''
                CREATE TABLE IF NOT EXISTS readings (
                    id                 INT PRIMARY KEY AUTO_INCREMENT,
                    patient_id         VARCHAR(50) NOT NULL,
                    timestamp          DATETIME NOT NULL,
                    heart_rate         FLOAT DEFAULT 0,
                    spo2               FLOAT DEFAULT 0,
                    sbp                FLOAT DEFAULT 0,
                    dbp                FLOAT DEFAULT 0,
                    ptt_ms             FLOAT DEFAULT 0,
                    arrhythmia_risk    FLOAT DEFAULT 0,
                    arrhythmia_type    VARCHAR(100) DEFAULT '',
                    heartattack_risk   FLOAT DEFAULT 0,
                    stroke_risk        FLOAT DEFAULT 0,
                    hypertension_risk  FLOAT DEFAULT 0,
                    overall_condition  TEXT,
                    future_risk        TEXT,
                    INDEX idx_patient (patient_id)
                )
            ''')

            # ── Admin Table ───────────────────────────────────────────
            cur.execute('''
                CREATE TABLE IF NOT EXISTS admin (
                    id        INT PRIMARY KEY AUTO_INCREMENT,
                    username  VARCHAR(100) UNIQUE NOT NULL,
                    password  VARCHAR(255) NOT NULL,
                    token     VARCHAR(255) DEFAULT ''
                )
            ''')

            # ── Seed Admin User ───────────────────────────────────────
            admin_user = os.environ.get('ADMIN_USERNAME', 'admin')
            admin_pass = os.environ.get('ADMIN_PASSWORD', 'admin123')
            admin_hash = hashlib.sha256(admin_pass.encode()).hexdigest()

            cur.execute("SELECT id FROM admin WHERE username = %s", (admin_user,))
            if not cur.fetchone():
                cur.execute("INSERT INTO admin (username, password) VALUES (%s, %s)",
                             (admin_user, admin_hash))
                print(f"[DB] Seeded admin user: {admin_user}")

            # ── Seed Sample Data if empty ─────────────────────────────
            cur.execute("SELECT COUNT(*) as count FROM patients")
            if cur.fetchone()['count'] == 0:
                print("[DB] Seeding database with sample data...")
                seed_sample_data(conn)

        print("[DB] Database logic successfully initialized.")
    except Exception as e:
        print(f"[DB] Initialization Error: {e}")
    finally:
        conn.close()

def seed_sample_data(conn):
    """Populate with sample data if the patients table is empty"""
    samples = [
        ('58806', 'Adari Hanish', 21, 72.5, 'Male',   '9876543210', 'None'),
        ('10234', 'Sarah Miller', 45, 64.0, 'Female', '9988776655', 'Hypertension'),
        ('44219', 'Robert Chen',  62, 81.0, 'Male',   '8877665544', 'Type 2 Diabetes')
    ]

    with conn.cursor() as cur:
        for pid, name, age, weight, gender, contact, history in samples:
            registered = (datetime.datetime.now() - datetime.timedelta(days=7))
            cur.execute('''
                INSERT INTO patients (patient_id, name, age, weight, gender, contact, medical_history, registered_on)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            ''', (pid, name, age, weight, gender, contact, history, registered))

            # Add 2-3 sample readings for each patient
            for i in range(random.randint(2, 4)):
                ts = (datetime.datetime.now() - datetime.timedelta(days=i, hours=random.randint(1, 12)))
                hr = random.randint(65, 85)
                sp = random.randint(95, 99)
                risk = random.uniform(5, 35) if i > 0 else random.uniform(30, 75)
                
                cur.execute('''
                    INSERT INTO readings (patient_id, timestamp, heart_rate, spo2, sbp, dbp, 
                                         arrhythmia_risk, heartattack_risk, stroke_risk, hypertension_risk)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ''', (pid, ts, hr, sp, 120 + i, 80 + i, risk, risk*0.8, risk*0.5, risk+5))
    print("[DB] Seeding complete")

# =============================================================
# PATIENT FUNCTIONS
# =============================================================
def generate_patient_id():
    """Generate unique 5-digit random patient ID (e.g. 34213)"""
    conn = get_connection()
    if not conn: return str(random.randint(10000, 99999))
    
    try:
        with conn.cursor() as cur:
            while True:
                new_id = str(random.randint(10000, 99999))
                cur.execute("SELECT patient_id FROM patients WHERE patient_id = %s", (new_id,))
                if not cur.fetchone():
                    return new_id
    finally:
        conn.close()

def register_patient(name, age, weight, gender, contact='', medical_history=''):
    """Register a new patient"""
    conn = get_connection()
    if not conn: return {"success": False, "message": "Database connection failed"}
    
    pid = generate_patient_id()
    registered = datetime.datetime.now()

    try:
        with conn.cursor() as cur:
            cur.execute('''
                INSERT INTO patients (patient_id, name, age, weight, gender, contact, medical_history, registered_on)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            ''', (pid, name, age, weight, gender, contact, medical_history, registered))
        return {"success": True, "patient_id": pid}
    except Exception as e:
        return {"success": False, "message": str(e)}
    finally:
        conn.close()

def search_patients(query, page=1, per_page=10):
    """Fuzzy search patients by ID, Name or Contact (Google-style)"""
    conn = get_connection()
    if not conn: return {"success": False, "patients": [], "total": 0}
    
    try:
        with conn.cursor() as cur:
            q = f"%{query}%"
            # Count total
            cur.execute('''
                SELECT COUNT(*) as count 
                FROM   patients 
                WHERE  patient_id LIKE %s 
                   OR  LOWER(name) LIKE LOWER(%s)
                   OR  contact LIKE %s
            ''', (q, q, q))
            total = cur.fetchone()['count']
            
            offset = (page - 1) * per_page
            cur.execute('''
                SELECT p.*, 
                       COUNT(r.id)      AS reading_count,
                       MAX(r.timestamp) AS last_visit
                FROM   patients p
                LEFT JOIN readings r ON p.patient_id = r.patient_id
                WHERE  p.patient_id LIKE %s 
                   OR  LOWER(p.name) LIKE LOWER(%s)
                   OR  p.contact LIKE %s
                GROUP  BY p.id
                ORDER  BY p.registered_on DESC
                LIMIT %s OFFSET %s
            ''', (q, q, q, per_page, offset))
            
            rows = cur.fetchall()
            for row in rows:
                if row['registered_on']: row['registered_on'] = str(row['registered_on'])
                if row['last_visit']: row['last_visit'] = str(row['last_visit'])
            
            return {"success": True, "patients": rows, "total": total}
    finally:
        conn.close()

def get_patient_by_id(patient_id):
    """Fetch single patient by exact ID"""
    conn = get_connection()
    if not conn: return None
    try:
        with conn.cursor() as cur:
            cur.execute('''
                SELECT p.*, COUNT(r.id) AS reading_count, MAX(r.timestamp) AS last_visit
                FROM   patients p
                LEFT JOIN readings r ON p.patient_id = r.patient_id
                WHERE  p.patient_id = %s
                GROUP  BY p.id
            ''', (patient_id,))
            row = cur.fetchone()
            if row:
                if row['registered_on']: row['registered_on'] = str(row['registered_on'])
                if row['last_visit']: row['last_visit'] = str(row['last_visit'])
            return row
    finally:
        conn.close()

def get_patient_readings(patient_id):
    """Get all readings for a patient (newest first)"""
    conn = get_connection()
    if not conn: return []
    try:
        with conn.cursor() as cur:
            cur.execute('SELECT * FROM readings WHERE patient_id = %s ORDER BY timestamp DESC', (patient_id,))
            rows = cur.fetchall()
            for r in rows:
                if r['timestamp']: r['timestamp'] = str(r['timestamp'])
            return rows
    finally:
        conn.close()

def get_patients_by_age(age):
    """Get patients within ±5 years of given age"""
    conn = get_connection()
    if not conn: return []
    try:
        with conn.cursor() as cur:
            cur.execute('''
                SELECT p.*, COUNT(r.id) AS reading_count
                FROM   patients p
                LEFT JOIN readings r ON p.patient_id = r.patient_id
                WHERE  p.age BETWEEN %s AND %s
                GROUP  BY p.id
                ORDER  BY p.age
            ''', (max(0, age - 5), age + 5))
            rows = cur.fetchall()
            for r in rows:
                if r['registered_on']: r['registered_on'] = str(r['registered_on'])
            return rows
    finally:
        conn.close()

def get_all_patients(query='', page=1, per_page=50):
    """Get patients with optional search and pagination (admin)"""
    if query:
        return search_patients(query, page, per_page)
    
    conn = get_connection()
    if not conn: return {"success": False, "patients": [], "total": 0}
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) as count FROM patients")
            total = cur.fetchone()['count']
            
            offset = (page - 1) * per_page
            cur.execute('''
                SELECT p.*, COUNT(r.id) AS reading_count, MAX(r.timestamp) AS last_visit
                FROM   patients p
                LEFT JOIN readings r ON p.patient_id = r.patient_id
                GROUP  BY p.id
                ORDER  BY p.registered_on DESC
                LIMIT %s OFFSET %s
            ''', (per_page, offset))
            rows = cur.fetchall()
            for r in rows:
                if r['registered_on']: r['registered_on'] = str(r['registered_on'])
                if r['last_visit']: r['last_visit'] = str(r['last_visit'])
            return {"success": True, "patients": rows, "total": total}
    finally:
        conn.close()

def get_active_patients(query='', page=1, per_page=50):
    """Get patients who have at least one reading (Paginated + Filtered)"""
    conn = get_connection()
    if not conn: return {"success": False, "patients": [], "total": 0}
    try:
        with conn.cursor() as cur:
            q_str = f"%{query}%"
            where_clause = "HAVING reading_count > 0"
            if query:
                where_clause = f"WHERE (p.patient_id LIKE %s OR LOWER(p.name) LIKE LOWER(%s) OR p.contact LIKE %s) {where_clause}"
            
            # Subquery for total count is needed for HAVING
            cur.execute(f'''
                SELECT COUNT(*) as count FROM (
                    SELECT p.id, COUNT(r.id) as reading_count
                    FROM patients p
                    LEFT JOIN readings r ON p.patient_id = r.patient_id
                    {f"WHERE p.patient_id LIKE %s OR LOWER(p.name) LIKE LOWER(%s) OR p.contact LIKE %s" if query else ""}
                    GROUP BY p.id
                    HAVING reading_count > 0
                ) as active_pts
            ''', (q_str, q_str, q_str) if query else ())
            total = cur.fetchone()['count']

            offset = (page - 1) * per_page
            cur.execute(f'''
                SELECT p.*, COUNT(r.id) AS reading_count, MAX(r.timestamp) AS last_visit
                FROM   patients p
                LEFT JOIN readings r ON p.patient_id = r.patient_id
                {f"WHERE p.patient_id LIKE %s OR LOWER(p.name) LIKE LOWER(%s) OR p.contact LIKE %s" if query else ""}
                GROUP  BY p.id
                HAVING reading_count > 0
                ORDER  BY last_visit DESC
                LIMIT %s OFFSET %s
            ''', ( (q_str, q_str, q_str, per_page, offset) if query else (per_page, offset) ))
            
            rows = cur.fetchall()
            for r in rows:
                if r['registered_on']: r['registered_on'] = str(r['registered_on'])
                if r['last_visit']: r['last_visit'] = str(r['last_visit'])
            return {"success": True, "patients": rows, "total": total}
    finally:
        conn.close()

def get_all_readings(page=1, per_page=100):
    """Get all readings newest first (admin)"""
    conn = get_connection()
    if not conn: return {"success": False, "readings": [], "total": 0}
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) as count FROM readings")
            total = cur.fetchone()['count']
            
            offset = (page - 1) * per_page
            cur.execute('SELECT * FROM readings ORDER BY timestamp DESC LIMIT %s OFFSET %s', (per_page, offset))
            rows = cur.fetchall()
            for r in rows:
                if r['timestamp']: r['timestamp'] = str(r['timestamp'])
            return {"success": True, "readings": rows, "total": total}
    finally:
        conn.close()

# =============================================================
# READINGS SAVE
# =============================================================
def save_reading(patient_id, vitals, predictions, future):
    """Save a complete reading to the database"""
    conn = get_connection()
    if not conn: return False
    timestamp = datetime.datetime.now()
    try:
        with conn.cursor() as cur:
            cur.execute('''
                INSERT INTO readings
                (patient_id, timestamp, heart_rate, spo2, sbp, dbp, ptt_ms,
                 arrhythmia_risk, arrhythmia_type, heartattack_risk, stroke_risk,
                 hypertension_risk, overall_condition, future_risk)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ''', (
                patient_id, timestamp,
                vitals.get('heart_rate', 0), vitals.get('spo2', 0),
                predictions.get('hypertension', {}).get('est_sbp', 0),
                predictions.get('hypertension', {}).get('est_dbp', 0),
                predictions.get('hypertension', {}).get('ptt_ms',  0),
                predictions.get('arrhythmia',   {}).get('risk_pct', 0),
                predictions.get('arrhythmia',   {}).get('type', ''),
                predictions.get('heartattack',  {}).get('risk_pct', 0),
                predictions.get('stroke',       {}).get('risk_pct', 0),
                predictions.get('hypertension', {}).get('risk_pct', 0),
                future.get('overall', ''), future.get('overall', ''),
            ))
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
    if not conn: return {"total_patients": 0, "total_readings": 0, "today_readings": 0, "db_size_mb": 0}
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) as count FROM patients")
            total_patients = cur.fetchone()['count']
            cur.execute("SELECT COUNT(*) as count FROM readings")
            total_readings = cur.fetchone()['count']
            today = datetime.date.today()
            cur.execute("SELECT COUNT(*) as count FROM readings WHERE DATE(timestamp) = %s", (today,))
            today_readings = cur.fetchone()['count']
            
            # DB size is harder to get in TiDB Cloud without special perms, returning 0
            return {
                "total_patients" : total_patients,
                "total_readings" : total_readings,
                "today_readings" : today_readings,
                "db_size_mb"     : 0,
            }
    finally:
        conn.close()

# =============================================================
# ADMIN AUTH
# =============================================================
def admin_login(username, password):
    """Verify admin credentials and return session token"""
    conn = get_connection()
    if not conn: return {"success": False}
    hashed = hashlib.sha256(password.encode()).hexdigest()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM admin WHERE username = %s AND password = %s", (username, hashed))
            if cur.fetchone():
                token = str(uuid.uuid4())
                cur.execute("UPDATE admin SET token = %s WHERE username = %s", (token, username))
                return {"success": True, "token": token}
        return {"success": False}
    finally:
        conn.close()

def verify_token(token):
    """Verify admin session token"""
    if not token: return False
    conn = get_connection()
    if not conn: return False
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM admin WHERE token = %s", (token,))
            return cur.fetchone() is not None
    finally:
        conn.close()

def update_credentials(token, new_username, new_password):
    """Update admin credentials"""
    if not verify_token(token): return False
    hashed = hashlib.sha256(new_password.encode()).hexdigest()
    conn = get_connection()
    if not conn: return False
    try:
        with conn.cursor() as cur:
            cur.execute("UPDATE admin SET username = %s, password = %s WHERE token = %s", (new_username, hashed, token))
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
    """Delete a patient and ALL their readings"""
    if not verify_token(token): return {"success": False, "message": "Unauthorized"}
    conn = get_connection()
    if not conn: return {"success": False, "message": "Connection failed"}
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT name FROM patients WHERE patient_id = %s", (patient_id,))
            patient = cur.fetchone()
            if not patient: return {"success": False, "message": "Patient not found"}
            name = patient['name']
            cur.execute("DELETE FROM readings WHERE patient_id = %s", (patient_id,))
            readings_deleted = cur.rowcount
            cur.execute("DELETE FROM patients WHERE patient_id = %s", (patient_id,))
            return {"success": True, "message": f"Patient {name} deleted", "readings_deleted": readings_deleted}
    except Exception as e:
        return {"success": False, "message": str(e)}
    finally:
        conn.close()

def add_admin(username, password):
    """Add a new administrator"""
    conn = get_connection()
    if not conn: return {"success": False, "message": "Database connection failed"}
    hashed = hashlib.sha256(password.encode()).hexdigest()
    try:
        with conn.cursor() as cur:
            # Check if exists
            cur.execute("SELECT id FROM admin WHERE username = %s", (username,))
            if cur.fetchone():
                return {"success": False, "message": "Username already exists"}
            
            cur.execute("INSERT INTO admin (username, password) VALUES (%s, %s)", (username, hashed))
            return {"success": True, "message": f"Admin {username} added successfully"}
    except Exception as e:
        return {"success": False, "message": str(e)}
    finally:
        conn.close()

def get_raw_value(table_name, row_id, column_name):
    """Get unmasked value for a specific cell (internal use only)"""
    allowed_tables = ['admin']
    if table_name not in allowed_tables: return None
    
    conn = get_connection()
    if not conn: return None
    try:
        with conn.cursor() as cur:
            cur.execute(f"SELECT {column_name} FROM {table_name} WHERE id = %s", (row_id,))
            row = cur.fetchone()
            return row[column_name] if row else None
    except Exception as e:
        print(f"[DB] Error revealing value: {e}")
        return None
    finally:
        conn.close()

def delete_reading(reading_id, token):
    """Delete a single reading by ID"""
    if not verify_token(token): return {"success": False, "message": "Unauthorized"}
    conn = get_connection()
    if not conn: return {"success": False, "message": "Connection failed"}
    try:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM readings WHERE id = %s", (reading_id,))
            if cur.rowcount == 0: return {"success": False, "message": "Reading not found"}
            return {"success": True, "message": f"Reading {reading_id} deleted"}
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
    if not conn: return []
    try:
        with conn.cursor() as cur:
            cur.execute("SHOW TABLES")
            return [list(row.values())[0] for row in cur.fetchall()]
    finally:
        conn.close()

def get_table_info(table_name):
    """Get column names and types for a table"""
    allowed_tables = ['patients', 'readings', 'admin']
    if table_name not in allowed_tables: return {"success": False, "message": "Invalid table"}
    conn = get_connection()
    if not conn: return {"success": False, "message": "Connection failed"}
    try:
        with conn.cursor() as cur:
            cur.execute(f"DESCRIBE {table_name}")
            columns = [{"name": r['Field'], "type": r['Type']} for r in cur.fetchall()]
            cur.execute(f"SELECT COUNT(*) as count FROM {table_name}")
            row_count = cur.fetchone()['count']
            return {"success": True, "table_name": table_name, "columns": columns, "row_count": row_count}
    finally:
        conn.close()

def get_table_data(table_name, page=1, per_page=50, search='', sort_by='id', sort_order='DESC'):
    """Get paginated data from a table"""
    allowed_tables = ['patients', 'readings', 'admin']
    if table_name not in allowed_tables: return {"success": False, "message": "Invalid table"}
    conn = get_connection()
    if not conn: return {"success": False, "message": "Connection failed"}
    try:
        with conn.cursor() as cur:
            # Validate sort column
            cur.execute(f"DESCRIBE {table_name}")
            columns = [r['Field'] for r in cur.fetchall()]
            if sort_by not in columns: sort_by = 'id'
            sort_order = 'DESC' if sort_order.upper() == 'DESC' else 'ASC'
            
            # Simple search logic
            where_clause = ""
            params = []
            if search:
                search_val = f"%{search}%"
                search_conds = []
                for col in columns:
                    # In MySQL/TiDB, we can search in most columns using LIKE
                    search_conds.append(f"CAST({col} AS CHAR) LIKE %s")
                    params.append(search_val)
                where_clause = "WHERE " + " OR ".join(search_conds)
            
            cur.execute(f"SELECT COUNT(*) as count FROM {table_name} {where_clause}", params)
            total_rows = cur.fetchone()['count']
            total_pages = max(1, (total_rows + per_page - 1) // per_page)
            page = max(1, min(page, total_pages))
            offset = (page - 1) * per_page
            
            cur.execute(f"SELECT * FROM {table_name} {where_clause} ORDER BY {sort_by} {sort_order} LIMIT %s OFFSET %s", params + [per_page, offset])
            rows = cur.fetchall()
            for r in rows:
                for k, v in r.items():
                    if isinstance(v, (datetime.datetime, datetime.date)): r[k] = str(v)
                    if table_name == 'admin' and k in ['password', 'token']: r[k] = '••••••••'
            
            return {"success": True, "table_name": table_name, "columns": columns, "rows": rows, "total_rows": total_rows, "page": page, "per_page": per_page, "total_pages": total_pages}
    finally:
        conn.close()