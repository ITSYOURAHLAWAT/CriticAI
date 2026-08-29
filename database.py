import sqlite3
import json
import os
from datetime import datetime
import uuid

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "criticai.db")


class DatabaseManager:
    """
    Singleton database manager for CriticAI.
    Uses only Python built-ins — sqlite3, json, datetime, uuid, os.
    Database file: criticai.db in project root.
    """

    def __init__(self, db_path: str = None):
        self.db_path = db_path or DB_PATH
        self._init_db()

    # ─── Connection ──────────────────────────────────────────────────────────

    def get_connection(self) -> sqlite3.Connection:
        """Returns a new connection with Row factory (dict-like access)."""
        conn = sqlite3.connect(self.db_path, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")   # better concurrency
        conn.execute("PRAGMA foreign_keys=ON")
        return conn

    # ─── Schema ───────────────────────────────────────────────────────────────

    def _init_db(self):
        """Create all tables if they don't exist."""
        conn = self.get_connection()
        try:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS evaluations (
                    id TEXT PRIMARY KEY,
                    model TEXT NOT NULL,
                    provider TEXT DEFAULT 'groq',
                    prompt_category TEXT DEFAULT 'all',
                    num_tests INTEGER DEFAULT 10,
                    include_redteam INTEGER DEFAULT 0,
                    status TEXT DEFAULT 'running',
                    pass_rate REAL DEFAULT 0,
                    health_score REAL DEFAULT 0,
                    total_tests INTEGER DEFAULT 0,
                    passed_tests INTEGER DEFAULT 0,
                    failed_tests INTEGER DEFAULT 0,
                    avg_scores TEXT DEFAULT '{}',
                    summary TEXT DEFAULT '',
                    ai_summary TEXT DEFAULT NULL,
                    dataset_filename TEXT DEFAULT NULL,
                    model_card TEXT DEFAULT NULL,
                    created_at TEXT NOT NULL,
                    completed_at TEXT
                )
            """)

            conn.execute("""
                CREATE TABLE IF NOT EXISTS test_results (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    evaluation_id TEXT NOT NULL,
                    test_number INTEGER,
                    prompt TEXT,
                    category TEXT,
                    result TEXT,
                    score REAL,
                    reasoning TEXT,
                    response TEXT,
                    is_redteam INTEGER DEFAULT 0,
                    attack_type TEXT,
                    FOREIGN KEY (evaluation_id) REFERENCES evaluations(id)
                )
            """)

            conn.execute("""
                CREATE TABLE IF NOT EXISTS models_registry (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    model_name TEXT UNIQUE NOT NULL,
                    provider TEXT,
                    first_evaluated TEXT,
                    last_evaluated TEXT,
                    total_evaluations INTEGER DEFAULT 0,
                    best_pass_rate REAL DEFAULT 0,
                    avg_pass_rate REAL DEFAULT 0
                )
            """)

            conn.execute("""
                CREATE TABLE IF NOT EXISTS rubrics (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    domain TEXT DEFAULT 'general',
                    criteria TEXT NOT NULL,
                    pass_threshold REAL DEFAULT 70,
                    created_at TEXT NOT NULL
                )
            """)

            conn.execute("""
                CREATE TABLE IF NOT EXISTS playground_history (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    prompt TEXT,
                    response TEXT,
                    model TEXT,
                    category TEXT,
                    score REAL,
                    result TEXT,
                    reasoning TEXT,
                    strengths TEXT,
                    weaknesses TEXT,
                    grade TEXT,
                    created_at TEXT
                )
            """)

            # ── A/B Tests table ────────────────────────────────────────────────
            conn.execute("""
                CREATE TABLE IF NOT EXISTS ab_tests (
                    id TEXT PRIMARY KEY,
                    model_a TEXT NOT NULL,
                    model_b TEXT NOT NULL,
                    provider_a TEXT DEFAULT 'groq',
                    provider_b TEXT DEFAULT 'groq',
                    prompt_category TEXT DEFAULT 'all',
                    num_tests INTEGER DEFAULT 10,
                    status TEXT DEFAULT 'running',
                    wins_a INTEGER DEFAULT 0,
                    wins_b INTEGER DEFAULT 0,
                    ties INTEGER DEFAULT 0,
                    avg_score_a REAL DEFAULT 0,
                    avg_score_b REAL DEFAULT 0,
                    overall_winner TEXT DEFAULT NULL,
                    winner_name TEXT DEFAULT NULL,
                    results TEXT DEFAULT '[]',
                    created_at TEXT NOT NULL,
                    completed_at TEXT
                )
            """)

            # ── Custom Templates table ─────────────────────────────────────────
            conn.execute("""
                CREATE TABLE IF NOT EXISTS custom_templates (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    icon TEXT DEFAULT '📋',
                    description TEXT,
                    category TEXT DEFAULT 'custom',
                    tags TEXT DEFAULT '[]',
                    config TEXT NOT NULL,
                    prompts TEXT NOT NULL,
                    scoring_criteria TEXT DEFAULT '{}',
                    use_case TEXT,
                    difficulty TEXT DEFAULT 'beginner',
                    estimated_time TEXT,
                    is_builtin INTEGER DEFAULT 0,
                    created_at TEXT NOT NULL,
                    used_count INTEGER DEFAULT 0
                )
            """)

            # ── API Usage Log table ───────────────────────────────────────────
            conn.execute("""
                CREATE TABLE IF NOT EXISTS api_usage_log (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    provider TEXT NOT NULL,
                    model TEXT NOT NULL,
                    request_type TEXT DEFAULT 'chat',
                    tokens_input INTEGER DEFAULT 0,
                    tokens_output INTEGER DEFAULT 0,
                    tokens_total INTEGER DEFAULT 0,
                    eval_id TEXT,
                    created_at TEXT NOT NULL
                )
            """)

            # ── Batch Sessions table ──────────────────────────────────────────
            conn.execute("""
                CREATE TABLE IF NOT EXISTS batch_sessions (
                    id TEXT PRIMARY KEY,
                    status TEXT DEFAULT 'pending',
                    total_jobs INTEGER DEFAULT 0,
                    completed_jobs INTEGER DEFAULT 0,
                    failed_jobs INTEGER DEFAULT 0,
                    jobs TEXT DEFAULT '[]',
                    created_at TEXT NOT NULL,
                    started_at TEXT,
                    completed_at TEXT
                )
            """)

            # ── Column migrations for evaluations table ────────────────────────
            cursor = conn.cursor()
            cursor.execute("PRAGMA table_info(evaluations)")
            columns = [row[1] for row in cursor.fetchall()]
            if "ai_summary" not in columns:
                cursor.execute("ALTER TABLE evaluations ADD COLUMN ai_summary TEXT DEFAULT NULL")
            if "dataset_filename" not in columns:
                cursor.execute("ALTER TABLE evaluations ADD COLUMN dataset_filename TEXT DEFAULT NULL")
            if "model_card" not in columns:
                cursor.execute("ALTER TABLE evaluations ADD COLUMN model_card TEXT DEFAULT NULL")
            if "template_id" not in columns:
                cursor.execute("ALTER TABLE evaluations ADD COLUMN template_id TEXT DEFAULT NULL")

            conn.commit()
        finally:
            conn.close()

    # ─── Evaluation CRUD ─────────────────────────────────────────────────────

    def save_evaluation(self, eval_data: dict) -> str:
        """
        Insert a new evaluation row (status='running') and upsert models_registry.
        Returns the generated UUID string id.
        """
        eval_id = str(uuid.uuid4())
        now = datetime.utcnow().isoformat()
        conn = self.get_connection()
        try:
            conn.execute("""
                INSERT INTO evaluations
                    (id, model, provider, prompt_category, num_tests,
                     include_redteam, status, dataset_filename, template_id, created_at)
                VALUES (?, ?, ?, ?, ?, ?, 'running', ?, ?, ?)
            """, (
                eval_id,
                eval_data.get("model", "unknown"),
                eval_data.get("provider", "groq"),
                eval_data.get("prompt_category", "all"),
                eval_data.get("num_tests", 10),
                1 if eval_data.get("include_redteam") else 0,
                eval_data.get("dataset_filename"),
                eval_data.get("template_id"),
                now,
            ))

            # Upsert models_registry
            conn.execute("""
                INSERT INTO models_registry (model_name, provider, first_evaluated, last_evaluated, total_evaluations)
                VALUES (?, ?, ?, ?, 1)
                ON CONFLICT(model_name) DO UPDATE SET
                    last_evaluated = excluded.last_evaluated,
                    total_evaluations = total_evaluations + 1
            """, (
                eval_data.get("model", "unknown"),
                eval_data.get("provider", "groq"),
                now, now,
            ))

            conn.commit()
        finally:
            conn.close()
        return eval_id

    def update_evaluation(self, eval_id: str, updates: dict):
        """
        Update any fields on an existing evaluation row.
        If status == 'completed', also sets completed_at.
        Updates models_registry pass_rate stats if pass_rate is provided.
        """
        if not updates:
            return

        now = datetime.utcnow().isoformat()
        conn = self.get_connection()
        try:
            # Build SET clause dynamically from keys in updates
            allowed = {
                "status", "pass_rate", "health_score", "total_tests",
                "passed_tests", "failed_tests", "avg_scores", "summary",
                "dataset_filename",
            }
            set_parts = []
            values = []

            for k, v in updates.items():
                if k not in allowed:
                    continue
                if k == "avg_scores" and isinstance(v, dict):
                    v = json.dumps(v)
                set_parts.append(f"{k} = ?")
                values.append(v)

            if updates.get("status") == "completed":
                set_parts.append("completed_at = ?")
                values.append(now)

            if not set_parts:
                return

            values.append(eval_id)
            conn.execute(
                f"UPDATE evaluations SET {', '.join(set_parts)} WHERE id = ?",
                values,
            )

            # Update models_registry if pass_rate changed
            if "pass_rate" in updates:
                new_rate = float(updates["pass_rate"])
                # Get model name for this eval
                row = conn.execute(
                    "SELECT model FROM evaluations WHERE id = ?", (eval_id,)
                ).fetchone()
                if row:
                    model_name = row["model"]
                    conn.execute("""
                        UPDATE models_registry
                        SET
                            best_pass_rate = MAX(best_pass_rate, ?),
                            avg_pass_rate  = (
                                (avg_pass_rate * (total_evaluations - 1) + ?) / total_evaluations
                            ),
                            last_evaluated = ?
                        WHERE model_name = ?
                    """, (new_rate, new_rate, now, model_name))

            conn.commit()
        finally:
            conn.close()

    def save_test_results(self, eval_id: str, results: list):
        """Bulk-insert test result rows for an evaluation."""
        if not results:
            return
        conn = self.get_connection()
        try:
            for i, r in enumerate(results):
                conn.execute("""
                    INSERT INTO test_results
                        (evaluation_id, test_number, prompt, category, result,
                         score, reasoning, response, is_redteam, attack_type)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    eval_id,
                    i + 1,
                    r.get("prompt", ""),
                    r.get("category", ""),
                    r.get("result", ""),
                    float(r.get("score", 0)),
                    r.get("reasoning", ""),
                    r.get("response", ""),
                    1 if r.get("is_redteam") else 0,
                    r.get("attack_type", ""),
                ))
            conn.commit()
        finally:
            conn.close()

    def get_evaluation(self, eval_id: str) -> dict:
        """Fetch one evaluation by id, including its test results."""
        conn = self.get_connection()
        try:
            row = conn.execute(
                "SELECT * FROM evaluations WHERE id = ?", (eval_id,)
            ).fetchone()
            if not row:
                return None
            data = dict(row)
            data["avg_scores"] = json.loads(data.get("avg_scores") or "{}")
            results = conn.execute(
                "SELECT * FROM test_results WHERE evaluation_id = ? ORDER BY test_number",
                (eval_id,),
            ).fetchall()
            data["results"] = [dict(r) for r in results]
            return data
        finally:
            conn.close()

    def get_evaluation_by_model(self, model_name: str) -> dict:
        """Fetch the latest completed evaluation for a model."""
        conn = self.get_connection()
        try:
            row = conn.execute("""
                SELECT * FROM evaluations
                WHERE model = ? AND status = 'completed'
                ORDER BY created_at DESC
                LIMIT 1
            """, (model_name,)).fetchone()
            if not row:
                return None
            data = dict(row)
            data["avg_scores"] = json.loads(data.get("avg_scores") or "{}")
            results = conn.execute(
                "SELECT * FROM test_results WHERE evaluation_id = ? ORDER BY test_number",
                (data["id"],),
            ).fetchall()
            data["results"] = [dict(r) for r in results]
            return data
        finally:
            conn.close()

    def get_all_evaluations(self, limit: int = 50) -> list:
        """Fetch last N evaluations ordered by newest first (no test_results for perf)."""
        conn = self.get_connection()
        try:
            rows = conn.execute("""
                SELECT * FROM evaluations
                ORDER BY created_at DESC
                LIMIT ?
            """, (limit,)).fetchall()
            result = []
            for row in rows:
                d = dict(row)
                d["avg_scores"] = json.loads(d.get("avg_scores") or "{}")
                result.append(d)
            return result
        finally:
            conn.close()

    def get_leaderboard(self) -> list:
        """Return models sorted by best_pass_rate DESC with rank."""
        conn = self.get_connection()
        try:
            rows = conn.execute("""
                SELECT
                    mr.model_name,
                    mr.provider,
                    mr.best_pass_rate,
                    mr.avg_pass_rate,
                    mr.total_evaluations,
                    mr.last_evaluated,
                    e.health_score
                FROM models_registry mr
                LEFT JOIN evaluations e ON (
                    e.id = (
                        SELECT id FROM evaluations
                        WHERE model = mr.model_name AND status = 'completed'
                        ORDER BY created_at DESC
                        LIMIT 1
                    )
                )
                ORDER BY mr.best_pass_rate DESC
            """).fetchall()
            leaderboard = []
            for i, row in enumerate(rows):
                d = dict(row)
                d["rank"] = i + 1
                leaderboard.append(d)
            return leaderboard
        finally:
            conn.close()

    # ─── Rubrics CRUD ────────────────────────────────────────────────────────

    def save_rubric(self, rubric: dict) -> str:
        """Insert a new rubric. Returns generated id."""
        rubric_id = str(uuid.uuid4())
        now = datetime.utcnow().isoformat()
        criteria = rubric.get("criteria", [])
        if isinstance(criteria, list):
            criteria = json.dumps(criteria)
        conn = self.get_connection()
        try:
            conn.execute("""
                INSERT INTO rubrics (id, name, domain, criteria, pass_threshold, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (
                rubric_id,
                rubric.get("name", "Untitled"),
                rubric.get("domain", "general"),
                criteria,
                float(rubric.get("pass_threshold", 70)),
                now,
            ))
            conn.commit()
        finally:
            conn.close()
        return rubric_id

    def get_rubrics(self) -> list:
        """Fetch all rubrics, parsing criteria JSON back to list."""
        conn = self.get_connection()
        try:
            rows = conn.execute(
                "SELECT * FROM rubrics ORDER BY created_at DESC"
            ).fetchall()
            result = []
            for row in rows:
                d = dict(row)
                try:
                    d["criteria"] = json.loads(d.get("criteria") or "[]")
                except (json.JSONDecodeError, TypeError):
                    d["criteria"] = []
                result.append(d)
            return result
        finally:
            conn.close()

    def delete_rubric(self, rubric_id: str):
        """Delete a rubric by id."""
        conn = self.get_connection()
        try:
            conn.execute("DELETE FROM rubrics WHERE id = ?", (rubric_id,))
            conn.commit()
        finally:
            conn.close()

    # ─── Stats ───────────────────────────────────────────────────────────────

    def get_stats(self) -> dict:
        """Return dashboard-level aggregated stats."""
        conn = self.get_connection()
        try:
            total = conn.execute(
                "SELECT COUNT(*) AS cnt FROM evaluations"
            ).fetchone()["cnt"]

            models_count = conn.execute(
                "SELECT COUNT(DISTINCT model) AS cnt FROM evaluations"
            ).fetchone()["cnt"]

            avg_pass = conn.execute(
                "SELECT AVG(pass_rate) AS avg FROM evaluations WHERE status = 'completed'"
            ).fetchone()["avg"] or 0

            total_tests = conn.execute(
                "SELECT SUM(num_tests) AS total FROM evaluations"
            ).fetchone()["total"] or 0

            best_row = conn.execute("""
                SELECT model, pass_rate FROM evaluations
                WHERE status = 'completed'
                ORDER BY pass_rate DESC
                LIMIT 1
            """).fetchone()

            return {
                "total_evaluations": total,
                "models_evaluated": models_count,
                "avg_pass_rate": round(float(avg_pass), 1),
                "total_tests_run": total_tests,
                "best_model": best_row["model"] if best_row else None,
                "best_score": round(float(best_row["pass_rate"]), 1) if best_row else 0,
            }
        finally:
            conn.close()

    def get_unique_models(self) -> list:
        """Return list of unique model names from evaluations."""
        conn = self.get_connection()
        try:
            rows = conn.execute(
                "SELECT DISTINCT model FROM evaluations ORDER BY model"
            ).fetchall()
            return [r["model"] for r in rows]
        finally:
            conn.close()

    def delete_evaluation(self, eval_id: str):
        """Delete an evaluation and its test results."""
        conn = self.get_connection()
        try:
            conn.execute("DELETE FROM test_results WHERE evaluation_id = ?", (eval_id,))
            conn.execute("DELETE FROM evaluations WHERE id = ?", (eval_id,))
            conn.commit()
        finally:
            conn.close()

    def save_playground_evaluation(self, eval_data: dict) -> int:
        """Insert a playground session evaluation. Returns the inserted row id."""
        now = datetime.utcnow().isoformat()
        strengths = eval_data.get("strengths", [])
        if isinstance(strengths, list):
            strengths = json.dumps(strengths)
        weaknesses = eval_data.get("weaknesses", [])
        if isinstance(weaknesses, list):
            weaknesses = json.dumps(weaknesses)
        conn = self.get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO playground_history 
                    (prompt, response, model, category, score, result, reasoning, strengths, weaknesses, grade, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                eval_data.get("prompt"),
                eval_data.get("response"),
                eval_data.get("model"),
                eval_data.get("category", "general"),
                float(eval_data.get("score", 0)),
                eval_data.get("result"),
                eval_data.get("reasoning"),
                strengths,
                weaknesses,
                eval_data.get("grade"),
                now
            ))
            conn.commit()
            return cursor.lastrowid
        finally:
            conn.close()

    def get_playground_history(self, limit: int = 20) -> list:
        """Fetch last N playground evaluations ordered by newest first."""
        conn = self.get_connection()
        try:
            rows = conn.execute("""
                SELECT id, prompt, response, model, category, score, result, reasoning, strengths, weaknesses, grade, created_at
                FROM playground_history
                ORDER BY created_at DESC
                LIMIT ?
            """, (limit,)).fetchall()
            result = []
            for row in rows:
                d = dict(row)
                try:
                    d["strengths"] = json.loads(d.get("strengths") or "[]")
                except Exception:
                    d["strengths"] = []
                try:
                    d["weaknesses"] = json.loads(d.get("weaknesses") or "[]")
                except Exception:
                    d["weaknesses"] = []
                result.append(d)
            return result
        finally:
            conn.close()

    def delete_playground_history(self, session_id: int):
        """Delete a playground session by id."""
        conn = self.get_connection()
        try:
            conn.execute("DELETE FROM playground_history WHERE id = ?", (session_id,))
            conn.commit()
        finally:
            conn.close()

    def clear_all_playground_history(self):
        """Clear all playground history."""
        conn = self.get_connection()
        try:
            conn.execute("DELETE FROM playground_history")
            conn.commit()
        finally:
            conn.close()

    def save_ai_summary(self, eval_id: str, summary: dict):
        """Update evaluations table with the AI summary."""
        conn = self.get_connection()
        try:
            conn.execute(
                "UPDATE evaluations SET ai_summary = ? WHERE id = ?",
                (json.dumps(summary) if summary else None, eval_id)
            )
            conn.commit()
        finally:
            conn.close()

    def get_ai_summary(self, eval_id: str) -> dict or None:
        """Fetch and deserialize AI summary for a given evaluation ID."""
        conn = self.get_connection()
        try:
            row = conn.execute(
                "SELECT ai_summary FROM evaluations WHERE id = ?",
                (eval_id,)
            ).fetchone()
            if row and row["ai_summary"]:
                try:
                    return json.loads(row["ai_summary"])
                except Exception:
                    return None
            return None
        finally:
            conn.close()

    def save_model_card(self, eval_id: str, card_markdown: str):
        """Update evaluations table with the model card markdown."""
        conn = self.get_connection()
        try:
            conn.execute(
                "UPDATE evaluations SET model_card = ? WHERE id = ?",
                (card_markdown, eval_id)
            )
            conn.commit()
        finally:
            conn.close()

    def get_model_card(self, eval_id: str) -> str or None:
        """Fetch model card markdown for a given evaluation ID."""
        conn = self.get_connection()
        try:
            row = conn.execute(
                "SELECT model_card FROM evaluations WHERE id = ?",
                (eval_id,)
            ).fetchone()
            if row:
                return row["model_card"]
            return None
        finally:
            conn.close()


    # ─── A/B Test CRUD ────────────────────────────────────────────────────────

    def save_ab_test(self, data: dict) -> str:
        """
        Insert a new ab_test row with status='running'.
        Returns the generated UUID id.
        """
        ab_id = str(uuid.uuid4())
        now = datetime.utcnow().isoformat()
        conn = self.get_connection()
        try:
            conn.execute("""
                INSERT INTO ab_tests
                    (id, model_a, model_b, provider_a, provider_b,
                     prompt_category, num_tests, status, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'running', ?)
            """, (
                ab_id,
                data.get("model_a", "unknown"),
                data.get("model_b", "unknown"),
                data.get("provider_a", "groq"),
                data.get("provider_b", "groq"),
                data.get("prompt_category", "all"),
                data.get("num_tests", 10),
                now,
            ))
            conn.commit()
        finally:
            conn.close()
        return ab_id

    def update_ab_test(self, ab_id: str, updates: dict):
        """Update an ab_test row. Serialises 'results' list to JSON."""
        if not updates:
            return
        now = datetime.utcnow().isoformat()
        allowed = {
            "status", "wins_a", "wins_b", "ties",
            "avg_score_a", "avg_score_b",
            "overall_winner", "winner_name", "results",
        }
        set_parts, values = [], []
        for k, v in updates.items():
            if k not in allowed:
                continue
            if k == "results" and isinstance(v, list):
                v = json.dumps(v)
            set_parts.append(f"{k} = ?")
            values.append(v)
        if updates.get("status") == "completed":
            set_parts.append("completed_at = ?")
            values.append(now)
        if not set_parts:
            return
        values.append(ab_id)
        conn = self.get_connection()
        try:
            conn.execute(
                f"UPDATE ab_tests SET {', '.join(set_parts)} WHERE id = ?",
                values,
            )
            conn.commit()
        finally:
            conn.close()

    def get_ab_test(self, ab_id: str) -> dict:
        """Fetch one ab_test row by id. Returns None if not found."""
        conn = self.get_connection()
        try:
            row = conn.execute(
                "SELECT * FROM ab_tests WHERE id = ?", (ab_id,)
            ).fetchone()
            if not row:
                return None
            d = dict(row)
            try:
                d["results"] = json.loads(d.get("results") or "[]")
            except Exception:
                d["results"] = []
            return d
        finally:
            conn.close()

    def get_all_ab_tests(self, limit: int = 50) -> list:
        """Fetch last N ab_test rows ordered by newest first."""
        conn = self.get_connection()
        try:
            rows = conn.execute("""
                SELECT id, model_a, model_b, provider_a, provider_b,
                       prompt_category, num_tests, status,
                       wins_a, wins_b, ties,
                       avg_score_a, avg_score_b,
                       overall_winner, winner_name,
                       created_at, completed_at
                FROM ab_tests
                ORDER BY created_at DESC
                LIMIT ?
            """, (limit,)).fetchall()
            return [dict(r) for r in rows]
        finally:
            conn.close()

    # ─── Custom Templates CRUD ───────────────────────────────────────────────

    def save_custom_template(self, template: dict) -> str:
        """Insert a custom template into DB. Returns generated id."""
        t_id = "custom-" + str(uuid.uuid4())[:8]
        now = datetime.utcnow().isoformat()
        
        tags = template.get("tags", [])
        if isinstance(tags, list):
            tags = json.dumps(tags)
            
        config = template.get("config", {})
        if isinstance(config, dict):
            config = json.dumps(config)
            
        prompts = template.get("prompts", [])
        if isinstance(prompts, list):
            prompts = json.dumps(prompts)
            
        scoring = template.get("scoring_criteria", {})
        if isinstance(scoring, dict):
            scoring = json.dumps(scoring)

        conn = self.get_connection()
        try:
            conn.execute("""
                INSERT INTO custom_templates
                    (id, name, icon, description, category, tags, config, prompts,
                     scoring_criteria, use_case, difficulty, estimated_time, is_builtin, created_at, used_count)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 0)
            """, (
                t_id,
                template.get("name", "Untitled Template"),
                template.get("icon", "📋"),
                template.get("description", ""),
                template.get("category", "custom"),
                tags,
                config,
                prompts,
                scoring,
                template.get("use_case", ""),
                template.get("difficulty", "beginner"),
                template.get("estimated_time", "~3 minutes"),
                now,
            ))
            conn.commit()
        finally:
            conn.close()
        return t_id

    def get_custom_templates(self) -> list:
        """Fetch all custom templates, parsing JSON fields back."""
        conn = self.get_connection()
        try:
            rows = conn.execute(
                "SELECT * FROM custom_templates ORDER BY created_at DESC"
            ).fetchall()
            result = []
            for row in rows:
                d = dict(row)
                for key in ["tags", "config", "prompts", "scoring_criteria"]:
                    try:
                        d[key] = json.loads(d.get(key) or ("[]" if key in ["tags", "prompts"] else "{}"))
                    except Exception:
                        d[key] = [] if key in ["tags", "prompts"] else {}
                d["is_builtin"] = False
                result.append(d)
            return result
        finally:
            conn.close()

    def delete_custom_template(self, template_id: str):
        """Delete a custom template by id."""
        conn = self.get_connection()
        try:
            conn.execute("DELETE FROM custom_templates WHERE id = ?", (template_id,))
            conn.commit()
        finally:
            conn.close()

    def increment_template_usage(self, template_id: str):
        """Increment usage counter for a custom template."""
        conn = self.get_connection()
        try:
            conn.execute(
                "UPDATE custom_templates SET used_count = used_count + 1 WHERE id = ?",
                (template_id,)
            )
            conn.commit()
        finally:
            conn.close()

    # ─── API Usage Log CRUD ───────────────────────────────────────────────────

    def log_api_call(
        self,
        provider: str,
        model: str,
        tokens_input: int,
        tokens_output: int,
        request_type: str = "chat",
        eval_id: str = None
    ):
        """Insert a row into api_usage_log."""
        tot = (tokens_input or 0) + (tokens_output or 0)
        now = datetime.utcnow().isoformat()
        conn = self.get_connection()
        try:
            conn.execute("""
                INSERT INTO api_usage_log
                    (provider, model, request_type, tokens_input, tokens_output, tokens_total, eval_id, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                provider.lower() if provider else "groq",
                model or "unknown",
                request_type or "chat",
                tokens_input or 0,
                tokens_output or 0,
                tot,
                eval_id,
                now,
            ))
            conn.commit()
        finally:
            conn.close()

    def get_usage_by_day(self, days: int = 7) -> list:
        """Fetch daily token usage grouped by date and provider for the last N days."""
        conn = self.get_connection()
        try:
            rows = conn.execute(f"""
                SELECT strftime('%Y-%m-%d', created_at) as day,
                       provider,
                       SUM(tokens_total) as tokens,
                       COUNT(*) as requests
                FROM api_usage_log
                WHERE created_at >= date('now', '-{int(days)} days')
                GROUP BY day, provider
                ORDER BY day ASC
            """).fetchall()
            return [dict(r) for r in rows]
        finally:
            conn.close()

    def get_total_usage_stats(self) -> dict:
        """Fetch all-time usage statistics grouped by provider."""
        conn = self.get_connection()
        try:
            rows = conn.execute("""
                SELECT provider,
                       SUM(tokens_total) as total_tokens,
                       SUM(tokens_input) as input_tokens,
                       SUM(tokens_output) as output_tokens,
                       COUNT(*) as total_requests
                FROM api_usage_log
                GROUP BY provider
            """).fetchall()
            return {r["provider"]: dict(r) for r in rows}
        finally:
            conn.close()

    def get_recent_api_logs(self, limit: int = 50, offset: int = 0) -> list:
        """Fetch last N api_usage_log entries."""
        conn = self.get_connection()
        try:
            sql = "SELECT id, provider, model, request_type, tokens_input, tokens_output, tokens_total, eval_id, created_at FROM api_usage_log ORDER BY id DESC LIMIT ? OFFSET ?"
            rows = conn.execute(sql, (limit, offset)).fetchall()
            return [dict(r) for r in rows]
        finally:
            conn.close()

    def get_model_eval_history(self, model_name: str, limit: int = 50) -> list:
        """Fetch chronological evaluation history for a single model."""
        conn = self.get_connection()
        try:
            rows = conn.execute("""
                SELECT id, model, provider, pass_rate, health_score, prompt_category, num_tests, created_at
                FROM evaluations
                WHERE model = ? AND status = 'completed'
                ORDER BY created_at ASC
                LIMIT ?
            """, (model_name, limit)).fetchall()
            return [dict(r) for r in rows]
        finally:
            conn.close()

    def get_all_models_with_history(self) -> dict:
        """Fetch summary count and avg pass rate for all models with completed evaluations."""
        conn = self.get_connection()
        try:
            rows = conn.execute("""
                SELECT model, COUNT(*) as eval_count, AVG(pass_rate) as avg_rate
                FROM evaluations
                WHERE status = 'completed'
                GROUP BY model
                HAVING COUNT(*) >= 1
                ORDER BY eval_count DESC
            """).fetchall()
            return {r["model"]: {"eval_count": r["eval_count"], "avg_rate": round(r["avg_rate"], 1)} for r in rows}
        finally:
            conn.close()

    # ─── Batch Sessions CRUD ──────────────────────────────────────────────────

    def save_batch_session(self, session: dict) -> str:
        """INSERT or REPLACE a batch session into SQLite."""
        session_id = session.get("session_id") or session.get("id") or str(uuid.uuid4())
        jobs_json = json.dumps(session.get("jobs", []))
        now = datetime.utcnow().isoformat()
        conn = self.get_connection()
        try:
            conn.execute("""
                INSERT OR REPLACE INTO batch_sessions
                    (id, status, total_jobs, completed_jobs, failed_jobs, jobs, created_at, started_at, completed_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                session_id,
                session.get("status", "pending"),
                session.get("total_jobs", 0),
                session.get("completed_jobs", 0),
                session.get("failed_jobs", 0),
                jobs_json,
                session.get("created_at", now),
                session.get("started_at"),
                session.get("completed_at"),
            ))
            conn.commit()
            return session_id
        finally:
            conn.close()

    def update_batch_session(self, session_id: str, updates: dict):
        """Update any fields on a batch_session row."""
        if not updates:
            return
        conn = self.get_connection()
        try:
            set_parts = []
            values = []
            for k, v in updates.items():
                if k == "jobs" and isinstance(v, list):
                    v = json.dumps(v)
                set_parts.append(f"{k} = ?")
                values.append(v)
            values.append(session_id)
            conn.execute(f"UPDATE batch_sessions SET {', '.join(set_parts)} WHERE id = ?", values)
            conn.commit()
        finally:
            conn.close()

    def get_batch_session(self, session_id: str) -> dict:
        """Fetch a single batch session dict by ID."""
        conn = self.get_connection()
        try:
            row = conn.execute("SELECT * FROM batch_sessions WHERE id = ?", (session_id,)).fetchone()
            if not row:
                return None
            res = dict(row)
            try:
                res["jobs"] = json.loads(res["jobs"])
            except Exception:
                res["jobs"] = []
            return res
        finally:
            conn.close()

    def get_all_batch_sessions(self, limit: int = 10) -> list:
        """Fetch last N batch sessions ordered by created_at DESC."""
        conn = self.get_connection()
        try:
            rows = conn.execute("SELECT * FROM batch_sessions ORDER BY created_at DESC LIMIT ?", (limit,)).fetchall()
            results = []
            for r in rows:
                item = dict(r)
                try:
                    item["jobs"] = json.loads(item["jobs"])
                except Exception:
                    item["jobs"] = []
                results.append(item)
            return results
        finally:
            conn.close()


# ── Singleton ─────────────────────────────────────────────────────────────────
db = DatabaseManager()
