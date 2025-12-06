# RAG Subsystem Implementation Plan

## Overview

This plan implements a company-aware RAG (Retrieval-Augmented Generation) subsystem for ChurnVision that enables:
- Document ingestion with text extraction, chunking, and embedding
- Semantic retrieval for contextual grounding of AI responses
- Company policy-compliant treatment generation
- Custom HR rules management
- Dual-mode knowledge base (Automatic + Custom Rules)

---

## Architecture Decisions

### Vector Database: ChromaDB (Local)
**Rationale:**
- On-premise friendly (no cloud dependency)
- Built-in embedding support
- Excellent Python integration
- Persistent storage with SQLite backend
- Easy to deploy in Docker

### Embedding Model: sentence-transformers/all-MiniLM-L6-v2
**Rationale:**
- Fast inference (local)
- Good semantic quality
- Small model size (~80MB)
- No API costs
- Privacy-preserving

### Document Processing: PyMuPDF + python-docx + LangChain
**Rationale:**
- PyMuPDF (fitz): Fast PDF text extraction
- python-docx: Native DOCX support
- LangChain text splitters: Proven chunking strategies

---

## Implementation Phases

### Phase 1: Backend Foundation

#### 1.1 Dependencies
Add to `backend/pyproject.toml`:
```python
"chromadb>=0.4.22",
"sentence-transformers>=2.2.2",
"PyMuPDF>=1.23.0",
"python-docx>=1.1.0",
"tiktoken>=0.5.0",  # Token counting for chunking
```

#### 1.2 Database Models (`backend/app/models/rag.py`)
Extend existing models:

```python
class RAGDocument(Base):
    __tablename__ = "rag_documents"
    id = Column(Integer, primary_key=True)
    title = Column(String, nullable=False)
    source_path = Column(String)
    mime_type = Column(String)
    size_bytes = Column(Integer)
    status = Column(String, default="pending")  # pending, processing, ready, error
    error_message = Column(Text, nullable=True)
    chunk_count = Column(Integer, default=0)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, onupdate=func.now())
    # Multi-tenancy
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    project_id = Column(String, nullable=True)
    # Metadata
    document_type = Column(String)  # policy, benefit, rule, general
    tags = Column(String)  # Comma-separated tags

    chunks = relationship("RAGChunk", back_populates="document", cascade="all, delete-orphan")

class RAGChunk(Base):
    __tablename__ = "rag_chunks"
    id = Column(Integer, primary_key=True)
    document_id = Column(Integer, ForeignKey("rag_documents.id", ondelete="CASCADE"))
    chunk_index = Column(Integer)
    content = Column(Text)
    metadata = Column(Text)  # JSON: page_number, section, etc.
    chroma_id = Column(String)  # Reference to ChromaDB
    created_at = Column(DateTime, server_default=func.now())

    document = relationship("RAGDocument", back_populates="chunks")

class CustomHRRule(Base):
    """User-defined HR rules that override/complement document knowledge"""
    __tablename__ = "custom_hr_rules"
    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    category = Column(String)  # benefit, restriction, policy, process
    rule_text = Column(Text, nullable=False)
    priority = Column(Integer, default=5)  # 1-10, higher = more important
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, onupdate=func.now())
    # Multi-tenancy
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    project_id = Column(String, nullable=True)

class KnowledgeBaseSettings(Base):
    """Per-user/project RAG configuration"""
    __tablename__ = "knowledge_base_settings"
    id = Column(Integer, primary_key=True)
    mode = Column(String, default="automatic")  # automatic, custom, hybrid
    chunk_size = Column(Integer, default=500)
    chunk_overlap = Column(Integer, default=50)
    retrieval_top_k = Column(Integer, default=5)
    similarity_threshold = Column(Float, default=0.7)
    use_general_hr_knowledge = Column(Boolean, default=True)
    strict_policy_mode = Column(Boolean, default=False)  # Only allow documented policies
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    project_id = Column(String, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, onupdate=func.now())
```

#### 1.3 Configuration (`backend/app/core/config.py`)
Add settings:

```python
# RAG Settings
RAG_ENABLED: bool = True
RAG_STORAGE_PATH: str = "./churnvision_data/rag"
RAG_CHUNK_SIZE: int = 500
RAG_CHUNK_OVERLAP: int = 50
RAG_EMBEDDING_MODEL: str = "sentence-transformers/all-MiniLM-L6-v2"
RAG_COLLECTION_NAME: str = "churnvision_docs"
RAG_TOP_K: int = 5
RAG_SIMILARITY_THRESHOLD: float = 0.7
```

---

### Phase 2: Core RAG Service

#### 2.1 Document Processor (`backend/app/services/document_processor.py`)

```python
class DocumentProcessor:
    """Extracts and chunks text from various document formats"""

    SUPPORTED_TYPES = {
        "application/pdf": "_process_pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "_process_docx",
        "text/plain": "_process_txt",
        "text/markdown": "_process_txt",
    }

    def __init__(self, chunk_size: int = 500, chunk_overlap: int = 50):
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap
        self.text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
            separators=["\n\n", "\n", ". ", " ", ""]
        )

    async def process_document(self, file_path: str, mime_type: str) -> List[Dict]:
        """Extract text and split into chunks with metadata"""
        pass

    def _process_pdf(self, file_path: str) -> str:
        """Extract text from PDF using PyMuPDF"""
        pass

    def _process_docx(self, file_path: str) -> str:
        """Extract text from DOCX"""
        pass

    def _process_txt(self, file_path: str) -> str:
        """Read plain text files"""
        pass
```

#### 2.2 Vector Store Service (`backend/app/services/vector_store.py`)

```python
class VectorStoreService:
    """Manages ChromaDB for document embeddings"""

    def __init__(self):
        self.client = chromadb.PersistentClient(path=settings.RAG_STORAGE_PATH)
        self.embedding_function = SentenceTransformerEmbeddingFunction(
            model_name=settings.RAG_EMBEDDING_MODEL
        )
        self.collection = self.client.get_or_create_collection(
            name=settings.RAG_COLLECTION_NAME,
            embedding_function=self.embedding_function,
            metadata={"hnsw:space": "cosine"}
        )

    async def add_chunks(
        self,
        chunks: List[Dict],
        document_id: int,
        project_id: Optional[str] = None
    ) -> List[str]:
        """Add document chunks to vector store"""
        pass

    async def search(
        self,
        query: str,
        top_k: int = 5,
        project_id: Optional[str] = None,
        document_types: Optional[List[str]] = None,
        min_similarity: float = 0.7
    ) -> List[Dict]:
        """Semantic search for relevant chunks"""
        pass

    async def delete_document(self, document_id: int):
        """Remove all chunks for a document"""
        pass
```

#### 2.3 RAG Service (`backend/app/services/rag_service.py`)

```python
class RAGService:
    """Main RAG orchestration service"""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.document_processor = DocumentProcessor()
        self.vector_store = VectorStoreService()

    async def ingest_document(
        self,
        file_path: str,
        title: str,
        mime_type: str,
        document_type: str = "general",
        project_id: Optional[str] = None,
        user_id: Optional[int] = None
    ) -> RAGDocument:
        """Full document ingestion pipeline"""
        # 1. Create document record (status=processing)
        # 2. Extract and chunk text
        # 3. Generate embeddings and store in ChromaDB
        # 4. Update document record (status=ready, chunk_count)
        pass

    async def retrieve_context(
        self,
        query: str,
        project_id: Optional[str] = None,
        include_custom_rules: bool = True,
        document_types: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """Retrieve relevant context for a query"""
        # 1. Semantic search in vector store
        # 2. Fetch matching custom HR rules
        # 3. Merge and rank by relevance
        # 4. Return structured context with sources
        pass

    async def get_custom_rules(
        self,
        category: Optional[str] = None,
        project_id: Optional[str] = None
    ) -> List[CustomHRRule]:
        """Fetch active custom HR rules"""
        pass

    async def validate_treatment(
        self,
        treatment: Dict,
        context: Dict
    ) -> Dict[str, Any]:
        """Validate a treatment against company policies"""
        # Check treatment against retrieved context
        # Return: is_valid, violations, adaptations, reasoning
        pass
```

---

### Phase 3: Treatment Integration

#### 3.1 Enhanced Treatment Generation (`backend/app/services/treatment_generation_service.py`)

Modify to integrate RAG:

```python
async def generate_personalized_treatments(
    self,
    hr_code: str,
    model: Optional[str] = None,
    use_rag: bool = True
) -> List[Dict[str, Any]]:
    """Generate RAG-grounded treatments"""

    # 1. Fetch employee context (existing)
    employee = await self._get_employee_data(hr_code)
    churn_data = await self._get_churn_data(hr_code)
    reasoning = await self._get_churn_reasoning(hr_code)

    # 2. NEW: Retrieve company policy context
    if use_rag:
        rag_context = await self.rag_service.retrieve_context(
            query=f"retention policies benefits treatments for {employee.position} in {employee.structure_name}",
            document_types=["policy", "benefit", "rule"]
        )

    # 3. Construct enhanced prompt with RAG context
    prompt = self._construct_rag_prompt(employee, churn_data, reasoning, rag_context)

    # 4. Generate treatments
    treatments = await self._generate_treatments(prompt, model)

    # 5. NEW: Validate against company policies
    validated_treatments = []
    for treatment in treatments:
        validation = await self.rag_service.validate_treatment(treatment, rag_context)
        if validation["is_valid"]:
            validated_treatments.append(treatment)
        elif validation.get("adapted_treatment"):
            validated_treatments.append(validation["adapted_treatment"])
        else:
            # Include with compliance note
            treatment["compliance_warning"] = validation["reasoning"]
            validated_treatments.append(treatment)

    return validated_treatments
```

#### 3.2 Policy-Aware Prompt Template

```python
def _construct_rag_prompt(self, employee, churn_data, reasoning, rag_context):
    """Build prompt with company context"""

    policy_context = ""
    if rag_context and rag_context.get("documents"):
        policy_context = """
COMPANY POLICIES & CONSTRAINTS:
===============================
The following are excerpts from company documentation that MUST guide your recommendations:

"""
        for doc in rag_context["documents"][:5]:
            policy_context += f"[Source: {doc['source']}]\n{doc['content']}\n\n"

    custom_rules = ""
    if rag_context and rag_context.get("custom_rules"):
        custom_rules = """
CUSTOM HR RULES (MANDATORY):
============================
These rules have been explicitly defined and MUST be followed:

"""
        for rule in rag_context["custom_rules"]:
            custom_rules += f"- [{rule['category']}] {rule['rule_text']}\n"

    return f"""
{policy_context}
{custom_rules}

CRITICAL INSTRUCTIONS:
1. ONLY recommend treatments that comply with the company policies above
2. If a treatment type is not mentioned in documentation, ask for clarification
3. Adapt treatment parameters (cost, duration) to match company constraints
4. Explicitly cite which policy supports each recommendation
5. Flag any treatment that may require special approval

EMPLOYEE CONTEXT:
...
"""
```

---

### Phase 4: API Endpoints

#### 4.1 RAG Router (`backend/app/api/v1/rag.py`)

```python
router = APIRouter(prefix="/rag", tags=["RAG"])

@router.post("/documents/upload", response_model=DocumentUploadResponse)
async def upload_document(
    file: UploadFile = File(...),
    title: Optional[str] = Form(None),
    document_type: str = Form("general"),  # policy, benefit, rule, general
    tags: Optional[str] = Form(None),
    project_id: Optional[str] = Form(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Upload and process a document for RAG"""
    pass

@router.get("/documents", response_model=List[DocumentSummary])
async def list_documents(
    document_type: Optional[str] = None,
    status: Optional[str] = None,
    project_id: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """List all uploaded documents"""
    pass

@router.delete("/documents/{document_id}")
async def delete_document(
    document_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Delete a document and its chunks"""
    pass

@router.post("/query", response_model=RAGQueryResponse)
async def query_knowledge_base(
    request: RAGQueryRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Query the knowledge base for relevant context"""
    pass

# Custom Rules endpoints
@router.post("/rules", response_model=CustomRuleResponse)
async def create_custom_rule(
    request: CustomRuleCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Create a custom HR rule"""
    pass

@router.get("/rules", response_model=List[CustomRuleResponse])
async def list_custom_rules(
    category: Optional[str] = None,
    is_active: Optional[bool] = True,
    project_id: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """List custom HR rules"""
    pass

@router.put("/rules/{rule_id}")
async def update_custom_rule(
    rule_id: int,
    request: CustomRuleUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Update a custom rule"""
    pass

@router.delete("/rules/{rule_id}")
async def delete_custom_rule(
    rule_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Delete a custom rule"""
    pass

# Settings endpoints
@router.get("/settings", response_model=KnowledgeBaseSettingsResponse)
async def get_rag_settings(
    project_id: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get RAG configuration settings"""
    pass

@router.put("/settings")
async def update_rag_settings(
    request: KnowledgeBaseSettingsUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Update RAG configuration"""
    pass
```

---

### Phase 5: Chatbot Integration

#### 5.1 Intelligent Chatbot Enhancement

Modify `intelligent_chatbot.py` to use RAG for all responses:

```python
async def chat(
    self,
    message: str,
    session_id: Optional[str] = None,
    employee_id: Optional[str] = None,
    use_rag: bool = True
) -> Dict[str, Any]:
    """RAG-enhanced chat response"""

    # Detect pattern (existing)
    pattern, entities = await self.detect_pattern(message, employee_id)

    # NEW: Retrieve relevant company context
    rag_context = None
    if use_rag and settings.RAG_ENABLED:
        rag_context = await self.rag_service.retrieve_context(
            query=message,
            include_custom_rules=True
        )

    # Build context-aware response
    if pattern == PatternType.RETENTION_PLAN:
        return await self._handle_retention_plan_with_rag(entities, rag_context)
    elif pattern == PatternType.CHURN_RISK_DIAGNOSIS:
        return await self._handle_diagnosis_with_rag(entities, rag_context)
    else:
        return await self._handle_general_chat_with_rag(message, rag_context)

async def _handle_general_chat_with_rag(self, message: str, rag_context: Dict) -> Dict:
    """General chat with RAG grounding"""

    system_prompt = """You are a company-aware HR assistant for ChurnVision.

CRITICAL RULES:
1. Base ALL recommendations on the provided company documentation
2. If information is not in the documentation, say "I don't have information about this in your company's knowledge base"
3. NEVER invent policies or benefits
4. Always cite sources when making claims
5. If unsure, ask for clarification or more documentation

{context}
"""

    context_text = self._format_rag_context(rag_context)

    response = await self.chatbot_service.generate_response(
        messages=[
            {"role": "system", "content": system_prompt.format(context=context_text)},
            {"role": "user", "content": message}
        ],
        temperature=0.3  # Lower temperature for factual responses
    )

    return {
        "response": response,
        "sources": rag_context.get("sources", []) if rag_context else [],
        "pattern_detected": "general_chat",
        "rag_used": True
    }
```

---

### Phase 6: Frontend Implementation

#### 6.1 New Service (`frontend/src/services/rag.ts`)

```typescript
import api from './api';

export interface RAGDocument {
  id: number;
  title: string;
  source_path: string;
  mime_type: string;
  size_bytes: number;
  status: 'pending' | 'processing' | 'ready' | 'error';
  error_message?: string;
  chunk_count: number;
  document_type: string;
  tags?: string;
  created_at: string;
}

export interface CustomHRRule {
  id: number;
  name: string;
  category: string;
  rule_text: string;
  priority: number;
  is_active: boolean;
  created_at: string;
}

export interface KnowledgeBaseSettings {
  mode: 'automatic' | 'custom' | 'hybrid';
  chunk_size: number;
  chunk_overlap: number;
  retrieval_top_k: number;
  similarity_threshold: number;
  use_general_hr_knowledge: boolean;
  strict_policy_mode: boolean;
}

export const ragService = {
  // Documents
  async uploadDocument(file: File, options: {
    title?: string;
    document_type?: string;
    tags?: string;
    project_id?: string;
  }): Promise<RAGDocument> {
    const formData = new FormData();
    formData.append('file', file);
    if (options.title) formData.append('title', options.title);
    if (options.document_type) formData.append('document_type', options.document_type);
    if (options.tags) formData.append('tags', options.tags);
    if (options.project_id) formData.append('project_id', options.project_id);

    const response = await api.post('/rag/documents/upload', formData);
    return response.data;
  },

  async listDocuments(params?: {
    document_type?: string;
    status?: string;
    project_id?: string;
  }): Promise<RAGDocument[]> {
    const response = await api.get('/rag/documents', { params });
    return response.data;
  },

  async deleteDocument(documentId: number): Promise<void> {
    await api.delete(`/rag/documents/${documentId}`);
  },

  // Custom Rules
  async createRule(rule: Omit<CustomHRRule, 'id' | 'created_at'>): Promise<CustomHRRule> {
    const response = await api.post('/rag/rules', rule);
    return response.data;
  },

  async listRules(params?: {
    category?: string;
    is_active?: boolean;
  }): Promise<CustomHRRule[]> {
    const response = await api.get('/rag/rules', { params });
    return response.data;
  },

  async updateRule(ruleId: number, updates: Partial<CustomHRRule>): Promise<CustomHRRule> {
    const response = await api.put(`/rag/rules/${ruleId}`, updates);
    return response.data;
  },

  async deleteRule(ruleId: number): Promise<void> {
    await api.delete(`/rag/rules/${ruleId}`);
  },

  // Settings
  async getSettings(): Promise<KnowledgeBaseSettings> {
    const response = await api.get('/rag/settings');
    return response.data;
  },

  async updateSettings(settings: Partial<KnowledgeBaseSettings>): Promise<KnowledgeBaseSettings> {
    const response = await api.put('/rag/settings', settings);
    return response.data;
  },

  // Query
  async query(query: string, options?: {
    document_types?: string[];
    include_rules?: boolean;
  }): Promise<{
    documents: Array<{ content: string; source: string; similarity: number }>;
    custom_rules: CustomHRRule[];
  }> {
    const response = await api.post('/rag/query', { query, ...options });
    return response.data;
  }
};
```

#### 6.2 Knowledge Base Settings Page (`frontend/src/pages/KnowledgeBase.tsx`)

New page with tabs:
- **Documents**: Upload, list, delete company documents
- **Custom Rules**: CRUD interface for HR rules
- **Settings**: Configure RAG behavior (mode, retrieval parameters)

Components:
- `DocumentUploader`: Drag-drop file upload with type selection
- `DocumentList`: Table/cards showing documents with status
- `RuleEditor`: Form for creating/editing custom rules
- `SettingsPanel`: Toggle switches and sliders for RAG config

#### 6.3 Settings Integration

Add "Knowledge Base" section to Settings.tsx sidebar:
```typescript
{
  id: 'knowledge-base',
  title: 'Knowledge Base',
  description: 'Company policies & rules',
  icon: BookOpen,
  color: 'text-emerald-600'
}
```

---

### Phase 7: Database Migration

Create Alembic migration for new tables:

```python
# alembic/versions/007_add_rag_tables.py

def upgrade():
    # Extend rag_documents
    op.add_column('rag_documents', sa.Column('status', sa.String(), default='pending'))
    op.add_column('rag_documents', sa.Column('error_message', sa.Text(), nullable=True))
    op.add_column('rag_documents', sa.Column('chunk_count', sa.Integer(), default=0))
    op.add_column('rag_documents', sa.Column('updated_at', sa.DateTime()))
    op.add_column('rag_documents', sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id')))
    op.add_column('rag_documents', sa.Column('project_id', sa.String()))
    op.add_column('rag_documents', sa.Column('document_type', sa.String()))
    op.add_column('rag_documents', sa.Column('tags', sa.String()))

    # Extend rag_chunks
    op.add_column('rag_chunks', sa.Column('metadata', sa.Text()))
    op.add_column('rag_chunks', sa.Column('chroma_id', sa.String()))

    # Create custom_hr_rules
    op.create_table(
        'custom_hr_rules',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('category', sa.String()),
        sa.Column('rule_text', sa.Text(), nullable=False),
        sa.Column('priority', sa.Integer(), default=5),
        sa.Column('is_active', sa.Boolean(), default=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime()),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id')),
        sa.Column('project_id', sa.String()),
    )

    # Create knowledge_base_settings
    op.create_table(
        'knowledge_base_settings',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('mode', sa.String(), default='automatic'),
        sa.Column('chunk_size', sa.Integer(), default=500),
        sa.Column('chunk_overlap', sa.Integer(), default=50),
        sa.Column('retrieval_top_k', sa.Integer(), default=5),
        sa.Column('similarity_threshold', sa.Float(), default=0.7),
        sa.Column('use_general_hr_knowledge', sa.Boolean(), default=True),
        sa.Column('strict_policy_mode', sa.Boolean(), default=False),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id')),
        sa.Column('project_id', sa.String()),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime()),
    )

    # Indexes
    op.create_index('ix_rag_documents_status', 'rag_documents', ['status'])
    op.create_index('ix_rag_documents_project', 'rag_documents', ['project_id'])
    op.create_index('ix_rag_chunks_chroma_id', 'rag_chunks', ['chroma_id'])
    op.create_index('ix_custom_hr_rules_category', 'custom_hr_rules', ['category'])
```

---

## File Structure Summary

```
backend/app/
├── models/
│   └── rag.py                      # Extended RAG models
├── schemas/
│   └── rag.py                      # NEW: Pydantic schemas
├── services/
│   ├── document_processor.py       # NEW: Text extraction
│   ├── vector_store.py             # NEW: ChromaDB wrapper
│   ├── rag_service.py              # NEW: Main RAG orchestration
│   ├── treatment_generation_service.py  # MODIFIED: RAG integration
│   └── intelligent_chatbot.py      # MODIFIED: RAG context
├── api/v1/
│   ├── rag.py                      # NEW: RAG endpoints
│   └── __init__.py                 # MODIFIED: Include RAG router
└── core/
    └── config.py                   # MODIFIED: RAG settings

frontend/src/
├── services/
│   └── rag.ts                      # NEW: RAG API service
├── pages/
│   └── KnowledgeBase.tsx           # NEW: KB management page
├── components/
│   ├── rag/
│   │   ├── DocumentUploader.tsx    # NEW
│   │   ├── DocumentList.tsx        # NEW
│   │   ├── RuleEditor.tsx          # NEW
│   │   └── SettingsPanel.tsx       # NEW
└── App.tsx                         # MODIFIED: Add route
```

---

## Implementation Order

1. **Week 1: Backend Core**
   - Add dependencies to pyproject.toml
   - Extend database models
   - Create migration
   - Implement DocumentProcessor
   - Implement VectorStoreService

2. **Week 2: RAG Service & API**
   - Implement RAGService
   - Create API endpoints
   - Create Pydantic schemas
   - Add unit tests

3. **Week 3: Integration**
   - Modify TreatmentGenerationService
   - Modify IntelligentChatbotService
   - Add RAG config settings
   - Integration testing

4. **Week 4: Frontend**
   - Create rag.ts service
   - Build KnowledgeBase page
   - Create document upload components
   - Create rule management UI
   - Add Settings integration

---

## Testing Strategy

1. **Unit Tests**
   - DocumentProcessor: PDF, DOCX, TXT extraction
   - VectorStore: Add, search, delete operations
   - RAGService: Context retrieval, validation

2. **Integration Tests**
   - End-to-end document upload and retrieval
   - Treatment generation with RAG context
   - Chat responses with policy grounding

3. **Manual Testing**
   - Upload sample HR policy documents
   - Create custom rules
   - Verify treatment compliance
   - Test insufficient context scenarios

---

## Success Criteria

1. Documents can be uploaded, processed, and retrieved
2. Treatments are validated against company policies
3. Chat responses cite document sources
4. Custom rules override/complement documents
5. Insufficient context triggers clarification requests
6. No hallucination of policies or benefits
