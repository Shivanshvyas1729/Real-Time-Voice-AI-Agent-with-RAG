#!/bin/bash
set -e

# Configuration
STACK_NAME="rag-voice-agent-stack"
REGION="us-east-1"
SECRET_NAME="rag-voice-agent-secrets"

echo "Using Region: $REGION"

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo "AWS CLI could not be found. Please install it."
    exit 1
fi

# 1. Create Secrets Manager Secret
echo "----------------------------------------------------------------"
echo "Step 1: Setting up Secrets Manager"
echo "----------------------------------------------------------------"

# Check if secret exists
if aws secretsmanager describe-secret --secret-id $SECRET_NAME --region $REGION &> /dev/null; then
    echo "Secret $SECRET_NAME already exists. Skipping creation."
    echo "If you need to update values, please use the AWS Console or CLI manually."
else
    echo "Creating new secret: $SECRET_NAME"
    echo "Please enter the values for the following secrets:"
    
    read -p "Enter MongoDB URL: " MONGO_URL
    read -p "Enter Deepgram API Key: " DEEPGRAM_API_KEY
    read -p "Enter Groq API Key: " GROQ_API_KEY
    read -p "Enter AICredits API Key: " AICREDITS_API_KEY
    read -p "Enter ElevenLabs API Key: " ELEVENLABS_API_KEY

    # Create JSON string for secret
    SECRET_STRING=$(jq -n \
                  --arg mongo "$MONGO_URL" \
                  --arg deepgram "$DEEPGRAM_API_KEY" \
                  --arg groq "$GROQ_API_KEY" \
                  --arg aicredits "$AICREDITS_API_KEY" \
                  --arg elevenlabs "$ELEVENLABS_API_KEY" \
                  '{MONGO_URL: $mongo, DEEPGRAM_API_KEY: $deepgram, GROQ_API_KEY: $groq, AICREDITS_API_KEY: $aicredits, ELEVENLABS_API_KEY: $elevenlabs}')

    aws secretsmanager create-secret \
        --name $SECRET_NAME \
        --description "Secrets for Shivansh Voice Agent" \
        --secret-string "$SECRET_STRING" \
        --region $REGION
    
    echo "Secret created successfully."
fi

# 2. Deploy CloudFormation Stack
echo "----------------------------------------------------------------"
echo "Step 2: Deploying CloudFormation Stack"
echo "----------------------------------------------------------------"

aws cloudformation deploy \
    --template-file cloudformation.yaml \
    --stack-name $STACK_NAME \
    --capabilities CAPABILITY_NAMED_IAM \
    --region $REGION

echo "----------------------------------------------------------------"
echo "Stack deployment complete."
echo "----------------------------------------------------------------"

# 3. Output Important Values
echo "Retrieving stack outputs..."
aws cloudformation describe-stacks \
    --stack-name $STACK_NAME \
    --query "Stacks[0].Outputs" \
    --output table \
    --region $REGION

echo "----------------------------------------------------------------"
echo "SETUP COMPLETE!"
echo "Please note down the Repository URLs and ALB DNS Name from the table above."
echo "You will need these for GitHub Secrets and accessing your application."
echo "----------------------------------------------------------------"