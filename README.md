# Flight Penguins Official Site

An AWS-hosted official team site for Flight Penguins. It includes schedules, facilities, notices, practice videos, team and member management, basketball scorekeeping, and player rankings. CloudFront serves the static frontend; Java Lambda functions and DynamoDB provide the APIs and data storage. Schedule images are processed from S3 with Gemini.

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

The build runs JUnit 5 and packages the Lambda artifact. Browser scripts can be syntax-checked with Node.js. Install pinned npm dependencies with `npm ci`, then run `npm run format:check` and `npm test`.
