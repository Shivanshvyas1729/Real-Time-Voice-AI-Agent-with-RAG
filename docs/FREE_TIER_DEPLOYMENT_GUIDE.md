# 🚀 Free-Tier Production Deployment Guide

This guide provides a comprehensive, step-by-step walkthrough to deploy the **Real-Time Voice AI Agent & RAG System** using 100% **FREE** cloud hosting services (**Vercel**, **Render**, **Koyeb**, and **MongoDB Atlas**).

---

## 🏗️ Architecture & System Flow

```mermaid
flowchart LR
    subgraph ClientBrowser["User Browser / Client"]
        ReactUI["Vite + React UI<br/>(Hosted on Vercel - Free)"]
    end

    subgraph BackendCloud["Free Cloud Backend Service"]
        FastAPI["FastAPI Voice & RAG Service<br/>(Hosted on Render / Koyeb - Free)"]
    end

    subgraph DBCloud["Free Cloud Database"]
        Mongo["MongoDB Atlas M0<br/>Vector Search Cluster"]
    end

    subgraph ExternalAPIs["External AI Cloud Services"]
        STT["Deepgram STT"]
        LLM["Groq LLM"]
        TTS["ElevenLabs TTS"]
    end

    ReactUI -->|"1. HTTPS / WSS Streaming"| FastAPI
    FastAPI -->|"2. Vector Search Queries"| Mongo
    FastAPI -->|"3. Streaming Audio APIs"| ExternalAPIs
```

---

## 🗝️ Required API Keys & Environment Variables Matrix

Before deploying, ensure you have gathered your API keys from each provider. Refer to `deployment.md` for secret specifications.

| Variable Name | Required By | Description / Example Value | Where to Get |
| :--- | :--- | :--- | :--- |
| `MONGO_URL` | Backend | Connection string: `mongodb+srv://user:pass@cluster.mongodb.net/` | [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) |
| `DB_NAME` | Backend | Database name: `voice_agent` | MongoDB Atlas |
| `DEEPGRAM_API_KEY` | Backend | Speech-to-Text (STT) transcription key | [Deepgram Console](https://console.deepgram.com/) |
| `GROQ_API_KEY` | Backend | Ultra-fast Llama 3 LLM inference key | [Groq Console](https://console.groq.com/) |
| `AICREDITS_API_KEY` | Backend | BAAI/BGE-M3 vector embeddings key | AI Credits Provider |
| `ELEVENLABS_API_KEY` | Backend | Text-to-Speech (TTS) voice generation key | [ElevenLabs Console](https://elevenlabs.io/) |
| `ALLOWED_ORIGINS` | Backend | Allowed CORS origins (e.g. `*` or `https://my-app.vercel.app`) | Render / Koyeb Environment Settings |
| `VITE_API_BASE_URL` | Frontend | Backend production HTTP/HTTPS URL (e.g., `https://voice-agent-backend.onrender.com`) | Render / Koyeb Dashboard |

---

## 📋 Step-by-Step Deployment Instructions

### Phase 1: Free Database Setup (MongoDB Atlas M0 Cluster)

1. **Sign Up / Log In**: Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas).
2. **Create M0 Cluster**:
   * Select **M0 Free** tier (512MB storage).
   * Choose AWS Region closest to your users (e.g. `us-east-1`).
3. **Database Security Access**:
   * Navigate to **Security -> Database Access**: Create a new database user (e.g. `voice_user` with a strong password).
   * Navigate to **Security -> Network Access**: Click **Add IP Address** -> Select **Allow Access from Anywhere (`0.0.0.0/0`)** so Render and Vercel instances can connect.
4. **Copy Connection String**:
   * Click **Database -> Connect -> Drivers**.
   * Copy the connection URI:
     ```text
     mongodb+srv://voice_user:<your-password>@cluster0.abcde.mongodb.net/?retryWrites=true&w=majority
     ```
5. **Create Atlas Vector Search Index**:
   * Go to **Database -> Cluster -> Atlas Search / Vector Search**.
   * Click **Create Vector Search Index**.
   * Select **JSON Editor**, target database `voice_agent`, collection `document_chunks`, and index name `vector_index`.
   * Paste the configuration JSON:
     ```json
     {
       "fields": [
         {
           "numDimensions": 768,
           "path": "embedding",
           "similarity": "cosine",
           "type": "vector"
         },
         {
           "path": "tenant_id",
           "type": "filter"
         },
         {
           "path": "equipment_id",
           "type": "filter"
         }
       ]
     }
     ```
   * Click **Create Vector Index**.

---

### Phase 2: Free Backend Deployment (Render or Koyeb)

#### Method A: Render (Free Web Service)

#### Option A: Render 1-Click Blueprint (Recommended)

1. Sign up / log in to [Render.com](https://render.com/).
2. Click **New + -> Blueprint**.
3. Connect your GitHub repository `Shivanshvyas1729/Real-Time-Voice-AI-Agent-with-RAG`. Render will automatically detect `render.yaml`.
4. Fill in the required environment variables (`MONGO_URL`, `DEEPGRAM_API_KEY`, `GROQ_API_KEY`, etc.) in the dashboard prompt.
5. Click **Apply**.

#### Option B: Manual Render Web Service Setup

1. Sign up / log in to [Render.com](https://render.com/).
2. Click **New + -> Web Service**.
3. Connect your GitHub repository `Shivanshvyas1729/Real-Time-Voice-AI-Agent-with-RAG`.
4. Configure Web Service settings:
   * **Name**: `voice-agent-backend`
   * **Root Directory**: `backend`
   * **Environment**: `Python 3` (or `Docker`)
   * **Build Command**: `pip install -r requirements.txt`
   * **Start Command**: `uvicorn main:app --host 0.0.0.0 --port $PORT`
   * **Instance Type**: **Free**
5. Add **Environment Variables**:
   * `MONGO_URL` = `mongodb+srv://voice_user:<password>@cluster0.abcde.mongodb.net/?retryWrites=true&w=majority`
   * `DB_NAME` = `voice_agent`
   * `DEEPGRAM_API_KEY` = `your_deepgram_api_key`
   * `GROQ_API_KEY` = `your_groq_api_key`
   * `AICREDITS_API_KEY` = `your_aicredits_api_key`
   * `ELEVENLABS_API_KEY` = `your_elevenlabs_api_key`
6. Click **Create Web Service**. Once deployed, copy your backend URL (e.g., `https://voice-agent-backend.onrender.com`).

#### Method B: Koyeb (Free Docker Deployment)

1. Sign up / log in to [Koyeb.com](https://www.koyeb.com/).
2. Click **Create App -> Select GitHub**.
3. Choose repository `Shivanshvyas1729/Real-Time-Voice-AI-Agent-with-RAG`.
4. Set **Workdir** to `backend`.
5. Select Builder: **Dockerfile** (Koyeb auto-detects `backend/Dockerfile`).
6. Add Environment Variables (`MONGO_URL`, `DB_NAME`, API keys).
7. Deploy. Copy your Koyeb public URL (e.g., `https://voice-agent-backend.koyeb.app`).

---

### Phase 3: Free Frontend Deployment (Vercel)

1. Sign up / log in to [Vercel](https://vercel.com/).
2. Click **Add New... -> Project**.
3. Import your GitHub repository `Shivanshvyas1729/Real-Time-Voice-AI-Agent-with-RAG`.
4. Configure Project:
   * **Framework Preset**: `Vite`
   * **Root Directory**: Click Edit -> Select `frontend`.
5. Add Environment Variable:
   * **Name**: `VITE_API_BASE_URL`
   * **Value**: `https://voice-agent-backend.onrender.com` *(Replace with your Render/Koyeb URL)*
6. Click **Deploy**.
7. Vercel provisions a production CDN deployment at a URL like `https://real-time-voice-ai-agent.vercel.app`.

---

## 🛠️ Troubleshooting & Free-Tier Gotchas

1. **Render Free Tier Cold Starts**:
   * Render free services sleep after 15 minutes of inactivity. The first request after a sleep period may take 30-50 seconds to boot up.
2. **WebSocket WSS Protocol Match**:
   * When deployed on Vercel (`https://...`), browser security policies require WebSockets to use `wss://` (secure WebSockets). The dynamic URL resolver in `backend/app/routers/stream.py` automatically converts `https` to `wss`.
3. **CORS Headers**:
   * If your frontend gets CORS errors, ensure `backend/main.py` has `allow_origins=["*"]` or includes your Vercel domain in allowed origins.

---

## 📊 Summary Matrix

| Service | Component | Free Allowance | URL Example |
| :--- | :--- | :--- | :--- |
| **Vercel** | Frontend UI | Unlimited static deployments & CDN | `https://real-time-voice-ai.vercel.app` |
| **Render / Koyeb** | FastAPI Backend | 512MB RAM free instance with WebSockets | `https://voice-agent-backend.onrender.com` |
| **MongoDB Atlas** | Database & Vector Search | 512MB M0 Free Cluster | `mongodb+srv://cluster.mongodb.net` |
