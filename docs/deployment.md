# ?? Master Production Deployment Guide: Real-Time Voice AI Agent with RAG
**Target Infrastructure**: AWS Cloud (VPC, ALB, ECS Fargate, ECR, Secrets Manager, CloudWatch, GitHub Actions)  

This document is the **definitive end-to-end master deployment guide** for deploying the Real-Time Voice AI Agent and Industrial RAG System to AWS Cloud.

---

# ?? Architecture & System Flow

```mermaid
graph TB
    subgraph AWSCloud["AWS Cloud (Region: us-east-1)"]
        subgraph VPC["VPC (10.0.0.0/16)"]
            IGW["Internet Gateway (IGW)"]
            
            subgraph PublicSubnets["Public Subnets (Subnet 1 & 2)"]
                ALB["Application Load Balancer (ALB)<br/>(Idle Timeout: 600s for WebSockets)"]
                NAT["NAT Gateway (Elastic IP)"]
            end
            
            subgraph PrivateSubnets["Private Subnets (Subnet 1 & 2)"]
                subgraph ECSCluster["ECS Cluster (rag-voice-agent-cluster)"]
                    BackendTask["ECS Task: FastAPI Backend Container - Port 8000"]
                    FrontendTask["ECS Task: Nginx React Frontend Container - Port 80"]
                end
            end
        end
        
        Secrets["AWS Secrets Manager: rag-voice-agent-secrets"]
        ECR_BE["Amazon ECR: rag-voice-agent-backend"]
        ECR_FE["Amazon ECR: rag-voice-agent-frontend"]
        CloudWatch["Amazon CloudWatch Logs"]
    end

    Users(["Internet Users"]) -->|"1. HTTP / HTTPS / WSS"| ALB
    ALB -->|"2a. Route /api/v1/*, /docs*, /health*"| BackendTask
    ALB -->|"2b. Route /*"| FrontendTask
    BackendTask -->|"3. Retrieve Secrets on Startup"| Secrets
    ECSCluster -->|"4. Pull Container Images"| ECR_BE
    ECSCluster -->|"4. Pull Container Images"| ECR_FE
    BackendTask -->|"5. Stream Container Logs"| CloudWatch
    BackendTask -->|"6. Outbound API Calls (Deepgram, Groq, Mongo)"| NAT
    NAT --> IGW
```

### Key Architectural Highlights:
1. **Network Isolation**: Backend and Frontend containers run inside **Private Subnets** without public IP addresses, protecting them from direct internet exposure.
2. **WebSocket Support**: The Application Load Balancer has an `idle_timeout` of **600 seconds** (10 minutes) so persistent real-time PCM audio streaming connections are not prematurely terminated.
3. **Egress Through NAT Gateway**: Containers communicate outbound with Deepgram (STT), Groq (LLM), ElevenLabs (TTS), and MongoDB Atlas via the NAT Gateway in the Public Subnet.
4. **Secret Injection**: API keys are securely retrieved from **AWS Secrets Manager** at task launch and injected directly as environment variables into the container without ever touching Git.

---

# ??? Step-by-Step Production Deployment

---

## Phase 1: Local Prerequisites

Before deploying, ensure your local environment (WSL2 / Linux / macOS) has the necessary tools installed and authenticated:

### 1. Required Tools:
- **AWS CLI v2** (`aws --version`)
- **Docker** with daemon running (`docker info`)
- **Python 3.10+** (`python3 --version`)
- **Git** (`git --version`)

### 2. Authenticate AWS CLI:
Run `aws configure` in your terminal to set your AWS credentials:

```bash
aws configure
```

Provide your credentials:
```text
AWS Access Key ID [None]: YOUR_AWS_ACCESS_KEY_ID
AWS Secret Access Key [None]: YOUR_AWS_SECRET_ACCESS_KEY
Default region name [None]: us-east-1
Default output format [None]: json
```

Verify your authentication:
```bash
aws sts get-caller-identity
```

---

## Phase 2: One-Command Master Deployment (`./deploy-aws.sh`)

Instead of jumping between directories and running disjointed commands, the entire launch is fully orchestrated by the root script:

```bash
# 1. Ensure scripts are executable
chmod +x deploy-aws.sh destroy-aws.sh

# 2. Run the end-to-end automated deployment
./deploy-aws.sh
```

### What `./deploy-aws.sh` Does Automatically Under the Hood:

```mermaid
flowchart TD
    Step1["1. Pre-flight Check: Validates AWS CLI credentials, Docker daemon, & ECS Service-Linked Role"]
    Step2["2. Secrets Provisioning: Auto-reads .env or prompts once to populate AWS Secrets Manager"]
    Step3["3. CloudFormation IaC: Provisions VPC, Subnets, ALB, NAT Gateway, ECR repos, & ECS Cluster"]
    Step4["4. Docker Build & Push: Builds Backend & Frontend containers (linux/amd64) and pushes to ECR"]
    Step5["5. Task Definition Registration: Dynamically renders task defs with caller Account ID & registers with ECS"]
    Step6["6. ECS Service Launch / Update: Creates or rolling-updates Fargate services behind ALB target groups"]
    Step7["7. Live Health Check: Polls until services are running and outputs the live ALB URLs"]

    Step1 --> Step2 --> Step3 --> Step4 --> Step5 --> Step6 --> Step7
```

---

## ? Deployment Modes & Flags

The unified deployment script supports modular flags for everyday development and operations:

### 1. Fast Application Re-deploy (`--app-only`):
When you have updated Python backend code or React frontend UI and want to deploy without re-running CloudFormation:

```bash
./deploy-aws.sh --app-only
```
*Builds new Docker images, pushes them to ECR, and initiates a zero-downtime rolling update on your active ECS tasks.*

### 2. Infrastructure-Only Provisioning (`--infra-only`):
When you only want to provision the VPC, Subnets, ALB, and Secrets Manager without compiling or deploying containers:

```bash
./deploy-aws.sh --infra-only
```

### 3. Custom AWS Region (`--region`):
To deploy into an AWS region other than `us-east-1`:

```bash
./deploy-aws.sh --region eu-west-1
```

---

## Phase 3: Live Application Verification & Monitoring

### 1. Access Your Application:
Once `./deploy-aws.sh` completes, it prints your live Application Load Balancer endpoints:
- **Web Interface**: `http://<ALB-DNS-NAME>/`
- **FastAPI Health Check**: `http://<ALB-DNS-NAME>/health`
- **OpenAPI Swagger UI**: `http://<ALB-DNS-NAME>/docs`

### 2. Stream Live Logs via CloudWatch CLI:
To watch live backend application logs (turn-taking, STT transcripts, MongoDB vector search queries):

```bash
aws logs tail /ecs/rag-voice-agent-backend --follow --region us-east-1
```

To watch frontend Nginx access logs:
```bash
aws logs tail /ecs/rag-voice-agent-frontend --follow --region us-east-1
```

---

## Phase 4: Automated CI/CD Pipeline (GitHub Actions)

Continuous deployment is configured in [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml).

### 1. Configure GitHub Repository Secrets:
In your GitHub repository, navigate to:  
**Settings ? Secrets and variables ? Actions ? New repository secret**

Add the following 3 repository secrets:

| Secret Name | Value | Description |
| :--- | :--- | :--- |
| **`AWS_ACCESS_KEY_ID`** | `AKIAIOSFODNN7EXAMPLE` | IAM access key with ECS/ECR permissions |
| **`AWS_SECRET_ACCESS_KEY`** | `wJalrXUtnFEMI/K7MDENG/bPxRfi...` | IAM secret access key |
| **`AWS_REGION`** | `us-east-1` | Target AWS region |

### 2. Triggering Automated Deployments:
Pushing changes to the `main` branch automatically triggers zero-downtime deployment:
```bash
git add .
git commit -m "Enhance voice agent RAG pipeline"
git push origin main
```

The GitHub Actions workflow will:
1. Dynamically detect your AWS Account ID via caller identity.
2. Render task definition templates (`task-definition-backend.json.template` and `task-definition-frontend.json.template`).
3. Build and push new Docker images tagged with `$GITHUB_SHA` to Amazon ECR.
4. Deploy the updated task definitions to ECS Fargate with zero downtime.

---

## Phase 5: Resource Teardown & Cleanup (`./destroy-aws.sh`)

When you are done testing and want to stop all AWS billing charges (ALB, NAT Gateway, Fargate tasks):

```bash
./destroy-aws.sh
```

### What `./destroy-aws.sh` Does:
1. Prompts for confirmation (`y/N`).
2. Scales active ECS services down to 0 and deletes them (`rag-voice-agent-backend-service`, `rag-voice-agent-frontend-service`).
3. Empties all Docker images from ECR repositories.
4. Deletes the CloudFormation stack (releases ALB, NAT Gateway Elastic IP, VPC, and subnets).
5. Optionally prompts to delete Secrets Manager secrets.

To run non-interactively in automation:
```bash
./destroy-aws.sh --force
```

---

# ?? Troubleshooting & Gotchas

### 1. Browser Microphone Permissions on HTTP ALB URL
Modern browsers (Chrome, Edge, Safari) restrict `navigator.mediaDevices.getUserMedia` microphone access to `https://` origins or `localhost`. If you access the application via the raw HTTP ALB URL (`http://rag-voice-agent-alb...`):
- In Chrome or Edge, navigate to: `chrome://flags/#unsafely-treat-insecure-origin-as-secure`
- Paste your ALB URL into the text box (e.g., `http://rag-voice-agent-alb-123456789.us-east-1.elb.amazonaws.com`).
- Set the dropdown to **Enabled** and click **Relaunch**.
- The browser will now allow microphone access for real-time voice conversations.

*(In a production domain setup, attach an ACM SSL Certificate to the ALB on port 443 for automatic HTTPS).*

### 2. ECS Service-Linked Role
If you see an error like `Unable to assume role` or `ServiceLinkedRole` during service creation in a brand-new AWS account, `./deploy-aws.sh` creates it automatically:
```bash
aws iam create-service-linked-role --aws-service-name ecs.amazonaws.com
```

### 3. AWS CLI Terminal Pager (`:`) Freeze
If running `aws` commands freezes your terminal with a colon `:` prompt:
- Press `q` to exit the pager.
- Or disable pagers permanently by running:
  ```bash
  echo 'export AWS_PAGER=""' >> ~/.bashrc
  source ~/.bashrc
  ```
