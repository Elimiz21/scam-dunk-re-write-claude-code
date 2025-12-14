# Python AI Backend Dockerfile
# Provides full ML models: Random Forest, LSTM, Anomaly Detection
# Updated: Force rebuild with TensorFlow

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
    pkg-config \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY requirements.txt .

# Install Python dependencies - force no cache to ensure TensorFlow installs
RUN pip install --no-cache-dir --timeout 300 -r requirements.txt && \
    python -c "import tensorflow; print('TensorFlow version:', tensorflow.__version__)"

# Copy application code
COPY . .

# Create models directory if not exists (models are pre-trained and included)
RUN mkdir -p models

# Verify the app can be imported
RUN python -c "from api_server import app; print('App imported successfully')"

# Set default port (Railway will override with $PORT)
ENV PORT=8000

# Expose port
EXPOSE 8000

# Run the API server using JSON format as recommended
CMD ["sh", "-c", "uvicorn api_server:app --host 0.0.0.0 --port $PORT"]
