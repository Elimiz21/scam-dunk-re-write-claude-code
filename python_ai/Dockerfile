# Python AI Backend Dockerfile
# Provides full ML models: Random Forest, LSTM, Anomaly Detection

FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Environment variables for TensorFlow
ENV TF_CPP_MIN_LOG_LEVEL=2
ENV PYTHONUNBUFFERED=1
ENV PIP_DEFAULT_TIMEOUT=300

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    curl \
    libhdf5-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY requirements.txt .

# Install Python dependencies (TensorFlow needs extra time)
RUN pip install --no-cache-dir --timeout 300 -r requirements.txt

# Copy application code
COPY . .

# Create models directory if not exists (models are pre-trained and included)
RUN mkdir -p models

# Set default port (Railway will override with $PORT)
ENV PORT=8000

# Expose port
EXPOSE 8000

# Run the API server - use shell form to expand $PORT
CMD uvicorn api_server:app --host 0.0.0.0 --port $PORT
