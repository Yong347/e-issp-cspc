# app/celery_app.py
import os
import sys
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

# Detect Windows runtime environment to enforce solo execution pool and prevent prefork fork crashes
is_windows = os.name == "nt" or sys.platform.startswith("win")
default_pool = "solo" if is_windows else "prefork"

# Apply global task execution, reliability, scalability, and security parameters
celery_app.conf.update(
    worker_pool=getattr(settings, "CELERY_WORKER_POOL", default_pool),
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="Asia/Manila",
    enable_utc=True,
    
    # Connection settings: Ensure resilience during worker startup if Redis boots slowly
    broker_connection_retry_on_startup=True,
    
    # Restart child processes after a low threshold on prefork pool to prevent memory leaks
    worker_max_tasks_per_child=getattr(settings, "CELERY_WORKER_MAX_TASKS_PER_CHILD", 5) if not is_windows else None,
    
    # Concurrency: Limit prefetching to 1 task per worker to balance heavy PDF compilation tasks
    worker_prefetch_multiplier=1,
    
    # Reliability: Acknowledge tasks only after completion so crashes can be recovered safely
    task_acks_late=True,
    
    # Reject and requeue tasks if a worker process terminates abruptly mid-task
    task_reject_on_worker_lost=getattr(settings, "CELERY_TASK_REJECT_ON_WORKER_LOST", True),
    
    # Lifecycle settings: Extended timeouts to accommodate 300+ page dual-pass compilation
    task_soft_time_limit=getattr(settings, "CELERY_TASK_SOFT_TIME_LIMIT", 1500),  # 25 minutes soft limit
    task_time_limit=getattr(settings, "CELERY_TASK_TIME_LIMIT", 1800),            # 30 minutes hard limit watchdog
    
    # Track the started state to let the frontend identify ongoing background tasks
    task_track_started=True,
    
    # Storage: Automatically expire and prune task results from Redis cache after 24 hours
    result_expires=86400,

    # Periodic Celery Beat Schedule: Automated evaluation of active cycle expiration and archival
    beat_schedule={
        "evaluate-cycle-rollover-daily": {
            "task": "app.tasks.maintenance_tasks.check_cycle_expiration_job",
            "schedule": 86400.0,  # Executes every 24 hours
        },
    },

    # Force registration of tasks on worker startup to prevent KeyError anomalies
    imports=[
        "app.tasks.pdf_tasks",
        "app.tasks.maintenance_tasks"
    ]
)

# Enable automatic task discovery within the tasks package to register modules dynamically
celery_app.autodiscover_tasks(["app.tasks"])