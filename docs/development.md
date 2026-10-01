# Development and verification

## Required tools

- JDK 25, matching the Gradle toolchain in `build.gradle`
- The checked-in Gradle wrapper
- Node.js and npm for browser checks and the pinned Prettier formatter

## Build and test

Run commands from the repository root:

```powershell
./gradlew clean build
$scripts = Get-ChildItem src/main/resources/static -Filter *.js
foreach ($script in $scripts) { node --check $script.FullName }
node --test src/test/js/*.test.cjs
npm ci
npm run format:check
npm test
```

`build` includes the JUnit 5 suite and Spotless Java format check. Java compilation uses UTF-8 and `-Xlint:all`. API tests use unauthenticated Lambda events and do not call DynamoDB. A live Cognito, DynamoDB, S3, and Gemini integration test requires a separately configured AWS test environment and must not write to production resources.

The browser utility tests use Node's built-in test runner and do not need AWS credentials or production API calls. The formatter version is pinned in `package-lock.json`; installing it requires npm access. The manual Gemini smoke check is in `src/test/java`; it requires an explicit `--confirm-paid-api-call` flag because the request may incur Gemini usage charges. Do not run it during ordinary verification.

To generate Javadoc locally:

```powershell
./gradlew javadoc
```

The generated output is under `build/docs/javadoc` and should not be committed. Javadoc doclint is enabled so malformed public API documentation fails the documentation task.

## Code conventions

### Runtime configuration

`ApplicationConfig` keeps resource names and Cognito identifiers out of handler logic. Production Lambda functions may override the local defaults with `AWS_REGION`, `SCHEDULE_TABLE_NAME`, `FACILITY_TABLE_NAME`, `BASKETBALL_TABLE_NAME`, `IMAGE_BUCKET_NAME`, `COGNITO_USER_POOL_ID`, and `COGNITO_CLIENT_ID`. The Gemini API key is separate and must only be provided as `GEMINI_API_KEY` in the image-processor Lambda environment.

The browser uses `frontend-config.js` for public endpoints and the Cognito client ID. These values are not secrets. Never place a Gemini key, AWS access key, refresh token, or client secret in a static resource or commit them to Git.

### Java

- Keep Lambda handlers thin: parse the request, authenticate, validate, call a focused helper, and build a stable response.
- Use `CognitoAuth.requireUser` for reads and `CognitoAuth.requireAdmin` for writes.
- Document public classes and methods with Javadoc. Describe why an authorization, data-key, or time-zone rule exists where it is applied.
- Validate external values before building DynamoDB attributes. Return safe messages; log diagnostic context without logging bearer tokens or unnecessary personal data.
- Use immutable values and injected dependencies when a class needs to be tested without AWS.

### Browser code

- Keep UI state, DOM updates, and network calls in clearly named functions.
- Escape values before inserting user-controlled text into HTML.
- Treat decoded JWT claims as presentation hints only; all access decisions must be repeated by the Java API.
- Keep account, theme, and navigation behavior shared across the three entry pages.
- Add comments around workflow boundaries and non-obvious browser or Cognito behavior. Prefer descriptive function names over comments that repeat a line of code.

### HTML and CSS

- Give each page one primary heading, label form inputs, and provide `aria-live` regions for asynchronous status.
- Use the shared navigation and account controls consistently. Mark the current navigation item with `aria-current="page"`.
- Keep both light and dark styles readable, and check narrow viewport behavior before shipping.
- Keep operational and architecture decisions in `docs/`, not buried only in source comments.

See [coding standards](coding-standards.md) for the fuller Java, JavaScript, HTML, and CSS conventions, and [source inventory](source-inventory.md) for the first file to inspect when changing a feature.
