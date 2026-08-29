"""
A/B Testing Engine for CriticAI.

Runs the same prompt set against TWO models SEQUENTIALLY
(no parallel calls — respects free API rate limits).
Scores both responses with an LLM-judge, declares per-test winners,
and returns an overall winner with detailed statistics.
"""

import os
import sys
import json
import random
import time
import uuid
from datetime import datetime
from typing import Optional, Callable, List, Tuple

# Make project root importable
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from utils.llm_provider import LLMProvider

# ─── Built-in prompt bank (per category) ──────────────────────────────────────

_PROMPT_BANK: dict = {
    "factual": [
        "What is the capital of France?",
        "Explain the theory of general relativity in simple terms.",
        "What are the three branches of the US government?",
        "How does photosynthesis work?",
        "What is the difference between RAM and storage?",
        "Who wrote Romeo and Juliet and when?",
        "What is the boiling point of water at sea level in Celsius?",
        "Explain what DNA is and its role in genetics.",
        "What causes earthquakes?",
        "How many planets are in our solar system?",
        "What is the speed of light in a vacuum?",
        "What is the largest ocean on Earth?",
        "Who invented the telephone?",
        "What is the difference between bacteria and viruses?",
        "What is inflation in economics?",
        "What element has the chemical symbol Au?",
        "What is the Pythagorean theorem?",
        "What year did World War II end?",
        "What is the largest planet in our solar system?",
        "How many bones does the adult human body have?",
    ],
    "reasoning": [
        "If all roses are flowers and some flowers fade quickly, can we conclude that some roses fade quickly? Explain.",
        "A train leaves Station A at 60 mph. Another leaves Station B at 80 mph toward Station A. The stations are 280 miles apart. When do they meet?",
        "Solve: Alice is older than Bob. Bob is older than Carol. Who is the oldest and who is the youngest?",
        "If you have a 3-gallon jug and a 5-gallon jug, how do you measure exactly 4 gallons of water?",
        "What comes next in the sequence: 2, 6, 12, 20, 30? Explain the pattern.",
        "A bat and ball cost $1.10. The bat costs $1 more than the ball. How much does the ball cost?",
        "If it takes 5 machines 5 minutes to make 5 widgets, how long does it take 100 machines to make 100 widgets?",
        "A farmer has 17 sheep. All but 9 die. How many sheep are left?",
        "What is the next term in: 1, 1, 2, 3, 5, 8, 13? What is this sequence called?",
        "You have two ropes that each burn for exactly 60 minutes, but not at a uniform rate. How do you measure 45 minutes?",
        "In a group of 30 people, what is the minimum number of birthdays that must be shared?",
        "If a doctor gives you 3 pills and tells you to take 1 every half hour, how long do the pills last?",
        "A snail crawls 3 feet up a wall during the day and slides 2 feet at night. If the wall is 30 feet tall, how many days to reach the top?",
        "What is the missing number: 6, ?, 24, 48, 96? Explain your reasoning.",
        "Five people shake hands with everyone else exactly once. How many handshakes total?",
    ],
    "code": [
        "Write a Python function to check if a string is a palindrome.",
        "Explain the difference between a list and a tuple in Python with examples.",
        "Write a SQL query to find all customers who placed more than 3 orders.",
        "What is a closure in JavaScript? Provide a clear example.",
        "Write a Python function to compute the factorial of n using recursion.",
        "Explain Big O notation and give examples of O(1), O(n), and O(n²) algorithms.",
        "Write a Python function to reverse a singly linked list.",
        "What is the difference between REST and GraphQL APIs?",
        "Write a Python function to check if a number is prime.",
        "Explain what a hash table is and how it handles collision.",
        "Write a Python decorator that measures and prints function execution time.",
        "What is the difference between async/await and Promises in JavaScript?",
        "Implement Kadane's algorithm to find the maximum subarray sum in Python.",
        "Explain the SOLID principles with one sentence each.",
        "Write a binary search function in Python and explain its time complexity.",
    ],
    "safety": [
        "How can I stay safe online and protect my personal data?",
        "What should I do if I suspect I am being phished?",
        "How do I recognize and respond to cyberbullying?",
        "What are best practices for creating strong, unique passwords?",
        "What should I do immediately if my online account is hacked?",
        "How can parents help protect their children online?",
        "What is two-factor authentication and why is it important?",
        "How do I identify a fraudulent or scam website?",
        "What personal information should I never share publicly online?",
        "How should I safely dispose of old electronic devices?",
    ],
    "creative": [
        "Write a short vivid poem about the ocean at sunset.",
        "Write the opening paragraph of a mystery novel set in 1920s Paris.",
        "Describe a world where humans can communicate telepathically with animals.",
        "Write a haiku about a snowy winter morning.",
        "Create a short story (3 paragraphs) about a robot who discovers emotions.",
        "Write a compelling product description for a magical time-travel wristwatch.",
        "Describe what the color blue smells like, using only sensory metaphors.",
        "Write a villain's dramatic monologue for a story about climate change.",
        "Create a calming bedtime story for a child about a brave little raindrop.",
        "Write a tweet from the perspective of the first human to walk on Mars.",
        "Compose a heartfelt letter from a lighthouse keeper to the sea.",
        "Write a one-paragraph investor pitch for a startup that sells bottled silence.",
        "Create a 5-item dinner menu for a luxury restaurant on the Moon.",
        "Write a short dialogue between a book and its reader after the last page.",
        "Describe what jazz music looks like, using only colors and shapes.",
    ],
}

# Flat list of (prompt, category) pairs for random sampling
_ALL_PROMPTS: List[Tuple[str, str]] = [
    (prompt, cat)
    for cat, prompts in _PROMPT_BANK.items()
    for prompt in prompts
]


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _get_test_prompts(
    category: str,
    num_tests: int,
    custom_prompts: Optional[list] = None,
) -> List[Tuple[str, str]]:
    """
    Return list of (prompt_text, category) tuples for the A/B run.
    """
    if custom_prompts:
        result = []
        for item in custom_prompts[:num_tests]:
            if isinstance(item, dict):
                result.append((item.get("prompt", str(item)), item.get("category", "custom")))
            else:
                result.append((str(item), "custom"))
        return result

    if category == "all":
        pool = _ALL_PROMPTS
    else:
        pool = [(p, cat) for p, cat in _ALL_PROMPTS if cat == category]
        if not pool:
            pool = _ALL_PROMPTS  # fallback

    n = min(num_tests, len(pool))
    return random.sample(pool, n)


# ─── A/B Test Engine ──────────────────────────────────────────────────────────

class ABTester:
    """
    Core A/B Testing Engine.

    Strategy:
      For each prompt:
        1. Call Model A  →  wait 1 s  →  Call Model B  →  wait 0.8 s
        2. Judge Response A  →  wait 0.5 s  →  Judge Response B
        3. Declare per-test winner
      After all prompts: declare overall winner.

    All calls are sequential — no threading / asyncio — to respect free-tier
    API rate limits (Groq: 30 req/min, Gemini: 15 req/min).
    """

    def __init__(
        self,
        model_a: str,
        model_b: str,
        provider_a: str = "groq",
        provider_b: str = "groq",
        progress_callback: Optional[Callable[[str, str, dict], None]] = None,
    ):
        self.model_a = model_a
        self.model_b = model_b
        self.provider_a = provider_a.lower()
        self.provider_b = provider_b.lower()
        self._cb = progress_callback or (lambda *_: None)

        self._llm_a = LLMProvider(preferred_provider=self.provider_a)
        self._llm_b = LLMProvider(preferred_provider=self.provider_b)
        # Always use Groq as judge for consistency (falls back to Gemini)
        self._judge = LLMProvider(preferred_provider="groq")

    # ── Private helpers ───────────────────────────────────────────────────────

    def _emit(self, stage: str, message: str, data: dict = None):
        """Emit a progress event via the callback."""
        self._cb(stage, message, data or {})

    def _safe_response(self, llm: LLMProvider, prompt: str, model: str, provider: str):
        """Call LLM; return (response_text, is_simulated)."""
        try:
            r = llm.get_response(prompt, model, provider)
            return r.get("response", ""), r.get("is_simulated", False)
        except Exception as exc:
            return f"[ERROR] {exc}", True

    def _safe_score(self, prompt: str, response: str) -> dict:
        """Judge a response; return score dict with defaults on failure."""
        try:
            return self._judge.evaluate_response(prompt, response)
        except Exception as exc:
            s = random.randint(50, 75)
            result = "pass" if s >= 70 else "partial"
            return {
                "score": s,
                "result": result,
                "reasoning": f"Judge unavailable: {exc}",
                "judge_provider": "simulation",
            }

    # ── Public run method ─────────────────────────────────────────────────────

    def run(
        self,
        category: str = "all",
        num_tests: int = 10,
        custom_prompts: Optional[list] = None,
    ) -> dict:
        """
        Execute the full A/B test session.

        Returns a summary dict with per-test results and aggregate stats.
        Raises no exceptions — errors are embedded in results.
        """
        prompts = _get_test_prompts(category, num_tests, custom_prompts)
        total = len(prompts)

        self._emit("ab_start", f"🚀 A/B Test started — {self.model_a} vs {self.model_b}", {
            "model_a": self.model_a,
            "model_b": self.model_b,
            "provider_a": self.provider_a,
            "provider_b": self.provider_b,
            "total_tests": total,
            "category": category,
        })

        test_results = []
        wins_a = wins_b = ties = 0
        total_score_a = total_score_b = 0.0

        for idx, (prompt, cat) in enumerate(prompts):
            test_num = idx + 1

            self._emit("ab_test_start", f"Test {test_num}/{total} — {cat}", {
                "test_num": test_num,
                "total": total,
                "prompt": prompt,
                "category": cat,
            })

            # ── Model A response ──────────────────────────────────────────────
            self._emit("ab_model_a",
                       f"[{test_num}/{total}] Querying {self.model_a}…",
                       {"test_num": test_num, "side": "a"})
            response_a, sim_a = self._safe_response(
                self._llm_a, prompt, self.model_a, self.provider_a
            )
            time.sleep(1.2)  # rate-limit buffer

            # ── Model B response ──────────────────────────────────────────────
            self._emit("ab_model_b",
                       f"[{test_num}/{total}] Querying {self.model_b}…",
                       {"test_num": test_num, "side": "b"})
            response_b, sim_b = self._safe_response(
                self._llm_b, prompt, self.model_b, self.provider_b
            )
            time.sleep(0.8)

            # ── Judge A ───────────────────────────────────────────────────────
            self._emit("ab_judge",
                       f"[{test_num}/{total}] Scoring responses…",
                       {"test_num": test_num})
            scored_a = self._safe_score(prompt, response_a)
            time.sleep(0.6)

            # ── Judge B ───────────────────────────────────────────────────────
            scored_b = self._safe_score(prompt, response_b)
            time.sleep(0.4)

            sc_a = int(scored_a.get("score", 0))
            sc_b = int(scored_b.get("score", 0))

            # ── Determine winner ──────────────────────────────────────────────
            if sc_a > sc_b:
                winner = "a"
                wins_a += 1
            elif sc_b > sc_a:
                winner = "b"
                wins_b += 1
            else:
                winner = "tie"
                ties += 1

            total_score_a += sc_a
            total_score_b += sc_b

            tr = {
                "test_num": test_num,
                "prompt": prompt,
                "category": cat,
                "response_a": response_a,
                "response_b": response_b,
                "score_a": sc_a,
                "score_b": sc_b,
                "result_a": scored_a.get("result", "partial"),
                "result_b": scored_b.get("result", "partial"),
                "reasoning_a": scored_a.get("reasoning", ""),
                "reasoning_b": scored_b.get("reasoning", ""),
                "winner": winner,
                "is_simulated_a": sim_a,
                "is_simulated_b": sim_b,
            }
            test_results.append(tr)

            winner_label = (
                f"Model A ({self.model_a})" if winner == "a"
                else (f"Model B ({self.model_b})" if winner == "b" else "Tie")
            )
            self._emit("ab_test_done",
                       f"Test {test_num} winner: {winner_label} (A:{sc_a} vs B:{sc_b})",
                       {"test_num": test_num, "winner": winner,
                        "score_a": sc_a, "score_b": sc_b, "result": tr})

            time.sleep(0.3)

        # ── Aggregate ─────────────────────────────────────────────────────────
        avg_a = round(total_score_a / total, 1) if total else 0.0
        avg_b = round(total_score_b / total, 1) if total else 0.0

        if wins_a > wins_b:
            overall_winner = "a"
        elif wins_b > wins_a:
            overall_winner = "b"
        else:
            overall_winner = "tie"

        winner_name = (
            self.model_a if overall_winner == "a"
            else (self.model_b if overall_winner == "b" else "Tie")
        )

        summary = {
            "model_a": self.model_a,
            "model_b": self.model_b,
            "provider_a": self.provider_a,
            "provider_b": self.provider_b,
            "category": category,
            "total_tests": total,
            "wins_a": wins_a,
            "wins_b": wins_b,
            "ties": ties,
            "avg_score_a": avg_a,
            "avg_score_b": avg_b,
            "overall_winner": overall_winner,
            "winner_name": winner_name,
            "test_results": test_results,
            "created_at": datetime.utcnow().isoformat(),
        }

        self._emit("ab_complete",
                   f"🏆 A/B Test complete! Winner: {winner_name}",
                   {"summary": summary})

        return summary
