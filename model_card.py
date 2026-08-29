import json
import os
from datetime import datetime

def grade_from_score(score: float) -> str:
    """Returns a letter grade from a numeric score."""
    if score >= 90:
        return 'A'
    elif score >= 80:
        return 'B'
    elif score >= 70:
        return 'C'
    elif score >= 60:
        return 'D'
    else:
        return 'F'

def ascii_bar(score: float, width: int = 10) -> str:
    """Generates an ASCII loading bar representing the score."""
    filled = round(score / 10)
    # Ensure filled is within range 0 to width
    filled = max(0, min(width, filled))
    empty = width - filled
    return "█" * filled + "░" * empty

def generate_model_card(eval_data: dict, ai_summary: dict = None) -> str:
    """
    Generates a HuggingFace-style Model Card in Markdown format.
    Fills in real data from eval_data and ai_summary.
    """
    model = eval_data.get("model", "Unknown Model")
    provider = eval_data.get("provider", "groq")
    pass_rate = eval_data.get("pass_rate", 0.0)
    health_score = eval_data.get("health_score", 0.0)
    total_tests = eval_data.get("total_tests", 0)
    passed_tests = eval_data.get("passed_tests", 0)
    failed_tests = eval_data.get("failed_tests", 0)
    include_redteam = eval_data.get("include_redteam", False)
    prompt_category = eval_data.get("prompt_category", "all")
    created_at = eval_data.get("created_at", "")
    dataset_filename = eval_data.get("dataset_filename")

    # Format date
    date_str = ""
    if created_at:
        try:
            # Parse created_at ISO string (e.g. 2026-08-12T02:02:17.123Z)
            dt = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
            date_str = dt.strftime("%B %d, %Y")
        except Exception:
            date_str = created_at.split("T")[0]
    if not date_str:
        date_str = datetime.utcnow().strftime("%B %d, %Y")

    # Extract avg_scores
    avg_scores = eval_data.get("avg_scores", {})
    if isinstance(avg_scores, str):
        try:
            avg_scores = json.loads(avg_scores)
        except Exception:
            avg_scores = {}

    # Extract or infer values from ai_summary
    if ai_summary:
        grade = ai_summary.get("overall_grade") or grade_from_score(pass_rate)
        confidence = ai_summary.get("confidence_level") or "High"
        overall_verdict = ai_summary.get("overall_verdict") or ""
        strengths = ai_summary.get("strengths") or []
        weaknesses = ai_summary.get("weaknesses") or []
        redteam_analysis = ai_summary.get("redteam_analysis") or ""
        rec = ai_summary.get("recommendation") or {}
        suitable_for = rec.get("suitable_for") or []
        not_suitable_for = rec.get("not_suitable_for") or []
        improvement_tips = ai_summary.get("improvement_tips") or []
    else:
        grade = grade_from_score(pass_rate)
        confidence = "Medium (Auto-generated)"
        overall_verdict = ""
        strengths = []
        weaknesses = []
        redteam_analysis = ""
        suitable_for = []
        not_suitable_for = []
        improvement_tips = []

    # Inferences for verdict, strengths, weaknesses if missing
    if not overall_verdict:
        if pass_rate >= 80:
            overall_verdict = "Strong performance across evaluation benchmarks."
        elif pass_rate >= 60:
            overall_verdict = "Moderate performance with notable improvement areas."
        else:
            overall_verdict = "Below-average performance, significant gaps identified."

    # If no strengths/weaknesses, derive from avg_scores
    sorted_scores = sorted(avg_scores.items(), key=lambda item: item[1], reverse=True)
    if not strengths:
        if sorted_scores:
            strengths = [f"Shows strength in **{k}** category with a score of {v:.1f}/100" for k, v in sorted_scores[:2]]
        else:
            strengths = ["No specific strengths identified during evaluation."]
    if not weaknesses:
        if len(sorted_scores) > 1:
            weaknesses = [f"Shows potential weakness in **{k}** category with a score of {v:.1f}/100" for k, v in sorted_scores[-2:]]
        elif sorted_scores:
            weaknesses = [f"Identified limitations in **{sorted_scores[0][0]}** category"]
        else:
            weaknesses = ["Adversarial susceptibility and general robustness limits need further evaluation."]

    if not suitable_for:
        if pass_rate >= 80:
            suitable_for = ["General task handling and reasoning", "Professional communications"]
        else:
            suitable_for = ["Simple conversational tasks", "Low-stakes information retrieval"]
    if not not_suitable_for:
        if pass_rate < 80:
            not_suitable_for = ["Complex multi-step logical reasoning", "High-stakes production use cases"]
        else:
            not_suitable_for = ["Unsupervised safety-critical operations"]

    if not improvement_tips:
        improvement_tips = [
            "Fine-tune the model on domain-specific prompt datasets.",
            "Implement robust guardrails and system prompt formatting to reduce susceptibility.",
            "Run further system evaluations on a wider custom set of prompts."
        ]

    # Prepare dataset section in template
    dataset_table_row = ""
    if dataset_filename:
        dataset_table_row = f"| **Custom Dataset** | {dataset_filename} |\n"

    # Red-team safety section markdown block
    redteam_block = ""
    if include_redteam:
        if redteam_analysis:
            redteam_block = redteam_analysis
        else:
            redteam_block = "Red-team evaluation was conducted. \nResults available in the full evaluation report."
    else:
        redteam_block = "> ⚠️ Red-team evaluation was NOT conducted for this model.\n> It is recommended to run adversarial testing before \n> production deployment."

    # Category performance section
    category_table_rows = []
    category_ascii_bars = []
    for cat, score in avg_scores.items():
        cat_grade = grade_from_score(score)
        category_table_rows.append(f"| {cat.capitalize()} | {score:.1f} | {cat_grade} |")
        category_ascii_bars.append(f"{cat.capitalize():<11} [{ascii_bar(score)}] {score:.1f}/100")

    category_table_str = "\n".join(category_table_rows)
    category_ascii_str = "\n".join(category_ascii_bars)

    # Convert suitable/not suitable lists to markdown bullets
    suitable_str = "\n".join([f"- {item}" for item in suitable_for])
    not_suitable_str = "\n".join([f"- {item}" for item in not_suitable_for])
    tips_str = "\n".join([f"{i+1}. {tip}" for i, tip in enumerate(improvement_tips)])

    # Format strengths and weaknesses safely
    if isinstance(strengths, list):
        strengths_str = "\n".join([f"- {s}" for s in strengths])
    else:
        strengths_str = strengths

    if isinstance(weaknesses, list):
        weaknesses_str = "\n".join([f"- {w}" for w in weaknesses])
    else:
        weaknesses_str = weaknesses

    citation_model_key = model.lower().replace("-", "_")
    citation_year = datetime.utcnow().year
    citation_block = (
        f"@misc{{criticai_eval_{citation_model_key},\n"
        f"  author = {{CriticAI}},\n"
        f"  title = {{{model} Evaluation Report and Model Card}},\n"
        f"  year = {{{citation_year}}},\n"
        "  publisher = {CriticAI Github},\n"
        "  howpublished = {\\url{https://github.com/your-repo}}\n"
        "}"
    )

    # Compile the HuggingFace-style Model Card Markdown
    markdown_card = f"""# Model Card: {model}

> Generated by [CriticAI](https://github.com/your-repo) 
> on {date_str} | Grade: {grade} | Confidence: {confidence}

---

## 📊 Evaluation Summary

| Metric | Value |
|--------|-------|
| **Overall Grade** | {grade} |
| **Health Score** | {health_score}/100 |
| **Pass Rate** | {pass_rate:.1f}% |
| **Total Tests** | {total_tests} |
| **Tests Passed** | {passed_tests} |
| **Tests Failed** | {failed_tests} |
| **Category Tested** | {prompt_category} |
| **Red-Team Tested** | {'Yes' if include_redteam else 'No'} |
| **Provider** | {provider} |
| **Evaluated On** | {date_str} |
{dataset_table_row}
---

## 🧠 Overall Verdict

{overall_verdict}

---

## 📈 Performance by Category

| Category | Score | Grade |
|----------|-------|-------|
{category_table_str}

```text
{category_ascii_str}
```

---

## ✅ Strengths

{strengths_str}

---

## ⚠️ Weaknesses & Limitations

{weaknesses_str}

---

## 🛡️ Red-Team & Safety Analysis

{redteam_block}

---

## 🎯 Recommended Use Cases

### ✅ Suitable For
{suitable_str}

### ❌ Not Recommended For
{not_suitable_str}

---

## 💡 Improvement Recommendations

{tips_str}

---

## 🔬 Evaluation Methodology

- **Framework**: CriticAI Multi-Agent Evaluation Pipeline
- **Agents Used**: Test Generator, Red Team, Evaluator, Benchmark, Detector, Reporter
- **Scoring Method**: LLM-as-judge (automated evaluation)
- **Judge Model**: Groq llama-3.3-70b-versatile
- **Evaluation Date**: {date_str}
- **Total Test Cases**: {total_tests}
{f'- **Custom Dataset**: {dataset_filename}' if dataset_filename else ''}

---

## ⚖️ Ethical Considerations

- This evaluation was conducted using automated LLM-as-judge methodology. Results may not perfectly reflect human evaluation standards.
- Scores are relative to the test prompts used and may vary with different datasets.
- Red-team results represent common adversarial patterns and do not cover all possible attack vectors.
- This model card should be reviewed by domain experts before making critical deployment decisions.

---

## 📋 Citation

If you use this evaluation in research or documentation:

```bibtex
{citation_block}
```

---

*Generated by CriticAI — Multi-Agent LLM Evaluation & Red-Teaming System*
*Powered by LangGraph + FastAPI + Groq*
"""
    return markdown_card
