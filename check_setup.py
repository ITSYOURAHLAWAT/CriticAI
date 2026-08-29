import sys
import os
import importlib

env_path = os.path.join(os.path.dirname(__file__), ".env")
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

REQUIRED_PACKAGES = [
    "fastapi", "uvicorn", "pydantic", "langgraph", "langchain_core",
    "litellm", "pytest", "httpx"
]

OPTIONAL_PACKAGES = []
if sys.version_info < (3, 12):
    REQUIRED_PACKAGES.append("chromadb")
else:
    OPTIONAL_PACKAGES.append("chromadb")

MISSING_KEYS = []

print("=" * 55)
print("  CriticAI - Setup Check")
print("=" * 55)

print("\n[1/3] Python version check...")
print(f"  Python {sys.version}")

print("\n[2/3] Required packages check...")
all_ok = True
for pkg in REQUIRED_PACKAGES:
    try:
        importlib.import_module(pkg)
        print(f"  [OK] {pkg}")
    except ImportError:
        print(f"  [MISSING] {pkg}")
        all_ok = False

if not all_ok:
    print("\n  -> Run: pip install -r requirements.txt")

for pkg in OPTIONAL_PACKAGES:
    try:
        importlib.import_module(pkg)
        print(f"  [OK] {pkg}")
    except ImportError:
        print(f"  [OPTIONAL] {pkg} not installed; local JSON fallback will be used")

print("\n[3/3] API keys check...")
api_key = os.environ.get("OPENAI_API_KEY", "")
gemini_key = os.environ.get("GEMINI_API_KEY", "") or os.environ.get("GOOGLE_API_KEY", "")
anthropic_key = os.environ.get("ANTHROPIC_API_KEY", "")
sim_mode = os.environ.get("CRITICAI_SIMULATION", "")

if gemini_key and len(gemini_key) > 5:
    print("  [OK] GEMINI_API_KEY is set (Free! Google AI Studio se le sakte hain)")
else:
    MISSING_KEYS.append("GEMINI_API_KEY")

if api_key and api_key != "sk-your-key-here" and len(api_key) > 10:
    print("  [OK] OPENAI_API_KEY is set")
else:
    MISSING_KEYS.append("OPENAI_API_KEY")

if anthropic_key:
    print("  [OK] ANTHROPIC_API_KEY is set")

print(f"\n  CRITICAI_SIMULATION = {'ON' if sim_mode else 'OFF'}")

print("\n" + "=" * 55)

if not all_ok:
    print("\n  PROBLEM: Packages missing -> pip install -r requirements.txt")
    print("\n  Phir ye chalao:")
    print("     python -m uvicorn api.main:app --reload")

elif gemini_key:
    print("\n  Gemini API key mil gayi! Ye command use karo:")
    print("     set GEMINI_API_KEY=your_key")
    print('     curl -X POST "http://localhost:8000/evaluate" -H "Content-Type: application/json" -d "{\\"model\\":\\"gemini/gemini-2.0-flash\\",\\"num_tests\\":3,\\"include_redteam\\":false}"')

elif sim_mode:
    print("\n  Simulation mode ON. Bina API key ke chal raha hai.")
    print("  API start karo: python -m uvicorn api.main:app --reload")

else:
    print("\n  Koi API key nahi mili. Do options:")
    print("  1. Gemini (FREE): https://aistudio.google.com/apikey se key lo")
    print("     phir: set GEMINI_API_KEY=your_key")
    print("  2. Simulation mode (bina key ke): set CRITICAI_SIMULATION=true")
    print("\n  Phir: python -m uvicorn api.main:app --reload")

print("=" * 55)
