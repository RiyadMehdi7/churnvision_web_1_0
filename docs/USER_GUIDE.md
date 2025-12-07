# ChurnVision Enterprise - User Guide

This guide covers daily operations for HR managers and analysts using ChurnVision to predict employee churn and take retention actions.

## Table of Contents

1. [Getting Started](#getting-started)
2. [Dashboard Overview](#dashboard-overview)
3. [Data Import](#data-import)
4. [Model Training](#model-training)
5. [Viewing Predictions](#viewing-predictions)
6. [Intelligent Chat (AI Assistant)](#intelligent-chat-ai-assistant)
7. [ELTV Playground](#eltv-playground)
8. [Knowledge Base](#knowledge-base)
9. [Taking Retention Actions](#taking-retention-actions)
10. [Reports & Analytics](#reports--analytics)

---

## Getting Started

### Logging In

1. Navigate to `http://your-churnvision-server:3000`
2. Enter your username and password
3. Click "Sign In"

**First-time Login:**
- Use credentials provided by your administrator
- You'll be prompted to change your password

### Navigation

| Menu Item | Description |
|-----------|-------------|
| Home | Main dashboard with employee risk overview |
| Data Management | Import and manage HR datasets |
| AI Assistant | Chat interface for HR insights |
| Playground | ELTV analysis and treatment simulation |
| Knowledge Base | Document library and custom rules |
| Settings | Personal and system settings |

---

## Dashboard Overview

The Home dashboard provides a comprehensive view of your workforce churn risk.

### Employee List

The main table displays all employees with:

| Column | Description |
|--------|-------------|
| Name | Employee full name |
| HR Code | Unique identifier |
| Department | Organizational unit |
| Risk Score | Churn probability (0-100%) |
| Risk Level | LOW / MEDIUM / HIGH / CRITICAL |
| Contributing Factors | Top reasons for risk |

**Sorting & Filtering:**
- Click column headers to sort
- Use the search bar to find specific employees
- Filter by department or risk level

### Risk Distribution

Visual breakdown of workforce by risk level:
- **Critical (>80%)**: Immediate attention required
- **High (60-80%)**: Schedule intervention within 2 weeks
- **Medium (40-60%)**: Monitor and plan engagement
- **Low (<40%)**: Standard retention practices

### Department Analysis

View aggregated risk by department:
- Average risk score per department
- Number of high-risk employees
- Trend indicators (improving/worsening)

### Model Intelligence Tab

Access advanced analytics:
- **Backtesting**: How accurate were past predictions?
- **Prediction Outcomes**: Predicted vs. actual departures
- **Cohort Analysis**: Compare similar employee groups

---

## Data Import

### Uploading HR Data

1. Navigate to **Data Management**
2. Click **"Upload Dataset"**
3. Select your CSV file
4. Review the preview
5. Click **"Upload"**

**Supported Format:** CSV with headers

**Required Columns:**
| Column | Description | Example |
|--------|-------------|---------|
| hr_code | Unique employee ID | EMP-001 |
| full_name | Employee name | John Smith |
| department | Department name | Engineering |

**Optional Columns:**
| Column | Description |
|--------|-------------|
| satisfaction_level | Job satisfaction (0-1) |
| last_evaluation | Performance score (0-1) |
| number_project | Active projects count |
| average_monthly_hours | Hours worked per month |
| tenure_years | Years at company |
| work_accident | Had work accident (0/1) |
| promotion_last_5years | Promoted recently (0/1) |
| salary | Salary level (low/medium/high) |
| employment_status | Current status |

### Column Mapping

If your columns have different names:

1. After upload, click **"Map Columns"**
2. Match your columns to ChurnVision fields:
   ```
   Your Column        →  ChurnVision Field
   ──────────────────────────────────────
   employee_id        →  hr_code
   name               →  full_name
   dept               →  department
   ```
3. Click **"Save Mapping"**

### Activating a Dataset

Only one dataset can be active at a time:

1. Go to **Data Management > Datasets**
2. Find your dataset
3. Click **"Set as Active"**

The active dataset is used for predictions and analysis.

---

## Model Training

### Training a New Model

1. Ensure you have an active dataset with historical data (including who left)
2. Navigate to **Home > Model Intelligence**
3. Click **"Train Model"**
4. Select training options:
   - Dataset to use
   - Target column (churn indicator)
5. Click **"Start Training"**

**Training Progress:**
- Status: Queued → In Progress → Complete
- Progress percentage shown
- Typical duration: 2-10 minutes depending on data size

### Model Metrics

After training, view model performance:

| Metric | Description | Good Range |
|--------|-------------|------------|
| Accuracy | Overall correct predictions | > 75% |
| Precision | True positives / predicted positives | > 70% |
| Recall | True positives / actual positives | > 65% |
| F1 Score | Harmonic mean of precision/recall | > 70% |

### Feature Importance

See which factors most influence predictions:
1. Satisfaction level
2. Number of projects
3. Average monthly hours
4. Tenure
5. Last evaluation

---

## Viewing Predictions

### Individual Employee View

1. Click on an employee row in the dashboard
2. View detailed breakdown:
   - **Risk Score**: Overall churn probability
   - **Contributing Factors**: What's driving the risk
   - **Behavioral Stage**: Career phase analysis
   - **Recommendations**: Suggested interventions

### Reasoning Breakdown

For each employee, ChurnVision explains the prediction:

```
Risk Score: 72% (HIGH)

Contributing Factors:
├── Satisfaction Level (Low): +25%
├── No Promotion in 5 Years: +18%
├── Above Average Hours: +15%
├── Multiple Projects (6): +10%
└── Department Risk (Sales): +4%

Behavioral Stage: Established (3-5 years)
- Higher flight risk due to market value
- Looking for growth opportunities
```

### Risk Alerts

High-risk employees trigger alerts:

1. View alerts in the notification panel
2. Click an alert to see details
3. Mark as read after reviewing
4. Take action from the alert view

---

## Intelligent Chat (AI Assistant)

### Asking Questions

The AI Assistant understands natural language:

**Example Questions:**
- "Why is John Smith at high risk?"
- "Show me retention trends in Engineering"
- "What interventions worked for similar employees?"
- "Compare this employee to others who stayed"

### Quick Actions

Use structured quick actions for common tasks:

| Quick Action | What It Does |
|--------------|--------------|
| **Diagnose** | Deep analysis of an employee's risk |
| **Retention Plan** | Generate intervention recommendations |
| **Compare Resigned** | Find similar employees who left |
| **Compare Stayed** | Find similar employees who stayed |
| **Exit Patterns** | Common reasons for departure |
| **Workforce Trends** | Overall churn patterns |
| **Department Analysis** | Department-specific insights |

### Example Session

```
You: Why is Sarah Johnson at high risk?

AI: Sarah Johnson (EMP-042) has a 78% churn risk. Here's the breakdown:

Key Factors:
1. Low satisfaction score (0.35) - significantly below department average
2. No promotion in 4 years despite strong evaluations
3. Working 220+ hours/month - potential burnout
4. Similar employees with this profile: 73% left within 6 months

Recommended Actions:
• Schedule a career development conversation
• Review workload distribution
• Consider recognition or compensation adjustment
```

---

## ELTV Playground

The Employee Lifetime Value (ELTV) Playground helps you simulate retention interventions.

### Understanding ELTV

ELTV estimates the total value an employee will contribute:

```
ELTV = (Annual Value × Expected Remaining Tenure) - Replacement Cost
```

### Using the Playground

1. Navigate to **Playground**
2. Search for an employee
3. View current metrics:
   - Current ELTV
   - Predicted departure timeline
   - Survival probability curve

### Simulating Treatments

Test "what-if" scenarios:

1. Select a treatment type:
   - Salary increase (5%, 10%, 15%)
   - Promotion
   - Role change
   - Flexible work arrangement
   - Training/development

2. Click **"Simulate"**

3. View projected impact:
   - New survival probability
   - ELTV change
   - ROI of intervention

### Treatment Suggestions

Get AI-powered recommendations:

1. Click **"Get Suggestions"**
2. Review ranked interventions
3. See cost-benefit analysis
4. Apply selected treatment

---

## Knowledge Base

### Uploading Documents

Add company policies and guidelines:

1. Navigate to **Knowledge Base**
2. Click **"Upload Document"**
3. Select file (PDF, DOCX, TXT, MD)
4. Add metadata (title, category)
5. Click **"Upload"**

**Max File Size:** 50MB

### Searching the Knowledge Base

Query your documents:

```
Search: "remote work policy for senior engineers"

Results:
1. HR Policy Manual - Chapter 4.2: Remote Work Guidelines (92% match)
2. Engineering Handbook - Work From Home Section (87% match)
3. Benefits Summary - Flexible Work Options (71% match)
```

### Custom Rules

Create rules for treatment validation:

1. Go to **Knowledge Base > Rules**
2. Click **"Add Rule"**
3. Define the rule:
   ```
   Name: Budget Limit Rule
   Condition: salary_increase > 15%
   Action: Requires VP approval
   ```
4. Save and activate

### Treatment Validation

When generating retention actions, ChurnVision checks against your rules:

```
Proposed: 20% salary increase for John Smith

⚠️ Rule Violation: "Budget Limit Rule"
   Salary increases >15% require VP approval.

Suggested Alternative:
   12% salary increase + training budget
```

---

## Taking Retention Actions

### Generating Action Proposals

1. Select a high-risk employee
2. Click **"Generate Actions"**
3. Choose action type:

| Type | Examples |
|------|----------|
| Email | Check-in, career discussion, recognition |
| Meeting | 1:1, skip-level, career planning |
| Task | Training enrollment, mentorship assignment |

### Email Templates

AI-generated, personalized emails:

```
Subject: Checking In - Let's Chat About Your Growth

Hi Sarah,

I noticed you've been putting in impressive hours on the Phoenix project.
Your contributions haven't gone unnoticed, and I'd love to chat about
your career aspirations...

[Personalized based on employee context]
```

### Meeting Proposals

Structured meeting agendas:

```
Meeting: Career Planning Discussion
Attendees: Sarah Johnson, Mike Chen (Manager)
Duration: 45 minutes

Agenda:
1. Recent accomplishments review (10 min)
2. Career goals discussion (15 min)
3. Growth opportunities at company (15 min)
4. Next steps and action items (5 min)

Talking Points:
• Acknowledge workload concerns
• Discuss promotion timeline
• Explore leadership opportunities
```

### Tracking Actions

All actions are logged:
1. Go to employee profile
2. View **"Action History"**
3. See outcomes and notes

---

## Reports & Analytics

### Risk Overview Report

| Metric | Current | Last Month | Change |
|--------|---------|------------|--------|
| High Risk Employees | 23 | 28 | -18% |
| Average Risk Score | 34% | 38% | -4% |
| Predicted Departures (90d) | 8 | 11 | -27% |

### Department Breakdown

```
Engineering:  ████████░░ 42% avg risk (12 high risk)
Sales:        ██████████ 58% avg risk (18 high risk)
Marketing:    ████░░░░░░ 28% avg risk (4 high risk)
Operations:   ██████░░░░ 35% avg risk (7 high risk)
```

### Trend Analysis

View risk trends over time:
- Weekly risk score changes
- Seasonal patterns
- Post-intervention improvements

### Exporting Data

Export predictions and analytics:

1. Go to **Settings > Export**
2. Select data type:
   - Employee predictions
   - Risk alerts
   - Action history
3. Choose format (CSV, Excel)
4. Click **"Download"**

---

## Best Practices

### Daily Workflow

1. **Morning**: Check new risk alerts
2. **Review**: High-risk employee changes
3. **Action**: Generate interventions for critical cases
4. **Document**: Log conversations and outcomes

### Effective Interventions

| Risk Level | Recommended Action | Timeline |
|------------|-------------------|----------|
| Critical (>80%) | Immediate manager conversation | Today |
| High (60-80%) | Career development meeting | This week |
| Medium (40-60%) | Engagement check-in | This month |
| Low (<40%) | Regular 1:1 cadence | Quarterly |

### Using AI Insights

- Trust but verify AI recommendations
- Combine data insights with human judgment
- Document what works for your organization
- Feed outcomes back into the system

---

## Frequently Asked Questions

**Q: How often should I check predictions?**
A: Daily for high-risk alerts, weekly for full dashboard review.

**Q: Can I override a risk score?**
A: You can add notes and context, but scores are model-generated. Contact admin if you believe the model needs retraining.

**Q: What if an employee's risk suddenly increases?**
A: Check contributing factors for recent changes. Common causes: new survey data, workload changes, or peer departures.

**Q: How accurate are the predictions?**
A: View model metrics in Settings. Typical accuracy is 75-85%. Predictions improve with more historical data.

**Q: Can I export individual employee reports?**
A: Yes, click the export icon on any employee profile.

---

## Getting Help

- **In-app help**: Click the "?" icon
- **User guide**: This document
- **Administrator**: Contact your system admin
- **Support**: support@churnvision.com

---

**Version**: 1.0.0
**Last Updated**: December 2025