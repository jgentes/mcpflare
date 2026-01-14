# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.2.x   | :white_check_mark: |
| < 0.2   | :x:                |

## Reporting a Vulnerability

We take the security of MCPflare seriously. If you discover a security vulnerability, please report it responsibly.

### How to Report

**Please do NOT report security vulnerabilities through public GitHub issues.**

Instead, please report them via one of the following methods:

1. **GitHub Private Vulnerability Reporting** (Preferred)
   - Go to the [Security tab](https://github.com/jgentes/mcpflare/security) of this repository
   - Click "Report a vulnerability"
   - Fill out the form with details about the vulnerability

2. **Email**
   - Send an email to: security@forgedapps.com
   - Include "MCPflare Security" in the subject line

### What to Include

Please include the following information in your report:

- Type of vulnerability (e.g., sandbox escape, code injection, information disclosure)
- Full paths of source file(s) related to the vulnerability
- Step-by-step instructions to reproduce the issue
- Proof-of-concept or exploit code (if possible)
- Impact assessment of the vulnerability
- Any potential mitigations you've identified

### Response Timeline

- **Initial Response**: Within 48 hours of receiving your report
- **Status Update**: Within 7 days with an assessment of the vulnerability
- **Resolution**: Security patches are typically released within 30 days for critical vulnerabilities

### What to Expect

1. **Acknowledgment**: We will acknowledge receipt of your vulnerability report
2. **Assessment**: We will assess the vulnerability and determine its severity
3. **Updates**: We will keep you informed of our progress
4. **Credit**: If desired, we will credit you in the security advisory when the fix is released
5. **Disclosure**: We follow coordinated disclosure practices

### Security Best Practices for Users

When using MCPflare:

1. **Keep Updated**: Always use the latest version of MCPflare
2. **Review MCP Servers**: Only load trusted MCP servers
3. **Monitor Logs**: Watch for unusual patterns in execution logs
4. **Environment Variables**: Use environment variable placeholders (`${VAR}`) instead of hardcoding secrets

## Security Architecture

MCPflare implements defense-in-depth security:

1. **V8 Isolate Sandboxing** - Complete process isolation
2. **Network Isolation** - No outbound network access from sandboxed code
3. **Code Validation** - Pre-execution security checks
4. **Binding-Based Access** - Explicit, scoped permissions
5. **Disposable Environments** - No state persistence between executions

For a detailed security analysis, see the [Security Analysis](https://jgentes.github.io/mcpflare/docs/security) documentation.

## Security Updates

Security updates will be published as:
- GitHub Security Advisories
- Release notes in CHANGELOG.md
- npm package updates

Subscribe to releases on GitHub to be notified of security updates.
