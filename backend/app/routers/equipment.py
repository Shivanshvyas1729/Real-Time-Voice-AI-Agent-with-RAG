"""
Equipment & Document Management Router Module

Provides REST API endpoints for:
- Equipment entity CRUD operations
- Multi-file document ingestion, text extraction, batch vector embedding, and MongoDB metadata storage.
"""

import os
import tempfile
import uuid
from datetime import datetime, timezone
from typing import List, Optional, Annotated
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
    """
    Safely parses a hexadecimal string into a MongoDB BSON ObjectId.

    Input:
        id_str (str): 24-character hexadecimal ObjectId string.

    Output:
        ObjectId: Parsed BSON ObjectId instance.

    Raises:
        HTTPException(400): If `id_str` is not a valid 24-char hex ObjectId.
    """
    try:
        return ObjectId(id_str)
    except (InvalidId, TypeError):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid ObjectId format: '{id_str}'"
        )


@router.post("/", response_model=Equipment, status_code=status.HTTP_201_CREATED)
async def create_equipment(equipment: Equipment):
    """
    Creates a new equipment record in MongoDB.

    Input:
        equipment (Equipment): Pydantic body containing `name`, `description`, `tenant_id`, etc.

    Output:
        Equipment: Inserted equipment domain model with assigned MongoDB `_id`.

    Raises:
        HTTPException(409): If an equipment with the same name already exists for the tenant.
    """
    db = get_database()
    
    # Check if equipment name already exists for this tenant
    existing = await db.equipment.find_one({"name": equipment.name, "tenant_id": equipment.tenant_id})
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Equipment with this name already exists"
        )
    
    # Assign created_at and updated_at timestamps
    now = datetime.now(timezone.utc)
    equipment_dict = equipment.model_dump(exclude={"id"}, exclude_none=True, by_alias=True)
    equipment_dict["created_at"] = now
    equipment_dict["updated_at"] = now
    
    # Insert document into MongoDB equipment collection
    result = await db.equipment.insert_one(equipment_dict)
    equipment_dict["_id"] = result.inserted_id
    return Equipment(**equipment_dict)


@router.get("/", response_model=List[Equipment], status_code=status.HTTP_200_OK)
async def get_equipment():
    """
    Retrieves all equipment items from MongoDB.

    Input:
        None.

    Output:
        List[Equipment]: List of all equipment Pydantic models.
    """
    db = get_database()
    equipment_list = await db.equipment.find({}).to_list(length=None)
    return [Equipment(**item) for item in equipment_list]


@router.get("/{equipment_id}", response_model=Equipment, status_code=status.HTTP_200_OK)
async def get_one_equipment(equipment_id: str):
    """
    Retrieves a single equipment item by its 24-character hexadecimal ID.

    Input:
        equipment_id (str): Equipment ObjectId string path parameter.

    Output:
        Equipment: Target equipment Pydantic domain model.

    Raises:
        HTTPException(404): If equipment item is not found.
    """
    db = get_database()
    obj_id = parse_object_id(equipment_id)
    equipment = await db.equipment.find_one({"_id": obj_id})
    if not equipment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Equipment not found"
        )
    return Equipment(**equipment)


def _extract_text_from_file(
    text_extractor: TextExtractionService,
    data: bytes,
    original_name: str,
    content_type: str,
) -> Optional[str]:
    """
    Extracts plain text content from uploaded file bytes using a temporary file.

    Input:
        text_extractor (TextExtractionService): Service instance for parsing PDF/TXT files.
        data (bytes): Raw uploaded binary file content bytes.
        original_name (str): Original filename (e.g. "manual.pdf").
        content_type (str): MIME content type string.

    Output:
        Optional[str]: Extracted text string, or None if extraction fails.
    """
    _, ext = os.path.splitext(original_name)
    temp_file_path = None

    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp:
            tmp.write(data)
            temp_file_path = tmp.name

        return text_extractor.extract_text(temp_file_path, content_type)

    except ValueError as e:
        logger.warning(f"Unsupported file format: {original_name} - {e}")
    except FileNotFoundError as e:
        logger.error(f"File not found: {original_name} - {e}")
    except Exception as e:
        logger.error(f"Text extraction failed: {original_name} - {e}")
    finally:
        if temp_file_path and os.path.exists(temp_file_path):
            try:
                os.remove(temp_file_path)
            except Exception as e:
                logger.warning(f"Failed to delete temp file: {e}")

    return None


def _serialize_document(doc: dict) -> dict:
    """
    Converts MongoDB document ObjectIds and datetimes to JSON-serializable string values.

    Input:
        doc (dict): Raw MongoDB document dictionary.

    Output:
        dict: JSON-friendly dictionary with string ObjectIds and ISO ISO-8601 datetimes.
    """
    doc = dict(doc)

    for field in ("_id", "equipment_id"):
        if isinstance(doc.get(field), ObjectId):
            doc[field] = str(doc[field])

    for field in ("created_at", "updated_at"):
        if isinstance(doc.get(field), datetime):
            doc[field] = doc[field].isoformat()

    return doc


async def _get_equipment(db, equipment_id: str):
    """
    Validates equipment existence and returns parsed BSON ObjectId.

    Input:
        db: Active AsyncDatabase handle.
        equipment_id (str): Equipment ObjectId string.

    Output:
        ObjectId: Validated MongoDB ObjectId.

    Raises:
        HTTPException(404): If equipment item does not exist.
    """
    obj_id = parse_object_id(equipment_id)

    if not await db.equipment.find_one({"_id": obj_id}):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Equipment not found",
        )

    return obj_id


@router.post("/{equipment_id}/documents", status_code=status.HTTP_201_CREATED)
async def upload_equipment_documents(
    equipment_id: str,
    files: Annotated[List[UploadFile], File()],
    description: Annotated[Optional[str], Form()] = None,
):
    """
    Uploads, extracts text, chunks, batch-embeds, and stores document metadata and vector chunks in MongoDB.

    Input:
        equipment_id (str): Path parameter equipment ObjectId.
        files (List[UploadFile]): Form-data uploaded multipart files.
        description (Optional[str]): Optional document description string.

    Output:
        dict: JSON payload `{"documents": [...], "count": N}` containing created document metadata summaries.
    """
    db = get_database()
    equipment_obj_id = await _get_equipment(db, equipment_id)

    text_extractor = TextExtractionService()
    embedding_service = EmbeddingService()
    equipment = await db.equipment.find_one({"_id": equipment_obj_id})
    tenant_id = equipment.get("tenant_id", settings.TENANT_ID) if equipment else settings.TENANT_ID
    created_docs = []

    for file in files:
        try:
            data = await file.read()
            original_name = file.filename or "upload.bin"
            content_type = file.content_type or "application/octet-stream"
            size = len(data)

            logger.info(f"Processing file: {original_name} ({size} bytes)")

            if not text_extractor.is_supported(content_type, original_name):
                logger.warning(f"Unsupported file format: {content_type}")
                continue

            extracted_text = _extract_text_from_file(
                text_extractor, data, original_name, content_type
            )

            if not extracted_text or not extracted_text.strip():
                logger.warning(
                    f"EMPTY_DOCUMENT: No text content extracted from {original_name}"
                )
                continue

            chunks = embedding_service.split_text(extracted_text)

            logger.info(
                "Document text split into chunks",
                file_name=original_name,
                chunk_count=len(chunks),
            )

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

            logger.info(
                "Document inserted with processing status",
                document_id=str(document_id),
            )

            chunk_documents = []

            # Batch process embeddings for high performance (up to 32 chunks per batch)
            batch_size = 32
            all_embeddings = []
            for i in range(0, len(chunks), batch_size):
                batch_chunks = chunks[i : i + batch_size]
                try:
                    batch_embeddings = embedding_service.embed_texts(batch_chunks)
                    all_embeddings.extend(batch_embeddings)
                except Exception as e:
                    logger.error(
                        "Failed batch embedding",
                        document_id=str(document_id),
                        batch_start=i,
                        error=str(e),
                    )

            if len(all_embeddings) == len(chunks):
                for index, (chunk_text, embedding) in enumerate(zip(chunks, all_embeddings)):
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
            else:
                logger.warning(
                    "Mismatch between chunk count and generated embeddings count",
                    chunks_count=len(chunks),
                    embeddings_count=len(all_embeddings),
                )

            if not chunk_documents:
                await db.documents_metadata.update_one(
                    {"_id": document_id},
                    {
                        "$set": {
                            "embedding_status": "failed",
                            "updated_at": datetime.now(timezone.utc),
                        }
                    },
                )
                raise Exception(
                    "EMBEDDING_FAILED: Failed to generate embeddings for all chunks"
                )

            await db[settings.DOCUMENT_CHUNKS_COLLECTION].insert_many(chunk_documents)

            await db.documents_metadata.update_one(
                {"_id": document_id},
                {
                    "$set": {
                        "embedding_status": "completed",
                        "updated_at": datetime.now(timezone.utc),
                    }
                },
            )

            doc["_id"] = str(document_id)
            created_docs.append(_serialize_document(doc))

            logger.success(f"Successfully processed {original_name}")

        except Exception as e:
            logger.error(
                f"Error processing file {file.filename}: {e}",
                exc_info=True,
            )
            # If document metadata was already created, mark status as failed
            if "document_id" in locals() and document_id:
                try:
                    await db.documents_metadata.update_one(
                        {"_id": document_id},
                        {
                            "$set": {
                                "embedding_status": "failed",
                                "error": str(e),
                                "updated_at": datetime.now(timezone.utc),
                            }
                        },
                    )
                except Exception as update_err:
                    logger.error(f"Failed to set document status to failed: {update_err}")

    return {"documents": created_docs, "count": len(created_docs)}


@router.get("/{equipment_id}/documents", status_code=status.HTTP_200_OK)
async def list_equipment_documents(equipment_id: str):
    """
    Lists all uploaded knowledge documents for a specific equipment item.

    Input:
        equipment_id (str): Target equipment ObjectId string path parameter.

    Output:
        dict: JSON payload `{"documents": [...], "count": N}` containing active documents.
    """
    db = get_database()
    equipment_obj_id = await _get_equipment(db, equipment_id)

    documents = await db.documents_metadata.find({
        "equipment_id": equipment_obj_id,
        "is_disabled": {"$ne": True},
    }).to_list(length=1000)

    documents = [_serialize_document(doc) for doc in documents]

    return {"documents": documents, "count": len(documents)}
