# app/celery_app.py
import os
from celery import Celery
from app.config import settings

# Safely retrieve the Redis URL from settings, providing a robust default fallback
redis_url = getattr(settings, "REDIS_URL", "redis://localhost:6379/0")

# Initialize the Celery application using Redis broker and backend configurations
celery_app = Celery(
    "issp_tasks",
    broker=redis_url,
    backend=redis_url
)

# Apply global task execution, reliability, and security parameters
celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="Asia/Manila",
    enable_utc=True,
    
    # Connection settings: Ensure resilience during worker startup if Redis boots slowly
    broker_connection_retry_on_startup=True,
    
    # Reliability: Restart child processes after a set threshold to prevent memory bloating
    worker_max_tasks_per_child=100,
    
    # Concurrency: Limit prefetching to 1 task per worker to balance heavy PDF compilation tasks
    worker_prefetch_multiplier=1,
    
    # Reliability: Acknowledge tasks only after completion so crashes can be recovered safely
    task_acks_late=True,
    
    # Storage setting: Do not automatically re-queue on worker loss to prevent infinite crash loops
    task_reject_on_worker_lost=False,
    
    # Lifecycle settings: Ample padding between soft and hard timeouts to capture SoftTimeLimitExceeded
    task_soft_time_limit=300,  # 5 minutes soft limit
    task_time_limit=600,       # 10 minutes hard limit watchdog
    
    # Track the started state to let the frontend identify ongoing background tasks
    task_track_started=True,
    
    # Storage: Automatically expire and prune task results from Redis cache after 24 hours
    result_expires=86400,

    # Force registration of tasks on worker startup to prevent KeyError anomalies
    imports=["app.tasks.pdf_tasks"]
)

# Enable automatic task discovery within the tasks package to register modules dynamically
celery_app.autodiscover_tasks(["app.tasks"])