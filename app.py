import os
from flask import Flask, render_template, request, redirect, url_for, jsonify
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime, timedelta
import random

app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///cycles.db'
db = SQLAlchemy(app)

# ---- MODELS ----
import uuid

class DeletedRecord(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    uid = db.Column(db.String(36), nullable=False)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)

class Patient(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    uid = db.Column(db.String(36), unique=True, default=lambda: str(uuid.uuid4())) # Unique Sync ID
    team_id = db.Column(db.String(50), default='DEFAULT') # <-- For Multi-Team Management
    name = db.Column(db.String(100), nullable=False)
    age = db.Column(db.Integer, nullable=False)
    sex = db.Column(db.String(10), nullable=False)
    address = db.Column(db.String(200))
    regime = db.Column(db.String(50), nullable=False)
    remark = db.Column(db.String(500))
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow) # Sync Timestamp
    events = db.relationship("Event", backref="patient", lazy=True, cascade="all, delete-orphan")

class Event(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(50))
    start = db.Column(db.String(20))
    color = db.Column(db.String(20))
    patient_id = db.Column(db.Integer, db.ForeignKey("patient.id"))
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow) # Sync Timestamp

    # New fields for per-milestone data
    missed_days = db.Column(db.Integer, default=0)
    remark = db.Column(db.String(200))
    outcome = db.Column(db.String(20))  # e.g., Failed, LTFU, Died, Cured, Completed

    original_start = db.Column(db.String(20))  # store original planned date

# ---- TEAM MODELS ----
class Team(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    slug = db.Column(db.String(50), unique=True, nullable=False)
    name = db.Column(db.String(100), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

class TeamMember(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    team_slug = db.Column(db.String(50), nullable=False) # e.g. "ygn-team"
    user_name = db.Column(db.String(100), nullable=False) # e.g. "Dr. Smith" or Device Name
    device_id = db.Column(db.String(100)) # Unique Device/Browser ID
    status = db.Column(db.String(20), default='PENDING') # PENDING, APPROVED
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


import socket

# ---- HELPER ----
def get_unique_color():
    base_colors = ["#FF5733", "#33FF57", "#3357FF", "#FF33A1", "#33FFF2", "#FFC733", "#8E44AD", "#F39C12", "#1ABC9C", "#2ECC71"]
    used_colors = [e.color for e in Event.query.all()]
    for c in base_colors:
        if c not in used_colors:
            return c
    return random.choice(base_colors)  # fallback

def get_local_ip():
    try:
        # Connect to a dummy external IP to determine the best interface
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except:
        return "127.0.0.1"

# ---- ROUTES ----
@app.route("/")
def index():
    patients = Patient.query.all()
    host_ip = get_local_ip()
    port = int(os.environ.get("PORT", 5000))
    share_url = f"http://{host_ip}:{port}"
    return render_template("index.html", patients=patients, share_url=share_url)

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
        remark=request.form["remark"],
        team_id=request.form.get("team_id", "DEFAULT") # Capture Team ID
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
        old_missed_days = ev.missed_days
        ev.missed_days = missed_days
        ev.remark = remark
        ev.outcome = outcome

        # Calculate shift delta
        delta_days = missed_days - old_missed_days
        
        # Shift CURRENT event
        # Logic: We treat 'missed_days' on this event as adding to the delay.
        # But wait, the existing code says: new_start = original_start + missed_days
        # This implies 'missed_days' is the TOTAL offset for this event? 
        # No, usually in these apps, you report "5 days missed during this period".
        # If the user enters "5" in the input, they mean "Total 5 days missed for this specific event milestone".
        # So we update this event's date based on its original start.
        
        current_original_start = datetime.strptime(ev.original_start, "%Y-%m-%d")
        new_start_date = current_original_start + timedelta(days=missed_days)
        
        # ACTUALLY, checking previous code: 
        # new_start = original_start + timedelta(days=missed_days)
        # This means 'missed_days' is indeed treated as the offset from original.
        # But if we want RIPPLE effect, checking "5" here should push EVERYTHING else by the difference.
        
        # So if I change missed_days from 0 to 5 (delta +5):
        # This event moves +5 days.
        # ALL FUTURE events should also move +5 days from their CURRENT position.
        
        ev.start = new_start_date.strftime("%Y-%m-%d")

        if delta_days != 0:
            # Find all future events for this patient
            # We assume 'future' means original_start is after this event's original_start
            future_events = Event.query.filter(
                Event.patient_id == ev.patient_id,
                Event.original_start > ev.original_start
            ).all()

            for fev in future_events:
                # Shift their CURRENT start date by delta
                # We do NOT update their 'missed_days' (that belongs to them localy), 
                # we just shift their schedule.
                # But wait, if we only update 'start', and later someone edits that event, 
                # the code `new_start = original_start + missed_days` would RESET this shift!
                
                # PROBLEM: The current logic relies on `original_start + missed_days`.
                # If we want a permanent shift, we must update `original_start` of future events?
                # YES. If the schedule slips, the "baseline" for future events has effectively changed.
                
                fev_current_start = datetime.strptime(fev.start, "%Y-%m-%d")
                fev_new_start = fev_current_start + timedelta(days=delta_days)
                fev.start = fev_new_start.strftime("%Y-%m-%d")
                
                # Crucial: We must also update original_start so the shift persists 
                # if the user later edits that future event.
                fev_original = datetime.strptime(fev.original_start, "%Y-%m-%d")
                fev_new_original = fev_original + timedelta(days=delta_days)
                fev.original_start = fev_new_original.strftime("%Y-%m-%d")

        db.session.commit()
        return jsonify(success=True)

    except Exception as e:
        print("Error updating event:", e)
        return jsonify(success=False, message=str(e)), 500

@app.route("/delete_patient/<int:patient_id>", methods=["POST"])
def delete_patient(patient_id):
    try:
        p = Patient.query.get(patient_id)
        if p:
            # Create Tombstone
            if p.uid:
                dr = DeletedRecord(uid=p.uid)
                db.session.add(dr)
            
            db.session.delete(p)
            db.session.commit()
            return jsonify(success=True)
        return jsonify(success=False, message="Patient not found"), 404
    except Exception as e:
        db.session.rollback()
        return jsonify(success=False, message=str(e)), 500


# ---- SYNC API ----

# 1. Export Data (Host gives data to Guest)
@app.route("/api/get_all_data")
def get_all_data():
    target_team = request.args.get('team')
    
    query = Patient.query
    if target_team and target_team != 'ALL':
        # Filter patients by team
        query = query.filter_by(team_id=target_team)
        
    patients = query.all()
    deleted = DeletedRecord.query.all()
    
    data = []
    for p in patients:
        p_data = {
            "uid": p.uid,
            "team_id": p.team_id,
            "updated_at": p.updated_at.isoformat() if p.updated_at else None,
            "name": p.name, "age": p.age, "sex": p.sex, 
            "address": p.address, "regime": p.regime, "remark": p.remark,
            "events": []
        }
        for e in p.events:
            p_data["events"].append({
                "id": e.id,
                "updated_at": e.updated_at.isoformat() if e.updated_at else None,
                "title": e.title, "start": e.start, "original_start": e.original_start,
                "color": e.color, "missed_days": e.missed_days, 
                "remark": e.remark, "outcome": e.outcome
            })
        data.append(p_data)
        
    deleted_uids = [d.uid for d in deleted]
    
    return jsonify(success=True, data=data, deleted=deleted_uids)

# 2. Merge Data (Guest pulls from Host -> Appends/Replaces Local)
@app.route("/api/merge_data", methods=["POST"])
def merge_data():
    try:
        req = request.json
        mode = req.get("mode", "append") # 'append' or 'replace'
        incoming_patients = req.get("data", [])
        incoming_deleted = req.get("deleted", []) # New

        if mode == "replace":
            db.drop_all()
            db.create_all()
        
        # 1. Process Deletions First
        for d_uid in incoming_deleted:
            # Check if we have this patient active
            p = Patient.query.filter_by(uid=d_uid).first()
            if p:
                db.session.delete(p)
            # Ensure tombstone exists locally too
            if not DeletedRecord.query.filter_by(uid=d_uid).first():
                db.session.add(DeletedRecord(uid=d_uid))
        
        # 2. Process Adds/Updates
        count = 0
        for p_in in incoming_patients:
            in_uid = p_in.get("uid")
            if mode == "append":
                exists = None
                if in_uid: exists = Patient.query.filter_by(uid=in_uid).first()
                if not exists: exists = Patient.query.filter_by(name=p_in["name"]).first()
                if exists: continue 

            new_p = Patient(
                uid=in_uid if in_uid else str(uuid.uuid4()),
                name=p_in["name"], age=p_in["age"], sex=p_in["sex"],
                address=p_in["address"], regime=p_in["regime"], remark=p_in["remark"]
            )
            db.session.add(new_p)
            db.session.flush()

            for e_in in p_in["events"]:
                new_e = Event(
                    title=e_in["title"], start=e_in["start"], original_start=e_in["original_start"],
                    color=e_in["color"], missed_days=e_in["missed_days"],
                    remark=e_in["remark"], outcome=e_in["outcome"],
                    patient_id=new_p.id
                )
                db.session.add(new_e)
            count += 1
        
        db.session.commit()
        return jsonify(success=True, count=count)
    except Exception as e:
        return jsonify(success=False, message=str(e)), 500

# 3. Stage Incoming (Guest pushes to Host -> Host reviews)
DEVICE_STAGING = {} # { "DeviceName": { "data": [], "deleted": [], "timestamp": ... } }
CONNECTED_DEVICES = {} 

@app.route("/api/stage_incoming", methods=["POST"])
def stage_incoming():
    global DEVICE_STAGING, CONNECTED_DEVICES
    try:
        data = request.json
        incoming_data = data.get("data", [])
        incoming_deleted = data.get("deleted", [])
        device_name = data.get("device_name", "Unknown Guest")
        
        # Update Stats
        client_ip = request.remote_addr
        if device_name not in CONNECTED_DEVICES:
            CONNECTED_DEVICES[device_name] = { "ip": client_ip, "pushes": 0, "last_seen": None }
        
        CONNECTED_DEVICES[device_name]["pushes"] += 1
        CONNECTED_DEVICES[device_name]["last_seen"] = datetime.now().strftime("%H:%M:%S")
        
        # Store Data Per Device
        DEVICE_STAGING[device_name] = {
            "data": incoming_data,
            "deleted": incoming_deleted,
            "timestamp": datetime.now()
        }
        
        return jsonify(success=True, count=len(incoming_data) + len(incoming_deleted))
    except Exception as e:
        return jsonify(success=False, message=str(e)), 500

@app.route("/api/get_host_info")
def get_host_info():
    hostname = socket.gethostname()
    devices_list = []
    for name, info in CONNECTED_DEVICES.items():
        # Check if pending data exists
        has_pending = name in DEVICE_STAGING and (len(DEVICE_STAGING[name]["data"]) > 0 or len(DEVICE_STAGING[name]["deleted"]) > 0)
        
        devices_list.append({
            "name": name,
            "ip": info["ip"],
            "pushes": info["pushes"],
            "last_seen": info["last_seen"],
            "has_pending": has_pending
        })
        
    return jsonify({
        "hostname": hostname,
        "devices": devices_list
    })

@app.route("/api/get_staged_data")
@app.route("/api/get_staged_data")
def get_staged_data():
    target_device = request.args.get("device")
    
    # helper
    def process_device_stage(d_name, stage_obj):
        d_items = []
        raw_data = stage_obj.get("data", [])
        raw_del = stage_obj.get("deleted", [])
        
        # Records
        for i, p in enumerate(raw_data):
            status = "NEW"
            existing = None
            if p.get("uid"): existing = Patient.query.filter_by(uid=p.get("uid")).first()
            if not existing: existing = Patient.query.filter_by(name=p["name"]).first()
            
            if existing:
                 is_diff = False
                 if existing.name != p["name"]: is_diff = True
                 if existing.age != p["age"]: is_diff = True
                 if existing.sex != p["sex"]: is_diff = True
                 if existing.address != p["address"]: is_diff = True
                 if existing.regime != p["regime"]: is_diff = True
                 if existing.remark != p["remark"]: is_diff = True
                 if len(existing.events) != len(p["events"]): is_diff = True
                 else:
                     ex_evs = sorted(existing.events, key=lambda x: x.original_start)
                     in_evs = sorted(p["events"], key=lambda x: x["original_start"])
                     for i_ev in range(len(ex_evs)):
                         e1 = ex_evs[i_ev]; e2 = in_evs[i_ev]
                         if (e1.missed_days != e2["missed_days"] or e1.outcome != e2["outcome"] or e1.start != e2["start"]):
                             is_diff = True; break
                 status = "UPDATE" if is_diff else "SAME"

            d_items.append({**p, "status": status, "type": "record", "source_device": d_name, "idx": i})

        # Deletions
        for i, del_uid in enumerate(raw_del):
            p_active = Patient.query.filter_by(uid=del_uid).first()
            if p_active:
                d_items.append({
                    "uid": del_uid,
                    "name": p_active.name + " (Deleted by peer)",
                    "status": "DELETE",
                    "type": "deletion",
                    "source_device": d_name,
                    "idx": i
                })
        return d_items

    enriched = []
    
    if target_device and target_device in DEVICE_STAGING and target_device != "all":
        enriched = process_device_stage(target_device, DEVICE_STAGING[target_device])
    else:
        # Aggregate ALL if 'all' or no device specified
        for d_name, stage_obj in DEVICE_STAGING.items():
            enriched.extend(process_device_stage(d_name, stage_obj))
    
    return jsonify(success=True, data=enriched)

@app.route("/api/commit_staged", methods=["POST"])
def commit_staged():
    global DEVICE_STAGING
    try:
        req = request.json
        commits_map = req.get("commits_by_device")
        
        # Backward compatibility / Single device mode
        if not commits_map:
            target = req.get("device")
            idxs = req.get("indices", [])
            if target: commits_map = {target: idxs}
            else: return jsonify(success=False, message="No data provided"), 400

        total_merged = 0
        
        for d_name, indices in commits_map.items():
            if d_name not in DEVICE_STAGING: continue
            
            stage = DEVICE_STAGING[d_name]
            # Retrieve validation arrays
            current_data = stage.get("data", [])
            current_deleted = stage.get("deleted", [])
            
            num_data = len(current_data)
            
            # Identify what to commit based on indices
            # Indices: 0..N-1 (records), N..M (deletions)
            indices = set([int(x) for x in indices])
            
            data_indices_to_commit = []
            del_indices_to_commit = []
            
            for i in indices:
                if i < num_data:
                    data_indices_to_commit.append(i)
                else:
                    del_indices_to_commit.append(i - num_data)
            
            # Application Logic: Records
            for i in data_indices_to_commit:
                if i >= len(current_data): continue
                p_in = current_data[i]
                
                exists = None
                if p_in.get("uid"): exists = Patient.query.filter_by(uid=p_in.get("uid")).first()
                if not exists: exists = Patient.query.filter_by(name=p_in["name"]).first()
                
                if exists:
                    exists.age = p_in["age"]
                    exists.sex = p_in["sex"]
                    exists.address = p_in["address"]
                    exists.regime = p_in["regime"]
                    exists.remark = p_in["remark"]
                    Event.query.filter_by(patient_id=exists.id).delete()
                else:
                    exists = Patient(
                        uid=p_in.get("uid") or str(uuid.uuid4()),
                        name=p_in["name"], age=p_in["age"], sex=p_in["sex"],
                        address=p_in["address"], regime=p_in["regime"], remark=p_in["remark"]
                    )
                    db.session.add(exists)
                    db.session.flush()

                for e_in in p_in["events"]:
                    db.session.add(Event(
                        title=e_in["title"], start=e_in["start"], original_start=e_in["original_start"],
                        color=e_in["color"], missed_days=e_in["missed_days"],
                        remark=e_in["remark"], outcome=e_in["outcome"],
                        patient_id=exists.id
                    ))
                total_merged += 1

            # Application Logic: Deletions
            for i in del_indices_to_commit:
                if i >= len(current_deleted): continue
                d_uid = current_deleted[i]
                p = Patient.query.filter_by(uid=d_uid).first()
                if p: db.session.delete(p)
                if not DeletedRecord.query.filter_by(uid=d_uid).first():
                    db.session.add(DeletedRecord(uid=d_uid))
                total_merged += 1
            
            db.session.commit()

            # Cleanup Staged Data (Remove committed items)
            # Iterate in reverse to avoid index shifting
            for i in sorted(data_indices_to_commit, reverse=True):
                if i < len(current_data): current_data.pop(i)
            
            for i in sorted(del_indices_to_commit, reverse=True):
                if i < len(current_deleted): current_deleted.pop(i)
                
            DEVICE_STAGING[d_name]["timestamp"] = datetime.now()

        return jsonify(success=True, count=total_merged)

    except Exception as e:
        print(e)
        return jsonify(success=False, message=str(e)), 500

# ---- CORS ----
@app.after_request
def after_request(response):
    response.headers.add('Access-Control-Allow-Origin', '*')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
    response.headers.add('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS')
    return response



# ---- TEAM MANAGEMENT API ----

@app.route("/api/teams/create", methods=["POST"])
def create_team():
    data = request.json
    name = data.get("name")
    if not name: return jsonify(success=False, message="Name required"), 400
    
    # Simple Slugify
    slug = name.lower().replace(" ", "-")
    
    if Team.query.filter_by(slug=slug).first():
       return jsonify(success=False, message="Team name taken"), 400
       
    new_team = Team(name=name, slug=slug)
    db.session.add(new_team)
    
    # Auto-approve creator (if we had auth, we'd link user. For now, create a 'Device Admin' member?)
    # Assuming the device creating it is the 'Owner'.
    device_id = data.get("device_id", "Unknown")
    user_name = data.get("user_name", "Admin")
    
    member = TeamMember(team_slug=slug, user_name=user_name, device_id=device_id, status='APPROVED')
    db.session.add(member)
    
    db.session.commit()
    return jsonify(success=True, team_slug=slug)

@app.route("/api/teams/join", methods=["POST"])
def join_team():
    data = request.json
    slug = data.get("slug")
    user_name = data.get("user_name")
    device_id = data.get("device_id")
    
    team = Team.query.filter_by(slug=slug).first()
    if not team: return jsonify(success=False, message="Team not found"), 404
    
    # Check existing
    existing = TeamMember.query.filter_by(team_slug=slug, device_id=device_id).first()
    if existing:
        return jsonify(success=True, status=existing.status, message="Already requested")
        
    new_mem = TeamMember(team_slug=slug, user_name=user_name, device_id=device_id, status='PENDING')
    db.session.add(new_mem)
    db.session.commit()
    
    return jsonify(success=True, status='PENDING')

@app.route("/api/teams/list", methods=["GET"])
def list_teams():
    # Public list of teams so users can search
    teams = Team.query.all()
    return jsonify(success=True, teams=[{"name": t.name, "slug": t.slug} for t in teams])

@app.route("/api/teams/members", methods=["GET"])
def list_pending_members():
    # Logic: Only admins can see this. For now, we allow any device to peek 
    # (In prod, check if requester device_id is APPROVED for this team or is CREATOR)
    slug = request.args.get('slug')
    members = TeamMember.query.filter_by(team_slug=slug).all()
    
    return jsonify(success=True, members=[
        {"id": m.id, "user_name": m.user_name, "device_id": m.device_id, "status": m.status}
        for m in members
    ])

@app.route("/api/teams/approve", methods=["POST"])
def approve_member():
    data = request.json
    member_id = data.get("member_id")
    action = data.get("action", "APPROVE") # APPROVE or REJECT
    
    mem = TeamMember.query.get(member_id)
    if not mem: return jsonify(success=False, message="Not found"), 404
    
    mem.status = 'APPROVED' if action == 'APPROVE' else 'REJECTED'
    db.session.commit()
    return jsonify(success=True, status=mem.status)


if __name__ == "__main__":
    with app.app_context():
        db.create_all()
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)))
