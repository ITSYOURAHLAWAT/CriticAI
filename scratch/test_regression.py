import urllib.request
import urllib.error
import json
import sys
import os

sys.stdout.reconfigure(encoding='utf-8')
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from regression import calculate_trend, detect_regression, get_all_models_regression
from database import db

print("=" * 60)
print("REGRESSION TRACKER UNIT & INTEGRATION TEST")
print("=" * 60)

# 1. Unit test calculate_trend
print("\n[1] Testing calculate_trend logic...")

# Case A: Improving
t_imp = calculate_trend([70.0, 85.0])
print(f"    Improving case: trend={t_imp['trend']}, emoji={t_imp['emoji']}, health={t_imp['health']}")
assert t_imp["trend"] == "improving"
assert t_imp["health"] == "good"

# Case B: Critical Drop
t_drop = calculate_trend([85.0, 65.0])
print(f"    Critical drop case: trend={t_drop['trend']}, alert={t_drop['alert']}, msg={t_drop['alert_message']}")
assert t_drop["trend"] == "declining"
assert t_drop["alert"] is True
assert t_drop["health"] == "critical"

# Case C: Stable
t_stable = calculate_trend([80.0, 82.0])
print(f"    Stable case: trend={t_stable['trend']}, health={t_stable['health']}")
assert t_stable["trend"] == "stable"
assert t_stable["health"] == "good"

# Case D: Insufficient Data
t_insuf = calculate_trend([80.0])
print(f"    Insufficient case: trend={t_insuf['trend']}")
assert t_insuf["trend"] == "insufficient_data"

# 2. Test detect_regression with sample evaluations
print("\n[2] Testing detect_regression structure...")
mock_evals = [
    {"id": "eval-1", "pass_rate": 70.0, "health_score": 72.0, "created_at": "2026-08-01T10:00:00Z", "provider": "groq", "prompt_category": "coding"},
    {"id": "eval-2", "pass_rate": 88.0, "health_score": 85.0, "created_at": "2026-08-05T10:00:00Z", "provider": "groq", "prompt_category": "coding"},
    {"id": "eval-3", "pass_rate": 65.0, "health_score": 62.0, "created_at": "2026-08-10T10:00:00Z", "provider": "groq", "prompt_category": "math"}
]
res = detect_regression("llama-3.1-70b-versatile", mock_evals)
print(f"    Model: {res['model']}")
print(f"    Eval count: {res['eval_count']}")
print(f"    Trend: {res['trend_analysis']['trend']}")
print(f"    Alert: {res['trend_analysis']['alert']}")
print(f"    Best eval pass rate: {res['best_eval']['pass_rate']}%")
print(f"    Worst eval pass rate: {res['worst_eval']['pass_rate']}%")
assert res["eval_count"] == 3
assert res["best_eval"]["pass_rate"] == 88.0
assert res["worst_eval"]["pass_rate"] == 65.0

# 3. Test DB seed and endpoints
print("\n[3] Seeding test evaluations into SQLite database...")
eval_id_1 = db.save_evaluation({
    "model": "llama-3.3-70b-versatile",
    "provider": "groq",
    "prompt_category": "coding",
    "num_tests": 10
})
db.update_evaluation(eval_id_1, {
    "status": "completed",
    "pass_rate": 80.0,
    "health_score": json.dumps({"overall": 80.0})
})

eval_id_2 = db.save_evaluation({
    "model": "llama-3.3-70b-versatile",
    "provider": "groq",
    "prompt_category": "coding",
    "num_tests": 10
})
db.update_evaluation(eval_id_2, {
    "status": "completed",
    "pass_rate": 92.0,
    "health_score": json.dumps({"overall": 92.0})
})

eval_history = db.get_model_eval_history("llama-3.3-70b-versatile")
print(f"    Fetched {len(eval_history)} evaluation history items from DB for llama-3.3-70b-versatile")
assert len(eval_history) >= 2

# 4. Test HTTP Endpoints
BASE = "http://127.0.0.1:8000"

def get_json(path):
    req = urllib.request.Request(BASE + path)
    with urllib.request.urlopen(req) as resp:
        return resp.status, json.loads(resp.read().decode("utf-8"))

print("\n[4] Testing HTTP /regression endpoints...")

status, data = get_json("/regression")
print(f"    GET /regression -> HTTP {status} | models_analyzed={len(data)}")

status, data = get_json("/regression/alerts")
print(f"    GET /regression/alerts -> HTTP {status} | alerted_models={len(data)}")

status, data = get_json("/regression/llama-3.3-70b-versatile")
print(f"    GET /regression/llama-3.3-70b-versatile -> HTTP {status} | trend={data['trend_analysis']['trend']}")
assert status == 200

print("\n" + "=" * 60)
print("ALL REGRESSION TRACKER TESTS PASSED PERFECTLY!")
print("=" * 60)
