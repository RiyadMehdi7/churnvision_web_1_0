-- ChurnVision Enterprise - PostgreSQL Initialization Script
-- This script is executed when the database is first created
-- It sets up the database, extensions, and initial configuration

-- Enable required PostgreSQL extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";      -- For UUID generation
CREATE EXTENSION IF NOT EXISTS "pg_trgm";        -- For text search and similarity
CREATE EXTENSION IF NOT EXISTS "btree_gin";      -- For multi-column indexes
CREATE EXTENSION IF NOT EXISTS "pgcrypto";       -- For encryption functions

-- Create custom types
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'risk_level') THEN
        CREATE TYPE risk_level AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'churn_status') THEN
        CREATE TYPE churn_status AS ENUM ('ACTIVE', 'AT_RISK', 'CHURNED', 'RETAINED');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'model_status') THEN
        CREATE TYPE model_status AS ENUM ('TRAINING', 'ACTIVE', 'DEPRECATED', 'FAILED');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'treatment_status') THEN
        CREATE TYPE treatment_status AS ENUM ('PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');
    END IF;
END $$;

-- Create schemas for organization
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS hr_data;
CREATE SCHEMA IF NOT EXISTS ml_models;
CREATE SCHEMA IF NOT EXISTS treatments;
CREATE SCHEMA IF NOT EXISTS audit;

-- Grant permissions
GRANT USAGE ON SCHEMA auth TO PUBLIC;
GRANT USAGE ON SCHEMA hr_data TO PUBLIC;
GRANT USAGE ON SCHEMA ml_models TO PUBLIC;
GRANT USAGE ON SCHEMA treatments TO PUBLIC;
GRANT USAGE ON SCHEMA audit TO PUBLIC;

-- Create audit log function
CREATE OR REPLACE FUNCTION audit.log_changes()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'DELETE') THEN
        INSERT INTO audit.audit_log (
            table_name,
            operation,
            old_data,
            changed_at,
            changed_by
        )
        VALUES (
            TG_TABLE_NAME,
            TG_OP,
            row_to_json(OLD),
            NOW(),
            current_user
        );
        RETURN OLD;
    ELSIF (TG_OP = 'UPDATE') THEN
        INSERT INTO audit.audit_log (
            table_name,
            operation,
            old_data,
            new_data,
            changed_at,
            changed_by
        )
        VALUES (
            TG_TABLE_NAME,
            TG_OP,
            row_to_json(OLD),
            row_to_json(NEW),
            NOW(),
            current_user
        );
        RETURN NEW;
    ELSIF (TG_OP = 'INSERT') THEN
        INSERT INTO audit.audit_log (
            table_name,
            operation,
            new_data,
            changed_at,
            changed_by
        )
        VALUES (
            TG_TABLE_NAME,
            TG_OP,
            row_to_json(NEW),
            NOW(),
            current_user
        );
        RETURN NEW;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create partitioned audit log table for performance
CREATE TABLE IF NOT EXISTS audit.audit_log (
    id BIGSERIAL,
    table_name TEXT NOT NULL,
    operation TEXT NOT NULL,
    old_data JSONB,
    new_data JSONB,
    changed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    changed_by TEXT NOT NULL DEFAULT current_user,
    PRIMARY KEY (id, changed_at)
) PARTITION BY RANGE (changed_at);

-- Create audit log partitions for the next 12 months
DO $$
DECLARE
    start_date DATE := DATE_TRUNC('month', CURRENT_DATE);
    end_date DATE;
    partition_name TEXT;
BEGIN
    FOR i IN 0..11 LOOP
        end_date := start_date + INTERVAL '1 month';
        partition_name := 'audit_log_' || TO_CHAR(start_date, 'YYYY_MM');

        EXECUTE format(
            'CREATE TABLE IF NOT EXISTS audit.%I PARTITION OF audit.audit_log
             FOR VALUES FROM (%L) TO (%L)',
            partition_name,
            start_date,
            end_date
        );

        start_date := end_date;
    END LOOP;
END $$;

-- Create index on audit log
CREATE INDEX IF NOT EXISTS idx_audit_log_table_name ON audit.audit_log(table_name);
CREATE INDEX IF NOT EXISTS idx_audit_log_changed_at ON audit.audit_log(changed_at);
CREATE INDEX IF NOT EXISTS idx_audit_log_operation ON audit.audit_log(operation);

-- Create function to automatically create new audit log partitions
CREATE OR REPLACE FUNCTION audit.create_next_month_partition()
RETURNS void AS $$
DECLARE
    start_date DATE;
    end_date DATE;
    partition_name TEXT;
BEGIN
    start_date := DATE_TRUNC('month', CURRENT_DATE + INTERVAL '1 month');
    end_date := start_date + INTERVAL '1 month';
    partition_name := 'audit_log_' || TO_CHAR(start_date, 'YYYY_MM');

    EXECUTE format(
        'CREATE TABLE IF NOT EXISTS audit.%I PARTITION OF audit.audit_log
         FOR VALUES FROM (%L) TO (%L)',
        partition_name,
        start_date,
        end_date
    );

    RAISE NOTICE 'Created audit partition: %', partition_name;
END;
$$ LANGUAGE plpgsql;

-- Create materialized view for employee risk summary
CREATE MATERIALIZED VIEW IF NOT EXISTS hr_data.employee_risk_summary AS
SELECT
    e.id as employee_id,
    e.full_name,
    e.department,
    e.role,
    co.risk_score,
    co.risk_level,
    co.predicted_at,
    COUNT(ta.id) as active_treatments
FROM employee e
LEFT JOIN churnoutput co ON e.id = co.employee_id
    AND co.predicted_at = (
        SELECT MAX(predicted_at)
        FROM churnoutput
        WHERE employee_id = e.id
    )
LEFT JOIN treatmentapplication ta ON e.id = ta.employee_id
    AND ta.status = 'IN_PROGRESS'
WHERE e.is_active = true
GROUP BY e.id, e.full_name, e.department, e.role, co.risk_score, co.risk_level, co.predicted_at;

-- Create index on materialized view
CREATE UNIQUE INDEX IF NOT EXISTS idx_employee_risk_summary_employee_id
ON hr_data.employee_risk_summary(employee_id);

CREATE INDEX IF NOT EXISTS idx_employee_risk_summary_risk_level
ON hr_data.employee_risk_summary(risk_level);

-- Create function to refresh materialized view
CREATE OR REPLACE FUNCTION hr_data.refresh_employee_risk_summary()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY hr_data.employee_risk_summary;
    RAISE NOTICE 'Employee risk summary refreshed at %', NOW();
END;
$$ LANGUAGE plpgsql;

-- Database configuration for optimal performance
ALTER DATABASE churnvision SET timezone TO 'UTC';
ALTER DATABASE churnvision SET statement_timeout TO '30s';
ALTER DATABASE churnvision SET idle_in_transaction_session_timeout TO '60s';

-- Comments for documentation
COMMENT ON SCHEMA auth IS 'Authentication and authorization related tables';
COMMENT ON SCHEMA hr_data IS 'HR data, employee information, and snapshots';
COMMENT ON SCHEMA ml_models IS 'Machine learning models, training jobs, and predictions';
COMMENT ON SCHEMA treatments IS 'Treatment definitions, applications, and effectiveness tracking';
COMMENT ON SCHEMA audit IS 'Audit logging and compliance tracking';

COMMENT ON TABLE audit.audit_log IS 'Comprehensive audit log for all data changes';
COMMENT ON MATERIALIZED VIEW hr_data.employee_risk_summary IS 'Real-time summary of employee churn risk with treatment status';

-- Grant appropriate permissions (these will be managed by Alembic migrations)
-- This is just for initial setup

-- Success message
DO $$
BEGIN
    RAISE NOTICE '=================================================================';
    RAISE NOTICE 'ChurnVision Enterprise Database Initialized Successfully';
    RAISE NOTICE 'Database: churnvision';
    RAISE NOTICE 'Extensions: uuid-ossp, pg_trgm, btree_gin, pgcrypto';
    RAISE NOTICE 'Schemas: auth, hr_data, ml_models, treatments, audit';
    RAISE NOTICE '=================================================================';
END $$;
