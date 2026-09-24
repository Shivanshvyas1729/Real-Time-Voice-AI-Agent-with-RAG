# Assignments & Quizzes: RAG Voice AI Agent

This document provides a set of assignments and quizzes designed to deepen your understanding of the **RAG Voice AI Agent project**, covering topics from voice pipeline orchestration and RAG implementation to deployment and real-time communication.

---

## 📚 Assignments

### Assignment 1: Enhance the RAG Retrieval System
**Goal:** Improve the accuracy and relevance of document retrieval.

1.  **Analyze `app/services/rag.py`**: Understand how the vector search is performed using MongoDB Atlas.
2.  **Add Hybrid Search**: Implement a hybrid search that combines vector similarity with keyword matching using MongoDB's `$text` search operator.
3.  **Implement Re-ranking**: After retrieving the top K chunks, add a re-ranking step that scores chunks based on:
    -   Cosine similarity score
    -   Keyword match count
    -   Chunk position in the original document (chunks from the beginning might be more important)
4.  **Experiment**: Test your enhanced retrieval on sample queries and compare the results with the baseline implementation.
5.  **Document**: Add docstrings explaining your hybrid search logic and re-ranking algorithm.

**Bonus:** Add a new API endpoint `/api/v1/equipment/{equipment_id}/search` that allows users to test the RAG retrieval without connecting to the voice bot.

---

### Assignment 2: Extend the Voice Pipeline with Custom Tools
**Goal:** Add new function calling capabilities to the LLM.

1.  **Study `app/bot.py`**: Understand how the `search_knowledge_base` tool is registered and called.
2.  **Create a New Tool**: Implement a `get_equipment_status` function that:
    -   Accepts an `equipment_id` as a parameter
    -   Queries the MongoDB `equipment` collection
    -   Returns the equipment's name, description, and active status
    -   Sends this information back to the LLM
3.  **Register the Tool**: Add the function schema and register it with the `GroqLLMService`.
4.  **Update System Prompt**: Modify the system prompt in `bot.py` to inform the LLM about this new capability.
5.  **Test**: Connect to the bot and ask "What is the status of this equipment?" to verify the tool is called correctly.

**Bonus:** Add error handling for cases where the equipment is not found or the database is unavailable.

---

### Assignment 3: Improve Frontend User Experience
**Goal:** Enhance the React interface with better feedback and features.

1.  **Analyze `frontend/src/components/RealTimeChatPanel.tsx`**: Understand the connection flow and state management.
2.  **Add Audio Visualization**: Implement a real-time audio level indicator (waveform or volume bars) using the `useRTVIClientEvent` hook with the `remote-audio-level` event.
3.  **Connection Diagnostics**: Create a new component `ConnectionDiagnostics.tsx` that displays:
    -   Current transport state
    -   WebSocket URL being used
    -   Connection latency (if available)
    -   Number of messages sent/received
4.  **Document Upload UI**: Add a new tab or section to the interface that allows users to:
    -   View all documents uploaded for the selected equipment
    -   Upload new documents via drag-and-drop
    -   See the embedding status of each document
5.  **Polish**: Add loading skeletons, error boundaries, and toast notifications for better UX.

**Bonus:** Implement a "Clear Chat History" button that resets the conversation.

---

### Assignment 4: Infrastructure & Deployment Optimization
**Goal:** Understand and improve the AWS deployment architecture.

1.  **Study Infrastructure**: Review `infrastructure/cloudformation.yaml` and understand each resource (VPC, ALB, ECS, etc.).
2.  **Add HTTPS Support**: Modify the CloudFormation template to:
    -   Add an HTTPS listener to the ALB (you'll need to create/import an ACM certificate)
    -   Redirect HTTP traffic to HTTPS
    -   Update the backend WebSocket URL generation to use `wss://` instead of `ws://`
3.  **Implement Health Checks**: Add proper health check endpoints:
    -   Backend: Enhance `/health` to check MongoDB connectivity
    -   Frontend: Create a `/health.html` page
    -   Update ALB target group health checks to use these endpoints
4.  **Cost Optimization**: Analyze the current ECS task definitions. Can you reduce CPU/Memory allocations? Create a "dev" and "prod" configuration.
5.  **Monitoring**: Add CloudWatch alarms for:
    -   ECS task failures
    -   ALB unhealthy target count
    -   High CPU/Memory usage

**Bonus:** Set up AWS CloudWatch Logs Insights queries to analyze bot conversation patterns or error rates.

---

### Assignment 5: Document Processing Pipeline Enhancement
**Goal:** Improve the document upload and embedding process.

1.  **Analyze `app/routers/equipment.py`**: Understand the document upload flow in the `/documents` endpoint.
2.  **Add Support for More Formats**: Extend `app/services/text_extraction.py` to handle:
    -   Microsoft Word documents (.docx)
    -   PowerPoint presentations (.pptx)
    -   HTML files
3.  **Batch Processing**: Modify the upload endpoint to process large documents asynchronously:
    -   Return immediately with a `processing` status
    -   Use background tasks or a job queue (e.g., Celery, ARQ)
    -   Send a webhook or Server-Sent Event when processing completes
4.  **Chunk Quality**: Implement "smart chunking" that:
    -   Respects paragraph boundaries
    -   Keeps headings with their content
    -   Avoids breaking tables or code blocks
5.  **Duplicate Detection**: Before embedding, check if a similar document already exists using text similarity or file hash comparison.

**Bonus:** Add a progress indicator that shows chunking and embedding progress in real-time.

---

## 📝 Quizzes

### Quiz 1: RAG & Vector Search Architecture

**1. What is the primary purpose of the embedding service in this project?**
- [ ] To compress images for faster upload
- [ ] To convert text into high-dimensional vectors for semantic similarity search
- [ ] To encrypt sensitive data before storing in MongoDB
- [ ] To translate text between different languages

**2. Which embedding model is used by default in this project?**
- [ ] OpenAI text-embedding-ada-002
- [ ] Google Gemini text-embedding-004
- [ ] Sentence-Transformers all-MiniLM-L6-v2
- [ ] Cohere embed-english-v3.0

**3. What does the `numCandidates` parameter in the MongoDB vector search pipeline control?**
- [ ] The number of chunks to return to the user
- [ ] The number of documents that can be uploaded
- [ ] The number of candidate vectors examined before selecting the top K results
- [ ] The maximum embedding dimension size

**4. In `app/services/rag.py`, why do we filter by `equipment_id` during vector search?**
- [ ] To improve search speed by reducing the search space
- [ ] To ensure multi-tenancy and return only relevant equipment-specific knowledge
- [ ] To prevent MongoDB from crashing
- [ ] It's not necessary; it's just a legacy feature

**5. What is the default chunk size and overlap used in the text splitter?**
- [ ] 500 characters, 100 overlap
- [ ] 1000 characters, 250 overlap
- [ ] 2000 characters, 500 overlap
- [ ] 256 tokens, 64 overlap

---

### Quiz 2: Pipecat Voice Pipeline & Real-Time Communication

**1. What is the role of Pipecat in this project?**
- [ ] It's the database ORM for MongoDB
- [ ] It orchestrates the real-time voice pipeline (STT → LLM → TTS)
- [ ] It's the frontend UI framework
- [ ] It handles user authentication

**2. Which service provides Speech-to-Text (STT) functionality?**
- [ ] OpenAI Whisper API
- [ ] Google Speech-to-Text
- [ ] Deepgram Nova-2
- [ ] ElevenLabs

**3. What is the purpose of the `SileroVADAnalyzer` in the voice pipeline?**
- [ ] To detect when the user stops speaking (Voice Activity Detection)
- [ ] To validate the user's identity
- [ ] To adjust the audio volume automatically
- [ ] To convert audio format from MP3 to WAV

**4. How does the LLM know when to search the knowledge base?**
- [ ] It searches automatically after every user message
- [ ] The frontend sends a special flag indicating a search is needed
- [ ] The LLM decides to call the `search_knowledge_base` function tool
- [ ] A separate rules engine triggers the search

**5. What WebSocket event indicates that the bot is ready to start the conversation?**
- [ ] `RTVIEvent.Connected`
- [ ] `RTVIEvent.BotReady`
- [ ] `RTVIEvent.Authenticated`
- [ ] `RTVIEvent.StreamStarted`

**6. In `bot.py`, what happens when a user interrupts the bot while it's speaking?**
- [ ] The bot continues speaking and ignores the interruption
- [ ] The pipeline automatically cancels the current TTS and processes the new input
- [ ] An error is thrown and the connection is closed
- [ ] The user input is queued and processed after the bot finishes

---

### Quiz 3: AWS Deployment & Infrastructure

**1. Which AWS service is used to run the containerized application?**
- [ ] EC2 with Docker installed
- [ ] Lambda Functions
- [ ] ECS Fargate
- [ ] Elastic Beanstalk

**2. What is the purpose of the Application Load Balancer (ALB) in this architecture?**
- [ ] To store Docker images
- [ ] To route HTTP/WebSocket traffic and provide a single entry point
- [ ] To manage IAM permissions
- [ ] To run database migrations

**3. Where are the API keys (Deepgram, Groq, ElevenLabs) stored in production?**
- [ ] Hardcoded in the Docker image
- [ ] In environment variables defined in docker-compose.yml
- [ ] In AWS Secrets Manager
- [ ] In a .env file uploaded to S3

**4. What triggers the CI/CD pipeline to rebuild and redeploy the application?**
- [ ] Manually running a script on the server
- [ ] A pull request to any branch
- [ ] A push to the `main` branch
- [ ] A scheduled cron job every night

**5. Why does the backend need to check for `X-Forwarded-Proto` headers?**
- [ ] To authenticate the user
- [ ] To determine the correct WebSocket protocol (ws:// vs wss://) when behind a load balancer
- [ ] To log request metadata
- [ ] To enable CORS

**6. What does the `create-services.sh` script do?**
- [ ] Creates the MongoDB database and collections
- [ ] Creates the ECS Services that run the Docker containers
- [ ] Creates IAM users and policies
- [ ] Creates the GitHub repository

---

### Quiz 4: FastAPI Backend & Data Models

**1. Which Python async database driver is used to connect to MongoDB?**
- [ ] pymongo
- [ ] motor
- [ ] mongoengine
- [ ] asyncpg

**2. What is the purpose of the `lifespan` context manager in `main.py`?**
- [ ] To handle user login/logout
- [ ] To manage application startup (DB connection) and shutdown (cleanup)
- [ ] To measure request latency
- [ ] To rotate API keys

**3. In the Equipment model, what does the `alias="_id"` in the Pydantic Field do?**
- [ ] It renames the field to "_id" in Python code
- [ ] It maps the MongoDB `_id` field to the Pydantic `id` field
- [ ] It creates an index on the field
- [ ] It marks the field as required

**4. What HTTP method and endpoint would you use to upload documents for an equipment?**
- [ ] GET /api/v1/documents/{equipment_id}
- [ ] POST /api/v1/equipment/{equipment_id}/documents
- [ ] PUT /api/v1/equipment/documents
- [ ] PATCH /api/v1/equipment/upload

**5. What happens if you try to create two equipment with the same name and tenant_id?**
- [ ] Both are created successfully
- [ ] The second one overwrites the first
- [ ] A 409 Conflict error is returned
- [ ] MongoDB automatically renames the second one

---

## 🔑 Answer Key (Don't peek until you finish!)

### Quiz 1: RAG & Vector Search Architecture
1. To convert text into high-dimensional vectors for semantic similarity search
2. Google Gemini text-embedding-004
3. The number of candidate vectors examined before selecting the top K results
4. To ensure multi-tenancy and return only relevant equipment-specific knowledge
5. 1000 characters, 250 overlap

### Quiz 2: Pipecat Voice Pipeline & Real-Time Communication
1. It orchestrates the real-time voice pipeline (STT → LLM → TTS)
2. Deepgram Nova-2
3. To detect when the user stops speaking (Voice Activity Detection)
4. The LLM decides to call the `search_knowledge_base` function tool
5. `RTVIEvent.BotReady`
6. The pipeline automatically cancels the current TTS and processes the new input

### Quiz 3: AWS Deployment & Infrastructure
1. ECS Fargate
2. To route HTTP/WebSocket traffic and provide a single entry point
3. In AWS Secrets Manager
4. A push to the `main` branch
5. To determine the correct WebSocket protocol (ws:// vs wss://) when behind a load balancer
6. Creates the ECS Services that run the Docker containers

### Quiz 4: FastAPI Backend & Data Models
1. motor
2. To manage application startup (DB connection) and shutdown (cleanup)
3. It maps the MongoDB `_id` field to the Pydantic `id` field
4. POST /api/v1/equipment/{equipment_id}/documents
5. A 409 Conflict error is returned

---

## 🎯 Grading Rubric (for Instructors)

### Assignments (60% of total grade)

**Assignment 1: RAG Enhancement (15%)**
- Hybrid search implementation: 7 points
- Re-ranking algorithm: 5 points
- Testing and documentation: 3 points

**Assignment 2: Custom Tools (15%)**
- Function implementation: 6 points
- Tool registration and schema: 4 points
- System prompt update and testing: 5 points

**Assignment 3: Frontend UX (15%)**
- Audio visualization: 5 points
- Connection diagnostics: 5 points
- Document upload UI: 5 points

**Assignment 4: Infrastructure (15%)**
- HTTPS configuration: 6 points
- Health checks: 4 points
- Monitoring/alarms: 5 points

### Quizzes (40% of total grade)
- Quiz 1: 10%
- Quiz 2: 10%
- Quiz 3: 10%
- Quiz 4: 10%

---

## 📖 Additional Learning Resources

1. **Pipecat Documentation**: https://github.com/pipecat-ai/pipecat
2. **MongoDB Atlas Vector Search**: https://www.mongodb.com/docs/atlas/atlas-vector-search/
3. **FastAPI WebSockets**: https://fastapi.tiangolo.com/advanced/websockets/
4. **AWS ECS Fargate Guide**: https://docs.aws.amazon.com/AmazonECS/latest/developerguide/
5. **LangChain Text Splitters**: https://python.langchain.com/docs/modules/data_connection/document_transformers/

---

Good luck with your assignments! 🚀
