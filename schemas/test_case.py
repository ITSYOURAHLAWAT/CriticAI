from pydantic import BaseModel, Field
from typing import Optional
from enum import Enum


class DifficultyLevel(str, Enum):
    easy = "easy"
    medium = "medium"
    hard = "hard"
    expert = "expert"


class CategoryType(str, Enum):
    abuse = "abuse"
    role_play = "role_play"
    code = "code"
    logic = "logic"
    factual = "factual"
    creative = "creative"
    reasoning = "reasoning"
    safety = "safety"
    jailbreak = "jailbreak"
    injection = "injection"


class TestCase(BaseModel):
    id: str = Field(..., description="Unique test case identifier")
    prompt: str = Field(..., description="The input prompt to send to the LLM")
    expected_behavior: str = Field(..., description="Description of expected correct behavior")
    category: CategoryType = Field(default=CategoryType.factual)
    difficulty: DifficultyLevel = Field(default=DifficultyLevel.medium)
    tags: list[str] = Field(default_factory=list)
    reference_answer: Optional[str] = Field(default=None, description="Optional ground truth answer")
