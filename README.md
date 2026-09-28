# COURTSIDE — Basketball Schedule App

An AWS-hosted basketball team schedule and scorebook. The static website is served through CloudFront; authenticated requests go to Java AWS Lambda Function URLs, with DynamoDB used for schedules, facilities, and basketball data. Calendar-image extraction uses S3 and Gemini.

## Start here

- [System architecture](docs/architecture.md)
- [Screen flow and navigation](docs/screen-flow.md)
- [Roles and authorization](docs/authorization.md)
- [External design](docs/external-design.md)
- [Source inventory](docs/source-inventory.md)
- [Development, code conventions, and tests](docs/development.md)
- [Coding standards](docs/coding-standards.md)
- [Source responsibilities and refactoring boundaries](docs/refactoring.md)
- [AWS basketball table setup](AWS_BASKETBALL_SETUP.md)
- [Project handoff notes](CLAUDE_HANDOFF.md)

## Local verification

Use JDK 25 and the checked-in Gradle wrapper:

```powershell
./gradlew clean build
```

The build runs the JUnit 5 tests and packages the Lambda artifact. Browser scripts can be syntax-checked with Node.js; the exact commands are in [docs/development.md](docs/development.md).

Install Node.js with npm and run `npm ci` to install the pinned local formatter. Use `npm run format:check` to verify browser and documentation formatting and `npm test` to run browser utility tests.

## Roles at a glance

Signed-in guests can view team schedules and scorebook information. Only accounts in the Cognito `admins` group can register or change shared team data. Lambda handlers verify both the Cognito token and role for write requests.
