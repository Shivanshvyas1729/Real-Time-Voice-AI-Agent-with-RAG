# 🚀 Future Updates & Enterprise Expansion Roadmap

This document outlines planned future architectural enhancements, enterprise upgrades, and production readiness roadmap for the **Industrial Voice Agent & RAG System**.

---

## 📅 Roadmap Overview

```mermaid
graph TD
    A[Phase 1: Current MVP] --> B[Phase 2: Enterprise Authentication & Multi-Tenancy]
    B --> C[Phase 3: Hierarchical Asset Management]
    C --> D[Phase 4: Advanced RAG & Multi-Modal Diagnostics]
```

---

## 🔐 1. Enterprise Multi-Tenancy & Auth (Phase 2)

### Current MVP Implementation
* Documents and equipment items store `tenant_id` string in MongoDB.
* When selecting an equipment item, `tenant_id` is derived from the equipment record and passed to the RAG vector search filter pipeline.

### Planned Enterprise Upgrade
* **JWT Authentication Integration (OAuth2 / OIDC)**:
  * Integrate SSO providers (Auth0, Azure AD, Okta, or Keycloak).
  * Extract `tenant_id` cryptographically from the user's JWT bearer token (`request.state.user.tenant_id`).
* **Hard Tenant Isolation**:
  * Enforce tenant isolation at the API Gateway / Middleware layer.
  * Prevent users from accessing equipment or knowledge base chunks belonging to other tenants.

#### Code Architecture Blueprint (`app/middleware/auth.py`):
```python
# Planned future middleware implementation
from fastapi import Request, HTTPException, status
import jwt

async def verify_jwt_tenant(request: Request):
    token = request.headers.get("Authorization")
    if not token or not token.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    payload = jwt.decode(token.split(" ")[1], options={"verify_signature": True})
    request.state.tenant_id = payload.get("tenant_id")
    request.state.user_id = payload.get("sub")
```

---

## 🏢 2. Hierarchical Asset Model (Phase 3)

### Current Structure
```text
Equipment ──► Knowledge Documents ──► Vector Chunks
```

### Planned Enterprise Structure
```text
Organization (Tenant)
    └── Facility / Plant (e.g. Chicago Manufacturing Plant)
         └── Production Line (e.g. Line B)
              └── Equipment / Asset (e.g. Generator #3)
                   └── Knowledge Manuals & Audio Logs
```

### Features to Add:
* **Plant & Line CRUD Endpoints**: `/api/v1/plants`, `/api/v1/lines`.
* **Inherited Context Filtering**: RAG queries can be scoped broadly (all machines in Plant A) or granularly (specific generator).

---

## ⚡ 3. Advanced RAG & Vector Engine Upgrades (Phase 4)

### Planned Enhancements:
1. **Hybrid Search (Dense + Sparse/BM25)**:
   * Combine MongoDB Atlas Vector Search with keyword search (BM25) for technical serial numbers and error code matching.
2. **Re-Ranking Pipeline**:
   * Add a Cohere or BAAI Cross-Encoder re-ranker stage to score retrieved chunks before passing to LLM context window.
3. **Multi-Modal Document Parsing**:
   * Support OCR and diagram extraction from engineering schematics (PDF drawings, CAD exports).

---

## 🛠️ Summary of Recent System Fixes Completed

| Component | Description | Status |
| :--- | :--- | :--- |
| **PyMongo Async Aggregate** | Added `await` to `collection.aggregate(pipeline)` in `app/services/rag.py` | ✅ Completed |
| **Tenant ID Sync** | Fixed document upload route in `app/routers/equipment.py` to inherit equipment `tenant_id` | ✅ Completed |
| **Batch Embedding** | Optimized text chunk embedding using 32-chunk batching in `app/services/embeddings.py` | ✅ Completed |
| **OpenAPI Schema Fix** | Injected `format: "binary"` into FastAPI OpenAPI 3.1 schema for Swagger UI uploads | ✅ Completed |
| **WebSocket Teardown** | Restored `websocket.accept()` and hardened client connection lifecycle handling | ✅ Completed |

---

*Last updated: August 2026*
