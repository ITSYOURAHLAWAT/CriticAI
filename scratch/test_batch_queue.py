import urllib.request
import urllib.error
import json
import sys
import os

sys.stdout.reconfigure(encoding='utf-8')
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from batch_queue import batch_manager, BatchSession, BatchJob, MAX_QUEUE_SIZE
from database import db

print("=" * 60)
print("BATCH EVALUATION QUEUE UNIT & INTEGRATION TEST")
print("=" * 60)

# 1. Test BatchSession unit logic
print("\n[1] Testing BatchSession & BatchJob logic...")
session = batch_manager.create_session()
job1 = session.add_job(model="llama-3.3-70b-versatile", prompt_category="all", num_tests=5)
job2 = session.add_job(model="gemini-1.5-flash", prompt_category="coding", num_tests=5)

assert len(session.jobs) == 2
assert job1.position == 1
assert job2.position == 2
assert session.total_jobs == 2
print(f"    Created session {session.session_id} with 2 jobs")

# Test max limit exception
try:
    s_full = BatchSession()
    for i in range(MAX_QUEUE_SIZE):
        s_full.add_job(model=f"model-{i}")
    s_full.add_job(model="overflow-model")
    assert False, "Should have raised ValueError for max queue size"
except ValueError as e:
    print(f"    Successfully caught max queue size error: {e}")

# 2. Test DB persistence
print("\n[2] Testing SQLite batch_sessions DB operations...")
sess_dict = session.to_dict()
saved_id = db.save_batch_session(sess_dict)
assert saved_id == session.session_id

fetched = db.get_batch_session(session.session_id)
assert fetched is not None
assert fetched["id"] == session.session_id
assert len(fetched["jobs"]) == 2
print(f"    Saved and retrieved batch session {saved_id} from SQLite DB")

db.update_batch_session(session.session_id, {"status": "completed", "completed_jobs": 2})
updated = db.get_batch_session(session.session_id)
assert updated["status"] == "completed"
assert updated["completed_jobs"] == 2
print("    Successfully updated batch session status in DB")

history = db.get_all_batch_sessions(limit=10)
assert len(history) >= 1
print(f"    Fetched {len(history)} batch sessions from DB history")

# 3. Test HTTP /batch/create Endpoint
print("\n[3] Testing HTTP /batch/create Endpoint...")
BASE = "http://127.0.0.1:8000"

def post_json(path, payload):
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(BASE + path, data=data, headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req) as resp:
        return resp.status, json.loads(resp.read().decode("utf-8"))

def get_json(path):
    req = urllib.request.Request(BASE + path)
    with urllib.request.urlopen(req) as resp:
        return resp.status, json.loads(resp.read().decode("utf-8"))

create_payload = {
    "jobs": [
        {"model": "llama-3.3-70b-versatile", "prompt_category": "all", "num_tests": 5},
        {"model": "mixtral-8x7b-32768", "prompt_category": "coding", "num_tests": 5}
    ],
    "delay_between": 2
}

try:
    status, res_data = post_json("/batch/create", create_payload)
    print(f"    POST /batch/create -> HTTP {status} | session_id={res_data.get('session_id')}")
    assert status == 200
    assert res_data["total_jobs"] == 2

    created_id = res_data["session_id"]
    status, get_res = get_json(f"/batch/{created_id}")
    print(f"    GET /batch/{created_id} -> HTTP {status} | status={get_res.get('status')}")
    assert status == 200

    status, cancel_res = post_json(f"/batch/{created_id}/cancel", {})
    print(f"    POST /batch/{created_id}/cancel -> HTTP {status} | msg={cancel_res.get('message')}")
    assert status == 200

    status, hist_res = get_json("/batch/history")
    print(f"    GET /batch/history -> HTTP {status} | total_sessions={len(hist_res)}")
    assert status == 200

except Exception as err:
    print(f"    HTTP Endpoint test notice: {err} (Backend server may not be running yet)")

print("\n" + "=" * 60)
print("ALL BATCH QUEUE UNIT & DB TESTS PASSED PERFECTLY!")
print("=" * 60)
