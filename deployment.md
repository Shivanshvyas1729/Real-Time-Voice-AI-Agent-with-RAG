# Deployment Guide

This guide details

## AWS Cloud Infrastructure Architecture

`mermaid
graph TB
    subgraph AWS Cloud (Region: us-east-1)
        subgraph VPC (10.0.0.0/16)
            IGW[Internet Gateway]
            
            subgraph Public Subnets (Subnet 1 & 2)
                ALB[Application Load Balancer]
                NAT[NAT Gateway]
            end
            
            subgraph Private Subnets (Subnet 1 & 2)
                subgraph ECS Cluster (rag-voice-agent-cluster)
                    BackendTask[ECS Task: Backend Container - Port 8000]
                    FrontendTask[ECS Task: Frontend Container - Port 80]
                end
            end
        end
        
        Secrets[AWS Secrets Manager: rag-voice-agent-secrets]
        ECR_BE[ECR Repository: rag-voice-agent-backend]
        ECR_FE[ECR Repository: rag-voice-agent-frontend]
    end

    Users([Internet Users]) -->|HTTP/HTTPS Traffic| ALB
    ALB -->|Routes /api/v1/*| BackendTask
    ALB -->|Routes /*| FrontendTask
    BackendTask -->|Retrieves Secrets| Secrets
    ECS Cluster -->|Pulls Docker Images| ECR_BE
    ECS Cluster -->|Pulls Docker Images| ECR_FE
    BackendTask -->|Outbound Internet Access| NAT
    NAT --> IGW
`

## Detailed AWS VPC & Infrastructure Architecture Explanation

This diagram matches the exact network architecture deployed by your \cloudformation.yaml\ template:

`mermaid
graph LR
    User([Users / Internet]) --> IGW[Internet Gateway]
    
    subgraph VPC [VPC - Isolated Virtual Network]
        subgraph PublicSubnet [Public Subnet - Exposed to Internet]
            ALB[ALB - Load Balancer]
            NAT[NAT Gateway]
        end
        
        subgraph PrivateSubnet [Private Subnet - Secured / No Public IP]
            ECS_BE[ECS Backend Task]
            ECS_FE[ECS Frontend Task]
        end
    end

    IGW --> ALB
    ALB -->|Routes /api/v1/*| ECS_BE
    ALB -->|Routes /*| ECS_FE
    
    ECS_BE -->|Outbound API Calls| NAT
    ECS_FE -->|Outbound API Calls| NAT
    NAT --> IGW
    IGW --> ExternalAPIs([External APIs: MongoDB, Groq, Deepgram, AICredits])
`
### Step-by-Step Breakdown of Each Component

1. **VPC (Virtual Private Cloud)**:
   * **What it is:** Your own isolated private virtual network inside AWS.
   * **Why we use it:** Keeps your servers, containers, and data isolated from unauthorized traffic on the public internet.

2. **Internet Gateway (IGW)**:
   * **What it is:** The door/router connecting your AWS VPC to the public internet.
   * **Function:** Directs incoming user traffic from the web into your load balancer, and routes outgoing API requests to external services.

3. **Public Subnet (Orange Box)**:
   * **What it is:** A subnet inside your VPC that is directly connected to the Internet Gateway.
   * **Components inside:**
     * **ALB (Application Load Balancer):** Accepts incoming HTTP traffic from users. It inspects the URL path and routes requests to the appropriate container (/api/v1 goes to Backend, / goes to Frontend).
     * **NAT Gateway:** A 1-way gateway. It allows containers in the Private Subnet to initiate outbound connections to external APIs (Groq, Deepgram, MongoDB Atlas), but **prevents anyone on the internet from connecting directly into your private containers**.

4. **Private Subnet (Blue Box)**:
   * **What it is:** A completely hidden, zero-public-IP subnet.
   * **Components inside:**
     * **ECS Backend Container (Python FastAPI / RAG)**
     * **ECS Frontend Container (React / Nginx)**
   * **Security Advantage:** Your application containers are completely shielded from direct internet attacks. Users can ONLY reach them through the ALB.

---

## Deployment Workflow Architecture

`mermaid
graph TD
    A[Local WSL / Terminal] -->|Run setup-aws.sh| B(AWS CloudFormation)
    B -->|Creates| C[VPC, ALB, ECR, ECS Cluster]
    A -->|Run create-services.sh| D[ECS Fargate Services]
    E[Push to Git main branch] -->|Triggers| F[.github/workflows/deploy.yml]
    F -->|Builds & Pushes Containers| C
    F -->|Updates ECS Tasks| D
`
 how to deploy the **rag_voice_ai_agent** application, starting from local development to a full AWS production deployment using ECS Fargate and CloudFormation.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Local Development](#local-development)
3. [AWS Production Deployment](#aws-production-deployment)
4. [CI/CD Pipeline](#cicd-pipeline)
5. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required Services

1. **MongoDB Atlas**
   - Create a Cluster.
   - Create a database (e.g., `rag_voice_agent_db`).
   - Allow access from anywhere `0.0.0.0/0` (for initial testing) or configure specific whitelist IPs later.
   - **Vector Search Index**: Create an index named `vector_index` on your chunks collection.

2. **API Keys**
   - [Deepgram API Key](https://console.deepgram.com/) - for Speech-to-Text/Text-to-Speech.
   - [Groq API Key](https://console.groq.com/) - for Llama 3 inference.
   - [Google AI API Key](https://aistudio.google.com/) - for Gemini Embeddings.

3. **Tools**
   - [Docker Desktop](https://www.docker.com/products/docker-desktop/)
   - [AWS CLI](https://aws.amazon.com/cli/) version 2+
   - [Git](https://git-scm.com/)

---

## Local Development

1. **Clone the Repository**
   ```bash
   git clone <repository-url>
   cd rag_voice_ai_agent
   ```

2. **Environment Setup**
   Create a `.env` file in the `backend/` directory:
   ```env
   MONGO_URL=mongodb+srv://<user>:<password>@<cluster>.mongodb.net
   DB_NAME=rag_voice_agent_db
   DEEPGRAM_API_KEY=your_key
   GROQ_API_KEY=your_key
   AICREDITS_API_KEY=your_key
   ```

3. **Run with Docker Compose**
   ```bash
   docker-compose up --build
   ```
   - Frontend: http://localhost:3000
   - Backend: http://localhost:8000
   - API Docs: http://localhost:8000/docs

---

## AWS Production Deployment

We use **Amazon ECS (Fargate)** with an **Application Load Balancer (ALB)**. Infrastructure is provisioned via **CloudFormation**.

### Step 1: AWS Account & CLI Setup

1. **Create an AWS Account** if you don't have one.
2. **Install AWS CLI** and configure it:
   ```bash
   aws configure
   # Enter your Access Key ID, Secret Access Key, Region (e.g., us-east-1), and output format (json).
   ```

### Step 1.1: Required IAM Permissions

The AWS user or profile you use to run the setup scripts and CI/CD pipeline must have the following permissions. Because CloudFormation creates IAM Roles and specific network infrastructure, **AdminAccess** is recommended for the initial setup.

If you need a restricted policy, ensure the user has:

**Managed Policies:**
- `AWSCloudFormationFullAccess`
- `AmazonECS_FullAccess`
- `AmazonEC2FullAccess`
- `AmazonEC2ContainerRegistryFullAccess`
- `SecretsManagerReadWrite`
- `IAMFullAccess` (Required to create Execution/Task Roles)

**Custom Policy (Minimum Required Actions):**
```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "cloudformation:*",
                "ec2:*",
                "ecs:*",
                "ecr:*",
                "elasticloadbalancing:*",
                "iam:CreateRole",
                "iam:DeleteRole",
                "iam:AttachRolePolicy",
                "iam:DetachRolePolicy",
                "iam:PutRolePolicy",
                "iam:DeleteRolePolicy",
                "iam:GetRole",
                "iam:PassRole",
                "secretsmanager:CreateSecret",
                "secretsmanager:GetSecretValue",
                "secretsmanager:DescribeSecret",
                "secretsmanager:DeleteSecret",
                "logs:CreateLogGroup",
                "logs:DeleteLogGroup",
                "logs:PutRetentionPolicy"
            ],
            "Resource": "*"
        }
    ]
}
```
> [!WARNING]
> The `iam:PassRole` permission is critical. It allows the deployment user to assign the `ECSExecutionRole` and `ECSTaskRole` to the ECS Tasks. without it, deployments will fail.

### Step 2: Infrastructure Provisioning

We have automated scripts to set up the VPC, ECR, ECS Cluster, and Secrets.

1. **Navigate to Infrastructure Directory**
   ```bash
   cd infrastructure
   ```

2. **Run Setup Script**
   ```bash
   chmod +x setup-aws.sh
   ./setup-aws.sh
   ```
   - This script will prompt you for your API keys to securely store them in **AWS Secrets Manager**.
   - It will trigger the CloudFormation stack creation.
   - **Wait** for the stack to reach `CREATE_COMPLETE` status (approx. 5-10 mins).

3. **Note Outputs**
   The script (or CloudFormation console) will output critical values. Note down:
   - `ALBDNSName` (The URL of your app)
   - `BackendRepoUrl`
   - `FrontendRepoUrl`
   - `ClusterName`

### Step 3: Configure GitHub Secrets

**Before pushing any code**, you must configure your GitHub repository secrets so the CI/CD pipeline can authenticate with AWS.

Go to your **GitHub Repository -> Settings -> Secrets and variables -> Actions -> New repository secret**.

Add the following secrets (values from Step 2 outputs):

| Secret Name | Value Description |
|---|---|
| `AWS_ACCESS_KEY_ID` | Your AWS Access Key ID |
| `AWS_SECRET_ACCESS_KEY` | Your AWS Secret Access Key |
| `AWS_REGION` | `us-east-1` (or your chosen region) |
| `ECR_REPOSITORY_BACKEND` | **Repository Name** (e.g., `rag-voice-agent-backend`) **NOT the full URL** |
| `ECR_REPOSITORY_FRONTEND` | **Repository Name** (e.g., `rag-voice-agent-frontend`) **NOT the full URL** |
| `ECS_SERVICE_BACKEND` | `rag-voice-agent-backend-service` |
| `ECS_SERVICE_FRONTEND` | `rag-voice-agent-frontend-service` |
| `ECS_CLUSTER` | **ClusterName** (e.g., `rag-voice-agent-cluster`) |
| `ECS_TASK_DEFINITION_BACKEND` | `.github/workflows/task-definition-backend.json` |
| `ECS_TASK_DEFINITION_FRONTEND` | `.github/workflows/task-definition-frontend.json` |
| `CONTAINER_NAME_BACKEND` | `rag-voice-agent-backend-container` |
| `CONTAINER_NAME_FRONTEND` | `rag-voice-agent-frontend-container` |

### Step 4: Trigger Initial Deployment (CI/CD)

Now that secrets are set, you can trigger the initial build and registration of Task Definitions.

1.  **Commit and Push** your code to the `main` branch.
2.  Go to the **Actions** tab in your GitHub repository.
3.  Watch the workflow.
    *   **It is expected to fail** at the "Deploy" step because the ECS Services do not exist yet.
    *   **Success Check**: Ensure the "Fill in the new ... image ID" steps passed. This means your Docker images are pushed to ECR and Task Definitions are registered.

### Step 5: Create ECS Services

Now that Task Definitions verify valid images exist, we can create the actual ECS Services.

Run the service creation script locally:

```bash
chmod +x scripts/create-services.sh
./scripts/create-services.sh
```

**After this script completes:**
1.  Go back to GitHub Actions.
2.  Re-run the failed job (or push a small change).
3.  The deployment should now succeed completely.

### Step 6: Fix IAM Permissions (One-time)

Ensure ECS tasks can access the Secrets Manager:

```bash
chmod +x fix-iam-permissions.sh
./fix-iam-permissions.sh
```

---

## Deployment Complete!

Your application should now be live at the **ALBDNSName** URL you noted in Step 2.

---

## Troubleshooting

- **WebSocket Connection Fails**: Ensure `FORCE_SECURE_WEBSOCKET` is configured correctly if using HTTPS, or check ALB idle timeout settings (should be 600s).
- **MongoDB Connection Error**: Verify `ca-certificates` are installed in the Docker image and IP whitelist includes the AWS NAT Gateway IPs.
- **Deployment Stuck**: Check ECS Service Events in the AWS Console for error messages (e.g., "exec format error" indicates wrong platform build).

