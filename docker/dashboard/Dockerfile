FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DASHBOARD_PORT=8080

WORKDIR /app

COPY dashboard/requirements-dashboard.txt /tmp/requirements-dashboard.txt
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r /tmp/requirements-dashboard.txt

COPY . /app

HEALTHCHECK --interval=30s --timeout=5s --start-period=45s --retries=3 CMD python -c "import json, urllib.request; payload = json.load(urllib.request.urlopen('http://127.0.0.1:8080/api/healthz')); assert payload.get('status') == 'ok'; assert payload.get('dashboard'); assert payload.get('readings')"

EXPOSE 8080

CMD ["python", "dashboard/server/live_dashboard_server.py", "--host", "0.0.0.0", "--port", "8080", "--interval", "20", "--fallback-synthetic"]