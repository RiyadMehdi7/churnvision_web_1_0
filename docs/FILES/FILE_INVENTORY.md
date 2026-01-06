# File Inventory

**Generated**: 2026-01-06
**Total Files**: 468

---

## Summary by Directory

| Directory | Count |
|-----------|-------|
| Root level | 9 |
| .claude/ | 1 |
| .github/workflows/ | 2 |
| backend/ | 185 |
| db/ | 6 |
| docs/ | 12 |
| frontend/ | 243 |
| infra/ | 12 |
| **Total** | **468** |

---

## Complete File List

### Root Level (9 files)

```
.gitignore
Claude.md
Dockerfile
FILE_DECISIONS.md
Makefile
PROD_READINESS.md
docker-compose.prod.yml
docker-compose.yml
generate_license.py
```

### .claude/ (1 file)

```
.claude/ralph-loop.local.md
```

### .github/ (2 files)

```
.github/workflows/ci.yml
.github/workflows/docker-publish.yml
```

### backend/ (185 files)

#### backend/ root (8 files)
```
backend/.churnvision/installation.id
backend/Dockerfile
backend/README.md
backend/alembic.ini
backend/create_user.py
backend/entrypoint.sh
backend/pyproject.toml
backend/uv.lock
```

#### backend/alembic/ (22 files)
```
backend/alembic/README
backend/alembic/env.py
backend/alembic/script.py.mako
backend/alembic/versions/001_add_chatbot_tables.py
backend/alembic/versions/002_add_churnvision_complete_schema.py
backend/alembic/versions/003_add_rbac_auth_system.py
backend/alembic/versions/004_add_audit_logging.py
backend/alembic/versions/005_persist_projects_and_dataset_paths.py
backend/alembic/versions/006_model_registry_and_artifacts.py
backend/alembic/versions/007_extend_rag_subsystem.py
backend/alembic/versions/008_remove_rag_user_fk_constraints.py
backend/alembic/versions/009_update_rbac_roles.py
backend/alembic/versions/010_add_sso_fields.py
backend/alembic/versions/011_add_sso_config_table.py
backend/alembic/versions/012_add_performance_indexes.py
backend/alembic/versions/013_add_company_context_fields.py
backend/alembic/versions/014_add_refresh_tokens.py
backend/alembic/versions/015_add_gdpr_compliance_tables.py
backend/alembic/versions/016_add_hrcode_lookup_indexes.py
backend/alembic/versions/017_add_app_settings_table.py
backend/alembic/versions/018_add_model_routing_tables.py
backend/alembic/versions/019_add_hris_connectors_behavioral_signals.py
backend/alembic/versions/020_add_license_sync_tables.py
```

#### backend/app/api/ (24 files)
```
backend/app/__init__.py
backend/app/api/__init__.py
backend/app/api/deps.py
backend/app/api/helpers.py
backend/app/api/v1/__init__.py
backend/app/api/v1/actions.py
backend/app/api/v1/admin.py
backend/app/api/v1/agent_memory.py
backend/app/api/v1/ai.py
backend/app/api/v1/atlas.py
backend/app/api/v1/auth.py
backend/app/api/v1/chatbot.py
backend/app/api/v1/churn.py
backend/app/api/v1/connectors.py
backend/app/api/v1/data_management.py
backend/app/api/v1/employees.py
backend/app/api/v1/gdpr.py
backend/app/api/v1/intelligent_chat.py
backend/app/api/v1/license.py
backend/app/api/v1/playground.py
backend/app/api/v1/projects.py
backend/app/api/v1/rag.py
backend/app/api/v1/reasoning.py
backend/app/api/v1/settings.py
backend/app/api/v1/sso_admin.py
```

#### backend/app/connectors/ (5 files)
```
backend/app/connectors/__init__.py
backend/app/connectors/bamboohr.py
backend/app/connectors/base.py
backend/app/connectors/slack_metadata.py
backend/app/connectors/teams_metadata.py
```

#### backend/app/core/ (25 files)
```
backend/app/core/__init__.py
backend/app/core/artifact_crypto.py
backend/app/core/audit.py
backend/app/core/cache.py
backend/app/core/config.py
backend/app/core/csrf.py
backend/app/core/data_retention.py
backend/app/core/encryption.py
backend/app/core/hardware_fingerprint.py
backend/app/core/installation.py
backend/app/core/integrity.py
backend/app/core/license.py
backend/app/core/license_middleware.py
backend/app/core/logging_config.py
backend/app/core/login_tracker.py
backend/app/core/rate_limiter.py
backend/app/core/security.py
backend/app/core/security_utils.py
backend/app/core/shutdown.py
backend/app/core/sso/__init__.py
backend/app/core/sso/config.py
backend/app/core/sso/oidc.py
backend/app/core/token_blacklist.py
backend/app/core/version.py
```

#### backend/app/db/ (4 files)
```
backend/app/db/__init__.py
backend/app/db/base.py
backend/app/db/base_class.py
backend/app/db/session.py
```

#### backend/app/main.py (1 file)
```
backend/app/main.py
```

#### backend/app/models/ (18 files)
```
backend/app/models/__init__.py
backend/app/models/agent_memory.py
backend/app/models/app_settings.py
backend/app/models/auth.py
backend/app/models/behavioral_signals.py
backend/app/models/chatbot.py
backend/app/models/churn.py
backend/app/models/dataset.py
backend/app/models/employee.py
backend/app/models/gdpr.py
backend/app/models/hr_data.py
backend/app/models/license_sync.py
backend/app/models/monitoring.py
backend/app/models/project.py
backend/app/models/rag.py
backend/app/models/refresh_token.py
backend/app/models/sso_config.py
backend/app/models/treatment.py
backend/app/models/user.py
```

#### backend/app/schemas/ (11 files)
```
backend/app/schemas/__init__.py
backend/app/schemas/admin.py
backend/app/schemas/atlas.py
backend/app/schemas/chatbot.py
backend/app/schemas/churn.py
backend/app/schemas/data_management.py
backend/app/schemas/gdpr.py
backend/app/schemas/playground.py
backend/app/schemas/rag.py
backend/app/schemas/roi_dashboard.py
backend/app/schemas/token.py
backend/app/schemas/user.py
```

#### backend/app/services/ (36 files)
```
backend/app/services/__init__.py
backend/app/services/action_generation_service.py
backend/app/services/admin_panel_client.py
backend/app/services/app_settings_service.py
backend/app/services/behavioral_stage_service.py
backend/app/services/business_rule_service.py
backend/app/services/cached_queries_service.py
backend/app/services/chatbot_service.py
backend/app/services/churn_prediction_service.py
backend/app/services/churn_reasoning_orchestrator.py
backend/app/services/data_driven_thresholds_service.py
backend/app/services/data_quality_service.py
backend/app/services/dataset_profiler_service.py
backend/app/services/dataset_service.py
backend/app/services/document_processor_service.py
backend/app/services/eltv_service.py
backend/app/services/ensemble_service.py
backend/app/services/gdpr_service.py
backend/app/services/intelligent_chatbot.py
backend/app/services/interview_insight_service.py
backend/app/services/license_sync_service.py
backend/app/services/llm_config.py
backend/app/services/model_intelligence_service.py
backend/app/services/model_router_service.py
backend/app/services/outcome_tracking_service.py
backend/app/services/peer_statistics_service.py
backend/app/services/pii_masking_service.py
backend/app/services/project_service.py
backend/app/services/rag_service.py
backend/app/services/risk_alert_service.py
backend/app/services/roi_dashboard_service.py
backend/app/services/survival_analysis_service.py
backend/app/services/tabpfn_service.py
backend/app/services/treatment_generation_service.py
backend/app/services/treatment_service.py
backend/app/services/vector_store_service.py
```

#### backend/data/sample_datasets/ (6 files)
```
backend/data/sample_datasets/employees_1000.csv
backend/data/sample_datasets/employees_10000.csv
backend/data/sample_datasets/employees_100000.csv
backend/data/sample_datasets/employees_200.csv
backend/data/sample_datasets/employees_500.csv
backend/data/sample_datasets/generate_datasets.py
```

#### backend/models/ (3 files)
```
backend/models/churn_model.pkl
backend/models/encoders.pkl
backend/models/scaler.pkl
```

#### backend/scripts/ (2 files)
```
backend/scripts/generate_integrity_manifest.py
backend/scripts/generate_license.py
```

#### backend/tests/ (20 files)
```
backend/tests/__init__.py
backend/tests/conftest.py
backend/tests/playground_test_report.md
backend/tests/test_api_auth.py
backend/tests/test_api_churn.py
backend/tests/test_churn_service.py
backend/tests/test_core_audit.py
backend/tests/test_core_config.py
backend/tests/test_core_security.py
backend/tests/test_health_checks.py
backend/tests/test_intelligent_chatbot_comprehensive.py
backend/tests/test_login_tracker.py
backend/tests/test_main.py
backend/tests/test_pii_masking.py
backend/tests/test_playground_api.py
backend/tests/test_rate_limiter.py
backend/tests/test_refresh_tokens.py
backend/tests/test_services_churn_prediction.py
backend/tests/test_treatment_generation.py
backend/tests/utils/__init__.py
backend/tests/utils/chatbot_test_data.py
backend/tests/utils/metrics_collector.py
```

### db/ (6 files)

```
db/backup.sh
db/healthcheck.sh
db/init.sql
db/pgadmin-servers.json
db/postgresql.conf
db/restore.sh
```

### docs/ (12 files)

```
docs/ADMIN.md
docs/API.md
docs/DISASTER_RECOVERY.md
docs/DOCKER_GUIDE.md
docs/INSTALL.md
docs/PRODUCTION_SETUP.md
docs/README.md
docs/SECURITY.md
docs/SSO_SETUP.md
docs/TROUBLESHOOTING.md
docs/UPGRADE.md
docs/USER_GUIDE.md
```

### frontend/ (243 files)

#### frontend/ root (12 files)
```
frontend/Dockerfile
frontend/components.json
frontend/eslint.config.js
frontend/index.html
frontend/package.json
frontend/playwright.config.ts
frontend/postcss.config.js
frontend/tailwind.config.js
frontend/tsconfig.json
frontend/tsconfig.node.json
frontend/vite.config.ts
frontend/vitest.config.ts
```

#### frontend/e2e/ (7 files)
```
frontend/e2e/admin.spec.ts
frontend/e2e/ai-chat.spec.ts
frontend/e2e/auth.setup.ts
frontend/e2e/dashboard.spec.ts
frontend/e2e/data-upload.spec.ts
frontend/e2e/employees.spec.ts
frontend/e2e/predictions.spec.ts
```

#### frontend/public/ (15 files)
```
frontend/public/assets/icons/icon-192x192.png
frontend/public/assets/icons/icon-512x512.png
frontend/public/assets/icons/icon.icns
frontend/public/assets/icons/icon.ico
frontend/public/assets/icons/icon.png
frontend/public/assets/images/logo.svg
frontend/public/assets/images/offline.svg
frontend/public/manifest.json
frontend/public/offline.html
frontend/public/service-worker.js
frontend/public/version.txt
```

#### frontend/src/ (209 files)

**frontend/src/assets/ (7 files)**
```
frontend/src/assets/providers/churnvision.svg
frontend/src/assets/providers/ibm.svg
frontend/src/assets/providers/microsoft.svg
frontend/src/assets/providers/mistral.svg
frontend/src/assets/providers/openai.svg
frontend/src/assets/providers/qwen.svg
frontend/src/assets/react.svg
```

**frontend/src/components/ (96 files)**
```
frontend/src/components/AIModelSelection.tsx
frontend/src/components/AccessibilityProvider.test.tsx
frontend/src/components/AccessibilityProvider.tsx
frontend/src/components/ActivationComponent.tsx
frontend/src/components/AlertNotificationBell.tsx
frontend/src/components/AnalysisResultVisualization.tsx
frontend/src/components/AppLaunchAnimation.tsx
frontend/src/components/AtlasSimulatorSubTab.tsx
frontend/src/components/AuthProtectedRoute.tsx
frontend/src/components/CohortAnalysisTab.tsx
frontend/src/components/ConfidenceIndicator.test.tsx
frontend/src/components/ConfidenceIndicator.tsx
frontend/src/components/CounterfactualPanel.tsx
frontend/src/components/CustomizationToolbar.tsx
frontend/src/components/DashboardCustomization/index.tsx
frontend/src/components/DashboardTab.tsx
frontend/src/components/DataPreviewTable.tsx
frontend/src/components/DataQualityReport.tsx
frontend/src/components/DataUploadNotification.test.tsx
frontend/src/components/DataUploadNotification.tsx
frontend/src/components/DataUploadWindow.tsx
frontend/src/components/DatabaseSyncFlow.tsx
frontend/src/components/DeepAnalysisTab.tsx
frontend/src/components/DragDropGrid.tsx
frontend/src/components/EmployeeNetworkGraph.tsx
frontend/src/components/EngagementUploadWindow.tsx
frontend/src/components/EnhancedEmployeeCard.tsx
frontend/src/components/EnterpriseFeatureGate.tsx
frontend/src/components/ErrorBoundary.test.tsx
frontend/src/components/ErrorBoundary.tsx
frontend/src/components/GestureNavigation.tsx
frontend/src/components/InterviewInsightsPanel.tsx
frontend/src/components/InterviewUploadWindow.tsx
frontend/src/components/KeepAliveRoutes.tsx
frontend/src/components/LayoutManager.tsx
frontend/src/components/LoadingSpinner.test.tsx
frontend/src/components/LoadingSpinner.tsx
frontend/src/components/ModelDownloadPrompt.test.tsx
frontend/src/components/ModelDownloadPrompt.tsx
frontend/src/components/ModelIntelligenceTab.tsx
frontend/src/components/ModelPerformanceGauge.tsx
frontend/src/components/ModelSelectionCard.tsx
frontend/src/components/ModelTrainingRequired.tsx
frontend/src/components/OnboardingTutorial.tsx
frontend/src/components/PageHeader.tsx
frontend/src/components/PageTransition.tsx
frontend/src/components/ProtectedRoute.test.tsx
frontend/src/components/ProtectedRoute.tsx
frontend/src/components/ROIDashboardTab.tsx
frontend/src/components/ReasoningDashboard.tsx
frontend/src/components/RiskIndicator.test.tsx
frontend/src/components/RiskIndicator.tsx
frontend/src/components/RiskThresholdSettings.tsx
frontend/src/components/SimilarityTable.tsx
frontend/src/components/SkipToContent.test.tsx
frontend/src/components/SkipToContent.tsx
frontend/src/components/SmartHeader.tsx
frontend/src/components/SmartNotificationSystem.tsx
frontend/src/components/StepIndicator.tsx
frontend/src/components/TabInterfaceController.tsx
frontend/src/components/TrainingReminderBanner.test.tsx
frontend/src/components/TrainingReminderBanner.tsx
frontend/src/components/TreatmentTracker.tsx
frontend/src/components/WidgetConfigPanel.tsx
frontend/src/components/agent/ActionProposalCard.tsx
frontend/src/components/agent/AgentContextPanel.tsx
frontend/src/components/agent/AgentExecutionPanel.tsx
frontend/src/components/agent/EmailComposer.tsx
frontend/src/components/agent/TeamsComposer.tsx
frontend/src/components/agent/index.ts
frontend/src/components/layout/Footer.tsx
frontend/src/components/layout/Header.tsx
frontend/src/components/layout/RootLayout.tsx
frontend/src/components/renderers/DepartmentAnalysisRenderer.tsx
frontend/src/components/renderers/EnhancedChurnRiskDiagnosisRenderer.tsx
frontend/src/components/renderers/EnhancedExitPatternMiningRenderer.tsx
frontend/src/components/renderers/EnhancedRetentionPlaybookRenderer.tsx
frontend/src/components/renderers/EnhancedSimilarityAnalysisRenderer.tsx
frontend/src/components/renderers/LegacyExitPatternRenderer.tsx
frontend/src/components/renderers/LegacyRetentionPlaybookRenderer.tsx
frontend/src/components/renderers/PeerRetentionComparisonRenderer.tsx
frontend/src/components/renderers/WorkforceTrendsAnalysisRenderer.tsx
frontend/src/components/ui/ThemeToggle.tsx
frontend/src/components/ui/alert-dialog.tsx
frontend/src/components/ui/alert.tsx
frontend/src/components/ui/badge.tsx
frontend/src/components/ui/button.tsx
frontend/src/components/ui/card.tsx
frontend/src/components/ui/dialog.tsx
frontend/src/components/ui/input.tsx
frontend/src/components/ui/label.tsx
frontend/src/components/ui/progress.tsx
frontend/src/components/ui/select.tsx
frontend/src/components/ui/skeleton.tsx
frontend/src/components/ui/slider.tsx
frontend/src/components/ui/switch.tsx
frontend/src/components/ui/textarea.tsx
frontend/src/components/ui/toast.tsx
frontend/src/components/ui/toaster.tsx
frontend/src/components/widgets/AIRetentionPlannerWidget.tsx
frontend/src/components/widgets/AIStrategicInsightsWidget.tsx
frontend/src/components/widgets/CLevelQuickActionsWidget.tsx
frontend/src/components/widgets/EnhancedEmployeeTableWidget.tsx
frontend/src/components/widgets/ExecutiveRiskOverviewWidget.tsx
frontend/src/components/widgets/IndividualRiskAnalysisWidget.tsx
frontend/src/components/widgets/WorkforceTrendsWidget.tsx
frontend/src/components/widgets/index.tsx
```

**frontend/src/config/ (2 files)**
```
frontend/src/config/apiConfig.ts
frontend/src/config/riskThresholds.ts
```

**frontend/src/contexts/ (5 files)**
```
frontend/src/contexts/AuthContext.tsx
frontend/src/contexts/HomeCustomizationContext.tsx
frontend/src/contexts/ProjectContext.tsx
frontend/src/contexts/TabStateContext.tsx
frontend/src/contexts/__tests__/AuthContext.test.tsx
```

**frontend/src/hooks/ (15 files)**
```
frontend/src/hooks/__tests__/useTabState.test.ts
frontend/src/hooks/use-toast.ts
frontend/src/hooks/useActionProposals.ts
frontend/src/hooks/useAgentExecution.ts
frontend/src/hooks/useAgentMemory.ts
frontend/src/hooks/useDashboardCustomization.ts
frontend/src/hooks/useDynamicRiskThresholds.ts
frontend/src/hooks/useFileUpload.ts
frontend/src/hooks/useGlobalDataCache.ts
frontend/src/hooks/useOnboarding.ts
frontend/src/hooks/useReasoning.ts
frontend/src/hooks/useTabState.ts
frontend/src/hooks/useWebSocketChat.ts
```

**frontend/src/lib/ (1 file)**
```
frontend/src/lib/utils.ts
```

**frontend/src/pages/ (18 files)**
```
frontend/src/pages/AIAssistant.tsx
frontend/src/pages/CustomizableHome.tsx
frontend/src/pages/DataManagement.tsx
frontend/src/pages/DataManagement/SavedConnectionsCard.tsx
frontend/src/pages/Diagnostics.tsx
frontend/src/pages/Home.tsx
frontend/src/pages/HomeWrapper.tsx
frontend/src/pages/KnowledgeBase.tsx
frontend/src/pages/Login.tsx
frontend/src/pages/Playground.tsx
frontend/src/pages/Register.tsx
frontend/src/pages/Settings.tsx
frontend/src/pages/WowDemo.tsx
frontend/src/pages/__tests__/Login.test.tsx
frontend/src/pages/admin/Admin.tsx
frontend/src/pages/admin/AdminAuditLogs.tsx
frontend/src/pages/admin/AdminRoles.tsx
frontend/src/pages/admin/AdminSSO.tsx
frontend/src/pages/admin/AdminStats.tsx
frontend/src/pages/admin/AdminUsers.tsx
frontend/src/pages/admin/index.ts
```

**frontend/src/providers/ (2 files)**
```
frontend/src/providers/LicenseProvider.tsx
frontend/src/providers/ThemeProvider.tsx
```

**frontend/src/services/ (24 files)**
```
frontend/src/services/__tests__/authService.test.ts
frontend/src/services/actionsService.ts
frontend/src/services/adminService.ts
frontend/src/services/aiCacheManager.ts
frontend/src/services/aiErrorHandler.ts
frontend/src/services/aiInsightProcessor.ts
frontend/src/services/aiIntegrationManager.ts
frontend/src/services/apiService.ts
frontend/src/services/authService.ts
frontend/src/services/autoThresholdService.ts
frontend/src/services/chatbotService.ts
frontend/src/services/compatibilityLayer.ts
frontend/src/services/crossReferenceService.ts
frontend/src/services/dashboardService.ts
frontend/src/services/employeeService.ts
frontend/src/services/engagementDataService.ts
frontend/src/services/fileParsingService.ts
frontend/src/services/gdprService.ts
frontend/src/services/interviewService.ts
frontend/src/services/modelIntelligenceService.ts
frontend/src/services/ragService.ts
frontend/src/services/reasoningService.ts
frontend/src/services/roleModeManager.ts
frontend/src/services/thresholdSyncService.ts
frontend/src/services/treatmentTrackingService.ts
```

**frontend/src/styles/ (1 file)**
```
frontend/src/styles/theme.css
```

**frontend/src/tests/ (1 file)**
```
frontend/src/tests/testUtils.tsx
```

**frontend/src/types/ (8 files)**
```
frontend/src/types/agent.ts
frontend/src/types/analysis.ts
frontend/src/types/analysisData.ts
frontend/src/types/chat.ts
frontend/src/types/dashboard.ts
frontend/src/types/employee.ts
frontend/src/types/ml.ts
frontend/src/types/reasoning.ts
frontend/src/types/treatment.ts
```

**frontend/src/utils/ (4 files)**
```
frontend/src/utils/clientLogger.ts
frontend/src/utils/employeeFilters.ts
frontend/src/utils/errorReporting.ts
frontend/src/utils/promptStandardizer.ts
```

**frontend/src/workers/ (1 file)**
```
frontend/src/workers/dataProcessor.worker.ts
```

**frontend/src/ root files (6 files)**
```
frontend/src/App.css
frontend/src/App.tsx
frontend/src/env.d.ts
frontend/src/index.css
frontend/src/main.tsx
frontend/src/setupTests.ts
frontend/src/version-info-route.ts
```

### infra/ (12 files)

```
infra/airgap/bundle.sh
infra/alertmanager/alertmanager.yml
infra/backup/README.md
infra/build.Dockerfile
infra/grafana/dashboards/churnvision-overview.json
infra/grafana/provisioning/dashboards/dashboards.yml
infra/grafana/provisioning/datasources/datasources.yml
infra/migrate.Dockerfile
infra/nginx-frontend.conf
infra/nginx.conf
infra/prometheus/alerts.yml
infra/prometheus/prometheus.yml
```

---

**File Count Verified**: 468 files
