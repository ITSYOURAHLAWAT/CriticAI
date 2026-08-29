# Critic AI

> **Critic AI** – a data‑driven, AI‑powered pipeline for automated testing, model evaluation, and continuous quality monitoring.

---

## Table of Contents

- [What is Critic AI?](#what-is-critic-ai)
- [Key Features](#key-features)
- [Architecture Overview](#architecture-overview)
- [Getting Started](#getting-started)
- [Usage](#usage)
- [Testing & CI](#testing--ci)
- [Contributing](#contributing)
- [Roadmap](#roadmap)
- [License](#license)
- [Acknowledgements](#acknowledgements)

---

## What is Critic AI?

Critic AI is a **full‑stack, end‑to‑end** framework that turns raw data into actionable insights. It:

1. **Ingests** datasets from a variety of sources (CSV, JSON, SQL, APIs).
2. **Runs** a suite of automated tests – unit, integration, performance, and data‑quality checks.
3. **Scores** models using custom metrics and generates comprehensive reports.
4. **Visualises** results in a web dashboard powered by the `frontend` package.
5. **Deploys** via Docker and Docker‑Compose for reproducible environments.

The project is built with Python 3.11+, Docker, and a lightweight SQLite database for persistence.

---

## Key Features

| Feature | Description |
|---------|-------------|
| **Automated Test Runner** | `ab_tester.py` orchestrates test suites, logs failures, and produces JSON/HTML reports. |
| **Model Evaluation** | `rag/`, `orchestrator/`, and `train/` provide pipelines for training, fine‑tuning, and evaluating LLMs. |
| **Data Quality Checks** | `dataset_parser.py` validates schemas, checks for missing values, and flags outliers. |
| **Continuous Integration** | `docker-compose.yml` and `docker-start.bat` enable CI pipelines on GitHub Actions or local runners. |
| **Web Dashboard** | The `frontend/` folder contains a React/Vite app that visualises test results, model metrics, and experiment logs. |
| **Extensible Plugin System** | Add new test modules or metrics by extending the `tests/` package. |
| **CLI Interface** | `cli.py` offers a command‑line interface for common tasks (run tests, train models, generate reports). |

---

## Architecture Overview

```
┌───────────────────────┐
│  Frontend (React)     │
│  └─ /frontend          │
├───────────────────────┤
│  API Layer (FastAPI)  │
│  └─ /api               │
├───────────────────────┤
│  Core Engine (Python) │
│  ├─ ab_tester.py      │
│  ├─ dataset_parser.py │
│  ├─ orchestrator/     │
│  ├─ rag/              │
│  └─ train/            │
├───────────────────────┤
│  Database (SQLite)    │
│  └─ criticai.db       │
└───────────────────────┘
```

The **CLI** (`cli.py`) is the entry point for most operations. It delegates to the core engine, which in turn uses the `tests/` package for test discovery and execution. Results are persisted in `criticai.db` and can be visualised via the web dashboard.

---

## Getting Started

### Prerequisites

- **Python 3.11+**
- **Docker** (for containerised runs)
- **Git**

### Clone the repo

```bash
git clone https://github.com/your-org/critic-ai.git
cd critic-ai
```

### Create a virtual environment

```bash
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

### Initialise the database

```bash
python database.py init
```

### Run the test suite locally

```bash
python ab_tester.py --all
```

The results will be written to `reports/` and logged to the console.

### Start the web dashboard

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173` to view the dashboard.

---

## Usage

| Command | Description |
|---------|-------------|
| `python cli.py test` | Run all tests and generate a report. |
| `python cli.py train --model gpt-4o` | Train a new model using the orchestrator. |
| `python cli.py report --format html` | Generate an HTML report from the latest run. |
| `python cli.py serve` | Start the FastAPI backend (used by the dashboard). |

For a full list of options, run:

```bash
python cli.py --help
```

---

## Testing & CI

The project ships with a comprehensive test suite located in `tests/`. Tests are executed by `ab_tester.py` and can be run locally or via CI.

### Local Test Run

```bash
python ab_tester.py --all
```

### Docker‑Compose CI

```bash
docker-compose up --build
```

This will spin up the API, run the tests, and expose the dashboard on `localhost:5173`.

### GitHub Actions

A sample workflow is provided in `.github/workflows/ci.yml`. It:

1. Checks out the repo.
2. Sets up Python & Docker.
3. Installs dependencies.
4. Runs `ab_tester.py`.
5. Uploads test reports as artifacts.

---

## Contributing

We welcome contributions! Please follow these steps:

1. **Fork** the repository.
2. Create a feature branch: `git checkout -b feature/your-feature`.
3. Write tests for your changes.
4. Run the test suite to ensure everything passes.
5. Submit a pull request.

### Code Style

- Python: `black`, `isort`, `flake8`.
- JavaScript/React: `prettier`.

Run the linters locally:

```bash
pre-commit run --all-files
```

---

## Roadmap

| Milestone | Target | Description |
|-----------|--------|-------------|
| **v1.0** | Q3 2026 | Core test runner + basic dashboard. |
| **v1.1** | Q4 2026 | Full LLM orchestrator + training pipeline. |
| **v2.0** | 2027 | Multi‑model support, cloud deployment, and advanced analytics. |

---

## License

MIT © 2026 Critic AI. See the [LICENSE](LICENSE) file for details.

---

## Acknowledgements

- The open‑source community for the libraries we depend on.
- The contributors who have already helped shape this project.
- The AI research community for inspiring the evaluation pipelines.
