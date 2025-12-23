import os
from datetime import datetime, timedelta
import uuid
import random
from app import app, db, Patient, Event, Team, TeamMember

def populate():
    with app.app_context():
        print("🚀 Starting Full Feature Demo Data Population...")

        # 1. Create the Demo Team
        demo_slug = "demo-team-full"
        demo_team = Team.query.filter_by(slug=demo_slug).first()
        if not demo_team:
            demo_team = Team(
                name="🌟 Full Feature Demo Team",
                slug=demo_slug,
                is_public=True
            )
            db.session.add(demo_team)
            print(f"Created Team: {demo_team.name}")
        else:
            # Clear existing patients if team exists to ensure fresh demo
            Patient.query.filter_by(team_id=demo_slug).delete()
            print(f"Cleared existing patients for {demo_slug}")

        # 2. Add a dummy admin for the user to "be" if needed
        # We don't know the exact device ID, but we can add a few common ones
        # or just let the user join. For now, let's just populate the data.

        # 3. Demo Patients with various regimes
        # Using specific dates around Dec 2025 to show current calendar views
        today = datetime(2025, 12, 23)

        patients_scenarios = [
            {
                "name": "U Ba Myint (MDR-TB Example)",
                "regime": "MDR-TB (9-Month)",
                "sex": "Male",
                "age": 58,
                "color": "#ef4444", # Red for serious
                "events": [
                    {"title": "Treatment Start - M0", "days": -120},
                    {"title": "Follow up - M1", "days": -90},
                    {"title": "Follow up - M2", "days": -60},
                    {"title": "Follow up - M3", "days": -30},
                    {"title": "Current Review - M4", "days": 0},
                    {"title": "Future Appt - M5", "days": 30}
                ]
            },
            {
                "name": "Daw Khin Aye (BPaL Example)",
                "regime": "BPaL (Short Course)",
                "sex": "Female",
                "age": 42,
                "color": "#8b5cf6", # Purple
                "events": [
                    {"title": "BPaL Initiation - M0", "days": -45},
                    {"title": "Week 4 Review - M1", "days": -15},
                    {"title": "Week 8 Review - M2", "days": 15},
                    {"title": "Week 12 Review - M3", "days": 45}
                ]
            },
            {
                "name": "Maung Phone (DS-TB / Completed)",
                "regime": "Category I (DS-TB)",
                "sex": "Male",
                "age": 21,
                "color": "#10b981", # Green
                "events": [
                    {"title": "DS-TB Start - M0", "days": -200},
                    {"title": "Midline - M3", "days": -110},
                    {"title": "M-end - Cured", "days": -20, "outcome": "Cured"}
                ]
            },
            {
                "name": "Naw Hla (Sabbath Alignment)",
                "regime": "Category I",
                "sex": "Female",
                "age": 35,
                "color": "#f59e0b", # Amber
                "events": [
                    # Manually selecting dates that fall on Sabbath in Dec 2025 / Jan 2026
                    # Dec 2025 Full Moon is Dec 5, New Moon Dec 20
                    # Sabbath days are usually 8, 15, 22, 29 of lunar months
                    {"title": "Monthly Sync - M1", "date": "2025-12-05"}, # Full Moon
                    {"title": "Follow up - M2", "date": "2025-12-20"}, # New Moon
                    {"title": "Clinic Visit - M3", "date": "2026-01-03"}  # Future date
                ]
            }
        ]

        for p_info in patients_scenarios:
            p_uid = str(uuid.uuid4())
            new_p = Patient(
                uid=p_uid,
                name=p_info["name"],
                age=p_info["age"],
                sex=p_info["sex"],
                team_id=demo_slug,
                regime=p_info["regime"],
                address="Yangon Regional Clinic",
                remark=f"Full detail demo for {p_info['regime']}"
            )
            db.session.add(new_p)
            db.session.flush()

            for e_info in p_info["events"]:
                e_date = ""
                if "date" in e_info:
                    e_date = e_info["date"]
                else:
                    e_date = (today + timedelta(days=e_info["days"])).strftime("%Y-%m-%d")

                db.session.add(Event(
                    title=e_info["title"],
                    start=e_date,
                    original_start=e_date,
                    color=p_info["color"],
                    outcome=e_info.get("outcome", ""),
                    patient_id=new_p.id,
                    remark=f"Demo event for {e_info['title']}"
                ))

            print(f"✅ Added {p_info['name']}")

        db.session.commit()
        print("\n✨ Demo Team Population Complete!")
        print(f"Team Slug: {demo_slug}")
        print("Join this team to see: Regime/Cycle popups, Sabbath markers, and instant Lunar details!")

if __name__ == "__main__":
    populate()
