# 🚀 Master Production Deployment Guide: Real-Time Voice AI Agent with RAG
**Developer**: Shivansh Vyas (`Shivanshvyas1729`)  
**Target Infrastructure**: AWS Cloud (VPC, ALB, ECS Fargate, ECR, Secrets Manager, CloudWatch, GitHub Actions)  

This document is the **definitive end-to-end master deployment guide** for deploying the Real-Time Voice AI Agent and Industrial RAG System to AWS Cloud from scratch.

---

# 📌 Architecture Overview

```mermaid
graph TB
    subgraph AWSCloud["AWS Cloud (Region: us-east-1)"]
        subgraph VPC["VPC (10.0.0.0/16)"]
            IGW["Internet Gateway (IGW)"]
            
            subgraph PublicSubnets["Public Subnets (Subnet 1 & 2)"]
                ALB["Application Load Balancer (ALB)"]
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
    ALB -->|"2a. Route /api/v1/* & /docs*"| BackendTask
    ALB -->|"2b. Route /*"| FrontendTask
    BackendTask -->|"3. Retrieve Secrets on Startup"| Secrets
    ECSCluster -->|"4. Pull Container Images"| ECR_BE
    ECSCluster -->|"4. Pull Container Images"| ECR_FE
    BackendTask -->|"5. Stream Container Logs"| CloudWatch
    BackendTask -->|"6. Outbound API Calls (Deepgram, Groq, Mongo)"| NAT
    NAT --> IGW
```

---

# 🛠️ Step-by-Step Production Deployment Tutorial

---

## Phase 1: Local Prerequisites & AWS CLI Authentication

Before executing deployment scripts, ensure your local environment (WSL2 / Linux / macOS) has the necessary tools installed.

### 1. Install Required Tools:
- **AWS CLI v2**
- **Docker Desktop**
- **Git**
- **Python 3.12**

### 2. Authenticate AWS CLI:
Open your terminal and run `aws configure` to authenticate your terminal session:

```bash
aws configure
```

You will be prompted to enter your credentials:
```text
AWS Access Key ID [None]: AKIAIOSFODNN7EXAMPLE
AWS Secret Access Key [None]: wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
Default region name [None]: us-east-1
Default output format [None]: json
```

### 3. Verify AWS Authentication:
Run `aws sts get-caller-identity` to verify that your credentials are valid:

```bash
aws sts get-caller-identity
```

*Expected Output:*
```json
{
    "UserId": "AIDACKCEVSQ6C2EXAMPLE",
    "Account": "117591992815",
    "Arn": "arn:aws:iam::117591992815:user/shivansh"
}
```

---

## Phase 2: Environment Secrets Provisioning (AWS Secrets Manager)

Our FastAPI backend requires sensitive database URLs and API keys. We store them securely in **AWS Secrets Manager** so they are injected directly into ECS Fargate containers at boot time without being hardcoded in Git.

### Option A: Create Secret via CLI
Run the following AWS CLI command to create the secret JSON payload:

```bash
aws secretsmanager create-secret \
    --name rag-voice-agent-secrets \
    --region us-east-1 \
    --description "API keys and MongoDB connection string for Voice AI Agent" \
    --secret-string '{
        "MONGO_URL": "mongodb+srv://user:password@cluster.mongodb.net/rag_voice_agent_db?retryWrites=true&w=majority",
        "DEEPGRAM_API_KEY": "YOUR_DEEPGRAM_API_KEY",
        "GROQ_API_KEY": "YOUR_GROQ_API_KEY",
        "AICREDITS_API_KEY": "YOUR_AICREDITS_API_KEY",
        "ELEVENLABS_API_KEY": "YOUR_ELEVENLABS_API_KEY"
    }'
```

### Option B: Interactive Prompt via `setup-aws.sh`
If you run `./setup-aws.sh` (in Phase 3), the script will automatically check if `rag-voice-agent-secrets` exists. If missing, it will prompt you interactively for each key and create the secret for you.

---

## Phase 3: Infrastructure-as-Code Deployment (`infrastructure/setup-aws.sh`)

Deploy the entire cloud network topology (VPC, Subnets, ALB, NAT Gateway, ECR Repos, ECS Cluster, IAM Roles) using AWS CloudFormation.

```bash
# 1. Navigate to infrastructure directory
cd /home/dell/voice-agent/infrastructure

# 2. Make scripts executable
chmod +x setup-aws.sh destroy-aws.sh

# 3. Run the automated CloudFormation setup script
./setup-aws.sh
```

### What `setup-aws.sh` Does Under the Hood:
1. Executes `aws cloudformation deploy` using `cloudformation.yaml`.
2. Provisions VPC (`10.0.0.0/16`), 2 Public Subnets, 2 Private Subnets, IGW, NAT Gateway, Security Groups, ALB, Target Groups, ECR Repositories, ECS Cluster, IAM Roles, and CloudWatch Log Groups.
3. Queries CloudFormation outputs and prints your deployment details:
   - **ALB DNS Name**: `http://rag-voice-agent-alb-123456789.us-east-1.elb.amazonaws.com`
   - **Backend ECR URI**: `117591992815.dkr.ecr.us-east-1.amazonaws.com/rag-voice-agent-backend`
   - **Frontend ECR URI**: `117591992815.dkr.ecr.us-east-1.amazonaws.com/rag-voice-agent-frontend`

---

## Phase 4: Build & Push Docker Containers (`scripts/build-and-push-ecr.sh`)

Compile the backend and frontend application source code into Docker container images for `linux/amd64` architecture and push them to Amazon ECR.

```bash
# 1. Navigate to scripts directory
cd /home/dell/voice-agent/scripts

# 2. Make scripts executable
chmod +x build-and-push-ecr.sh create-services.sh deploy_aws.sh

# 3. Run build and push script
./build-and-push-ecr.sh
```

### What `build-and-push-ecr.sh` Does Under the Hood:
1. **ECR Login**: Authenticates Docker CLI against Amazon ECR registry:
   ```bash
   aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com
   ```
2. **Backend Image Build**: Compiles Python FastAPI container for `linux/amd64`:
   ```bash
   docker build --platform linux/amd64 -t <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/rag-voice-agent-backend:latest ./backend
   ```
3. **Frontend Image Build**: Compiles Nginx React container for `linux/amd64`:
   ```bash
   docker build --platform linux/amd64 -t <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/rag-voice-agent-frontend:latest ./frontend
   ```
4. **Push**: Uploads container layers to ECR registries (`docker push`).

---

## Phase 5: Register Task Definitions & Create ECS Fargate Services (`scripts/create-services.sh`)

Register task definitions specifying CPU/RAM allocations, Secrets Manager environment bindings, and launch active container tasks behind the Application Load Balancer.

```bash
# 1. Register Task Definitions from JSON files
aws ecs register-task-definition --cli-input-json file://../.github/workflows/task-definition-backend.json --region us-east-1
aws ecs register-task-definition --cli-input-json file://../.github/workflows/task-definition-frontend.json --region us-east-1

# 2. Launch ECS Fargate Services
./create-services.sh
```

### What `create-services.sh` Does Under the Hood:
- Retrieves VPC Private Subnet IDs, Security Group IDs, and Target Group ARNs from CloudFormation outputs.
- Executes `aws ecs create-service` for both backend and frontend:
  ```bash
  aws ecs create-service \
      --cluster "rag-voice-agent-cluster" \
      --service-name "rag-voice-agent-backend-service" \
      --task-definition "rag-voice-agent-backend-td" \
      --desired-count 1 \
      --launch-type FARGATE \
      --network-configuration "awsvpcConfiguration={subnets=[$PRIVATE_SUBNET_1,$PRIVATE_SUBNET_2],securityGroups=[$BACKEND_SG],assignPublicIp=DISABLED}" \
      --load-balancers targetGroupArn=$BACKEND_TG_ARN,containerName=rag-voice-agent-backend-container,containerPort=8000
  ```

---

## Phase 6: Live Application Verification & Monitoring

### 1. Verify Application Health:
Open your browser and navigate to the ALB DNS Name:
- **Web Interface**: `http://rag-voice-agent-alb-123456789.us-east-1.elb.amazonaws.com/`
- **API Health Check**: `http://rag-voice-agent-alb-123456789.us-east-1.elb.amazonaws.com/health`
- **OpenAPI Swagger Docs**: `http://rag-voice-agent-alb-123456789.us-east-1.elb.amazonaws.com/docs`

### 2. Stream Live Logs via CloudWatch CLI:
To watch live backend application logs (VAD turn-taking, STT transcripts, MongoDB vector search queries):

```bash
aws logs tail /ecs/rag-voice-agent-backend --follow --region us-east-1
```

---

## Phase 7: GitHub Actions CI/CD Pipeline Integration

Automate zero-downtime container updates whenever code is pushed to your GitHub `main` branch.

### 1. Configure GitHub Repository Secrets:
Go to your GitHub Repository: **Settings ➔ Secrets and variables ➔ Actions ➔ New repository secret**.

Add the following 3 secrets:

| Secret Name | Value |
| :--- | :--- |
| **`AWS_ACCESS_KEY_ID`** | Your AWS Access Key ID |
| **`AWS_SECRET_ACCESS_KEY`** | Your AWS Secret Access Key |
| **`AWS_REGION`** | `us-east-1` |

### 2. Automated Trigger:
Whenever you push code to GitHub:
```bash
git add .
git commit -m "Enhance voice AI pipeline"
git push origin main
```
GitHub Actions workflow `.github/workflows/deploy.yml` will automatically:
1. Authenticate against AWS & Amazon ECR.
2. Build new backend & frontend Docker images tagged with `$GITHUB_SHA`.
3. Push images to Amazon ECR.
4. Render updated ECS Task Definition JSON files.
5. Deploy updated task definitions to ECS Fargate with zero downtime.

### 3. Manual Forced Deployment Refresh (Optional):
If you need to force-refresh running ECS tasks manually via terminal:

```bash
cd /home/dell/voice-agent/scripts
./deploy_aws.sh
```

---

## Phase 8: Resource Destruction & Teardown (`infrastructure/destroy-aws.sh`)

When you are done testing and want to stop all AWS billing charges:

```bash
cd /home/dell/voice-agent/infrastructure
./destroy-aws.sh
```

### What `destroy-aws.sh` Does:
1. Prompts user for confirmation (`y/N`).
2. Scales active ECS services down to 0 desired count and deletes services (`aws ecs delete-service`).
3. Empties images from Amazon ECR repositories (`aws ecr batch-delete-image`).
4. Deletes the CloudFormation Stack (`aws cloudformation delete-stack`).
5. Optionally prompts to delete Secrets Manager secrets.

---

# 🔍 Troubleshooting & Gotchas

### 1. Missing ECS Service-Linked Role Error
If `create-services.sh` fails with `Unable to assume role`, create the ECS Service-Linked Role in IAM:
```bash
aws iam create-service-linked-role --aws-service-name ecs.amazonaws.com
```

### 2. Browser Microphone Permissions on HTTP ALB URL
Browsers restrict `navigator.mediaDevices.getUserMedia` mic access to `https://` or `localhost`. If accessing via raw `http://rag-voice-agent-alb...`:
- In Chrome / Edge, navigate to `chrome://flags/#unsafely-treat-insecure-origin-as-secure`.
- Add your ALB URL (`http://rag-voice-agent-alb-123456789.us-east-1.elb.amazonaws.com`) to the text box, select **Enabled**, and relaunch the browser.

### 3. AWS CLI Terminal Pager (`:`) Prompt
If running `aws` commands freezes your terminal with a colon `:` prompt:
- Press `q` on your keyboard to exit the pager.
- Or disable pagers globally by adding `export AWS_PAGER=""` to your `~/.bashrc` file.
