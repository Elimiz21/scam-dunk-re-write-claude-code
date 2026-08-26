# Python AI Backend Dockerfile
# Rules-based scoring + optional ML models (Random Forest, LSTM, Anomaly Detection).
# TensorFlow is NOT installed here — it is only needed when ML_MODELS_ENABLED=true,
# which requires retraining on real data first (disabled by default).
# To enable ML: install requirements-ml.txt on top of this image.

FROM python:3.11-slim

WORKDIR /app

ENV PYTHONUNBUFFERED=1
ENV PIP_DEFAULT_TIMEOUT=300

# gcc/g++ needed for scikit-learn C extensions; curl for health probes
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better layer caching
COPY requirements.txt .

RUN pip install --no-cache-dir --timeout 300 -r requirements.txt

# Copy application code
COPY . .

RUN mkdir -p models

# Verify the app imports cleanly (no TF needed at import time — it is lazy)
RUN python -c "from api_server import app; print('App imported successfully')"

# Non-root runtime user
RUN adduser --disabled-password --gecos "" appuser \
    && mkdir -p /home/appuser/.cache \
    && chown -R appuser:appuser /app /home/appuser
USER appuser

ENV PORT=8000
EXPOSE 8000

CMD ["sh", "-c", "gunicorn api_server:app --bind 0.0.0.0:$PORT --worker-class uvicorn.workers.UvicornWorker --workers ${GUNICORN_WORKERS:-1} --timeout 300 --keep-alive 5 --access-logfile - --error-logfile -"]
