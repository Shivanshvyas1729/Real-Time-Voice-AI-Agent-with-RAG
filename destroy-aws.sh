#!/usr/bin/env bash
# ==============================================================================
# Master Unified AWS Teardown Script for Real-Time Voice AI Agent
# ==============================================================================
# Usage:
#   ./destroy-aws.sh              # Interactive teardown
#   ./destroy-aws.sh --force      # Skip interactive prompts
# ==============================================================================

set -euo pipefail

# Visual formatting
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m'

STACK_NAME="${STACK_NAME:-rag-voice-agent-stack}"
REGION="${AWS_REGION:-us-east-1}"
SECRET_NAME="${SECRET_NAME:-rag-voice-agent-secrets}"
CLUSTER_NAME="${ECS_CLUSTER:-rag-voice-agent-cluster}"
SERVICE_BACKEND="rag-voice-agent-backend-service"
SERVICE_FRONTEND="rag-voice-agent-frontend-service"
BACKEND_REPO="${ECR_REPOSITORY_BACKEND:-rag-voice-agent-backend}"
FRONTEND_REPO="${ECR_REPOSITORY_FRONTEND:-rag-voice-agent-frontend}"

FORCE=false
if [[ "${1:-}" == "--force" || "${1:-}" == "-f" ]]; then
  FORCE=true
fi

echo -e "${RED}================================================================${NC}"
echo -e "${BOLD}${RED}??  AWS RESOURCE DESTRUCTION / TEARDOWN${NC}"
echo -e "${RED}================================================================${NC}"
echo -e "Stack to delete:   ${YELLOW}${STACK_NAME}${NC}"
echo -e "Region:            ${YELLOW}${REGION}${NC}"
echo ""
echo "This will permanently destroy:"
echo "  1. ECS Fargate Services (${SERVICE_BACKEND}, ${SERVICE_FRONTEND})"
echo "  2. Container Images in ECR (${BACKEND_REPO}, ${FRONTEND_REPO})"
echo "  3. Full CloudFormation Stack (VPC, Subnets, ALB, NAT Gateway, Roles)"
echo ""

if [[ "$FORCE" != true ]]; then
  read -r -p "Are you sure you want to proceed? (y/N): " CONFIRM
  if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
    echo "Teardown aborted."
    exit 0
  fi
fi

echo -e "\n${BLUE}[1/4] Checking resources...${NC}"

if ! aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$REGION" &>/dev/null; then
  echo -e "${YELLOW}CloudFormation stack '$STACK_NAME' does not exist. Nothing to teardown.${NC}"
  exit 0
fi

# ------------------------------------------------------------------------------
# 1. Scale down and delete ECS services
# ------------------------------------------------------------------------------
echo -e "\n${BLUE}[2/4] Deleting ECS Services...${NC}"

delete_ecs_service() {
  local SERVICE="$1"
  if aws ecs describe-services --cluster "$CLUSTER_NAME" --services "$SERVICE" --region "$REGION" --query "services[0].status" --output text 2>/dev/null | grep -q "ACTIVE"; then
    echo "  Scaling down and deleting service: $SERVICE"
    aws ecs update-service --cluster "$CLUSTER_NAME" --service "$SERVICE" --desired-count 0 --region "$REGION" >/dev/null 2>&1 || true
    aws ecs delete-service --cluster "$CLUSTER_NAME" --service "$SERVICE" --force --region "$REGION" >/dev/null 2>&1 || true
    echo -e "  ${GREEN}? Deleted service $SERVICE${NC}"
  else
    echo "  - Service $SERVICE is not active or already deleted."
  fi
}

delete_ecs_service "$SERVICE_BACKEND"
delete_ecs_service "$SERVICE_FRONTEND"

# ------------------------------------------------------------------------------
# 2. Empty ECR Repositories
# ------------------------------------------------------------------------------
echo -e "\n${BLUE}[3/4] Emptying ECR Repositories...${NC}"

empty_ecr_repo() {
  local REPO="$1"
  if aws ecr describe-repositories --repository-names "$REPO" --region "$REGION" &>/dev/null; then
    echo "  Deleting all image tags from repository: $REPO"
    IMAGE_IDS=$(aws ecr list-images --repository-name "$REPO" --region "$REGION" --query "imageIds[*]" --output json 2>/dev/null || echo "[]")
    if [[ "$IMAGE_IDS" != "[]" && "$IMAGE_IDS" != "null" && -n "$IMAGE_IDS" ]]; then
      aws ecr batch-delete-image --repository-name "$REPO" --region "$REGION" --image-ids "$IMAGE_IDS" >/dev/null 2>&1 || true
      echo -e "  ${GREEN}? Repository $REPO emptied.${NC}"
    else
      echo "  - Repository $REPO is already empty."
    fi
  else
    echo "  - Repository $REPO does not exist."
  fi
}

empty_ecr_repo "$BACKEND_REPO"
empty_ecr_repo "$FRONTEND_REPO"

# ------------------------------------------------------------------------------
# 3. Delete CloudFormation Stack
# ------------------------------------------------------------------------------
echo -e "\n${BLUE}[4/4] Deleting CloudFormation Stack ('$STACK_NAME')...${NC}"
echo "Initiating stack deletion (this releases ALB, NAT Gateway Elastic IP, VPC)..."

aws cloudformation delete-stack --stack-name "$STACK_NAME" --region "$REGION"

echo "Waiting for stack deletion to complete (this takes a few minutes)..."
aws cloudformation wait stack-delete-complete --stack-name "$STACK_NAME" --region "$REGION"
echo -e "${GREEN}? CloudFormation stack deleted successfully.${NC}"

# ------------------------------------------------------------------------------
# 4. Optional: Secrets Manager cleanup
# ------------------------------------------------------------------------------
echo ""
DELETE_SECRET=false
if [[ "$FORCE" == true ]]; then
  DELETE_SECRET=false
else
  read -r -p "Do you also want to delete Secrets Manager secret ('$SECRET_NAME')? (y/N): " SEC_CONFIRM
  if [[ "$SEC_CONFIRM" =~ ^[Yy]$ ]]; then
    DELETE_SECRET=true
  fi
fi

if [[ "$DELETE_SECRET" == true ]]; then
  echo "Deleting secret '$SECRET_NAME'..."
  aws secretsmanager delete-secret --secret-id "$SECRET_NAME" --force-delete-without-recovery --region "$REGION" >/dev/null 2>&1 || true
  echo -e "${GREEN}? Secret '$SECRET_NAME' deleted.${NC}"
else
  echo "Keeping secret '$SECRET_NAME' for future deployments."
fi

echo ""
echo -e "${GREEN}================================================================${NC}"
echo -e "${GREEN}${BOLD}? ALL AWS RESOURCES CLEANED UP SUCCESSFULLY!${NC}"
echo -e "${GREEN}================================================================${NC}"
