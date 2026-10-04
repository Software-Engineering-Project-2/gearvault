import os

# Server socket
bind = os.getenv("BIND", "0.0.0.0:5000")
backlog = 2048

# Worker processes
workers = int(os.getenv("WEB_CONCURRENCY", "2"))
worker_class = "sync"
timeout = int(os.getenv("GUNICORN_TIMEOUT", "120"))
keepalive = 5

# Logging
accesslog = "-"
errorlog = "-"
loglevel = os.getenv("LOG_LEVEL", "info").lower()
capture_output = True

# Process naming
proc_name = "gearvault_backend"
