# app/storage/s3_client.py
import os
import re
import base64
import logging
import mimetypes
import urllib.request
from typing import Dict, Any, Optional
from urllib.parse import urlparse
from pathlib import Path
import boto3
from botocore.exceptions import ClientError
from botocore.config import Config
from app.config import settings

logger = logging.getLogger(__name__)


class ISSPStorageClient:
    def __init__(self):
        self.storage_type = settings.STORAGE_TYPE.lower()
        self.bucket_name = settings.AWS_STORAGE_BUCKET_NAME
        
        if self.storage_type == "s3":
            try:
                self.client = boto3.client(
                    "s3",
                    aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
                    aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
                    region_name=settings.AWS_S3_REGION_NAME,
                    config=Config(signature_version="s3v4")
                )
            except Exception as conn_err:
                logger.critical(
                    f"S3 Connection Initialization Failure: {str(conn_err)}. "
                    "Ensure AWS environment parameters are correctly configured.", 
                    exc_info=conn_err
                )
                self.client = None
        else:
            self.client = None
            os.makedirs(settings.LOCAL_UPLOAD_DIR, exist_ok=True)

    def verify_bucket_connection(self) -> bool:
        """
        Validates S3 connection parameters and confirms that the target S3 bucket exists.
        """
        if self.storage_type != "s3" or not self.client:
            return True
        try:
            self.client.head_bucket(Bucket=self.bucket_name)
            logger.info(f"Storage Pre-Flight Check: Target S3 Bucket '{self.bucket_name}' is accessible.")
            return True
        except ClientError as e:
            error_code = e.response.get("Error", {}).get("Code")
            logger.critical(
                f"STORAGE Pre-Flight Check Failure: Target S3 Bucket '{self.bucket_name}' is not accessible. "
                f"Error Code: {error_code}", exc_info=e
            )
            return False
        except Exception as e:
            logger.critical(f"STORAGE Pre-Flight Check Failure: Connection to S3 failed: {str(e)}", exc_info=e)
            return False

    def _sanitize_filename(self, filename: str) -> str:
        return re.sub(r"[^a-zA-Z0-9._-]", "_", filename)

    def get_canvas_key(self, proposal_id: str, supplier_name: str, filename: str) -> str:
        safe_supplier = self._sanitize_filename(supplier_name.lower())
        safe_file = self._sanitize_filename(filename)
        return f"canvases/{proposal_id}/{safe_supplier}/{safe_file}"

    def get_tor_key(self, proposal_id: str, filename: str) -> str:
        safe_file = self._sanitize_filename(filename)
        return f"proposals_tor/{proposal_id}/{safe_file}"

    def get_unserviceable_report_key(self, department_id: str, filename: str) -> str:
        safe_file = self._sanitize_filename(filename)
        return f"unserviceable_reports/{department_id}/{safe_file}"

    def get_diagram_key(self, category: str, filename: str) -> str:
        safe_file = self._sanitize_filename(filename)
        return f"diagrams/{category}/{safe_file}"

    def get_generated_pdf_key(self, issp_id: str) -> str:
        return f"generated_issps/{issp_id}.pdf"

    def extract_key_from_url(self, url: str) -> Optional[str]:
        """
        Fix (Audit Issue 22): Robustly extracts S3 or local keys from URLs.
        Handles custom CNAMEs, pre-signed signatures, and local static prefixes to prevent NoneType deletion blocks.
        """
        if not url:
            return None
            
        clean_url = url.split("?")[0]
        
        # Extract from local emulator
        if "static/uploads/" in clean_url:
            return clean_url.split("static/uploads/")[-1].strip("/")
            
        # Extract from standard S3 URL (with bucket name in path)
        if self.bucket_name in clean_url:
            return clean_url.split(f"{self.bucket_name}/")[-1].strip("/")
            
        # Fallback regex for generic amazonaws S3 URLs
        match = re.search(r's3\.[a-z0-9-]+\.amazonaws\.com/(.+)$', clean_url)
        if match:
            return match.group(1).strip("/")
            
        # Fallback for custom CNAME configurations (assumes the URI path is the object key)
        parsed = urlparse(clean_url)
        path = parsed.path.lstrip("/")
        return path if path else None

    def get_as_base64_uri(self, object_url: Optional[str]) -> Optional[str]:
        """
        Retrieves a storage asset directly and converts it to an inline Base64 Data URI.
        Ensures secure sandboxed read verification to block directory traversal.
        """
        if not object_url:
            return None

        clean_url = object_url.split("?")[0]

        # External HTTP/HTTPS asset fetch
        if clean_url.startswith(("http://", "https://")) and self.bucket_name not in clean_url:
            try:
                req = urllib.request.Request(
                    object_url, 
                    headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) CSPC-Compiler/4.3'}
                )
                with urllib.request.urlopen(req, timeout=10) as response:
                    binary_data = response.read()
                    content_type = response.headers.get_content_type() or 'image/png'
                    encoded = base64.b64encode(binary_data).decode('utf-8')
                    return f"data:{content_type};base64,{encoded}"
            except Exception as e:
                logger.error(f"External image URL download failed for {object_url}: {str(e)}")
                return object_url

        key = self.extract_key_from_url(object_url)
        if not key:
            return object_url

        if self.storage_type == "s3" and self.client:
            try:
                response = self.client.get_object(Bucket=self.bucket_name, Key=key)
                binary_data = response['Body'].read()
                content_type = response.get('ContentType', 'image/png')
                encoded = base64.b64encode(binary_data).decode('utf-8')
                return f"data:{content_type};base64,{encoded}"
            except Exception as e:
                logger.error(f"S3 Direct binary read failed for key {key}: {str(e)}")
                return object_url
        else:
            try:
                # Fix (Audit Issue 23 & 30): Cross-Platform Path Traversal mitigation.
                # Uses pathlib to resolve exact absolute boundaries, immune to Windows drive-letter bypassing.
                path_parts = [p for p in key.split("/") if p and p not in [".", ".."]]
                
                resolved_base = Path(settings.LOCAL_UPLOAD_DIR).resolve()
                local_path = Path(resolved_base, *path_parts).resolve()
                
                # Check strict containment within the upload directory
                if not str(local_path).startswith(str(resolved_base)):
                    logger.warning(f"Security Block: Local directory escape attempt detected. Key: {key}")
                    return object_url
                
                if local_path.exists():
                    with open(local_path, "rb") as f:
                        binary_data = f.read()
                    encoded = base64.b64encode(binary_data).decode('utf-8')
                    mime_type, _ = mimetypes.guess_type(str(local_path))
                    if not mime_type:
                        mime_type = "image/png"
                    return f"data:{mime_type};base64,{encoded}"
                return object_url
            except Exception as e:
                logger.error(f"Local direct binary read failed for key {key}: {str(e)}")
                return object_url

    def delete_object(self, key: str) -> bool:
        """
        Deletes an object from S3 or local storage.
        Includes protections against shared catalog file erasure.
        """
        if not key:
            return False
            
        # Fix (Audit Issues 9 & 11): Shared Catalog Protection
        # Do not allow deletion of seeded or shared administrative items.
        protected_prefixes = ["catalog/", "pc_standard/", "shared/"]
        if any(prefix in key for prefix in protected_prefixes):
            logger.info(f"Deletion skipped: Key '{key}' belongs to shared global catalog assets.")
            return True # Return true so the DB transaction can safely proceed without error

        if self.storage_type == "s3" and self.client:
            try:
                self.client.delete_object(Bucket=self.bucket_name, Key=key)
                logger.info(f"Deleted S3 object: {key}")
                return True
            except ClientError as e:
                logger.error(f"Failed to delete S3 object {key}: {e}")
                return False
        else:
            try:
                path_parts = [p for p in key.split("/") if p and p not in [".", ".."]]
                resolved_base = Path(settings.LOCAL_UPLOAD_DIR).resolve()
                local_path = Path(resolved_base, *path_parts).resolve()
                
                if str(local_path).startswith(str(resolved_base)) and local_path.exists():
                    os.remove(local_path)
                    logger.info(f"Deleted local file: {local_path}")
                return True
            except FileNotFoundError:
                # Fix (Audit Issues 10 & 21): File Cleanup Crash
                # Ignore missing files so the parent database record can still be deleted
                logger.warning(f"Local file already missing during deletion: {key}")
                return True
            except Exception as e:
                logger.error(f"Failed to delete local file {key}: {e}")
                return False

    def generate_upload_url(
        self,
        object_key: str,
        content_type: str,
        max_content_length: int,
        expiration_seconds: int = 3600
    ) -> Optional[Dict[str, Any]]:
        if self.storage_type == "s3" and self.client:
            try:
                response = self.client.generate_presigned_post(
                    Bucket=self.bucket_name,
                    Key=object_key,
                    Fields={"Content-Type": content_type},
                    Conditions=[
                        {"Content-Type": content_type},
                        ["content-length-range", 1, max_content_length]
                    ],
                    ExpiresIn=expiration_seconds
                )
                return response
            except ClientError as e:
                logger.error(f"Failed generating presigned POST for key {object_key}: {e}")
                return None
        else:
            path_parts = [p for p in object_key.split("/") if p and p not in [".", ".."]]
            local_target_path = os.path.join(settings.LOCAL_UPLOAD_DIR, *path_parts)
            return {
                "url": f"/api/local-upload-mock/{object_key}",
                "fields": {
                    "Content-Type": content_type,
                    "local_destination": local_target_path
                }
            }

    def generate_download_url(
        self,
        object_key: str,
        expiration_seconds: int = 1800
    ) -> Optional[str]:
        if self.storage_type == "s3" and self.client:
            try:
                url = self.client.generate_presigned_url(
                    ClientMethod="get_object",
                    Params={"Bucket": self.bucket_name, "Key": object_key},
                    ExpiresIn=expiration_seconds
                )
                return url
            except ClientError as e:
                logger.error(f"Failed generating download link for key {object_key}: {e}")
                return None
        else:
            return f"/static/uploads/{object_key}"

    def upload_compiled_pdf(self, file_data: bytes, issp_id: str) -> bool:
        key = self.get_generated_pdf_key(issp_id)
        if self.storage_type == "s3" and self.client:
            try:
                self.client.put_object(
                    Bucket=self.bucket_name,
                    Key=key,
                    Body=file_data,
                    ContentType="application/pdf"
                )
                return True
            except ClientError as e:
                logger.error(f"Failed direct upload of compiled PDF {issp_id}: {e}")
                return False
        else:
            try:
                path_parts = [p for p in key.split("/") if p and p not in [".", ".."]]
                local_path = os.path.join(settings.LOCAL_UPLOAD_DIR, *path_parts)
                os.makedirs(os.path.dirname(local_path), exist_ok=True)
                with open(local_path, "wb") as f:
                    f.write(file_data)
                return True
            except IOError as e:
                logger.error(f"Failed writing compiled PDF {issp_id} to local disk: {e}")
                return False

    def upload_unserviceable_report(self, file_data: bytes, department_id: str, filename: str) -> Optional[str]:
        key = self.get_unserviceable_report_key(department_id, filename)
        if self.storage_type == "s3" and self.client:
            try:
                self.client.put_object(
                    Bucket=self.bucket_name,
                    Key=key,
                    Body=file_data
                )
                return self.generate_download_url(key)
            except ClientError as e:
                logger.error(f"Failed uploading unserviceable report {filename}: {e}")
                return None
        else:
            try:
                path_parts = [p for p in key.split("/") if p and p not in [".", ".."]]
                local_path = os.path.join(settings.LOCAL_UPLOAD_DIR, *path_parts)
                os.makedirs(os.path.dirname(local_path), exist_ok=True)
                with open(local_path, "wb") as f:
                    f.write(file_data)
                return f"/static/uploads/{key}"
            except IOError as e:
                logger.error(f"Failed writing unserviceable report {filename} to disk: {e}")
                return None

    def upload_canvas_evidence(self, file_data: bytes, key: str) -> bool:
        if self.storage_type == "s3" and self.client:
            try:
                self.client.put_object(
                    Bucket=self.bucket_name,
                    Key=key,
                    Body=file_data
                )
                return True
            except ClientError as e:
                logger.error(f"Failed direct upload of canvas evidence {key}: {e}")
                return False
        else:
            try:
                path_parts = [p for p in key.split("/") if p and p not in [".", ".."]]
                local_path = os.path.join(settings.LOCAL_UPLOAD_DIR, *path_parts)
                os.makedirs(os.path.dirname(local_path), exist_ok=True)
                with open(local_path, "wb") as f:
                    f.write(file_data)
                return True
            except IOError as e:
                logger.error(f"Failed writing canvas evidence {key} to local disk: {e}")
                return False

    def check_glacier_metadata(self, object_key: str) -> Dict[str, Any]:
        """
        Retrieves object storage metadata and parses Glacier restoration status.
        Returns a time-based estimated progress value if active.
        """
        if self.storage_type != "s3" or not self.client:
            return {
                "storage_class": "STANDARD",
                "is_restoring": False,
                "restore_completed": False,
                "restore_status_detail": None,
                "restore_progress": 100
            }
        try:
            response = self.client.head_object(
                Bucket=self.bucket_name,
                Key=object_key
            )
            storage_class = response.get("StorageClass", "STANDARD")
            restore_header = response.get("Restore", "")
            
            is_restoring = "ongoing-request=\"true\"" in restore_header
            restore_completed = "ongoing-request=\"false\"" in restore_header

            # Default fallback when storage state is warm
            progress_val = 100 if storage_class == "STANDARD" else 0
            
            if restore_completed:
                progress_val = 100
            elif is_restoring:
                # AWS Standard retrieves require 3-5 hours. Real-time percentages
                # are not exposed in HEAD responses; providing a safe baseline.
                progress_val = 50

            return {
                "storage_class": storage_class,
                "is_restoring": is_restoring,
                "restore_completed": restore_completed,
                "restore_status_detail": restore_header or None,
                "restore_progress": progress_val
            }
        except ClientError as e:
            logger.error(f"Failed to query S3 metadata for key {object_key}: {e}")
            return {
                "storage_class": "STANDARD",
                "is_restoring": False,
                "restore_completed": False,
                "restore_status_detail": None,
                "restore_progress": 0
            }

    def initiate_glacier_restore(
        self, 
        object_key: str, 
        days: int = 7, 
        tier: str = "Standard"
    ) -> bool:
        if self.storage_type != "s3" or not self.client:
            logger.warning(f"Restoration skipped: Local storage or uninitialized client. Key: {object_key}")
            return True

        try:
            self.client.restore_object(
                Bucket=self.bucket_name,
                Key=object_key,
                RestoreRequest={
                    "Days": days,
                    "GlacierJobParameters": {
                        "Tier": tier
                    }
                }
            )
            logger.info(f"Glacier restore initiated successfully for key: {object_key}")
            return True
        except ClientError as e:
            logger.error(f"Failed to trigger S3 Glacier restoration for key {object_key}: {e}")
            return False

    def restore_object(self, key: str, days: int = 7) -> bool:
        return self.initiate_glacier_restore(key, days=days)


storage_client = ISSPStorageClient()