# Flight Penguins Official Site

An AWS-hosted official team site for Flight Penguins. It includes schedules, facilities, notices, practice videos, team and member management, basketball scorekeeping, and player rankings. CloudFront serves the static frontend; Java Lambda functions and DynamoDB provide the APIs and data storage. Schedule images are processed from S3 with Gemini.

## Vue SPA

The primary application frontend lives in `frontend/` and is built with Vue 3, TypeScript, Vite, Vue Router, Pinia, and VueUse. It is deployed under `/app/` and covers the dashboard, schedule calendar, registration, facilities, announcements, videos, team roster, games, live scorekeeping, rankings, account settings, join requests, and user administration.

The SPA separates responsibilities into typed API clients, authentication and domain stores, route-level views, and reusable UI components. Routes are lazy-loaded, and hash history allows direct reloads from CloudFront/S3 without adding a rewrite function.

```powershell
cd frontend
npm ci
npm run dev
```

The production build is written to `src/main/resources/static/app/` and is created automatically by CodeBuild. That generated directory is intentionally excluded from Git.

Before publishing the SPA, add the following values to the Cognito app client's allowed callback and sign-out URLs:

```text
https://d13o4oynf3jxlu.cloudfront.net/app/
```

## Start here

- [System architecture](docs/architecture.md)
- [Screen flow and navigation](docs/screen-flow.md)
- [Roles and authorization](docs/authorization.md)
- [External design](docs/external-design.md)
- [Source inventory](docs/source-inventory.md)
- [Development, code conventions, and tests](docs/development.md)
- [Coding standards](docs/coding-standards.md)
- [Source responsibilities and refactoring boundaries](docs/refactoring.md)
- [AWS basketball and Cognito user-management setup](AWS_BASKETBALL_SETUP.md)
- [Project handoff notes](CLAUDE_HANDOFF.md)

## Roles

Signed-in guests can view shared team information. Members of Cognito's `admins` group manage schedules, teams, games, and scores. Members of the separate `root-admins` group can also manage user roles and accounts. User management requires Cognito group setup and execution-role permissions described in [AWS setup](AWS_BASKETBALL_SETUP.md).

When a game is created, the organizer selects that game's expected participants. Only those selected players are included in that game's appearance and average calculations; players who do not play are recorded as DNP.

## Local verification

Use JDK 25 and the checked-in Gradle wrapper:

```powershell
./gradlew clean build
```

The build runs JUnit 5 and packages the Lambda artifact. Build the frontend with its pinned dependencies before the Java build:

Build the Vue SPA independently with:

```powershell
cd frontend
npm ci
npm run build
cd ..
./gradlew clean build
```
