from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
from schemas.eval_result import EvalResult, ScoreDimension, FailureType


class RegressionInfo(BaseModel):
    test_id: str
    previous_score: float
    current_score: float
    delta: float
    dimension: str


class ModelHealthScore(BaseModel):
    overall: float = Field(default=100.0, ge=0.0, le=100.0)
    hallucination_avg: float = Field(default=0.0)
    toxicity_avg: float = Field(default=0.0)
    relevance_avg: float = Field(default=100.0)
    coherence_avg: float = Field(default=100.0)
    instruction_following_avg: float = Field(default=100.0)
    pass_rate: float = Field(default=100.0, ge=0.0, le=100.0)


class FailureBreakdown(BaseModel):
    total_failures: int = 0
    by_type: dict[str, int] = Field(default_factory=dict)
    top_failure_categories: list[str] = Field(default_factory=list)


class ImprovementSuggestion(BaseModel):
    category: str
    severity: str = Field(default="medium")
    suggestion: str
    affected_tests: list[str] = Field(default_factory=list)


class EvalReport(BaseModel):
    model: str
    timestamp: str = Field(default_factory=lambda: datetime.utcnow().isoformat())
    summary: str = Field(default="")
    detailed_results: list[EvalResult] = Field(default_factory=list)
    regressions: list[RegressionInfo] = Field(default_factory=list)
    health_score: ModelHealthScore = Field(default_factory=ModelHealthScore)
    failure_breakdown: FailureBreakdown = Field(default_factory=FailureBreakdown)
    improvement_suggestions: list[ImprovementSuggestion] = Field(default_factory=list)
    total_tests: int = 0
    passed_tests: int = 0
    duration_seconds: float = 0.0
