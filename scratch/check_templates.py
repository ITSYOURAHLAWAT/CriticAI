import urllib.request
import json
import sys
import time

sys.stdout.reconfigure(encoding='utf-8')

BASE = "http://127.0.0.1:8000"

def get(path):
    r = urllib.request.urlopen(BASE + path)
    return json.loads(r.read().decode("utf-8")), r.status

# Wait for server
for i in range(10):
    try:
        get("/health")
        break
    except Exception:
        time.sleep(1)

print("=" * 55)
print("TEMPLATES ENDPOINT CHECKS")
print("=" * 55)

# 1. All templates
data, status = get("/templates")
print(f"\n[1] GET /templates -> HTTP {status}, count={len(data)}")
for t in data:
    icon = t.get("icon", "?")
    name = t.get("name", "?")
    prompts = len(t.get("prompts", []))
    redteam = t.get("config", {}).get("include_redteam", False)
    used = t.get("used_count", 0)
    print(f"    {icon}  {name} | prompts={prompts} | red_team={redteam} | used={used}")

# 2. Single template by ID
first_id = data[0]["id"]
t1, s2 = get(f"/templates/{first_id}")
print(f"\n[2] GET /templates/{first_id}")
print(f"    -> HTTP {s2}: {t1['name']}, {len(t1['prompts'])} prompts")

# 3. Category filter
tech, s3 = get("/templates?category=technical")
print(f"\n[3] GET /templates?category=technical -> HTTP {s3}, count={len(tech)}")

# 4. Search filter
srch, s4 = get("/templates?search=coding")
print(f"\n[4] GET /templates?search=coding -> HTTP {s4}, count={len(srch)}")

# 5. Create custom template
import urllib.request as ur
req_data = json.dumps({
    "name": "Smoke Test Template",
    "icon": "🔥",
    "description": "A quick smoke test custom template",
    "category": "technical",
    "tags": ["test"],
    "config": {
        "prompt_category": "coding",
        "num_tests": 5,
        "include_redteam": False,
        "recommended_models": ["llama-3.1-70b-versatile"],
        "focus_areas": ["smoke-test"]
    },
    "prompts": ["Prompt 1", "Prompt 2", "Prompt 3"],
    "scoring_criteria": {"pass_threshold": 80, "key_metrics": ["accuracy"]},
    "use_case": "Quick smoke test",
    "difficulty": "beginner",
    "estimated_time": "~1 minute"
}).encode("utf-8")
req = ur.Request(BASE + "/templates/custom", data=req_data,
                 headers={"Content-Type": "application/json"}, method="POST")
with ur.urlopen(req) as resp:
    created = json.loads(resp.read().decode("utf-8"))
    print(f"\n[5] POST /templates/custom -> HTTP {resp.status}: id={created['id']}, name={created['name']}")

custom_id = created["id"]

# 6. Increment usage
req2 = ur.Request(BASE + f"/templates/{custom_id}/use", method="POST")
with ur.urlopen(req2) as resp2:
    print(f"\n[6] POST /templates/{custom_id}/use -> HTTP {resp2.status}")

# 7. Delete custom template
req3 = ur.Request(BASE + f"/templates/custom/{custom_id}", method="DELETE")
with ur.urlopen(req3) as resp3:
    del_resp = json.loads(resp3.read().decode("utf-8"))
    print(f"\n[7] DELETE /templates/custom/{custom_id} -> HTTP {resp3.status}: {del_resp['message']}")

# 8. Confirm deleted (should be gone)
all_after, _ = get("/templates")
custom_ids = [t["id"] for t in all_after if not t.get("is_builtin")]
assert custom_id not in custom_ids, "Custom template still exists after delete!"
print(f"\n[8] Confirm deletion: custom template gone. Total remaining: {len(all_after)}")

print("\n" + "=" * 55)
print("ALL CHECKS PASSED!")
print("=" * 55)
