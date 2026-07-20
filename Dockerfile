FROM python:3.11-slim

# 1. Install system-level dependencies required by WeasyPrint
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpango-1.0-0 \
    libpangoft2-1.0-0 \
    libcairo2 \
    libjpeg-dev \
    libgif-dev \
    shared-mime-info \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /code

# 2. Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

# 3. Copy codebase
COPY . .

# Expose the web server port
EXPOSE 8000