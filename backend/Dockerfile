FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    FLASK_APP=wsgi.py \
    PORT=5000

WORKDIR /app

# Install system dependencies (curl for healthcheck, libpq for PostgreSQL)
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl libpq5 \
    && rm -rf /var/lib/apt/lists/*

# Install python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application source code
COPY . .

# Create a non-root system user and change ownership
RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app
USER appuser

EXPOSE 5000

# Health check against liveness endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:${PORT:-5000}/api/health || exit 1

# Default command: launch Gunicorn with wsgi app
CMD ["gunicorn", "--config", "gunicorn.conf.py", "wsgi:app"]
