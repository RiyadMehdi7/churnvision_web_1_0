# Data Model: Intuitive Data Management Interface

**Feature**: Intuitive Data Management Interface  
**Branch**: `001-intuitive-data-management`  
**Date**: 2025-11-23

This document defines the data entities, relationships, and validation rules for the intuitive data management feature, extending the existing ChurnVision HR data models.

## Core Entities

### Employee (Extended from HRDataInput)

Extends the existing `HRDataInput` model with search and audit capabilities.

**Entity Purpose**: Individual employee records with enhanced search, editing history, and data quality indicators.

**Key Attributes**:
- `hr_code` (Primary Key): Unique employee identifier within dataset
- `dataset_id` (Foreign Key): Links to dataset for multi-tenant isolation
- `full_name`: Employee's complete name for display and search
- `position`: Job title/role for categorization and search
- `structure_name`: Department/organizational unit for grouping
- `status`: Employment status (active, inactive, terminated)
- `search_vector` (New): PostgreSQL tsvector for full-text search
- `last_modified` (New): Timestamp of last edit for change tracking
- `modified_by` (New): User ID who made the last change for audit
- `data_quality_score` (New): Calculated completeness score (0.0-1.0)

**Validation Rules**:
- `hr_code` must be unique within dataset
- `full_name` is required and must be 2-100 characters
- `position` and `structure_name` are required for organization
- `search_vector` is automatically maintained via database trigger
- `data_quality_score` calculated based on field completeness

**State Transitions**:
- New Employee → Active Employee (upon creation)
- Active Employee → Inactive Employee (status change)
- Inactive Employee → Active Employee (reactivation)
- Any Status → Terminated Employee (final state)

**Relationships**:
- Belongs to one Dataset (many-to-one via dataset_id)
- Has many DataChanges (one-to-many for audit trail)
- May have many FileUploadRecords (many-to-many via employee data updates)

### DataUpload (New Entity)

Tracks file import operations and validation results.

**Entity Purpose**: Record keeping for Excel/CSV imports with validation status and error reporting.

**Key Attributes**:
- `upload_id` (Primary Key): UUID for unique upload identification
- `dataset_id` (Foreign Key): Links to dataset for tenant isolation
- `uploaded_by` (Foreign Key): User who initiated the upload
- `filename`: Original file name for user reference
- `file_size`: File size in bytes for validation
- `file_type`: MIME type (Excel: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, CSV: text/csv)
- `upload_timestamp`: When the upload was initiated
- `processing_status`: enum (pending, processing, completed, failed)
- `validation_results`: JSON field containing detailed validation results
- `records_processed`: Number of employee records processed
- `records_created`: Number of new employees created
- `records_updated`: Number of existing employees updated
- `error_summary`: High-level error description for user display

**Validation Rules**:
- `filename` must have valid extension (.xlsx, .csv)
- `file_size` must be under 50MB limit
- `processing_status` follows: pending → processing → (completed|failed)
- `validation_results` contains structured error/warning data
- Upload must be associated with valid dataset and user

**State Transitions**:
- Upload Initiated → Pending (file received)
- Pending → Processing (validation started)
- Processing → Completed (successful import)
- Processing → Failed (validation errors or system failure)

**Relationships**:
- Belongs to one Dataset (many-to-one)
- Uploaded by one User (many-to-one)
- Creates many DataChanges (one-to-many for audit trail)

### DataChange (New Entity)

Audit trail for all employee data modifications.

**Entity Purpose**: Complete audit log of data changes for compliance and undo functionality.

**Key Attributes**:
- `change_id` (Primary Key): UUID for unique change identification
- `dataset_id` (Foreign Key): Dataset context for tenant isolation
- `employee_hr_code` (Foreign Key): Employee being modified
- `changed_by` (Foreign Key): User who made the change
- `change_timestamp`: When the change occurred
- `change_type`: enum (create, update, delete, bulk_import)
- `field_changes`: JSON field with before/after values per field
- `change_source`: enum (manual_edit, file_upload, bulk_operation, system)
- `change_reason`: Optional user-provided reason for the change
- `session_id`: Groups related changes in same user session
- `upload_id`: Links to DataUpload if change came from file import

**Validation Rules**:
- `employee_hr_code` must reference valid employee in same dataset
- `field_changes` must contain at least one field modification
- `change_timestamp` cannot be in the future
- `change_source` determines required additional fields (upload_id for file_upload)

**Relationships**:
- Belongs to one Employee (many-to-one)
- Belongs to one Dataset (many-to-one)
- Changed by one User (many-to-one)
- May belong to one DataUpload (many-to-one, nullable)

### SearchQuery (New Entity)

Tracks user search patterns for optimization and analytics.

**Entity Purpose**: Monitor search behavior to improve search algorithms and user experience.

**Key Attributes**:
- `query_id` (Primary Key): UUID for unique query identification
- `dataset_id` (Foreign Key): Dataset context for tenant isolation
- `user_id` (Foreign Key): User who performed the search
- `query_text`: Original search string entered by user
- `query_timestamp`: When the search was performed
- `search_type`: enum (fulltext, semantic, filtered)
- `filters_applied`: JSON field with active filters during search
- `results_count`: Number of results returned
- `execution_time_ms`: Query execution time for performance monitoring
- `clicked_results`: Array of hr_codes that user clicked on
- `session_id`: Groups searches in same user session

**Validation Rules**:
- `query_text` must be 1-500 characters
- `results_count` must be non-negative integer
- `execution_time_ms` must be positive number
- `clicked_results` must contain valid hr_codes from same dataset

**Relationships**:
- Belongs to one Dataset (many-to-one)
- Performed by one User (many-to-one)

## Extended Relationships

### Organization (Multi-tenant Context)

Leverages existing Dataset entity for tenant isolation:

- **Dataset** contains many Employees
- **Dataset** has many DataUploads
- **Dataset** has many DataChanges
- **Dataset** has many SearchQueries

### User Context

Integrates with existing user authentication system:

- **User** has access to multiple Datasets (organization membership)
- **User** creates many DataUploads
- **User** makes many DataChanges
- **User** performs many SearchQueries

## Database Schema Extensions

### Index Strategy

Based on research findings for optimal search and filtering performance:

```sql
-- Full-text search indexes
CREATE INDEX idx_employee_search_vector ON hr_data_input USING GIN(search_vector);
CREATE INDEX idx_employee_dataset_search ON hr_data_input(dataset_id, search_vector);

-- Performance indexes for common queries
CREATE INDEX idx_employee_status_structure ON hr_data_input(dataset_id, status, structure_name);
CREATE INDEX idx_employee_last_modified ON hr_data_input(dataset_id, last_modified DESC);

-- Audit trail indexes
CREATE INDEX idx_datachange_employee_time ON data_changes(employee_hr_code, change_timestamp DESC);
CREATE INDEX idx_datachange_dataset_time ON data_changes(dataset_id, change_timestamp DESC);

-- Upload tracking indexes
CREATE INDEX idx_upload_dataset_status ON data_uploads(dataset_id, processing_status, upload_timestamp DESC);
CREATE INDEX idx_upload_user_time ON data_uploads(uploaded_by, upload_timestamp DESC);

-- Search analytics indexes
CREATE INDEX idx_search_dataset_time ON search_queries(dataset_id, query_timestamp DESC);
CREATE INDEX idx_search_user_session ON search_queries(user_id, session_id, query_timestamp);
```

### Data Quality Constraints

Ensure data integrity for intuitive user experience:

```sql
-- Employee data quality
ALTER TABLE hr_data_input ADD CONSTRAINT chk_data_quality_score 
    CHECK (data_quality_score >= 0.0 AND data_quality_score <= 1.0);

-- Upload file size limits
ALTER TABLE data_uploads ADD CONSTRAINT chk_file_size 
    CHECK (file_size > 0 AND file_size <= 52428800); -- 50MB limit

-- Change tracking integrity
ALTER TABLE data_changes ADD CONSTRAINT chk_field_changes_not_empty 
    CHECK (json_array_length(field_changes) > 0);

-- Search query limits
ALTER TABLE search_queries ADD CONSTRAINT chk_query_text_length 
    CHECK (length(query_text) >= 1 AND length(query_text) <= 500);
```

## Data Migration Strategy

### Phase 1: Schema Extensions

1. Add new columns to existing `hr_data_input` table
2. Create new audit and upload tracking tables
3. Install search triggers and indexes
4. Populate initial data quality scores

### Phase 2: Data Backfill

1. Generate search vectors for existing employee records
2. Create initial data change records for existing data
3. Calculate data quality scores for existing employees
4. Verify multi-tenant isolation works correctly

### Phase 3: Validation

1. Test search performance with existing data
2. Verify audit trail functionality
3. Confirm file upload processing works end-to-end
4. Validate data quality calculations

This data model supports all four user stories while maintaining compatibility with existing ChurnVision infrastructure and constitutional requirements for security, type safety, and audit compliance.