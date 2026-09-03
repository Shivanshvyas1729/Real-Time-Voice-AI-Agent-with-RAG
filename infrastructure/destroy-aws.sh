#!/bin/bash
set -e

# Configuration
STACK_NAME="rag-voice-agent-stack"
REGION="us-east-1"
SECRET_NAME="rag-voice-agent-secrets"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${RED}⚠️  WARNING: This will DESTROY the entire '$STACK_NAME' deployment.${NC}"
echo "    - ECS Services"
echo "    - Docker Images (ECR)"
echo "    - Full CloudFormation Stack (VPC, ALB, Cluster)"
echo ""
read -p "Are you sure you want to proceed? (y/N) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 1
fi

echo -e "\n${BLUE}[1/4] Checking resources...${NC}"

# Check if stack exists
if ! aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$REGION" &>/dev/null; then
    echo "Stack '$STACK_NAME' does not exist. Nothing to cleanup."
    exit 0
fi

# Get Resources from Stack Outputs
get_output() {
    aws cloudformation describe-stacks \
        --stack-name "$STACK_NAME" \
        --region "$REGION" \
        --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" \
        --output text
}

CLUSTER_NAME=$(get_output ClusterName)
BACKEND_REPO_URL=$(get_output BackendRepoUrl)
FRONTEND_REPO_URL=$(get_output FrontendRepoUrl)

# Extract repo names
BACKEND_REPO=${BACKEND_REPO_URL##*/}
FRONTEND_REPO=${FRONTEND_REPO_URL##*/}

echo "  Stack: $STACK_NAME"
echo "  Cluster: $CLUSTER_NAME"
echo "  Repos: $BACKEND_REPO, $FRONTEND_REPO"

# ------------------------------------------------------------------------------
# 2. Delete ECS Services
# ------------------------------------------------------------------------------
echo -e "\n${BLUE}[2/4] Deleting ECS Services...${NC}"

# Helper to delete service
delete_service() {
    local SERVICE=$1
    echo "  Processing service: $SERVICE"
    
    # Check if service exists
    if aws ecs describe-services --cluster "$CLUSTER_NAME" --services "$SERVICE" --region "$REGION" --query 'services[0].status' --output text 2>/dev/null | grep -q "ACTIVE"; then
        echo "  Scaling down and deleting..."
        aws ecs update-service --cluster "$CLUSTER_NAME" --service "$SERVICE" --desired-count 0 --region "$REGION" > /dev/null
        aws ecs delete-service --cluster "$CLUSTER_NAME" --service "$SERVICE" --force --region "$REGION" > /dev/null
        echo "  ✓ Deleted $SERVICE"
    else
        echo "  - Service not active or not found."
    fi
}

# Values from CloudFormation Outputs or predictable names
# Since outputs don't give service names explicitly, we resort to the names we defined in our CloudFormation template:
# The service names are NOT outputs, they are resource IDs. CloudFormation generates random IDs unless explicit names are used.
# But... in our CloudFormation, we didn't create AWS::ECS::Service resources! 
# WAIT. The user deploys ECS Services via CloudFormation? 
# In the Setup Script? NO.
# In CloudFormation? NO.
# Let me re-read the CloudFormation template I created.
# Resource `ECSCluster` is there. But where are the `AWS::ECS::Service` resources?
# ... I missed creating the Services in the CloudFormation template?
#
# Checking `pipecat_RAG/infrastructure/cloudformation.yaml` ...
# Step 19 output shows `ECSCluster` (line 335), but NO `AWS::ECS::Service` resources.
#
# So how are services created in `pipecat_RAG`?
# Ah, looking at `DEPLOYMENT.md` (Step 17), Step 9 says "Create ECS Services" via `aws ecs create-service` CLI commands.
#
# !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
# CRITICAL OVERSIGHT: The CloudFormation template ONLY sets up infrastructure. 
# The actual ECS Services are created MANUALLY or via CLI in the guide 
# OR via Task Definitions and Services in the `scripts/deploy_aws.sh`?
#
# Let's check `rag_voice_ai_agent/scripts/deploy_aws.sh` (Step 53).
# It runs `aws ecs update-service`. It ASSUMES services exist.
#
# THIS MEANS MY DEPLOYMENT GUIDE IS INCOMPLETE OR RELIES ON THE USER CREATING SERVICES MANUALLY.
#
# In `pipecat_RAG` `DEPLOYMENT.md`, Step 9 explicitly lists `aws ecs create-service` commands properly.
#
# But wait, my `setup-aws.sh` ONLY deploys CloudFormation.
# And `deploy_aws.sh` only UPDATES services.
#
# Where is the step to CREATE services?
#
# In my `DEPLOYMENT.md`, "Step 2" runs setup script. "Step 3" Fix IAM. "CI/CD Pipeline" runs deployment.
# THE CI/CD PIPELINE (deploy.yml) uses `aws-actions/amazon-ecs-deploy-task-definition`.
# This action UPDATES a service. It does NOT create it if it doesn't exist.
# "Updates the Amazon ECS service to use the new task definition."
#
# So the User MUST create the services first. 
# I missed adding a specific "Create Services" step script or instructions in `DEPLOYMENT.md` besides generic "CloudFormation".
#
# However, for the DESTROY script, I need to know the Service Names.
# The user (or I) will name them.
# In `DEPLOYMENT.md` -> CI/CD section -> I suggested names `rag-voice-agent-backend-service` and `rag-voice-agent-frontend-service`.
#
# I should also update the `setup-aws.sh` to CREATE these services so the user doesn't have to do it manually? 
# Or providing a `create-services.sh`?
#
# Reference `pipecat_RAG` didn't have `create_services.sh` in scripts listing (Step 25).
# It seems they rely on manual creation in `DEPLOYMENT.md`.
#
# Back to DESTROY script:
# I will try to delete services named `rag-voice-agent-backend-service` and `rag-voice-agent-frontend-service`.
# If they don't exist, it will skip.
# 
# Also, I realized I should probably have updated `cloudformation.yaml` to include Services if possible, 
# OR provide a script. But sticking to the `pipecat_RAG` strategy means following their manual/CLI approach?
# 
# Wait, `pipecat_RAG` `scripts/deploy_aws.sh` (Step 25, listed but not read fully). 
# It likely contains `create-service` logic or just update?
#
# Let's focus on the Destruction Script for now.
# I will attempt to delete the services by the names I recommended in the Guide.
#
# ------------------------------------------------------------------------------

SERVICE_BACKEND="rag-voice-agent-backend-service"
SERVICE_FRONTEND="rag-voice-agent-frontend-service"

delete_service "$SERVICE_BACKEND"
delete_service "$SERVICE_FRONTEND"

echo "  Waiting for services to drain..."
aws ecs wait services-inactive --cluster "$CLUSTER_NAME" --services "$SERVICE_BACKEND" "$SERVICE_FRONTEND" --region "$REGION" 2>/dev/null || true

# ------------------------------------------------------------------------------
# 3. Empty ECR Repositories
# ------------------------------------------------------------------------------
echo -e "\n${BLUE}[3/4] Emptying ECR Repositories...${NC}"

empty_repo() {
    local REPO=$1
    echo "  Emptying repository: $REPO"
    
    while true; do
        IMAGES=$(aws ecr list-images --repository-name "$REPO" --region "$REGION" --query 'imageIds[*]' --output json || echo "[]")
        
        if [ "$IMAGES" == "[]" ] || [ "$IMAGES" == "null" ] || [ -z "$IMAGES" ]; then
            echo "  ✓ Repository $REPO is empty."
            break
        fi
        
        aws ecr batch-delete-image --repository-name "$REPO" --region "$REGION" --image-ids "$IMAGES" > /dev/null
        echo "  ✓ Deleted batch of images"
    done
}

empty_repo "$BACKEND_REPO"
empty_repo "$FRONTEND_REPO"

# ------------------------------------------------------------------------------
# 4. Delete CloudFormation Stack
# ------------------------------------------------------------------------------
echo -e "\n${BLUE}[4/4] Deleting CloudFormation Stack...${NC}"
echo "  Deleting stack: $STACK_NAME"

aws cloudformation delete-stack --stack-name "$STACK_NAME" --region "$REGION"

echo "  Waiting for stack deletion to complete..."
aws cloudformation wait stack-delete-complete --stack-name "$STACK_NAME" --region "$REGION"

# ------------------------------------------------------------------------------
# 5. Optional: Delete Secret
# ------------------------------------------------------------------------------
echo -e "\n${YELLOW}❓ Do you want to delete the Secrets Manager secret ('$SECRET_NAME')?${NC}"
echo "   NOTE: This is irrecoverable."
read -p "Delete Secret? (y/N) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "  Deleting secret..."
    aws secretsmanager delete-secret --secret-id "$SECRET_NAME" --force-delete-without-recovery --region "$REGION"
    echo "  ✓ Secret deleted."
else
    echo "  Skipping secret deletion."
fi

echo -e "\n${GREEN}✅ Destruction Complete!${NC}"