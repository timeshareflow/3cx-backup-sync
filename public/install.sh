#!/bin/bash
# =============================================================================
# 3CX BackupWiz - Sync Agent Installer
# =============================================================================
# This script installs and configures the sync agent on a 3CX server.
# It auto-detects 3CX database credentials and file paths.
#
# Usage: curl -fsSL https://3cxbackupwiz.com/install.sh | sudo bash -s -- --token=YOUR_TOKEN
# =============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
INSTALL_DIR="/opt/3cx-backupwiz"
SERVICE_NAME="3cx-backupwiz"
REPO_URL="https://github.com/timeshareflow/3cx-backup-sync.git"
API_URL="https://3cxbackupwiz.com/api"
MIN_NODE_VERSION=18

# Parse arguments
TOKEN=""
FORCE_REINSTALL=false
SKIP_AUTODETECT=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --token=*)
            TOKEN="${1#*=}"
            shift
            ;;
        --force)
            FORCE_REINSTALL=true
            shift
            ;;
        --skip-autodetect)
            SKIP_AUTODETECT=true
            shift
            ;;
        --help)
            echo "Usage: $0 --token=YOUR_TOKEN [--force] [--skip-autodetect]"
            echo ""
            echo "Options:"
            echo "  --token=TOKEN     Required. Your tenant API token from the dashboard."
            echo "  --force           Force reinstall even if already installed."
            echo "  --skip-autodetect Skip auto-detection of 3CX settings."
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            exit 1
            ;;
    esac
done

# Helper functions
log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Check if running as root
check_root() {
    if [[ $EUID -ne 0 ]]; then
        log_error "This script must be run as root (use sudo)"
        exit 1
    fi
}

# Check if token is provided
check_token() {
    if [[ -z "$TOKEN" ]]; then
        log_error "Token is required. Usage: $0 --token=YOUR_TOKEN"
        log_info "Get your token from: https://3cxbackupwiz.com/admin/settings"
        exit 1
    fi
}

# Detect OS
detect_os() {
    if [[ -f /etc/debian_version ]]; then
        OS="debian"
        PKG_MANAGER="apt-get"
    elif [[ -f /etc/redhat-release ]]; then
        OS="redhat"
        PKG_MANAGER="yum"
    else
        log_error "Unsupported operating system"
        exit 1
    fi
    log_info "Detected OS: $OS"
}

# Check if 3CX is installed
check_3cx_installed() {
    if [[ ! -d "/var/lib/3cxpbx" ]]; then
        log_error "3CX installation not found at /var/lib/3cxpbx"
        log_info "This script must be run on a server with 3CX installed."
        exit 1
    fi
    log_success "3CX installation detected"
}

# Find 3CX instance directory
find_3cx_instance() {
    # 3CX can have multiple instances, find the first one
    INSTANCE_DIR=""
    for dir in /var/lib/3cxpbx/Instance*/; do
        if [[ -d "$dir" ]]; then
            INSTANCE_DIR="${dir%/}"
            break
        fi
    done

    if [[ -z "$INSTANCE_DIR" ]]; then
        log_error "No 3CX instance found"
        exit 1
    fi

    log_info "Found 3CX instance: $INSTANCE_DIR"
}

# Auto-detect 3CX database password
detect_db_password() {
    log_info "Detecting 3CX database credentials..."

    DB_PASSWORD=""

    # Method 1: Check 3CXPhoneSystem.ini
    INI_FILE="$INSTANCE_DIR/Bin/3CXPhoneSystem.ini"
    if [[ -f "$INI_FILE" ]]; then
        DB_PASSWORD=$(grep -i "PostgreSQLPassword" "$INI_FILE" 2>/dev/null | cut -d'=' -f2 | tr -d ' \r\n' || true)
    fi

    # Method 2: Check environment files
    if [[ -z "$DB_PASSWORD" ]]; then
        for envfile in "$INSTANCE_DIR/Bin/.env" "$INSTANCE_DIR/etc/postgres.conf"; do
            if [[ -f "$envfile" ]]; then
                DB_PASSWORD=$(grep -i "password" "$envfile" 2>/dev/null | head -1 | cut -d'=' -f2 | tr -d ' \r\n"' || true)
                [[ -n "$DB_PASSWORD" ]] && break
            fi
        done
    fi

    # Method 3: Check pg_hba.conf for trust authentication (local connections)
    if [[ -z "$DB_PASSWORD" ]]; then
        PG_HBA="/var/lib/3cxpbx/PostgreSQL/data/pg_hba.conf"
        if [[ -f "$PG_HBA" ]] && grep -q "trust" "$PG_HBA"; then
            # Local trust auth - try connecting without password
            if command -v psql &> /dev/null; then
                if psql -h 127.0.0.1 -U phonesystem -d database_single -c "SELECT 1" &> /dev/null; then
                    DB_PASSWORD="__TRUST_AUTH__"
                    log_info "Database uses trust authentication for local connections"
                fi
            fi
        fi
    fi

    # Method 4: Try common 3CX default passwords
    if [[ -z "$DB_PASSWORD" ]]; then
        for pw in "phonesystem" "3cx" "postgres"; do
            if PGPASSWORD="$pw" psql -h 127.0.0.1 -U phonesystem -d database_single -c "SELECT 1" &> /dev/null 2>&1; then
                DB_PASSWORD="$pw"
                log_info "Found working password"
                break
            fi
        done
    fi

    if [[ -z "$DB_PASSWORD" ]]; then
        log_warn "Could not auto-detect database password"
        log_info "Please enter the 3CX PostgreSQL password manually:"
        read -s -p "Password: " DB_PASSWORD
        echo ""
    else
        log_success "Database credentials detected"
    fi
}

# Detect file paths
detect_file_paths() {
    log_info "Detecting 3CX file paths..."

    RECORDINGS_PATH="$INSTANCE_DIR/Data/Recordings"
    VOICEMAIL_PATH="$INSTANCE_DIR/Data/Voicemail"
    CHAT_FILES_PATH="$INSTANCE_DIR/Data/Http/Files/Chat Files"
    FAX_PATH="$INSTANCE_DIR/Data/Fax"
    MEETINGS_PATH="$INSTANCE_DIR/Data/Http/Recordings"

    # Verify paths exist
    [[ -d "$RECORDINGS_PATH" ]] && log_success "Recordings path: $RECORDINGS_PATH" || log_warn "Recordings path not found: $RECORDINGS_PATH"
    [[ -d "$VOICEMAIL_PATH" ]] && log_success "Voicemail path: $VOICEMAIL_PATH" || log_warn "Voicemail path not found: $VOICEMAIL_PATH"
    [[ -d "$CHAT_FILES_PATH" ]] && log_success "Chat files path: $CHAT_FILES_PATH" || log_warn "Chat files path not found: $CHAT_FILES_PATH"
}

# Install Node.js if needed
install_nodejs() {
    log_info "Checking Node.js installation..."

    if command -v node &> /dev/null; then
        NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
        if [[ $NODE_VERSION -ge $MIN_NODE_VERSION ]]; then
            log_success "Node.js v$(node -v | cut -d'v' -f2) is installed"
            return
        fi
        log_warn "Node.js version $NODE_VERSION is too old (need >= $MIN_NODE_VERSION)"
    fi

    log_info "Installing Node.js $MIN_NODE_VERSION..."

    if [[ "$OS" == "debian" ]]; then
        curl -fsSL https://deb.nodesource.com/setup_${MIN_NODE_VERSION}.x | bash -
        apt-get install -y nodejs
    else
        curl -fsSL https://rpm.nodesource.com/setup_${MIN_NODE_VERSION}.x | bash -
        yum install -y nodejs
    fi

    log_success "Node.js $(node -v) installed"
}

# Install git if needed
install_git() {
    if ! command -v git &> /dev/null; then
        log_info "Installing git..."
        if [[ "$OS" == "debian" ]]; then
            apt-get update && apt-get install -y git
        else
            yum install -y git
        fi
    fi
}

# Clone or update the repository
setup_repository() {
    if [[ -d "$INSTALL_DIR" ]]; then
        if [[ "$FORCE_REINSTALL" == "true" ]]; then
            log_info "Removing existing installation..."
            rm -rf "$INSTALL_DIR"
        else
            log_info "Updating existing installation..."
            cd "$INSTALL_DIR"
            git fetch origin
            git reset --hard origin/main
            return
        fi
    fi

    log_info "Cloning repository..."
    git clone "$REPO_URL" "$INSTALL_DIR"
}

# Create environment file
create_env_file() {
    log_info "Creating environment configuration..."

    ENV_FILE="$INSTALL_DIR/sync-service/.env"

    cat > "$ENV_FILE" << EOF
# 3CX BackupWiz Sync Agent Configuration
# Auto-generated by install.sh on $(date)

# Agent mode - local means running on the 3CX server itself
AGENT_MODE=local

# Registration token for this tenant
AGENT_TOKEN=$TOKEN

# API endpoint
API_URL=$API_URL

# Supabase connection (will be fetched from API using token)
# SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are fetched dynamically

# 3CX Database (local connection)
THREECX_DB_HOST=127.0.0.1
THREECX_DB_PORT=5432
THREECX_DB_NAME=database_single
THREECX_DB_USER=phonesystem
THREECX_DB_PASSWORD=$DB_PASSWORD

# 3CX File Paths
THREECX_RECORDINGS_PATH=$RECORDINGS_PATH
THREECX_VOICEMAIL_PATH=$VOICEMAIL_PATH
THREECX_CHAT_FILES_PATH=$CHAT_FILES_PATH
THREECX_FAX_PATH=$FAX_PATH
THREECX_MEETINGS_PATH=$MEETINGS_PATH

# Sync Settings
SYNC_INTERVAL_SECONDS=60
LOG_LEVEL=info

# Auto-update (check daily)
AUTO_UPDATE=true
EOF

    chmod 600 "$ENV_FILE"
    log_success "Environment file created"
}

# Build the sync service
build_service() {
    log_info "Building sync service..."

    cd "$INSTALL_DIR/sync-service"
    npm install --production=false
    npm run build

    log_success "Sync service built"
}

# Register with the API
register_agent() {
    log_info "Registering agent with 3CX BackupWiz..."

    # Get system info
    HOSTNAME=$(hostname)
    IP_ADDRESS=$(hostname -I | awk '{print $1}')
    OS_INFO=$(cat /etc/os-release 2>/dev/null | grep PRETTY_NAME | cut -d'"' -f2 || echo "Linux")

    RESPONSE=$(curl -s -X POST "$API_URL/agent/register" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $TOKEN" \
        -d "{
            \"hostname\": \"$HOSTNAME\",
            \"ip_address\": \"$IP_ADDRESS\",
            \"os_info\": \"$OS_INFO\",
            \"agent_version\": \"1.0.0\",
            \"install_path\": \"$INSTALL_DIR\"
        }" 2>&1)

    if echo "$RESPONSE" | grep -q '"success":true'; then
        # Extract Supabase credentials from response and add to env
        SUPABASE_URL=$(echo "$RESPONSE" | grep -o '"supabase_url":"[^"]*"' | cut -d'"' -f4)
        SUPABASE_KEY=$(echo "$RESPONSE" | grep -o '"supabase_service_role_key":"[^"]*"' | cut -d'"' -f4)
        TENANT_ID=$(echo "$RESPONSE" | grep -o '"tenant_id":"[^"]*"' | cut -d'"' -f4)

        if [[ -n "$SUPABASE_URL" && -n "$SUPABASE_KEY" ]]; then
            echo "" >> "$INSTALL_DIR/sync-service/.env"
            echo "# Supabase credentials (from registration)" >> "$INSTALL_DIR/sync-service/.env"
            echo "SUPABASE_URL=$SUPABASE_URL" >> "$INSTALL_DIR/sync-service/.env"
            echo "SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_KEY" >> "$INSTALL_DIR/sync-service/.env"
            echo "TENANT_ID=$TENANT_ID" >> "$INSTALL_DIR/sync-service/.env"
        fi

        log_success "Agent registered successfully"
    else
        log_error "Failed to register agent: $RESPONSE"
        log_info "You may need to configure Supabase credentials manually"
    fi
}

# Create systemd service
create_systemd_service() {
    log_info "Creating systemd service..."

    cat > /etc/systemd/system/${SERVICE_NAME}.service << EOF
[Unit]
Description=3CX BackupWiz Sync Agent
After=network.target postgresql.service

[Service]
Type=simple
User=root
WorkingDirectory=$INSTALL_DIR/sync-service
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production

# Logging
StandardOutput=journal
StandardError=journal
SyslogIdentifier=$SERVICE_NAME

[Install]
WantedBy=multi-user.target
EOF

    systemctl daemon-reload
    systemctl enable ${SERVICE_NAME}

    log_success "Systemd service created"
}

# Create auto-update timer
create_update_timer() {
    log_info "Setting up auto-updates..."

    # Create update script
    cat > "$INSTALL_DIR/update.sh" << 'EOF'
#!/bin/bash
cd /opt/3cx-backupwiz

# Check for updates
git fetch origin
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)

if [ "$LOCAL" != "$REMOTE" ]; then
    echo "$(date): Updating 3CX BackupWiz..."
    git reset --hard origin/main
    cd sync-service
    npm install --production=false
    npm run build
    systemctl restart 3cx-backupwiz
    echo "$(date): Update complete"
else
    echo "$(date): Already up to date"
fi
EOF
    chmod +x "$INSTALL_DIR/update.sh"

    # Create systemd timer for daily updates
    cat > /etc/systemd/system/${SERVICE_NAME}-update.service << EOF
[Unit]
Description=3CX BackupWiz Auto-Update

[Service]
Type=oneshot
ExecStart=$INSTALL_DIR/update.sh
StandardOutput=journal
StandardError=journal
EOF

    cat > /etc/systemd/system/${SERVICE_NAME}-update.timer << EOF
[Unit]
Description=Daily update check for 3CX BackupWiz

[Timer]
OnCalendar=*-*-* 03:00:00
RandomizedDelaySec=3600
Persistent=true

[Install]
WantedBy=timers.target
EOF

    systemctl daemon-reload
    systemctl enable ${SERVICE_NAME}-update.timer
    systemctl start ${SERVICE_NAME}-update.timer

    log_success "Auto-updates configured (daily at 3 AM)"
}

# Start the service
start_service() {
    log_info "Starting sync service..."
    systemctl start ${SERVICE_NAME}

    # Wait a moment and check status
    sleep 3
    if systemctl is-active --quiet ${SERVICE_NAME}; then
        log_success "Sync service is running"
    else
        log_error "Sync service failed to start"
        log_info "Check logs with: journalctl -u ${SERVICE_NAME} -f"
        exit 1
    fi
}

# Print summary
print_summary() {
    echo ""
    echo -e "${GREEN}============================================${NC}"
    echo -e "${GREEN}  3CX BackupWiz Installation Complete!${NC}"
    echo -e "${GREEN}============================================${NC}"
    echo ""
    echo -e "Installation directory: ${BLUE}$INSTALL_DIR${NC}"
    echo -e "Service name: ${BLUE}$SERVICE_NAME${NC}"
    echo ""
    echo -e "Useful commands:"
    echo -e "  ${YELLOW}systemctl status $SERVICE_NAME${NC}    - Check service status"
    echo -e "  ${YELLOW}journalctl -u $SERVICE_NAME -f${NC}    - View live logs"
    echo -e "  ${YELLOW}systemctl restart $SERVICE_NAME${NC}   - Restart service"
    echo ""
    echo -e "Auto-updates are enabled and will run daily at 3 AM."
    echo ""
    echo -e "View your backup status at: ${BLUE}https://3cxbackupwiz.com${NC}"
    echo ""
}

# Main installation flow
main() {
    echo ""
    echo -e "${BLUE}============================================${NC}"
    echo -e "${BLUE}  3CX BackupWiz Sync Agent Installer${NC}"
    echo -e "${BLUE}============================================${NC}"
    echo ""

    check_root
    check_token
    detect_os
    check_3cx_installed
    find_3cx_instance

    if [[ "$SKIP_AUTODETECT" != "true" ]]; then
        detect_db_password
        detect_file_paths
    fi

    install_git
    install_nodejs
    setup_repository
    create_env_file
    build_service
    register_agent
    create_systemd_service
    create_update_timer
    start_service
    print_summary
}

# Run main
main
