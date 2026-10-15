PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
OLE_SIGNATURE = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"
ZIP_SIGNATURES = (b"PK\x03\x04", b"PK\x05\x06")


def file_matches_extension(extension: str, data: bytes) -> bool:
    """Check that the leading bytes agree with the claimed file extension."""
    extension = extension.lower()
    if extension == ".pdf":
        return data[:1024].lstrip().startswith(b"%PDF")
    if extension == ".png":
        return data.startswith(PNG_SIGNATURE)
    if extension in (".jpg", ".jpeg"):
        return data.startswith(b"\xff\xd8\xff")
    if extension in (".docx", ".xlsx"):
        return data.startswith(ZIP_SIGNATURES)
    if extension in (".doc", ".xls"):
        return data.startswith(OLE_SIGNATURE)
    return False
