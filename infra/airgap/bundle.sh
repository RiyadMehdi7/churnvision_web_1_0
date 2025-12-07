#!/bin/bash
#
# ChurnVision Enterprise - Air-Gap Bundle Creator
#
# This script creates a complete offline installation package that can be
# transferred to air-gapped environments with no internet access.
#
# The bundle includes:
# - All Docker images (saved as tar files)
# - Ollama models
# - Application source/config files
# - Installation scripts
# - Documentation
#
# Usage:
#   ./bundle.sh [version]
#
# Example:
#   ./bundle.sh 1.0.0
#

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
VERSION="${1:-$(date +%Y%m%d)}"
BUNDLE_NAME="churnvision-enterprise-${VERSION}"
OUTPUT_DIR="${PROJECT_ROOT}/dist"
BUNDLE_DIR="${OUTPUT_DIR}/${BUNDLE_NAME}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() { echo -e "${GREEN}[$(date +'%H:%M:%S')]${NC} $1"; }
warn() { echo -e "${YELLOW}[$(date +'%H:%M:%S')] WARNING:${NC} $1"; }
error() { echo -e "${RED}[$(date +'%H:%M:%S')] ERROR:${NC} $1" >&2; }
info() { echo -e "${BLUE}[$(date +'%H:%M:%S')]${NC} $1"; }

# Docker images to include
IMAGES=(
    "postgres:15-alpine"
    "redis:7-alpine"
    "ollama/ollama:latest"
    "nginx:alpine"
)

# Ollama models to include
OLLAMA_MODELS=(
    "qwen2.5:3b"
)

# Cleanup on exit
cleanup() {
    if [ -d "$BUNDLE_DIR" ] && [ "${KEEP_TEMP:-false}" != "true" ]; then
        log "Cleaning up temporary files..."
    fi
}
trap cleanup EXIT

# Check prerequisites
check_prerequisites() {
    log "Checking prerequisites..."

    local missing=()

    if ! command -v docker &> /dev/null; then
        missing+=("docker")
    fi

    if ! command -v tar &> /dev/null; then
        missing+=("tar")
    fi

    if [ ${#missing[@]} -ne 0 ]; then
        error "Missing required tools: ${missing[*]}"
        exit 1
    fi

    # Check Docker is running
    if ! docker info &> /dev/null; then
        error "Docker daemon is not running"
        exit 1
    fi

    log "Prerequisites check passed"
}

# Create bundle directory structure
create_bundle_structure() {
    log "Creating bundle structure..."

    rm -rf "$BUNDLE_DIR"
    mkdir -p "$BUNDLE_DIR"/{images,models,config,scripts,docs}

    log "Bundle directory created: $BUNDLE_DIR"
}

# Build application images
build_app_images() {
    log "Building application Docker images..."

    cd "$PROJECT_ROOT"

    # Build backend
    log "Building backend image..."
    docker build -t churnvision/backend:${VERSION} -f backend/Dockerfile backend/
    IMAGES+=("churnvision/backend:${VERSION}")

    # Build frontend
    log "Building frontend image..."
    docker build -t churnvision/frontend:${VERSION} -f frontend/Dockerfile frontend/
    IMAGES+=("churnvision/frontend:${VERSION}")

    log "Application images built successfully"
}

# Save Docker images
save_docker_images() {
    log "Saving Docker images..."

    local images_file="$BUNDLE_DIR/images/all-images.tar"

    # Pull external images first
    for image in "${IMAGES[@]}"; do
        if [[ ! "$image" == churnvision/* ]]; then
            log "Pulling image: $image"
            docker pull "$image" || warn "Failed to pull $image, skipping..."
        fi
    done

    # Save all images to a single tar file
    log "Saving ${#IMAGES[@]} images to $images_file"
    docker save "${IMAGES[@]}" -o "$images_file"

    # Compress
    log "Compressing images..."
    gzip -9 "$images_file"

    local size=$(du -h "$images_file.gz" | cut -f1)
    log "Images saved: $images_file.gz ($size)"
}

# Export Ollama models
export_ollama_models() {
    log "Exporting Ollama models..."

    # Check if Ollama is running
    if ! docker ps --format '{{.Names}}' | grep -q ollama; then
        warn "Ollama container not running, starting temporarily..."
        docker run -d --name ollama-temp -v ollama_data:/root/.ollama ollama/ollama:latest
        sleep 5
    fi

    for model in "${OLLAMA_MODELS[@]}"; do
        log "Pulling model: $model"
        docker exec ollama-temp ollama pull "$model" 2>/dev/null || \
            docker exec ollama ollama pull "$model" 2>/dev/null || \
            warn "Could not pull model $model"
    done

    # Export Ollama data volume
    log "Exporting Ollama models volume..."
    docker run --rm \
        -v ollama_data:/data:ro \
        -v "$BUNDLE_DIR/models":/backup \
        alpine tar czf /backup/ollama-models.tar.gz -C /data .

    # Cleanup temp container
    docker rm -f ollama-temp 2>/dev/null || true

    log "Ollama models exported"
}

# Copy configuration files
copy_config_files() {
    log "Copying configuration files..."

    cd "$PROJECT_ROOT"

    # Docker compose files
    cp docker-compose.yml "$BUNDLE_DIR/config/"
    cp docker-compose.prod.yml "$BUNDLE_DIR/config/"

    # Environment template
    cp .env.production.template "$BUNDLE_DIR/config/"

    # Nginx configuration
    cp infra/nginx.conf "$BUNDLE_DIR/config/"

    # Database scripts
    mkdir -p "$BUNDLE_DIR/scripts/db"
    cp db/backup.sh "$BUNDLE_DIR/scripts/db/"
    cp db/restore.sh "$BUNDLE_DIR/scripts/db/"

    log "Configuration files copied"
}

# Copy documentation
copy_documentation() {
    log "Copying documentation..."

    cd "$PROJECT_ROOT"

    cp -r docs/* "$BUNDLE_DIR/docs/" 2>/dev/null || mkdir -p "$BUNDLE_DIR/docs"
    cp README.md "$BUNDLE_DIR/docs/" 2>/dev/null || true

    log "Documentation copied"
}

# Create installation script for air-gapped environment
create_install_script() {
    log "Creating installation script..."

    cat > "$BUNDLE_DIR/install.sh" << 'INSTALL_SCRIPT'
#!/bin/bash
#
# ChurnVision Enterprise - Air-Gap Installation Script
#
# This script installs ChurnVision in an air-gapped environment
# from the bundled package.
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

log() { echo -e "${GREEN}[$(date +'%H:%M:%S')]${NC} $1"; }
error() { echo -e "${RED}[$(date +'%H:%M:%S')] ERROR:${NC} $1" >&2; }

# Check prerequisites
check_prerequisites() {
    log "Checking prerequisites..."

    if ! command -v docker &> /dev/null; then
        error "Docker is not installed"
        exit 1
    fi

    if ! docker info &> /dev/null; then
        error "Docker daemon is not running"
        exit 1
    fi

    log "Prerequisites check passed"
}

# Load Docker images
load_images() {
    log "Loading Docker images..."

    local images_file="$SCRIPT_DIR/images/all-images.tar.gz"

    if [ ! -f "$images_file" ]; then
        error "Images file not found: $images_file"
        exit 1
    fi

    log "Decompressing and loading images (this may take several minutes)..."
    gunzip -c "$images_file" | docker load

    log "Docker images loaded successfully"
}

# Import Ollama models
import_ollama_models() {
    log "Importing Ollama models..."

    local models_file="$SCRIPT_DIR/models/ollama-models.tar.gz"

    if [ ! -f "$models_file" ]; then
        log "No Ollama models to import"
        return
    fi

    # Create volume if it doesn't exist
    docker volume create ollama_data 2>/dev/null || true

    # Import models
    docker run --rm \
        -v ollama_data:/data \
        -v "$SCRIPT_DIR/models":/backup:ro \
        alpine tar xzf /backup/ollama-models.tar.gz -C /data

    log "Ollama models imported"
}

# Setup configuration
setup_config() {
    log "Setting up configuration..."

    local install_dir="/opt/churnvision"

    mkdir -p "$install_dir"

    # Copy configuration files
    cp "$SCRIPT_DIR/config/docker-compose.prod.yml" "$install_dir/"
    cp "$SCRIPT_DIR/config/.env.production.template" "$install_dir/.env"
    cp "$SCRIPT_DIR/config/nginx.conf" "$install_dir/"

    # Copy scripts
    mkdir -p "$install_dir/db"
    cp "$SCRIPT_DIR/scripts/db/"* "$install_dir/db/"
    chmod +x "$install_dir/db/"*.sh

    # Copy documentation
    mkdir -p "$install_dir/docs"
    cp -r "$SCRIPT_DIR/docs/"* "$install_dir/docs/"

    log "Configuration files installed to $install_dir"
    echo ""
    log "IMPORTANT: Edit $install_dir/.env before starting services"
    log "Required changes:"
    log "  - Set POSTGRES_PASSWORD"
    log "  - Set JWT_SECRET_KEY (use: openssl rand -hex 32)"
    log "  - Set LICENSE_KEY"
    log "  - Update FRONTEND_URL and ALLOWED_ORIGINS"
}

# Main installation
main() {
    echo "========================================"
    echo "ChurnVision Enterprise - Air-Gap Install"
    echo "========================================"
    echo ""

    check_prerequisites
    load_images
    import_ollama_models
    setup_config

    echo ""
    echo "========================================"
    log "Installation complete!"
    echo "========================================"
    echo ""
    echo "Next steps:"
    echo "  1. Edit /opt/churnvision/.env"
    echo "  2. cd /opt/churnvision"
    echo "  3. docker compose -f docker-compose.prod.yml up -d"
    echo "  4. docker compose exec backend alembic upgrade head"
    echo ""
    echo "For detailed instructions, see: /opt/churnvision/docs/INSTALL.md"
}

main "$@"
INSTALL_SCRIPT

    chmod +x "$BUNDLE_DIR/install.sh"
    log "Installation script created"
}

# Create bundle manifest
create_manifest() {
    log "Creating bundle manifest..."

    cat > "$BUNDLE_DIR/MANIFEST.txt" << EOF
ChurnVision Enterprise - Air-Gap Bundle
========================================
Version: ${VERSION}
Created: $(date -u +"%Y-%m-%d %H:%M:%S UTC")
Bundle: ${BUNDLE_NAME}

Contents:
---------
images/          - Docker images (compressed)
models/          - Ollama LLM models
config/          - Configuration files
scripts/         - Utility scripts
docs/            - Documentation
install.sh       - Installation script

Included Docker Images:
-----------------------
$(printf '%s\n' "${IMAGES[@]}")

Included Ollama Models:
-----------------------
$(printf '%s\n' "${OLLAMA_MODELS[@]}")

Installation:
-------------
1. Transfer this bundle to the target server
2. Extract: tar -xzf ${BUNDLE_NAME}.tar.gz
3. Run: cd ${BUNDLE_NAME} && ./install.sh
4. Follow post-install steps in docs/INSTALL.md

Checksums:
----------
$(cd "$BUNDLE_DIR" && find . -type f -name "*.tar.gz" -exec sha256sum {} \;)

EOF

    log "Manifest created"
}

# Create final bundle archive
create_archive() {
    log "Creating final bundle archive..."

    cd "$OUTPUT_DIR"

    # Create tarball
    tar -czf "${BUNDLE_NAME}.tar.gz" "${BUNDLE_NAME}"

    # Create checksum
    sha256sum "${BUNDLE_NAME}.tar.gz" > "${BUNDLE_NAME}.tar.gz.sha256"

    local size=$(du -h "${BUNDLE_NAME}.tar.gz" | cut -f1)

    log "Bundle created: ${OUTPUT_DIR}/${BUNDLE_NAME}.tar.gz ($size)"
    log "Checksum: ${OUTPUT_DIR}/${BUNDLE_NAME}.tar.gz.sha256"
}

# Main execution
main() {
    echo ""
    echo "========================================"
    echo "ChurnVision Enterprise - Bundle Creator"
    echo "========================================"
    echo "Version: ${VERSION}"
    echo "Output:  ${OUTPUT_DIR}/${BUNDLE_NAME}.tar.gz"
    echo "========================================"
    echo ""

    check_prerequisites
    create_bundle_structure
    build_app_images
    save_docker_images
    export_ollama_models
    copy_config_files
    copy_documentation
    create_install_script
    create_manifest
    create_archive

    echo ""
    echo "========================================"
    log "Bundle creation complete!"
    echo "========================================"
    echo ""
    echo "Transfer ${BUNDLE_NAME}.tar.gz to the air-gapped environment"
    echo "and run ./install.sh to install."
    echo ""
}

main "$@"
