#!/bin/bash
set -e

# 1. Navigate to the application root directory
cd /home/site/wwwroot

# 2. Activate the Azure Oryx Python Virtual Environment
if [ -d "/home/site/wwwroot/antenv" ]; then
    source /home/site/wwwroot/antenv/bin/activate
elif [ -d "/antenv" ]; then
    source /antenv/bin/activate
elif [ -d "antenv" ]; then
    source antenv/bin/activate
fi

# 3. Install WeasyPrint C-libraries in the background so Port 8000 responds immediately
if [ ! -f "/tmp/weasyprint_installed" ]; then
    (
        echo "[AZURE STARTUP] Installing WeasyPrint OS libraries in background..."
        apt-get update -qq && apt-get install -y --no-install-recommends \
            libpango-1.0-0 \
            libpangoft2-1.0-0 \
            libcairo2 \
            libpangocairo-1.0-0 \
            libgdk-pixbuf-2.0-0 \
            shared-mime-info \
            fontconfig \
            fonts-liberation \
            fonts-dejavu-core && touch /tmp/weasyprint_installed
        echo "[AZURE STARTUP] WeasyPrint libraries installed successfully."
    ) &
fi

# 4. Start Uvicorn immediately using python -m
echo "[AZURE STARTUP] Starting FastAPI server on port 8000..."
TRUSTED_PROXY_IPS="${TRUSTED_PROXY_IPS:-127.0.0.1,::1}"
exec python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 \
    --proxy-headers \
    --forwarded-allow-ips="${TRUSTED_PROXY_IPS}"