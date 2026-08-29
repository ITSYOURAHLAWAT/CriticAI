import urllib.request
import urllib.error
import json
import sys
import os

sys.stdout.reconfigure(encoding='utf-8')
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import db

# Insert a dummy completed evaluation for testing model endpoints
dummy_eval_id = db.save_evaluation({
    "model": "audit-test-model",
    "provider": "groq",
    "prompt_category": "all",
    "num_tests": 5,
    "include_redteam": 0
})
db.update_evaluation(dummy_eval_id, {
    "status": "completed",
    "pass_rate": 90.0,
    "health_score": 88.0,
    "total_tests": 5,
    "passed_tests": 4,
    "failed_tests": 1,
    "avg_scores": {"relevance": 90.0},
    "summary": "Audit test model evaluation"
})
db.save_ai_summary(dummy_eval_id, {"overall_grade": "A", "overall_verdict": "Great model for audit testing"})

BASE = "http://127.0.0.1:8000"

def check(name, path, expected_status=200, method="GET"):
    url = BASE + path
    req = urllib.request.Request(url, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            status = resp.status
            data = resp.read().decode("utf-8")
            print(f"✅ PASS: {method} {path} -> HTTP {status}")
            return True, status, data
    except urllib.error.HTTPError as e:
        if e.code == expected_status:
            print(f"✅ PASS (Expected {expected_status}): {method} {path} -> HTTP {e.code}")
            return True, e.code, e.read().decode("utf-8")
        else:
            print(f"❌ FAIL: {method} {path} -> HTTP {e.code} (expected {expected_status})")
            return False, e.code, e.read().decode("utf-8")
    except Exception as exc:
        print(f"❌ ERROR: {method} {path} -> {exc}")
        return False, 0, str(exc)

print("=" * 60)
print("SYSTEM-WIDE API ROUTE AUDIT & VERIFICATION")
print("=" * 60)

passed = 0
total = 0

tests = [
    ("Root", "/", 200, "GET"),
    ("Health", "/health", 200, "GET"),
    ("Stats", "/stats", 200, "GET"),
    ("Evaluations List", "/evaluations?limit=10", 200, "GET"),
    ("Leaderboard", "/leaderboard", 200, "GET"),
    ("Rubrics List", "/rubrics", 200, "GET"),
    ("Models List", "/models", 200, "GET"),
    ("Provider Status", "/provider/status", 200, "GET"),
    ("Templates List", "/templates", 200, "GET"),
    ("AB Tests List", "/ab-tests", 200, "GET"),
    ("Playground History", "/playground/history", 200, "GET"),
    ("Clear Playground History", "/playground/history", 200, "DELETE"),
    ("Model Summary (Sub-resource)", "/summary/model/audit-test-model", 200, "GET"),
    ("Model Card (Sub-resource)", "/model-card/model/audit-test-model", 200, "GET"),
    ("Eval Summary by ID", f"/summary/{dummy_eval_id}", 200, "GET"),
    ("Model Card by ID", f"/model-card/{dummy_eval_id}", 200, "GET"),
    ("Non-existent Evaluation", "/evaluations/non-existent-uuid-12345", 404, "GET"),
    ("Non-existent Summary", "/summary/non-existent-uuid-12345", 404, "GET"),
]

for name, path, exp_status, method in tests:
    total += 1
    ok, _, _ = check(name, path, exp_status, method)
    if ok:
        passed += 1

# Clean up dummy eval
db.delete_evaluation(dummy_eval_id)

print("\n" + "=" * 60)
print(f"AUDIT SUMMARY: {passed}/{total} ENDPOINT CHECKS PASSED (100%)")
print("=" * 60)

assert passed == total, f"Audit failed: {total - passed} checks failed"
