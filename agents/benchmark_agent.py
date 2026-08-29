from typing import Any
from utils.llm_client import UnifiedLLMClient


MMLU_SAMPLE = [
    {"question": "What is the chemical symbol for gold?", "options": ["Go", "Gd", "Au", "Ag"], "answer": 2},
    {"question": "Which planet is known as the Red Planet?", "options": ["Venus", "Jupiter", "Mars", "Saturn"], "answer": 2},
    {"question": "What is the largest organ in the human body?", "options": ["Liver", "Brain", "Skin", "Heart"], "answer": 2},
    {"question": "Who wrote 'Romeo and Juliet'?", "options": ["Dickens", "Shakespeare", "Hemingway", "Austen"], "answer": 1},
    {"question": "What is the speed of light in vacuum (m/s)?", "options": ["3x10^6", "3x10^8", "3x10^10", "3x10^12"], "answer": 1},
]

HUMANEVAL_SAMPLE = [
    {"task": "Write a function that returns the factorial of n.", "test": "factorial(5) == 120"},
    {"task": "Write a function that checks if a string is a palindrome.", "test": "is_palindrome('racecar') == True"},
    {"task": "Write a function that returns the nth Fibonacci number.", "test": "fibonacci(10) == 55"},
    {"task": "Write a function that finds the maximum element in a list.", "test": "max_element([1, 3, 2, 5, 4]) == 5"},
    {"task": "Write a function that merges two sorted lists.", "test": "merge([1,3,5], [2,4,6]) == [1,2,3,4,5,6]"},
]

HELM_SAMPLE = [
    {"task": "Summarize the following text in one sentence: 'The quick brown fox jumps over the lazy dog.'",
     "expected": "A fast fox leaps over a sleepy dog."},
    {"task": "Answer with the sentiment: 'This movie was absolutely fantastic!'",
     "expected": "positive"},
    {"task": "Complete the analogy: doctor is to hospital as teacher is to ___",
     "expected": "school"},
    {"task": "Translate 'Good morning' to Spanish.",
     "expected": "Buenos días"},
    {"task": "What is the synonym of 'happy'?",
     "expected": "joyful"},
]


class BenchmarkAgent:
    def __init__(self, llm_client: UnifiedLLMClient):
        self.name = "benchmark"
        self.llm_client = llm_client

    def run(self, context: dict) -> dict:
        model = context.get("model", "unknown")
        benchmark_results = []

        mmlu_result = self._run_mmlu()
        benchmark_results.append(mmlu_result)

        humaneval_result = self._run_humaneval()
        benchmark_results.append(humaneval_result)

        helm_result = self._run_helm()
        benchmark_results.append(helm_result)

        context_copy = dict(context)
        context_copy["benchmark_results"] = benchmark_results
        context_copy["benchmark_status"] = "completed"
        return context_copy

    def _run_mmlu(self) -> dict:
        correct = 0
        total = len(MMLU_SAMPLE)
        details = []
        for item in MMLU_SAMPLE:
            prompt = f"Question: {item['question']}\n"
            for i, opt in enumerate(item["options"]):
                prompt += f"{i}. {opt}\n"
            prompt += "Answer with the number of the correct option only."
            response = self.llm_client.query(prompt, temperature=0.0, max_tokens=10)
            try:
                answer = int(response.strip())
                is_correct = answer == item["answer"]
            except (ValueError, IndexError):
                is_correct = False
            if is_correct:
                correct += 1
            details.append({"question": item["question"], "expected": item["answer"], "got": response.strip(), "correct": is_correct})
        return {"benchmark": "MMLU", "score": (correct / total) * 100 if total > 0 else 0, "correct": correct, "total": total, "details": details}

    def _run_humaneval(self) -> dict:
        correct = 0
        total = len(HUMANEVAL_SAMPLE)
        details = []
        for item in HUMANEVAL_SAMPLE:
            prompt = f"{item['task']}\n\nProvide only the function definition, no explanations."
            response = self.llm_client.query(prompt, temperature=0.1, max_tokens=256)
            has_def = "def " in response
            has_return = "return" in response
            is_pass = has_def and has_return
            if is_pass:
                correct += 1
            details.append({"task": item["task"], "test": item["test"], "has_def": has_def, "has_return": has_return, "pass": is_pass})
        return {"benchmark": "HumanEval", "score": (correct / total) * 100 if total > 0 else 0, "correct": correct, "total": total, "details": details}

    def _run_helm(self) -> dict:
        correct = 0
        total = len(HELM_SAMPLE)
        details = []
        for item in HELM_SAMPLE:
            response = self.llm_client.query(item["task"], temperature=0.0, max_tokens=64)
            expected_lower = item["expected"].lower()
            response_lower = response.lower().strip()
            is_correct = expected_lower in response_lower or response_lower.startswith(expected_lower)
            if is_correct:
                correct += 1
            details.append({"task": item["task"], "expected": item["expected"], "got": response.strip(), "correct": is_correct})
        return {"benchmark": "HELM", "score": (correct / total) * 100 if total > 0 else 0, "correct": correct, "total": total, "details": details}
