# ChurnVision Enterprise - Secure Build with Nuitka
# This Dockerfile compiles Python source code to C binaries for IP protection

FROM python:3.11-slim as builder

# Install system dependencies for Nuitka
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    ccache \
    patchelf \
    && rm -rf /var/lib/apt/lists/*

# Install uv for fast dependency management
RUN pip install uv

# Set working directory
WORKDIR /app

# Copy backend code
COPY backend/ /app/backend/
COPY pyproject.toml /app/

# Install dependencies
RUN cd /app && uv pip install --system -e .

# Install Nuitka
RUN pip install nuitka ordered-set

# Generate integrity manifest (and optional signature)
RUN INTEGRITY_MANIFEST_OUT=/build/integrity.json \
    INTEGRITY_SIGNATURE_OUT=/build/integrity.sig \
    python /app/backend/scripts/generate_integrity_manifest.py

# Compile Python to C binaries using Nuitka
RUN python -m nuitka \
    --standalone \
    --follow-imports \
    --include-package=app \
    --include-package=sqlalchemy \
    --include-package=fastapi \
    --include-package=pydantic \
    --include-package=sklearn \
    --include-package=xgboost \
    --include-package=langchain \
    --output-dir=/build \
    --output-filename=churnvision-backend \
    --remove-output \
    --assume-yes-for-downloads \
    backend/app/main.py

# Production stage
FROM python:3.11-slim

# Install runtime dependencies only
RUN apt-get update && apt-get install -y \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN useradd -m -u 1000 churnvision

# Set working directory
WORKDIR /app

# Copy compiled binaries from builder
COPY --from=builder /build/churnvision-backend.dist /app/
COPY --from=builder /build/integrity.json /etc/churnvision/integrity.json
COPY --from=builder /build/integrity.sig /etc/churnvision/integrity.sig

# Copy models directory (will be mounted in production)
RUN mkdir -p /app/models && chown -R churnvision:churnvision /app

# Switch to non-root user
USER churnvision

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD ["/app/churnvision-backend", "--health-check"]

# Run the compiled binary
CMD ["/app/churnvision-backend"]
