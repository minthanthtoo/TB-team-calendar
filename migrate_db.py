import sqlite3
import os
from datetime import datetime

def migrate():
    db_path = os.path.join('instance', 'cycles.db')
    if not os.path.exists(db_path):
        db_path = 'cycles.db' # Fallback to root if instance doesn't exist
    
    print(f"Connecting to: {db_path}")
    conn = sqlite3.connect(db_path)
    c = conn.cursor()
    
    print("Migrating Database...")

    # 1. Add columns to PATIENT table
    try:
        c.execute("ALTER TABLE patient ADD COLUMN team_id VARCHAR(50) DEFAULT 'DEFAULT'")
        print("Added patient.team_id")
    except Exception as e:
        print(f"Skipped patient.team_id: {e}")

    try:
        c.execute("ALTER TABLE patient ADD COLUMN updated_at TIMESTAMP")
        print("Added patient.updated_at")
    except Exception as e:
        print(f"Skipped patient.updated_at: {e}")

    # 2. Add columns to EVENT table
    try:
        c.execute("ALTER TABLE event ADD COLUMN updated_at TIMESTAMP")
        print("Added event.updated_at")
    except Exception as e:
        print(f"Skipped event.updated_at: {e}")

    # 3. Create TEAM table
    try:
        c.execute('''
            CREATE TABLE IF NOT EXISTS team (
                id INTEGER PRIMARY KEY,
                slug VARCHAR(50) UNIQUE NOT NULL,
                name VARCHAR(100) NOT NULL,
                invite_code VARCHAR(20) UNIQUE,
                created_at TIMESTAMP,
                created_by_uid VARCHAR(36)
            )
        ''')
        # Check if we need to add column (for existing tables)
        try:
             c.execute("ALTER TABLE team ADD COLUMN invite_code VARCHAR(20)")
             print("Added team.invite_code")
        except:
             pass 
        
        print("Ensured team table")
    except Exception as e:
        print(f"Error checking team table: {e}")

    # 4. Create TEAM_MEMBER table
    try:
        c.execute('''
            CREATE TABLE IF NOT EXISTS team_member (
                id INTEGER PRIMARY KEY,
                team_slug VARCHAR(50) NOT NULL,
                user_name VARCHAR(100) NOT NULL,
                device_id VARCHAR(100),
                status VARCHAR(20) DEFAULT 'PENDING',
                updated_at TIMESTAMP,
                FOREIGN KEY(team_slug) REFERENCES team(slug)
            )
        ''')
        print("Ensured team_member table")
    except Exception as e:
        print(f"Error checking team_member table: {e}")

    conn.commit()
    conn.close()
    print("Migration Complete.")

if __name__ == "__main__":
    migrate()
