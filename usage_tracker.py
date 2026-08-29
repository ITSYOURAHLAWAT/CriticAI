import json
import threading
from datetime import datetime, timezone, timedelta

PROVIDER_LIMITS = {
    "groq": {
        "daily_requests": 14400,
        "daily_tokens": 500000,
        "rpm": 30,
        "tpm": 15000,
        "models": {
            "llama-3.1-70b-versatile": {"rpm": 30, "tpd": 500000},
            "mixtral-8x7b-32768": {"rpm": 30, "tpd": 500000},
            "gemma2-9b-it": {"rpm": 30, "tpd": 500000},
            "llama-3.3-70b-versatile": {"rpm": 30, "tpd": 500000}
        }
    },
    "gemini": {
        "daily_requests": 1500,
        "daily_tokens": 1000000,
        "rpm": 15,
        "tpm": 1000000,
        "models": {
            "gemini-1.5-flash": {"rpm": 15, "rpd": 1500},
            "gemini-1.5-flash-8b": {"rpm": 15, "rpd": 1500}
        }
    },
    "ollama": {
        "daily_requests": 999999,
        "daily_tokens": 999999,
        "rpm": 999,
        "tpm": 999999,
        "note": "Local — unlimited"
    }
}

GPT4O_PRICE_PER_1K_TOKENS = 0.005
GPT4_PRICE_PER_1K_TOKENS = 0.03
GPT35_PRICE_PER_1K_TOKENS = 0.002


class UsageTracker:
    """
    Thread-safe singleton tracking daily and session API token usage,
    provider limits, and estimated cost savings.
    """
    def __init__(self):
        self._lock = threading.Lock()
        self._session_start = datetime.now(timezone.utc)
        self._warned_thresholds = set()  # Track (provider, threshold) so toasts trigger once
        
        today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        
        self._usage = {
            "groq": {
                "today": {
                    "requests": 0,
                    "tokens_input": 0,
                    "tokens_output": 0,
                    "tokens_total": 0,
                    "date": today_str
                },
                "session": {
                    "requests": 0,
                    "tokens_total": 0
                },
                "history": []
            },
            "gemini": {
                "today": {
                    "requests": 0,
                    "tokens_input": 0,
                    "tokens_output": 0,
                    "tokens_total": 0,
                    "date": today_str
                },
                "session": {
                    "requests": 0,
                    "tokens_total": 0
                },
                "history": []
            },
            "ollama": {
                "today": {
                    "requests": 0,
                    "tokens_input": 0,
                    "tokens_output": 0,
                    "tokens_total": 0,
                    "date": today_str
                },
                "session": {
                    "requests": 0,
                    "tokens_total": 0
                },
                "history": []
            },
            "simulation": {
                "today": {
                    "requests": 0,
                    "tokens_input": 0,
                    "tokens_output": 0,
                    "tokens_total": 0,
                    "date": today_str
                },
                "session": {
                    "requests": 0,
                    "tokens_total": 0
                },
                "history": []
            }
        }

    def record_usage(self, provider: str, model: str, tokens_input: int, tokens_output: int, request_type: str = "chat"):
        provider_key = provider.lower() if provider else "groq"
        if provider_key not in self._usage:
            provider_key = "groq"

        tokens_in = max(0, int(tokens_input or 0))
        tokens_out = max(0, int(tokens_output or 0))
        tot = tokens_in + tokens_out

        with self._lock:
            today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
            p_data = self._usage[provider_key]
            
            # Check if midnight passed (new day)
            if p_data["today"]["date"] != today_str:
                # Archive yesterday to history (keep last 7 days)
                p_data["history"].insert(0, dict(p_data["today"]))
                p_data["history"] = p_data["history"][:7]
                
                # Reset today counters
                p_data["today"] = {
                    "requests": 0,
                    "tokens_input": 0,
                    "tokens_output": 0,
                    "tokens_total": 0,
                    "date": today_str
                }

            # Increment today
            p_data["today"]["requests"] += 1
            p_data["today"]["tokens_input"] += tokens_in
            p_data["today"]["tokens_output"] += tokens_out
            p_data["today"]["tokens_total"] += tot

            # Increment session
            p_data["session"]["requests"] += 1
            p_data["session"]["tokens_total"] += tot

    def estimate_tokens(self, text: str) -> int:
        if not text:
            return 0
        if isinstance(text, (dict, list)):
            text = json.dumps(text)
        words = len(str(text).split())
        return int(words * 1.3)

    def calculate_savings(self, total_tokens: int) -> dict:
        tot = max(0, int(total_tokens or 0))
        k_tokens = tot / 1000.0
        vs_gpt4o = round(k_tokens * GPT4O_PRICE_PER_1K_TOKENS, 2)
        vs_gpt4 = round(k_tokens * GPT4_PRICE_PER_1K_TOKENS, 2)
        vs_gpt35 = round(k_tokens * GPT35_PRICE_PER_1K_TOKENS, 2)
        return {
            "vs_gpt4o": vs_gpt4o,
            "vs_gpt4": vs_gpt4,
            "vs_gpt35": vs_gpt35,
            "tokens_processed": tot,
            "explanation": f"You processed {tot:,} tokens for free. Same on GPT-4o would cost ~${vs_gpt4o:.2f}"
        }

    def get_reset_time(self) -> str:
        now = datetime.now(timezone.utc)
        tomorrow = (now + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
        diff = tomorrow - now
        hours = int(diff.total_seconds() // 3600)
        minutes = int((diff.total_seconds() % 3600) // 60)
        return f"{hours}h {minutes}m"

    def get_usage_stats(self) -> dict:
        with self._lock:
            now = datetime.now(timezone.utc)
            duration_mins = round((now - self._session_start).total_seconds() / 60.0, 1)
            reset_time_str = self.get_reset_time()
            
            providers_stats = {}
            total_session_reqs = 0
            total_session_tokens = 0
            total_all_tokens = 0

            for p_name in ["groq", "gemini", "ollama"]:
                p_data = self._usage.get(p_name, {})
                today = p_data.get("today", {})
                sess = p_data.get("session", {})
                limits = PROVIDER_LIMITS.get(p_name, {})

                daily_req_cap = limits.get("daily_requests", 999999)
                daily_tok_cap = limits.get("daily_tokens", 999999)

                reqs_used = today.get("requests", 0)
                toks_used = today.get("tokens_total", 0)

                reqs_rem = max(0, daily_req_cap - reqs_used)
                toks_rem = max(0, daily_tok_cap - toks_used)

                reqs_pct = round((reqs_used / daily_req_cap) * 100, 1) if daily_req_cap else 0.0
                toks_pct = round((toks_used / daily_tok_cap) * 100, 1) if daily_tok_cap else 0.0

                max_pct = max(reqs_pct, toks_pct)
                if p_name == "ollama":
                    status = "healthy"
                elif max_pct >= 90.0:
                    status = "critical"
                elif max_pct >= 70.0:
                    status = "warning"
                else:
                    status = "healthy"

                providers_stats[p_name] = {
                    "today": {
                        "requests": reqs_used,
                        "tokens_total": toks_used,
                        "tokens_input": today.get("tokens_input", 0),
                        "tokens_output": today.get("tokens_output", 0),
                        "requests_remaining": reqs_rem,
                        "tokens_remaining": toks_rem,
                        "requests_pct_used": reqs_pct,
                        "tokens_pct_used": toks_pct,
                        "reset_in": reset_time_str
                    },
                    "session": {
                        "requests": sess.get("requests", 0),
                        "tokens_total": sess.get("tokens_total", 0)
                    },
                    "limits": limits,
                    "status": status
                }

                total_session_reqs += sess.get("requests", 0)
                total_session_tokens += sess.get("tokens_total", 0)
                total_all_tokens += toks_used

            savings = self.calculate_savings(total_all_tokens)

            return {
                "session_start": self._session_start.isoformat(),
                "session_duration_minutes": duration_mins,
                "providers": providers_stats,
                "totals": {
                    "all_time_requests": total_session_reqs,
                    "session_requests": total_session_reqs,
                    "session_tokens": total_session_tokens,
                    "estimated_savings_usd": savings["vs_gpt4o"]
                },
                "savings": savings
            }

    def get_warnings(self) -> list:
        stats = self.get_usage_stats()
        warnings = []
        for p_name, p_data in stats["providers"].items():
            if p_name == "ollama":
                continue
            req_pct = p_data["today"]["requests_pct_used"]
            tok_pct = p_data["today"]["tokens_pct_used"]
            max_pct = max(req_pct, tok_pct)

            if max_pct >= 90.0:
                warnings.append({
                    "level": "critical",
                    "provider": p_name,
                    "message": f"{p_name.capitalize()} daily limit nearly reached ({max_pct}% used)",
                    "pct_used": max_pct,
                    "suggestion": f"Switch to another provider for remaining evaluations"
                })
            elif max_pct >= 70.0:
                warnings.append({
                    "level": "warning",
                    "provider": p_name,
                    "message": f"{p_name.capitalize()} at {max_pct}% daily limit",
                    "pct_used": max_pct,
                    "suggestion": "Consider switching to Gemini or Ollama"
                })
        return warnings


tracker = UsageTracker()
