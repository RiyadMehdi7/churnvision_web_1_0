# ChurnVision Realism Improvements Plan

## Executive Summary

This plan outlines improvements to make ChurnVision produce more realistic, validated churn predictions. The current system has a solid foundation but lacks rigorous validation, proper explainability, and feedback mechanisms.

---

## Phase 1: Data Quality & Validation (Foundation)

### 1.1 Replace Arbitrary Defaults with Data Quality Flags

**Current Problem:**
```python
# From churn.py:231-235
df["number_project"] = 3  # Arbitrary default
df["average_monthly_hours"] = 160  # Arbitrary default
```

**Solution:** Track data completeness and flag low-quality predictions.

**Files to modify:**
- `backend/app/services/churn_prediction.py`
- `backend/app/schemas/churn.py`
- `backend/app/models/churn.py`

**Changes:**
1. Add `data_quality_score` field to predictions (0-1)
2. Flag which features are derived vs actual
3. Lower confidence when using defaults
4. Add `features_missing` list to response

### 1.2 Input Validation & Range Checks

**Add validation for realistic ranges:**
- `satisfaction_level`: 0.0-1.0
- `average_monthly_hours`: 80-300 (flag outliers)
- `number_project`: 1-15
- `tenure`: 0-40 years

**Files to modify:**
- `backend/app/schemas/churn.py` (add Pydantic validators)

---

## Phase 2: Model Validation & Metrics (Rigor)

### 2.1 Proper Train/Test Split

**Current Problem:**
```python
# From churn_prediction.py:580-586
y_pred = self.model.predict(X_scaled)  # Evaluating on training data!
metrics = {
    'accuracy': float(accuracy_score(y, y_pred)),  # Training metrics only
}
```

**Solution:** Implement proper train/test split with holdout validation.

**Files to modify:**
- `backend/app/services/churn_prediction.py`

**Changes:**
```python
from sklearn.model_selection import train_test_split, cross_val_score

def _prepare_training_data(self, df):
    X, y = self._extract_features(df)
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, stratify=y, random_state=42
    )
    return X_train, X_test, y_train, y_test
```

### 2.2 Handle Class Imbalance

**Current Problem:** Real churn data is typically 5-15% positive class. No handling currently.

**Solution:** Add SMOTE or class weights.

**Files to modify:**
- `backend/app/services/churn_prediction.py`
- `backend/pyproject.toml` (add imbalanced-learn)

**Changes:**
```python
from imblearn.over_sampling import SMOTE

# Option 1: SMOTE
smote = SMOTE(random_state=42)
X_resampled, y_resampled = smote.fit_resample(X_train, y_train)

# Option 2: Class weights (simpler)
self.model = xgb.XGBClassifier(
    scale_pos_weight=len(y_train[y_train==0]) / len(y_train[y_train==1]),
    ...
)
```

### 2.3 Cross-Validation Metrics

**Add 5-fold CV for robust metrics:**
```python
cv_scores = cross_val_score(model, X, y, cv=5, scoring='roc_auc')
metrics['cv_roc_auc_mean'] = cv_scores.mean()
metrics['cv_roc_auc_std'] = cv_scores.std()
```

### 2.4 Add ROC-AUC and PR-AUC

**Files to modify:**
- `backend/app/schemas/churn.py`
- `backend/app/services/churn_prediction.py`

**New metrics:**
- `roc_auc`: Overall discrimination ability
- `pr_auc`: Precision-Recall AUC (better for imbalanced data)
- `brier_score`: Calibration quality

---

## Phase 3: SHAP-Based Explainability (Transparency)

### 3.1 Replace Hardcoded Rules with SHAP Values

**Current Problem:**
```python
# From churn_prediction.py:338-405
def _get_contributing_factors(self, features, probability):
    factors = []
    if features.satisfaction_level < 0.4:  # Hardcoded threshold
        factors.append({...})
```

**Solution:** Use actual SHAP values from the model.

**Files to modify:**
- `backend/app/services/churn_prediction.py`
- `backend/pyproject.toml` (add shap)

**New code:**
```python
import shap

class ChurnPredictionService:
    def __init__(self):
        self.explainer = None

    def _initialize_explainer(self):
        if isinstance(self.model, xgb.XGBClassifier):
            self.explainer = shap.TreeExplainer(self.model)

    def _get_shap_contributing_factors(self, features_array, feature_names):
        if self.explainer is None:
            return self._get_contributing_factors_fallback(...)

        shap_values = self.explainer.shap_values(features_array)

        # Sort by absolute SHAP value
        feature_impacts = list(zip(feature_names, shap_values[0]))
        feature_impacts.sort(key=lambda x: abs(x[1]), reverse=True)

        factors = []
        for name, value in feature_impacts[:5]:
            factors.append({
                "feature": name,
                "shap_value": float(value),
                "impact": "positive" if value > 0 else "negative",
                "message": self._generate_factor_message(name, value)
            })
        return factors
```

### 3.2 Store SHAP Values for Audit

**Current schema already supports this:**
```python
# From churn.py (models)
shap_values = Column(JSON, nullable=True)
```

**Ensure we populate with actual SHAP values, not derived impacts.**

---

## Phase 4: Outcome Tracking & Feedback Loop (Validation)

### 4.1 Prediction Outcome Tracking

**Current State:** `RetentionValidation` table exists but isn't fully utilized.

**Solution:** Automated outcome tracking.

**New service:** `backend/app/services/outcome_tracking_service.py`

```python
class OutcomeTrackingService:
    async def record_prediction(self, hr_code, risk_score, prediction_date):
        """Record prediction for later validation"""

    async def validate_predictions(self, db, dataset_id, lookback_days=90):
        """Check predictions against actual outcomes"""
        # Find employees flagged as high-risk N days ago
        # Check if they actually left
        # Calculate realized precision/recall

    async def get_model_accuracy_over_time(self, db, dataset_id):
        """Return accuracy metrics by prediction cohort"""
```

### 4.2 Backtesting Integration

**Enhance existing `model_intelligence_service.py`:**

1. Compare predictions made at time T with outcomes at T+30/60/90
2. Calculate realized catch rate
3. Store and display historical accuracy

### 4.3 Add "Prediction Verified" Field

**New migration:**
```python
# Add to ChurnOutput
prediction_verified = Column(Boolean, default=False)
verification_date = Column(Date, nullable=True)
actual_outcome = Column(String, nullable=True)  # 'stayed', 'left'
prediction_correct = Column(Boolean, nullable=True)
```

---

## Phase 5: Probability Calibration (Accuracy)

### 5.1 Platt Scaling / Isotonic Regression

**Current Problem:** Model probabilities may not reflect true likelihood.

**Solution:** Calibrate probabilities post-training.

**Files to modify:**
- `backend/app/services/churn_prediction.py`

**Changes:**
```python
from sklearn.calibration import CalibratedClassifierCV

# After training
calibrator = CalibratedClassifierCV(self.model, method='isotonic', cv=3)
calibrator.fit(X_train, y_train)
self.calibrated_model = calibrator
```

### 5.2 Reliability Diagram

**Add endpoint to show calibration quality:**
- Expected vs observed probability bins
- Brier score decomposition

---

## Phase 6: Data-Driven Thresholds (Optimization)

### 6.1 Replace Hardcoded Risk Thresholds

**Current Problem:**
```python
# From churn_prediction.py:194-200
if probability >= 0.60:  # Arbitrary
    return ChurnRiskLevel.HIGH
elif probability >= 0.30:  # Arbitrary
    return ChurnRiskLevel.MEDIUM
```

**Solution:** Derive thresholds from precision/recall trade-offs.

**New approach:**
```python
def _optimize_thresholds(self, y_true, y_proba):
    """Find optimal thresholds for high/medium/low using F1 optimization"""
    from sklearn.metrics import precision_recall_curve

    precision, recall, thresholds = precision_recall_curve(y_true, y_proba)
    f1_scores = 2 * (precision * recall) / (precision + recall + 1e-8)

    # Find threshold that maximizes F1
    optimal_idx = np.argmax(f1_scores)
    high_threshold = thresholds[optimal_idx]

    # Medium threshold at recall = 0.8
    medium_idx = np.argmin(np.abs(recall - 0.8))
    medium_threshold = thresholds[medium_idx]

    return {'high': high_threshold, 'medium': medium_threshold}
```

### 6.2 Configurable Thresholds

**Add to settings:**
```python
# backend/app/core/config.py
class Settings:
    CHURN_THRESHOLD_HIGH: float = 0.60
    CHURN_THRESHOLD_MEDIUM: float = 0.30
    CHURN_AUTO_OPTIMIZE_THRESHOLDS: bool = True
```

---

## Phase 7: Feature Engineering Improvements

### 7.1 Derived Engagement Metrics

**If additional_data contains rich fields, compute:**
- `engagement_trend`: Change in satisfaction over time
- `workload_intensity`: hours * projects
- `career_velocity`: promotions / tenure
- `comp_ratio`: salary vs market/peers

### 7.2 Temporal Features

**Track employee snapshots over time:**
```python
# Use EmployeeSnapshot table to compute:
- satisfaction_3m_trend
- evaluation_change
- workload_change
```

### 7.3 Manager/Team Features

**Add team-level risk indicators:**
- `team_avg_risk`: Average risk of teammates
- `manager_turnover_rate`: Historical turnover under this manager
- `dept_risk_percentile`: Where employee ranks in department

---

## Phase 8: Model Monitoring & Drift Detection

### 8.1 Feature Drift Detection

**Monitor input feature distributions over time.**

**New service:** `backend/app/services/model_monitoring_service.py`

```python
class ModelMonitoringService:
    async def check_feature_drift(self, db, dataset_id):
        """Compare current feature distributions to training baseline"""
        # Use KS-test or PSI for drift detection

    async def check_prediction_drift(self, db, dataset_id):
        """Check if prediction distribution has shifted"""
```

### 8.2 Automated Retraining Triggers

**Trigger retraining when:**
- Feature drift exceeds threshold
- Prediction accuracy drops below baseline
- N new departures recorded since last training

---

## Implementation Priority

| Phase | Priority | Effort | Impact |
|-------|----------|--------|--------|
| Phase 2: Model Validation | HIGH | Medium | Critical |
| Phase 3: SHAP Explainability | HIGH | Medium | High |
| Phase 4: Outcome Tracking | HIGH | Medium | Critical |
| Phase 1: Data Quality | MEDIUM | Low | Medium |
| Phase 5: Calibration | MEDIUM | Low | High |
| Phase 6: Thresholds | MEDIUM | Low | Medium |
| Phase 7: Feature Engineering | LOW | High | Medium |
| Phase 8: Monitoring | LOW | Medium | Medium |

---

## Dependencies to Add

```toml
# backend/pyproject.toml
[project.dependencies]
shap = "^0.44"
imbalanced-learn = "^0.11"
```

---

## Success Metrics

After implementation, track:

1. **Realized Precision**: Of employees flagged high-risk, what % actually left within 90 days?
   - Target: >60%

2. **Realized Recall**: Of employees who left, what % were flagged high-risk beforehand?
   - Target: >70%

3. **Calibration**: Brier score < 0.15

4. **Data Quality**: Average data quality score > 0.8

5. **Confidence Accuracy**: When confidence is high (>0.8), accuracy should be >80%

---

## Estimated Timeline

- Phase 1-2: 3-4 days
- Phase 3-4: 3-4 days
- Phase 5-6: 2-3 days
- Phase 7-8: 4-5 days (optional)

**Total for core improvements (Phases 1-6): ~10 days**
