FROM python:3.11-slim

# 1. Environment flags for optimal container execution and immediate log streaming
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PORT=8000

# 2. Install system-level dependencies and font libraries required by WeasyPrint
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpango-1.0-0 \
    libpangoft2-1.0-0 \
    libcairo2 \
    libpangocairo-1.0-0 \
    libgdk-pixbuf-2.0-0 \
    libharfbuzz-subset0 \
    libopenjp2-7 \
    libjpeg-dev \
    libgif-dev \
    shared-mime-info \
    fontconfig \
    fonts-liberation \
    fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /code

# 3. Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

# 4. Copy codebase and ensure local uploads directory exists
COPY . .
RUN mkdir -p /code/uploads

# 5. Expose default service port
EXPOSE 8000

# 6. Default startup command (starts web server; overridden by docker-compose for worker/beat)
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]