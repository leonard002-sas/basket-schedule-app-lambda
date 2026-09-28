# Authentication and authorization

## Identity and session

Amazon Cognito hosts sign-in and returns an authorization code to the CloudFront application. The browser exchanges the code for ID, access, and refresh tokens. The browser sends the ID token in the `Authorization: Bearer` header when it calls the Lambda Function URLs.

`CognitoAuth` verifies the token signature using the Cognito JWKS, then checks the trusted issuer, configured app-client ID, `token_use=id`, issue time, and expiration. Only the verified `cognito:groups` claim is used by Java handlers to decide whether a request is an administrator request.

## Permission matrix

| Feature                                                 | Guest | Administrator | Server enforcement                                              |
| ------------------------------------------------------- | ----- | ------------- | --------------------------------------------------------------- |
| Calendar, event details, facilities                     | Read  | Read          | `requireUser`                                                   |
| Visible announcements                                   | Read  | Read          | `requireUser`; expired notices are omitted from guest responses |
| Create or edit schedules and announcements              | No    | Yes           | `requireAdmin` on `ScheduleApi` and `ScheduleRegisterApi`       |
| Create facilities                                       | No    | Yes           | `requireAdmin` on `FacilityApi`                                 |
| Request upload URLs and process status                  | No    | Yes           | `requireAdmin` on `UploadApi`                                   |
| View teams, players, games, results, rankings           | Read  | Read          | `requireUser` on `BasketballApi`                                |
| Create or edit teams, players, games, and score actions | No    | Yes           | `requireAdmin` on every non-GET `BasketballApi` operation       |

Front-end role checks only hide controls and destinations. They do not replace server authorization. Tests cover token absence and the administrator-group policy.

## Administrator assignment

Add trusted operators to the Cognito user-pool group named `admins`. New accounts are guests by default. Do not promote users based on an email address, a browser preference, or a JavaScript flag. A user's existing token may retain old group claims until that token expires and the user signs in again.

## Self-service account deletion

The account menu deletes only the signed-in Cognito profile through the user-authorized `DeleteUser` operation. It does not delete team-shared schedules, teams, rosters, or game records.

For the delete control to work, the `BasketSchedule` app client must allow the Cognito reserved OAuth scope `aws.cognito.signin.user.admin`. The login request now asks Cognito for that scope. After changing the app-client setting, the user must sign out and sign in again so the access token contains the scope. If the scope is missing, the delete control remains disabled. The action also requires typing `削除する` before it can be submitted.

## Security boundaries

- Do not trust an ID token until `CognitoAuth` verifies its signature and claims.
- Keep API keys out of static resources. Gemini credentials belong in the image-processor Lambda environment.
- Do not expose exception messages or stack traces to browsers. Send diagnostic details to CloudWatch logs and return a stable error message and code.
- S3 upload URLs are short-lived capabilities. Keep the upload role restricted to the intended bucket and object prefix.
- Account deletion is irreversible for the Cognito profile; the confirmation dialog names the retained shared data before submission.
