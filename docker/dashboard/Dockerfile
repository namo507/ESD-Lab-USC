FROM python:3.11-slim

LABEL maintainer="ESD Lab USC <esd-lab@usc.edu>" \
    version="0.1.0" \
    description="Runtime image for the ESD Lab USC NANO live dashboard"

ARG PIP_VERSION=25.3

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DASHBOARD_PORT=8080

WORKDIR /app

# Install Node.js 20 + npm 10 (required by the Vite 8 public SPA build)
RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential ca-certificates curl gnupg \
    && mkdir -p /etc/apt/keyrings \
    && curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
       | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg \
    && echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" \
       > /etc/apt/sources.list.d/nodesource.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends nodejs \
    && npm install -g npm@10.9.8 \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd -g 1000 appuser \
    && useradd -u 1000 -g 1000 -m appuser \
    && chown appuser:appuser /app

COPY --chown=appuser:appuser dashboard/requirements.txt /tmp/dashboard-requirements.txt
RUN python -m pip install --no-cache-dir --upgrade "pip==${PIP_VERSION}" \
    && python -m pip install --no-cache-dir -r /tmp/dashboard-requirements.txt

# Install frontend dependencies so `npm run build` works at startup
COPY --chown=appuser:appuser web/package.json web/package-lock.json /app/web/
RUN cd /app/web && npm ci --ignore-scripts

COPY --chown=appuser:appuser . /app

USER appuser

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 CMD python -c "import json, urllib.request; payload = json.load(urllib.request.urlopen('http://127.0.0.1:8080/api/healthz')); assert payload.get('status') == 'ok'; assert payload.get('dashboard'); assert payload.get('readings')"

EXPOSE 8080

CMD ["python", "dashboard/server/live_dashboard_server.py", "--host", "0.0.0.0", "--port", "8080", "--interval", "20", "--fallback-synthetic"]
