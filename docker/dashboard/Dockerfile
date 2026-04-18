FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DASHBOARD_PORT=8080

WORKDIR /app

COPY dashboard/requirements-dashboard.txt /tmp/requirements-dashboard.txt
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r /tmp/requirements-dashboard.txt

COPY . /app

EXPOSE 8080

CMD ["python", "dashboard/server/live_dashboard_server.py", "--host", "0.0.0.0", "--port", "8080", "--interval", "20", "--fallback-synthetic"]