#!/usr/bin/env python3
"""
CriticAI Command Line Evaluator & CI/CD Gate.

Usage:
    python cli.py --model gpt-4o --num-tests 10 --fail-below 70.0
"""

import sys
import os
import argparse
import json
from orchestrator.graph import CriticAIOrchestrator

def main():
    parser = argparse.ArgumentParser(description="CriticAI CLI Evaluator & CI/CD Quality Gate")
    parser.add_argument("--model", default="gpt-4o", help="Model name to evaluate")
    parser.add_argument("--category", default="all", help="Prompt category (all, factual, logic, code, safety, etc.)")
    parser.add_argument("--num-tests", type=int, default=10, help="Number of test cases")
    parser.add_argument("--no-redteam", action="store_true", help="Disable red-team adversarial probes")
    parser.add_argument("--fail-below", type=float, default=70.0, help="Health score threshold to pass CI/CD check (default: 70.0)")
    args = parser.parse_args()

    print("=" * 60)
    print(" [CriticAI] - Automated CI/CD LLM Evaluator")
    print("=" * 60)
    print(f"  Model Target : {args.model}")
    print(f"  Category     : {args.category}")
    print(f"  Test Count   : {args.num_tests}")
    print(f"  Red-Teaming  : {'DISABLED' if args.no_redteam else 'ENABLED'}")
    print(f"  Pass Threshold: Health Score >= {args.fail_below}")
    print("-" * 60)

    try:
        use_http = os.environ.get("CHROMA_USE_HTTP", "false").lower() == "true"
        orchestrator = CriticAIOrchestrator(model_name=args.model, use_chroma_http=use_http)
        result = orchestrator.run(
            prompt_category=args.category,
            num_tests=args.num_tests,
            include_redteam=not args.no_redteam,
        )

        report = result.get("report", {})
        raw_score = report.get("health_score", 0.0)
        try:
            if isinstance(raw_score, dict):
                health_score = float(raw_score.get("overall", 0.0))
            elif isinstance(raw_score, str):
                health_score = float(raw_score.split("/")[0].strip())
            else:
                health_score = float(raw_score)
        except Exception:
            health_score = 0.0

        summary = report.get("summary", "")

        print("\nEvaluation Summary:")
        print(summary)
        print("\n" + "=" * 60)

        if health_score >= args.fail_below:
            print(f"[SUCCESS] PASSED CI/CD GATE: Health Score {health_score} >= {args.fail_below}")
            sys.exit(0)
        else:
            print(f"[FAIL] FAILED CI/CD GATE: Health Score {health_score} < {args.fail_below}")
            sys.exit(1)

    except Exception as exc:
        print(f"\n[FATAL ERROR] Exception during evaluation: {exc}")
        sys.exit(1)

if __name__ == "__main__":
    main()
