#!/bin/bash
set -e

REGION=${AWS_REGION:-"us-east-1"}
CLUSTER=${ECS_CLUSTER:-"rag-voice-agent-cluster"}
SERVICE_BACKEND=${ECS_SERVICE_BACKEND:-"rag-voice-agent-backend-service"}
SERVICE_FRONTEND=${ECS_SERVICE_FRONTEND:-"rag-voice-agent-frontend-service"}

echo "Updating ECS Services to force new deployment..."

aws ecs update-service --cluster $CLUSTER --service $SERVICE_BACKEND --force-new-deployment --region $REGION
aws ecs update-service --cluster $CLUSTER --service $SERVICE_FRONTEND --force-new-deployment --region $REGION

echo "Deployment triggered."