# Security Policy

## Reporting A Vulnerability

Please do not open a public GitHub issue for security-sensitive problems.

Instead, report the issue privately to the maintainer with:

- A description of the problem
- Steps to reproduce it
- Affected versions, if known
- Any proof-of-concept details needed to understand the risk

If no private reporting channel is listed yet on the public repo profile, contact the maintainer through the primary project or personal site linked from the repository.

## Scope

Security reports are especially helpful for issues involving:

- Unsafe command execution
- Path handling and filesystem access
- IPC exposure between renderer and main
- Packaging or installer trust concerns
- Sensitive data exposure in logs or exported diagnostics
- Unsafe Python backend dependency versions surfaced through NAM-BOT setup or diagnostics guidance

## Disclosure

Please allow time for investigation and a fix before sharing details publicly.
