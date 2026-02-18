# Python AI Backend Dockerfile
# Provides full ML models: Random Forest, LSTM, Anomaly Detection
# Updated: Force rebuild with TensorFlow

FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Environment variables for TensorFlow - memory optimization
ENV TF_CPP_MIN_LOG_LEVEL=2
ENV PYTHONUNBUFFERED=1
ENV PIP_DEFAULT_TIMEOUT=300
# Limit TensorFlow memory usage
ENV TF_FORCE_GPU_ALLOW_GROWTH=true
ENV TF_ENABLE_ONEDNN_OPTS=0
ENV OMP_NUM_THREADS=1
ENV TF_NUM_INTEROP_THREADS=1
ENV TF_NUM_INTRAOP_THREADS=1
# Disable GPU (use CPU only for Railway)
ENV CUDA_VISIBLE_DEVICES=-1

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

# Create non-root user for runtime security
RUN adduser --disabled-password --gecos "" appuser \
    && mkdir -p /home/appuser/.cache \
    && chown -R appuser:appuser /app /home/appuser
USER appuser

# Set default port (Railway will override with $PORT)
ENV PORT=8000

# Expose port
EXPOSE 8000

# Run the API server with gunicorn (more robust for production)
CMD ["sh", "-c", "gunicorn api_server:app --bind 0.0.0.0:$PORT --worker-class uvicorn.workers.UvicornWorker --workers ${GUNICORN_WORKERS:-2} --timeout 120 --keep-alive 5 --access-logfile - --error-logfile -"]
