import os
import sys

# Add the parent directory to the path so we can import the backend folder
path = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if path not in sys.path:
    sys.path.insert(0, path)

# Add the backend directory itself to handles internal imports like 'import database'
backend_path = os.path.join(path, 'backend')
if backend_path not in sys.path:
    sys.path.insert(0, backend_path)

from backend.app import app

# This is required for Vercel to recognize the app
handler = app
