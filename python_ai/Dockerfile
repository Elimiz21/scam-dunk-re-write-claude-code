# Python AI Backend Dockerfile
# Provides full ML models: Random Forest, LSTM, Anomaly Detection

FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create models directory if not exists
RUN mkdir -p models

# Set default port (Railway will override with $PORT)
ENV PORT=8000

# Expose port
EXPOSE 8000

# Run the API server - use shell form to expand $PORT
CMD uvicorn api_server:app --host 0.0.0.0 --port $PORT
