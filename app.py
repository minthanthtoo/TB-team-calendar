import os
from flask import Flask, render_template, request, redirect, url_for, jsonify
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime, timedelta
import random

app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///cycles.db'
db = SQLAlchemy(app)

# ---- MODELS ----
class Patient(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(50))
    age = db.Column(db.Integer)
    sex = db.Column(db.String(10))
    address = db.Column(db.String(100))
    regime = db.Column(db.String(10))
    remark = db.Column(db.String(200))

    events = db.relationship("Event", backref="patient", lazy=True)

class Event(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(50))
    start = db.Column(db.String(20))
    color = db.Column(db.String(20))
    patient_id = db.Column(db.Integer, db.ForeignKey("patient.id"))

    # New fields for per-milestone data
    missed_days = db.Column(db.Integer, default=0)
    remark = db.Column(db.String(200))
    outcome = db.Column(db.String(20))  # e.g., Failed, LTFU, Died, Cured, Completed

    original_start = db.Column(db.String(20))  # store original planned date

# ---- HELPER ----
def get_unique_color():
    base_colors = ["#FF5733", "#33FF57", "#3357FF", "#FF33A1", "#33FFF2", "#FFC733", "#8E44AD", "#F39C12", "#1ABC9C", "#2ECC71"]
    used_colors = [e.color for e in Event.query.all()]
    for c in base_colors:
        if c not in used_colors:
            return c
    return random.choice(base_colors)  # fallback

# ---- ROUTES ----
@app.route("/")
def index():
    patients = Patient.query.all()
    return render_template("index.html", patients=patients)

@app.route("/events")
def events():
    events = Event.query.all()
    return jsonify([{
        "id": e.id,  # <-- add this line
        "title": f"{e.patient.name} - {e.title}",  # <-- include patient name
        "start": e.start,
        "color": e.color,
        "extendedProps": {  # per FullCalendar docs
            "patient": {
                "name": e.patient.name,
                "age": e.patient.age,
                "sex": e.patient.sex,
                "address": e.patient.address,
                "regime": e.patient.regime,
                "remark": e.patient.remark
            },
            "missed_days": e.missed_days,
            "remark": e.remark,
            "outcome": e.outcome
        }
    } for e in events])

@app.route("/add_patient", methods=["POST"])
def add_patient():
    # Patient info
    p = Patient(
        name=request.form["name"],
        age=int(request.form["age"]),
        sex=request.form["sex"],
        address=request.form["address"],
        regime=request.form["regime"],
        remark=request.form["remark"]
    )
    db.session.add(p)
    db.session.commit()

    # Cycle info
    start_date = datetime.strptime(request.form["start_date"], "%Y-%m-%d")
    #missed_days = int(request.form.get("missed_days", 0))

    # Correct milestones by regime
    regime = p.regime.upper()
    if regime in ["IR", "CR"]:
        milestones = {
            "Start": 0,   # start day
            "M2": 56,
            "M5": 140,
            "M6/M-end": 168
        }
    elif regime == "RR":
        milestones = {
            "Start": 0,   # start day
            "M3": 84,
            "M5": 140,
            "M8/M-end": 224
        }
    else:
        milestones = {"Start": 0, "M1": 0}   # fallback for unknown regime

    color = get_unique_color()

    for label, offset in milestones.items():
        # Apply +missed_days only to M-x (not M-end)
        #m_missed = missed_days if "M-end" not in label else 0
        m_missed = 0
        d = start_date + timedelta(days=offset + m_missed)
        
        # Default outcome
        # Default outcome: Start gets "Start", M-end gets "Cured", others empty
        if label == "Start":
            outcome_default = "Start"
        elif "M-end" in label:
            outcome_default = "Cured"
        else:
            outcome_default = ""
        
        ev = Event(
            id=None,  # optional, SQLAlchemy auto-increments
            title=label,
            start=d.strftime("%Y-%m-%d"),
            original_start=d.strftime("%Y-%m-%d"),
            color=color,
            patient_id=p.id,
            missed_days=m_missed,
            remark=p.remark,  # copy from patient
            outcome=outcome_default
        )
        db.session.add(ev)

    db.session.commit()
    return redirect(url_for("index"))

from flask import request

@app.route("/update_event", methods=["POST"])
def update_event():
    try:
        data = request.get_json(force=True)
        event_id = int(data.get("id"))
        missed_days = int(data.get("missed_days", 0))
        remark = data.get("remark", "").strip()
        outcome = data.get("outcome", "").strip()

        # Fetch event
        ev = Event.query.get(event_id)
        if not ev:
            return jsonify(success=False, message="Event not found"), 404

        # Validate outcome
        if "M-end" in ev.title:
            valid_outcomes = ["", "Cured", "Completed","Failed", "LTFU", "Died"]
        else:
            valid_outcomes = ["", "Failed", "LTFU", "Died"]

        if outcome not in valid_outcomes:
            return jsonify(success=False, message="Invalid outcome for this milestone"), 400

        # Update fields
        ev.missed_days = missed_days
        ev.remark = remark
        ev.outcome = outcome

        # Shift date from original_start + missed_days
        original_start = datetime.strptime(ev.original_start, "%Y-%m-%d")
        new_start = original_start + timedelta(days=missed_days)
        ev.start = new_start.strftime("%Y-%m-%d")

        db.session.commit()
        return jsonify(success=True)

    except Exception as e:
        print("Error updating event:", e)
        return jsonify(success=False, message=str(e)), 500

@app.route("/delete_patient/<int:patient_id>", methods=["POST"])
def delete_patient(patient_id):
    patient = Patient.query.get(patient_id)
    if not patient:
        return jsonify(success=False, message="Patient not found"), 404
    
    # Delete all events first
    Event.query.filter_by(patient_id=patient.id).delete()
    # Delete patient
    db.session.delete(patient)
    db.session.commit()
    
    return jsonify(success=True)


if __name__ == "__main__":
    with app.app_context():
        db.create_all()
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)))
