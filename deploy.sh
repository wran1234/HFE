#!/bin/bash
# HFE — Deploy to Google Cloud Run
# Prerequisites: gcloud CLI installed and authenticated
#
# Usage: ./deploy.sh [PROJECT_ID] [GEMINI_API_KEY]

set -euo pipefail

PROJECT_ID="${1:-$(gcloud config get-value project 2>/dev/null)}"
GEMINI_API_KEY="${2:-${GEMINI_API_KEY:-}}"
REGION="us-central1"
SERVICE_NAME="hfe-app"
IMAGE="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"

if [ -z "$PROJECT_ID" ]; then
  echo "ERROR: PROJECT_ID not set. Pass it as first argument or run: gcloud config set project YOUR_PROJECT_ID"
  exit 1
fi

if [ -z "$GEMINI_API_KEY" ]; then
  echo "ERROR: GEMINI_API_KEY not set. Pass it as second argument or export GEMINI_API_KEY=your_key"
  exit 1
fi

echo ""
echo "Deploying HFE to Google Cloud Run"
echo "  Project : $PROJECT_ID"
echo "  Region  : $REGION"
echo "  Image   : $IMAGE"
echo ""

# Enable required APIs
echo "Enabling Cloud APIs..."
gcloud services enable cloudbuild.googleapis.com run.googleapis.com containerregistry.googleapis.com \
  --project="$PROJECT_ID" --quiet

# Build and push Docker image using Cloud Build
echo "Building Docker image with Cloud Build..."
gcloud builds submit \
  --tag "$IMAGE" \
  --project="$PROJECT_ID" \
  .

# Store API key in Secret Manager
echo "Storing Gemini API key in Secret Manager..."
echo -n "$GEMINI_API_KEY" | gcloud secrets create gemini-api-key \
  --data-file=- \
  --project="$PROJECT_ID" \
  --replication-policy="automatic" 2>/dev/null || \
echo -n "$GEMINI_API_KEY" | gcloud secrets versions add gemini-api-key \
  --data-file=- \
  --project="$PROJECT_ID"

# Get project number for IAM binding
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format="value(projectNumber)")

# Grant Cloud Run access to the secret
gcloud secrets add-iam-policy-binding gemini-api-key \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor" \
  --project="$PROJECT_ID" \
  --quiet

# Deploy to Cloud Run
echo "Deploying to Cloud Run..."
gcloud run deploy "$SERVICE_NAME" \
  --image "$IMAGE" \
  --region "$REGION" \
  --platform managed \
  --allow-unauthenticated \
  --port 8080 \
  --memory 512Mi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 10 \
  --set-secrets="GEMINI_API_KEY=gemini-api-key:latest" \
  --project="$PROJECT_ID"

# Get the deployed URL
SERVICE_URL=$(gcloud run services describe "$SERVICE_NAME" \
  --region="$REGION" \
  --project="$PROJECT_ID" \
  --format="value(status.url)")

echo ""
echo "Deployment complete!"
echo "App URL: $SERVICE_URL"
echo ""
echo "IMPORTANT: Cloud Run requires HTTPS which is provided automatically."
echo "WebSocket connections (wss://) are also supported."
