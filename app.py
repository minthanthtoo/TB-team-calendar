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
    start = db.Column(db.String(20))   # ISO date string
    color = db.Column(db.String(20))   # Event color
    patient_id = db.Column(db.Integer, db.ForeignKey("patient.id"))

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
        "title": e.title,
        "start": e.start,
        "color": e.color,
        "patient": {
            "name": e.patient.name,
            "age": e.patient.age,
            "sex": e.patient.sex,
            "address": e.patient.address,
            "regime": e.patient.regime,
            "remark": e.patient.remark
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
    missed_days = int(request.form.get("missed_days", 0))

    milestones = {"M1": 0, "M2": 31, "M3": 62, "M-end": 94}
    color = get_unique_color()

    for label, offset in milestones.items():
        d = start_date + timedelta(days=offset + (missed_days if offset > 0 else 0))
        ev = Event(title=label, start=d.strftime("%Y-%m-%d"), color=color, patient_id=p.id)
        db.session.add(ev)

    db.session.commit()
    return redirect(url_for("index"))

if __name__ == "__main__":
    with app.app_context():
        db.create_all()
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)))
