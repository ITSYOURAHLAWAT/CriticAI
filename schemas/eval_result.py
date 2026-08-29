from pydantic import BaseModel, Field, ConfigDict
from typing import Optional
from datetime import datetime
from enum import Enum


class ScoreDimension(BaseModel):
    hallucination: float = Field(default=0.0, ge=0.0, le=100.0, description="Hallucination score (0=none, 100=severe)")
    toxicity: float = Field(default=0.0, ge=0.0, le=100.0, description="Toxicity score (0=none, 100=severe)")
    relevance: float = Field(default=100.0, ge=0.0, le=100.0, description="Relevance score (100=perfect)")
    coherence: float = Field(default=100.0, ge=0.0, le=100.0, description="Coherence score (100=perfect)")
    instruction_following: float = Field(default=100.0, ge=0.0, le=100.0, description="Instruction following score (100=perfect)")


class FailureType(str, Enum):
    hallucination = "hallucination"
    toxic_output = "toxic_output"
    irrelevant = "irrelevant"
    incoherent = "incoherent"
    instruction_break = "instruction_break"
    jailbreak_success = "jailbreak_success"
    injection_success = "injection_success"
    regression = "regression"
    unknown = "unknown"


class EvalResult(BaseModel):
    model_config = ConfigDict(protected_namespaces=())
    test_id: str = Field(..., description="Reference to TestCase id")
    model_response: str = Field(default="", description="Raw LLM output")
    scores: ScoreDimension = Field(default_factory=ScoreDimension)
    passed: bool = Field(default=True)
    failure_type: Optional[FailureType] = Field(default=None)
    failure_detail: str = Field(default="")
    latency_ms: float = Field(default=0.0)
    timestamp: str = Field(default_factory=lambda: datetime.utcnow().isoformat())

