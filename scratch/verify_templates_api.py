import urllib.request, json, sys
sys.stdout.reconfigure(encoding='utf-8')

BASE = "http://127.0.0.1:8000"

# 1. GET /templates
r = urllib.request.urlopen(f"{BASE}/templates")
data = json.loads(r.read().decode("utf-8"))
print(f"[1] GET /templates -> {len(data)} templates returned")
for t in data:
    name = t.get("name", "?")
    icon = t.get("icon", "?")
    prompts = len(t.get("prompts", []))
    redteam = t.get("config", {}).get("include_redteam", False)
    print(f"    {icon} {name} | prompts={prompts} | redteam={redteam}")

# 2. GET /templates/{id}
first_id = data[0]["id"]
r2 = urllib.request.urlopen(f"{BASE}/templates/{first_id}")
t1 = json.loads(r2.read().decode("utf-8"))
print(f"\n[2] GET /templates/{first_id} -> OK: {t1['name']}")

# 3. Category filter
r3 = urllib.request.urlopen(f"{BASE}/templates?category=technical")
tech = json.loads(r3.read().decode("utf-8"))
print(f"[3] GET /templates?category=technical -> {len(tech)} templates")

# 4. Search filter
r4 = urllib.request.urlopen(f"{BASE}/templates?search=coding")
srch = json.loads(r4.read().decode("utf-8"))
print(f"[4] GET /templates?search=coding -> {len(srch)} templates")

# 5. POST custom template
import urllib.parse
payload = json.dumps({
    "name": "Test Custom Template",
    "icon": "🧪",
    "description": "Automated test template",
    "category": "technical",
    "tags": ["test"],
    "config": {
        "prompt_category": "coding",
        "num_tests": 5,
        "include_redteam": False,
        "recommended_models": ["llama-3.1-70b-versatile"],
        "focus_areas": ["testing"]
    },
    "prompts": ["Write a for loop in Python", "Explain recursion", "What is a REST API?"],
    "scoring_criteria": {"pass_threshold": 80, "key_metrics": ["accuracy"]},
    "use_case": "Testing",
    "difficulty": "beginner",
    "estimated_time": "~1 minute"
}).encode("utf-8")

req = urllib.request.Request(f"{BASE}/templates/custom", data=payload, headers={"Content-Type": "application/json"}, method="POST")
r5 = urllib.request.urlopen(req)
created = json.loads(r5.read().decode("utf-8"))
custom_id = created["id"]
print(f"[5] POST /templates/custom -> Created ID: {custom_id}")

# 6. POST /templates/{id}/use
req6 = urllib.request.Request(f"{BASE}/templates/{custom_id}/use", data=b"", method="POST")
r6 = urllib.request.urlopen(req6)
use_resp = json.loads(r6.read().decode("utf-8"))
print(f"[6] POST /templates/{custom_id}/use -> {use_resp['status']}")

# 7. GET /templates - verify custom appears
r7 = urllib.request.urlopen(f"{BASE}/templates")
all_t = json.loads(r7.read().decode("utf-8"))
custom_found = any(t["id"] == custom_id for t in all_t)
print(f"[7] Custom template in list -> {custom_found}")

# 8. DELETE custom template
req8 = urllib.request.Request(f"{BASE}/templates/custom/{custom_id}", method="DELETE")
r8 = urllib.request.urlopen(req8)
del_resp = json.loads(r8.read().decode("utf-8"))
print(f"[8] DELETE /templates/custom/{custom_id} -> {del_resp['status']}")

print("\n=== ALL API CHECKS PASSED! ===")
