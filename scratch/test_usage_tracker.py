import urllib.request
import urllib.error
import json
import sys
import os
import time

sys.stdout.reconfigure(encoding='utf-8')
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from usage_tracker import tracker
from database import db

print("=" * 60)
print("USAGE TRACKER & COST ESTIMATOR UNIT & INTEGRATION TEST")
print("=" * 60)

# 1. Test tracker methods
print("\n[1] Testing UsageTracker singleton in-memory recording...")
tracker.record_usage("groq", "llama-3.3-70b-versatile", 500, 200, "evaluation")
tracker.record_usage("gemini", "gemini-1.5-flash", 1000, 400, "playground")
tracker.record_usage("ollama", "llama3:latest", 300, 100, "evaluation")

stats = tracker.get_usage_stats()
print(f"    Session duration: {stats['session_duration_minutes']} min")
print(f"    Groq today tokens: {stats['providers']['groq']['today']['tokens_total']}")
print(f"    Gemini today tokens: {stats['providers']['gemini']['today']['tokens_total']}")
print(f"    Savings vs GPT-4o: ${stats['savings']['vs_gpt4o']}")
print(f"    Savings explanation: {stats['savings']['explanation']}")
assert stats['providers']['groq']['today']['tokens_total'] == 700
assert stats['providers']['gemini']['today']['tokens_total'] == 1400

# 2. Test database logging methods
print("\n[2] Testing DatabaseManager api_usage_log persistence...")
db.log_api_call("groq", "llama-3.3-70b-versatile", 500, 200, "evaluation")
db.log_api_call("gemini", "gemini-1.5-flash", 1000, 400, "playground")

logs = db.get_recent_api_logs(limit=10)
print(f"    Fetched {len(logs)} log entries from SQLite")
assert len(logs) >= 2

history = db.get_usage_by_day(days=7)
print(f"    Fetched {len(history)} daily history rows")

# 3. Test HTTP endpoints
BASE = "http://127.0.0.1:8000"

def get_json(path):
    req = urllib.request.Request(BASE + path)
    with urllib.request.urlopen(req) as resp:
        return resp.status, json.loads(resp.read().decode("utf-8"))

print("\n[3] Testing HTTP /usage/ endpoints...")
time.sleep(3)

status, data = get_json("/usage/stats")
print(f"    GET /usage/stats -> HTTP {status} | session_start={data.get('session_start')[:19]}")

status, data = get_json("/usage/history")
print(f"    GET /usage/history -> HTTP {status} | count={len(data)}")

status, data = get_json("/usage/limits")
print(f"    GET /usage/limits -> HTTP {status} | providers={list(data.keys())}")

status, data = get_json("/usage/log")
print(f"    GET /usage/log -> HTTP {status} | logs_returned={len(data)}")

status, data = get_json("/usage/warnings")
print(f"    GET /usage/warnings -> HTTP {status} | active_warnings={len(data)}")

print("\n" + "=" * 60)
print("ALL USAGE TRACKER TESTS PASSED PERFECTLY!")
print("=" * 60)
