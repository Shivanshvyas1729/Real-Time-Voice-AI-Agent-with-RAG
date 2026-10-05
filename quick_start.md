# ?? Quick Start Guide: Real-Time Voice AI Agent with RAG

This guide covers two simple workflows:
1. **Local Development** (Run locally with or without Docker, 100% without AWS)
2. **AWS Cloud Production** (One-click Infrastructure + Zero-Downtime Deployment)

---

# ?? PART 1: Run Locally (Without AWS)

### Option 1: Using Docker (Recommended ? Runs Both in 1 Command)
Open your terminal in the project root:

```bash
cd /home/dell/voice-agent
docker compose up --build
```
*(Or double-click **`run-docker.bat`** from Windows Explorer).*

* **Frontend UI**: [http://localhost:3000](http://localhost:3000)
* **Backend API**: [http://localhost:8000](http://localhost:8000)
* **Swagger Docs**: [http://localhost:8000/docs](http://localhost:8000/docs)
* **Hot Reloading**: Any code edits in `backend/` or `frontend/` reload live inside the containers.

---

### Option 2: 1-Click Local Runner (Without Docker)
Run the automated launcher that starts both backend and frontend together:

* **In WSL / Linux**:
  ```bash
  cd /home/dell/voice-agent
  ./run-local.sh
  ```
* **In Windows (PowerShell / CMD)**:
  ```powershell
  cd \home\dell\voice-agent
  .\run-local.bat
  ```

---

### Option 3: Separate Terminals (Manual Start Without Docker)

#### ?? Terminal 1 (Backend - FastAPI):
```bash
cd /home/dell/voice-agent/backend
uv run uvicorn main:app --reload --host 0.0.0.0 --port 8000
```
*(Or `python3 -m uvicorn main:app --reload --host 0.0.0.0 --port 8000`)*  
?? **API running at**: [http://localhost:8000](http://localhost:8000)

#### ?? Terminal 2 (Frontend - React / Vite):
```bash
cd /home/dell/voice-agent/frontend
npm run dev
```
?? **Web App running at**: [http://localhost:5173](http://localhost:5173)

---
---

# ?? PART 2: Deploy on AWS Cloud

The AWS deployment uses **ECS Fargate**, **Application Load Balancer (ALB)**, **Secrets Manager**, and **CloudFormation (IaC)**.

You have two simple ways to deploy:
* **Option A (Zero Local Docker)**: Provision AWS infra via CLI, then let **GitHub Actions** build and deploy containers in the cloud.
* **Option B (All-in-One CLI)**: Run `./deploy-aws.sh` to do everything from your terminal.

---

## ?? STAGE 1: Provision AWS Infrastructure & Secrets
*(One-time setup using the automated orchestrator. Zero local Docker needed.)*

### Step 1: Verify AWS Authentication
Run `aws sts get-caller-identity` to ensure your terminal session is authenticated:
```bash
aws sts get-caller-identity
```
*(Confirms your AWS Account ID and IAM User ARN).*

---

### Step 2: Provision CloudFormation Stack & Secrets Manager
Run the infrastructure provisioning command:
```bash
cd /home/dell/voice-agent
chmod +x deploy-aws.sh destroy-aws.sh
./deploy-aws.sh --infra-only
```

**What this automatically provisions under the hood:**
1. **AWS Secrets Manager**: Checks/prompts for your API keys (`MONGO_URL`, `DEEPGRAM_API_KEY`, `GROQ_API_KEY`, `AICREDITS_API_KEY`, `ELEVENLABS_API_KEY`) and stores them securely.
2. **Virtual Private Cloud (VPC)**: Custom `10.0.0.0/16` network with 2 Public and 2 Private subnets across multiple AZs.
3. **Application Load Balancer (ALB)**: Internet-facing ALB with a **600-second idle timeout** (prevents real-time audio WebSocket disconnections).
4. **NAT Gateway**: Allows private backend containers to route outbound to Deepgram, Groq, ElevenLabs, and MongoDB Atlas.
5. **Amazon ECR**: Container repositories for `rag-voice-agent-backend` and `rag-voice-agent-frontend`.
6. **Amazon ECS Fargate Cluster**: Serverless container orchestration cluster (`rag-voice-agent-cluster`).

When completed, the script prints your live **Application Load Balancer URL**:
```text
Application Load Balancer URL: http://rag-voice-agent-alb-xxxx.us-east-1.elb.amazonaws.com
```

---
---

## ?? STAGE 2: Deploy Application Containers

### ?? Path A: Cloud CI/CD via GitHub Actions (Zero Local Docker!)
*(Recommended: GitHub's cloud runners build the Docker containers and deploy to AWS).*

#### Step 1: Add Secrets in GitHub
Go to your GitHub repo ? **Settings** ? **Secrets and variables** ? **Actions** ? **New repository secret**:

| Secret Name | Example Value | Description |
| :--- | :--- | :--- |
| **`AWS_ACCESS_KEY_ID`** | `AKIAIOSFODNN7EXAMPLE` | Your AWS IAM Access Key |
| **`AWS_SECRET_ACCESS_KEY`** | `wJalrXUtnFEMI/K7MDENG...` | Your AWS IAM Secret Key |
| **`AWS_REGION`** | `us-east-1` | Target AWS deployment region |

#### Step 2: Push Code to Trigger Auto-Deployment
Commit your changes and push to `main`:
```bash
git add .
git commit -m "Deploy to AWS ECS Fargate"
git push origin main
```

#### Step 3: What GitHub Actions Does Automatically
When you push to `main`:
1. ?? Spins up cloud runners on GitHub (no local RAM or CPU used).
2. ?? Authenticates with AWS and dynamically detects your AWS Account ID.
3. ?? Compiles backend and frontend Docker containers for `linux/amd64`.
4. ?? Pushes images tagged with `$GITHUB_SHA` to Amazon ECR.
5. ??? Automatically creates and updates ECS Fargate services behind the ALB.
6. ?? Deploys with **zero downtime**.

---

### ?? Path B: Deploy Directly from Local Terminal
*(Use this if you have Docker Desktop running locally and want to push directly from your PC).*

```bash
cd /home/dell/voice-agent
./deploy-aws.sh
```

**For quick application updates later (skip CloudFormation):**
```bash
./deploy-aws.sh --app-only
```

---
---

## ?? STAGE 3: Access & Verification

### 1. Open Application Endpoints
Navigate to the ALB DNS name printed in your terminal:
* **Live Web App**: `http://<YOUR_ALB_DNS>/`
* **FastAPI Health Check**: `http://<YOUR_ALB_DNS>/health`
* **Swagger API Docs**: `http://<YOUR_ALB_DNS>/docs`

### 2. Enable Microphone in Browser (Chrome / Edge)
Modern browsers restrict microphone access on raw `http://` URLs:
1. In Chrome / Edge, open: `chrome://flags/#unsafely-treat-insecure-origin-as-secure`
2. Add your ALB URL (e.g. `http://rag-voice-agent-alb-xxxx.us-east-1.elb.amazonaws.com`)
3. Select **Enabled** and click **Relaunch**.
4. You can now talk to the AI agent in real time!

### 3. Stream Live CloudWatch Logs
To monitor live turn-taking, transcription frames, and vector search queries:
```bash
aws logs tail /ecs/rag-voice-agent-backend --follow --region us-east-1
```

---
---

## ?? STAGE 4: Teardown & Stop Charges
When you are done testing and want to stop all AWS billing charges (ALB, NAT Gateway, ECS Fargate tasks):

```bash
cd /home/dell/voice-agent
./destroy-aws.sh
```

**What this automatically destroys:**
1. Scales down and deletes ECS services (`rag-voice-agent-backend-service`, `rag-voice-agent-frontend-service`).
2. Empties all image tags from Amazon ECR repositories.
3. Deletes the CloudFormation stack (releases ALB, NAT Gateway Elastic IP, VPC, and Subnets).
4. Asks if you also want to delete the Secrets Manager secret.
