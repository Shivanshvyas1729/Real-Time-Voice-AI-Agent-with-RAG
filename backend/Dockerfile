# Use a lightweight Python 3.12 base image
FROM python:3.12-slim

# Set the working directory inside the container
WORKDIR /app

# Install system dependencies required for building Python packages
# and making HTTPS requests, then clean up package cache
RUN apt-get update && apt-get install -y \
    build-essential \
    curl \
    ca-certificates \
    && update-ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy the uv package manager binary from its official container image
COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/uv

# Copy dependency configuration files first to leverage Docker layer caching
COPY pyproject.toml uv.lock ./

# Install project dependencies exactly as specified in the lock file
RUN uv sync --frozen --no-cache

# Copy the rest of the application source code into the container
COPY . .

# Document that the application listens on port 8000
EXPOSE 8000

# Start the FastAPI application using Uvicorn
CMD ["uv", "run", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]

