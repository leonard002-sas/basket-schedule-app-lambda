# Authentication and authorization

## Identity and session

Amazon Cognito hosts sign-in and returns an authorization code to the CloudFront application. The browser exchanges the code for ID, access, and refresh tokens. The browser sends the signed ID token in the `Authorization: Bearer` header to Lambda Function URLs.

`CognitoAuth` verifies the token signature using Cognito JWKS and checks the trusted issuer, app-client ID, token use, issue time, and expiration. Authorization uses only the verified `cognito:groups` claim.

## Permission matrix

| Feature                                                             | Guest | Administrator (`admins`)                      | Root administrator (`root-admins`) | Server enforcement                                             |
| ------------------------------------------------------------------- | ----- | --------------------------------------------- | ---------------------------------- | -------------------------------------------------------------- |
| Calendar, event details, facilities, announcements, videos          | Read  | Read                                          | Read                               | `requireUser`                                                  |
| Team, roster, game, scorebook and ranking data                      | Read  | Read/write                                    | Read/write                         | `requireUser` for reads; `requireAdmin` for writes             |
| Schedule, facility, announcement and upload management              | No    | Yes                                           | Yes                                | `requireAdmin` in each Lambda handler                          |
| Cognito user directory, role changes, account status, user deletion | No    | No                                            | Yes                                | `requireRootAdmin` on the users resource                       |
| Delete own Cognito account                                          | Yes   | Yes, if another enabled administrator remains | No                                 | Authenticated account-delete route plus server-side safeguards |

The frontend hides controls for convenience. Every privileged operation is checked again by the Java API.

## Role assignment

Create a Cognito user-pool group named `admins` for trusted team managers and `root-admins` for one or two account operators. Create the root group and add its first member manually in Cognito; the site intentionally has no control that can grant root privileges. New users start as guests. Use the in-site user-management screen to promote guests to administrators or demote them. Cognito group claims take effect after the user signs in again or receives a refreshed token.

The root role inherits normal administrator permissions. Root accounts cannot be disabled, deleted, demoted, or self-deleted through this application. The server prevents disabling, deleting, or demoting the last enabled administrator, and prevents an operator from disabling or deleting their own account from the management screen.

## Account deletion and retention

The account menu allows an authenticated user to delete their own Cognito profile after typing the confirmation phrase. The request goes to the Java Lambda, which uses its execution role to call Cognito `AdminDeleteUser`; the browser does not receive AWS credentials or an administrative Cognito token scope. Root administrators are directed to have another operator manage their account. Deleting a Cognito profile does not delete shared schedules, teams, rosters, or score records.

The Lambda execution role must have the Cognito actions documented in `AWS_BASKETBALL_SETUP.md`, restricted to this user pool. Without that policy and the manually created root group, user management will return an authorization or group-not-found error.

## Security boundaries

- Never trust group claims until `CognitoAuth` verifies the token signature and claims.
- Keep API keys out of static resources. Gemini credentials belong in the image-processor Lambda environment.
- Do not expose exception messages or stack traces to browsers; log diagnostic details in CloudWatch and return stable error codes.
- S3 upload URLs are short-lived capabilities. Restrict their role to the intended bucket and object prefix.
- Account deletion is irreversible for the Cognito profile. Shared application data remains intact and is called out before confirmation.
