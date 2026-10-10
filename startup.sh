#!/bin/bash
# ==============================================================================
# Azure App Service Linux - Startup Hook for WeasyPrint Native Dependencies
# ==============================================================================

echo "[AZURE STARTUP] Installing WeasyPrint OS C-libraries (Pango, Cairo, GObject)..."
apt-get update && apt-get install -y --no-install-recommends \
    libpango-1.0-0 \
    libpangoft2-1.0-0 \
    libcairo2 \
    libpangocairo-1.0-0 \
    libgdk-pixbuf-2.0-0 \
    shared-mime-info \
    fontconfig \
    fonts-liberation \
    fonts-dejavu-core

echo "[AZURE STARTUP] Starting Uvicorn server..."
uvicorn app.main:app --host 0.0.0.0 --port 8000