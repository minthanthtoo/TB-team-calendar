import datetime
from app import app, db, Patient, Event, get_unique_color

def seed():
    with app.app_context():
        # Clear existing data for a clean demo
        db.drop_all()
        db.create_all()

        print("Creating sample patients...")

        # --- Patient 1: Standard Case (IR) ---
        p1 = Patient(
            name="U Ti", 
            age=45, 
            sex="Male", 
            address="Latha, Ward 3", 
            regime="IR", 
            remark="Standard enrollment. No comorbidities."
        )
        db.session.add(p1)
        db.session.flush() # get ID

        # Milestones for IR
        start_date = datetime.date.today() - datetime.timedelta(days=10) # Started 10 days ago
        milestones_ir = { "Start": 0, "M2": 56, "M5": 140, "M6/M-end": 168 }
        color1 = get_unique_color()

        for label, offset in milestones_ir.items():
            d = start_date + datetime.timedelta(days=offset)
            outcome = "Start" if label == "Start" else ""
            ev = Event(
                title=label,
                start=d.strftime("%Y-%m-%d"),
                original_start=d.strftime("%Y-%m-%d"),
                color=color1,
                patient_id=p1.id,
                missed_days=0,
                remark=p1.remark,
                outcome=outcome
            )
            db.session.add(ev)

        # --- Patient 2: Ripple Effect Demo (RR) ---
        p2 = Patient(
            name="Daw Hla", 
            age=32, 
            sex="Female", 
            address="Lanmadaw, St. 5", 
            regime="RR", 
            remark="Missed 5 days in early phase due to travel."
        )
        db.session.add(p2)
        db.session.flush()

        # Started 20 days ago, Missed 5 days
        start_date_2 = datetime.date.today() - datetime.timedelta(days=20)
        milestones_rr = { "Start": 0, "M3": 84, "M5": 140, "M8/M-end": 224 }
        color2 = get_unique_color()

        # Simulate Ripple: Start event has missed_days=5
        # Future events shifted by 5
        missed_days_val = 5

        for label, offset in milestones_rr.items():
            # Original Plan
            d_original = start_date_2 + datetime.timedelta(days=offset)
            
            # Actual (Shifted)
            # If label is Start, we log the miss there, but it technically delays ITSELF? 
            # Usually miss happens AFTER start. Let's say she missed 5 days AFTER start.
            # So Start date is fixed. M3 onwards shifts.
            
            shift = 0
            current_missed = 0
            
            if label == "Start":
                current_missed = missed_days_val # Log the miss here
                final_date = d_original # Start didn't move, the miss happened during this phase
            else:
                # Future events shift
                shift = missed_days_val
                final_date = d_original + datetime.timedelta(days=shift)

            ev = Event(
                title=label,
                start=final_date.strftime("%Y-%m-%d"),
                original_start=d_original.strftime("%Y-%m-%d") if label != "Start" else final_date.strftime("%Y-%m-%d"), # Complex, but for demo just shifting future
                color=color2,
                patient_id=p2.id,
                missed_days=current_missed, 
                remark=p2.remark,
                outcome="Start" if label == "Start" else ""
            )
            db.session.add(ev)


        # --- Patient 3: Completed Case (CR) ---
        p3 = Patient(
            name="Ko Aung", 
            age=28, 
            sex="Male", 
            address="Pabedan", 
            regime="CR", 
            remark="Treatment successful. Cured."
        )
        db.session.add(p3)
        db.session.flush()

        # Started 6 months ago (completed)
        start_date_3 = datetime.date.today() - datetime.timedelta(days=170)
        milestones_cr = { "Start": 0, "M2": 56, "M5": 140, "M6/M-end": 168 }
        color3 = get_unique_color()

        for label, offset in milestones_cr.items():
            d = start_date_3 + datetime.timedelta(days=offset)
            
            outcome = ""
            if label == "Start": outcome = "Start"
            if label == "M2": outcome = "Completed"
            if label == "M5": outcome = "Completed"
            if "M-end" in label: outcome = "Cured"

            ev = Event(
                title=label,
                start=d.strftime("%Y-%m-%d"),
                original_start=d.strftime("%Y-%m-%d"),
                color=color3,
                patient_id=p3.id,
                missed_days=0,
                remark=p3.remark,
                outcome=outcome
            )
            db.session.add(ev)

        db.session.commit()
        print("Database seeded successfully!")

if __name__ == "__main__":
    seed()
