import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from agents.test_generator import TestGeneratorAgent
from agents.red_team_agent import RedTeamAgent
from agents.evaluator_agent import EvaluatorAgent
from agents.benchmark_agent import BenchmarkAgent
from utils.llm_client import UnifiedLLMClient


class TestTestGeneratorAgent:
    def setup_method(self):
        self.agent = TestGeneratorAgent()

    def test_run_returns_test_cases(self):
        context = {"prompt_category": "all", "num_tests": 10, "include_redteam": True}
        result = self.agent.run(context)
        assert "test_cases" in result
        assert len(result["test_cases"]) > 0
        assert result["test_generator_status"] == "completed"

    def test_run_with_category_filter(self):
        context = {"prompt_category": "code", "num_tests": 5, "include_redteam": True}
        result = self.agent.run(context)
        for tc in result["test_cases"]:
            assert tc["category"] == "code"

    def test_run_without_redteam(self):
        context = {"prompt_category": "all", "num_tests": 20, "include_redteam": False}
        result = self.agent.run(context)
        categories = [tc["category"] for tc in result["test_cases"]]
        assert "jailbreak" not in categories
        assert "injection" not in categories

    def test_each_test_case_has_required_fields(self):
        context = {"prompt_category": "all", "num_tests": 5, "include_redteam": True}
        result = self.agent.run(context)
        for tc in result["test_cases"]:
            assert "id" in tc
            assert "prompt" in tc
            assert "expected_behavior" in tc
            assert "category" in tc
            assert "difficulty" in tc

    def test_difficulty_assignment(self):
        context = {"prompt_category": "safety", "num_tests": 10, "include_redteam": True}
        result = self.agent.run(context)
        for tc in result["test_cases"]:
            assert tc["difficulty"] in ("easy", "medium", "hard", "expert")


class TestScoringFunctions:
    def test_compute_toxicity_keywords(self):
        from utils.scoring import compute_toxicity_keywords
        assert compute_toxicity_keywords("I hate you") > 0
        assert compute_toxicity_keywords("The weather is nice") == 0

    def test_compute_relevance(self):
        from utils.scoring import compute_relevance
        response = "Paris is the capital of France"
        prompt = "What is the capital of France?"
        assert compute_relevance(response, prompt) > 50

    def test_compute_coherence(self):
        from utils.scoring import compute_coherence
        text = "First, we need to gather data. Then, we analyze it. Finally, we draw conclusions."
        assert compute_coherence(text) > 50


@pytest.fixture
def llm_client():
    return UnifiedLLMClient(model_name="gpt-4o-mini")


class TestBenchmarkAgent:
    def test_benchmark_agent_initialization(self, llm_client):
        agent = BenchmarkAgent(llm_client)
        assert agent.name == "benchmark"


class TestScenarioIntegration:
    def test_full_pipeline_simulation(self):
        from agents.test_generator import TestGeneratorAgent
        from agents.evaluator_agent import EvaluatorAgent
        from utils.llm_client import UnifiedLLMClient

        generator = TestGeneratorAgent()
        context = generator.run({"prompt_category": "factual", "num_tests": 3, "include_redteam": False})

        assert len(context["test_cases"]) == 3
        for tc in context["test_cases"]:
            assert tc["category"] == "factual"
