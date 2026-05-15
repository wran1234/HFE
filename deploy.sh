#!/bin/bash
# HFE — Deploy to Google Cloud Run
# Reads all secrets from server/.env and syncs them to Secret Manager on every deploy.
# Prerequisites: gcloud CLI installed and authenticated
#
# Usage: ./deploy.sh [PROJECT_ID]

set -euo pipefail

PROJECT_ID="${1:-$(gcloud config get-value project 2>/dev/null)}"
REGION="us-east1"
SERVICE_NAME="hfe-app"
IMAGE="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"
ENV_FILE="server/.env"

if [ -z "$PROJECT_ID" ]; then
  echo "ERROR: PROJECT_ID not set. Pass it as first argument or run: gcloud config set project YOUR_PROJECT_ID"
  exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: $ENV_FILE not found. Run from the project root."
  exit 1
fi

# Load env file (strip quotes and comments)
load_env_var() {
  (grep "^${1}=" "$ENV_FILE" | head -1 || true) | sed 's/^[^=]*=//;s/^"//;s/"$//;s/^'"'"'//;s/'"'"'$//'
}

DATABASE_URL=$(load_env_var DATABASE_URL)
# Derive direct (non-pooled) URL for Prisma migrations — strips "-pooler" from the Neon hostname
DIRECT_URL=$(echo "$DATABASE_URL" | sed 's/-pooler\./\./')
GEMINI_API_KEY=$(load_env_var GEMINI_API_KEY)
GEMINI_LIVE_MODEL=$(load_env_var GEMINI_LIVE_MODEL)
AUTH_SESSION_SECRET=$(load_env_var AUTH_SESSION_SECRET)
ADMIN_EMAILS=$(load_env_var ADMIN_EMAILS)
SENTRY_DSN=$(load_env_var SENTRY_DSN)
RESEND_API_KEY=$(load_env_var RESEND_API_KEY)
UPSTASH_REDIS_REST_URL=$(load_env_var UPSTASH_REDIS_REST_URL)
UPSTASH_REDIS_REST_TOKEN=$(load_env_var UPSTASH_REDIS_REST_TOKEN)
AUTH_MAINTENANCE_KEY=$(load_env_var AUTH_MAINTENANCE_KEY)

EMAIL_PROVIDER=$(load_env_var EMAIL_PROVIDER)
EMAIL_FROM=$(load_env_var EMAIL_FROM)
ALLOWED_ORIGIN=$(load_env_var ALLOWED_ORIGIN)
STORAGE_PROVIDER=$(load_env_var STORAGE_PROVIDER)
GCS_BUCKET_NAME=$(load_env_var GCS_BUCKET_NAME)
GOOGLE_CLOUD_PROJECT=$(load_env_var GOOGLE_CLOUD_PROJECT)
AUTH_RATE_LIMIT_PROVIDER=$(load_env_var AUTH_RATE_LIMIT_PROVIDER)
AUTH_RATE_LIMIT_WINDOW_MS=$(load_env_var AUTH_RATE_LIMIT_WINDOW_MS)
AUTH_RATE_LIMIT_MAX_REQUESTS=$(load_env_var AUTH_RATE_LIMIT_MAX_REQUESTS)
AUTH_RATE_LIMIT_MAX_PER_EMAIL=$(load_env_var AUTH_RATE_LIMIT_MAX_PER_EMAIL)
AUTH_VERIFY_MAX_ATTEMPTS=$(load_env_var AUTH_VERIFY_MAX_ATTEMPTS)
AUTH_TOKEN_RETENTION_HOURS=$(load_env_var AUTH_TOKEN_RETENTION_HOURS)
GCS_SIGNED_URL_TTL_SECONDS=$(load_env_var GCS_SIGNED_URL_TTL_SECONDS)

if [ -z "$GEMINI_API_KEY" ]; then
  echo "ERROR: GEMINI_API_KEY missing from $ENV_FILE"
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
gcloud services enable cloudbuild.googleapis.com run.googleapis.com containerregistry.googleapis.com secretmanager.googleapis.com \
  --project="$PROJECT_ID" --quiet

# Sync a secret: create if missing, add new version if exists
sync_secret() {
  local name="$1"
  local value="$2"
  if [ -z "$value" ]; then
    echo "  SKIP $name (empty)"
    return
  fi
  if gcloud secrets describe "$name" --project="$PROJECT_ID" &>/dev/null; then
    echo -n "$value" | gcloud secrets versions add "$name" --data-file=- --project="$PROJECT_ID" --quiet
    echo "  UPDATED $name"
  else
    echo -n "$value" | gcloud secrets create "$name" --data-file=- --project="$PROJECT_ID" --replication-policy="automatic" --quiet
    echo "  CREATED $name"
  fi
}

echo "Syncing secrets to Secret Manager..."
sync_secret "database-url"             "$DATABASE_URL"
sync_secret "direct-url"              "$DIRECT_URL"
sync_secret "gemini-api-key"           "$GEMINI_API_KEY"
sync_secret "auth-session-secret"      "$AUTH_SESSION_SECRET"
sync_secret "sentry-dsn"               "$SENTRY_DSN"
sync_secret "resend-api-key"           "$RESEND_API_KEY"
sync_secret "upstash-redis-rest-url"   "$UPSTASH_REDIS_REST_URL"
sync_secret "upstash-redis-rest-token" "$UPSTASH_REDIS_REST_TOKEN"
sync_secret "auth-maintenance-key"     "$AUTH_MAINTENANCE_KEY"

# Build and push Docker image
echo "Building Docker image with Cloud Build..."
gcloud builds submit \
  --tag "$IMAGE" \
  --project="$PROJECT_ID" \
  .

# Get project number for IAM bindings
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format="value(projectNumber)")
SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

echo "Granting Cloud Run access to secrets..."
for secret in database-url direct-url gemini-api-key auth-session-secret sentry-dsn resend-api-key upstash-redis-rest-url upstash-redis-rest-token auth-maintenance-key; do
  if gcloud secrets describe "$secret" --project="$PROJECT_ID" &>/dev/null; then
    gcloud secrets add-iam-policy-binding "$secret" \
      --member="serviceAccount:${SA}" \
      --role="roles/secretmanager.secretAccessor" \
      --project="$PROJECT_ID" \
      --quiet 2>/dev/null || true
  fi
done

# Get the production service URL (needed for APP_BASE_URL)
SERVICE_URL=$(gcloud run services describe "$SERVICE_NAME" \
  --region="$REGION" \
  --project="$PROJECT_ID" \
  --format="value(status.url)" 2>/dev/null || echo "")

APP_BASE_URL="${SERVICE_URL:-https://hfe-app-89708189118.us-east1.run.app}"

# Build secrets and env var flags
SECRETS_FLAG="DATABASE_URL=database-url:latest,DIRECT_URL=direct-url:latest,GEMINI_API_KEY=gemini-api-key:latest,AUTH_SESSION_SECRET=auth-session-secret:latest,RESEND_API_KEY=resend-api-key:latest"
[ -n "$SENTRY_DSN" ]                   && SECRETS_FLAG="${SECRETS_FLAG},SENTRY_DSN=sentry-dsn:latest"
[ -n "$UPSTASH_REDIS_REST_URL" ]   && SECRETS_FLAG="${SECRETS_FLAG},UPSTASH_REDIS_REST_URL=upstash-redis-rest-url:latest"
[ -n "$UPSTASH_REDIS_REST_TOKEN" ] && SECRETS_FLAG="${SECRETS_FLAG},UPSTASH_REDIS_REST_TOKEN=upstash-redis-rest-token:latest"
[ -n "$AUTH_MAINTENANCE_KEY" ]     && SECRETS_FLAG="${SECRETS_FLAG},AUTH_MAINTENANCE_KEY=auth-maintenance-key:latest"

ENV_VARS="EMAIL_PROVIDER=${EMAIL_PROVIDER:-resend}"
ENV_VARS="${ENV_VARS},GEMINI_LIVE_MODEL=${GEMINI_LIVE_MODEL:-gemini-3.1-flash-live-preview}"
ENV_VARS="${ENV_VARS},ADMIN_EMAILS=${ADMIN_EMAILS}"
ENV_VARS="${ENV_VARS},EMAIL_FROM=${EMAIL_FROM:-onboarding@resend.dev}"
ENV_VARS="${ENV_VARS},ALLOWED_ORIGIN=${ALLOWED_ORIGIN:-$APP_BASE_URL}"
ENV_VARS="${ENV_VARS},STORAGE_PROVIDER=${STORAGE_PROVIDER:-gcs}"
ENV_VARS="${ENV_VARS},GCS_BUCKET_NAME=${GCS_BUCKET_NAME}"
ENV_VARS="${ENV_VARS},GOOGLE_CLOUD_PROJECT=${GOOGLE_CLOUD_PROJECT:-$PROJECT_ID}"
ENV_VARS="${ENV_VARS},APP_BASE_URL=${APP_BASE_URL}"
ENV_VARS="${ENV_VARS},AUTH_RATE_LIMIT_PROVIDER=${AUTH_RATE_LIMIT_PROVIDER:-local}"
ENV_VARS="${ENV_VARS},AUTH_RATE_LIMIT_WINDOW_MS=${AUTH_RATE_LIMIT_WINDOW_MS:-900000}"
ENV_VARS="${ENV_VARS},AUTH_RATE_LIMIT_MAX_REQUESTS=${AUTH_RATE_LIMIT_MAX_REQUESTS:-20}"
ENV_VARS="${ENV_VARS},AUTH_RATE_LIMIT_MAX_PER_EMAIL=${AUTH_RATE_LIMIT_MAX_PER_EMAIL:-8}"
ENV_VARS="${ENV_VARS},AUTH_VERIFY_MAX_ATTEMPTS=${AUTH_VERIFY_MAX_ATTEMPTS:-5}"
ENV_VARS="${ENV_VARS},AUTH_TOKEN_RETENTION_HOURS=${AUTH_TOKEN_RETENTION_HOURS:-48}"
ENV_VARS="${ENV_VARS},GCS_SIGNED_URL_TTL_SECONDS=${GCS_SIGNED_URL_TTL_SECONDS:-900}"

# Deploy
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
  --set-secrets="$SECRETS_FLAG" \
  --set-env-vars="$ENV_VARS" \
  --project="$PROJECT_ID"

SERVICE_URL=$(gcloud run services describe "$SERVICE_NAME" \
  --region="$REGION" \
  --project="$PROJECT_ID" \
  --format="value(status.url)")

echo ""
echo "Deployment complete!"
echo "App URL: $SERVICE_URL"
