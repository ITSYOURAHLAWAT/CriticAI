import json
import time
import uuid
import queue
import threading
from datetime import datetime, timezone
from typing import Callable, Optional, Dict, Any, List

MAX_QUEUE_SIZE = 10      # max models per batch
DELAY_BETWEEN_EVALS = 3  # seconds between models (respect rate limits)


class BatchJob:
    def __init__(
        self,
        model: str,
        prompt_category: str = "all",
        num_tests: int = 10,
        include_redteam: bool = False,
        position: int = 1,
        job_id: Optional[str] = None,
    ):
        self.job_id = job_id or str(uuid.uuid4())
        self.model = model
        self.prompt_category = prompt_category
        self.num_tests = num_tests
        self.include_redteam = include_redteam
        self.status = "queued"  # queued | running | completed | failed | skipped
        self.pass_rate = None
        self.health_score = None
        self.eval_id = None
        self.error_message = None
        self.started_at = None
        self.completed_at = None
        self.position = position

    def to_dict(self) -> dict:
        return {
            "job_id": self.job_id,
            "model": self.model,
            "prompt_category": self.prompt_category,
            "num_tests": self.num_tests,
            "include_redteam": self.include_redteam,
            "status": self.status,
            "pass_rate": self.pass_rate,
            "health_score": self.health_score,
            "eval_id": self.eval_id,
            "error_message": self.error_message,
            "started_at": self.started_at,
            "completed_at": self.completed_at,
            "position": self.position,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "BatchJob":
        job = cls(
            model=data.get("model", ""),
            prompt_category=data.get("prompt_category", "all"),
            num_tests=data.get("num_tests", 10),
            include_redteam=bool(data.get("include_redteam", False)),
            position=data.get("position", 1),
            job_id=data.get("job_id"),
        )
        job.status = data.get("status", "queued")
        job.pass_rate = data.get("pass_rate")
        job.health_score = data.get("health_score")
        job.eval_id = data.get("eval_id")
        job.error_message = data.get("error_message")
        job.started_at = data.get("started_at")
        job.completed_at = data.get("completed_at")
        return job


class BatchSession:
    def __init__(self, session_id: Optional[str] = None):
        self.session_id = session_id or str(uuid.uuid4())
        self.jobs: List[BatchJob] = []
        self.status = "pending"  # pending | running | completed | cancelled
        self.current_job_index = 0
        self.total_jobs = 0
        self.completed_jobs = 0
        self.failed_jobs = 0
        self.created_at = datetime.now(timezone.utc).isoformat()
        self.started_at = None
        self.completed_at = None
        self.cancel_flag = threading.Event()

    def add_job(
        self,
        model: str,
        prompt_category: str = "all",
        num_tests: int = 10,
        include_redteam: bool = False,
    ) -> BatchJob:
        if len(self.jobs) >= MAX_QUEUE_SIZE:
            raise ValueError(f"Maximum queue size of {MAX_QUEUE_SIZE} models exceeded")

        job = BatchJob(
            model=model,
            prompt_category=prompt_category,
            num_tests=num_tests,
            include_redteam=include_redteam,
            position=len(self.jobs) + 1,
        )
        self.jobs.append(job)
        self.total_jobs = len(self.jobs)
        return job

    def cancel(self):
        self.cancel_flag.set()
        self.status = "cancelled"

    def to_dict(self) -> dict:
        return {
            "session_id": self.session_id,
            "jobs": [j.to_dict() for j in self.jobs],
            "status": self.status,
            "current_job_index": self.current_job_index,
            "total_jobs": self.total_jobs,
            "completed_jobs": self.completed_jobs,
            "failed_jobs": self.failed_jobs,
            "created_at": self.created_at,
            "started_at": self.started_at,
            "completed_at": self.completed_at,
        }


class BatchQueueManager:
    """
    Thread-safe singleton managing batch evaluation sessions.
    """

    def __init__(self):
        self._sessions: Dict[str, BatchSession] = {}
        self._lock = threading.Lock()
        self._active_session_id: Optional[str] = None

    def create_session(self) -> BatchSession:
        with self._lock:
            session = BatchSession()
            self._sessions[session.session_id] = session
            return session

    def get_session(self, session_id: str) -> Optional[BatchSession]:
        with self._lock:
            return self._sessions.get(session_id)

    def get_all_sessions(self, limit: int = 10) -> List[dict]:
        with self._lock:
            sessions_list = list(self._sessions.values())
            sessions_list.sort(key=lambda s: s.created_at, reverse=True)
            return [s.to_dict() for s in sessions_list[:limit]]

    def cancel_session(self, session_id: str) -> bool:
        session = self.get_session(session_id)
        if session:
            session.cancel()
            return True
        return False

    def run_session(
        self,
        session_id: str,
        eval_runner_func: Callable[..., dict],
        progress_callback: Optional[Callable[[dict], None]] = None,
        delay_between: int = DELAY_BETWEEN_EVALS,
    ):
        session = self.get_session(session_id)
        if not session:
            return

        with self._lock:
            self._active_session_id = session_id
            session.status = "running"
            session.started_at = datetime.now(timezone.utc).isoformat()

        if progress_callback:
            progress_callback({
                "type": "batch_started",
                "session_id": session_id,
                "total_jobs": session.total_jobs,
            })

        for idx, job in enumerate(session.jobs):
            session.current_job_index = idx

            # Check if cancellation requested
            if session.cancel_flag.is_set():
                for rem_job in session.jobs[idx:]:
                    if rem_job.status == "queued":
                        rem_job.status = "skipped"
                break

            job.status = "running"
            job.started_at = datetime.now(timezone.utc).isoformat()

            if progress_callback:
                progress_callback({
                    "type": "job_started",
                    "job_id": job.job_id,
                    "model": job.model,
                    "position": job.position,
                    "total": session.total_jobs,
                })

            try:
                result = eval_runner_func(
                    model=job.model,
                    prompt_category=job.prompt_category,
                    num_tests=job.num_tests,
                    include_redteam=job.include_redteam,
                )

                job.status = "completed"
                job.pass_rate = float(result.get("pass_rate", 0.0))
                
                hs = result.get("health_score", 0.0)
                if isinstance(hs, dict):
                    job.health_score = float(hs.get("overall", job.pass_rate))
                else:
                    job.health_score = float(hs or job.pass_rate)

                job.eval_id = result.get("eval_id")
                job.completed_at = datetime.now(timezone.utc).isoformat()
                session.completed_jobs += 1

                if progress_callback:
                    progress_callback({
                        "type": "job_completed",
                        "job_id": job.job_id,
                        "model": job.model,
                        "pass_rate": job.pass_rate,
                        "health_score": job.health_score,
                        "position": job.position,
                        "total": session.total_jobs,
                        "completed": session.completed_jobs,
                        "eval_id": job.eval_id,
                    })

            except Exception as e:
                job.status = "failed"
                job.error_message = str(e)
                job.completed_at = datetime.now(timezone.utc).isoformat()
                session.failed_jobs += 1

                if progress_callback:
                    progress_callback({
                        "type": "job_failed",
                        "job_id": job.job_id,
                        "model": job.model,
                        "error": str(e),
                        "position": job.position,
                        "total": session.total_jobs,
                    })

            # Delay between models to respect rate limits
            if idx < len(session.jobs) - 1 and not session.cancel_flag.is_set():
                time.sleep(delay_between)

        # Mark session complete or cancelled
        session.completed_at = datetime.now(timezone.utc).isoformat()
        if session.cancel_flag.is_set():
            session.status = "cancelled"
        else:
            session.status = "completed"

        with self._lock:
            self._active_session_id = None

        # Determine winner
        completed_jobs_list = [j for j in session.jobs if j.status == "completed" and j.pass_rate is not None]
        winner_model = None
        if completed_jobs_list:
            best_job = max(completed_jobs_list, key=lambda j: j.pass_rate)
            winner_model = best_job.model

        if progress_callback:
            progress_callback({
                "type": "batch_complete",
                "session_id": session_id,
                "status": session.status,
                "total_jobs": session.total_jobs,
                "completed": session.completed_jobs,
                "failed": session.failed_jobs,
                "winner": winner_model,
                "results": [j.to_dict() for j in session.jobs],
            })


batch_manager = BatchQueueManager()
