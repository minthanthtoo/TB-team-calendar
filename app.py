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
    invite_code = db.Column(db.String(20), unique=True) # New
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

class TeamMember(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    team_slug = db.Column(db.String(50), nullable=False) # e.g. "ygn-team"
    user_name = db.Column(db.String(100), nullable=False) # e.g. "Dr. Smith" or Device Name
    device_id = db.Column(db.String(100)) # Unique Device/Browser ID
    status = db.Column(db.String(20), default='PENDING') # PENDING, APPROVED
    role = db.Column(db.String(20), default='MEMBER') # ADMIN, MEMBER
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


import socket


import socket


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
    since_str = request.args.get('since')
    requester_device = request.headers.get('X-Device-ID')
    
    # ... Security Checks ...
    query = Patient.query
    if target_team and target_team != 'ALL' and target_team != 'DEFAULT':
        # SECURITY CHECK
        # Must be APPROVED member of this team
        if not requester_device:
            return jsonify(error="Device ID required"), 403
            
        membership = TeamMember.query.filter_by(
            team_slug=target_team, 
            device_id=requester_device, 
            status='APPROVED'
        ).first()
        
        if not membership:
             return jsonify(error="Unauthorized: Not an approved member"), 403

        # Filter patients by team
        query = query.filter_by(team_id=target_team)

    # DELTA SYNC LOGIC
    if since_str:
        try:
            since_dt = datetime.fromisoformat(since_str)
            # 1. Patients modified directly
            p_direct = query.filter(Patient.updated_at > since_dt).all()
            
            # 2. Patients with modified events (if query filters by team, join ensures we respect that)
            p_via_events = query.join(Event).filter(Event.updated_at > since_dt).all()
            
            # Union unique
            patients = list(set(p_direct + p_via_events))
            
            # 3. Deleted Records (since time)
            deleted = DeletedRecord.query.filter(DeletedRecord.timestamp > since_dt).all()
            
            # 4. Teams & Members (since time)
            # Note: We return ALL teams/members if no 'since', but delta if 'since' exists
            # For Teams, normally we don't edit them much, but let's check created_at? 
            # Team doesn't have updated_at yet. Use created_at for new teams.
            teams = Team.query.filter(Team.created_at > since_dt).all()
            members = TeamMember.query.filter(TeamMember.updated_at > since_dt).all()
            
        except ValueError:
             return jsonify(success=False, message="Invalid Date Format"), 400
    else:
        # Full Sync
        patients = query.all()
        deleted = DeletedRecord.query.all()
        teams = Team.query.all()
        members = TeamMember.query.all()
    
    data = []
    
    # 1. Patients & Events
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
    
    teams_data = [
        {"slug": t.slug, "name": t.name, "created_at": t.created_at.isoformat() if t.created_at else None}
        for t in teams
    ]
    
    members_data = [
        {
            "team_slug": m.team_slug, "user_name": m.user_name, 
            "device_id": m.device_id, "status": m.status,
            "updated_at": m.updated_at.isoformat() if m.updated_at else None
        }
        for m in members
    ]
    
    return jsonify(success=True, data=data, deleted=deleted_uids, teams=teams_data, members=members_data, timestamp=datetime.utcnow().isoformat())

# 2. Merge Data (Guest pulls from Host -> Appends/Replaces Local)
@app.route("/api/merge_data", methods=["POST"])
def merge_data():
    try:
        req = request.json
        mode = req.get("mode", "append") # 'append' or 'replace'
        incoming_patients = req.get("data", [])
        incoming_deleted = req.get("deleted", []) # New

        incoming_teams = req.get("teams", [])
        incoming_members = req.get("members", [])

        if mode == "replace":
            db.drop_all()
            db.create_all()
        
        # 1. Process Deletions First
        for d_uid in incoming_deleted:
            # Check for Team Deletion (prefix "team:")
            if d_uid.startswith("team:"):
                # Handle Team Delete
                t_slug = d_uid.split(":", 1)[1]
                t_rec = Team.query.filter_by(slug=t_slug).first()
                if t_rec: 
                    # Cascade delete everything for this team
                    sub_p = Patient.query.filter_by(team_id=t_slug).all()
                    for sp in sub_p:
                        Event.query.filter_by(patient_id=sp.id).delete()
                        db.session.delete(sp)
                        # We don't necessarily need tombstones for these sub-patients 
                        # if the peer also gets the 'team:' tombstone. 
                        # But adding them doesn't hurt.
                    
                    TeamMember.query.filter_by(team_slug=t_slug).delete()
                    db.session.delete(t_rec)
                    print(f"Synced Deletion of Team: {t_slug}")
            else:
                # Handle Patient Delete
                p = Patient.query.filter_by(uid=d_uid).first()
                if p:
                    db.session.delete(p)
                    
            # Ensure tombstone exists locally too (to propagate further)
            if not DeletedRecord.query.filter_by(uid=d_uid).first():
                db.session.add(DeletedRecord(uid=d_uid))
        
        # 2. Process Adds/Updates (Patients)
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
                # If team_id missing in older payloads, default to DEFAULT
                team_id=p_in.get("team_id", "DEFAULT"), 
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
            
        # 3. Process Teams (Append Only - Safe, as slugs are unique)
        for t_in in incoming_teams:
            if not Team.query.filter_by(slug=t_in["slug"]).first():
                db.session.add(Team(name=t_in["name"], slug=t_in["slug"]))
                
        # 4. Process Members
        for m_in in incoming_members:
            # Check if membership exists
            existing_mem = TeamMember.query.filter_by(
                team_slug=m_in["team_slug"], 
                device_id=m_in["device_id"]
            ).first()
            
            if existing_mem:
                # Update status if changed (e.g. APPROVED on host)
                existing_mem.status = m_in["status"]
            else:
                db.session.add(TeamMember(
                    team_slug=m_in["team_slug"],
                    user_name=m_in["user_name"],
                    device_id=m_in["device_id"],
                    status=m_in["status"]
                ))
        
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
        incoming_teams = data.get("teams", [])
        incoming_members = data.get("members", [])
        
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
            "teams": incoming_teams,
            "members": incoming_members,
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
        has_pending = name in DEVICE_STAGING and (
            len(DEVICE_STAGING[name]["data"]) > 0 or 
            len(DEVICE_STAGING[name]["deleted"]) > 0 or
            len(DEVICE_STAGING[name].get("teams", [])) > 0 or
            len(DEVICE_STAGING[name].get("members", [])) > 0
        )
        
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
def get_staged_data():
    target_device = request.args.get("device")
    
    # helper
    def process_device_stage(d_name, stage_obj):
        d_items = []
        raw_data = stage_obj.get("data", [])
        raw_del = stage_obj.get("deleted", [])
        raw_teams = stage_obj.get("teams", [])
        
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
        
        # Teams (Summary)
        if raw_teams:
            d_items.append({
                "uid": "teams-summary",
                "name": f"{len(raw_teams)} Teams (Will Auto-Merge)",
                "status": "NEW",
                "type": "info",
                "source_device": d_name,
                "idx": -1
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
            
            # --- AUTO MERGE TEAMS & MEMBERS ---
            current_teams = stage.get("teams", [])
            current_members = stage.get("members", [])
            
            for t_in in current_teams:
                if not Team.query.filter_by(slug=t_in["slug"]).first():
                    db.session.add(Team(name=t_in["name"], slug=t_in["slug"]))
            
            for m_in in current_members:
                 existing_mem = TeamMember.query.filter_by(team_slug=m_in["team_slug"], device_id=m_in["device_id"]).first()
                 if existing_mem:
                     existing_mem.status = m_in["status"]
                 else:
                     db.session.add(TeamMember(
                        team_slug=m_in["team_slug"],
                        user_name=m_in["user_name"],
                        device_id=m_in["device_id"],
                        status=m_in["status"]
                    ))
            
            # Clear them after merge to avoid re-merging
            stage["teams"] = []
            stage["members"] = []
            
            # --- END AUTO MERGE ---
            
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
                    
                    # Update team_id if provided
                    if "team_id" in p_in: exists.team_id = p_in["team_id"]
                        
                    Event.query.filter_by(patient_id=exists.id).delete()
                else:
                    exists = Patient(
                        uid=p_in.get("uid") or str(uuid.uuid4()),
                        name=p_in["name"], age=p_in["age"], sex=p_in["sex"],
                        address=p_in["address"], regime=p_in["regime"], remark=p_in["remark"],
                        team_id=p_in.get("team_id", "DEFAULT")
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
       
    # Generate Code (e.g. 6D4-A2B)
    import random, string
    chars = string.ascii_uppercase + string.digits
    code = f"{''.join(random.choices(chars, k=3))}-{''.join(random.choices(chars, k=3))}"
    
    new_team = Team(name=name, slug=slug, invite_code=code)
    db.session.add(new_team)
    
    # Auto-approve creator (if we had auth, we'd link user. For now, create a 'Device Admin' member?)
    # Assuming the device creating it is the 'Owner'.
    device_id = data.get("device_id", "Unknown")
    user_name = data.get("user_name", "Admin")
    
    member = TeamMember(team_slug=slug, user_name=user_name, device_id=device_id, status='APPROVED', role='ADMIN')
    db.session.add(member)
    
    db.session.commit()
    return jsonify(success=True, team_slug=slug, invite_code=code)

@app.route("/api/teams/join", methods=["POST"])
def join_team():
    data = request.json
    slug = data.get("slug")
    code = data.get("code")
    
    user_name = data.get("user_name")
    device_id = data.get("device_id")
    
    team = None
    if code:
        # Case insensitive lookup
        team = Team.query.filter(Team.invite_code.ilike(code)).first()
        if team: slug = team.slug # Resolve code to slug
    elif slug:
        team = Team.query.filter_by(slug=slug).first()
        
    if not team: return jsonify(success=False, message="Team not found (Check Code or Slug)"), 404
    
    # Check existing
    existing = TeamMember.query.filter_by(team_slug=slug, device_id=device_id).first()
    if existing:
        return jsonify(success=True, status=existing.status, message="Already requested", team_slug=slug, team_name=team.name)
        
    new_mem = TeamMember(team_slug=slug, user_name=user_name, device_id=device_id, status='PENDING')
    db.session.add(new_mem)
    db.session.commit()
    
    return jsonify(success=True, status='PENDING', team_slug=slug, team_name=team.name)

@app.route("/api/teams/list", methods=["GET"])
def list_teams():
    # STRICT PRIVACY: Do NOT list all teams.
    # Only return the user's current team if they are in one.
    # To browse teams, they must know the slug/code.
    
    requester_device = request.headers.get('X-Device-ID')
    if not requester_device:
        return jsonify(success=True, teams=[])
        
    memberships = TeamMember.query.filter_by(device_id=requester_device).all()
    my_teams = []
    
    for m in memberships:
        t = Team.query.filter_by(slug=m.team_slug).first()
        if t:
            my_teams.append({"slug": t.slug, "name": t.name, "created_at": t.created_at.isoformat()})
            
    return jsonify(success=True, teams=my_teams)

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

@app.route("/api/teams/stats", methods=["POST"])
def team_stats():
    data = request.json
    slug = data.get("slug")
    
    team = Team.query.filter_by(slug=slug).first()
    if not team: return jsonify(success=False, message="Team not found"), 404
    
    patients = Patient.query.filter_by(team_id=slug).all()
    members = TeamMember.query.filter_by(team_slug=slug).all()
    
    p_count = len(patients)
    e_count = sum([len(p.events) for p in patients])
    m_count = len(members)
    
    # Estimate Size (Roughly)
    # Serialize once to check size? Or just estimate.
    # Let's do a quick serialization to be accurate for backup
    backup_data = {
        "team": {"name": team.name, "slug": team.slug},
        "patients": [],
        "members": []
    }
    for p in patients:
        backup_data["patients"].append({"name": p.name, "events": len(p.events)}) # Minimal for size check
        
    import json
    size_bytes = len(json.dumps(backup_data))
    
    return jsonify(success=True, stats={
        "patients": p_count,
        "events": e_count,
        "members": m_count,
        "size_bytes": size_bytes
    })

@app.route("/api/teams/disband", methods=["POST"])
def disband_team():
    try:
        data = request.json
        slug = data.get("slug")
        requester_device = data.get("device_id")
        
        # Security: Verify Admin
        req_header_dev = request.headers.get('X-Device-ID')
        if req_header_dev: requester_device = req_header_dev
        
        member = TeamMember.query.filter_by(team_slug=slug, device_id=requester_device).first()
        if not member or member.role != 'ADMIN':
            return jsonify(success=False, message="Unauthorized: Only Team Admins can disband."), 403

        team = Team.query.filter_by(slug=slug).first()
        if not team: return jsonify(success=False, message="Team not found"), 404
        
        # 1. Generate Backup
        patients = Patient.query.filter_by(team_id=slug).all()
        members = TeamMember.query.filter_by(team_slug=slug).all()
        
        backup = {
            "meta": {"exported_at": datetime.now().isoformat(), "type": "team_disband_backup"},
            "team": {"name": team.name, "slug": team.slug, "created_at": team.created_at.isoformat()},
            "members": [{"user_name": m.user_name, "device_id": m.device_id, "status": m.status} for m in members],
            "patients": []
        }
        
        for p in patients:
            p_data = {
                "uid": p.uid, "name": p.name, "age": p.age, "sex": p.sex,
                "address": p.address, "regime": p.regime, "remark": p.remark,
                "events": []
            }
            for e in p.events:
                p_data["events"].append({
                    "title": e.title, "start": e.start, "original_start": e.original_start,
                    "color": e.color, "missed_days": e.missed_days, "outcome": e.outcome
                })
            backup["patients"].append(p_data)
            
        # 2. Delete Data
        for p in patients:
            # Delete events
            Event.query.filter_by(patient_id=p.id).delete()
            # Delete patient
            db.session.delete(p)
            # Create Tombstone for patient? Yes, to be safe.
            if p.uid: db.session.add(DeletedRecord(uid=p.uid))
            
        for m in members:
            db.session.delete(m)
            
        db.session.delete(team)
        
        # 3. Create Team Tombstone for Sync
        # Prefix with 'team:' so merge logic knows it's a team
        db.session.add(DeletedRecord(uid=f"team:{slug}"))
        
        db.session.commit()
        
        return jsonify(success=True, backup=backup)
        
    except Exception as e:
        db.session.rollback()
        return jsonify(success=False, message=str(e)), 500

def secure_migrate():
    with app.app_context():
        db_path = os.path.join('instance', 'cycles.db')
        if not os.path.exists(db_path):
            db_path = 'cycles.db'
            
        if not os.path.exists(db_path): return # Let create_all handle it
        
        import sqlite3
        conn = sqlite3.connect(db_path)
        c = conn.cursor()
        
        # 1. Check/Add 'status'
        try:
            c.execute("SELECT status FROM team_member LIMIT 1")
        except sqlite3.OperationalError:
            print("Migrating: Adding 'status' column...")
            c.execute("ALTER TABLE team_member ADD COLUMN status VARCHAR(20) DEFAULT 'PENDING'")
            
        # 2. Check/Add 'role'
        try:
            c.execute("SELECT role FROM team_member LIMIT 1")
        except sqlite3.OperationalError:
            print("Migrating: Adding 'role' column...")
            c.execute("ALTER TABLE team_member ADD COLUMN role VARCHAR(20) DEFAULT 'MEMBER'")
            # Upgrade existing APPROVED to ADMIN (Legacy fix)
            c.execute("UPDATE team_member SET role = 'ADMIN' WHERE status = 'APPROVED'")
            
        conn.commit()
        conn.close()

if __name__ == "__main__":
    with app.app_context():
        secure_migrate()
        db.create_all()
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)))
