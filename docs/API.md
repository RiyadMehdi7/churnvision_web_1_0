# ChurnVision Enterprise - API Reference

Complete REST API documentation for ChurnVision Enterprise.

**Base URL:** `http://your-server:8000/api/v1`

**Authentication:** Bearer token (JWT) required for all endpoints except `/auth/login`

## Table of Contents

1. [Authentication](#authentication)
2. [Employees](#employees)
3. [Churn Predictions](#churn-predictions)
4. [Model Intelligence](#model-intelligence)
5. [Intelligent Chat](#intelligent-chat)
6. [Data Management](#data-management)
7. [Knowledge Base (RAG)](#knowledge-base-rag)
8. [Actions](#actions)
9. [ELTV Playground](#eltv-playground)
10. [Admin](#admin)
11. [Settings](#settings)
12. [License](#license)

---

## Authentication

### Login

Authenticate and receive access token.

```http
POST /auth/login
Content-Type: application/json

{
  "username": "string",
  "password": "string"
}
```

**Response (200):**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIs...",
  "token_type": "bearer",
  "expires_in": 1800
}
```

**Error Responses:**
- `401`: Invalid credentials
- `423`: Account locked (too many failed attempts)

---

### Get Current User

```http
GET /auth/me
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "id": 1,
  "username": "john.smith",
  "is_super_admin": false,
  "created_at": "2025-01-01T00:00:00Z"
}
```

---

### Get User with Permissions

```http
GET /auth/me/extended
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "id": 1,
  "username": "john.smith",
  "role": {
    "role_id": "analyst",
    "role_name": "Analyst"
  },
  "permissions": [
    "employee:read",
    "prediction:read",
    "report:read"
  ]
}
```

---

### Refresh Token

```http
POST /auth/refresh
Authorization: Bearer <refresh_token>
```

**Response (200):**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "token_type": "bearer"
}
```

---

### Logout

```http
POST /auth/logout
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "message": "Successfully logged out"
}
```

---

## Employees

### List Employees

Retrieve all employees with predictions.

```http
GET /employees?skip=0&limit=100
Authorization: Bearer <token>
```

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| skip | int | 0 | Pagination offset |
| limit | int | 100 | Max results (max 1000) |

**Response (200):**
```json
{
  "employees": [
    {
      "hr_code": "EMP-001",
      "full_name": "John Smith",
      "department": "Engineering",
      "role": "Senior Engineer",
      "tenure_years": 3.5,
      "prediction": {
        "resign_proba": 0.72,
        "risk_level": "HIGH",
        "confidence_score": 0.85
      },
      "reasoning": {
        "contributing_factors": [
          {"factor": "satisfaction_level", "impact": 0.25},
          {"factor": "no_promotion", "impact": 0.18}
        ],
        "recommendations": ["Career discussion", "Workload review"]
      }
    }
  ],
  "total": 450
}
```

---

### Generate Treatments

Generate AI-powered retention treatments for an employee.

```http
POST /employees/{hr_code}/generate-treatments
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "hr_code": "EMP-001",
  "treatments": [
    {
      "type": "career_development",
      "title": "Career Path Discussion",
      "description": "Schedule meeting to discuss growth opportunities",
      "expected_impact": 0.15,
      "cost_estimate": "low"
    },
    {
      "type": "compensation",
      "title": "Salary Review",
      "description": "Consider market adjustment",
      "expected_impact": 0.20,
      "cost_estimate": "medium"
    }
  ]
}
```

---

## Churn Predictions

### Single Prediction

Predict churn for a single employee.

```http
POST /churn/predict
Authorization: Bearer <token>
Content-Type: application/json

{
  "hr_code": "EMP-001",
  "features": {
    "satisfaction_level": 0.45,
    "last_evaluation": 0.78,
    "number_project": 5,
    "average_monthly_hours": 220,
    "tenure_years": 3,
    "work_accident": 0,
    "promotion_last_5years": 0,
    "department": "Engineering",
    "salary": "medium"
  }
}
```

**Response (200):**
```json
{
  "hr_code": "EMP-001",
  "resign_proba": 0.72,
  "risk_level": "HIGH",
  "confidence_score": 0.85,
  "contributing_factors": [
    {"feature": "satisfaction_level", "shap_value": 0.25},
    {"feature": "promotion_last_5years", "shap_value": 0.18}
  ],
  "recommendations": [
    "Schedule career development meeting",
    "Review workload distribution"
  ],
  "prediction_time_ms": 45
}
```

---

### Batch Prediction

Predict churn for multiple employees.

```http
POST /churn/predict/batch
Authorization: Bearer <token>
Content-Type: application/json

{
  "hr_codes": ["EMP-001", "EMP-002", "EMP-003"]
}
```

**Response (200):**
```json
{
  "predictions": [...],
  "summary": {
    "total": 3,
    "high_risk": 1,
    "medium_risk": 1,
    "low_risk": 1,
    "average_probability": 0.48
  }
}
```

---

### Train Model

Initiate model training (async).

```http
POST /churn/train
Authorization: Bearer <token>
Content-Type: multipart/form-data

file: <CSV file>  (optional - uses active dataset if not provided)
```

**Response (202):**
```json
{
  "job_id": "train-abc123",
  "status": "queued",
  "message": "Training job queued"
}
```

---

### Get Training Status

Poll training progress.

```http
GET /churn/train/status
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "job_id": "train-abc123",
  "status": "in_progress",
  "progress": 65,
  "message": "Training model... (65%)",
  "started_at": "2025-01-15T10:00:00Z"
}
```

**Status Values:** `queued`, `in_progress`, `complete`, `error`

---

### Get Model Metrics

Retrieve trained model performance.

```http
GET /churn/model/metrics
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "accuracy": 0.82,
  "precision": 0.78,
  "recall": 0.71,
  "f1_score": 0.74,
  "auc_roc": 0.86,
  "feature_importance": [
    {"feature": "satisfaction_level", "importance": 0.28},
    {"feature": "number_project", "importance": 0.19},
    {"feature": "average_monthly_hours", "importance": 0.15}
  ],
  "last_trained": "2025-01-15T10:30:00Z",
  "training_samples": 12500
}
```

---

### Get Risk Alerts

Retrieve high-risk employee alerts.

```http
GET /churn/alerts?limit=10&include_read=false
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "alerts": [
    {
      "id": 123,
      "hr_code": "EMP-042",
      "employee_name": "Sarah Johnson",
      "severity": "critical",
      "risk_score": 0.85,
      "message": "Risk increased 20% in past week",
      "created_at": "2025-01-15T08:00:00Z",
      "is_read": false
    }
  ],
  "unread_count": 5,
  "severity_breakdown": {
    "critical": 2,
    "high": 3,
    "medium": 8
  }
}
```

---

### Mark Alert Read

```http
POST /churn/alerts/{alert_id}/read
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "message": "Alert marked as read"
}
```

---

## Model Intelligence

### Backtesting

Get historical prediction accuracy.

```http
GET /churn/model/backtesting?periods=6
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "periods": [
    {
      "period": "2024-Q4",
      "predictions_made": 450,
      "actual_departures": 42,
      "correctly_predicted": 38,
      "accuracy": 0.90
    }
  ],
  "aggregate": {
    "total_predictions": 2700,
    "overall_accuracy": 0.84
  }
}
```

---

### Prediction Outcomes

Track predicted vs. actual departures.

```http
GET /churn/model/prediction-outcomes
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "outcomes": [
    {
      "hr_code": "EMP-099",
      "predicted_risk": 0.78,
      "actual_outcome": "departed",
      "prediction_date": "2024-10-01",
      "outcome_date": "2024-12-15"
    }
  ],
  "summary": {
    "true_positives": 38,
    "false_positives": 12,
    "true_negatives": 380,
    "false_negatives": 8
  }
}
```

---

### Departure Timeline

Predict when an employee might leave.

```http
GET /churn/timeline/{hr_code}
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "hr_code": "EMP-001",
  "probabilities": {
    "30_days": 0.15,
    "60_days": 0.32,
    "90_days": 0.48,
    "180_days": 0.72
  },
  "predicted_window": "60-90 days",
  "urgency": "high",
  "confidence": 0.78
}
```

---

### Cohort Analysis

Compare employee to similar cohorts.

```http
GET /churn/cohort/{hr_code}
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "hr_code": "EMP-001",
  "cohort_definition": {
    "department": "Engineering",
    "tenure_range": "3-5 years",
    "role_level": "Senior"
  },
  "similar_who_left": {
    "count": 12,
    "common_factors": [
      "No promotion in 3+ years",
      "Above average hours"
    ],
    "average_tenure_at_departure": 4.2
  },
  "similar_who_stayed": {
    "count": 45,
    "retention_factors": [
      "Received promotion",
      "Participated in leadership programs"
    ]
  },
  "recommended_actions": [
    "Discuss promotion timeline",
    "Enroll in leadership development"
  ]
}
```

---

### Survival Analysis

Cox Proportional Hazards prediction.

```http
GET /churn/survival/predict/{hr_code}
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "hr_code": "EMP-001",
  "survival_probabilities": {
    "30_days": 0.92,
    "60_days": 0.85,
    "90_days": 0.78,
    "180_days": 0.62,
    "365_days": 0.41
  },
  "median_survival_days": 245,
  "hazard_ratio": 1.45,
  "expected_departure_window": "6-9 months"
}
```

---

## Intelligent Chat

### Send Message

Chat with AI about employee data.

```http
POST /intelligent-chat/chat
Authorization: Bearer <token>
Content-Type: application/json

{
  "message": "Why is John Smith at high risk?",
  "session_id": "session-abc123",
  "employee_id": "EMP-001"  // optional - for employee-specific context
}
```

**Response (200) - Chat Mode:**
```json
{
  "response": "John Smith (EMP-001) has a 72% churn risk...",
  "session_id": "session-abc123",
  "sources": ["employee_data", "prediction_model"],
  "confidence": 0.85
}
```

**Response (200) - Quick Action Mode:**
```json
{
  "action_type": "diagnose",
  "data": {
    "employee": {...},
    "risk_breakdown": {...},
    "recommendations": [...]
  },
  "session_id": "session-abc123"
}
```

---

### Get Chat History

```http
GET /intelligent-chat/chat/history?session_id=session-abc123
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "messages": [
    {
      "role": "user",
      "content": "Why is John Smith at high risk?",
      "timestamp": "2025-01-15T10:00:00Z"
    },
    {
      "role": "assistant",
      "content": "John Smith has a 72% churn risk...",
      "timestamp": "2025-01-15T10:00:02Z"
    }
  ]
}
```

---

## Data Management

### Upload Dataset

```http
POST /data-management/datasets/upload
Authorization: Bearer <token>
Content-Type: multipart/form-data

file: <CSV file>
name: "Q1 2025 HR Data"
description: "Quarterly employee snapshot"
```

**Response (201):**
```json
{
  "dataset_id": 42,
  "name": "Q1 2025 HR Data",
  "row_count": 1250,
  "columns": ["hr_code", "full_name", "department", ...],
  "uploaded_at": "2025-01-15T10:00:00Z",
  "is_active": false
}
```

---

### Set Active Dataset

```http
POST /data-management/datasets/{dataset_id}/activate
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "message": "Dataset activated",
  "dataset_id": 42
}
```

---

### Map Columns

```http
POST /data-management/datasets/{dataset_id}/map-columns
Authorization: Bearer <token>
Content-Type: application/json

{
  "column_mapping": {
    "employee_id": "hr_code",
    "name": "full_name",
    "dept": "department",
    "hire_date": "hire_date"
  }
}
```

**Response (200):**
```json
{
  "message": "Column mapping saved",
  "mapped_columns": 4
}
```

---

### List Datasets

```http
GET /data-management/datasets
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "datasets": [
    {
      "id": 42,
      "name": "Q1 2025 HR Data",
      "row_count": 1250,
      "is_active": true,
      "uploaded_at": "2025-01-15T10:00:00Z"
    }
  ]
}
```

---

## Knowledge Base (RAG)

### Upload Document

```http
POST /rag/documents/upload
Authorization: Bearer <token>
Content-Type: multipart/form-data

file: <PDF/DOCX/TXT file>
title: "HR Policy Manual"
category: "policies"
```

**Response (201):**
```json
{
  "document_id": "doc-abc123",
  "title": "HR Policy Manual",
  "file_type": "pdf",
  "chunk_count": 45,
  "uploaded_at": "2025-01-15T10:00:00Z"
}
```

---

### Query Knowledge Base

```http
POST /rag/query
Authorization: Bearer <token>
Content-Type: application/json

{
  "query": "What is our remote work policy?",
  "top_k": 5
}
```

**Response (200):**
```json
{
  "answer": "According to the HR Policy Manual, remote work is available...",
  "sources": [
    {
      "document_id": "doc-abc123",
      "title": "HR Policy Manual",
      "chunk": "Section 4.2: Remote Work Guidelines...",
      "similarity_score": 0.92
    }
  ]
}
```

---

### Create Custom Rule

```http
POST /rag/custom-rules
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Salary Increase Limit",
  "condition": "salary_increase_percent > 15",
  "action": "require_vp_approval",
  "message": "Salary increases above 15% require VP approval"
}
```

**Response (201):**
```json
{
  "rule_id": "rule-xyz789",
  "name": "Salary Increase Limit",
  "is_active": true
}
```

---

### Validate Treatment

Check if a treatment violates any rules.

```http
POST /rag/validate-treatment
Authorization: Bearer <token>
Content-Type: application/json

{
  "hr_code": "EMP-001",
  "treatment": {
    "type": "salary_increase",
    "value": 20
  }
}
```

**Response (200):**
```json
{
  "is_valid": false,
  "violations": [
    {
      "rule_id": "rule-xyz789",
      "rule_name": "Salary Increase Limit",
      "message": "Salary increases above 15% require VP approval"
    }
  ],
  "suggested_alternatives": [
    {
      "type": "salary_increase",
      "value": 12,
      "additional": "training_budget"
    }
  ]
}
```

---

## Actions

### Generate Email

```http
POST /actions/generate/email
Authorization: Bearer <token>
Content-Type: application/json

{
  "hr_code": "EMP-001",
  "email_type": "career_discussion"
}
```

**Email Types:** `check_in`, `career_discussion`, `recognition`, `stay_interview`

**Response (200):**
```json
{
  "subject": "Let's Discuss Your Career Growth",
  "body": "Hi John,\n\nI wanted to reach out to discuss...",
  "tone": "professional",
  "personalization_factors": ["recent_project", "tenure_milestone"]
}
```

---

### Generate Meeting

```http
POST /actions/generate/meeting
Authorization: Bearer <token>
Content-Type: application/json

{
  "hr_code": "EMP-001",
  "meeting_type": "career_planning"
}
```

**Meeting Types:** `one_on_one`, `skip_level`, `career_planning`, `team_sync`

**Response (200):**
```json
{
  "title": "Career Planning Discussion",
  "duration_minutes": 45,
  "agenda": [
    {"topic": "Recent accomplishments", "duration": 10},
    {"topic": "Career goals", "duration": 15},
    {"topic": "Growth opportunities", "duration": 15},
    {"topic": "Next steps", "duration": 5}
  ],
  "talking_points": [...]
}
```

---

## ELTV Playground

### Get Employee ELTV Data

```http
GET /playground/data/{employee_id}
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "employee": {...},
  "eltv": {
    "current_value": 125000,
    "annual_contribution": 85000,
    "expected_tenure_years": 2.5
  },
  "survival_curve": [
    {"month": 1, "probability": 0.98},
    {"month": 3, "probability": 0.92},
    {"month": 6, "probability": 0.82}
  ]
}
```

---

### Simulate Treatment

```http
POST /playground/simulate-treatment
Authorization: Bearer <token>
Content-Type: application/json

{
  "employee_id": "EMP-001",
  "treatment": {
    "type": "salary_increase",
    "value": 10
  }
}
```

**Response (200):**
```json
{
  "baseline": {
    "survival_6mo": 0.65,
    "eltv": 125000
  },
  "with_treatment": {
    "survival_6mo": 0.78,
    "eltv": 152000
  },
  "impact": {
    "survival_improvement": 0.13,
    "eltv_increase": 27000,
    "treatment_cost": 8500,
    "roi": 3.18
  }
}
```

---

## Admin

### List Users

```http
GET /admin/users
Authorization: Bearer <admin-token>
```

**Response (200):**
```json
{
  "users": [
    {
      "id": 1,
      "username": "john.smith",
      "role": "analyst",
      "created_at": "2025-01-01T00:00:00Z",
      "last_login": "2025-01-15T08:30:00Z"
    }
  ]
}
```

---

### Create User

```http
POST /admin/users
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "username": "jane.doe",
  "password": "SecureP@ss123",
  "role_id": "analyst"
}
```

**Response (201):**
```json
{
  "id": 42,
  "username": "jane.doe",
  "role_id": "analyst"
}
```

---

### Get Audit Logs

```http
GET /admin/audit-logs?limit=100&user_id=1&action=login
Authorization: Bearer <admin-token>
```

**Response (200):**
```json
{
  "logs": [
    {
      "id": 12345,
      "timestamp": "2025-01-15T10:30:00Z",
      "user_id": 1,
      "username": "john.smith",
      "action": "login",
      "ip_address": "192.168.1.100"
    }
  ],
  "total": 523
}
```

---

## Settings

### Get Risk Thresholds

```http
GET /settings/risk-thresholds
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "high_threshold": 0.7,
  "medium_threshold": 0.4,
  "low_threshold": 0.0
}
```

---

### Update Risk Thresholds

```http
POST /settings/risk-thresholds
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "high_threshold": 0.65,
  "medium_threshold": 0.35
}
```

---

## License

### Activate License

```http
POST /license/activate
Content-Type: application/json

{
  "license_key": "CV-ENT-2025-XXXXX..."
}
```

**Response (200):**
```json
{
  "status": "ACTIVE",
  "tier": "enterprise",
  "expires_at": "2026-12-31T23:59:59Z"
}
```

---

### Check License Status

```http
GET /license/status
```

**Response (200):**
```json
{
  "status": "ACTIVE",
  "tier": "enterprise",
  "expires_at": "2026-12-31T23:59:59Z",
  "features": ["unlimited_users", "sso", "rag", "api_access"],
  "days_remaining": 365
}
```

---

## Error Responses

All endpoints return standard error format:

```json
{
  "detail": "Error message here",
  "code": "ERROR_CODE",
  "timestamp": "2025-01-15T10:30:00Z"
}
```

**Common Status Codes:**

| Code | Meaning |
|------|---------|
| 400 | Bad Request - Invalid input |
| 401 | Unauthorized - Invalid/missing token |
| 403 | Forbidden - Insufficient permissions |
| 404 | Not Found - Resource doesn't exist |
| 422 | Validation Error - Input validation failed |
| 423 | Locked - Account locked |
| 429 | Too Many Requests - Rate limited |
| 500 | Internal Server Error |

---

## Rate Limits

| Endpoint Category | Limit |
|-------------------|-------|
| Authentication | 5 requests/minute |
| Predictions | 100 requests/minute |
| Chat | 30 requests/minute |
| Admin | 50 requests/minute |
| All others | 200 requests/minute |

---

**Version**: 1.0.0
**Last Updated**: December 2025
