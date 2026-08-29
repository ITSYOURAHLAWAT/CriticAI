FROM python:3.11-slim

# ── Security: run as non-root user ────────────────────────────────────────────
RUN addgroup --system criticai && adduser --system --ingroup criticai criticai

WORKDIR /app

# ── System dependencies ────────────────────────────────────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# ── Python dependencies (cached layer) ────────────────────────────────────────
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ── Copy application source ────────────────────────────────────────────────────
COPY --chown=criticai:criticai . .

# ── Create writable directories for volumes ────────────────────────────────────
RUN mkdir -p /app/reports /app/chroma_data && \
    chown -R criticai:criticai /app/reports /app/chroma_data

# ── Environment ────────────────────────────────────────────────────────────────
ENV PYTHONPATH=/app
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV DEFAULT_PROVIDER=groq

# ── Switch to non-root user ────────────────────────────────────────────────────
USER criticai

EXPOSE 8000

# ── Health check ───────────────────────────────────────────────────────────────
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# ── Production server (no --reload) ───────────────────────────────────────────
CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000", \
     "--workers", "2", "--log-level", "info"]
