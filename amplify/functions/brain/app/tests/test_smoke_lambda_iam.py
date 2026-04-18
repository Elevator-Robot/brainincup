"""
Smoke test: verify the brain Lambda's IAM execution role has DynamoDB permissions
for all new table ARNs.

Requires live AWS credentials and deployed infrastructure.
Skipped automatically when AWS_REGION env var is not set.

**Validates: Requirements 1.3, 9.4**
"""

import os
import pytest

AWS_REGION = os.environ.get("AWS_REGION", "")

pytestmark = pytest.mark.skipif(
    not AWS_REGION,
    reason="AWS_REGION not set — skipping live IAM smoke tests",
)

# DynamoDB actions the brain Lambda must be allowed to perform
REQUIRED_ACTIONS = [
    "dynamodb:GetItem",
    "dynamodb:PutItem",
    "dynamodb:UpdateItem",
    "dynamodb:Query",
]


def _get_table_arns() -> dict[str, str | None]:
    return {
        "PlayerState": os.environ.get("PLAYER_STATE_TABLE_ARN"),
        "WorldState": os.environ.get("WORLD_STATE_TABLE_ARN"),
        "ContentRegistry": os.environ.get("CONTENT_REGISTRY_TABLE_ARN"),
        "ActiveQuest": os.environ.get("ACTIVE_QUEST_TABLE_ARN"),
    }


def _get_lambda_role_arn(lambda_client, function_name: str) -> str:
    """
    Retrieve the execution role ARN for the given Lambda function.
    Calls pytest.skip if the function is not found.
    """
    try:
        config = lambda_client.get_function_configuration(FunctionName=function_name)
        return config["Role"]
    except lambda_client.exceptions.ResourceNotFoundException:
        pytest.skip(f"Lambda function '{function_name}' not found")
    except Exception as exc:
        pytest.skip(f"Could not retrieve Lambda configuration: {exc}")


def _simulate_policy(iam_client, role_arn: str, actions: list[str], resource_arns: list[str]) -> list[dict]:
    """
    Use IAM SimulatePrincipalPolicy to check whether the role can perform
    the given actions on the given resources.
    Returns the list of evaluation results.
    """
    try:
        response = iam_client.simulate_principal_policy(
            PolicySourceArn=role_arn,
            ActionNames=actions,
            ResourceArns=resource_arns,
        )
        return response.get("EvaluationResults", [])
    except Exception as exc:
        pytest.skip(f"IAM simulate_principal_policy failed: {exc}")


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_brain_lambda_has_dynamodb_permissions():
    """
    Verify the brain Lambda's execution role is allowed to perform all required
    DynamoDB actions on each new table ARN.
    """
    import boto3

    function_name = os.environ.get("BRAIN_LAMBDA_FUNCTION_NAME", "brain")
    table_arns = _get_table_arns()

    # Filter out tables whose ARN env var is not set
    available_arns = {k: v for k, v in table_arns.items() if v}
    if not available_arns:
        pytest.skip(
            "No table ARN env vars set (PLAYER_STATE_TABLE_ARN, WORLD_STATE_TABLE_ARN, "
            "CONTENT_REGISTRY_TABLE_ARN, ACTIVE_QUEST_TABLE_ARN) — skipping"
        )

    lambda_client = boto3.client("lambda", region_name=AWS_REGION)
    iam_client = boto3.client("iam", region_name=AWS_REGION)

    role_arn = _get_lambda_role_arn(lambda_client, function_name)

    resource_arns = list(available_arns.values())
    results = _simulate_policy(iam_client, role_arn, REQUIRED_ACTIONS, resource_arns)

    denied = [
        r for r in results
        if r.get("EvalDecision") != "allowed"
    ]

    assert not denied, (
        "The following actions were NOT allowed for the brain Lambda role:\n"
        + "\n".join(
            f"  {r['EvalActionName']} on {r.get('EvalResourceName', '?')} → {r['EvalDecision']}"
            for r in denied
        )
    )


class TestBrainLambdaIAMPermissionsPerTable:
    """Per-table IAM permission checks for finer-grained failure reporting."""

    @pytest.fixture(scope="class")
    def role_arn(self):
        import boto3
        function_name = os.environ.get("BRAIN_LAMBDA_FUNCTION_NAME", "brain")
        lambda_client = boto3.client("lambda", region_name=AWS_REGION)
        return _get_lambda_role_arn(lambda_client, function_name)

    @pytest.fixture(scope="class")
    def iam_client(self):
        import boto3
        return boto3.client("iam", region_name=AWS_REGION)

    def _check_table(self, iam_client, role_arn, table_env_var: str, logical_name: str):
        table_arn = os.environ.get(table_env_var)
        if not table_arn:
            pytest.skip(f"{table_env_var} not set")

        results = _simulate_policy(iam_client, role_arn, REQUIRED_ACTIONS, [table_arn])
        denied = [r for r in results if r.get("EvalDecision") != "allowed"]
        assert not denied, (
            f"{logical_name} table: denied actions: "
            + ", ".join(r["EvalActionName"] for r in denied)
        )

    def test_player_state_table_permissions(self, iam_client, role_arn):
        self._check_table(iam_client, role_arn, "PLAYER_STATE_TABLE_ARN", "PlayerState")

    def test_world_state_table_permissions(self, iam_client, role_arn):
        self._check_table(iam_client, role_arn, "WORLD_STATE_TABLE_ARN", "WorldState")

    def test_content_registry_table_permissions(self, iam_client, role_arn):
        self._check_table(iam_client, role_arn, "CONTENT_REGISTRY_TABLE_ARN", "ContentRegistry")

    def test_active_quest_table_permissions(self, iam_client, role_arn):
        self._check_table(iam_client, role_arn, "ACTIVE_QUEST_TABLE_ARN", "ActiveQuest")
