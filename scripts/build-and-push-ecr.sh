#!/bin/bash
set -e

# Configuration (These should ideally be passed as arguments or set as env vars)
# Defaults are for manual running, CI/CD will override these
AWS_ACCOUNT_ID=${AWS_ACCOUNT_ID:-$(aws sts get-caller-identity --query Account --output text)}
REGION=${AWS_REGION:-"us-east-1"}
BACKEND_REPO=${ECR_REPOSITORY_BACKEND:-"rag-voice-agent-backend"}
FRONTEND_REPO=${ECR_REPOSITORY_FRONTEND:-"rag-voice-agent-frontend"}

echo "Using Account: $AWS_ACCOUNT_ID"
echo "Using Region: $REGION"

# Get ECR Login
echo "Logging into ECR..."
aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com

# Build and Push Backend
echo "Building Backend..."
docker build --platform linux/amd64 \
    -t $AWS_ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/$BACKEND_REPO:latest \
    backend/

echo "Pushing Backend..."
docker push $AWS_ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/$BACKEND_REPO:latest

# Build and Push Frontend
echo "Building Frontend..."
# Note: For frontend, we might need build args for ALB URL, but here we assume relative paths or runtime config
docker build --platform linux/amd64 \
    --build-arg VITE_API_BASE_URL=/api/v1 \
    -t $AWS_ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/$FRONTEND_REPO:latest \
    frontend/

echo "Pushing Frontend..."
docker push $AWS_ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/$FRONTEND_REPO:latest

echo "Done!"