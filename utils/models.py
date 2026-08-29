from pydantic import BaseModel, Field
from typing import Any, Optional


class AgentContext(BaseModel):
    model: str = Field(default="gpt-4o")
    prompt_category: str = Field(default="all")
    num_tests: int = Field(default=10)
    include_redteam: bool = Field(default=True)
    custom_prompts: Optional[list[Any]] = Field(default=None)
    test_cases: list[dict] = Field(default_factory=list)
    red_team_results: list[dict] = Field(default_factory=list)
    eval_results: list[dict] = Field(default_factory=list)
    benchmark_results: list[dict] = Field(default_factory=list)
    detected_issues: list[dict] = Field(default_factory=list)
    report: dict = Field(default_factory=dict)
    error: str = Field(default="")
    metadata: dict[str, Any] = Field(default_factory=dict)
