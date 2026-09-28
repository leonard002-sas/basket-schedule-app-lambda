# Basketball scorebook AWS setup

The scorebook uses the existing `basket-schedule-get` Lambda Function URL and a separate DynamoDB table. Create the table and grant the Lambda execution role access before using `basketball.html`.

## DynamoDB table

Create a table in `ap-northeast-1` with:

- Table name: `BasketballData`
- Partition key: `pk` (String)
- Sort key: `sk` (String)
- Capacity mode: On-demand
- No secondary indexes are required

The application stores multiple team rosters and their games in this table. Team, player, game, game-event, box-score, and season-total records use namespaced partition/sort key values. No additional index is needed.

## Lambda execution role

Open the execution role used by the `basket-schedule-get` Lambda and attach an inline policy for the new table. Replace the account number if the AWS account differs.

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

The existing Function URL already allows authenticated `GET` and `PUT` requests from the CloudFront site. The scorebook checks Cognito `admins` membership in the API before allowing changes.

After the table and policy are ready, push the application changes. The existing CodePipeline build publishes the static scorebook page and updates the Lambda package.
