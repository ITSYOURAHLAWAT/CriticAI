"""
Verify that the stream eval save logic correctly parses the EvalReport model_dump() structure
without raising float() TypeError.
"""
import sys, os
sys.stdout.reconfigure(encoding='utf-8')
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from schemas.report import EvalReport, ModelHealthScore, FailureBreakdown, ImprovementSuggestion
from schemas.eval_result import EvalResult, ScoreDimension

# Simulate what reporter_agent produces
report = EvalReport(
    model="llama-3.3-70b-versatile",
    summary="Test summary",
    total_tests=10,
    passed_tests=8,
    detailed_results=[
        EvalResult(
            test_id="t1",
            model_response="Good answer",
            scores=ScoreDimension(hallucination=5, toxicity=2, relevance=90, coherence=88, instruction_following=95),
            passed=True,
        ),
        EvalResult(
            test_id="t2",
            model_response="Bad answer",
            scores=ScoreDimension(hallucination=60, toxicity=30, relevance=40, coherence=50, instruction_following=45),
            passed=False,
            failure_detail="Hallucination detected",
        ),
    ],
    health_score=ModelHealthScore(overall=82.5, pass_rate=80.0),
).model_dump()

print("Report keys:", list(report.keys()))
print("health_score type:", type(report["health_score"]))
print("health_score value:", report["health_score"])

# ── Simulate exactly what the fixed main.py does ──
health_score_obj = report.get("health_score", {})
if not isinstance(health_score_obj, dict):
    health_score_obj = {}

health_score_val = float(health_score_obj.get("overall", 0))
pass_rate        = float(health_score_obj.get("pass_rate", 0))
total_tests      = int(report.get("total_tests", 10))
passed           = int(report.get("passed_tests", 0))

avg_scores = {
    "hallucination":         health_score_obj.get("hallucination_avg", 0),
    "toxicity":              health_score_obj.get("toxicity_avg", 0),
    "relevance":             health_score_obj.get("relevance_avg", 0),
    "coherence":             health_score_obj.get("coherence_avg", 0),
    "instruction_following": health_score_obj.get("instruction_following_avg", 0),
}

print(f"\n✅ health_score_val = {health_score_val}  (type: {type(health_score_val).__name__})")
print(f"✅ pass_rate        = {pass_rate}         (type: {type(pass_rate).__name__})")
print(f"✅ total_tests      = {total_tests}")
print(f"✅ passed           = {passed}")
print(f"✅ avg_scores       = {avg_scores}")

# ── Simulate save_test_results logic ──
detailed_results = report.get("detailed_results", [])
test_rows = []
for tc in detailed_results:
    score_val = float(
        tc["scores"].get("relevance", 0)
        if isinstance(tc.get("scores"), dict)
        else tc.get("score", 0)
    )
    test_rows.append({
        "prompt":     tc.get("prompt", tc.get("test_id", "")),
        "category":   tc.get("category", ""),
        "result":     "pass" if tc.get("passed") else "fail",
        "score":      score_val,
        "reasoning":  tc.get("failure_detail", tc.get("reasoning", "")),
        "response":   tc.get("model_response", tc.get("response", "")),
        "is_redteam": tc.get("is_redteam", False),
        "attack_type": tc.get("attack_type", ""),
    })

print(f"\n✅ {len(test_rows)} test result rows built:")
for r in test_rows:
    print(f"   result={r['result']} score={r['score']} response='{r['response'][:30]}...'")

print("\n" + "=" * 50)
print("ALL PARSE CHECKS PASSED — No float() TypeError!")
print("=" * 50)
