#!/bin/bash
set -e

# Configuration
CLUSTER_NAME="rag-voice-agent-cluster"
REGION="us-east-1"
BACKEND_SERVICE_NAME="rag-voice-agent-backend-service"
FRONTEND_SERVICE_NAME="rag-voice-agent-frontend-service"
BACKEND_TASK_FAMILY="rag-voice-agent-backend-td"
FRONTEND_TASK_FAMILY="rag-voice-agent-frontend-td"

# Fetch Infrastructure Details from CloudFormation
STACK_NAME="rag-voice-agent-stack"

echo "Fetching infrastructure details from CloudFormation stack: $STACK_NAME..."

get_output() {
    aws cloudformation describe-stacks \
        --stack-name "$STACK_NAME" \
        --region "$REGION" \
        --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" \
        --output text
}

# Network Config
PRIVATE_SUBNET_1=$(get_output PrivateSubnet1)
PRIVATE_SUBNET_2=$(get_output PrivateSubnet2)
# Security Groups
BACKEND_SG=$(get_output BackendSecurityGroup)
FRONTEND_SG=$(get_output FrontendSecurityGroup)
# Target Groups
BACKEND_TG_ARN=$(get_output BackendTargetGroupArn)
FRONTEND_TG_ARN=$(get_output FrontendTargetGroupArn)

echo "----------------------------------------------------------------"
echo "Creating ECS Services"
echo "----------------------------------------------------------------"

# Function to check if service exists
service_exists() {
    local cluster=$1
    local service=$2
    aws ecs describe-services --cluster "$cluster" --services "$service" \
        --query "services[?status=='ACTIVE'].serviceName" --output text | grep -q "$service"
}

# Create Backend Service
echo "Creating Backend Service: $BACKEND_SERVICE_NAME"
if service_exists "$CLUSTER_NAME" "$BACKEND_SERVICE_NAME"; then
    echo "Service $BACKEND_SERVICE_NAME already exists. Skipping creation."
else
    aws ecs create-service \
        --cluster "$CLUSTER_NAME" \
        --service-name "$BACKEND_SERVICE_NAME" \
        --task-definition "$BACKEND_TASK_FAMILY" \
        --desired-count 1 \
        --launch-type FARGATE \
        --network-configuration "awsvpcConfiguration={subnets=[$PRIVATE_SUBNET_1,$PRIVATE_SUBNET_2],securityGroups=[$BACKEND_SG],assignPublicIp=DISABLED}" \
        --load-balancers targetGroupArn=$BACKEND_TG_ARN,containerName=rag-voice-agent-backend-container,containerPort=8000 \
        --region "$REGION"
fi

# Create Frontend Service
echo "Creating Frontend Service: $FRONTEND_SERVICE_NAME"
if service_exists "$CLUSTER_NAME" "$FRONTEND_SERVICE_NAME"; then
    echo "Service $FRONTEND_SERVICE_NAME already exists. Skipping creation."
else
    aws ecs create-service \
        --cluster "$CLUSTER_NAME" \
        --service-name "$FRONTEND_SERVICE_NAME" \
        --task-definition "$FRONTEND_TASK_FAMILY" \
        --desired-count 1 \
        --launch-type FARGATE \
        --network-configuration "awsvpcConfiguration={subnets=[$PRIVATE_SUBNET_1,$PRIVATE_SUBNET_2],securityGroups=[$FRONTEND_SG],assignPublicIp=DISABLED}" \
        --load-balancers targetGroupArn=$FRONTEND_TG_ARN,containerName=rag-voice-agent-frontend-container,containerPort=80 \
        --region "$REGION"
fi

echo "----------------------------------------------------------------"
echo "Services Created. CI/CD Pipeline can now update them."
echo "----------------------------------------------------------------"