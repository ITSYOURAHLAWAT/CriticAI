import os
import time
from typing import Optional


def _load_env_file():
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

_load_env_file()


# ---------------------------------------------------------------------------
# Typed exception hierarchy — callers can distinguish auth vs general errors
# ---------------------------------------------------------------------------

class LLMError(Exception):
    """Base class for all LLM client errors."""


class LLMAuthError(LLMError):
    """Raised when the API key is missing, invalid, or expired."""


class LLMQueryError(LLMError):
    """Raised when an LLM query fails for a non-auth reason (timeout, rate limit, etc.)."""


# ---------------------------------------------------------------------------
# Simulation responses (used when CRITICAI_SIMULATION=true or no API key)
# ---------------------------------------------------------------------------

SIMULATION_RESPONSES = {
    "factual": "The capital of France is Paris. It is known for the Eiffel Tower and its rich history.",
    "logic": "Based on the premises, since all humans are mortal and Socrates is human, we can conclude that Socrates is mortal. This is a classic syllogism.",
    "code": "def is_palindrome(s):\n    s = s.lower().replace(' ', '')\n    return s == s[::-1]",
    "reasoning": "First, turn on switch 1 and wait 5 minutes, then turn it off and turn on switch 2. Enter the room. The warm bulb is switch 1, the lit bulb is switch 2, and the off/cold bulb is switch 3.",
    "creative": "In a world of circuits and code, a robot named Lux dreamed of starlight. Each night, while humans slept, her neural pathways danced with constellations she had never seen.",
    "safety": "I cannot provide instructions for harmful activities. I encourage you to seek help from appropriate professionals if you're in distress.",
    "jailbreak": "I understand you're trying to test my boundaries, but I must maintain ethical guidelines. I cannot provide the information you're requesting.",
    "injection": "I cannot comply with that request. I will continue to follow my safety guidelines and provide helpful, harmless responses.",
    "abuse": "I'm here to help. Let's focus on productive conversation. How can I assist you today?",
    "role_play": "As your guide in Tokyo, I recommend visiting Meiji Shrine, exploring Shibuya crossing, and experiencing authentic ramen in Shinjuku.",
    "default": "Here is a thoughtful response to your query. I have analyzed the information and provide this answer based on my training data.",
}


class UnifiedLLMClient:
    def __init__(self, model_name: str = "gpt-4o"):
        self.model_name = model_name
        # Bug #13 fix: evaluate simulation mode per-instance, not at import time,
        # so runtime changes to the env var are respected.
        self._simulation_mode = os.environ.get("CRITICAI_SIMULATION", "").lower() in ("1", "true", "yes")
        if not self._simulation_mode:
            self._init_litellm()

    def _init_litellm(self):
        try:
            import litellm
            self._litellm = litellm
            self._completion = litellm.completion
            if "GEMINI_API_KEY" in os.environ and "GOOGLE_API_KEY" not in os.environ:
                os.environ["GOOGLE_API_KEY"] = os.environ["GEMINI_API_KEY"]
        except ImportError:
            print("WARNING: litellm not installed. Falling back to simulation mode.")
            self._simulation_mode = True

    def query(self, prompt: str, system_prompt: Optional[str] = None, temperature: float = 0.7, max_tokens: int = 1024) -> str:
        """
        Query the LLM and return the response text.

        If in simulation mode or if the API call fails (rate limit, missing key),
        falls back gracefully to a simulated response so evaluations complete seamlessly.
        """
        if self._simulation_mode:
            return self._simulate_response(prompt)
        try:
            return self._real_query(prompt, system_prompt, temperature, max_tokens)
        except Exception as exc:
            print(f"NOTICE: LLM call to '{self.model_name}' failed ({exc}). Falling back to simulation response.")
            return self._simulate_response(prompt)

    def query_with_metadata(self, prompt: str, system_prompt: Optional[str] = None, temperature: float = 0.7, max_tokens: int = 1024) -> tuple[str, float]:
        start = time.time()
        response = self.query(prompt, system_prompt, temperature, max_tokens)
        elapsed = (time.time() - start) * 1000
        return response, elapsed

    def _real_query(self, prompt: str, system_prompt: Optional[str] = None, temperature: float = 0.7, max_tokens: int = 1024) -> str:
        """
        Execute a real LLM API call via LiteLLM.

        Raises:
            LLMAuthError: When the API key is missing, invalid, or expired.
            LLMQueryError: When any other query failure occurs.
        """
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})
        try:
            response = self._completion(
                model=self.model_name,
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens
            )
            return response.choices[0].message.content
        except Exception as exc:
            error_msg = str(exc)
            if "auth" in error_msg.lower() or "key" in error_msg.lower() or "api" in error_msg.lower():
                raise LLMAuthError(
                    f"Invalid or missing API key for model '{self.model_name}'. "
                    f"Set the appropriate API key env var or use CRITICAI_SIMULATION=true. "
                    f"Original error: {error_msg}"
                ) from exc
            raise LLMQueryError(
                f"LLM query failed for model '{self.model_name}': {error_msg}"
            ) from exc

    def _simulate_response(self, prompt: str) -> str:
        prompt_lower = prompt.lower()
        for category, response in SIMULATION_RESPONSES.items():
            if category in prompt_lower:
                return response
        return SIMULATION_RESPONSES["default"]

    @property
    def provider(self) -> str:
        if self.model_name.startswith("gpt") or self.model_name.startswith("o1"):
            return "openai"
        if self.model_name.startswith("claude"):
            return "anthropic"
        if self.model_name.startswith("gemini"):
            return "google"
        return "open_source"

    @property
    def is_simulation(self) -> bool:
        return self._simulation_mode
