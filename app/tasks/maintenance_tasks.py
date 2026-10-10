# app/tasks/maintenance_tasks.py
import logging
from typing import Any, Dict, Optional
from app.celery_app import celery_app
from app.database.session import SessionLocal
from app.services.lifecycle_service import ISSPLifecycleEngine

logger = logging.getLogger(__name__)


def run_cycle_expiration_check(force: bool = False) -> Dict[str, Any]:
    """
    Direct Python invocation helper for lifecycle evaluation.
    Can be safely called in FastAPI startup hooks, cron scripts, or CLI commands
    without requiring Celery or an active Redis broker.
    """
    logger.info("Executing ISSP lifecycle check (force=%s)...", force)
    db = SessionLocal()
    try:
        result = ISSPLifecycleEngine.evaluate_and_rollover_cycle(db, force=force)
        logger.info("Lifecycle check completed with result: %s", result)
        return result
    except Exception as exc:
        db.rollback()
        logger.error(
            "Exception occurred during automated lifecycle evaluation: %s",
            str(exc),
            exc_info=True
        )
        return {
            "status": "FAILURE",
            "error": str(exc),
            "message": "Automated cycle rollover check failed."
        }
    finally:
        db.close()


@celery_app.task(
    bind=True,
    name="app.tasks.maintenance_tasks.check_cycle_expiration_job",
    max_retries=3,
    default_retry_delay=300
)
def check_cycle_expiration_job(self=None, force: bool = False) -> Dict[str, Any]:
    """
    Periodic background maintenance task scheduled via Celery Beat (or manually triggered).
    
    Evaluates whether the active ISSP planning cycle has concluded based on calendar years:
      1. Generates and freezes the final certified PDF compilation snapshot for the concluded cycle.
      2. Transitions the frozen PDF binary to permanent archival storage.
      3. Retires the concluded cycle (is_active = False, is_archived = True).
      4. Auto-provisions the successor N-year cycle, cloning institutional baselines (Outcomes & Ceilings).
    """
    task_id = getattr(getattr(self, "request", None), "id", "direct_call")
    logger.info("Starting scheduled ISSP lifecycle check (task_id=%s, force=%s)...", task_id, force)
    
    db = SessionLocal()
    try:
        result = ISSPLifecycleEngine.evaluate_and_rollover_cycle(db, force=force)
        logger.info("Lifecycle check completed with result: %s", result)
        return result
    except Exception as exc:
        db.rollback()
        logger.error(
            "Exception occurred during automated lifecycle evaluation: %s", 
            str(exc), 
            exc_info=True
        )
        
        # Only attempt Celery retry if executing within an active Celery task context
        if self and hasattr(self, "retry") and hasattr(self, "request") and getattr(self.request, "id", None):
            try:
                raise self.retry(exc=exc, countdown=300)
            except Exception as retry_err:
                logger.warning("Celery retry exhausted or task failed: %s", retry_err)
        
        return {
            "status": "FAILURE",
            "error": str(exc),
            "message": "Automated cycle rollover task encountered an error."
        }
    finally:
        db.close()