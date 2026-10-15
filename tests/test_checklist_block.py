import pytest
from pydantic import ValidationError

from app.schemas import IsspCompositionBlock
from app.tasks.pdf_tasks import checklist_box_uri


def test_checklist_states_are_padded_to_item_count():
    block = IsspCompositionBlock(type="checklist", items=["a", "b", "c"], states=["checked"])
    assert block.states == ["checked", "unchecked", "unchecked"]


def test_checklist_requires_items_and_valid_states():
    with pytest.raises(ValidationError):
        IsspCompositionBlock(type="checklist", items=[])
    with pytest.raises(ValidationError):
        IsspCompositionBlock(type="checklist", items=["a"], states=["maybe"])


def test_each_state_has_a_distinct_box_image():
    uris = {checklist_box_uri(state) for state in ("unchecked", "checked", "crossed")}
    assert len(uris) == 3
