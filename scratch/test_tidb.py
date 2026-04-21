import os
import pymysql
import certifi
from dotenv import load_dotenv

# Load env from website/.env
load_dotenv('.env')

def test_connection():
    host = os.getenv('TIDB_HOST')
    port = int(os.getenv('TIDB_PORT', 4000))
    user = os.getenv('TIDB_USER')
    password = os.getenv('TIDB_PASSWORD')
    database = os.getenv('TIDB_DATABASE')

    print(f"DEBUG: Host={host}, User={user}")
    print(f"Testing connection to {host}...")
    
    try:
        conn = pymysql.connect(
            host=host,
            port=port,
            user=user,
            password=password,
            database=database,
            charset='utf8mb4',
            cursorclass=pymysql.cursors.DictCursor,
            connect_timeout=10,
            ssl={'ca': certifi.where()}
        )
        print("SUCCESS: Connected to TiDB Cloud with SSL!")
        
        with conn.cursor() as cursor:
            cursor.execute("SELECT VERSION();")
            version = cursor.fetchone()
            print(f"TiDB Version: {version['VERSION()']}")
            
            cursor.execute("SHOW TABLES;")
            tables = cursor.fetchall()
            print(f"Tables index: {tables}")
            
        conn.close()
    except Exception as e:
        print(f"FAILED: {str(e)}")

if __name__ == "__main__":
    test_connection()
