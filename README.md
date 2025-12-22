# Team Cycle Tracker

A Flask-based web application to track patient treatment cycles with visual timelines using FullCalendar. Designed for teams to manage multiple patients and view their treatment milestones in a color-coded calendar.

## Features

- Add multiple patients with details:
  - Name, Age, Sex, Address
  - Treatment Regime (IR, RR, CR)
  - Remarks and missed days
- Automatically generate cycle milestones (M1, M2, M3, M-end)
- Color-coded events for each patient
- Interactive FullCalendar view:
  - Click on events to see patient details in a modal
- Collapsible Add Patient form
- Lightweight, mobile-friendly interface

## Tech Stack

- Python 3 + Flask
- SQLite (default) / Postgres (optional)
- SQLAlchemy ORM
- FullCalendar 6 for calendar visualization
- HTML, CSS, JS for frontend

## Installation

```bash
git clone https://github.com/minthanthtoo/team-cycle-tracker.git
cd team-cycle-tracker
python -m venv venv
source venv/bin/activate  # macOS/Linux
pip install -r requirements.txt
python app.py
```
- **IMPORTANT**: You must run this via `python app.py`. Do not open `index.html` directly or use "Live Server" (port 5500), as the Jinja2 templates `{{ url_for... }}` require the Flask backend to render.
- Open http://127.0.0.1:5000 in your browser.

## Deployment
- Ready for Render or any Python web service
- Ensure app.py listens on 0.0.0.0 and port os.environ["PORT"]
- For persistent storage, use Postgres instead of SQLite

## Project Structure

prj_TB_Team/
├─ app.py
├─ requirements.txt
├─ Procfile
├─ templates/
│  └─ index.html
├─ static/
│  ├─ style.css
│  └─ script.js
└─ cycles.db  # SQLite (local development)

## License

MIT License

