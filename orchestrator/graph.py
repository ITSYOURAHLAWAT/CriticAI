import os
from typing import Any, Callable, Literal, Optional
from langgraph.graph import StateGraph, END
from utils.llm_client import UnifiedLLMClient
from utils.models import AgentContext
from agents.test_generator import TestGeneratorAgent
from agents.red_team_agent import RedTeamAgent
from agents.evaluator_agent import EvaluatorAgent
from agents.benchmark_agent import BenchmarkAgent
from agents.detector_agent import DetectorAgent
from agents.reporter_agent import ReporterAgent
from rag.chroma_store import ChromaStore
from rag.retriever import Retriever


class CriticAIOrchestrator:
    def __init__(
        self,
        model_name: str = "gpt-4o",
        use_chroma_http: bool = False,
        progress_callback: Optional[Callable[[str, str, dict], None]] = None,
    ):
        self.model_name = model_name
        self.llm_client = UnifiedLLMClient(model_name=model_name)
        self.chroma_store = ChromaStore(use_http=use_chroma_http)
        self.retriever = Retriever(self.chroma_store)
        # Called as: progress_callback(stage, message, extra_data)
        self._emit = progress_callback or (lambda stage, msg, data=None: None)

        self.test_generator = TestGeneratorAgent()
        self.red_team_agent = RedTeamAgent(self.llm_client)
        self.evaluator_agent = EvaluatorAgent(self.llm_client)
        self.benchmark_agent = BenchmarkAgent(self.llm_client)
        self.detector_agent = DetectorAgent(self.retriever)
        self.reporter_agent = ReporterAgent()

        self.graph = self._build_graph()

    def _build_graph(self) -> StateGraph:
        workflow = StateGraph(AgentContext)

        workflow.add_node("test_generator", self._run_test_generator)
        workflow.add_node("red_team", self._run_red_team)
        workflow.add_node("evaluator", self._run_evaluator)
        workflow.add_node("benchmark", self._run_benchmark)
        workflow.add_node("detector", self._run_detector)
        workflow.add_node("reporter", self._run_reporter)

        workflow.set_entry_point("test_generator")

        workflow.add_conditional_edges(
            "test_generator",
            self._route_from_test_generator,
            {"red_team": "red_team", "evaluator": "evaluator"}
        )
        workflow.add_edge("red_team", "evaluator")
        workflow.add_edge("evaluator", "benchmark")
        workflow.add_edge("benchmark", "detector")
        workflow.add_edge("detector", "reporter")
        workflow.add_edge("reporter", END)

        return workflow.compile()

    def _route_from_test_generator(self, context: AgentContext) -> Literal["red_team", "evaluator"]:
        include_redteam = getattr(context, 'include_redteam', True)
        test_cases = getattr(context, 'test_cases', [])
        if include_redteam and any(
            tc.get("category") in ("jailbreak", "injection", "safety")
            for tc in test_cases
        ):
            return "red_team"
        return "evaluator"

    def _get_context_dict(self, context: AgentContext) -> dict:
        if hasattr(context, 'model_dump'):
            return context.model_dump()
        return dict(context)

    def _set_context_attr(self, context: AgentContext, key: str, value):
        if hasattr(context, key):
            setattr(context, key, value)

    def _run_test_generator(self, context: AgentContext) -> AgentContext:
        num = getattr(context, 'num_tests', 10)
        self._emit("test_generator", f"Generating {num} test cases...", {"stage_index": 0})
        result = self.test_generator.run(self._get_context_dict(context))
        test_cases = result.get("test_cases", [])
        self._set_context_attr(context, "test_cases", test_cases)
        self._emit("test_generator_done", f"Generated {len(test_cases)} test cases", {"count": len(test_cases), "stage_index": 0})
        return context

    def _run_red_team(self, context: AgentContext) -> AgentContext:
        self._emit("red_team", "Injecting adversarial probes...", {"stage_index": 1})
        result = self.red_team_agent.run(self._get_context_dict(context))
        rt_results = result.get("red_team_results", [])
        self._set_context_attr(context, "red_team_results", rt_results)
        self._emit("red_team_done", f"Red-Team complete: {len(rt_results)} attack(s) executed", {"count": len(rt_results), "stage_index": 1})
        return context

    def _run_evaluator(self, context: AgentContext) -> AgentContext:
        test_cases = getattr(context, 'test_cases', [])
        self._emit("evaluator", f"Scoring {len(test_cases)} responses...", {"stage_index": 2})
        result = self.evaluator_agent.run(self._get_context_dict(context))
        eval_results = result.get("eval_results", [])
        self._set_context_attr(context, "eval_results", eval_results)
        model = getattr(context, 'model', 'unknown')

        raw_test_cases = getattr(context, 'test_cases', [])
        test_cases_by_id = {}
        for tc in raw_test_cases:
            if isinstance(tc, dict):
                tc_id = tc.get("id", tc.get("test_id", ""))
                test_cases_by_id[tc_id] = tc
            elif hasattr(tc, "id"):
                test_cases_by_id[tc.id] = tc if isinstance(tc, dict) else tc.__dict__

        passed = sum(1 for r in eval_results if r.get("passed"))
        for eval_result in eval_results:
            scores = eval_result.get("scores", {})
            eval_id = eval_result.get("test_id", "")
            test_case = test_cases_by_id.get(eval_id, {
                "category": eval_result.get("category", "unknown"),
                "prompt": eval_result.get("prompt", eval_id),
            })
            self.chroma_store.store_eval_result(
                eval_id=eval_id,
                model=model,
                test_case=test_case,
                scores=scores,
                passed=eval_result.get("passed", False),
                failure_type=eval_result.get("failure_type"),
            )

        self._emit("evaluator_done", f"Evaluation done: {passed}/{len(eval_results)} passed", {"passed": passed, "total": len(eval_results), "stage_index": 2})
        return context

    def _run_benchmark(self, context: AgentContext) -> AgentContext:
        self._emit("benchmark", "Computing performance benchmark scores...", {"stage_index": 3})
        result = self.benchmark_agent.run(self._get_context_dict(context))
        self._set_context_attr(context, "benchmark_results", result.get("benchmark_results", []))
        self._emit("benchmark_done", "Benchmark scoring complete", {"stage_index": 3})
        return context

    def _run_detector(self, context: AgentContext) -> AgentContext:
        self._emit("detector", "Scanning vector store for failure patterns...", {"stage_index": 3})
        result = self.detector_agent.run(self._get_context_dict(context))
        issues = result.get("detected_issues", [])
        self._set_context_attr(context, "detected_issues", issues)
        self._emit("detector_done", f"Detector found {len(issues)} issue pattern(s)", {"count": len(issues), "stage_index": 3})
        return context

    def _run_reporter(self, context: AgentContext) -> AgentContext:
        self._emit("reporter", "Generating HTML & JSON report...", {"stage_index": 4})
        result = self.reporter_agent.run(self._get_context_dict(context))
        self._set_context_attr(context, "report", result.get("report", {}))
        self._emit("reporter_done", "Report saved successfully!", {"stage_index": 4})
        return context

    def run(
        self,
        prompt_category: str = "all",
        num_tests: int = 10,
        include_redteam: bool = True,
        custom_prompts: Optional[list[str]] = None,
    ) -> dict:
        initial_context = AgentContext(
            model=self.model_name,
            prompt_category=prompt_category,
            num_tests=num_tests,
            include_redteam=include_redteam,
            custom_prompts=custom_prompts,
        )
        result_state = self.graph.invoke(initial_context)
        if hasattr(result_state, 'model_dump'):
            context_dict = result_state.model_dump()
        else:
            context_dict = dict(result_state)
        return {
            "model": context_dict.get("model", self.model_name),
            "report": context_dict.get("report", {}),
            "test_cases": context_dict.get("test_cases", []),
            "eval_results": context_dict.get("eval_results", []),
            "benchmark_results": context_dict.get("benchmark_results", []),
            "detected_issues": context_dict.get("detected_issues", []),
            "error": context_dict.get("error", ""),
        }
