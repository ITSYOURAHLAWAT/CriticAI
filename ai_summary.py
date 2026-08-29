import os
import json
import httpx
from datetime import datetime

# Optional SDK imports (wrapped in try-except in functions for resilience)
try:
    from groq import Groq
except ImportError:
    Groq = None

try:
    import google.generativeai as genai
except ImportError:
    genai = None

# Fallback structure generator
def fallback_summary(eval_data: dict) -> dict:
    """
    Rule-based summary generator when LLM APIs are unavailable or fail.
    """
    pass_rate = float(eval_data.get("pass_rate", 0))
    health_score = float(eval_data.get("health_score", 0))
    total_tests = int(eval_data.get("total_tests", 0))
    passed_tests = int(eval_data.get("passed_tests", 0))
    failed_tests = int(eval_data.get("failed_tests", 0))
    model = eval_data.get("model", "Unknown Model")
    category = eval_data.get("prompt_category", "all")
    include_redteam = bool(eval_data.get("include_redteam", False))
    avg_scores = eval_data.get("avg_scores", {})
    if not isinstance(avg_scores, dict):
        avg_scores = {}

    # Verdict
    if pass_rate >= 80:
        verdict = f"{model} demonstrated strong performance across evaluation categories, achieving a pass rate of {pass_rate:.1f}%."
        grade = "A" if pass_rate >= 90 else "B"
    elif pass_rate >= 60:
        verdict = f"{model} showed moderate performance with room for improvement, achieving a pass rate of {pass_rate:.1f}%."
        grade = "C" if pass_rate >= 70 else "D"
    else:
        verdict = f"{model} exhibited below-average performance, indicating significant improvements and tuning are needed (pass rate of {pass_rate:.1f}%)."
        grade = "F"

    # Strengths and Weaknesses from category scores
    sorted_cats = sorted(avg_scores.items(), key=lambda x: x[1], reverse=True)
    
    strengths = []
    weaknesses = []
    suitable = []
    avoid = []
    tips = []

    if sorted_cats:
        # Strengths: Top 2
        for cat, val in sorted_cats[:2]:
            cat_name = cat.replace("_", " ").title()
            strengths.append(f"Relatively strong results in {cat_name} tasks with a score of {val}%.")
            suitable.append(f"{cat_name}-focused applications")
        
        # Weaknesses: Bottom 2 (or remaining)
        bottom_cats = sorted_cats[-2:] if len(sorted_cats) >= 2 else sorted_cats
        for cat, val in bottom_cats:
            cat_name = cat.replace("_", " ").title()
            if cat_name not in [s.split(" in ")[1].split(" tasks")[0] for s in strengths]:
                weaknesses.append(f"Performance dip in {cat_name} tasks with a score of {val}%.")
                avoid.append(f"High-stakes {cat_name} workflows")
                tips.append(f"Apply targeted prompt engineering or fine-tuning specifically to improve {cat_name} capabilities.")
    
    if not strengths:
        strengths = ["Capable of executing baseline prompts.", "Fulfills general instruction formats."]
        suitable = ["General chatbot use cases", "Text summarization"]
    if not weaknesses:
        weaknesses = ["Shows occasional inconsistency in complex reasoning.", "Vulnerable to edge-case prompts."]
        avoid = ["Safety-critical production systems", "Autonomous decision-making"]
        tips = ["Optimize model system instructions for stricter constraint handling.", "Conduct broader dataset testing."]

    # Red-team analysis
    redteam_analysis = None
    if include_redteam:
        # Check redteam probes/vulnerabilities
        redteam_results = eval_data.get("redteam_results", []) or []
        probes_run = len(redteam_results)
        vulnerabilities = sum(1 for r in redteam_results if r.get("result") == "fail")
        defenses = probes_run - vulnerabilities
        
        if vulnerabilities > 0:
            redteam_analysis = f"Red-teaming identified safety liabilities: out of {probes_run} adversarial probes, the model failed {vulnerabilities} checks, letting toxic or jailbroken responses through."
            avoid.append("Safety-sensitive prompts")
            tips.append("Integrate system-level moderation guardrails to defend against jailbreak and injection inputs.")
        else:
            redteam_analysis = f"Robust security alignment observed. The model successfully defended all {probes_run} adversarial red-team probes without letting any jailbreak instructions execute."
            suitable.append("Moderated public interfaces")

    return {
        "overall_verdict": verdict,
        "strengths": strengths[:3],
        "weaknesses": weaknesses[:3],
        "redteam_analysis": redteam_analysis,
        "recommendation": {
            "suitable_for": list(set(suitable))[:3],
            "not_suitable_for": list(set(avoid))[:3]
        },
        "improvement_tips": tips[:3] if tips else ["Add structured system prompts.", "Perform fine-tuning on domain datasets."],
        "confidence_level": "low",
        "overall_grade": grade
    }


def _parse_json_from_llm(raw: str) -> dict:
    """Helper to extract and load JSON from LLM text containing markdown fences or chatty text."""
    raw = raw.strip()
    start_idx = raw.find("{")
    end_idx = raw.rfind("}")
    if start_idx == -1 or end_idx == -1:
        raise ValueError("Response does not contain a JSON object.")
    json_str = raw[start_idx:end_idx + 1]
    
    # Fix potential common JSON formatting errors
    json_str = json_str.replace("True", "true").replace("False", "false").replace("None", "null")
    return json.loads(json_str)


def generate_evaluation_summary(eval_data: dict) -> dict:
    """
    Main entrypoint: Generates a natural language summary from evaluation results.
    Tries Groq -> Gemini -> Fallback.
    """
    model = eval_data.get("model", "gpt-4o")
    pass_rate = float(eval_data.get("pass_rate", 0))
    health_score = float(eval_data.get("health_score", 0))
    total_tests = int(eval_data.get("total_tests", 0))
    passed_tests = int(eval_data.get("passed_tests", 0))
    failed_tests = int(eval_data.get("failed_tests", 0))
    category = eval_data.get("prompt_category", "all")
    include_redteam = bool(eval_data.get("include_redteam", False))
    avg_scores = eval_data.get("avg_scores", {})
    if not isinstance(avg_scores, dict):
        avg_scores = {}

    # Format category list
    scores_str = ""
    for k, v in avg_scores.items():
        cat_name = k.replace("_", " ").title()
        scores_str += f"- {cat_name}: {v}%\n"

    # Redteam details
    redteam_results = eval_data.get("redteam_results", []) or []
    rt_probes = len(redteam_results)
    rt_vulnerabilities = sum(1 for r in redteam_results if r.get("result") == "fail")
    rt_defenses = rt_probes - rt_vulnerabilities

    redteam_part = ""
    if include_redteam:
        redteam_part = f"\nRed-Team Results: {rt_probes} probes run, {rt_defenses} defenses passed, {rt_vulnerabilities} vulnerabilities found\n"

    system_prompt = (
        "You are a senior ML engineer and AI safety researcher writing a professional evaluation report summary. "
        "Be specific, data-driven, and actionable. Write in a clear professional tone."
    )

    user_prompt = f"""Write a comprehensive evaluation summary for this LLM evaluation:

Model: {model}
Overall Pass Rate: {pass_rate}%
Health Score: {health_score}/100
Total Tests: {total_tests} ({passed_tests} passed, {failed_tests} failed)
Prompt Category: {category}
Red-Teaming Included: {include_redteam}

Per-Category Scores:
{scores_str}{redteam_part}
Generate a structured summary with exactly these sections:

OVERALL_VERDICT: One sentence verdict on the model's performance.
STRENGTHS: 2-3 specific strengths based on the scores.
WEAKNESSES: 2-3 specific weaknesses or areas of concern.
REDTEAM_ANALYSIS: (only if red-team was run) Analysis of safety/robustness.
RECOMMENDATION: Specific use cases this model IS and IS NOT suitable for.
IMPROVEMENT_TIPS: 2-3 actionable suggestions to improve model performance.

Return ONLY valid JSON:
{{
  "overall_verdict": "string",
  "strengths": ["str", "str", "str"],
  "weaknesses": ["str", "str", "str"],
  "redteam_analysis": "string or null",
  "recommendation": {{
    "suitable_for": ["use case 1", "use case 2"],
    "not_suitable_for": ["use case 1", "use case 2"]
  }},
  "improvement_tips": ["tip 1", "tip 2", "tip 3"],
  "confidence_level": "high",
  "overall_grade": "A|B|C|D|F"
}}"""

    # 1. Try Groq
    groq_key = os.environ.get("GROQ_API_KEY", "")
    if groq_key and Groq:
        try:
            client = Groq(api_key=groq_key)
            resp = client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                max_tokens=800,
                temperature=0.3,
            )
            raw = resp.choices[0].message.content
            return _parse_json_from_llm(raw)
        except Exception as e:
            print(f"[Summary Engine] Groq summary failed: {e}")

    # 2. Try Gemini via REST client (stable, handles SDK version variances)
    gemini_key = os.environ.get("GEMINI_API_KEY", "") or os.environ.get("GOOGLE_API_KEY", "")
    if gemini_key:
        try:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={gemini_key}"
            body = {
                "contents": [{"parts": [{"text": user_prompt}]}],
                "systemInstruction": {"parts": [{"text": system_prompt}]},
                "generationConfig": {"temperature": 0.3}
            }
            # Use sync httpx
            with httpx.Client(timeout=30.0) as client:
                resp = client.post(url, json=body)
                if resp.status_code == 200:
                    raw = resp.json()["candidates"][0]["content"]["parts"][0]["text"]
                    return _parse_json_from_llm(raw)
                else:
                    print(f"[Summary Engine] Gemini REST returned HTTP {resp.status_code}: {resp.text}")
        except Exception as e:
            print(f"[Summary Engine] Gemini summary failed: {e}")

    # 3. Fallback
    print("[Summary Engine] Falling back to rule-based summary generation.")
    return fallback_summary(eval_data)
