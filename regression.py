import json
import statistics
from datetime import datetime

SIGNIFICANT_DROP = 10.0    # % drop that triggers alert
SIGNIFICANT_GAIN = 10.0    # % gain worth highlighting
MIN_EVALS_FOR_TREND = 2    # min evals needed for trend
STABLE_VARIANCE = 5.0      # within 5% = stable


def calculate_trend(scores: list) -> dict:
    """
    Analyzes a chronological list of pass_rate scores and determines trend direction,
    health status, statistics, and insight messaging.
    """
    if not scores or len(scores) < MIN_EVALS_FOR_TREND:
        single_score = scores[-1] if scores else 0.0
        return {
            "trend": "insufficient_data",
            "direction": "unknown",
            "emoji": "ℹ️",
            "health": "insufficient_data",
            "change_from_previous": 0.0,
            "change_from_first": 0.0,
            "avg_score": round(float(single_score), 1),
            "std_dev": 0.0,
            "min_score": round(float(single_score), 1),
            "max_score": round(float(single_score), 1),
            "best_ever": round(float(single_score), 1),
            "worst_ever": round(float(single_score), 1),
            "total_evaluations": len(scores),
            "insight": "Need at least 2 evaluations for trend analysis",
            "alert": False,
            "alert_message": None
        }

    clean_scores = [float(s) for s in scores]
    latest = clean_scores[-1]
    previous = clean_scores[-2]
    first = clean_scores[0]

    change_from_previous = round(latest - previous, 1)
    change_from_first = round(latest - first, 1)

    # Determine trend direction and emoji
    if change_from_previous > SIGNIFICANT_GAIN:
        direction = "improving"
        emoji = "📈"
    elif change_from_previous < -SIGNIFICANT_DROP:
        direction = "declining"
        emoji = "📉"
    elif abs(change_from_previous) <= STABLE_VARIANCE:
        direction = "stable"
        emoji = "➡️"
    else:
        direction = "fluctuating"
        emoji = "〰️"

    # Calculate statistics
    avg_val = round(statistics.mean(clean_scores), 1)
    std_dev_val = round(statistics.stdev(clean_scores), 1) if len(clean_scores) >= 2 else 0.0
    min_val = round(min(clean_scores), 1)
    max_val = round(max(clean_scores), 1)

    # Determine health
    is_alert = False
    alert_msg = None

    if direction == "declining" and change_from_previous <= -SIGNIFICANT_DROP:
        health = "critical"
        is_alert = True
        alert_msg = f"Score dropped {abs(change_from_previous):.1f}% in latest run"
    elif direction == "improving":
        health = "good"
    elif direction == "stable" and avg_val >= 70.0:
        health = "good"
    elif direction == "stable" and avg_val < 70.0:
        health = "warning"
    elif direction == "fluctuating":
        health = "warning"
    else:
        health = "neutral"

    # Generate insight message
    if direction == "improving":
        insight = f"📈 Improved by {change_from_previous:.1f}% since last evaluation"
    elif direction == "declining":
        insight = f"📉 Dropped {abs(change_from_previous):.1f}% — investigate prompt category changes"
    elif direction == "stable":
        insight = f"➡️ Performance stable at ~{avg_val:.0f}%"
    else:
        insight = f"〰️ Inconsistent results — consider adding more test cases"

    return {
        "trend": direction,
        "direction": direction,
        "emoji": emoji,
        "health": health,
        "change_from_previous": change_from_previous,
        "change_from_first": change_from_first,
        "avg_score": avg_val,
        "std_dev": std_dev_val,
        "min_score": min_val,
        "max_score": max_val,
        "best_ever": max_val,
        "worst_ever": min_val,
        "total_evaluations": len(clean_scores),
        "insight": insight,
        "alert": is_alert,
        "alert_message": alert_msg
    }


def detect_regression(model: str, eval_history: list) -> dict:
    """
    Processes a list of evaluation dicts for a single model and constructs full regression data.
    eval_history = [{id, pass_rate, health_score, created_at, prompt_category, ...}, ...] sorted oldest first
    """
    if not eval_history:
        return {
            "model": model,
            "provider": "unknown",
            "trend_analysis": calculate_trend([]),
            "time_series": [],
            "best_eval": None,
            "worst_eval": None,
            "eval_count": 0,
            "first_eval_date": None,
            "latest_eval_date": None,
            "date_range_days": 0
        }

    # Sort oldest first to build correct timeline
    sorted_evals = sorted(eval_history, key=lambda x: str(x.get("created_at", "")))

    scores = [float(e.get("pass_rate", 0.0)) for e in sorted_evals]
    trend_analysis = calculate_trend(scores)

    provider = sorted_evals[-1].get("provider", "groq")

    time_series = []
    prev_rate = None

    best_eval = max(sorted_evals, key=lambda x: float(x.get("pass_rate", 0.0)))
    worst_eval = min(sorted_evals, key=lambda x: float(x.get("pass_rate", 0.0)))

    for idx, e in enumerate(sorted_evals, start=1):
        raw_date = str(e.get("created_at", ""))
        try:
            dt = datetime.fromisoformat(raw_date.replace("Z", "+00:00"))
            date_str = dt.strftime("%b %d")
            time_str = dt.strftime("%b %d, %H:%M")
        except Exception:
            date_str = f"Eval #{idx}"
            time_str = raw_date

        curr_rate = float(e.get("pass_rate", 0.0))
        if prev_rate is None:
            change = 0.0
            change_type = "baseline"
        else:
            change = round(curr_rate - prev_rate, 1)
            change_type = "increase" if change > 0 else "decrease" if change < 0 else "same"

        prev_rate = curr_rate

        # Extract health_score float
        hs = e.get("health_score")
        hs_float = curr_rate
        if isinstance(hs, dict):
            hs_float = float(hs.get("overall", curr_rate))
        elif isinstance(hs, (int, float)):
            hs_float = float(hs)

        time_series.append({
            "eval_number": idx,
            "eval_id": str(e.get("id", "")),
            "date": date_str,
            "full_date": time_str,
            "pass_rate": curr_rate,
            "health_score": round(hs_float, 1),
            "change": change,
            "change_type": change_type,
            "prompt_category": e.get("prompt_category", "general"),
            "num_tests": e.get("num_tests", 0),
            "is_best": (str(e.get("id")) == str(best_eval.get("id"))),
            "is_worst": (str(e.get("id")) == str(worst_eval.get("id")) and len(sorted_evals) > 1),
            "is_latest": (idx == len(sorted_evals))
        })

    first_date_str = str(sorted_evals[0].get("created_at", ""))
    latest_date_str = str(sorted_evals[-1].get("created_at", ""))

    days_diff = 0
    try:
        d1 = datetime.fromisoformat(first_date_str.replace("Z", "+00:00"))
        d2 = datetime.fromisoformat(latest_date_str.replace("Z", "+00:00"))
        days_diff = max(0, (d2 - d1).days)
    except Exception:
        pass

    return {
        "model": model,
        "provider": provider,
        "trend_analysis": trend_analysis,
        "time_series": time_series,
        "best_eval": {
            "id": best_eval.get("id"),
            "pass_rate": float(best_eval.get("pass_rate", 0.0)),
            "date": str(best_eval.get("created_at", ""))
        },
        "worst_eval": {
            "id": worst_eval.get("id"),
            "pass_rate": float(worst_eval.get("pass_rate", 0.0)),
            "date": str(worst_eval.get("created_at", ""))
        },
        "eval_count": len(sorted_evals),
        "first_eval_date": first_date_str,
        "latest_eval_date": latest_date_str,
        "date_range_days": days_diff
    }


def get_all_models_regression(all_evals: list) -> list:
    """
    Groups evaluations by model name, runs detect_regression() on models with >= 1 evaluation,
    and returns a sorted list prioritizing critical alerts -> warning -> good -> neutral.
    """
    grouped = {}
    for e in all_evals:
        model = e.get("model")
        if not model:
            continue
        if model not in grouped:
            grouped[model] = []
        grouped[model].append(e)

    results = []
    for model, history in grouped.items():
        reg_data = detect_regression(model, history)
        results.append(reg_data)

    # Sort order priority: critical (0), warning (1), good (2), neutral / insufficient (3)
    def sort_key(item):
        h = item["trend_analysis"]["health"]
        rank = {"critical": 0, "warning": 1, "good": 2}.get(h, 3)
        return (rank, -item["eval_count"], item["model"])

    results.sort(key=sort_key)
    return results
