#!/bin/bash
# Install dependencies if needed (quietly)
pip install -r requirements.txt > /dev/null 2>&1

# Run the Flask app
echo "Starting Team Cycle Tracker..."
echo "Please open http://127.0.0.1:5000 in your browser."
# Run with Debug enabled for auto-reload
export FLASK_DEBUG=1
python app.py
