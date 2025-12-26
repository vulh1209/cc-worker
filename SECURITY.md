# Security Policy

## Supported Versions

We release patches for security vulnerabilities for the following versions:

| Version | Supported          |
| ------- | ------------------ |
| 1.x.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

We take security seriously. If you discover a security vulnerability, please follow these steps:

### 1. Do NOT disclose publicly

Please **do not** create a public GitHub issue for security vulnerabilities.

### 2. Report privately

Send a detailed report to: **security@your-org.com** (replace with actual email)

Or use GitHub's private vulnerability reporting:
1. Go to the repository's **Security** tab
2. Click **Report a vulnerability**
3. Fill out the form with details

### 3. Include in your report

- Description of the vulnerability
- Steps to reproduce the issue
- Potential impact
- Suggested fix (if any)
- Your contact information

### 4. What to expect

- **Acknowledgment**: Within 48 hours
- **Initial assessment**: Within 1 week
- **Resolution timeline**: Depends on severity (see below)

## Severity Levels & Response Times

| Severity | Description | Response Time |
|----------|-------------|---------------|
| **Critical** | Remote code execution, data breach | 24-48 hours |
| **High** | Authentication bypass, privilege escalation | 1 week |
| **Medium** | Information disclosure, CSRF | 2 weeks |
| **Low** | Minor issues, hardening suggestions | 1 month |

## Security Best Practices for Deployment

### Server (cc-server)

1. **Database**
   - Use strong, unique passwords
   - Enable SSL for PostgreSQL connections
   - Restrict database access to application only

2. **Environment Variables**
   - Never commit `.env` files
   - Use secrets management in production
   - Rotate API keys regularly

3. **Network**
   - Use HTTPS in production
   - Configure proper CORS settings
   - Use reverse proxy (nginx/Caddy) in production

### Worker (cc-worker)

1. **API Keys**
   - Store API keys securely
   - Use environment variables, not config files
   - Implement key rotation

2. **Working Directory**
   - Use isolated directories for task execution
   - Clean up temporary files
   - Limit file system access

3. **Claude Code Authentication**
   - Use `claude login` for CLI authentication
   - Don't share authentication tokens
   - Revoke access for decommissioned workers

## Security Features

- API key authentication for worker connections
- WebSocket connection validation
- Input sanitization for task prompts
- No secrets in logs or task outputs

## Acknowledgments

We appreciate responsible disclosure and will acknowledge security researchers who report valid vulnerabilities (unless they prefer to remain anonymous).

---

Thank you for helping keep CC-Worker secure!
