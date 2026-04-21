import os
import sys

# Add backend to path
sys.path.append(os.path.join(os.getcwd(), 'backend'))

from database import init_database, get_connection

def verify_and_init():
    print("Initializing database on TiDB Cloud...")
    init_database()
    
    conn = get_connection()
    if conn:
        print("SUCCESS: Database initialized.")
        with conn.cursor() as cur:
            cur.execute("SHOW TABLES;")
            tables = cur.fetchall()
            print(f"Tables created: {[t for t in tables]}")
            
            cur.execute("SELECT COUNT(*) as count FROM patients;")
            count = cur.fetchone()
            print(f"Total patients (seeded): {count['count']}")
        conn.close()
    else:
        print("FAILED: Connection failed during verification.")

if __name__ == "__main__":
    verify_and_init()
