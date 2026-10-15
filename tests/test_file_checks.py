from app.utils.file_checks import file_matches_extension


def test_accepts_matching_signatures():
    assert file_matches_extension(".png", b"\x89PNG\r\n\x1a\nrest")
    assert file_matches_extension(".jpg", b"\xff\xd8\xff\xe0data")
    assert file_matches_extension(".pdf", b"%PDF-1.7 data")
    assert file_matches_extension(".docx", b"PK\x03\x04data")


def test_rejects_mismatched_content():
    assert not file_matches_extension(".png", b"<html>not an image</html>")
    assert not file_matches_extension(".pdf", b"PK\x03\x04data")
    assert not file_matches_extension(".exe", b"MZ")
