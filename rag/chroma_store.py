import os
import json
from typing import Optional

try:
    import chromadb
    from chromadb.config import Settings
except ImportError:
    chromadb = None
    Settings = None


CHROMA_HOST = os.environ.get("CHROMA_HOST", "localhost")
CHROMA_PORT = int(os.environ.get("CHROMA_PORT", "8000"))
COLLECTION_NAME = "criticai_eval_runs"


class ChromaStore:
    def __init__(self, use_http: bool = False):
        self.use_http = use_http
        self.client = None
        self.collection = None
        persist_dir = os.environ.get("CHROMA_PERSIST_DIR", "./chroma_data")
        self.fallback_path = os.path.join(persist_dir, "fallback_results.json")

        if chromadb is None:
            os.makedirs(persist_dir, exist_ok=True)
            return

        if use_http:
            self.client = chromadb.HttpClient(
                host=CHROMA_HOST,
                port=CHROMA_PORT,
                settings=Settings(allow_reset=True, anonymized_telemetry=False)
            )
        else:
            self.client = chromadb.PersistentClient(
                path=persist_dir,
                settings=Settings(anonymized_telemetry=False)
            )
        self._ensure_collection()

    def _ensure_collection(self):
        try:
            self.collection = self.client.get_or_create_collection(
                name=COLLECTION_NAME,
                metadata={"hnsw:space": "cosine"}
            )
        except Exception:
            self.collection = self.client.create_collection(
                name=COLLECTION_NAME,
                metadata={"hnsw:space": "cosine"}
            )

    def store_eval_result(self, eval_id: str, model: str, test_case: dict, scores: dict, passed: bool, failure_type: Optional[str] = None):
        if self.collection is None:
            self._store_fallback_result(eval_id, model, test_case, scores, passed, failure_type)
            return

        doc_id = f"{eval_id}_{model}"
        metadata = {
            "model": model,
            "category": test_case.get("category", "unknown"),
            "difficulty": test_case.get("difficulty", "medium"),
            "passed": str(passed),
            "failure_type": failure_type or "none",
            "timestamp": scores.get("timestamp", ""),
        }
        document = json.dumps({
            "test_case": test_case,
            "scores": scores,
            "failure_type": failure_type,
        })
        try:
            self.collection.add(
                documents=[document],
                metadatas=[metadata],
                ids=[doc_id]
            )
        except Exception as exc:
            # Bug #8 fix: gracefully fall back to JSON store instead of crashing pipeline
            print(f"WARNING: ChromaDB write failed for eval_id={eval_id}, falling back to JSON store. Error: {exc}")
            self._store_fallback_result(eval_id, model, test_case, scores, passed, failure_type)

    def get_similar_results(self, test_case: dict, model: str, n_results: int = 5) -> list[dict]:
        if self.collection is None:
            return self._get_fallback_results(model, limit=n_results)

        query_text = f"{test_case.get('prompt', '')} {test_case.get('category', '')} {test_case.get('expected_behavior', '')}"
        try:
            results = self.collection.query(
                query_texts=[query_text],
                n_results=n_results,
                where={"model": model}
            )
        except Exception:
            return []
        parsed = []
        if results and results.get("documents"):
            for i, doc_list in enumerate(results["documents"]):
                for doc in doc_list:
                    try:
                        parsed.append(json.loads(doc))
                    except json.JSONDecodeError:
                        parsed.append({"raw": doc})
        return parsed

    def get_failures_by_model(self, model: str, failure_type: Optional[str] = None) -> list[dict]:
        if self.collection is None:
            results = [
                result for result in self._get_fallback_results(model)
                if not result.get("passed", False)
            ]
            if failure_type:
                results = [result for result in results if result.get("failure_type") == failure_type]
            return results

        where_clause = {"model": model, "passed": "False"}
        if failure_type:
            where_clause["failure_type"] = failure_type
        try:
            results = self.collection.get(where=where_clause)
        except Exception:
            return []
        failures = []
        if results and results.get("documents"):
            for doc in results["documents"]:
                try:
                    failures.append(json.loads(doc))
                except json.JSONDecodeError:
                    failures.append({"raw": doc})
        return failures

    def get_all_results_for_model(self, model: str) -> list[dict]:
        if self.collection is None:
            return self._get_fallback_results(model)

        try:
            results = self.collection.get(where={"model": model})
        except Exception:
            return []
        all_results = []
        if results and results.get("documents"):
            for doc in results["documents"]:
                try:
                    all_results.append(json.loads(doc))
                except json.JSONDecodeError:
                    all_results.append({"raw": doc})
        return all_results

    def reset(self):
        if self.collection is None:
            try:
                os.remove(self.fallback_path)
            except FileNotFoundError:
                pass
            return

        try:
            self.client.delete_collection(COLLECTION_NAME)
        except Exception:
            pass
        self._ensure_collection()

    def _store_fallback_result(self, eval_id: str, model: str, test_case: dict, scores: dict, passed: bool, failure_type: Optional[str] = None):
        results = self._load_fallback_results()
        doc_id = f"{eval_id}_{model}"
        result = {
            "id": doc_id,
            "model": model,
            "test_case": test_case,
            "scores": scores,
            "passed": passed,
            "failure_type": failure_type,
        }
        results = [item for item in results if item.get("id") != doc_id]
        results.append(result)
        self._save_fallback_results(results)

    def _get_fallback_results(self, model: str, limit: Optional[int] = None) -> list[dict]:
        results = [
            result for result in self._load_fallback_results()
            if result.get("model") == model
        ]
        if limit is not None:
            return results[-limit:]
        return results

    def _load_fallback_results(self) -> list[dict]:
        if not os.path.exists(self.fallback_path):
            return []
        try:
            with open(self.fallback_path, "r", encoding="utf-8") as f:
                data = json.load(f)
        except (json.JSONDecodeError, OSError):
            return []
        return data if isinstance(data, list) else []

    def _save_fallback_results(self, results: list[dict]):
        os.makedirs(os.path.dirname(self.fallback_path), exist_ok=True)
        with open(self.fallback_path, "w", encoding="utf-8") as f:
            json.dump(results, f, indent=2, default=str)
