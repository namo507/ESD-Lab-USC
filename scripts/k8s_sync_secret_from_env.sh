#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${REPO_ROOT}"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

NAMESPACE="${K8S_HELM_NAMESPACE:-esd-lab}"
SECRET_NAME="${K8S_SECRET_NAME:-esd-lab-dashboard-secrets}"

if ! command -v kubectl >/dev/null 2>&1; then
  echo "ERROR: kubectl is required to apply Kubernetes Secrets." >&2
  exit 1
fi

kubectl get namespace "${NAMESPACE}" >/dev/null 2>&1 || kubectl create namespace "${NAMESPACE}" >/dev/null

kubectl -n "${NAMESPACE}" create secret generic "${SECRET_NAME}" \
  --from-literal=redcapApiUrl="${REDCAP_API_URL:-}" \
  --from-literal=redcapApiToken="${REDCAP_API_TOKEN:-}" \
  --from-literal=participantIdSalt="${PARTICIPANT_ID_SALT:-${NANO_ID_SALT:-}}" \
  --from-literal=dashboardOperatorToken="${DASHBOARD_OPERATOR_TOKEN:-}" \
  --from-literal=pagesDeployHookUrl="${PAGES_DEPLOY_HOOK_URL:-}" \
  --from-literal=dashboardAssistantApiKey="${DASHBOARD_ASSISTANT_API_KEY:-${DASHBOARD_ASSISTANT_FALLBACK_API_KEY:-${OPENAI_API_KEY:-}}}" \
  --from-literal=dashboardAssistantGeminiApiKey="${DASHBOARD_ASSISTANT_GEMINI_API_KEY:-${GEMINI_API_KEY:-}}" \
  --dry-run=client \
  -o yaml | kubectl apply -f -

echo "Applied secret ${SECRET_NAME} in namespace ${NAMESPACE}."
