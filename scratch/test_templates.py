import sys
import os

sys.stdout.reconfigure(encoding='utf-8')
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from templates import get_all_templates, get_template_by_id, get_templates_by_category
from database import db

print("--- Testing Templates Module ---")
all_templates = get_all_templates(db)
print(f"Total templates found: {len(all_templates)}")
assert len(all_templates) >= 8, "Expected at least 8 built-in templates"

t1 = get_template_by_id("customer-service-bot", db)
print(f"Template 1: {t1['name']} ({t1['icon']}) - {len(t1['prompts'])} prompts")
assert t1 is not None, "Customer service bot template missing"

tech_templates = get_templates_by_category("technical", db)
print(f"Technical templates: {len(tech_templates)}")

print("--- Testing Database Custom Templates ---")
sample_custom = {
    "name": "Test Custom Template",
    "icon": "🧪",
    "description": "A unit test custom template",
    "category": "technical",
    "tags": ["unit-test"],
    "config": {
        "prompt_category": "coding",
        "num_tests": 5,
        "include_redteam": False,
        "recommended_models": ["llama-3.1-70b-versatile"],
        "focus_areas": ["testing"]
    },
    "prompts": ["Prompt 1", "Prompt 2", "Prompt 3"],
    "scoring_criteria": {"pass_threshold": 80, "key_metrics": ["accuracy"]},
    "use_case": "Testing",
    "difficulty": "beginner",
    "estimated_time": "~1 minute"
}

custom_id = db.save_custom_template(sample_custom)
print(f"Saved custom template with ID: {custom_id}")

custom_list = db.get_custom_templates()
print(f"Custom templates count: {len(custom_list)}")
assert len(custom_list) >= 1, "Custom template not retrieved"

db.increment_template_usage(custom_id)
print("Incremented template usage counter")

db.delete_custom_template(custom_id)
print(f"Deleted custom template {custom_id}")

print("✅ ALL BACKEND TEMPLATE VERIFICATIONS PASSED!")
