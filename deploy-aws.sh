#!/usr/bin/env bash
# ==============================================================================
# Master Unified AWS Deployment Orchestrator for Real-Time Voice AI Agent
# ==============================================================================
# Usage:
#   ./deploy-aws.sh               # Full deployment (Infra + Docker + ECS)
#   ./deploy-aws.sh --app-only    # Fast application update (Build + Push + Deploy)
#   ./deploy-aws.sh --infra-only  # Only provision Secrets & CloudFormation VPC
#   ./deploy-aws.sh --help        # Show help options
# ==============================================================================

set -euo pipefail

# Visual formatting
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m'

# Configuration Defaults
STACK_NAME="${STACK_NAME:-rag-voice-agent-stack}"
REGION="${AWS_REGION:-us-east-1}"
SECRET_NAME="${SECRET_NAME:-rag-voice-agent-secrets}"
CLUSTER_NAME="${ECS_CLUSTER:-rag-voice-agent-cluster}"
BACKEND_REPO="${ECR_REPOSITORY_BACKEND:-rag-voice-agent-backend}"
FRONTEND_REPO="${ECR_REPOSITORY_FRONTEND:-rag-voice-agent-frontend}"
BACKEND_SERVICE_NAME="rag-voice-agent-backend-service"
FRONTEND_SERVICE_NAME="rag-voice-agent-frontend-service"
BACKEND_TASK_FAMILY="rag-voice-agent-backend-td"
FRONTEND_TASK_FAMILY="rag-voice-agent-frontend-td"

MODE="full"

# Parse CLI arguments
while [[ $# -gt 0 ]]; do
  case "$1" in
    --app-only)
      MODE="app_only"
      shift
      ;;
    --infra-only)
      MODE="infra_only"
      shift
      ;;
    --region)
      REGION="$2"
      shift 2
      ;;
    -h|--help)
      echo -e "${BOLD}Unified AWS Deployment Orchestrator${NC}"
      echo ""
      echo "Usage: ./deploy-aws.sh [OPTIONS]"
      echo ""
      echo "Options:"
      echo "  --app-only     Rebuild Docker images, push to ECR, and update ECS tasks (skip VPC/CloudFormation)"
      echo "  --infra-only   Only provision Secrets Manager and CloudFormation VPC/ALB/ECS cluster"
      echo "  --region REG   Specify AWS region (default: us-east-1 or \$AWS_REGION)"
      echo "  -h, --help     Show this help message"
      exit 0
      ;;
    *)
      echo -e "${RED}Unknown option: $1${NC}"
      echo "Run './deploy-aws.sh --help' for usage."
      exit 1
      ;;
  esac
done

# Ensure we are in project root directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo -e "${BLUE}================================================================${NC}"
echo -e "${BOLD}?? Real-Time Voice AI Agent & RAG System: AWS Deployment${NC}"
echo -e "${BLUE}================================================================${NC}"
echo -e "Mode:   ${GREEN}${MODE}${NC}"
echo -e "Region: ${YELLOW}${REGION}${NC}"
echo -e "Stack:  ${YELLOW}${STACK_NAME}${NC}"
echo ""

# ------------------------------------------------------------------------------
# Phase 1: Pre-flight Verification
# ------------------------------------------------------------------------------
echo -e "${BLUE}[Phase 1/6] Running Pre-flight Verification...${NC}"

if ! command -v aws &>/dev/null; then
  echo -e "${RED}Error: AWS CLI v2 is not installed or not in PATH.${NC}"
  exit 1
fi

if [[ "$MODE" != "infra_only" ]]; then
  if ! command -v docker &>/dev/null; then
    echo -e "${RED}Error: Docker is not installed or not in PATH.${NC}"
    echo "Tip: Run './deploy-aws.sh --infra-only' to provision AWS without needing local Docker,"
    echo "then push to GitHub to build and deploy completely in the cloud."
    exit 1
  fi

  if ! docker info &>/dev/null; then
    echo -e "${RED}Error: Docker daemon is not running. Please start Docker Desktop first.${NC}"
    echo "Tip: Run './deploy-aws.sh --infra-only' to provision AWS without needing local Docker,"
    echo "then push to GitHub to build and deploy completely in the cloud."
    exit 1
  fi
fi

if ! command -v python3 &>/dev/null; then
  echo -e "${RED}Error: python3 is not installed or not in PATH.${NC}"
  exit 1
fi

echo -n "Checking AWS credentials... "
AWS_CALLER=$(aws sts get-caller-identity --output json 2>/dev/null) || {
  echo -e "${RED}FAILED${NC}"
  echo "AWS authentication failed. Please run 'aws configure' first."
  exit 1
}
AWS_ACCOUNT_ID=$(echo "$AWS_CALLER" | python3 -c "import sys, json; print(json.load(sys.stdin)['Account'])")
AWS_ARN=$(echo "$AWS_CALLER" | python3 -c "import sys, json; print(json.load(sys.stdin)['Arn'])")
echo -e "${GREEN}OK${NC}"
echo -e "  Account ID: ${BOLD}${AWS_ACCOUNT_ID}${NC}"
echo -e "  Caller ARN: ${AWS_ARN}"

# Ensure ECS Service-Linked Role exists
aws iam create-service-linked-role --aws-service-name ecs.amazonaws.com &>/dev/null || true

# ------------------------------------------------------------------------------
# Phase 2: Secrets Manager Provisioning
# ------------------------------------------------------------------------------
if [[ "$MODE" != "app_only" ]]; then
  echo -e "\n${BLUE}[Phase 2/6] Configuring AWS Secrets Manager...${NC}"
  
  if aws secretsmanager describe-secret --secret-id "$SECRET_NAME" --region "$REGION" &>/dev/null; then
    echo -e "${GREEN}? Secret '$SECRET_NAME' already exists. Skipping creation.${NC}"
  else
    echo -e "${YELLOW}Secret '$SECRET_NAME' not found. Creating a new secret...${NC}"

    # Check if .env exists in backend or root to provide defaults
    ENV_FILE=""
    if [[ -f "backend/.env" ]]; then
      ENV_FILE="backend/.env"
    elif [[ -f ".env" ]]; then
      ENV_FILE=".env"
    fi

    DEF_MONGO=""
    DEF_DEEPGRAM=""
    DEF_GROQ=""
    DEF_AICREDITS=""
    DEF_ELEVENLABS=""

    if [[ -n "$ENV_FILE" ]]; then
      echo -e "  Found local config file at: ${ENV_FILE}"
      DEF_MONGO=$(grep -E '^MONGO_URL=' "$ENV_FILE" | cut -d '=' -f2- | tr -d '"\x27\r' || true)
      DEF_DEEPGRAM=$(grep -E '^DEEPGRAM_API_KEY=' "$ENV_FILE" | cut -d '=' -f2- | tr -d '"\x27\r' || true)
      DEF_GROQ=$(grep -E '^GROQ_API_KEY=' "$ENV_FILE" | cut -d '=' -f2- | tr -d '"\x27\r' || true)
      DEF_AICREDITS=$(grep -E '^AICREDITS_API_KEY=' "$ENV_FILE" | cut -d '=' -f2- | tr -d '"\x27\r' || true)
      DEF_ELEVENLABS=$(grep -E '^ELEVENLABS_API_KEY=' "$ENV_FILE" | cut -d '=' -f2- | tr -d '"\x27\r' || true)
    fi

    read -r -p "Enter MongoDB URL [${DEF_MONGO:-none}]: " IN_MONGO
    MONGO_URL="${IN_MONGO:-$DEF_MONGO}"

    read -r -p "Enter Deepgram API Key [${DEF_DEEPGRAM:+exists}]: " IN_DEEPGRAM
    DEEPGRAM_API_KEY="${IN_DEEPGRAM:-$DEF_DEEPGRAM}"

    read -r -p "Enter Groq API Key [${DEF_GROQ:+exists}]: " IN_GROQ
    GROQ_API_KEY="${IN_GROQ:-$DEF_GROQ}"

    read -r -p "Enter AICredits API Key [${DEF_AICREDITS:+exists}]: " IN_AICREDITS
    AICREDITS_API_KEY="${IN_AICREDITS:-$DEF_AICREDITS}"

    read -r -p "Enter ElevenLabs API Key [${DEF_ELEVENLABS:+exists}]: " IN_ELEVENLABS
    ELEVENLABS_API_KEY="${IN_ELEVENLABS:-$DEF_ELEVENLABS}"

    SECRET_PAYLOAD=$(python3 -c "
import json, os
payload = {
    'MONGO_URL': os.environ.get('P_MONGO', ''),
    'DEEPGRAM_API_KEY': os.environ.get('P_DEEPGRAM', ''),
    'GROQ_API_KEY': os.environ.get('P_GROQ', ''),
    'AICREDITS_API_KEY': os.environ.get('P_AICREDITS', ''),
    'ELEVENLABS_API_KEY': os.environ.get('P_ELEVENLABS', '')
}
print(json.dumps(payload))
" env P_MONGO="$MONGO_URL" P_DEEPGRAM="$DEEPGRAM_API_KEY" P_GROQ="$GROQ_API_KEY" P_AICREDITS="$AICREDITS_API_KEY" P_ELEVENLABS="$ELEVENLABS_API_KEY")

    aws secretsmanager create-secret \
      --name "$SECRET_NAME" \
      --description "API keys and database credentials for Voice AI Agent" \
      --secret-string "$SECRET_PAYLOAD" \
      --region "$REGION" >/dev/null
    
    echo -e "${GREEN}? Secret '$SECRET_NAME' created successfully in Secrets Manager.${NC}"
  fi
else
  echo -e "\n${YELLOW}[Phase 2/6] Skipping Secrets Manager (--app-only mode)${NC}"
fi

# ------------------------------------------------------------------------------
# Phase 3: CloudFormation Infrastructure Deployment
# ------------------------------------------------------------------------------
if [[ "$MODE" != "app_only" ]]; then
  echo -e "\n${BLUE}[Phase 3/6] Deploying CloudFormation Stack ('$STACK_NAME')...${NC}"
  echo "This provisions the VPC, Subnets, Internet Gateway, NAT Gateway, ALB, ECR, and ECS Cluster..."

  aws cloudformation deploy \
    --template-file infrastructure/cloudformation.yaml \
    --stack-name "$STACK_NAME" \
    --capabilities CAPABILITY_NAMED_IAM \
    --region "$REGION"

  echo -e "${GREEN}? CloudFormation stack '$STACK_NAME' deployed successfully.${NC}"
else
  echo -e "\n${YELLOW}[Phase 3/6] Skipping CloudFormation deploy (--app-only mode)${NC}"
fi

# Function to safely read CloudFormation outputs
get_output() {
  local KEY="$1"
  aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --region "$REGION" \
    --query "Stacks[0].Outputs[?OutputKey=='$KEY'].OutputValue" \
    --output text 2>/dev/null || echo ""
}

ALB_DNS=$(get_output ALBDNSName)
PRIVATE_SUBNET_1=$(get_output PrivateSubnet1)
PRIVATE_SUBNET_2=$(get_output PrivateSubnet2)
BACKEND_SG=$(get_output BackendSecurityGroup)
FRONTEND_SG=$(get_output FrontendSecurityGroup)
BACKEND_TG_ARN=$(get_output BackendTargetGroupArn)
FRONTEND_TG_ARN=$(get_output FrontendTargetGroupArn)

if [[ "$MODE" == "infra_only" ]]; then
  echo -e "\n${GREEN}================================================================${NC}"
  echo -e "${GREEN}${BOLD}? AWS Cloud Infrastructure & Secrets Provisioned Successfully!${NC}"
  echo -e "${GREEN}================================================================${NC}"
  echo -e "  Application Load Balancer URL: ${BOLD}http://${ALB_DNS}${NC}"
  echo -e "  ECS Cluster Name:             ${BOLD}${CLUSTER_NAME}${NC}"
  echo -e "  ECR Backend Repository:       ${BOLD}${BACKEND_REPO}${NC}"
  echo -e "  ECR Frontend Repository:      ${BOLD}${FRONTEND_REPO}${NC}"
  echo -e "${GREEN}================================================================${NC}"
  echo -e "${YELLOW}${BOLD}Next Step: Cloud Build & Deploy via GitHub Actions (Zero Local Docker!)${NC}"
  echo -e "  1. Add AWS credentials to your GitHub repository secrets:"
  echo -e "     Settings -> Secrets and variables -> Actions -> New repository secret"
  echo -e "       - AWS_ACCESS_KEY_ID"
  echo -e "       - AWS_SECRET_ACCESS_KEY"
  echo -e "       - AWS_REGION (us-east-1)"
  echo -e "  2. Commit and push your code:"
  echo -e "       git add ."
  echo -e "       git commit -m 'Deploy to AWS'"
  echo -e "       git push origin main"
  echo -e "  GitHub Actions will automatically build the Docker images in the cloud and deploy them to ECS!"
  echo -e "${GREEN}================================================================${NC}"
  exit 0
fi

# ------------------------------------------------------------------------------
# Phase 4: Build & Push Docker Containers to ECR
# ------------------------------------------------------------------------------
echo -e "\n${BLUE}[Phase 4/6] Building & Pushing Docker Containers to ECR...${NC}"

ECR_BASE="${AWS_ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com"
echo "Logging in to Amazon ECR (${ECR_BASE})..."
aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "$ECR_BASE"

echo -e "\nBuilding Backend Docker Image (platform linux/amd64)..."
docker build --platform linux/amd64 \
  -t "${ECR_BASE}/${BACKEND_REPO}:latest" \
  backend/

echo "Pushing Backend Docker Image to ECR..."
docker push "${ECR_BASE}/${BACKEND_REPO}:latest"
echo -e "${GREEN}? Backend container uploaded to ECR.${NC}"

echo -e "\nBuilding Frontend Docker Image (platform linux/amd64)..."
docker build --platform linux/amd64 \
  --build-arg VITE_API_BASE_URL=/api/v1 \
  -t "${ECR_BASE}/${FRONTEND_REPO}:latest" \
  frontend/

echo "Pushing Frontend Docker Image to ECR..."
docker push "${ECR_BASE}/${FRONTEND_REPO}:latest"
echo -e "${GREEN}? Frontend container uploaded to ECR.${NC}"

# ------------------------------------------------------------------------------
# Phase 5: Render & Register ECS Task Definitions
# ------------------------------------------------------------------------------
echo -e "\n${BLUE}[Phase 5/6] Rendering & Registering ECS Task Definitions...${NC}"

# Dynamically render templates with actual Account ID and Region
sed "s/\${AWS_ACCOUNT_ID}/${AWS_ACCOUNT_ID}/g; s/\${AWS_REGION}/${REGION}/g" \
  .github/workflows/task-definition-backend.json.template > .github/workflows/task-definition-backend.json

sed "s/\${AWS_ACCOUNT_ID}/${AWS_ACCOUNT_ID}/g; s/\${AWS_REGION}/${REGION}/g" \
  .github/workflows/task-definition-frontend.json.template > .github/workflows/task-definition-frontend.json

echo "Registering Backend Task Definition with ECS..."
aws ecs register-task-definition \
  --cli-input-json file://.github/workflows/task-definition-backend.json \
  --region "$REGION" >/dev/null
echo -e "${GREEN}? Registered ${BACKEND_TASK_FAMILY}${NC}"

echo "Registering Frontend Task Definition with ECS..."
aws ecs register-task-definition \
  --cli-input-json file://.github/workflows/task-definition-frontend.json \
  --region "$REGION" >/dev/null
echo -e "${GREEN}? Registered ${FRONTEND_TASK_FAMILY}${NC}"

# ------------------------------------------------------------------------------
# Phase 6: Create or Update ECS Fargate Services
# ------------------------------------------------------------------------------
echo -e "\n${BLUE}[Phase 6/6] Launching / Updating ECS Fargate Services...${NC}"

service_is_active() {
  local SERVICE="$1"
  local STATUS
  STATUS=$(aws ecs describe-services --cluster "$CLUSTER_NAME" --services "$SERVICE" --region "$REGION" --query "services[?status=='ACTIVE'].serviceName" --output text 2>/dev/null || echo "")
  [[ "$STATUS" == *"$SERVICE"* ]]
}

# Backend Service
if service_is_active "$BACKEND_SERVICE_NAME"; then
  echo -e "Updating active service ${BOLD}${BACKEND_SERVICE_NAME}${NC} (rolling update)..."
  aws ecs update-service \
    --cluster "$CLUSTER_NAME" \
    --service "$BACKEND_SERVICE_NAME" \
    --task-definition "$BACKEND_TASK_FAMILY" \
    --force-new-deployment \
    --region "$REGION" >/dev/null
  echo -e "${GREEN}? Backend service update triggered.${NC}"
else
  echo -e "Creating new service ${BOLD}${BACKEND_SERVICE_NAME}${NC}..."
  aws ecs create-service \
    --cluster "$CLUSTER_NAME" \
    --service-name "$BACKEND_SERVICE_NAME" \
    --task-definition "$BACKEND_TASK_FAMILY" \
    --desired-count 1 \
    --launch-type FARGATE \
    --network-configuration "awsvpcConfiguration={subnets=[$PRIVATE_SUBNET_1,$PRIVATE_SUBNET_2],securityGroups=[$BACKEND_SG],assignPublicIp=DISABLED}" \
    --load-balancers "targetGroupArn=$BACKEND_TG_ARN,containerName=rag-voice-agent-backend-container,containerPort=8000" \
    --region "$REGION" >/dev/null
  echo -e "${GREEN}? Backend service created.${NC}"
fi

# Frontend Service
if service_is_active "$FRONTEND_SERVICE_NAME"; then
  echo -e "Updating active service ${BOLD}${FRONTEND_SERVICE_NAME}${NC} (rolling update)..."
  aws ecs update-service \
    --cluster "$CLUSTER_NAME" \
    --service "$FRONTEND_SERVICE_NAME" \
    --task-definition "$FRONTEND_TASK_FAMILY" \
    --force-new-deployment \
    --region "$REGION" >/dev/null
  echo -e "${GREEN}? Frontend service update triggered.${NC}"
else
  echo -e "Creating new service ${BOLD}${FRONTEND_SERVICE_NAME}${NC}..."
  aws ecs create-service \
    --cluster "$CLUSTER_NAME" \
    --service-name "$FRONTEND_SERVICE_NAME" \
    --task-definition "$FRONTEND_TASK_FAMILY" \
    --desired-count 1 \
    --launch-type FARGATE \
    --network-configuration "awsvpcConfiguration={subnets=[$PRIVATE_SUBNET_1,$PRIVATE_SUBNET_2],securityGroups=[$FRONTEND_SG],assignPublicIp=DISABLED}" \
    --load-balancers "targetGroupArn=$FRONTEND_TG_ARN,containerName=rag-voice-agent-frontend-container,containerPort=80" \
    --region "$REGION" >/dev/null
  echo -e "${GREEN}? Frontend service created.${NC}"
fi

# ------------------------------------------------------------------------------
# Deployment Summary & Health Verification
# ------------------------------------------------------------------------------
echo ""
echo -e "${GREEN}================================================================${NC}"
echo -e "${GREEN}${BOLD}?? DEPLOYMENT COMPLETED SUCCESSFULLY!${NC}"
echo -e "${GREEN}================================================================${NC}"
echo ""
echo -e "  ${BOLD}Application Load Balancer URL:${NC}  http://${ALB_DNS}"
echo -e "  ${BOLD}FastAPI Health Check Endpoint:${NC}  http://${ALB_DNS}/health"
echo -e "  ${BOLD}OpenAPI Swagger Documentation:${NC}  http://${ALB_DNS}/docs"
echo ""
echo -e "  ${BOLD}Live Backend Log Stream (CloudWatch):${NC}"
echo -e "    ${YELLOW}aws logs tail /ecs/${BACKEND_REPO} --follow --region ${REGION}${NC}"
echo ""
echo -e "  ${BOLD}Future Quick Updates (Zero-Downtime Re-deploy):${NC}"
echo -e "    ${YELLOW}./deploy-aws.sh --app-only${NC}"
echo ""
echo -e "  ${BOLD}Teardown Everything (Stop Billing Charges):${NC}"
echo -e "    ${YELLOW}./destroy-aws.sh${NC}"
echo -e "${GREEN}================================================================${NC}"
