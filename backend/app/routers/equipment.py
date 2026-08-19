import os
import tempfile
import uuid
from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, HTTPException, status, UploadFile, File, Form
from loguru import logger
from bson import ObjectId
from bson.errors import InvalidId
from app.services.text_extraction import TextExtractionService
from app.services.embeddings import EmbeddingService

from app.database import get_database
from app.models.equipment import Equipment
from app.models.document import Document
from app.config import settings


router = APIRouter()


def parse_object_id(id_str: str) -> ObjectId:
    """Safely parse ObjectId string, raising HTTP 400 if invalid"""
    logger.debug("Parsing ObjectId", id_str=id_str)
    try:
        obj_id = ObjectId(id_str)
        logger.debug("ObjectId parsed successfully", obj_id=str(obj_id))
        return obj_id
    except (InvalidId, TypeError) as e:
        logger.warning("Invalid ObjectId format", id_str=id_str, error=str(e))
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid ObjectId format: '{id_str}'",
        )


@router.post("/", response_model=Equipment, status_code=status.HTTP_201_CREATED)
async def create_equipment(equipment: Equipment):
    """Create a new equipment"""
    logger.info("Creating equipment", name=equipment.name, tenant_id=equipment.tenant_id)
    db = get_database()

    existing = await db.equipment.find_one({"name": equipment.name, "tenant_id": equipment.tenant_id})
    if existing:
        logger.warning("Equipment already exists", name=equipment.name)
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Equipment with this name already exists",
        )

    now = datetime.now(timezone.utc)
    equipment_dict = equipment.model_dump(exclude={"id"}, exclude_none=True, by_alias=True)
    equipment_dict["created_at"] = now
    equipment_dict["updated_at"] = now

    result = await db.equipment.insert_one(equipment_dict)
    equipment_dict["_id"] = result.inserted_id
    logger.info("Equipment created", equipment_id=str(result.inserted_id), name=equipment.name)
    return Equipment(**equipment_dict)


@router.get("/", response_model=List[Equipment], status_code=status.HTTP_200_OK)
async def get_equipment():
    """Get all equipment"""
    logger.info("Fetching all equipment")
    db = get_database()
    equipment_list = await db.equipment.find({}).to_list(length=None)
    logger.info("Equipment list fetched", count=len(equipment_list))
    return [Equipment(**item) for item in equipment_list]


@router.get("/{equipment_id}", response_model=Equipment, status_code=status.HTTP_200_OK)
async def get_one_equipment(equipment_id: str):
    """Get an equipment by ID"""
    logger.info("Fetching equipment by ID", equipment_id=equipment_id)
    db = get_database()
    obj_id = parse_object_id(equipment_id)
    equipment = await db.equipment.find_one({"_id": obj_id})
    if not equipment:
        logger.warning("Equipment not found", equipment_id=equipment_id)
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Equipment not found",
        )
    logger.info("Equipment found", equipment_id=equipment_id)
    return Equipment(**equipment)


def _extract_text_from_file(
    text_extractor: TextExtractionService,
    data: bytes,
    original_name: str,
    content_type: str,
) -> Optional[str]:
    """Extract text from bytes using a temporary file and clean it up afterward."""
    logger.info(
        "Extracting text from uploaded file",
        file_name=original_name,
        content_type=content_type,
        size_bytes=len(data),
    )
    _, ext = os.path.splitext(original_name)
    temp_file_path = None

    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp:
            tmp.write(data)
            temp_file_path = tmp.name
        logger.debug("Temp file created", temp_path=temp_file_path)

        result = text_extractor.extract_text(temp_file_path, content_type)
        logger.info("Text extraction succeeded", file_name=original_name, chars=len(result) if result else 0)
        return result

    except ValueError as e:
        logger.warning("Unsupported file format", file_name=original_name, error=str(e))
    except FileNotFoundError as e:
        logger.error("Temp file not found", file_name=original_name, error=str(e))
    except Exception as e:
        logger.error("Text extraction failed", file_name=original_name, error=str(e))
    finally:
        if temp_file_path and os.path.exists(temp_file_path):
            try:
                os.remove(temp_file_path)
                logger.debug("Temp file cleaned up", temp_path=temp_file_path)
            except Exception as e:
                logger.warning("Failed to delete temp file", temp_path=temp_file_path, error=str(e))

    return None


def _serialize_document(doc: dict) -> dict:
    """Convert MongoDB document fields to JSON-friendly values."""
    doc = dict(doc)
    for field in ("_id", "equipment_id"):
        if isinstance(doc.get(field), ObjectId):
            doc[field] = str(doc[field])
    for field in ("created_at", "updated_at"):
        if isinstance(doc.get(field), datetime):
            doc[field] = doc[field].isoformat()
    return doc


async def _get_equipment(db, equipment_id: str):
    """Validate equipment exists and return its ObjectId."""
    logger.debug("Validating equipment exists", equipment_id=equipment_id)
    obj_id = parse_object_id(equipment_id)

    if not await db.equipment.find_one({"_id": obj_id}):
        logger.warning("Equipment not found during validation", equipment_id=equipment_id)
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Equipment not found",
        )

    logger.debug("Equipment validated", equipment_id=equipment_id)
    return obj_id


@router.post("/{equipment_id}/documents", status_code=status.HTTP_201_CREATED)
async def upload_equipment_documents(
    equipment_id: str,
    files: List[UploadFile] = File(...),
    description: Optional[str] = Form(None),
):
    logger.info(
        "Upload documents request received",
        equipment_id=equipment_id,
        file_count=len(files),
        description=description,
    )
    db = get_database()
    equipment_obj_id = await _get_equipment(db, equipment_id)

    text_extractor = TextExtractionService()
    embedding_service = EmbeddingService()
    tenant_id = settings.TENANT_ID
    created_docs = []

    for file in files:
        try:
            data = await file.read()
            original_name = file.filename or "upload.bin"
            content_type = file.content_type or "application/octet-stream"
            size = len(data)

            logger.info(
                "Processing uploaded file",
                file_name=original_name,
                content_type=content_type,
                size_bytes=size,
            )

            if not text_extractor.is_supported(content_type, original_name):
                logger.warning("Unsupported file format, skipping", file_name=original_name, content_type=content_type)
                continue

            extracted_text = _extract_text_from_file(
                text_extractor, data, original_name, content_type
            )

            if not extracted_text or not extracted_text.strip():
                logger.warning("No text content extracted, skipping", file_name=original_name)
                continue

            logger.info("Text extracted", file_name=original_name, chars=len(extracted_text))

            chunks = embedding_service.split_text(extracted_text)

            logger.info("Document split into chunks", file_name=original_name, chunk_count=len(chunks))

            if not chunks:
                raise ValueError("NO_CHUNKS: Text splitting resulted in no chunks")

            now = datetime.now(timezone.utc)
            storage_key = (
                f"{tenant_id}/equipment/{equipment_id}/"
                f"{uuid.uuid4().hex}-{original_name}"
            )

            doc = {
                "equipment_id": equipment_obj_id,
                "tenant_id": tenant_id,
                "file_name": original_name,
                "content_type": content_type,
                "size": size,
                "storage_key": storage_key,
                "uploaded_by": settings.USER_ID,
                "description": description,
                "document_type": "knowledge",
                "embedding_status": "processing",
                "created_at": now,
                "updated_at": now,
            }

            result = await db.documents_metadata.insert_one(doc)
            document_id = result.inserted_id
            logger.info("Document metadata inserted", document_id=str(document_id), file_name=original_name)

            chunk_documents = []
            failed_chunks = 0

            for index, chunk_text in enumerate(chunks):
                try:
                    embedding = embedding_service.embed_text(chunk_text)
                    chunk_documents.append({
                        "document_id": document_id,
                        "equipment_id": equipment_obj_id,
                        "tenant_id": tenant_id,
                        "file_name": original_name,
                        "chunk_id": str(uuid.uuid4()),
                        "chunk_index": index,
                        "text": chunk_text,
                        "embedding": embedding,
                        "is_disabled": False,
                    })

                    if (index + 1) % 10 == 0 or index == len(chunks) - 1:
                        logger.info(
                            "Chunk embedding progress",
                            document_id=str(document_id),
                            embedded=index + 1,
                            total=len(chunks),
                        )

                except Exception as e:
                    failed_chunks += 1
                    logger.warning(
                        "Failed to embed chunk",
                        document_id=str(document_id),
                        chunk_index=index,
                        error=str(e),
                    )

            logger.info(
                "Chunk embedding finished",
                document_id=str(document_id),
                successful=len(chunk_documents),
                failed=failed_chunks,
                total=len(chunks),
            )

            if not chunk_documents:
                logger.error(
                    "All chunk embeddings failed, marking document as failed",
                    document_id=str(document_id),
                    file_name=original_name,
                )
                await db.documents_metadata.update_one(
                    {"_id": document_id},
                    {"$set": {"embedding_status": "failed", "updated_at": datetime.now(timezone.utc)}},
                )
                raise Exception("EMBEDDING_FAILED: Failed to generate embeddings for all chunks")

            await db[settings.DOCUMENT_CHUNKS_COLLECTION].insert_many(chunk_documents)
            logger.info(
                "Chunk documents inserted into DB",
                document_id=str(document_id),
                count=len(chunk_documents),
            )

            await db.documents_metadata.update_one(
                {"_id": document_id},
                {"$set": {"embedding_status": "completed", "updated_at": datetime.now(timezone.utc)}},
            )
            logger.info("Document embedding status set to completed", document_id=str(document_id))

            doc["_id"] = str(document_id)
            created_docs.append(_serialize_document(doc))
            logger.info("File processed successfully", file_name=original_name, document_id=str(document_id))

        except Exception as e:
            logger.error("Error processing file", file_name=file.filename, error=str(e), exc_info=True)

    logger.info("Upload complete", equipment_id=equipment_id, docs_created=len(created_docs))
    return {"documents": created_docs, "count": len(created_docs)}


@router.get("/{equipment_id}/documents", status_code=status.HTTP_200_OK)
async def list_equipment_documents(equipment_id: str):
    """List all documents for an equipment."""
    logger.info("Listing documents for equipment", equipment_id=equipment_id)
    db = get_database()
    equipment_obj_id = await _get_equipment(db, equipment_id)

    documents = await db.documents_metadata.find({
        "equipment_id": equipment_obj_id,
        "is_disabled": {"$ne": True},
    }).to_list(length=1000)

    documents = [_serialize_document(doc) for doc in documents]
    logger.info("Documents listed", equipment_id=equipment_id, count=len(documents))
    return {"documents": documents, "count": len(documents)}
