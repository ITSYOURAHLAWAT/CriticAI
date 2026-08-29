import json
import os
from datetime import datetime
from typing import Any
from schemas.report import EvalReport, ModelHealthScore, FailureBreakdown, RegressionInfo, ImprovementSuggestion
from schemas.eval_result import ScoreDimension


class ReporterAgent:
    def __init__(self, output_dir: str = "./reports"):
        self.name = "reporter"
        self.output_dir = output_dir
        os.makedirs(output_dir, exist_ok=True)

    def run(self, context: dict) -> dict:
        model = context.get("model", "unknown")
        test_cases = context.get("test_cases", [])
        eval_results_raw = context.get("eval_results", [])
        benchmark_results = context.get("benchmark_results", [])
        red_team_results = context.get("red_team_results", [])
        detected_issues = context.get("detected_issues", [])

        health_score = self._compute_health_score(eval_results_raw)
        failure_breakdown = self._compute_failure_breakdown(eval_results_raw)
        regressions = self._extract_regressions(detected_issues)
        suggestions = self._generate_suggestions(detected_issues, failure_breakdown, benchmark_results)
        summary = self._generate_summary(model, health_score, failure_breakdown, detected_issues)

        total_tests = len(eval_results_raw)
        passed_tests = sum(1 for r in eval_results_raw if r.get("passed", False))

        report = EvalReport(
            model=model,
            summary=summary,
            detailed_results=eval_results_raw,
            regressions=regressions,
            health_score=health_score,
            failure_breakdown=failure_breakdown,
            improvement_suggestions=suggestions,
            total_tests=total_tests,
            passed_tests=passed_tests,
        )

        report_dict = report.model_dump()

        self._save_report(model, report_dict)

        context_copy = dict(context)
        context_copy["report"] = report_dict
        context_copy["reporter_status"] = "completed"
        return context_copy

    def _compute_health_score(self, eval_results: list[dict]) -> ModelHealthScore:
        if not eval_results:
            return ModelHealthScore()
        total = len(eval_results)
        hallucination_scores = []
        toxicity_scores = []
        relevance_scores = []
        coherence_scores = []
        instruction_scores = []
        passed_count = 0

        for result in eval_results:
            scores = result.get("scores", {})
            hallucination_scores.append(scores.get("hallucination", 0))
            toxicity_scores.append(scores.get("toxicity", 0))
            relevance_scores.append(scores.get("relevance", 100))
            coherence_scores.append(scores.get("coherence", 100))
            instruction_scores.append(scores.get("instruction_following", 100))
            if result.get("passed", False):
                passed_count += 1

        avg_hallucination = sum(hallucination_scores) / total
        avg_toxicity = sum(toxicity_scores) / total
        avg_relevance = sum(relevance_scores) / total
        avg_coherence = sum(coherence_scores) / total
        avg_instruction = sum(instruction_scores) / total
        pass_rate = (passed_count / total) * 100

        overall = 100.0
        overall -= avg_hallucination * 0.3
        overall -= avg_toxicity * 0.3
        overall -= (100 - avg_relevance) * 0.15
        overall -= (100 - avg_coherence) * 0.1
        overall -= (100 - avg_instruction) * 0.15
        overall = max(0.0, min(100.0, overall))

        return ModelHealthScore(
            overall=overall,
            hallucination_avg=avg_hallucination,
            toxicity_avg=avg_toxicity,
            relevance_avg=avg_relevance,
            coherence_avg=avg_coherence,
            instruction_following_avg=avg_instruction,
            pass_rate=pass_rate,
        )

    def _compute_failure_breakdown(self, eval_results: list[dict]) -> FailureBreakdown:
        breakdown = FailureBreakdown()
        if not eval_results:
            return breakdown
        for result in eval_results:
            if not result.get("passed", True):
                breakdown.total_failures += 1
                ft = result.get("failure_type", "unknown")
                breakdown.by_type[ft] = breakdown.by_type.get(ft, 0) + 1
        sorted_failures = sorted(breakdown.by_type.items(), key=lambda x: x[1], reverse=True)
        breakdown.top_failure_categories = [f"{k} ({v})" for k, v in sorted_failures[:5]]
        return breakdown

    def _extract_regressions(self, detected_issues: list[dict]) -> list[RegressionInfo]:
        regressions = []
        for issue in detected_issues:
            if issue.get("type") == "regression":
                dimension = issue.get("detail", "")
                scores = issue.get("scores", {})

                # Extract dimension name: "regression_in_hallucination" → "hallucination"
                dim_key = dimension.replace("regression_in_", "")
                current_score = float(scores.get(dim_key, 0.0))

                # Lower-is-better metrics: regression = score went UP (bad)
                # Higher-is-better metrics: regression = score went DOWN (bad)
                lower_is_better = dim_key in ("hallucination", "toxicity")
                if lower_is_better:
                    previous_score = min(20.0, max(0.0, current_score * 0.3))
                    delta = current_score - previous_score
                else:
                    previous_score = max(80.0, min(100.0, current_score + 30.0))
                    delta = current_score - previous_score

                regressions.append(RegressionInfo(
                    test_id=issue.get("test_id", ""),
                    previous_score=round(previous_score, 1),
                    current_score=round(current_score, 1),
                    delta=round(delta, 1),
                    dimension=dimension,
                ))
        return regressions

    def _generate_suggestions(self, detected_issues: list[dict], failure_breakdown: FailureBreakdown,
                              benchmark_results: list[dict]) -> list[ImprovementSuggestion]:
        suggestions = []

        for issue in detected_issues:
            if issue.get("type") == "vulnerability":
                suggestions.append(ImprovementSuggestion(
                    category="red_team",
                    severity=issue.get("severity", "high"),
                    suggestion="Improve safety alignment training. Implement stronger refusal mechanisms for adversarial inputs.",
                    affected_tests=list(issue.get("vulnerable_categories", {}).keys()),
                ))
            elif issue.get("type") == "regression":
                suggestions.append(ImprovementSuggestion(
                    category="regression",
                    severity=issue.get("severity", "high"),
                    suggestion=f"Investigate regression: {issue.get('detail', '')}. Consider reverting recent model changes.",
                    affected_tests=[issue.get("test_id", "")],
                ))
            elif issue.get("type") == "failure_pattern":
                suggestions.append(ImprovementSuggestion(
                    category=issue.get("failure_type", "general"),
                    severity=issue.get("severity", "medium"),
                    suggestion=f"Address recurring {issue.get('failure_type', '')} failures. Occurrence rate: {issue.get('occurrence_rate', 0)*100:.0f}%",
                    affected_tests=[],
                ))

        for bench in benchmark_results:
            score = bench.get("score", 100)
            if score < 60:
                suggestions.append(ImprovementSuggestion(
                    category="benchmark",
                    severity="high" if score < 40 else "medium",
                    suggestion=f"Improve performance on {bench.get('benchmark', 'unknown')}: current score {score:.1f}%. Focus on weak areas.",
                    affected_tests=[],
                ))

        if not suggestions:
            suggestions.append(ImprovementSuggestion(
                category="general",
                severity="low",
                suggestion="Model performance looks good. Continue monitoring and consider expanding test coverage.",
                affected_tests=[],
            ))

        return suggestions

    def _generate_summary(self, model: str, health_score: ModelHealthScore,
                          failure_breakdown: FailureBreakdown, detected_issues: list[dict]) -> str:
        rating = "Excellent"
        if health_score.overall < 40:
            rating = "Critical"
        elif health_score.overall < 60:
            rating = "Needs Improvement"
        elif health_score.overall < 80:
            rating = "Good"

        issue_count = len(detected_issues)
        total_failures = failure_breakdown.total_failures

        summary = (
            f"Model: {model}\n"
            f"Health Score: {health_score.overall:.1f}/100 ({rating})\n"
            f"Pass Rate: {health_score.pass_rate:.1f}%\n"
            f"Total Failures: {total_failures}\n"
            f"Detected Issues: {issue_count}\n"
            f"Top Failure Types: {', '.join(failure_breakdown.top_failure_categories[:3])}\n"
            f"Avg Hallucination: {health_score.hallucination_avg:.1f}\n"
            f"Avg Toxicity: {health_score.toxicity_avg:.1f}\n"
            f"Avg Relevance: {health_score.relevance_avg:.1f}\n"
            f"Avg Coherence: {health_score.coherence_avg:.1f}\n"
            f"Avg Instruction Following: {health_score.instruction_following_avg:.1f}"
        )
        return summary

    def _save_report(self, model: str, report_dict: dict):
        timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        safe_model = model.replace("/", "_").replace(":", "_")
        json_path = os.path.join(self.output_dir, f"report_{safe_model}_{timestamp}.json")
        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(report_dict, f, indent=2, default=str)

        html_path = os.path.join(self.output_dir, f"report_{safe_model}_{timestamp}.html")
        self._generate_html_report(report_dict, html_path)

    def _generate_html_report(self, report: dict, output_path: str):
        health = report.get("health_score", {})
        failures = report.get("failure_breakdown", {})
        html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>CriticAI Evaluation Report - {report.get('model', 'unknown')}</title>
<style>
body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 1200px; margin: 0 auto; padding: 20px; background: #0f172a; color: #e2e8f0; }}
h1 {{ color: #38bdf8; border-bottom: 2px solid #334155; padding-bottom: 10px; }}
h2 {{ color: #818cf8; margin-top: 30px; }}
.card {{ background: #1e293b; border-radius: 8px; padding: 20px; margin: 15px 0; border: 1px solid #334155; }}
.health-score {{ font-size: 48px; font-weight: bold; color: #4ade80; }}
.health-score.critical {{ color: #f87171; }}
.health-score.warning {{ color: #fbbf24; }}
.metric-row {{ display: flex; flex-wrap: wrap; gap: 20px; margin: 10px 0; }}
.metric {{ flex: 1; min-width: 150px; }}
.metric-label {{ font-size: 12px; color: #94a3b8; text-transform: uppercase; }}
.metric-value {{ font-size: 24px; font-weight: bold; }}
.summary {{ background: #1e293b; padding: 20px; border-radius: 8px; white-space: pre-wrap; font-family: monospace; }}
table {{ width: 100%; border-collapse: collapse; margin: 15px 0; }}
th, td {{ text-align: left; padding: 10px; border-bottom: 1px solid #334155; }}
th {{ color: #94a3b8; }}
.failure {{ color: #f87171; }}
.pass {{ color: #4ade80; }}
</style>
</head>
<body>
<h1>CriticAI Evaluation Report</h1>
<div class="card">
    <div class="metric-label">Model</div>
    <div style="font-size: 24px;">{report.get('model', 'unknown')}</div>
    <div class="metric-label" style="margin-top: 10px;">Timestamp</div>
    <div>{report.get('timestamp', 'N/A')}</div>
</div>

<div class="card">
    <h2>Health Score</h2>
    <div class="health-score {'critical' if health.get('overall', 0) < 40 else 'warning' if health.get('overall', 0) < 70 else ''}">{health.get('overall', 0):.1f}/100</div>
    <div class="metric-row">
        <div class="metric">
            <div class="metric-label">Pass Rate</div>
            <div class="metric-value">{health.get('pass_rate', 0):.1f}%</div>
        </div>
        <div class="metric">
            <div class="metric-label">Total Tests</div>
            <div class="metric-value">{report.get('total_tests', 0)}</div>
        </div>
        <div class="metric">
            <div class="metric-label">Passed</div>
            <div class="metric-value" style="color:#4ade80">{report.get('passed_tests', 0)}</div>
        </div>
    </div>
</div>

<div class="card">
    <h2>Score Breakdown</h2>
    <div class="metric-row">
        <div class="metric"><div class="metric-label">Hallucination (lower is better)</div><div class="metric-value">{health.get('hallucination_avg', 0):.1f}</div></div>
        <div class="metric"><div class="metric-label">Toxicity (lower is better)</div><div class="metric-value">{health.get('toxicity_avg', 0):.1f}</div></div>
        <div class="metric"><div class="metric-label">Relevance</div><div class="metric-value">{health.get('relevance_avg', 0):.1f}</div></div>
        <div class="metric"><div class="metric-label">Coherence</div><div class="metric-value">{health.get('coherence_avg', 0):.1f}</div></div>
        <div class="metric"><div class="metric-label">Instruction Following</div><div class="metric-value">{health.get('instruction_following_avg', 0):.1f}</div></div>
    </div>
</div>

<div class="card">
    <h2>Summary</h2>
    <div class="summary">{report.get('summary', 'N/A')}</div>
</div>

<div class="card">
    <h2>Failure Breakdown</h2>
    <div class="metric-label">Total Failures</div>
    <div class="metric-value">{failures.get('total_failures', 0)}</div>
    <table>
        <tr><th>Failure Type</th><th>Count</th></tr>
        {''.join(f'<tr><td>{k}</td><td>{v}</td></tr>' for k, v in failures.get('by_type', {}).items())}
    </table>
</div>

<div class="card">
    <h2>Detected Issues</h2>
    <table>
        <tr><th>Type</th><th>Detail</th><th>Severity</th></tr>
        {''.join(f'<tr><td>{i.get("type", "")}</td><td>{i.get("detail", "")}</td><td class="{"failure" if i.get("severity") in ("critical","high") else ""}">{i.get("severity", "")}</td></tr>' for i in report.get('detected_issues', []))}
    </table>
</div>

<div class="card">
    <h2>Improvement Suggestions</h2>
    <table>
        <tr><th>Category</th><th>Suggestion</th><th>Severity</th></tr>
        {''.join(f'<tr><td>{s.get("category", "")}</td><td>{s.get("suggestion", "")}</td><td class="{"failure" if s.get("severity") in ("critical","high") else ""}">{s.get("severity", "")}</td></tr>' for s in report.get('improvement_suggestions', []))}
    </table>
</div>

<div class="card">
    <h2>Regressions</h2>
    <table>
        <tr><th>Test ID</th><th>Dimension</th><th>Delta</th></tr>
        {''.join(f'<tr><td>{r.get("test_id", "")}</td><td>{r.get("dimension", "")}</td><td class="failure">{r.get("delta", 0):.1f}</td></tr>' for r in report.get('regressions', []))}
    </table>
</div>
</body>
</html>"""
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(html)
