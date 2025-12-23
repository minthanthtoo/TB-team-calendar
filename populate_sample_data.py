import os
from datetime import datetime, timedelta
import uuid
import random
from app import app, db, Patient, Event, Team, TeamMember

def populate():
    with app.app_context():
        print("Cleaning up existing demo data (if any)...")
        # Optional: You might want to keep existing user data, 
        # but for a "full demo" a clean slate is often clearer.
        # We'll just add new ones with unique names.

        # 1. Create Teams
        teams_to_create = [
            {"name": "Public Health Clinic", "slug": "ph-clinic", "is_public": True},
            {"name": "Private Specialist Group", "slug": "private-group", "is_public": False},
            {"name": "Rural Outreach Team", "slug": "rural-outreach", "is_public": False}
        ]

        created_teams = {}
        for t in teams_to_create:
            existing = Team.query.filter_by(slug=t["slug"]).first()
            if not existing:
                new_team = Team(name=t["name"], slug=t["slug"], is_public=t["is_public"])
                db.session.add(new_team)
                created_teams[t["slug"]] = new_team
                print(f"Created Team: {t['name']}")
            else:
                created_teams[t["slug"]] = existing

        # 2. Add Members & Requests
        # Let's say "Demo Admin" is approved in PH Clinic
        admin_id = "Demo-Device-123"
        if not TeamMember.query.filter_by(team_slug="ph-clinic", device_id=admin_id).first():
            db.session.add(TeamMember(
                team_slug="ph-clinic",
                user_name="Demo Admin",
                device_id=admin_id,
                status="APPROVED",
                role="ADMIN"
            ))
            print("Added 'Demo Admin' to PH Clinic")

        # Add a pending request to PH Clinic
        if not TeamMember.query.filter_by(team_slug="ph-clinic", device_id="Guest-X").first():
            db.session.add(TeamMember(
                team_slug="ph-clinic",
                user_name="New Nurse",
                device_id="Guest-X",
                status="PENDING",
                role="MEMBER"
            ))
            print("Added pending request to PH Clinic")

        # 3. Create Patients & Events
        regimes = ["Category I", "Category II", "MDR-TB", "BPaL"]
        colors = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"]

        patients_data = [
            {"name": "Aung Ko", "age": 45, "sex": "Male", "team": "ph-clinic", "regime": "Category I", "status": "Active"},
            {"name": "Zar Chi", "age": 28, "sex": "Female", "team": "ph-clinic", "regime": "MDR-TB", "status": "Active"},
            {"name": "Kyaw Kyaw", "age": 52, "sex": "Male", "team": "ph-clinic", "regime": "Category I", "status": "Cured"},
            {"name": "Hnin Yu", "age": 34, "sex": "Female", "team": "private-group", "regime": "BPaL", "status": "Active"},
            {"name": "Min Thant", "age": 19, "sex": "Male", "team": "rural-outreach", "regime": "Category II", "status": "LTFU"}
        ]

        for p_info in patients_data:
            p_uid = str(uuid.uuid4())
            new_p = Patient(
                uid=p_uid,
                name=p_info["name"],
                age=p_info["age"],
                sex=p_info["sex"],
                team_id=p_info["team"],
                regime=p_info["regime"],
                address="Sample Address, Yangon",
                remark=f"Demo Patient - {p_info['status']}"
            )
            db.session.add(new_p)
            db.session.flush() # Get ID for events

            # Create Milestones
            start_date = datetime.now() - timedelta(days=random.randint(30, 180))
            
            # Milestone 1: Start
            db.session.add(Event(
                title="Treatment Start",
                start=start_date.strftime("%Y-%m-%d"),
                original_start=start_date.strftime("%Y-%m-%d"),
                color="#3b82f6",
                patient_id=new_p.id
            ))

            # Milestone 2: 2 Months
            m2_date = start_date + timedelta(days=60)
            db.session.add(Event(
                title="2 Month Follow-up",
                start=m2_date.strftime("%Y-%m-%d"),
                original_start=m2_date.strftime("%Y-%m-%d"),
                color="#10b981",
                patient_id=new_p.id
            ))

            # If Cured or LTFU, add final milestone
            if p_info["status"] == "Cured":
                end_date = start_date + timedelta(days=180)
                db.session.add(Event(
                    title="Treatment Completion",
                    start=end_date.strftime("%Y-%m-%d"),
                    original_start=end_date.strftime("%Y-%m-%d"),
                    color="#10b981",
                    outcome="Cured",
                    patient_id=new_p.id
                ))
            elif p_info["status"] == "LTFU":
                fail_date = start_date + timedelta(days=90)
                db.session.add(Event(
                    title="Missed Follow-up",
                    start=fail_date.strftime("%Y-%m-%d"),
                    original_start=fail_date.strftime("%Y-%m-%d"),
                    color="#ef4444",
                    outcome="LTFU",
                    patient_id=new_p.id
                ))
            else:
                # Active: Add a future milestone
                future_date = datetime.now() + timedelta(days=30)
                db.session.add(Event(
                    title="Next Appointment",
                    start=future_date.strftime("%Y-%m-%d"),
                    original_start=future_date.strftime("%Y-%m-%d"),
                    color="#f59e0b",
                    patient_id=new_p.id
                ))

            print(f"Populated Patient: {p_info['name']} ({p_info['status']})")

        db.session.commit()
        print("Demo data population complete!")

if __name__ == "__main__":
    populate()
