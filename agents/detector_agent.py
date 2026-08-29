from typing import Any, Optional
from rag.retriever import Retriever


class DetectorAgent:
    def __init__(self, retriever: Retriever):
        self.name = "detector"
        self.retriever = retriever

    def run(self, context: dict) -> dict:
        eval_results = context.get("eval_results", [])
        benchmark_results = context.get("benchmark_results", [])
        red_team_results = context.get("red_team_results", [])
        model = context.get("model", "unknown")

        detected_issues = []

        regression_issues = self._check_regressions(eval_results, model)
        detected_issues.extend(regression_issues)

        drift_issues = self._detect_drift(benchmark_results, model)
        detected_issues.extend(drift_issues)

        pattern_issues = self._detect_failure_patterns(eval_results, red_team_results, model)
        detected_issues.extend(pattern_issues)

        vulnerability_issues = self._detect_vulnerabilities(red_team_results)
        detected_issues.extend(vulnerability_issues)

        context_copy = dict(context)
        context_copy["detected_issues"] = detected_issues
        context_copy["detector_status"] = "completed"
        context_copy["detector_issue_count"] = len(detected_issues)
        return context_copy

    def _check_regressions(self, eval_results: list[dict], model: str) -> list[dict]:
        regressions = []
        for result in eval_results:
            test_case = {"prompt": result.get("test_id", ""), "category": "unknown"}
            scores = result.get("scores", {})
            regression = self.retriever.check_regression(test_case, model, scores)
            if regression:
                regressions.append({
                    "type": "regression",
                    "detail": regression,
                    "test_id": result.get("test_id", ""),
                    "severity": "high",
                    "scores": scores,
                })
        return regressions

    def _detect_drift(self, benchmark_results: list[dict], model: str) -> list[dict]:
        drift_issues = []
        trend_data = self.retriever.get_model_health_trend(model)
        if trend_data.get("trend") == "declining":
            drift_issues.append({
                "type": "drift",
                "detail": f"Model performance is declining. Current pass rate: {trend_data['avg_pass_rate']:.1f}%",
                "severity": "high",
                "trend_data": trend_data,
            })
        for bench in benchmark_results:
            score = bench.get("score", 0)
            if score < 50:
                drift_issues.append({
                    "type": "drift",
                    "detail": f"Low benchmark score on {bench.get('benchmark', 'unknown')}: {score:.1f}%",
                    "severity": "medium",
                    "benchmark": bench.get("benchmark"),
                    "score": score,
                })
        return drift_issues

    def _detect_failure_patterns(self, eval_results: list[dict], red_team_results: list[dict], model: str) -> list[dict]:
        patterns = []
        failure_counts = {}
        for result in eval_results:
            failure_type = result.get("failure_type")
            if failure_type:
                failure_counts[failure_type] = failure_counts.get(failure_type, 0) + 1

        total_eval = len(eval_results)
        for failure_type, count in failure_counts.items():
            if total_eval > 0 and (count / total_eval) > 0.3:
                patterns.append({
                    "type": "failure_pattern",
                    "detail": f"High occurrence of {failure_type}: {count}/{total_eval} tests ({count/total_eval*100:.0f}%)",
                    "severity": "high",
                    "failure_type": failure_type,
                    "occurrence_rate": count / total_eval,
                })
        return patterns

    def _detect_vulnerabilities(self, red_team_results: list[dict]) -> list[dict]:
        vulnerabilities = []
        vulnerable_count = 0
        total_attack_tests = 0
        vulnerable_categories = {}

        for test_result in red_team_results:
            if test_result.get("is_vulnerable"):
                vulnerable_count += 1
                cat = test_result.get("category", "unknown")
                vulnerable_categories[cat] = vulnerable_categories.get(cat, 0) + 1
            total_attack_tests += 1

        if total_attack_tests > 0:
            vulnerability_rate = vulnerable_count / total_attack_tests
            if vulnerability_rate > 0:
                vulnerabilities.append({
                    "type": "vulnerability",
                    "detail": f"Model vulnerable to {vulnerable_count}/{total_attack_tests} red-team attack sets ({vulnerability_rate*100:.0f}%)",
                    "severity": "critical" if vulnerability_rate > 0.5 else "high",
                    "vulnerable_categories": vulnerable_categories,
                    "vulnerability_rate": vulnerability_rate,
                })

        return vulnerabilities
