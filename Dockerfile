# Use a modern, slim Python image
FROM python:3.12-slim-bookworm

# 1. Install 'uv' from its official image
COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/uv

# 2. Set environment variables
# UV_LINK_MODE=copy: Ensures files are copied (safer for Docker layers) rather than hardlinked
ENV UV_COMPILE_BYTECODE=1
ENV UV_LINK_MODE=copy
# Ensure we use the virtual environment created by uv
ENV PATH="/app/.venv/bin:$PATH"

WORKDIR /app

# 3. Install dependencies FIRST (Caching layer)
# Copy only the lock files to cache this layer if dependencies don't change
COPY pyproject.toml uv.lock ./

# Sync the dependencies:
# --frozen: Fails if lockfile is out of date (good for CI/CD)
# --no-dev: Excludes development dependencies
# --no-install-project: Installs libs but skips installing the app root itself (we copy that later)
RUN uv sync --frozen --no-dev --no-install-project

# 4. Copy the rest of the application
COPY . .

# 5. Initialize DB storage permissions
RUN mkdir -p /app/data && chmod 777 /app/data

EXPOSE 5000

# OLD: CMD ["python", "app.py"]
# NEW: Run with Gunicorn (4 worker processes)
CMD ["gunicorn", "--workers", "4", "--bind", "0.0.0.0:5000", "app:app"]