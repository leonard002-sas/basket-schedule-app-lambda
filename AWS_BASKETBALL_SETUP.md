# Basketball scorebook and user administration setup

The application uses the existing `basket-schedule-get` Lambda Function URL and the `BasketballData` DynamoDB table. The user-management screen also requires a Cognito group and additional permissions on this Lambda's execution role.

## DynamoDB table

Create a table in `ap-northeast-1` with:

- Table name: `BasketballData`
- Partition key: `pk` (String)
- Sort key: `sk` (String)
- Capacity mode: On-demand
- No secondary indexes are required

## Cognito root administrators

Use the Cognito user pool `ap-northeast-1_Cd5fxLwj3`. Create a group named `root-admins` and manually add one or two trusted operator accounts. Do not use the AWS account root user for this application role. Keep membership small: this group can promote and demote administrators, disable or delete Cognito users, and view the user directory.

The existing `admins` group remains the normal team-management role. New Cognito users are guests until an administrator promotes them. A root administrator is also treated as an application administrator for schedule, roster, and scorebook operations. Root administrators cannot delete or disable themselves or other root administrators through the site.

## Lambda execution-role permissions

Attach the following Cognito permissions to the execution role used by `basket-schedule-get`. The API checks the signed-in user's `root-admins` claim before calling these operations. Limit the resource to the application user pool.

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "ManageBasketScheduleCognitoUsers",
            "Effect": "Allow",
            "Action": [
                "cognito-idp:ListUsers",
                "cognito-idp:ListUsersInGroup",
                "cognito-idp:AdminGetUser",
                "cognito-idp:AdminListGroupsForUser",
                "cognito-idp:AdminAddUserToGroup",
                "cognito-idp:AdminRemoveUserFromGroup",
                "cognito-idp:AdminEnableUser",
                "cognito-idp:AdminDisableUser",
                "cognito-idp:AdminDeleteUser"
            ],
            "Resource": "arn:aws:cognito-idp:ap-northeast-1:605419152870:userpool/ap-northeast-1_Cd5fxLwj3"
        }
    ]
}
```

The basketball feature also needs its existing DynamoDB policy:

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "dynamodb:GetItem",
                "dynamodb:PutItem",
                "dynamodb:UpdateItem",
                "dynamodb:DeleteItem",
                "dynamodb:Query",
                "dynamodb:TransactWriteItems"
            ],
            "Resource": "arn:aws:dynamodb:ap-northeast-1:605419152870:table/BasketballData"
        }
    ]
}
```

## Function URL and deployment

The Function URL CORS configuration must allow the CloudFront origin, `GET`, `PUT`, and `DELETE`, and the `authorization` and `content-type` headers. Do not add CORS headers in the Lambda response as well as the Function URL configuration; that produces duplicate headers.

After creating the table, Cognito group, and IAM policy, sign in again as the root administrator so the ID token contains the latest group claims. A push to the configured source branch triggers CodePipeline to publish the static pages and update the Lambda package.
