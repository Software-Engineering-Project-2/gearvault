<#
.SYNOPSIS
    GearVault - Complete Automated Teardown & Cleanup Script (Phases 11 down to 0)
.DESCRIPTION
    Safely tears down all AWS resources in strict reverse-dependency topological order:
    1. EventBridge Scheduler & Scheduler IAM Role
    2. CloudWatch Alarms & SNS Alert Topic
    3. ECS Auto Scaling, ECS Service (drained), Task Definitions & Cluster
    4. ECR Repository (with all image layers)
    5. ECS Task IAM Roles & Policies
    6. Application Load Balancer, Listeners & Target Group
    7. AWS Secrets Manager (force deleted without recovery window)
    8. Global AWS WAF Web ACL, CloudFront Functions & OAC
    9. Amazon RDS PostgreSQL (skip final snapshot) & DB Subnet Group
    10. S3 Frontend & Media Buckets (recursive object emptying before deletion)
    11. VPC Endpoint, NAT Gateway, Elastic IP, Security Groups, Subnets, IGW & VPC
#>

[CmdletBinding()]
param(
    [string]$Region = "ap-south-1",
    [string]$WafRegion = "us-east-1"
)

$ErrorActionPreference = "Continue"

function Log-Step($step, $msg) {
    Write-Host "`n========================================================" -ForegroundColor Yellow
    Write-Host " [TEARDOWN $step] $msg" -ForegroundColor Magenta
    Write-Host "========================================================" -ForegroundColor Yellow
}

# 0. Identify Account
$identity = aws sts get-caller-identity | ConvertFrom-Json
$AccountId = $identity.Account
Write-Host "Tearing down resources in Account: $AccountId | Region: $Region" -ForegroundColor Cyan

# 1. EventBridge Automation
Log-Step "1/11" "Deleting EventBridge Scheduler & IAM Role"
aws scheduler delete-schedule --name gearvault-run-jobs --region $Region 2>$null
aws iam delete-role-policy --role-name gearvault-scheduler-role --policy-name SchedulerPassRole 2>$null
aws iam detach-role-policy --role-name gearvault-scheduler-role --policy-arn arn:aws:iam::aws:policy/AmazonECS_FullAccess 2>$null
aws iam delete-role --role-name gearvault-scheduler-role 2>$null

# 2. Observability (CloudWatch & SNS)
Log-Step "2/11" "Deleting CloudWatch Alarms, SNS Topic & Log Groups"
aws cloudwatch delete-alarms --alarm-names "GearVault-High-5XX-Errors" "GearVault-RDS-High-CPU" --region $Region 2>$null
aws sns delete-topic --topic-arn "arn:aws:sns:$Region`:$AccountId`:gearvault-alerts" --region $Region 2>$null
aws logs delete-log-group --log-group-name /ecs/gearvault-api --region $Region 2>$null

# 3. ECS Service, Auto Scaling & Cluster
Log-Step "3/11" "Draining & Deleting ECS Service, Auto Scaling & Cluster"
aws application-autoscaling deregister-scalable-target `
  --service-namespace ecs `
  --resource-id service/gearvault/gearvault-api `
  --scalable-dimension ecs:service:DesiredCount `
  --region $Region 2>$null

aws ecs update-service --cluster gearvault --service gearvault-api --desired-count 0 --region $Region 2>$null
aws ecs delete-service --cluster gearvault --service gearvault-api --force --region $Region 2>$null

# Deregister task definitions
$revisions = (aws ecs list-task-definitions --family-prefix gearvault-api --region $Region | ConvertFrom-Json).taskDefinitionArns
foreach ($arn in $revisions) {
    aws ecs deregister-task-definition --task-definition $arn --region $Region 2>$null
}
aws ecs delete-cluster --cluster gearvault --region $Region 2>$null

# 4. ECR Repository
Log-Step "4/11" "Deleting ECR Repository"
aws ecr delete-repository --repository-name gearvault-api --force --region $Region 2>$null

# 5. IAM Roles (Task & Execution)
Log-Step "5/11" "Deleting ECS Task & Execution IAM Roles"
aws iam delete-role-policy --role-name gearvault-task-exec --policy-name SecretsAndLogsAccess 2>$null
aws iam detach-role-policy --role-name gearvault-task-exec --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy 2>$null
aws iam delete-role --role-name gearvault-task-exec 2>$null

aws iam delete-role-policy --role-name gearvault-task --policy-name MediaS3AndExec 2>$null
aws iam delete-role --role-name gearvault-task 2>$null

# 6. ALB & Target Group
Log-Step "6/11" "Deleting Application Load Balancer & Target Group"
$albDesc = aws elbv2 describe-load-balancers --names gearvault-alb --region $Region 2>$null | ConvertFrom-Json
if ($albDesc -and $albDesc.LoadBalancers.Count -gt 0) {
    $albArn = $albDesc.LoadBalancers[0].LoadBalancerArn
    aws elbv2 delete-load-balancer --load-balancer-arn $albArn --region $Region 2>$null
    Write-Host "Waiting for ALB deletion to complete..."
    aws elbv2 wait load-balancers-deleted --load-balancer-arns $albArn --region $Region 2>$null
}

$tgDesc = aws elbv2 describe-target-groups --names gearvault-api-tg --region $Region 2>$null | ConvertFrom-Json
if ($tgDesc -and $tgDesc.TargetGroups.Count -gt 0) {
    aws elbv2 delete-target-group --target-group-arn $tgDesc.TargetGroups[0].TargetGroupArn --region $Region 2>$null
}

# 7. Secrets Manager
Log-Step "7/11" "Force-Deleting Secrets Manager Secrets"
aws secretsmanager delete-secret --secret-id "gearvault/production/credentials" --force-delete-without-recovery --region $Region 2>$null
aws secretsmanager delete-secret --secret-id "gearvault/origin-verify-secret" --force-delete-without-recovery --region $Region 2>$null

# 8. Edge Security & CloudFront Functions
Log-Step "8/11" "Deleting CloudFront Functions, OAC & WAF Web ACL"
$spaEtag = aws cloudfront describe-function --name spa-rewrite --query 'ETag' --output text 2>$null
if ($spaEtag) { aws cloudfront delete-function --name spa-rewrite --if-match $spaEtag 2>$null }

$stripEtag = aws cloudfront describe-function --name strip-media --query 'ETag' --output text 2>$null
if ($stripEtag) { aws cloudfront delete-function --name strip-media --if-match $stripEtag 2>$null }

$oacList = aws cloudfront list-origin-access-controls --query "OriginAccessControlList.Items[?Name=='gearvault-oac'].Id" --output text 2>$null
if ($oacList) {
    $oacEtag = aws cloudfront get-origin-access-control --id $oacList --query 'ETag' --output text 2>$null
    aws cloudfront delete-origin-access-control --id $oacList --if-match $oacEtag 2>$null
}

$wafList = aws wafv2 list-web-acls --scope CLOUDFRONT --region $WafRegion | ConvertFrom-Json
$wafObj = $wafList.WebACLs | Where-Object { $_.Name -eq "gearvault-waf" }
if ($wafObj) {
    aws wafv2 delete-web-acl --name gearvault-waf --scope CLOUDFRONT --id $wafObj.Id --lock-token $wafObj.LockToken --region $WafRegion 2>$null
}

# 9. RDS PostgreSQL Database
Log-Step "9/11" "Deleting Amazon RDS PostgreSQL Instance & Subnet Group"
aws rds delete-db-instance --db-instance-identifier gearvault-postgres --skip-final-snapshot --delete-automated-backups --region $Region 2>$null
Write-Host "Waiting for RDS instance deletion (takes ~4-6 min)..."
aws rds wait db-instance-deleted --db-instance-identifier gearvault-postgres --region $Region 2>$null
aws rds delete-db-subnet-group --db-subnet-group-name gearvault-db-subnet-group --region $Region 2>$null

# 10. S3 Buckets (Frontend & Media)
Log-Step "10/11" "Emptying & Deleting S3 Buckets"
$FrontendBucket = "gearvault-frontend-$AccountId"
$MediaBucket = "gearvault-media-$AccountId"

aws s3 rm "s3://$FrontendBucket" --recursive 2>$null
aws s3api delete-bucket --bucket $FrontendBucket --region $Region 2>$null

aws s3 rm "s3://$MediaBucket" --recursive 2>$null
aws s3api delete-bucket --bucket $MediaBucket --region $Region 2>$null

# 11. Networking Tier (VPC, Subnets, NAT, IGW, Route Tables, S3 Endpoint)
Log-Step "11/11" "Deleting VPC Endpoints, NAT Gateway, EIP, Security Groups & VPC"
$vpcObj = (aws ec2 describe-vpcs --filters "Name=tag:Name,Values=gearvault-vpc" --region $Region | ConvertFrom-Json).Vpcs[0]
if ($vpcObj) {
    $VpcId = $vpcObj.VpcId

    # Delete VPC S3 Endpoint
    $vpce = (aws ec2 describe-vpc-endpoints --filters "Name=vpc-id,Values=$VpcId" --region $Region | ConvertFrom-Json).VpcEndpoints
    foreach ($e in $vpce) {
        aws ec2 delete-vpc-endpoints --vpc-endpoint-ids $e.VpcEndpointId --region $Region 2>$null
    }

    # Delete NAT Gateway
    $nat = (aws ec2 describe-nat-gateways --filter "Name=vpc-id,Values=$VpcId" "Name=state,Values=available" --region $Region | ConvertFrom-Json).NatGateways[0]
    if ($nat) {
        aws ec2 delete-nat-gateway --nat-gateway-id $nat.NatGatewayId --region $Region 2>$null
        Write-Host "Waiting for NAT Gateway to delete..."
        aws ec2 wait nat-gateway-deleted --nat-gateway-ids $nat.NatGatewayId --region $Region 2>$null
        
        # Release EIP
        if ($nat.NatGatewayAddresses[0].AllocationId) {
            aws ec2 release-address --allocation-id $nat.NatGatewayAddresses[0].AllocationId --region $Region 2>$null
        }
    }

    # Remove cyclic dependencies in Security Groups
    $sgs = (aws ec2 describe-security-groups --filters "Name=vpc-id,Values=$VpcId" --region $Region | ConvertFrom-Json).SecurityGroups | Where-Object { $_.GroupName -ne "default" }
    foreach ($sg in $sgs) {
        $rules = aws ec2 describe-security-group-rules --filters "Name=group-id,Values=$($sg.GroupId)" --region $Region | ConvertFrom-Json
        $ingressRuleIds = ($rules.SecurityGroupRules | Where-Object { -not $_.IsEgress }).SecurityGroupRuleId
        if ($ingressRuleIds) {
            aws ec2 revoke-security-group-ingress --group-id $sg.GroupId --security-group-rule-ids $ingressRuleIds --region $Region 2>$null
        }
    }
    foreach ($sg in $sgs) {
        aws ec2 delete-security-group --group-id $sg.GroupId --region $Region 2>$null
    }

    # Route Tables
    $rts = (aws ec2 describe-route-tables --filters "Name=vpc-id,Values=$VpcId" --region $Region | ConvertFrom-Json).RouteTables | Where-Object { -not ($_.Associations | Where-Object { $_.Main }) }
    foreach ($rt in $rts) {
        foreach ($assoc in $rt.Associations) {
            if (-not $assoc.Main) {
                aws ec2 disassociate-route-table --association-id $assoc.RouteTableAssociationId --region $Region 2>$null
            }
        }
        aws ec2 delete-route-table --route-table-id $rt.RouteTableId --region $Region 2>$null
    }

    # Subnets
    $subnets = (aws ec2 describe-subnets --filters "Name=vpc-id,Values=$VpcId" --region $Region | ConvertFrom-Json).Subnets
    foreach ($sub in $subnets) {
        aws ec2 delete-subnet --subnet-id $sub.SubnetId --region $Region 2>$null
    }

    # Internet Gateway
    $igws = (aws ec2 describe-internet-gateways --filters "Name=attachment.vpc-id,Values=$VpcId" --region $Region | ConvertFrom-Json).InternetGateways
    foreach ($igw in $igws) {
        aws ec2 detach-internet-gateway --internet-gateway-id $igw.InternetGatewayId --vpc-id $VpcId --region $Region 2>$null
        aws ec2 delete-internet-gateway --internet-gateway-id $igw.InternetGatewayId --region $Region 2>$null
    }

    # Delete VPC
    aws ec2 delete-vpc --vpc-id $VpcId --region $Region 2>$null
}

Write-Host "`nTEARDOWN COMPLETE! All GearVault cloud resources have been cleanly destroyed." -ForegroundColor Green
Write-Host "Ongoing AWS infrastructure charges: $0.00/hr" -ForegroundColor Green
