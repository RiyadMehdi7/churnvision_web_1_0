# ChurnVision Enterprise - SSO Setup Guide

This guide helps IT administrators configure Single Sign-On (SSO) for ChurnVision Enterprise.

## Supported Identity Providers

ChurnVision supports any **OpenID Connect (OIDC)** compliant identity provider:

| Provider | Tested | Notes |
|----------|--------|-------|
| Azure AD / Entra ID | Yes | Most common enterprise choice |
| Okta | Yes | Full support |
| Google Workspace | Yes | For Google-based organizations |
| Keycloak | Yes | Self-hosted option |
| OneLogin | Yes | Full support |
| Ping Identity | Yes | Full support |
| Auth0 | Yes | Full support |
| Any OIDC Provider | Yes | Standards-compliant |

---

## Quick Start

### Step 1: Get Your IdP Configuration

You'll need these values from your identity provider:
- **Issuer URL** (also called "Authority" or "Tenant URL")
- **Client ID** (also called "Application ID")
- **Client Secret**

### Step 2: Configure ChurnVision

Add these environment variables to your `.env` file:

```bash
# Enable SSO
SSO_ENABLED=true
SSO_PROVIDER=oidc

# Your IdP configuration
SSO_ISSUER_URL=https://your-idp-issuer-url
SSO_CLIENT_ID=your-client-id
SSO_CLIENT_SECRET=your-client-secret

# Callback URL (update with your domain)
SSO_REDIRECT_URI=https://churnvision.yourcompany.com/api/v1/auth/sso/callback

# User provisioning
SSO_AUTO_CREATE_USERS=true
SSO_DEFAULT_ROLE=viewer

# Admin group mapping (optional)
SSO_ADMIN_GROUPS=ChurnVision-Admins,IT-Administrators
```

### Step 3: Restart Services

```bash
docker compose -f docker-compose.prod.yml restart backend
```

### Step 4: Verify Configuration

```bash
curl https://churnvision.yourcompany.com/api/v1/auth/sso/status
```

Expected response:
```json
{
  "enabled": true,
  "provider": "oidc",
  "configured": true
}
```

---

## Provider-Specific Instructions

### Azure AD / Entra ID

#### 1. Register Application in Azure Portal

1. Go to **Azure Portal** → **Azure Active Directory** → **App registrations**
2. Click **New registration**
3. Configure:
   - **Name**: `ChurnVision Enterprise`
   - **Supported account types**: Single tenant (or multi-tenant if needed)
   - **Redirect URI**: `https://churnvision.yourcompany.com/api/v1/auth/sso/callback`
4. Click **Register**

#### 2. Configure Authentication

1. Go to **Authentication** in the app registration
2. Under **Platform configurations**, ensure Web is configured
3. Add redirect URI if not already present
4. Enable **ID tokens** under Implicit grant

#### 3. Create Client Secret

1. Go to **Certificates & secrets**
2. Click **New client secret**
3. Set description and expiry
4. **Copy the secret value immediately** (shown only once)

#### 4. Get Configuration Values

- **Issuer URL**: `https://login.microsoftonline.com/{tenant-id}/v2.0`
- **Client ID**: From Overview page (Application ID)
- **Client Secret**: The value you copied

#### 5. Configure Claims (Optional)

To enable group-based admin access:
1. Go to **Token configuration**
2. Click **Add groups claim**
3. Select **Security groups**

#### 6. ChurnVision Configuration

```bash
SSO_ENABLED=true
SSO_PROVIDER=oidc
SSO_ISSUER_URL=https://login.microsoftonline.com/YOUR-TENANT-ID/v2.0
SSO_CLIENT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
SSO_CLIENT_SECRET=your-client-secret-value
SSO_REDIRECT_URI=https://churnvision.yourcompany.com/api/v1/auth/sso/callback
SSO_SCOPES=openid email profile
SSO_AUTO_CREATE_USERS=true
SSO_DEFAULT_ROLE=viewer
SSO_ADMIN_GROUPS=ChurnVision-Admins
```

---

### Okta

#### 1. Create Application in Okta

1. Go to **Okta Admin Console** → **Applications** → **Create App Integration**
2. Select **OIDC - OpenID Connect**
3. Select **Web Application**
4. Configure:
   - **App integration name**: `ChurnVision Enterprise`
   - **Grant type**: Authorization Code
   - **Sign-in redirect URIs**: `https://churnvision.yourcompany.com/api/v1/auth/sso/callback`
   - **Sign-out redirect URIs**: `https://churnvision.yourcompany.com`
5. Click **Save**

#### 2. Get Configuration Values

- **Issuer URL**: `https://your-domain.okta.com` (your Okta org URL)
- **Client ID**: From application's General tab
- **Client Secret**: From application's General tab

#### 3. Assign Users

1. Go to **Assignments** tab
2. Assign users or groups who should access ChurnVision

#### 4. ChurnVision Configuration

```bash
SSO_ENABLED=true
SSO_PROVIDER=oidc
SSO_ISSUER_URL=https://your-domain.okta.com
SSO_CLIENT_ID=your-okta-client-id
SSO_CLIENT_SECRET=your-okta-client-secret
SSO_REDIRECT_URI=https://churnvision.yourcompany.com/api/v1/auth/sso/callback
SSO_SCOPES=openid email profile groups
SSO_AUTO_CREATE_USERS=true
SSO_DEFAULT_ROLE=viewer
```

---

### Google Workspace

#### 1. Create OAuth Client in Google Cloud

1. Go to **Google Cloud Console** → **APIs & Services** → **Credentials**
2. Click **Create Credentials** → **OAuth client ID**
3. Select **Web application**
4. Configure:
   - **Name**: `ChurnVision Enterprise`
   - **Authorized redirect URIs**: `https://churnvision.yourcompany.com/api/v1/auth/sso/callback`
5. Click **Create**

#### 2. Get Configuration Values

- **Issuer URL**: `https://accounts.google.com`
- **Client ID**: Shown after creation
- **Client Secret**: Shown after creation

#### 3. ChurnVision Configuration

```bash
SSO_ENABLED=true
SSO_PROVIDER=oidc
SSO_ISSUER_URL=https://accounts.google.com
SSO_CLIENT_ID=xxxxxxxxxxxx.apps.googleusercontent.com
SSO_CLIENT_SECRET=your-google-client-secret
SSO_REDIRECT_URI=https://churnvision.yourcompany.com/api/v1/auth/sso/callback
SSO_SCOPES=openid email profile
SSO_AUTO_CREATE_USERS=true
SSO_DEFAULT_ROLE=viewer
```

---

### Keycloak (Self-Hosted)

#### 1. Create Client in Keycloak

1. Go to **Keycloak Admin Console**
2. Select your realm (or create one)
3. Go to **Clients** → **Create**
4. Configure:
   - **Client ID**: `churnvision`
   - **Client Protocol**: openid-connect
   - **Root URL**: `https://churnvision.yourcompany.com`
5. Click **Save**

#### 2. Configure Client

1. Set **Access Type**: confidential
2. Set **Valid Redirect URIs**: `https://churnvision.yourcompany.com/api/v1/auth/sso/callback`
3. Go to **Credentials** tab and copy the secret

#### 3. ChurnVision Configuration

```bash
SSO_ENABLED=true
SSO_PROVIDER=oidc
SSO_ISSUER_URL=https://keycloak.yourcompany.com/realms/your-realm
SSO_CLIENT_ID=churnvision
SSO_CLIENT_SECRET=your-keycloak-client-secret
SSO_REDIRECT_URI=https://churnvision.yourcompany.com/api/v1/auth/sso/callback
SSO_SCOPES=openid email profile
SSO_AUTO_CREATE_USERS=true
SSO_DEFAULT_ROLE=viewer
```

---

## Configuration Reference

### All SSO Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SSO_ENABLED` | Yes | `false` | Enable/disable SSO |
| `SSO_PROVIDER` | Yes | `none` | Provider type: `oidc`, `ldap`, `saml` |
| `SSO_ISSUER_URL` | Yes | - | OIDC issuer URL |
| `SSO_CLIENT_ID` | Yes | - | OAuth2 client ID |
| `SSO_CLIENT_SECRET` | Yes | - | OAuth2 client secret |
| `SSO_REDIRECT_URI` | No | Auto | Callback URL |
| `SSO_SCOPES` | No | `openid email profile` | OAuth2 scopes |
| `SSO_AUTO_CREATE_USERS` | No | `true` | Auto-create users on first login |
| `SSO_DEFAULT_ROLE` | No | `viewer` | Default role for new users |
| `SSO_ADMIN_GROUPS` | No | - | IdP groups that grant admin access |
| `SSO_SESSION_LIFETIME` | No | `86400` | Session duration in seconds |

### Role Mapping

Users are assigned roles based on:

1. **Group Membership**: If user's IdP groups match `SSO_ADMIN_GROUPS`, they get admin role
2. **Default Role**: Otherwise, they get `SSO_DEFAULT_ROLE`

Example:
```bash
# Users in these groups become admins
SSO_ADMIN_GROUPS=IT-Admins,ChurnVision-PowerUsers,HR-Directors

# Everyone else gets analyst role
SSO_DEFAULT_ROLE=analyst
```

---

## Testing SSO

### 1. Check Configuration Status

```bash
curl https://churnvision.yourcompany.com/api/v1/auth/sso/status
```

### 2. Test Login Flow

1. Open browser to: `https://churnvision.yourcompany.com/api/v1/auth/sso/login`
2. You should be redirected to your IdP
3. After login, you should be redirected back to ChurnVision

### 3. Check Logs

```bash
docker compose logs backend | grep -i sso
```

---

## Troubleshooting

### "SSO is not configured" Error

**Cause**: Missing or incorrect environment variables

**Solution**:
```bash
# Verify all required variables are set
docker compose exec backend python -c "
from app.core.sso.config import get_sso_settings
s = get_sso_settings()
print(f'Enabled: {s.SSO_ENABLED}')
print(f'Provider: {s.SSO_PROVIDER}')
print(f'Issuer: {s.SSO_ISSUER_URL}')
print(f'Client ID: {s.SSO_CLIENT_ID}')
print(f'Configured: {s.is_oidc_configured()}')
"
```

### "Invalid redirect_uri" Error from IdP

**Cause**: Redirect URI mismatch

**Solution**:
1. Check exact redirect URI in IdP matches `SSO_REDIRECT_URI`
2. Include full path: `/api/v1/auth/sso/callback`
3. Ensure protocol matches (https vs http)

### "User not found" After Login

**Cause**: `SSO_AUTO_CREATE_USERS` is disabled

**Solution**:
```bash
# Enable auto-provisioning
SSO_AUTO_CREATE_USERS=true
```

### "Failed to connect to identity provider"

**Cause**: Network or firewall blocking connection

**Solution**:
1. Check firewall allows outbound HTTPS to IdP
2. Verify `SSO_ISSUER_URL` is correct
3. Test connectivity:
   ```bash
   docker compose exec backend curl -I https://your-idp-issuer/.well-known/openid-configuration
   ```

### User Gets Wrong Role

**Cause**: Group claims not configured or group name mismatch

**Solution**:
1. Ensure IdP sends groups claim in token
2. Check exact group names match `SSO_ADMIN_GROUPS`
3. Group names are case-sensitive

---

## Security Best Practices

1. **Use HTTPS**: Always use HTTPS for both ChurnVision and callback URLs
2. **Rotate Secrets**: Rotate client secrets periodically
3. **Limit Scopes**: Only request necessary scopes
4. **Review Access**: Regularly review who has access via IdP
5. **Monitor Logs**: Enable audit logging for SSO events
6. **MFA**: Enable MFA at the IdP level

---

## Support

If you encounter issues:

1. Check the [Troubleshooting Guide](TROUBLESHOOT.md)
2. Review backend logs: `docker compose logs backend`
3. Contact support: support@churnvision.com

Include in support requests:
- IdP type (Azure AD, Okta, etc.)
- Error messages
- SSO status output
- Relevant log entries (with secrets redacted)
