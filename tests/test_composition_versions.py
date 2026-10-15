from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.admin.router import (
    MAX_COMPOSITION_VERSIONS,
    get_issp_composition_version,
    list_issp_composition_versions,
    save_issp_document_composition,
)
from app.database.models import AuditTrail, Base, MasterNarrative
from app.schemas import IsspDocumentCompositionPayload


def _payload(title):
    return IsspDocumentCompositionPayload.model_validate({
        "version": 2,
        "sections": [{"id": "s1", "title": title, "blocks": [], "children": []}],
        "official_sections": {},
    })


def test_each_save_records_a_restorable_version_and_history_is_capped():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    admin = {"id": 1}

    with Session(engine) as db:
        db.add(MasterNarrative(issp_period="2026-2028", issp_period_from=2026, issp_period_to=2028))
        db.commit()

        for index in range(MAX_COMPOSITION_VERSIONS + 3):
            save_issp_document_composition("2026-2028", _payload(f"Title {index}"), db, admin)

        versions = list_issp_composition_versions("2026-2028", db, admin)
        assert len(versions) == MAX_COMPOSITION_VERSIONS

        oldest = versions[-1]
        restored = get_issp_composition_version("2026-2028", oldest["id"], db, admin)
        assert restored.sections[0].title == "Title 3"

        saves = db.query(AuditTrail).filter(AuditTrail.action == "ISSP_COMPOSITION_SAVED").count()
        assert saves == MAX_COMPOSITION_VERSIONS + 3
