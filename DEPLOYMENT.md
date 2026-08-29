# CriticAI Deployment Guide ðŸš€

## ðŸŒ Live URLs (fill in after deploying)
| Service | URL |
|---------|-----|
| Frontend | _add after Vercel deploy_ |
| Backend API | _add after Render deploy_ |
| API Docs | `{backend-url}/docs` |

---

## PART 1 â€” Backend â†’ Render.com (Free)

### Step 1: Create a Render account
Go to **https://render.com** â†’ click **"Get Started for Free"** â†’ sign up with GitHub.

### Step 2: Deploy the backend
1. Click **"New +"** â†’ **"Web Service"**
2. Select **"Build and deploy from a Git repository"**
3. Connect your GitHub repo: **`ITSYOURAHLAWAT/CriticAI`**
4. Configure the service:
   | Field | Value |
   |-------|-------|
   | Name | `criticai-backend` |
   | Region | Oregon (US West) |
   | Branch | `main` |
   | Runtime | **Python 3** |
   | Root Directory | _(leave blank)_ |
   | Build Command | `pip install -r requirements.txt` |
   | Start Command | `uvicorn api.main:app --host 0.0.0.0 --port $PORT` |
   | Instance Type | **Free** |

5. Scroll down to **"Environment Variables"** â†’ add:
   | Key | Value |
   |-----|-------|
   | `GROQ_API_KEY` | your key from console.groq.com |
   | `GEMINI_API_KEY` | your key from aistudio.google.com |
   | `ENVIRONMENT` | `production` |

6. Click **"Create Web Service"**
7. Wait **3â€“5 minutes** for first build to finish.

### Step 3: Verify backend is live
Visit: `https://criticai-backend.onrender.com/health`
Should return: `{"status": "healthy", "service": "criticai"}`

> **Note your Render backend URL** â€” you'll need it in Part 2.

---

## PART 2 â€” Frontend â†’ Vercel (Free)

### Step 1: Create a Vercel account
Go to **https://vercel.com** â†’ click **"Sign Up"** â†’ continue with **GitHub**.

### Step 2: Deploy the frontend
1. Click **"Add New..."** â†’ **"Project"**
2. Click **"Import"** next to **`ITSYOURAHLAWAT/CriticAI`**
3. Configure:
   | Field | Value |
   |-------|-------|
   | Framework Preset | **Vite** |
   | Root Directory | **`frontend`** â† important! |
   | Build Command | `npm run build` |
   | Output Directory | `dist` |

4. Expand **"Environment Variables"** â†’ add:
   | Key | Value |
   |-----|-------|
   | `VITE_API_URL` | `https://criticai-backend.onrender.com` |
   _(replace with your actual Render URL from Part 1)_

5. Click **"Deploy"**
6. Wait ~1 minute.
7. Your app is live at: `https://criticai-xxx.vercel.app`

### Step 3: Update CORS (one-time after first deploy)
Once you know your Vercel URL, update `api/main.py` line ~68:

```python
CORS_ORIGINS = [
    "https://your-actual-url.vercel.app",   # â† replace this
    "https://criticai.vercel.app",
]
```

Then commit & push â€” Render auto-redeploys in ~2 minutes.

---

## ðŸ†“ Free API Keys

| Provider | URL | Free Limit | Card Required? |
|----------|-----|------------|----------------|
| Groq | console.groq.com | 14,400 req/day | âŒ No |
| Gemini | aistudio.google.com | 1,500 req/day | âŒ No |
| Ollama | ollama.com | Unlimited (local only) | âŒ No |

---

## âš ï¸ Free Tier Limitations

| Limitation | Impact |
|-----------|--------|
| Render sleeps after **15 min** of inactivity | First request takes 30â€“50 sec to wake |
| SQLite resets on Render restart | Eval history lost on redeploy |
| No persistent disk on free Render | Use for demos; not for production data |
| Ollama requires local machine | Not available on cloud deploy |

---

## ðŸ”„ Redeploying After Code Changes

```bash
# In d:\Critic Ai\criticai
git add .
git commit -m "your change description"
git push origin main
```

Both Render and Vercel auto-detect the push and redeploy automatically.

