import sqlite3
import uuid
from datetime import datetime, timedelta
from flask import Flask, render_template, request, Response, jsonify, g

app = Flask(__name__)
DATABASE = 'pomodoro.db'

def get_db():
    db = getattr(g, '_database', None)
    if db is None:
        db = g._database = sqlite3.connect(DATABASE)
        db.row_factory = sqlite3.Row
    return db

@app.teardown_appcontext
def close_connection(exception):
    db = getattr(g, '_database', None)
    if db is not None:
        db.close()

def init_db():
    with app.app_context():
        db = get_db()
        db.execute('''
            CREATE TABLE IF NOT EXISTS sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_uuid TEXT NOT NULL,
                start_time TEXT NOT NULL,
                duration INTEGER NOT NULL
            )
        ''')
        db.commit()

# Initialize DB on start
init_db()

@app.route('/api/history', methods=['GET'])
def get_history():
    user_uuid = request.args.get('uuid')
    if not user_uuid:
        return jsonify([])

    db = get_db()
    # Get last 50 sessions, newest first
    cur = db.execute('''
        SELECT id, start_time, duration 
        FROM sessions 
        WHERE user_uuid = ? 
        ORDER BY start_time DESC 
        LIMIT 50
    ''', (user_uuid,))

    rows = cur.fetchall()
    history = [dict(row) for row in rows]
    return jsonify(history)

@app.route('/api/history/<int:id>', methods=['DELETE'])
def delete_session(id):
    data = request.json
    user_uuid = data.get('uuid')

    db = get_db()
    # Only delete if it belongs to this user
    db.execute('DELETE FROM sessions WHERE id = ? AND user_uuid = ?', (id, user_uuid))
    db.commit()

    return jsonify({"status": "deleted"})

@app.route('/')
def home():
    return render_template('index.html')

@app.route('/api/log', methods=['POST'])
def log_session():
    data = request.json
    user_uuid = data.get('uuid')
    duration = data.get('duration', 25)

    # Use the client's timestamp if provided (for offline sync), otherwise use Now
    # We fallback to server time if client didn't send one
    timestamp = data.get('created_at', datetime.utcnow().isoformat())

    db = get_db()
    db.execute('INSERT INTO sessions (user_uuid, start_time, duration) VALUES (?, ?, ?)',
               (user_uuid, timestamp, duration))
    db.commit()

    return jsonify({"status": "success"})


@app.route('/calendar/<user_uuid>.ics')
def get_calendar_feed(user_uuid):
    """
    Generates a full CALENDAR FEED for the specific user.
    Calendar apps poll this URL to get updates.
    """
    db = get_db()
    cur = db.execute('SELECT * FROM sessions WHERE user_uuid = ?', (user_uuid,))
    rows = cur.fetchall()

    ics_lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//My Pomodoro//EN",
        "CALSCALE:GREGORIAN",
        "X-WR-CALNAME:Pomodoro Focus",
        "REFRESH-INTERVAL;VALUE=DURATION:PT15M" # Suggest 15min refresh rate
    ]

    for row in rows:
        start_dt = datetime.fromisoformat(row['start_time'])
        end_dt = start_dt + timedelta(minutes=row['duration'])

        # Format: YYYYMMDDTHHMMSSZ
        fmt = '%Y%m%dT%H%M%SZ'

        ics_lines.extend([
            "BEGIN:VEVENT",
            f"UID:pomodoro-{row['id']}@myserver",
            f"DTSTAMP:{start_dt.strftime(fmt)}",
            f"DTSTART:{start_dt.strftime(fmt)}",
            f"DTEND:{end_dt.strftime(fmt)}",
            "SUMMARY:🍅 Focus Session",
            "STATUS:CONFIRMED",
            "END:VEVENT"
        ])

    ics_lines.append("END:VCALENDAR")

    return Response(
        "\r\n".join(ics_lines),
        mimetype="text/calendar"
    )

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
