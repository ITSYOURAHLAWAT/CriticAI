import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from unittest.mock import patch, MagicMock
from orchestrator.graph import CriticAIOrchestrator


# ---------------------------------------------------------------------------
# Auto-use fixture: run ALL orchestrator tests in simulation mode so they
# don't require a real API key. This is the correct way to unit-test the
# pipeline without making external network calls.
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def simulation_mode(monkeypatch):
    """Force CRITICAI_SIMULATION=true for every test in this module."""
    monkeypatch.setenv("CRITICAI_SIMULATION", "true")


class TestCriticAIOrchestrator:
    def test_initialization(self):
        orchestrator = CriticAIOrchestrator(model_name="gpt-4o-mini")
        assert orchestrator.model_name == "gpt-4o-mini"
        assert orchestrator.test_generator is not None
        assert orchestrator.red_team_agent is not None
        assert orchestrator.evaluator_agent is not None
        assert orchestrator.benchmark_agent is not None
        assert orchestrator.detector_agent is not None
        assert orchestrator.reporter_agent is not None

    def test_graph_structure(self):
        orchestrator = CriticAIOrchestrator(model_name="gpt-4o-mini")
        assert orchestrator.graph is not None

    def test_orchestrator_routes(self):
        orchestrator = CriticAIOrchestrator(model_name="gpt-4o-mini")
        cond = orchestrator._route_from_test_generator
        from utils.models import AgentContext

        ctx_no_redteam = AgentContext(
            include_redteam=False,
            test_cases=[{"category": "factual", "prompt": "test"}]
        )
        assert cond(ctx_no_redteam) == "evaluator"

        ctx_with_redteam = AgentContext(
            include_redteam=True,
            test_cases=[{"category": "jailbreak", "prompt": "test"}]
        )
        assert cond(ctx_with_redteam) == "red_team"

    def test_orchestrator_run(self):
        orchestrator = CriticAIOrchestrator(model_name="gpt-4o-mini")
        result = orchestrator.run(prompt_category="factual", num_tests=2, include_redteam=False)
        assert "model" in result
        assert "report" in result

    def test_orchestrator_with_redteam(self):
        orchestrator = CriticAIOrchestrator(model_name="gpt-4o-mini")
        result = orchestrator.run(prompt_category="safety", num_tests=2, include_redteam=True)
        # Red team results may or may not be present depending on routing
        assert isinstance(result, dict)


@pytest.mark.slow
class TestEndToEnd:
    def test_full_evaluation_pipeline(self):
        orchestrator = CriticAIOrchestrator(model_name="gpt-4o-mini")
        result = orchestrator.run(prompt_category="factual", num_tests=2, include_redteam=False)
        report = result.get("report", {})
        assert report.get("total_tests", 0) > 0
        assert "model" in result
        assert report.get("health_score") is not None
