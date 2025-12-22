import sqlite3
import os

DB_PATH = 'instance/cycles.db'
if not os.path.exists(DB_PATH):
    DB_PATH = 'cycles.db'

print(f"Migrating database at: {DB_PATH}")

conn = sqlite3.connect(DB_PATH)
c = conn.cursor()

# Check if 'role' column exists in 'team_member' table
try:
    c.execute("SELECT role FROM team_member LIMIT 1")
    print("Column 'role' already exists.")
except sqlite3.OperationalError:
    print("Column 'role' missing. Adding it...")
    c.execute("ALTER TABLE team_member ADD COLUMN role VARCHAR(20) DEFAULT 'MEMBER'")
    # Set existing members as MEMBERS. 
    # Ideally, we'd set the Team Creator as ADMIN, but we don't track who created it easily unless we infer from 'Admin' name?
    # Strategy: Set EVERYONE as ADMIN for legacy teams so they don't lose access. 
    # Or just set everyone to MEMBER and let them be safer? 
    # User said "disband is only done by admin". If I set to MEMBER, no one can disband.
    # Safest upgrade path: Set *current* APPROVED members to ADMIN? Or just the first one?
    # Let's set ALL current members to ADMIN to prevent lockout, and new members will be MEMBER.
    c.execute("UPDATE team_member SET role = 'ADMIN' WHERE status = 'APPROVED'")
    print("Added 'role' column and set existing APPROVED members to ADMIN.")

conn.commit()
conn.close()
print("Migration complete.")
