import asyncio
import os
import glob
import json
import queue
import threading
import random
import uuid
import time
from datetime import datetime
from typing import Any, AsyncGenerator, Optional, Union
from fastapi import FastAPI, HTTPException, Query, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, HTMLResponse, StreamingResponse, Response
from pydantic import BaseModel, Field
from dataset_parser import parse_csv_dataset, parse_json_dataset, validate_dataset
from orchestrator.graph import CriticAIOrchestrator
from utils.llm_provider import LLMProvider, GROQ_MODELS, GEMINI_MODELS, OLLAMA_MODELS, _simulate_response
from utils.alerts import send_evaluation_alert, send_test_alert

# ── DB import (sqlite3 built-in, no extra packages) ──────────────────────────
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from database import db
from model_card import generate_model_card
from templates import get_all_templates, get_template_by_id, get_templates_by_category
from usage_tracker import tracker, PROVIDER_LIMITS
from regression import detect_regression, get_all_models_regression, calculate_trend
from batch_queue import batch_manager


def track_api_usage(provider: str, model: str, prompt: str, response_text: str, request_type: str = "evaluation", eval_id: str = None):
    """Helper to record token usage and log API calls."""
    try:
        t_in = tracker.estimate_tokens(prompt or "")
        t_out = tracker.estimate_tokens(response_text or "")
        p_clean = (provider or "groq").lower()
        tracker.record_usage(provider=p_clean, model=model or "unknown", tokens_input=t_in, tokens_output=t_out, request_type=request_type)
        db.log_api_call(provider=p_clean, model=model or "unknown", tokens_input=t_in, tokens_output=t_out, request_type=request_type, eval_id=eval_id)
    except Exception as exc:
        print(f"[Usage Tracker] Tracking error: {exc}")

def _load_env():
    env_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env")
    if os.path.exists(env_path):
        try:
            with open(env_path, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith("#") and "=" in line:
                        k, v = line.split("=", 1)
                        os.environ.setdefault(k.strip(), v.strip())
        except Exception:
            pass

_load_env()

app = FastAPI(
    title="CriticAI - LLM Evaluation & Red-Teaming System",
    version="1.0.0",
    description="Multi-agent LLM evaluation system with LangGraph orchestration",
)


# ── CORS ──────────────────────────────────────────────────────────────────────
ENVIRONMENT = os.getenv("ENVIRONMENT", "development")

if ENVIRONMENT == "production":
    # In production, allow your Vercel frontend + any *.vercel.app preview URLs
    CORS_ORIGINS = [
        "https://criticai-ten.vercel.app",
        "https://criticai.vercel.app",
    ]
else:
    # In development allow all origins
    CORS_ORIGINS = ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS if ENVIRONMENT == "production" else ["*"],
    allow_origin_regex=r"https://.*\.vercel\.app" if ENVIRONMENT == "production" else None,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)



# ─── Pydantic models ──────────────────────────────────────────────────────────

class EvaluateRequest(BaseModel):
    model: str = Field(default="gpt-4o", description="LLM model name to evaluate")
    prompt_category: str = Field(default="all", description="Category of prompts to test")
    num_tests: int = Field(default=10, ge=1, le=100, description="Number of test cases")
    include_redteam: bool = Field(default=True, description="Include red-team testing")
    custom_prompts: Optional[list[Any]] = Field(default=None, description="Custom benchmark prompts")
    dataset_session_id: Optional[str] = Field(default=None, description="In-memory uploaded dataset session id")
    provider: str = Field(default="groq", description="LLM provider: groq | gemini | ollama")
    template_id: Optional[str] = Field(default=None, description="Template ID if loaded from template")


class ABTestRequest(BaseModel):
    model_a: str = Field(description="First LLM model name")
    model_b: str = Field(description="Second LLM model name")
    provider_a: str = Field(default="groq", description="Provider for model A")
    provider_b: str = Field(default="groq", description="Provider for model B")
    prompt_category: str = Field(default="all", description="Category of prompts")
    num_tests: int = Field(default=10, ge=1, le=30, description="Number of tests (max 30 for rate limits)")
    custom_prompts: Optional[list[Any]] = Field(default=None)
    dataset_session_id: Optional[str] = Field(default=None)


class EvaluationResponse(BaseModel):
    status: str
    model: str
    eval_id: Optional[str] = None
    report: dict
    summary: str


class BatchJobRequest(BaseModel):
    model: str = Field(description="Model name to evaluate")
    provider: Optional[str] = Field(default=None, description="Provider: groq | gemini | ollama")
    prompt_category: str = Field(default="all", description="Prompt category")
    num_tests: int = Field(default=10, ge=1, le=50, description="Number of tests")
    include_redteam: bool = Field(default=False, description="Include red-team tests")


class CreateBatchRequest(BaseModel):
    jobs: list[BatchJobRequest]
    delay_between: Optional[int] = Field(default=3, ge=1, le=15, description="Delay between evals in seconds")


class RubricBody(BaseModel):
    name: str
    domain: str = "general"
    criteria: list
    pass_threshold: float = 70.0


# ─── Startup ──────────────────────────────────────────────────────────────────

@app.on_event("startup")
async def startup_event():
    model_name = os.environ.get("CRITICAI_MODEL", "gpt-4o")
    chroma_host = os.environ.get("CHROMA_HOST", "localhost")
    use_http = chroma_host != "localhost" or os.environ.get("CHROMA_USE_HTTP", "false").lower() == "true"
    try:
        CriticAIOrchestrator(model_name=model_name, use_chroma_http=use_http)
    except Exception as exc:
        print(f"WARNING: Startup pre-warm failed: {exc}")


# ─── Core routes ─────────────────────────────────────────────────────────────

@app.get("/")
async def root():
    return {
        "service": "CriticAI",
        "version": "1.0.0",
        "status": "running",
        "endpoints": {
            "POST /evaluate":          "Run full evaluation pipeline",
            "POST /evaluate/stream":   "SSE streaming evaluation",
            "GET  /stats":             "Dashboard stats from DB",
            "GET  /evaluations":       "All evaluations from DB",
            "GET  /leaderboard":       "Model leaderboard",
            "GET  /health":            "Service health check",
        },
    }


@app.get("/health")
async def health():
    return {"status": "healthy", "service": "criticai"}


# ─── SSE Streaming Evaluation ─────────────────────────────────────────────────

@app.post("/evaluate/stream")
async def evaluate_stream(request: EvaluateRequest):
    """
    SSE streaming endpoint. Emits real-time progress events while the
    evaluation pipeline runs, then emits the final result as a 'complete' event.
    Also persists evaluation to SQLite DB.
    """
    use_http = os.environ.get("CHROMA_USE_HTTP", "false").lower() == "true"
    event_queue: asyncio.Queue = asyncio.Queue()
    loop = asyncio.get_event_loop()

    # Resolve dataset session prompts
    custom_prompts = request.custom_prompts
    dataset_filename = None
    if request.dataset_session_id:
        session = dataset_sessions.pop(request.dataset_session_id, None)
        if session:
            custom_prompts = session.get('prompts', [])
            dataset_filename = session.get('filename')
            request.num_tests = len(custom_prompts)

    # ── Save initial evaluation row to DB (status=running) ──
    eval_id = db.save_evaluation({
        "model":           request.model,
        "provider":        request.provider,
        "prompt_category": request.prompt_category,
        "num_tests":       request.num_tests,
        "include_redteam": request.include_redteam,
        "dataset_filename": dataset_filename,
    })

    def progress_callback(stage: str, message: str, data: dict = None):
        payload = json.dumps({"stage": stage, "message": message, "eval_id": eval_id, **(data or {})})
        loop.call_soon_threadsafe(event_queue.put_nowait, payload)

    def run_pipeline():
        try:
            orchestrator = CriticAIOrchestrator(
                model_name=request.model,
                use_chroma_http=use_http,
                progress_callback=progress_callback,
            )
            result = orchestrator.run(
                request.prompt_category,
                request.num_tests,
                request.include_redteam,
                custom_prompts,
            )
            report = result.get("report", {})

            # ── Persist completed result to DB ──
            try:
                # report is model_dump() of EvalReport:
                # health_score  → nested dict  {"overall": float, "pass_rate": float, ...}
                # passed_tests  → int  (NOT passed_count)
                # detailed_results → list of EvalResult dicts (scores is a nested ScoreDimension dict)

                health_score_obj = report.get("health_score", {})
                if not isinstance(health_score_obj, dict):
                    health_score_obj = {}

                health_score_val = float(health_score_obj.get("overall", 0))
                pass_rate        = float(health_score_obj.get("pass_rate", 0))
                total_tests      = int(report.get("total_tests", request.num_tests))
                passed           = int(report.get("passed_tests", 0))

                # Build avg_scores from the health_score sub-object
                avg_scores = {
                    "hallucination":        health_score_obj.get("hallucination_avg", 0),
                    "toxicity":             health_score_obj.get("toxicity_avg", 0),
                    "relevance":            health_score_obj.get("relevance_avg", 0),
                    "coherence":            health_score_obj.get("coherence_avg", 0),
                    "instruction_following": health_score_obj.get("instruction_following_avg", 0),
                }

                db.update_evaluation(eval_id, {
                    "status":       "completed",
                    "pass_rate":    pass_rate,
                    "health_score": health_score_val,
                    "total_tests":  total_tests,
                    "passed_tests": passed,
                    "failed_tests": total_tests - passed,
                    "avg_scores":   avg_scores,
                    "summary":      report.get("summary", ""),
                })

                # detailed_results is a list of EvalResult dicts
                # scores is a nested ScoreDimension dict, not a plain float
                detailed_results = report.get("detailed_results", [])
                if detailed_results:
                    db.save_test_results(eval_id, [
                        {
                            "prompt":     tc.get("prompt", tc.get("test_id", "")),
                            "category":   tc.get("category", ""),
                            "result":     "pass" if tc.get("passed") else "fail",
                            "score":      float(
                                tc["scores"].get("relevance", 0)
                                if isinstance(tc.get("scores"), dict)
                                else tc.get("score", 0)
                            ),
                            "reasoning":  tc.get("failure_detail", tc.get("reasoning", "")),
                            "response":   tc.get("model_response", tc.get("response", "")),
                            "is_redteam": tc.get("is_redteam", False),
                            "attack_type": tc.get("attack_type", ""),
                        }
                        for tc in detailed_results
                    ])
            except Exception as db_exc:
                print(f"[DB] Stream eval save error (non-fatal): {db_exc}")

            # ── Track API Usage ──
            try:
                prompts_text = " ".join([tc.get("prompt", "") for tc in detailed_results])
                responses_text = " ".join([tc.get("model_response", "") for tc in detailed_results])
                track_api_usage(request.provider, request.model, prompts_text, responses_text, "evaluation", eval_id)
            except Exception as track_exc:
                print(f"[Usage Tracker] Stream track error: {track_exc}")

            # ── Generate AI report summary ──
            try:
                detailed_results = report.get("detailed_results", [])
                redteam_cases = []
                if request.include_redteam:
                    redteam_cases = [tc for tc in detailed_results if tc.get("is_redteam", False)]

                eval_summary_data = {
                    "model":           request.model,
                    "pass_rate":        pass_rate,
                    "health_score":    health_score_val,
                    "total_tests":     total_tests,
                    "passed_tests":    passed,
                    "failed_tests":    total_tests - passed,
                    "avg_scores":      avg_scores,
                    "include_redteam": request.include_redteam,
                    "redteam_results": [
                        {
                            "prompt": tc.get("prompt", tc.get("test_id", "")),
                            "result": "pass" if tc.get("passed") else "fail"
                        }
                        for tc in redteam_cases
                    ],
                    "prompt_category": request.prompt_category
                }

                from ai_summary import generate_evaluation_summary
                ai_sum = generate_evaluation_summary(eval_summary_data)
                db.save_ai_summary(eval_id, ai_sum)

                loop.call_soon_threadsafe(
                    event_queue.put_nowait,
                    json.dumps({
                        "stage": "summary_ready",
                        "type": "summary_ready",
                        "message": "AI Report summary is ready!",
                        "eval_id": eval_id,
                        "summary": ai_sum
                    })
                )

                # ── Generate & Save Model Card ──
                try:
                    eval_data_card = {
                        "model": request.model,
                        "provider": request.provider,
                        "pass_rate": pass_rate,
                        "health_score": health_score_val,
                        "total_tests": total_tests,
                        "passed_tests": passed,
                        "failed_tests": total_tests - passed,
                        "avg_scores": avg_scores,
                        "include_redteam": request.include_redteam,
                        "prompt_category": request.prompt_category,
                        "created_at": datetime.utcnow().isoformat(),
                        "dataset_filename": dataset_filename
                    }
                    card_md = generate_model_card(eval_data_card, ai_sum)
                    db.save_model_card(eval_id, card_md)
                    
                    loop.call_soon_threadsafe(
                        event_queue.put_nowait,
                        json.dumps({
                            "stage": "card_ready",
                            "type": "card_ready",
                            "message": "Model Card generated successfully!",
                            "eval_id": eval_id
                        })
                    )
                except Exception as card_exc:
                    print(f"[Model Card] Stream generation failed: {card_exc}")
            except Exception as sum_exc:
                print(f"[Summary Engine] Stream summary failed (non-fatal): {sum_exc}")

            loop.call_soon_threadsafe(
                event_queue.put_nowait,
                json.dumps({"stage": "complete", "message": "Evaluation complete!", "eval_id": eval_id, "result": result}),
            )
        except Exception as exc:
            try:
                db.update_evaluation(eval_id, {"status": "failed"})
            except Exception:
                pass
            loop.call_soon_threadsafe(
                event_queue.put_nowait,
                json.dumps({"stage": "error", "message": str(exc)}),
            )
        finally:
            loop.call_soon_threadsafe(event_queue.put_nowait, None)

    async def event_generator() -> AsyncGenerator[str, None]:
        thread = threading.Thread(target=run_pipeline, daemon=True)
        thread.start()
        try:
            while True:
                payload = await event_queue.get()
                if payload is None:
                    break
                yield f"data: {payload}\n\n"
        except asyncio.CancelledError:
            pass

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


# ─── Non-streaming Evaluation ─────────────────────────────────────────────────

@app.post("/evaluate", response_model=EvaluationResponse)
async def evaluate(request: EvaluateRequest):
    """
    Run a full evaluation pipeline (blocking, returns when done).
    Also saves to SQLite DB.
    """
    use_http = os.environ.get("CHROMA_USE_HTTP", "false").lower() == "true"

    # Resolve dataset session prompts
    custom_prompts = request.custom_prompts
    dataset_filename = None
    if request.dataset_session_id:
        session = dataset_sessions.pop(request.dataset_session_id, None)
        if session:
            custom_prompts = session.get('prompts', [])
            dataset_filename = session.get('filename')
            request.num_tests = len(custom_prompts)

    # ── Save initial row ──
    eval_id = db.save_evaluation({
        "model":           request.model,
        "provider":        request.provider,
        "prompt_category": request.prompt_category,
        "num_tests":       request.num_tests,
        "include_redteam": request.include_redteam,
        "dataset_filename": dataset_filename,
    })

    orchestrator = CriticAIOrchestrator(model_name=request.model, use_chroma_http=use_http)
    try:
        result = await asyncio.to_thread(
            orchestrator.run,
            request.prompt_category,
            request.num_tests,
            request.include_redteam,
            custom_prompts,
        )
        report  = result.get("report", {})
        summary = report.get("summary", "No summary available")

        # ── Persist to DB ──
        try:
            health_score_obj = report.get("health_score", {})
            if not isinstance(health_score_obj, dict):
                health_score_obj = {}

            health_score_val = float(health_score_obj.get("overall", 0))
            pass_rate        = float(health_score_obj.get("pass_rate", 0))
            total_tests      = int(report.get("total_tests", request.num_tests))
            passed           = int(report.get("passed_tests", 0))

            avg_scores = {
                "hallucination":        health_score_obj.get("hallucination_avg", 0),
                "toxicity":             health_score_obj.get("toxicity_avg", 0),
                "relevance":            health_score_obj.get("relevance_avg", 0),
                "coherence":            health_score_obj.get("coherence_avg", 0),
                "instruction_following": health_score_obj.get("instruction_following_avg", 0),
            }

            db.update_evaluation(eval_id, {
                "status":       "completed",
                "pass_rate":    pass_rate,
                "health_score": health_score_val,
                "total_tests":  total_tests,
                "passed_tests": passed,
                "failed_tests": total_tests - passed,
                "avg_scores":   avg_scores,
                "summary":      summary,
            })

            detailed_results = report.get("detailed_results", [])
            if detailed_results:
                db.save_test_results(eval_id, [
                    {
                        "prompt":     tc.get("prompt", tc.get("test_id", "")),
                        "category":   tc.get("category", ""),
                        "result":     "pass" if tc.get("passed") else "fail",
                        "score":      float(
                            tc["scores"].get("relevance", 0)
                            if isinstance(tc.get("scores"), dict)
                            else tc.get("score", 0)
                        ),
                        "reasoning":  tc.get("failure_detail", tc.get("reasoning", "")),
                        "response":   tc.get("model_response", tc.get("response", "")),
                        "is_redteam": tc.get("is_redteam", False),
                        "attack_type": tc.get("attack_type", ""),
                    }
                    for tc in detailed_results
                ])
        except Exception as db_exc:
            print(f"[DB] Eval save error (non-fatal): {db_exc}")

        # ── Track API Usage ──
        try:
            prompts_text = " ".join([tc.get("prompt", "") for tc in detailed_results])
            responses_text = " ".join([tc.get("model_response", "") for tc in detailed_results])
            track_api_usage(request.provider, request.model, prompts_text, responses_text, "evaluation", eval_id)
        except Exception as track_exc:
            print(f"[Usage Tracker] Track error: {track_exc}")

        # ── Generate AI report summary ──
        try:
            detailed_results = report.get("detailed_results", [])
            redteam_cases = []
            if request.include_redteam:
                redteam_cases = [tc for tc in detailed_results if tc.get("is_redteam", False)]

            eval_summary_data = {
                "model":           request.model,
                "pass_rate":        pass_rate,
                "health_score":    health_score_val,
                "total_tests":     total_tests,
                "passed_tests":    passed,
                "failed_tests":    total_tests - passed,
                "avg_scores":      avg_scores,
                "include_redteam": request.include_redteam,
                "redteam_results": [
                    {
                        "prompt": tc.get("prompt", tc.get("test_id", "")),
                        "result": "pass" if tc.get("passed") else "fail"
                    }
                    for tc in redteam_cases
                ],
                "prompt_category": request.prompt_category
            }

            from ai_summary import generate_evaluation_summary
            ai_sum = generate_evaluation_summary(eval_summary_data)
            db.save_ai_summary(eval_id, ai_sum)

            # ── Generate & Save Model Card ──
            try:
                eval_data_card = {
                    "model": request.model,
                    "provider": request.provider,
                    "pass_rate": pass_rate,
                    "health_score": health_score_val,
                    "total_tests": total_tests,
                    "passed_tests": passed,
                    "failed_tests": total_tests - passed,
                    "avg_scores": avg_scores,
                    "include_redteam": request.include_redteam,
                    "prompt_category": request.prompt_category,
                    "created_at": datetime.utcnow().isoformat(),
                    "dataset_filename": dataset_filename
                }
                card_md = generate_model_card(eval_data_card, ai_sum)
                db.save_model_card(eval_id, card_md)
            except Exception as card_exc:
                print(f"[Model Card] Generation failed: {card_exc}")
        except Exception as sum_exc:
            print(f"[Summary Engine] Blocking summary failed (non-fatal): {sum_exc}")

        # ── Alerts ──
        try:
            alert_payload = {
                "model":           request.model,
                "health_score":    report.get("health_score", 100),
                "pass_rate":       report.get("pass_rate", 100),
                "red_team_summary": report.get("red_team_summary", {}),
            }
            await asyncio.to_thread(send_evaluation_alert, alert_payload)
        except Exception as alert_exc:
            print(f"Alert delivery failed (non-fatal): {alert_exc}")

        return EvaluationResponse(
            status="completed",
            model=request.model,
            eval_id=eval_id,
            report=report,
            summary=summary,
        )
    except Exception as exc:
        try:
            db.update_evaluation(eval_id, {"status": "failed"})
        except Exception:
            pass
        raise HTTPException(status_code=500, detail=f"Evaluation failed: {str(exc)}")


@app.get("/evaluate", response_model=EvaluationResponse)
async def evaluate_get(
    model: str = Query(default="gpt-4o"),
    prompt_category: str = Query(default="all"),
    num_tests: int = Query(default=10, ge=1, le=100),
    include_redteam: bool = Query(default=True),
):
    request = EvaluateRequest(
        model=model,
        prompt_category=prompt_category,
        num_tests=num_tests,
        include_redteam=include_redteam,
    )
    return await evaluate(request)


# ─── Report endpoints (file-based, unchanged) ─────────────────────────────────

@app.get("/report/{model_name:path}", response_class=HTMLResponse)
async def get_report(model_name: str):
    safe_model = model_name.replace("/", "_").replace(":", "_")
    reports_dir = "./reports"
    pattern = os.path.join(reports_dir, f"report_{safe_model}_*.html")
    files = glob.glob(pattern)
    if not files:
        raise HTTPException(status_code=404, detail=f"No report found for model: {model_name}")
    latest = max(files, key=os.path.getctime)
    try:
        with open(latest, "r", encoding="utf-8") as f:
            content = f.read()
    except OSError as exc:
        raise HTTPException(status_code=500, detail=f"Failed to read report: {exc}")
    return HTMLResponse(content=content)


# ─── Results endpoint — DB first, file fallback ───────────────────────────────

@app.get("/results/{model_name:path}")
async def get_results_json(model_name: str):
    # 1️⃣  Try DB first
    try:
        row = db.get_evaluation_by_model(model_name)
        if row:
            # Re-shape to match the format the frontend expects
            return JSONResponse(content={
                "model":           row.get("model"),
                "status":          row.get("status"),
                "pass_rate":       row.get("pass_rate", 0),
                "health_score":    row.get("health_score", 0),
                "total_tests":     row.get("total_tests", 0),
                "passed_count":    row.get("passed_tests", 0),
                "failed_count":    row.get("failed_tests", 0),
                "avg_scores":      row.get("avg_scores", {}),
                "summary":         row.get("summary", ""),
                "timestamp":       row.get("created_at"),
                "test_cases": [
                    {
                        "id":          r.get("id"),
                        "prompt":      r.get("prompt", ""),
                        "category":    r.get("category", ""),
                        "passed":      r.get("result") == "pass",
                        "score":       r.get("score", 0),
                        "response":    r.get("response", ""),
                        "reasoning":   r.get("reasoning", ""),
                        "is_redteam":  bool(r.get("is_redteam", 0)),
                        "attack_type": r.get("attack_type", ""),
                    }
                    for r in row.get("results", [])
                ],
            })
    except Exception as db_exc:
        print(f"[DB] get_evaluation_by_model error: {db_exc}")

    # 2️⃣  Fall back to JSON report file
    safe_model = model_name.replace("/", "_").replace(":", "_")
    reports_dir = "./reports"
    pattern = os.path.join(reports_dir, f"report_{safe_model}_*.json")
    files = glob.glob(pattern)
    if not files:
        raise HTTPException(status_code=404, detail=f"No report found for model: {model_name}")
    latest = max(files, key=os.path.getctime)
    try:
        with open(latest, "r", encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=500, detail=f"Failed to read report: {exc}")
    return JSONResponse(content=data)


# ─── CSV Export ───────────────────────────────────────────────────────────────

@app.get("/export/csv/{model_name:path}")
async def export_csv(model_name: str):
    # Try DB first
    test_cases = []
    try:
        row = db.get_evaluation_by_model(model_name)
        if row:
            test_cases = row.get("results", [])
    except Exception:
        pass

    # Fall back to file
    if not test_cases:
        safe_model = model_name.replace("/", "_").replace(":", "_")
        reports_dir = "./reports"
        pattern = os.path.join(reports_dir, f"report_{safe_model}_*.json")
        files = glob.glob(pattern)
        if not files:
            raise HTTPException(status_code=404, detail=f"No results found for model: {model_name}")
        latest = max(files, key=os.path.getctime)
        try:
            with open(latest, "r", encoding="utf-8") as f:
                data = json.load(f)
            test_cases = data.get("test_cases", [])
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Failed to read results: {exc}")

    import io, csv
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Test ID", "Category", "Passed", "Score", "Failure Type", "Prompt", "Response"])
    for i, tc in enumerate(test_cases):
        writer.writerow([
            tc.get("id", i + 1),
            tc.get("category", ""),
            tc.get("passed", tc.get("result") == "pass"),
            tc.get("score", 0),
            tc.get("failure_type", tc.get("attack_type", "")),
            tc.get("prompt", ""),
            tc.get("response", ""),
        ])
    safe = model_name.replace("/", "_").replace(":", "_")
    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="criticai_{safe}_results.csv"'},
    )


# ─── Compare — DB first, file fallback ───────────────────────────────────────

@app.get("/compare")
async def compare_models(models: str = Query(..., description="Comma-separated model names")):
    model_list = [m.strip() for m in models.split(",") if m.strip()]
    if not model_list:
        raise HTTPException(status_code=400, detail="Please specify models parameter")

    comparison = {}
    reports_dir = "./reports"

    for m in model_list:
        # Try DB
        try:
            row = db.get_evaluation_by_model(m)
            if row:
                comparison[m] = {
                    "status":           "available",
                    "model":            m,
                    "health_score":     row.get("health_score", 0),
                    "pass_rate":        row.get("pass_rate", 0),
                    "total_tests":      row.get("total_tests", 0),
                    "passed_count":     row.get("passed_tests", 0),
                    "avg_scores":       row.get("avg_scores", {}),
                    "failure_breakdown": {},
                    "timestamp":        row.get("created_at", ""),
                }
                continue
        except Exception:
            pass

        # Fall back to file
        safe_model = m.replace("/", "_").replace(":", "_")
        pattern = os.path.join(reports_dir, f"report_{safe_model}_*.json")
        files = glob.glob(pattern)
        if not files:
            comparison[m] = {"status": "no_data", "model": m}
            continue
        latest = max(files, key=os.path.getctime)
        try:
            with open(latest, "r", encoding="utf-8") as f:
                data = json.load(f)
            comparison[m] = {
                "status":           "available",
                "model":            m,
                "health_score":     data.get("health_score", 0),
                "pass_rate":        data.get("pass_rate", 0),
                "total_tests":      data.get("total_tests", 0),
                "passed_count":     data.get("passed_count", 0),
                "avg_scores":       data.get("avg_scores", {}),
                "failure_breakdown": data.get("failure_breakdown", {}),
                "timestamp":        data.get("timestamp", ""),
            }
        except Exception:
            comparison[m] = {"status": "error", "model": m}

    return JSONResponse(content={"comparison": comparison, "models": model_list})


# ─── NEW: DB-backed endpoints ─────────────────────────────────────────────────

@app.get("/stats")
async def get_stats():
    """Dashboard stats from SQLite DB."""
    try:
        return JSONResponse(content=db.get_stats())
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/evaluations")
async def get_evaluations(limit: int = Query(default=50, ge=1, le=500)):
    """Paginated list of all evaluations from DB."""
    try:
        return JSONResponse(content=db.get_all_evaluations(limit=limit))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/evaluations/{eval_id}")
async def get_evaluation_detail(eval_id: str):
    """Full evaluation detail including test results."""
    try:
        row = db.get_evaluation(eval_id)
        if not row:
            raise HTTPException(status_code=404, detail="Evaluation not found")
        return JSONResponse(content=row)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.delete("/evaluations/{eval_id}")
async def delete_evaluation(eval_id: str):
    """Delete an evaluation and its test results from DB."""
    try:
        db.delete_evaluation(eval_id)
        return JSONResponse(content={"success": True, "id": eval_id})
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/leaderboard")
async def get_leaderboard():
    """Model leaderboard sorted by best pass rate."""
    try:
        return JSONResponse(content=db.get_leaderboard())
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


# ─── Rubrics ─────────────────────────────────────────────────────────────────

@app.post("/rubrics")
async def create_rubric(body: RubricBody):
    try:
        rubric_id = db.save_rubric({
            "name":           body.name,
            "domain":         body.domain,
            "criteria":       body.criteria,
            "pass_threshold": body.pass_threshold,
        })
        return JSONResponse(content={"id": rubric_id, **body.dict()})
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/rubrics")
async def list_rubrics():
    try:
        return JSONResponse(content=db.get_rubrics())
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.delete("/rubrics/{rubric_id}")
async def remove_rubric(rubric_id: str):
    try:
        db.delete_rubric(rubric_id)
        return JSONResponse(content={"success": True})
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


# ─── Provider endpoints (unchanged) ──────────────────────────────────────────

@app.get("/provider/status")
async def provider_status():
    groq_key   = os.environ.get("GROQ_API_KEY", "")
    gemini_key = os.environ.get("GEMINI_API_KEY", "") or os.environ.get("GOOGLE_API_KEY", "")
    ollama_url = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434")
    default_provider = os.environ.get("DEFAULT_PROVIDER", "groq")
    simulation_mode  = os.environ.get("CRITICAI_SIMULATION", "false").lower() == "true"
    return {
        "groq":   {"configured": bool(groq_key),   "key_preview": groq_key[:8] + "..."   if groq_key   else ""},
        "gemini": {"configured": bool(gemini_key),  "key_preview": gemini_key[:8] + "..." if gemini_key else ""},
        "ollama": {"configured": True, "base_url": ollama_url},
        "default_provider": default_provider,
        "simulation_mode":  simulation_mode,
    }


class ProviderTestRequest(BaseModel):
    api_key: str = Field(default="")
    base_url: str = Field(default="")


def _test_provider_with_key(provider: str, api_key: str, base_url: str) -> dict:
    env_keys = {"groq": "GROQ_API_KEY", "gemini": "GEMINI_API_KEY", "ollama": "OLLAMA_BASE_URL"}
    env_var  = env_keys.get(provider)
    original = os.environ.get(env_var, "") if env_var else ""
    try:
        if env_var and api_key:
            os.environ[env_var] = api_key
            if provider == "gemini":
                os.environ["GOOGLE_API_KEY"] = api_key
        if provider == "ollama" and base_url:
            os.environ["OLLAMA_BASE_URL"] = base_url
        lp = LLMProvider(preferred_provider=provider)
        return lp.test_connection(provider, api_key=api_key)
    finally:
        if env_var:
            if original:
                os.environ[env_var] = original
            else:
                os.environ.pop(env_var, None)


@app.post("/provider/test")
async def provider_test(
    provider: str = Query(...),
    body: ProviderTestRequest = ProviderTestRequest(),
):
    if provider not in ("groq", "gemini", "ollama"):
        raise HTTPException(status_code=400, detail="provider must be groq, gemini, or ollama")
    result = await asyncio.to_thread(_test_provider_with_key, provider, body.api_key, body.base_url)
    return result


class SaveKeyRequest(BaseModel):
    provider: str
    api_key: str
    base_url: str = ""


@app.post("/provider/save-key")
async def save_provider_key(body: SaveKeyRequest):
    env_map = {"groq": "GROQ_API_KEY", "gemini": "GEMINI_API_KEY", "ollama": "OLLAMA_BASE_URL"}
    if body.provider not in env_map:
        raise HTTPException(status_code=400, detail="Unknown provider")

    env_var   = env_map[body.provider]
    new_value = body.base_url if body.provider == "ollama" else body.api_key
    if not new_value:
        raise HTTPException(status_code=400, detail="api_key must not be empty")

    env_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env")
    lines = []
    if os.path.exists(env_path):
        with open(env_path, "r", encoding="utf-8") as f:
            lines = f.readlines()

    updated = False
    for i, line in enumerate(lines):
        if line.strip().startswith(f"{env_var}="):
            lines[i] = f"{env_var}={new_value}\n"
            updated = True
            break
    if not updated:
        lines.append(f"{env_var}={new_value}\n")
        if body.provider == "gemini":
            if not any(l.strip().startswith("GOOGLE_API_KEY=") for l in lines):
                lines.append(f"GOOGLE_API_KEY={new_value}\n")
            else:
                for i, line in enumerate(lines):
                    if line.strip().startswith("GOOGLE_API_KEY="):
                        lines[i] = f"GOOGLE_API_KEY={new_value}\n"

    with open(env_path, "w", encoding="utf-8") as f:
        f.writelines(lines)

    os.environ[env_var] = new_value
    if body.provider == "gemini":
        os.environ["GOOGLE_API_KEY"] = new_value

    return {"ok": True, "message": f"{env_var} saved to .env and applied immediately."}


@app.get("/models")
async def list_free_models():
    return {
        "groq":   {"models": GROQ_MODELS,   "free": True, "signup_url": "https://console.groq.com"},
        "gemini": {"models": GEMINI_MODELS,  "free": True, "signup_url": "https://aistudio.google.com"},
        "ollama": {"models": OLLAMA_MODELS,  "free": True, "signup_url": "https://ollama.com"},
    }


# ─── Alert endpoints (unchanged) ─────────────────────────────────────────────

class AlertWebhookRequest(BaseModel):
    slack_url:   str = Field(default="")
    discord_url: str = Field(default="")
    threshold:   int = Field(default=50, ge=0, le=100)


@app.post("/alerts/test")
async def test_alerts(body: AlertWebhookRequest):
    result = await asyncio.to_thread(
        send_test_alert,
        body.slack_url  or os.environ.get("SLACK_WEBHOOK_URL", ""),
        body.discord_url or os.environ.get("DISCORD_WEBHOOK_URL", ""),
    )
    any_ok = any(v.get("ok") for v in result.values())
    return {"ok": any_ok, "results": result}


@app.post("/alerts/save")
async def save_alert_config(body: AlertWebhookRequest):
    env_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env")
    lines = []
    if os.path.exists(env_path):
        with open(env_path, "r", encoding="utf-8") as f:
            lines = f.readlines()

    updates = {}
    if body.slack_url:   updates["SLACK_WEBHOOK_URL"]   = body.slack_url
    if body.discord_url: updates["DISCORD_WEBHOOK_URL"]  = body.discord_url
    updates["ALERT_THRESHOLD"] = str(body.threshold)

    for key, value in updates.items():
        found = False
        for i, line in enumerate(lines):
            if line.strip().startswith(f"{key}="):
                lines[i] = f"{key}={value}\n"
                found = True
                break
        if not found:
            lines.append(f"{key}={value}\n")
        os.environ[key] = value

    with open(env_path, "w", encoding="utf-8") as f:
        f.writelines(lines)

    return {"ok": True, "message": "Alert configuration saved to .env"}


# ─── Playground endpoints ─────────────────────────────────────────────────────

class PlaygroundChatRequest(BaseModel):
    prompt: str
    model: str = "llama-3.1-70b-versatile"
    provider: str = "groq"
    temperature: float = 0.7
    system_prompt: str = "You are a helpful assistant."


class PlaygroundEvaluateRequest(BaseModel):
    prompt: str
    response: str
    model: str
    category: str = "general"


def run_playground_judge(prompt: str, response_text: str, category: str) -> dict:
    judge_prompt = f"""Evaluate this AI response strictly.

Original Question: {prompt[:1000]}
Category: {category}
AI Response: {response_text[:2000]}

Return ONLY valid JSON in this exact structure:
{{
  "score": 85,
  "result": "pass",
  "reasoning": "Explain in 2-3 sentences.",
  "strengths": ["strength 1", "strength 2"],
  "weaknesses": ["weakness 1", "weakness 2"],
  "grade": "A"
}}

Rules: score>70=pass, 50-70=partial, below 50=fail"""

    # 1. Try Groq
    api_key = os.environ.get("GROQ_API_KEY", "")
    if api_key:
        try:
            from groq import Groq
            client = Groq(api_key=api_key)
            resp = client.chat.completions.create(
                model="gemma2-9b-it",
                messages=[
                    {"role": "system", "content": "You are an expert AI evaluator."},
                    {"role": "user", "content": judge_prompt}
                ],
                max_tokens=400,
                temperature=0.1,
            )
            raw = resp.choices[0].message.content.strip()
            raw = raw.replace("```json", "").replace("```", "").strip()
            return json.loads(raw)
        except Exception as e:
            print(f"Groq judge failed: {e}")

    # 2. Try Gemini
    gemini_key = os.environ.get("GEMINI_API_KEY", "") or os.environ.get("GOOGLE_API_KEY", "")
    if gemini_key:
        try:
            import httpx
            url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={gemini_key}"
            body = {
                "contents": [{"parts": [{"text": judge_prompt}]}],
                "systemInstruction": {"parts": [{"text": "You are an expert AI evaluator."}]},
                "generationConfig": {"temperature": 0.1}
            }
            resp = httpx.post(url, json=body, timeout=15)
            if resp.status_code == 200:
                raw = resp.json()["candidates"][0]["content"]["parts"][0]["text"].strip()
                raw = raw.replace("```json", "").replace("```", "").strip()
                return json.loads(raw)
        except Exception as e:
            print(f"Gemini judge failed: {e}")

    # 3. Simulation fallback
    score = random.randint(55, 95)
    result = "pass" if score > 70 else ("partial" if score >= 50 else "fail")
    grade = "A" if score >= 90 else ("B" if score >= 80 else ("C" if score >= 70 else ("D" if score >= 50 else "F")))
    return {
        "score": score,
        "result": result,
        "reasoning": f"[Simulation Mode] The response was evaluated under category '{category}'. It demonstrates acceptable clarity and correctness.",
        "strengths": ["Clear organization of points", "Directly addresses the user prompt"],
        "weaknesses": ["Minor room for elaboration on technical edge cases"],
        "grade": grade
    }


@app.post("/playground/chat")
async def playground_chat(request: PlaygroundChatRequest):
    async def chat_generator():
        p = request.provider.lower()
        m = request.model
        temp = request.temperature
        sys_p = request.system_prompt
        prompt = request.prompt

        full_response = ""

        if p == "groq":
            api_key = os.environ.get("GROQ_API_KEY", "")
            if not api_key:
                yield f"data: {json.dumps({'type': 'error', 'message': 'GROQ_API_KEY is not set. Get a free key at console.groq.com'})}\n\n"
                return
            try:
                from groq import AsyncGroq
                client = AsyncGroq(api_key=api_key)
                messages = []
                if sys_p:
                    messages.append({"role": "system", "content": sys_p})
                messages.append({"role": "user", "content": prompt})

                stream = await client.chat.completions.create(
                    model=m,
                    messages=messages,
                    temperature=temp,
                    stream=True,
                )
                async for chunk in stream:
                    token = chunk.choices[0].delta.content or ""
                    if token:
                        full_response += token
                        yield f"data: {json.dumps({'type': 'token', 'content': token})}\n\n"
                        await asyncio.sleep(0.005)
                yield f"data: {json.dumps({'type': 'done', 'full_response': full_response})}\n\n"
            except Exception as e:
                err_msg = str(e)
                if "rate_limit" in err_msg.lower() or "429" in err_msg:
                    err_msg = "Rate limit hit. Try Gemini or wait 1 minute."
                yield f"data: {json.dumps({'type': 'error', 'message': f'Groq error: {err_msg}'})}\n\n"

        elif p == "gemini":
            api_key = os.environ.get("GEMINI_API_KEY", "") or os.environ.get("GOOGLE_API_KEY", "")
            if not api_key:
                yield f"data: {json.dumps({'type': 'error', 'message': 'GEMINI_API_KEY is not set. Get a free key at aistudio.google.com'})}\n\n"
                return
            try:
                import httpx
                model_name = m
                if not model_name.startswith("models/"):
                    model_name = f"models/{model_name}"

                url = f"https://generativelanguage.googleapis.com/v1beta/{model_name}:streamGenerateContent?alt=sse&key={api_key}"
                body = {
                    "contents": [{"parts": [{"text": prompt}]}],
                    "generationConfig": {"temperature": temp}
                }
                if sys_p:
                    body["systemInstruction"] = {"parts": [{"text": sys_p}]}

                async with httpx.AsyncClient() as client:
                    async with client.stream("POST", url, json=body, timeout=60.0) as response:
                        if response.status_code != 200:
                            err_txt = await response.aread()
                            try:
                                err_json = json.loads(err_txt)
                                msg = err_json["error"]["message"]
                            except Exception:
                                msg = f"Gemini stream HTTP {response.status_code}"
                            if "rate limit" in msg.lower() or "429" in msg:
                                msg = "Rate limit hit. Try Groq or wait 1 minute."
                            yield f"data: {json.dumps({'type': 'error', 'message': msg})}\n\n"
                            return

                        async for line in response.aiter_lines():
                            if line.startswith("data: "):
                                try:
                                    payload = json.loads(line[6:])
                                    token = payload["candidates"][0]["content"]["parts"][0]["text"]
                                    if token:
                                        full_response += token
                                        yield f"data: {json.dumps({'type': 'token', 'content': token})}\n\n"
                                except Exception:
                                    pass
                yield f"data: {json.dumps({'type': 'done', 'full_response': full_response})}\n\n"
            except Exception as e:
                yield f"data: {json.dumps({'type': 'error', 'message': f'Gemini error: {str(e)}'})}\n\n"

        elif p == "ollama":
            import httpx
            base_url = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434")
            try:
                async with httpx.AsyncClient() as client:
                    async with client.stream(
                        "POST",
                        f"{base_url}/api/generate",
                        json={
                            "model": m,
                            "prompt": prompt,
                            "system": sys_p,
                            "options": {"temperature": temp},
                            "stream": True
                        },
                        timeout=60.0
                    ) as response:
                        if response.status_code != 200:
                            yield f"data: {json.dumps({'type': 'error', 'message': f'Ollama status {response.status_code}'})}\n\n"
                            return
                        async for line in response.aiter_lines():
                            if line:
                                try:
                                    data = json.loads(line)
                                    token = data.get("response", "")
                                    if token:
                                        full_response += token
                                        yield f"data: {json.dumps({'type': 'token', 'content': token})}\n\n"
                                    if data.get("done"):
                                        break
                                except Exception:
                                    pass
                yield f"data: {json.dumps({'type': 'done', 'full_response': full_response})}\n\n"
            except Exception:
                yield f"data: {json.dumps({'type': 'error', 'message': 'Ollama not detected. Install from ollama.com for local models'})}\n\n"

        else:
            # Simulation fallback
            import random
            words = _simulate_response(prompt).split()
            for w in words:
                full_response += w + " "
                yield f"data: {json.dumps({'type': 'token', 'content': w + ' '})}\n\n"
                await asyncio.sleep(0.05)
            yield f"data: {json.dumps({'type': 'done', 'full_response': full_response.strip()})}\n\n"

    return StreamingResponse(
        chat_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


@app.post("/playground/evaluate")
async def playground_evaluate(request: PlaygroundEvaluateRequest):
    try:
        res = await asyncio.to_thread(
            run_playground_judge,
            request.prompt,
            request.response,
            request.category
        )
        # Save to DB
        db.save_playground_evaluation({
            "prompt": request.prompt,
            "response": request.response,
            "model": request.model,
            "category": request.category,
            "score": res.get("score", 0),
            "result": res.get("result", "fail"),
            "reasoning": res.get("reasoning", ""),
            "strengths": res.get("strengths", []),
            "weaknesses": res.get("weaknesses", []),
            "grade": res.get("grade", "F")
        })
        return JSONResponse(content=res)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Evaluation failed: {str(exc)}")


@app.get("/playground/history")
async def get_playground_history():
    try:
        history = db.get_playground_history(limit=20)
        formatted = []
        for h in history:
            prompt_preview = h["prompt"][:80] + "..." if len(h["prompt"]) > 80 else h["prompt"]
            formatted.append({
                "id": h["id"],
                "prompt_preview": prompt_preview,
                "prompt": h["prompt"],
                "response": h["response"],
                "model": h["model"],
                "category": h["category"],
                "score": h["score"],
                "result": h["result"],
                "reasoning": h["reasoning"],
                "strengths": h["strengths"],
                "weaknesses": h["weaknesses"],
                "grade": h["grade"],
                "created_at": h["created_at"]
            })
        return JSONResponse(content=formatted)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.delete("/playground/history")
async def clear_playground_history():
    try:
        db.clear_all_playground_history()
        return {"success": True}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.delete("/playground/history/{id}")
async def delete_playground_history_entry(id: int):
    try:
        db.delete_playground_history(id)
        return {"success": True}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


# ─── AI Summary Endpoints ─────────────────────────────────────────────────────

@app.get("/summary/model/{model_name:path}")
async def get_model_summary(model_name: str):
    """Fetch AI summary for the latest completed evaluation of a model."""
    try:
        row = db.get_evaluation_by_model(model_name)
        if not row:
            raise HTTPException(status_code=404, detail=f"No evaluations found for model: {model_name}")

        eval_id = row["id"]
        summary = db.get_ai_summary(eval_id)
        if summary:
            return JSONResponse(content=summary)

        # Generate if missing
        test_results = row.get("results", [])
        redteam_results = [
            {"prompt": r.get("prompt", ""), "result": r.get("result", "fail")}
            for r in test_results if r.get("is_redteam", 0) == 1
        ]

        from ai_summary import generate_evaluation_summary
        eval_summary_data = {
            "model":           row.get("model"),
            "pass_rate":        row.get("pass_rate", 0.0),
            "health_score":    row.get("health_score", 0.0),
            "total_tests":     row.get("total_tests", 0),
            "passed_tests":    row.get("passed_tests", 0),
            "failed_tests":    row.get("failed_tests", 0),
            "avg_scores":      row.get("avg_scores", {}),
            "include_redteam": row.get("include_redteam", 0) == 1,
            "redteam_results": redteam_results,
            "prompt_category": row.get("prompt_category", "all")
        }

        summary = generate_evaluation_summary(eval_summary_data)
        db.save_ai_summary(eval_id, summary)
        return JSONResponse(content=summary)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/summary/{eval_id}")
async def get_eval_summary(eval_id: str):
    """Fetch AI summary for an evaluation. Generates if missing."""
    try:
        summary = db.get_ai_summary(eval_id)
        if summary:
            return JSONResponse(content=summary)

        # Generate new summary from DB records
        row = db.get_evaluation(eval_id)
        if not row:
            raise HTTPException(status_code=404, detail="Evaluation not found")

        # Get redteam results if included
        test_results = row.get("results", [])
        redteam_results = [
            {"prompt": r.get("prompt", ""), "result": r.get("result", "fail")}
            for r in test_results if r.get("is_redteam", 0) == 1
        ]

        from ai_summary import generate_evaluation_summary
        eval_summary_data = {
            "model":           row.get("model"),
            "pass_rate":        row.get("pass_rate", 0.0),
            "health_score":    row.get("health_score", 0.0),
            "total_tests":     row.get("total_tests", 0),
            "passed_tests":    row.get("passed_tests", 0),
            "failed_tests":    row.get("failed_tests", 0),
            "avg_scores":      row.get("avg_scores", {}),
            "include_redteam": row.get("include_redteam", 0) == 1,
            "redteam_results": redteam_results,
            "prompt_category": row.get("prompt_category", "all")
        }

        summary = generate_evaluation_summary(eval_summary_data)
        db.save_ai_summary(eval_id, summary)
        return JSONResponse(content=summary)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/summary/regenerate/{eval_id}")
async def regenerate_eval_summary(eval_id: str):
    """Force regenerate AI summary for a given evaluation."""
    try:
        row = db.get_evaluation(eval_id)
        if not row:
            raise HTTPException(status_code=404, detail="Evaluation not found")

        test_results = row.get("results", [])
        redteam_results = [
            {"prompt": r.get("prompt", ""), "result": r.get("result", "fail")}
            for r in test_results if r.get("is_redteam", 0) == 1
        ]

        from ai_summary import generate_evaluation_summary
        eval_summary_data = {
            "model":           row.get("model"),
            "pass_rate":        row.get("pass_rate", 0.0),
            "health_score":    row.get("health_score", 0.0),
            "total_tests":     row.get("total_tests", 0),
            "passed_tests":    row.get("passed_tests", 0),
            "failed_tests":    row.get("failed_tests", 0),
            "avg_scores":      row.get("avg_scores", {}),
            "include_redteam": row.get("include_redteam", 0) == 1,
            "redteam_results": redteam_results,
            "prompt_category": row.get("prompt_category", "all")
        }

        summary = generate_evaluation_summary(eval_summary_data)
        db.save_ai_summary(eval_id, summary)
        return JSONResponse(content=summary)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


# ─── Dataset Upload Endpoints ──────────────────────────────────────────────────

dataset_sessions = {}

def _cleanup_dataset_sessions():
    now = time.time()
    expired = [sid for sid, s in list(dataset_sessions.items())
               if now - s.get('created_timestamp', 0) > 3600]
    for sid in expired:
        dataset_sessions.pop(sid, None)

@app.post("/dataset/upload")
async def upload_dataset(
    file: UploadFile = File(...),
    prompt_col_hint: Optional[str] = Form(None)
):
    _cleanup_dataset_sessions()
    
    filename = file.filename
    content_bytes = await file.read()
    
    # 2MB Limit
    if len(content_bytes) > 2 * 1024 * 1024:
        return JSONResponse(status_code=400, content={
            "valid": False,
            "errors": ["File size exceeds the 2MB limit."],
            "warnings": []
        })
        
    try:
        file_content = content_bytes.decode("utf-8")
    except UnicodeDecodeError:
        try:
            file_content = content_bytes.decode("latin-1")
        except Exception:
            return JSONResponse(status_code=400, content={
                "valid": False,
                "errors": ["Failed to decode file. Please upload a valid UTF-8 or Latin-1 text file."],
                "warnings": []
            })
            
    ext = os.path.splitext(filename)[1].lower()
    
    if ext == '.csv':
        parsed = parse_csv_dataset(file_content, prompt_col_hint)
    elif ext == '.json':
        parsed = parse_json_dataset(file_content, prompt_col_hint)
    elif ext == '.txt':
        # Text file is parsed as Format 3 (array of strings, line-by-line)
        lines = [line.strip() for line in file_content.split('\n') if line.strip()]
        parsed = {
            'prompts': [{'prompt': l, 'category': 'custom', 'expected_answer': None} for l in lines],
            'total': len(lines),
            'detected_columns': {'prompt_col': 'Line', 'category_col': None, 'answer_col': None},
            'errors': []
        }
    else:
        return JSONResponse(status_code=400, content={
            "valid": False,
            "errors": [f"Unsupported file format '{ext}'. Only .csv, .json, and .txt are supported."],
            "warnings": []
        })
        
    validated = validate_dataset(parsed)
    if not validated['valid']:
        return JSONResponse(status_code=400, content={
            "valid": False,
            "errors": validated['errors'],
            "warnings": validated['warnings']
        })
        
    session_id = str(uuid.uuid4())
    cleaned_prompts = validated['cleaned_prompts']
    
    dataset_sessions[session_id] = {
        'prompts': cleaned_prompts,
        'uploaded_at': datetime.now().isoformat(),
        'created_timestamp': time.time(),
        'filename': filename,
        'total': len(cleaned_prompts),
        'detected_columns': parsed['detected_columns']
    }
    
    # Auto-expiration thread timer
    threading.Timer(3600, lambda: dataset_sessions.pop(session_id, None)).start()
    
    return {
        'session_id': session_id,
        'filename': filename,
        'total_prompts': len(cleaned_prompts),
        'detected_columns': parsed['detected_columns'],
        'preview': cleaned_prompts[:5],
        'warnings': validated['warnings'],
        'valid': True
    }


@app.get("/dataset/preview/{session_id}")
async def get_dataset_preview(session_id: str):
    _cleanup_dataset_sessions()
    session = dataset_sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Dataset session expired or not found")
    return session


@app.delete("/dataset/session/{session_id}")
async def delete_dataset_session(session_id: str):
    session = dataset_sessions.pop(session_id, None)
    if not session:
        raise HTTPException(status_code=404, detail="Dataset session not found")
    return {"success": True}


# ─── Model Card Endpoints ──────────────────────────────────────────────────────

@app.get("/model-card/model/{model_name:path}")
async def get_model_card_by_model_name(model_name: str):
    try:
        row = db.get_evaluation_by_model(model_name)
        if not row:
            raise HTTPException(status_code=404, detail=f"No completed evaluations found for model '{model_name}'")
        
        eval_id = row["id"]
        card_md = db.get_model_card(eval_id)
        if not card_md:
            ai_sum = db.get_ai_summary(eval_id)
            card_md = generate_model_card(row, ai_sum)
            db.save_model_card(eval_id, card_md)
            
        return Response(
            content=card_md,
            media_type="text/markdown; charset=utf-8",
            headers={
                "X-Eval-Id": eval_id
            }
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/model-card/{eval_id}")
async def get_model_card(eval_id: str):
    try:
        card_md = db.get_model_card(eval_id)
        if not card_md:
            row = db.get_evaluation(eval_id)
            if not row:
                raise HTTPException(status_code=404, detail="Evaluation not found")
            ai_sum = db.get_ai_summary(eval_id)
            card_md = generate_model_card(row, ai_sum)
            db.save_model_card(eval_id, card_md)
        
        model_name = "model"
        row = db.get_evaluation(eval_id)
        if row:
            model_name = row.get("model", "model")
            
        return Response(
            content=card_md,
            media_type="text/markdown; charset=utf-8",
            headers={
                "Content-Disposition": f'attachment; filename="{model_name}_card.md"',
                "X-Eval-Id": eval_id
            }
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/model-card/regenerate/{eval_id}")
async def regenerate_model_card_endpoint(eval_id: str):
    try:
        row = db.get_evaluation(eval_id)
        if not row:
            raise HTTPException(status_code=404, detail="Evaluation not found")
        
        ai_sum = db.get_ai_summary(eval_id)
        card_md = generate_model_card(row, ai_sum)
        db.save_model_card(eval_id, card_md)
        
        return Response(
            content=card_md,
            media_type="text/markdown; charset=utf-8"
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


# ─── A/B Testing ───────────────────────────────────────────────────────────────────────

@app.post("/ab-test/stream")
async def ab_test_stream(request: ABTestRequest):
    """
    SSE streaming endpoint for A/B Model Comparison.
    Runs the same prompts against two models SEQUENTIALLY and
    emits progress events in real-time via Server-Sent Events.
    """
    from ab_tester import ABTester

    event_queue: asyncio.Queue = asyncio.Queue()
    loop = asyncio.get_event_loop()

    # Resolve custom dataset if a session_id was provided
    custom_prompts = request.custom_prompts
    if request.dataset_session_id:
        session = dataset_sessions.pop(request.dataset_session_id, None)
        if session:
            custom_prompts = session.get("prompts", [])
            request.num_tests = len(custom_prompts)

    # Save initial A/B test row
    ab_id = db.save_ab_test({
        "model_a":         request.model_a,
        "model_b":         request.model_b,
        "provider_a":      request.provider_a,
        "provider_b":      request.provider_b,
        "prompt_category": request.prompt_category,
        "num_tests":       request.num_tests,
    })

    def progress_callback(stage: str, message: str, data: dict = None):
        payload = json.dumps({
            "stage": stage,
            "message": message,
            "ab_id": ab_id,
            **(data or {}),
        })
        loop.call_soon_threadsafe(event_queue.put_nowait, payload)

    def run_ab_test():
        try:
            tester = ABTester(
                model_a=request.model_a,
                model_b=request.model_b,
                provider_a=request.provider_a,
                provider_b=request.provider_b,
                progress_callback=progress_callback,
            )
            summary = tester.run(
                category=request.prompt_category,
                num_tests=request.num_tests,
                custom_prompts=custom_prompts,
            )

            # Persist to DB
            try:
                db.update_ab_test(ab_id, {
                    "status":         "completed",
                    "wins_a":         summary.get("wins_a", 0),
                    "wins_b":         summary.get("wins_b", 0),
                    "ties":           summary.get("ties", 0),
                    "avg_score_a":    summary.get("avg_score_a", 0),
                    "avg_score_b":    summary.get("avg_score_b", 0),
                    "overall_winner": summary.get("overall_winner", "tie"),
                    "winner_name":    summary.get("winner_name", ""),
                    "results":        summary.get("test_results", []),
                })
            except Exception as db_exc:
                print(f"[DB] AB test save error (non-fatal): {db_exc}")

            loop.call_soon_threadsafe(
                event_queue.put_nowait,
                json.dumps({
                    "stage": "ab_complete",
                    "message": f"🏆 A/B Test complete! Winner: {summary.get('winner_name', 'Tie')}",
                    "ab_id": ab_id,
                    "summary": summary,
                }),
            )
        except Exception as exc:
            try:
                db.update_ab_test(ab_id, {"status": "failed"})
            except Exception:
                pass
            loop.call_soon_threadsafe(
                event_queue.put_nowait,
                json.dumps({"stage": "ab_error", "message": str(exc), "ab_id": ab_id}),
            )
        finally:
            loop.call_soon_threadsafe(event_queue.put_nowait, None)

    async def event_generator() -> AsyncGenerator[str, None]:
        thread = threading.Thread(target=run_ab_test, daemon=True)
        thread.start()
        try:
            while True:
                payload = await event_queue.get()
                if payload is None:
                    break
                yield f"data: {payload}\n\n"
        except asyncio.CancelledError:
            pass

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


@app.get("/ab-tests")
async def list_ab_tests(limit: int = Query(default=50, ge=1, le=200)):
    """Return a list of all A/B test sessions (newest first, no results payload)."""
    try:
        return db.get_all_ab_tests(limit)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/ab-test/{ab_id}")
async def get_ab_test(ab_id: str):
    """Return full A/B test details including per-test results."""
    try:
        row = db.get_ab_test(ab_id)
        if not row:
            raise HTTPException(status_code=404, detail="A/B test not found")
        return row
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


# ─── Evaluation Templates Endpoints ──────────────────────────────────────────

@app.get("/templates")
async def list_templates(category: Optional[str] = Query(default=None), search: Optional[str] = Query(default=None)):
    """
    Returns all templates (built-in + custom).
    Optional query params: category, search.
    """
    try:
        all_t = get_all_templates(db)
        if category and category.lower() != "all":
            all_t = [t for t in all_t if t.get("category", "").lower() == category.lower()]
        if search and search.strip():
            q = search.strip().lower()
            all_t = [
                t for t in all_t
                if q in t.get("name", "").lower()
                or q in t.get("description", "").lower()
                or any(q in tag.lower() for tag in t.get("tags", []))
            ]
        return all_t
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/templates/{template_id}")
async def get_template(template_id: str):
    """Returns details for a specific template (built-in or custom)."""
    t = get_template_by_id(template_id, db)
    if not t:
        raise HTTPException(status_code=404, detail="Template not found")
    return t


@app.post("/templates/custom")
async def create_custom_template(template_data: dict):
    """
    Creates a new custom template.
    Validates min 3 prompts, max 50 prompts.
    """
    prompts = template_data.get("prompts", [])
    if not isinstance(prompts, list) or len(prompts) < 3:
        raise HTTPException(status_code=400, detail="Custom template requires at least 3 prompts.")
    if len(prompts) > 50:
        raise HTTPException(status_code=400, detail="Maximum 50 prompts allowed per template.")
        
    try:
        t_id = db.save_custom_template(template_data)
        saved = get_template_by_id(t_id, db)
        return saved
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.delete("/templates/custom/{template_id}")
async def delete_custom_template(template_id: str):
    """Deletes a custom template (not built-in)."""
    if not template_id.startswith("custom-"):
        raise HTTPException(status_code=400, detail="Cannot delete built-in templates.")
    try:
        db.delete_custom_template(template_id)
        return {"status": "success", "message": f"Template {template_id} deleted"}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/templates/{template_id}/use")
async def use_template(template_id: str):
    """
    Increments template usage counter and returns config.
    """
    t = get_template_by_id(template_id, db)
    if not t:
        raise HTTPException(status_code=404, detail="Template not found")
    try:
        if template_id.startswith("custom-"):
            db.increment_template_usage(template_id)
        return {"status": "success", "template": t}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


# ─── Usage Tracker Endpoints ──────────────────────────────────────────────────

@app.get("/usage/stats")
async def get_usage_stats():
    """Returns real-time session usage stats and provider limits."""
    try:
        return tracker.get_usage_stats()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/usage/history")
async def get_usage_history(days: int = Query(default=7, ge=1, le=30)):
    """Returns 7-day usage history from SQLite db."""
    try:
        return db.get_usage_by_day(days=days)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/usage/limits")
async def get_usage_limits():
    """Returns static PROVIDER_LIMITS constant."""
    return PROVIDER_LIMITS


@app.get("/usage/log")
async def get_usage_logs(limit: int = Query(default=50, ge=1, le=200), offset: int = Query(default=0, ge=0)):
    """Returns recent entries from api_usage_log table."""
    try:
        return db.get_recent_api_logs(limit=limit, offset=offset)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/usage/warnings")
async def get_usage_warnings():
    """Returns list of active warnings when any provider >70% or >90% used."""
    try:
        return tracker.get_warnings()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


# ─── Regression Tracker Endpoints ─────────────────────────────────────────────

@app.get("/regression/alerts")
async def get_regression_alerts():
    """Returns list of models that have triggered a critical regression alert."""
    try:
        all_evals = db.get_all_evaluations(limit=200)
        all_models_reg = get_all_models_regression(all_evals)
        alerted = [m for m in all_models_reg if m.get("trend_analysis", {}).get("alert") is True]
        return alerted
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/regression")
async def get_all_regression():
    """Returns regression trend analysis for all models with evaluations."""
    try:
        all_evals = db.get_all_evaluations(limit=200)
        return get_all_models_regression(all_evals)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/regression/{model_name:path}")
async def get_model_regression(model_name: str):
    """Returns detailed regression trend and time series for a single model."""
    try:
        history = db.get_model_eval_history(model_name, limit=50)
        if not history:
            raise HTTPException(status_code=404, detail=f"No evaluation history found for model '{model_name}'")
        return detect_regression(model_name, history)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


# ─── Batch Queue Endpoints ───────────────────────────────────────────────────

def run_single_batch_eval(model: str, prompt_category: str = "all", num_tests: int = 10, include_redteam: bool = False, provider: str = "groq") -> dict:
    """Helper used by BatchQueueManager to run an evaluation synchronously."""
    p_clean = (provider or "groq").lower()
    
    eval_id = db.save_evaluation({
        "model": model,
        "provider": p_clean,
        "prompt_category": prompt_category,
        "num_tests": num_tests,
        "include_redteam": include_redteam,
    })

    orchestrator = CriticAIOrchestrator(model_name=model, provider=p_clean)
    result = orchestrator.run(
        category=prompt_category,
        num_tests=num_tests,
        include_redteam=include_redteam,
        custom_prompts=None,
    )
    report = result.get("report", {})
    summary = report.get("summary", "Batch evaluation complete")

    health_score_obj = report.get("health_score", {})
    if not isinstance(health_score_obj, dict):
        health_score_obj = {}

    health_score_val = float(health_score_obj.get("overall", 0))
    pass_rate = float(health_score_obj.get("pass_rate", 0))
    total_tests = int(report.get("total_tests", num_tests))
    passed = int(report.get("passed_tests", 0))

    avg_scores = {
        "hallucination": health_score_obj.get("hallucination_avg", 0),
        "toxicity": health_score_obj.get("toxicity_avg", 0),
        "relevance": health_score_obj.get("relevance_avg", 0),
        "coherence": health_score_obj.get("coherence_avg", 0),
        "instruction_following": health_score_obj.get("instruction_following_avg", 0),
    }

    db.update_evaluation(eval_id, {
        "status": "completed",
        "pass_rate": pass_rate,
        "health_score": health_score_val,
        "total_tests": total_tests,
        "passed_tests": passed,
        "failed_tests": total_tests - passed,
        "avg_scores": avg_scores,
        "summary": summary,
    })

    detailed_results = report.get("detailed_results", [])
    if detailed_results:
        db.save_test_results(eval_id, [
            {
                "prompt": tc.get("prompt", tc.get("test_id", "")),
                "category": tc.get("category", ""),
                "result": "pass" if tc.get("passed") else "fail",
                "score": float(tc.get("scores", {}).get("relevance", 0.8) if isinstance(tc.get("scores"), dict) else 0.8),
                "details": f"Model: {model} | Response: {tc.get('model_response', '')[:200]}"
            }
            for tc in detailed_results
        ])

    prompts_text = " ".join([tc.get("prompt", "") for tc in detailed_results])
    responses_text = " ".join([tc.get("model_response", "") for tc in detailed_results])
    track_api_usage(p_clean, model, prompts_text, responses_text, "evaluation", eval_id)

    return {
        "eval_id": eval_id,
        "pass_rate": pass_rate,
        "health_score": health_score_val,
        "summary": summary,
    }


@app.post("/batch/create")
async def create_batch(request: CreateBatchRequest):
    """
    Creates a new batch session with 2 to 10 jobs.
    Validates duplicate models in the same batch.
    """
    if len(request.jobs) < 2:
        raise HTTPException(status_code=400, detail="Batch queue requires at least 2 models")
    if len(request.jobs) > 10:
        raise HTTPException(status_code=400, detail="Batch queue maximum limit is 10 models")

    seen_models = set()
    for job_req in request.jobs:
        m = job_req.model.strip()
        if not m:
            raise HTTPException(status_code=400, detail="Model name cannot be empty")
        if m in seen_models:
            raise HTTPException(status_code=400, detail=f"Duplicate model '{m}' in batch queue. Each model in a batch must be unique.")
        seen_models.add(m)

    session = batch_manager.create_session()
    for job_req in request.jobs:
        session.add_job(
            model=job_req.model.strip(),
            prompt_category=job_req.prompt_category,
            num_tests=job_req.num_tests,
            include_redteam=job_req.include_redteam,
        )

    session_dict = session.to_dict()
    db.save_batch_session(session_dict)

    return {
        "session_id": session.session_id,
        "total_jobs": session.total_jobs,
        "jobs": session_dict["jobs"],
        "message": f"Batch created with {session.total_jobs} models. Call /batch/{session.session_id}/start to begin execution."
    }


@app.post("/batch/{session_id}/start")
async def start_batch(session_id: str):
    """
    Starts running a batch session in a background thread and streams progress via SSE.
    """
    session = batch_manager.get_session(session_id)
    if not session:
        db_sess = db.get_batch_session(session_id)
        if not db_sess:
            raise HTTPException(status_code=404, detail="Batch session not found")

    async def event_generator():
        event_queue = asyncio.Queue()
        loop = asyncio.get_running_loop()

        def sync_callback(evt: dict):
            loop.call_soon_threadsafe(event_queue.put_nowait, evt)

        task = asyncio.create_task(
            asyncio.to_thread(
                batch_manager.run_session,
                session_id,
                run_single_batch_eval,
                sync_callback,
                3
            )
        )

        while True:
            try:
                evt = await asyncio.wait_for(event_queue.get(), timeout=1.0)
                yield f"data: {json.dumps(evt)}\n\n"

                sess = batch_manager.get_session(session_id)
                if sess:
                    db.save_batch_session(sess.to_dict())

                if evt.get("type") == "batch_complete":
                    break
            except asyncio.TimeoutError:
                if task.done() and event_queue.empty():
                    break
                await asyncio.sleep(0.1)

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@app.post("/batch/{session_id}/cancel")
async def cancel_batch(session_id: str):
    """
    Cancels an active or pending batch session.
    """
    success = batch_manager.cancel_session(session_id)
    session = batch_manager.get_session(session_id)
    if session:
        db.save_batch_session(session.to_dict())
    else:
        db.update_batch_session(session_id, {"status": "cancelled"})

    return {"success": True, "message": "Cancelling batch session..."}


@app.get("/batch/history")
async def get_batch_history(limit: int = Query(default=10, ge=1, le=50)):
    """
    Returns history of batch sessions.
    """
    try:
        return db.get_all_batch_sessions(limit=limit)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/batch/{session_id}")
async def get_batch_session_detail(session_id: str):
    """
    Returns full details for a batch session.
    """
    session = batch_manager.get_session(session_id)
    if session:
        return session.to_dict()

    db_session = db.get_batch_session(session_id)
    if db_session:
        return db_session

    raise HTTPException(status_code=404, detail="Batch session not found")
