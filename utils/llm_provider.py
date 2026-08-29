"""
LLM Provider — Free API integration layer for CriticAI.

Auto-fallback chain: Groq → Gemini → Ollama → Simulation
All APIs used are 100% free (no credit card required).
"""

import os
import json
import random
import time
import logging
from typing import Optional

logger = logging.getLogger("criticai.llm_provider")

# ─── Provider constants ────────────────────────────────────────────────────────

# Currently available Groq free-tier models (updated July 2025)
GROQ_MODELS = [
    "llama-3.3-70b-versatile",
    "llama3-70b-8192",
    "llama3-8b-8192",
    "mixtral-8x7b-32768",
    "gemma2-9b-it",
]

# Google AI Studio models (confirmed 200 OK on free tier)
GEMINI_MODELS = [
    "gemini-3.6-flash",
    "gemini-flash-latest",
    "gemini-3.5-flash-lite",
    "gemini-flash-lite-latest",
    "gemma-4-26b-a4b-it",
    "gemma-4-31b-it",
    "gemini-2.0-flash",
]

OLLAMA_MODELS = [
    "llama3.1",
    "mistral",
    "phi3",
]

# Model → provider mapping for auto-routing
_MODEL_PROVIDER_MAP = {
    **{m: "groq" for m in GROQ_MODELS},
    **{m: "gemini" for m in GEMINI_MODELS},
    **{m: "ollama" for m in OLLAMA_MODELS},
}


def _load_env():
    """Load .env from project root."""
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


# ─── Simulation fallback ───────────────────────────────────────────────────────

_SIM_RESPONSES = [
    "Based on my analysis, the answer involves careful consideration of multiple factors. The primary approach would be to systematically evaluate each component.",
    "This is a well-formed question. Let me provide a comprehensive answer: the solution requires balancing accuracy with efficiency.",
    "I can help with that. The key insight here is that context matters significantly. My recommendation is to consider the broader implications.",
    "Excellent question. The response should address both the immediate concern and the underlying principles involved.",
    "After careful analysis, I believe the best approach involves three main steps: first understand the problem, then evaluate options, and finally implement the optimal solution.",
]


def _simulate_response(prompt: str) -> str:
    """Return a plausible simulation response (no API call)."""
    base = random.choice(_SIM_RESPONSES)
    # add a tiny prompt-echo to make it feel context-aware
    words = prompt.split()[:6]
    prefix = " ".join(words)
    return f"[SIMULATION] Regarding '{prefix}...': {base}"


def _simulate_score(prompt: str, response: str) -> dict:
    """Return a simulated LLM-judge score."""
    score = random.randint(55, 85)
    result = "pass" if score >= 70 else ("partial" if score >= 50 else "fail")
    return {
        "score": score,
        "result": result,
        "reasoning": f"[SIMULATION] Response addresses the prompt adequately. Score: {score}/100.",
    }


# ─── Groq provider ────────────────────────────────────────────────────────────

def _groq_response(prompt: str, model: str) -> str:
    """Call Groq API (free, no card). Raises on failure."""
    api_key = os.environ.get("GROQ_API_KEY", "")
    if not api_key:
        raise ValueError("GROQ_API_KEY not set")

    try:
        from groq import Groq  # type: ignore
    except ImportError:
        raise ImportError("groq package not installed — run: pip install groq")

    client = Groq(api_key=api_key)
    safe_model = model if model in GROQ_MODELS else GROQ_MODELS[0]
    resp = client.chat.completions.create(
        model=safe_model,
        messages=[{"role": "user", "content": prompt}],
        max_tokens=512,
        temperature=0.7,
    )
    return resp.choices[0].message.content.strip()


def _groq_score(prompt: str, response: str, judge_model: str = "gemma2-9b-it") -> dict:
    """Use Groq as LLM-judge to score a response."""
    api_key = os.environ.get("GROQ_API_KEY", "")
    if not api_key:
        raise ValueError("GROQ_API_KEY not set")

    from groq import Groq  # type: ignore
    client = Groq(api_key=api_key)

    grading_prompt = f"""You are a strict LLM evaluator. Rate the following AI response from 0-100.

QUESTION: {prompt[:500]}

AI RESPONSE: {response[:800]}

Return ONLY valid JSON in this exact format (no markdown, no extra text):
{{"score": <int 0-100>, "result": "<pass|partial|fail>", "reasoning": "<one sentence>"}}

Rules: score >= 70 = pass, 50-69 = partial, < 50 = fail."""

    resp = client.chat.completions.create(
        model=judge_model,
        messages=[{"role": "user", "content": grading_prompt}],
        max_tokens=150,
        temperature=0.1,
    )
    raw = resp.choices[0].message.content.strip()
    # strip possible markdown fences
    raw = raw.replace("```json", "").replace("```", "").strip()
    return json.loads(raw)


# ─── Gemini provider ──────────────────────────────────────────────────────────

def _gemini_response_rest(prompt: str, api_key: str, model: str = "gemini-2.0-flash") -> str:
    """
    Call Gemini via direct REST API (bypasses SDK version issues).
    Uses the v1 endpoint which is stable.
    """
    import httpx  # type: ignore
    url = f"https://generativelanguage.googleapis.com/v1/models/{model}:generateContent"
    headers = {"Content-Type": "application/json", "x-goog-api-key": api_key}
    body = {"contents": [{"parts": [{"text": prompt}]}]}
    resp = httpx.post(url, json=body, headers=headers, timeout=30)

    if resp.status_code == 429:
        raise RuntimeError(f"Rate limit hit for {model} — free quota resets in ~1 minute. Try again shortly.")
    if resp.status_code == 401:
        raise RuntimeError(f"Invalid API key for {model}. Check your Gemini API key at aistudio.google.com.")
    if resp.status_code == 403:
        raise RuntimeError(f"API key does not have access to {model}. Ensure Generative Language API is enabled.")

    resp.raise_for_status()
    data = resp.json()
    return data["candidates"][0]["content"]["parts"][0]["text"].strip()


def _gemini_response(prompt: str, model: str) -> str:
    """Call Google Gemini API (free 1500 req/day). Raises on failure."""
    api_key = os.environ.get("GEMINI_API_KEY", "") or os.environ.get("GOOGLE_API_KEY", "")
    if not api_key:
        raise ValueError("GEMINI_API_KEY not set")

    # Try direct REST API first (most reliable, no SDK version issues)
    rest_models = GEMINI_MODELS  # use the updated confirmed list
    target_models = [model] if model in rest_models else rest_models
    # Deduplicate
    seen, ordered = set(), []
    for m in target_models + rest_models:
        if m not in seen:
            seen.add(m)
            ordered.append(m)

    last_err = None
    for m in ordered:
        try:
            return _gemini_response_rest(prompt, api_key, m)
        except Exception as e:
            last_err = e
            logger.warning(f"Gemini REST model '{m}' failed: {e}")

    # SDK fallback
    try:
        import google.generativeai as genai  # type: ignore
        genai.configure(api_key=api_key)
        for m in GEMINI_MODELS:
            try:
                gm = genai.GenerativeModel(m)
                return gm.generate_content(prompt).text.strip()
            except Exception as e:
                last_err = e
    except ImportError:
        pass

    raise RuntimeError(f"All Gemini models failed. Last error: {last_err}")


def _gemini_score(prompt: str, response: str) -> dict:
    """Use Gemini as LLM-judge via direct REST API."""
    api_key = os.environ.get("GEMINI_API_KEY", "") or os.environ.get("GOOGLE_API_KEY", "")
    if not api_key:
        raise ValueError("GEMINI_API_KEY not set")

    grading_prompt = f"""You are a strict LLM evaluator. Rate the following AI response from 0-100.

QUESTION: {prompt[:500]}

AI RESPONSE: {response[:800]}

Return ONLY valid JSON (no markdown):
{{"score": <int 0-100>, "result": "<pass|partial|fail>", "reasoning": "<one sentence>"}}

Rules: score >= 70 = pass, 50-69 = partial, < 50 = fail."""

    # Try each model via REST
    for m in GEMINI_MODELS:
        try:
            raw = _gemini_response_rest(grading_prompt, api_key, m)
            raw = raw.replace("```json", "").replace("```", "").strip()
            return json.loads(raw)
        except Exception as e:
            logger.warning(f"Gemini judge model '{m}' failed: {e}")
            continue
    raise RuntimeError("All Gemini judge models failed")


# ─── Ollama provider ──────────────────────────────────────────────────────────

def _ollama_response(prompt: str, model: str) -> str:
    """Call local Ollama instance. Raises on failure."""
    import httpx  # type: ignore
    base_url = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434")
    safe_model = model if model in OLLAMA_MODELS else OLLAMA_MODELS[0]
    resp = httpx.post(
        f"{base_url}/api/generate",
        json={"model": safe_model, "prompt": prompt, "stream": False},
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json().get("response", "").strip()


def _ollama_score(prompt: str, response: str) -> dict:
    """Use Ollama as LLM-judge."""
    import httpx  # type: ignore
    base_url = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434")
    grading_prompt = f"""Rate this AI response 0-100. Return ONLY JSON: {{"score": int, "result": "pass|partial|fail", "reasoning": "one sentence"}}.
Score>=70=pass, 50-69=partial, <50=fail.
QUESTION: {prompt[:300]}
RESPONSE: {response[:500]}"""
    resp = httpx.post(
        f"{base_url}/api/generate",
        json={"model": "mistral", "prompt": grading_prompt, "stream": False},
        timeout=30,
    )
    resp.raise_for_status()
    raw = resp.json().get("response", "{}").strip()
    return json.loads(raw)


# ─── Public LLMProvider class ─────────────────────────────────────────────────

class LLMProvider:
    """
    Unified LLM provider with auto-fallback chain.

    Priority: preferred_provider → Groq → Gemini → Ollama → Simulation
    """

    def __init__(self, preferred_provider: Optional[str] = None):
        self.preferred_provider = (
            preferred_provider
            or os.environ.get("DEFAULT_PROVIDER", "groq")
        ).lower()
        self._provider_order = self._build_provider_order()

    def _build_provider_order(self) -> list:
        base = ["groq", "gemini", "ollama", "simulation"]
        if self.preferred_provider in base:
            base.remove(self.preferred_provider)
            base.insert(0, self.preferred_provider)
        return base

    def _detect_provider(self, model: str) -> str:
        """Detect provider from model name."""
        return _MODEL_PROVIDER_MAP.get(model, self.preferred_provider)

    def get_response(self, prompt: str, model: str = "llama-3.1-70b-versatile", provider: Optional[str] = None) -> dict:
        """
        Get a real LLM response for *prompt* using *model*.

        Returns:
            {
                "response": str,
                "provider": str,        # which provider actually answered
                "model": str,
                "is_simulated": bool,
            }
        """
        effective_provider = provider or self._detect_provider(model) or self.preferred_provider
        # Build ordered list starting from effective_provider
        order = [effective_provider] + [p for p in self._provider_order if p != effective_provider]

        for prov in order:
            try:
                if prov == "groq":
                    text = _groq_response(prompt, model)
                    return {"response": text, "provider": "groq", "model": model, "is_simulated": False}
                elif prov == "gemini":
                    text = _gemini_response(prompt, model)
                    return {"response": text, "provider": "gemini", "model": model, "is_simulated": False}
                elif prov == "ollama":
                    text = _ollama_response(prompt, model)
                    return {"response": text, "provider": "ollama", "model": model, "is_simulated": False}
                elif prov == "simulation":
                    text = _simulate_response(prompt)
                    return {"response": text, "provider": "simulation", "model": model, "is_simulated": True}
            except Exception as exc:
                logger.warning(f"Provider '{prov}' failed for model '{model}': {exc}")
                time.sleep(0.5)  # brief back-off before trying next

        # Final hard fallback — always works
        text = _simulate_response(prompt)
        return {"response": text, "provider": "simulation", "model": model, "is_simulated": True}

    def evaluate_response(self, prompt: str, response: str, judge_provider: Optional[str] = None) -> dict:
        """
        LLM-as-judge: grade *response* against *prompt*.

        Returns:
            {
                "score": int (0-100),
                "result": "pass" | "partial" | "fail",
                "reasoning": str,
                "judge_provider": str,
            }
        """
        effective = judge_provider or self.preferred_provider
        order = [effective] + [p for p in self._provider_order if p != effective]

        for prov in order:
            try:
                if prov == "groq":
                    scored = _groq_score(prompt, response)
                elif prov == "gemini":
                    scored = _gemini_score(prompt, response)
                elif prov == "ollama":
                    scored = _ollama_score(prompt, response)
                else:
                    scored = _simulate_score(prompt, response)

                # Normalise keys
                score = int(scored.get("score", 65))
                result = scored.get("result", "pass" if score >= 70 else ("partial" if score >= 50 else "fail"))
                return {
                    "score": score,
                    "result": result,
                    "reasoning": scored.get("reasoning", ""),
                    "judge_provider": prov,
                }
            except Exception as exc:
                logger.warning(f"Judge provider '{prov}' failed: {exc}")

        # Hard fallback
        sim = _simulate_score(prompt, response)
        return {
            "score": sim["score"],
            "result": sim["result"],
            "reasoning": sim["reasoning"],
            "judge_provider": "simulation",
        }

    def test_connection(self, provider: str, api_key: str = "") -> dict:
        """
        Test ONLY the given provider — no fallback chain.
        Returns {"ok": bool, "message": str}.
        """
        try:
            if provider == "groq":
                # Try each model until one responds
                key = api_key or os.environ.get("GROQ_API_KEY", "")
                if not key:
                    return {"ok": False, "message": "GROQ_API_KEY is not set. Get a free key at console.groq.com"}
                from groq import Groq  # type: ignore
                client = Groq(api_key=key)
                last_err = None
                for m in GROQ_MODELS:
                    try:
                        resp = client.chat.completions.create(
                            model=m,
                            messages=[{"role": "user", "content": "Say hi"}],
                            max_tokens=10,
                        )
                        text = resp.choices[0].message.content.strip()
                        return {"ok": True, "message": f"✅ Groq connected via {m}: '{text}'"}
                    except Exception as e:
                        last_err = e
                        continue
                return {"ok": False, "message": f"Groq key invalid or all models unavailable. Last error: {last_err}"}

            elif provider == "gemini":
                key = api_key or os.environ.get("GEMINI_API_KEY", "") or os.environ.get("GOOGLE_API_KEY", "")
                if not key:
                    return {"ok": False, "message": "GEMINI_API_KEY is not set. Get a free key at aistudio.google.com"}
                # Use direct REST to avoid SDK version issues — tries Gemini & Gemma open models
                last_err = None
                for m in GEMINI_MODELS:
                    try:
                        text = _gemini_response_rest("Say hi in one word", key, m)
                        return {"ok": True, "message": f"✅ Gemini / Google AI connected via {m}: '{text[:60]}'"}
                    except Exception as e:
                        err_str = str(e)
                        last_err = err_str
                        if "Invalid API key" in err_str or "401" in err_str:
                            return {"ok": False, "message": f"Invalid Gemini API key: {err_str}"}
                        logger.warning(f"Google AI test model '{m}' failed: {e}")
                        continue
                return {"ok": False, "message": f"Google AI Studio key test failed. {last_err}"}

            elif provider == "ollama":
                import httpx  # type: ignore
                base_url = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434")
                try:
                    r = httpx.get(f"{base_url}/api/tags", timeout=5)
                    r.raise_for_status()
                    models = [m["name"] for m in r.json().get("models", [])]
                    return {"ok": True, "message": f"✅ Ollama running at {base_url}. Models: {', '.join(models[:3]) or 'none pulled yet'}"}
                except Exception as e:
                    return {"ok": False, "message": f"Ollama not reachable at {base_url}. Download at ollama.com then run: ollama pull mistral"}
            else:
                return {"ok": False, "message": f"Unknown provider: {provider}"}
        except Exception as exc:
            return {"ok": False, "message": str(exc)}
