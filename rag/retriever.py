from rag.chroma_store import ChromaStore
from typing import Optional


class Retriever:
    def __init__(self, chroma_store: ChromaStore):
        self.store = chroma_store

    def retrieve_similar_failures(self, test_case: dict, model: str, n_results: int = 5) -> list[dict]:
        return self.store.get_similar_results(test_case, model, n_results=n_results)

    def retrieve_model_failure_patterns(self, model: str, failure_type: Optional[str] = None) -> list[dict]:
        return self.store.get_failures_by_model(model, failure_type)

    def check_regression(self, test_case: dict, model: str, current_scores: dict) -> Optional[str]:
        historical = self.retrieve_similar_failures(test_case, model, n_results=3)
        if not historical:
            return None
        for hist in historical:
            hist_scores = hist.get("scores", {})
            for dim in ["hallucination", "toxicity", "relevance", "coherence", "instruction_following"]:
                prev_val = hist_scores.get(dim, 50)
                curr_val = current_scores.get(dim, 50)
                if dim in ["hallucination", "toxicity"]:
                    if prev_val <= 20 and curr_val > 50:
                        return f"regression_in_{dim}"
                else:
                    if prev_val >= 80 and curr_val < 50:
                        return f"regression_in_{dim}"
        return None

    def get_model_health_trend(self, model: str, last_n: int = 10) -> dict:
        all_results = self.store.get_all_results_for_model(model)
        recent = all_results[-last_n:] if len(all_results) > last_n else all_results
        if not recent:
            return {"trend": "unknown", "avg_pass_rate": 0, "total_evaluations": 0}
        # Bug #6 fix: `passed` is a top-level field on each record, NOT inside `scores`
        pass_count = sum(1 for r in recent if r.get("passed", False))
        avg_pass_rate = (pass_count / len(recent)) * 100 if recent else 0
        trend = "stable"
        if len(recent) >= 3:
            first_half = recent[:len(recent)//2]
            second_half = recent[len(recent)//2:]
            first_rate = sum(1 for r in first_half if r.get("passed", False)) / len(first_half)
            second_rate = sum(1 for r in second_half if r.get("passed", False)) / len(second_half)
            if second_rate < first_rate - 0.1:
                trend = "declining"
            elif second_rate > first_rate + 0.1:
                trend = "improving"
        return {
            "trend": trend,
            "avg_pass_rate": avg_pass_rate,
            "total_evaluations": len(recent)
        }
