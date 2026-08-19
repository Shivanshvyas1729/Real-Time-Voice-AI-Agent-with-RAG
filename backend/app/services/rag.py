from app.services.embeddings import EmbeddingService
from app.config import settings
from typing import Any,Optional
from bson import ObjectId
from app.models.rag import RetrievalResult,RetrievalMetadata,ChunkMetadata,ChunkContent
from app.database import get_database

class RagService:
    def __init__(self,index_name:Optional[str]=None,embedding_service:Optional[EmbeddingService]=None):
        self.index_name = index_name or settings.VECTOR_INDEX_NAME
        self.embedding_service = embedding_service or EmbeddingService()
        logger.debug("RagServices initialized", index_name=self.index_name)

    def _build_filter(self,
    equipment_id:Optional[str]=None,
    tenant_id:Optional[str]=None,
    extra_filters:Optional[dict[str,Any]]=None
    )-> dict[str,Any]:
        """Construct Mongo vector search filter query."""
        filters:dict[str,Any] = {"is_disabled":{"$ne":True}}

        if equipment_id:
            try:
                filters["equipment_id"] = ObjectId(equipment_id)
                logger.debug(f"Added equpment_id filter:{equipment_id}")

            except Exception as e:
                logger.warning(f"Invalid equipment_id{equipment_id}; skiping filter . Error :{str(e)}")
                

            


        if tenant_id:
            filters["tenant_id"]  = tenant_id

            logger.debug(f"Added tenant_id filter:{tenant_id}")

        if extra_filters:
            filters.update(extra_filters)
            logger.debug(f"Added extra filters:{extra_filters}")
        return filters




    def _build_pipeline(self,query_embedding:list[float],k:int,filters:dict[str,Any])-> list[dict[str,Any]]:

        vector_query:dict[str,Any] = {
            "$vectorSearch":{
    
                "index": self.index_name,
                "limit": k,
                "numCandidates": k*5,
                "path": "embedding",
                "queryVector": query_embedding,
                
                    }	  
        }


        if filters:
            vector_query["$vectorSearch"]["filter"] = filters

        return [
            vector_query,
            {
                "$project":{
                    "_id":1,
                    "chunk_id":1,
                    "text": 1,
                    "document_id":1,
                    "equipment_id":1,
                    "tenant_id":1,
                    "chunk_index":1,
                    "file_name":1,

                    "score":{"$meta":"vectorSearchScore"},
                }
            }
        ]

    async def retrieve(
        self,
        query:str,
        k:int = 5,
        equipment_id:Optional[str] = None,
        tenant_id:Optional[str] = None,
        extra_filters:Optional[dict[str,Any]] = None

    )-> RetrievalResult:
        db = get_database()

        if db is None:
            raise ConnectionError("MongoDB collection is not initialized")

        try:
            logger.info(f"Starting retirival for query :{query[:50]}...(k={k})") 
            #1 genrate embeding for query
            logger.debug("Genrating query embedding ...")


            query_embedding = self.embedding_service.embed_text(query)


            logger.debug(f"Query embedding gernration succressfully completed")
            # 2 builds filter and search pipeline 

            filters = self._build_filter(equipment_id=equipment_id,tenant_id=tenant_id,extra_filters=extra_filters)
            pipeline =self. _build_pipeline(query_embedding,k,filters)

            # 3. Execute vector search aggregation

            logger.debug(f"Executing vector search with index: {self.index_name}")
            cursor = collection.aggregation(pipeline)
            results= await cursor.to_list(length=k)
            logger.info(f"Retrieved {len(results)} results from vector search")

            # 4. Map MongoDB documents to domain models

            chunk_data :list[ChunkContent]=[]
            ChunkMetadata:list[ChunkMetadata] =[]

            for res in results:
                chunk_data.append(
                    ChunkContent(
                        text=res.get("text",""),
                        file_name=res.get("file_name",""),
                        score=res.get("score")
                    )
                )

                chunk_metadata.append(
                    ChunkMetadata(
                        chunk_id=res.get("chunk_id", ""),
                        document_id=str(res.get("document_id", "")),
                        equipment_id=str(res.get("equipment_id", "")),
                        tenant_id=res.get("tenant_id"),
                        chunk_index=res.get("chunk_index", 0),
                        score=res.get("score", 0.0),
                        file_name=res.get("file_name", ""),
                    )
                )
            logger.success(f"Successfully processed {len(chunk_data)} chunks")

            return RetrievalResult(
                data=chunk_data,
                metadata=RetrievalMetadata(
                    query=query,
                    k=k,
                    chunks_retrieved=len(chunk_data),
                    equipment_id=equipment_id,
                    tenant_id=tenant_id,
                    chunks=chunk_metadata,
                ),
            )

        except Exception as e:
            logger.error(f"Error during retrieval operation: {e}")
            raise















