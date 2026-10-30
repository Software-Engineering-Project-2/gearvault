<#
.SYNOPSIS
    GearVault - Complete Automated End-to-End Build & Deployment Script (Phases 0 to 11)
.DESCRIPTION
    Provisions and deploys the entire production infrastructure on AWS across 18 services:
    - VPC, 6 Subnets, NAT Gateway, EIP, Route Tables, S3 Gateway Endpoint, Security Groups
    - S3 Frontend & Media Buckets with Website Hosting and CORS
    - RDS PostgreSQL Multi-AZ Database with Subnet Group
    - AWS Secrets Manager (Credentials & Origin Secrets)
    - Application Load Balancer, Target Group & Listeners
    - ECR Repository, Docker Build (:v2) & Push
    - ECS Task Execution & Task IAM Roles
    - ECS Cluster, Fargate Service & Auto Scaling Policy
    - Schema Migration & Canonical Seed Tasks
    - Global AWS WAF Web ACL, CloudFront Functions & OAC
    - Amazon EventBridge Scheduler (Recurring 5-min cron task)
    - CloudWatch Metric Alarms & SNS Alert Topic
    - Frontend Vite Production Build & S3 Sync
    - Seeds Initial Manager, Staff & Customer Accounts
#>

[CmdletBinding()]
param(
    [string]$Region = "ap-south-1",
    [string]$WafRegion = "us-east-1",
    [string]$DbPassword = "6YKuOtdeRULP4jvHgZswYRjT"
)

$ErrorActionPreference = "Stop"

function Log-Step($phase, $msg) {
    Write-Host "`n========================================================" -ForegroundColor Cyan
    Write-Host " [$phase] $msg" -ForegroundColor Green
    Write-Host "========================================================" -ForegroundColor Cyan
}

# 0. Account Identification
Log-Step "PHASE 0" "Identifying AWS Caller & Environment"
$identity = aws sts get-caller-identity | ConvertFrom-Json
$AccountId = $identity.Account
Write-Host "AWS Account: $AccountId | Region: $Region"

$FrontendBucket = "gearvault-frontend-$AccountId"
$MediaBucket = "gearvault-media-$AccountId"
$JwtSecret = [System.Guid]::NewGuid().ToString("N") + [System.Guid]::NewGuid().ToString("N")
$OriginVerifySecret = [System.Guid]::NewGuid().ToString("N") + [System.Guid]::NewGuid().ToString("N")

# 1. Networking Tier (VPC & Subnets)
Log-Step "PHASE 1" "Creating VPC, Subnets, Gateways, Route Tables & Security Groups"
$vpc = aws ec2 create-vpc --cidr-block 10.0.0.0/16 --region $Region | ConvertFrom-Json
$VpcId = $vpc.Vpc.VpcId
aws ec2 create-tags --resources $VpcId --tags Key=Name,Value=gearvault-vpc --region $Region
aws ec2 modify-vpc-attribute --vpc-id $VpcId --enable-dns-hostnames "{\`"Value\`":true}" --region $Region

$igw = aws ec2 create-internet-gateway --region $Region | ConvertFrom-Json
$IgwId = $igw.InternetGateway.InternetGatewayId
aws ec2 create-tags --resources $IgwId --tags Key=Name,Value=gearvault-igw --region $Region
aws ec2 attach-internet-gateway --vpc-id $VpcId --internet-gateway-id $IgwId --region $Region

# Subnets
$pubA = (aws ec2 create-subnet --vpc-id $VpcId --cidr-block 10.0.1.0/24 --availability-zone "${Region}a" --region $Region | ConvertFrom-Json).Subnet.SubnetId
$pubB = (aws ec2 create-subnet --vpc-id $VpcId --cidr-block 10.0.2.0/24 --availability-zone "${Region}b" --region $Region | ConvertFrom-Json).Subnet.SubnetId
$appA = (aws ec2 create-subnet --vpc-id $VpcId --cidr-block 10.0.10.0/24 --availability-zone "${Region}a" --region $Region | ConvertFrom-Json).Subnet.SubnetId
$appB = (aws ec2 create-subnet --vpc-id $VpcId --cidr-block 10.0.20.0/24 --availability-zone "${Region}b" --region $Region | ConvertFrom-Json).Subnet.SubnetId
$dbA  = (aws ec2 create-subnet --vpc-id $VpcId --cidr-block 10.0.30.0/24 --availability-zone "${Region}a" --region $Region | ConvertFrom-Json).Subnet.SubnetId
$dbB  = (aws ec2 create-subnet --vpc-id $VpcId --cidr-block 10.0.40.0/24 --availability-zone "${Region}b" --region $Region | ConvertFrom-Json).Subnet.SubnetId

aws ec2 modify-subnet-attribute --subnet-id $pubA --map-public-ip-on-launch --region $Region
aws ec2 modify-subnet-attribute --subnet-id $pubB --map-public-ip-on-launch --region $Region

# NAT Gateway & Elastic IP
$eip = (aws ec2 allocate-address --domain vpc --region $Region | ConvertFrom-Json).AllocationId
$nat = (aws ec2 create-nat-gateway --subnet-id $pubA --allocation-id $eip --region $Region | ConvertFrom-Json).NatGateway.NatGatewayId
aws ec2 create-tags --resources $nat --tags Key=Name,Value=gearvault-nat --region $Region
Write-Host "Waiting for NAT Gateway ($nat) to become available..."
aws ec2 wait nat-gateway-available --nat-gateway-ids $nat --region $Region

# Route Tables
$pubRt = (aws ec2 create-route-table --vpc-id $VpcId --region $Region | ConvertFrom-Json).RouteTable.RouteTableId
aws ec2 create-tags --resources $pubRt --tags Key=Name,Value=gearvault-public-rt --region $Region
aws ec2 create-route --route-table-id $pubRt --destination-cidr-block 0.0.0.0/0 --gateway-id $IgwId --region $Region
aws ec2 associate-route-table --subnet-id $pubA --route-table-id $pubRt --region $Region
aws ec2 associate-route-table --subnet-id $pubB --route-table-id $pubRt --region $Region

$privRt = (aws ec2 create-route-table --vpc-id $VpcId --region $Region | ConvertFrom-Json).RouteTable.RouteTableId
aws ec2 create-tags --resources $privRt --tags Key=Name,Value=gearvault-private-rt --region $Region
aws ec2 create-route --route-table-id $privRt --destination-cidr-block 0.0.0.0/0 --nat-gateway-id $nat --region $Region
aws ec2 associate-route-table --subnet-id $appA --route-table-id $privRt --region $Region
aws ec2 associate-route-table --subnet-id $appB --route-table-id $privRt --region $Region
aws ec2 associate-route-table --subnet-id $dbA  --route-table-id $privRt --region $Region
aws ec2 associate-route-table --subnet-id $dbB  --route-table-id $privRt --region $Region

# VPC S3 Gateway Endpoint
aws ec2 create-vpc-endpoint --vpc-id $VpcId --service-name "com.amazonaws.$Region.s3" --route-table-ids $privRt --region $Region

# Security Groups
$albSg = (aws ec2 create-security-group --group-name gearvault-alb-sg --description "ALB Ingress SG" --vpc-id $VpcId --region $Region | ConvertFrom-Json).GroupId
$appSg = (aws ec2 create-security-group --group-name gearvault-app-sg --description "App Ingress SG" --vpc-id $VpcId --region $Region | ConvertFrom-Json).GroupId
$dbSg  = (aws ec2 create-security-group --group-name gearvault-db-sg  --description "DB Ingress SG"  --vpc-id $VpcId --region $Region | ConvertFrom-Json).GroupId

aws ec2 authorize-security-group-ingress --group-id $albSg --protocol tcp --port 80 --cidr 0.0.0.0/0 --region $Region
aws ec2 authorize-security-group-ingress --group-id $appSg --protocol tcp --port 5000 --source-group $albSg --region $Region
aws ec2 authorize-security-group-ingress --group-id $dbSg  --protocol tcp --port 5432 --source-group $appSg --region $Region

# 2. Object Storage Tier (S3)
Log-Step "PHASE 2" "Creating S3 Buckets for Frontend & Media"
aws s3api create-bucket --bucket $FrontendBucket --create-bucket-configuration LocationConstraint=$Region --region $Region
aws s3api create-bucket --bucket $MediaBucket --create-bucket-configuration LocationConstraint=$Region --region $Region

# Enable Static Website on Frontend Bucket
aws s3 website "s3://$FrontendBucket" --index-document index.html --error-document index.html --region $Region
aws s3api put-public-access-block --bucket $FrontendBucket --public-access-block-configuration BlockPublicAcls=false,IgnorePublicAcls=false,BlockPublicPolicy=false,RestrictPublicBuckets=false

$frontendPolicy = @"
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadGetObject",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::$FrontendBucket/*"
    }
  ]
}
"@
$frontendPolicy | Out-File -FilePath "scratch/deploy-frontend-policy.json" -Encoding utf8
aws s3api put-bucket-policy --bucket $FrontendBucket --policy file://scratch/deploy-frontend-policy.json

# 3. Database Tier (Amazon RDS Multi-AZ)
Log-Step "PHASE 3" "Creating RDS Subnet Group & Multi-AZ PostgreSQL Database"
aws rds create-db-subnet-group --db-subnet-group-name gearvault-db-subnet-group --db-subnet-group-description "DB Subnet Group" --subnet-ids $dbA $dbB --region $Region

aws rds create-db-instance `
  --db-instance-identifier gearvault-postgres `
  --db-name gearvault `
  --engine postgres `
  --engine-version 16.13 `
  --db-instance-class db.t4g.micro `
  --allocated-storage 20 `
  --storage-type gp3 `
  --master-username gearvault_admin `
  --master-user-password $DbPassword `
  --vpc-security-group-ids $dbSg `
  --db-subnet-group-name gearvault-db-subnet-group `
  --multi-az `
  --no-publicly-accessible `
  --backup-retention-period 1 `
  --storage-encrypted `
  --region $Region

Write-Host "Waiting for RDS instance (gearvault-postgres) to become available (takes ~8-10 min)..."
aws rds wait db-instance-available --db-instance-identifier gearvault-postgres --region $Region
$rdsDesc = aws rds describe-db-instances --db-instance-identifier gearvault-postgres --region $Region | ConvertFrom-Json
$DbEndpoint = $rdsDesc.DBInstances[0].Endpoint.Address

# 4. Secrets Management
Log-Step "PHASE 4" "Creating Secrets Manager Secrets"
$dbUrl = "postgresql://gearvault_admin:$DbPassword@${DbEndpoint}:5432/gearvault?sslmode=require"
$credsObj = @{ DATABASE_URL = $dbUrl; JWT_SECRET_KEY = $JwtSecret } | ConvertTo-Json -Compress
aws secretsmanager create-secret --name "gearvault/production/credentials" --secret-string $credsObj --region $Region
aws secretsmanager create-secret --name "gearvault/origin-verify-secret" --secret-string $OriginVerifySecret --region $Region

# 5. Ingress Tier (Application Load Balancer)
Log-Step "PHASE 5" "Creating Target Group, Application Load Balancer & Port 80 Listener"
$tg = (aws elbv2 create-target-group --name gearvault-api-tg --protocol HTTP --port 5000 --vpc-id $VpcId --target-type ip --health-check-path "/api/health" --health-check-interval-seconds 15 --healthy-threshold-count 2 --unhealthy-threshold-count 3 --region $Region | ConvertFrom-Json).TargetGroups[0].TargetGroupArn

$alb = (aws elbv2 create-load-balancer --name gearvault-alb --subnets $pubA $pubB --security-groups $albSg --scheme internet-facing --type application --region $Region | ConvertFrom-Json).LoadBalancers[0]
$AlbArn = $alb.LoadBalancerArn
$AlbDns = $alb.DNSName

Write-Host "Waiting for ALB ($AlbArn) to become active..."
aws elbv2 wait load-balancer-available --load-balancer-arns $AlbArn --region $Region

aws elbv2 create-listener --load-balancer-arn $AlbArn --protocol HTTP --port 80 --default-actions Type=forward,TargetGroupArn=$tg --region $Region

# 6. Container Registry & IAM Roles
Log-Step "PHASE 6" "Creating ECR, IAM Task Roles, Building & Pushing Docker Image"
aws ecr create-repository --repository-name gearvault-api --image-scanning-configuration scanOnPush=true --region $Region
$EcrUri = "$AccountId.dkr.ecr.$Region.amazonaws.com/gearvault-api"

# IAM Roles
$execTrust = '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"ecs-tasks.amazonaws.com"},"Action":"sts:AssumeRole"}]}'
$execTrust | Out-File -FilePath "scratch/deploy-task-trust.json" -Encoding utf8
aws iam create-role --role-name gearvault-task-exec --assume-role-policy-document file://scratch/deploy-task-trust.json
aws iam attach-role-policy --role-name gearvault-task-exec --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy

$execInline = @"
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["secretsmanager:GetSecretValue", "logs:CreateLogGroup"],
      "Resource": "*"
    }
  ]
}
"@
$execInline | Out-File -FilePath "scratch/deploy-exec-inline.json" -Encoding utf8
aws iam put-role-policy --role-name gearvault-task-exec --policy-name SecretsAndLogsAccess --policy-document file://scratch/deploy-exec-inline.json

aws iam create-role --role-name gearvault-task --assume-role-policy-document file://scratch/deploy-task-trust.json

# Docker Build & Push
aws ecr get-login-password --region $Region | docker login --username AWS --password-stdin "$AccountId.dkr.ecr.$Region.amazonaws.com"
docker build --platform linux/amd64 -t "$EcrUri`:v2" backend
docker push "$EcrUri`:v2"

# 7. ECS Cluster, Task Definition, Migrations & Seed
Log-Step "PHASE 7" "Creating ECS Cluster & Registering Task Definition"
aws ecs create-cluster --cluster-name gearvault --region $Region
aws logs create-log-group --log-group-name /ecs/gearvault-api --region $Region

$tdJson = @"
{
  "family": "gearvault-api",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "512",
  "memory": "1024",
  "executionRoleArn": "arn:aws:iam::$AccountId:role/gearvault-task-exec",
  "taskRoleArn": "arn:aws:iam::$AccountId:role/gearvault-task",
  "containerDefinitions": [
    {
      "name": "api",
      "image": "$EcrUri`:v2",
      "essential": true,
      "portMappings": [{"containerPort": 5000, "protocol": "tcp"}],
      "environment": [
        {"name": "FLASK_ENV", "value": "production"},
        {"name": "PORT", "value": "5000"},
        {"name": "WEB_CONCURRENCY", "value": "2"},
        {"name": "PROXY_FIX_FOR", "value": "2"},
        {"name": "AWS_REGION", "value": "$Region"},
        {"name": "S3_BUCKET", "value": "$MediaBucket"},
        {"name": "CORS_ORIGINS", "value": "http://$FrontendBucket.s3-website.$Region.amazonaws.com,http://localhost:3000,http://localhost:5173"}
      ],
      "secrets": [
        {"name": "DATABASE_URL", "valueFrom": "arn:aws:secretsmanager:$Region`:$AccountId`:secret:gearvault/production/credentials:DATABASE_URL::"},
        {"name": "JWT_SECRET_KEY", "valueFrom": "arn:aws:secretsmanager:$Region`:$AccountId`:secret:gearvault/production/credentials:JWT_SECRET_KEY::"}
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/gearvault-api",
          "awslogs-region": "$Region",
          "awslogs-stream-prefix": "ecs"
        }
      },
      "healthCheck": {
        "command": ["CMD-SHELL", "curl -f http://localhost:5000/api/health || exit 1"],
        "interval": 30,
        "timeout": 5,
        "retries": 3,
        "startPeriod": 15
      }
    }
  ]
}
"@
$tdJson | Out-File -FilePath "scratch/deploy-td.json" -Encoding utf8
aws ecs register-task-definition --cli-input-json file://scratch/deploy-td.json --region $Region

# Run Migration & Seed
Write-Host "Running database migrations..."
$migTask = aws ecs run-task --cluster gearvault --task-definition gearvault-api --launch-type FARGATE --network-configuration "awsvpcConfiguration={subnets=[$appA],securityGroups=[$appSg],assignPublicIp=DISABLED}" --overrides '{"containerOverrides":[{"name":"api","command":["flask","db","upgrade"]}]}' --region $Region | ConvertFrom-Json
aws ecs wait tasks-stopped --cluster gearvault --tasks $migTask.tasks[0].taskArn --region $Region

Write-Host "Running database canonical seed..."
$seedTask = aws ecs run-task --cluster gearvault --task-definition gearvault-api --launch-type FARGATE --network-configuration "awsvpcConfiguration={subnets=[$appA],securityGroups=[$appSg],assignPublicIp=DISABLED}" --overrides '{"containerOverrides":[{"name":"api","command":["flask","seed"]}]}' --region $Region | ConvertFrom-Json
aws ecs wait tasks-stopped --cluster gearvault --tasks $seedTask.tasks[0].taskArn --region $Region

# 8. ECS Fargate Service & Auto Scaling
Log-Step "PHASE 8" "Creating ECS Service with Circuit Breaker & Target Tracking Auto Scaling"
aws ecs create-service `
  --cluster gearvault `
  --service-name gearvault-api `
  --task-definition gearvault-api `
  --desired-count 2 `
  --launch-type FARGATE `
  --network-configuration "awsvpcConfiguration={subnets=[$appA,$appB],securityGroups=[$appSg],assignPublicIp=DISABLED}" `
  --load-balancers "targetGroupArn=$tg,containerName=api,containerPort=5000" `
  --deployment-configuration "deploymentCircuitBreaker={enable=true,rollback=true},maximumPercent=200,minimumHealthyPercent=100" `
  --region $Region

# Auto Scaling Target & Policy (60% CPU)
aws application-autoscaling register-scalable-target `
  --service-namespace ecs `
  --resource-id service/gearvault/gearvault-api `
  --scalable-dimension ecs:service:DesiredCount `
  --min-capacity 2 `
  --max-capacity 4 `
  --region $Region

$scalePolicy = @"
{
  "TargetValue": 60.0,
  "PredefinedMetricSpecification": { "PredefinedMetricType": "ECSServiceAverageCPUUtilization" },
  "ScaleOutCooldown": 60,
  "ScaleInCooldown": 300
}
"@
$scalePolicy | Out-File -FilePath "scratch/deploy-scale-policy.json" -Encoding utf8
aws application-autoscaling put-scaling-policy `
  --policy-name ecs-cpu-target-tracking `
  --service-namespace ecs `
  --resource-id service/gearvault/gearvault-api `
  --scalable-dimension ecs:service:DesiredCount `
  --policy-type TargetTrackingScaling `
  --target-tracking-scaling-policy-configuration file://scratch/deploy-scale-policy.json `
  --region $Region

# 9. Edge Security & Ingress Config (WAF, CloudFront Functions, OAC & Multi-Origin Distribution)
Log-Step "PHASE 9" "Configuring Global WAF Web ACL, CloudFront Functions, OAC & Distribution"

# Global WAF Web ACL (CloudFront scope must be in us-east-1)
$wafArn = ""
$existingWaf = aws wafv2 list-web-acls --scope CLOUDFRONT --region us-east-1 2>$null | ConvertFrom-Json
$wafObj = $existingWaf.WebACLs | Where-Object { $_.Name -eq "gearvault-waf" }
if ($wafObj) {
    $wafArn = $wafObj.ARN
} else {
    $wafInput = @"
{
  "Name": "gearvault-waf",
  "Scope": "CLOUDFRONT",
  "DefaultAction": { "Allow": {} },
  "Rules": [
    {
      "Name": "AWS-AWSManagedRulesCommonRuleSet",
      "Priority": 0,
      "Statement": {
        "ManagedRuleGroupStatement": {
          "VendorName": "AWS",
          "Name": "AWSManagedRulesCommonRuleSet"
        }
      },
      "OverrideAction": { "None": {} },
      "VisibilityConfig": {
        "SampledRequestsEnabled": true,
        "CloudWatchMetricsEnabled": true,
        "MetricName": "gearvault-crs"
      }
    }
  ],
  "VisibilityConfig": {
    "SampledRequestsEnabled": true,
    "CloudWatchMetricsEnabled": true,
    "MetricName": "gearvault-waf"
  }
}
"@
    $wafInput | Out-File -FilePath "scratch/deploy-waf-input.json" -Encoding utf8
    $wafArn = (aws wafv2 create-web-acl --cli-input-json file://scratch/deploy-waf-input.json --region us-east-1 | ConvertFrom-Json).Summary.ARN
}

# CloudFront Functions
$spaArn = (aws cloudfront describe-function --name spa-rewrite 2>$null | ConvertFrom-Json).FunctionSummary.FunctionMetadata.FunctionARN
if (-not $spaArn) {
    aws cloudfront create-function --name spa-rewrite --function-config '{"Comment":"Rewrite SPA client routes","Runtime":"cloudfront-js-2.0"}' --function-code 'function handler(event) { var request = event.request; var uri = request.uri; if (!uri.includes(".") && !uri.startsWith("/api") && !uri.startsWith("/media")) { request.uri = "/index.html"; } return request; }' 2>$null | Out-Null
    aws cloudfront publish-function --name spa-rewrite --if-match (aws cloudfront describe-function --name spa-rewrite --query 'ETag' --output text) 2>$null | Out-Null
    $spaArn = (aws cloudfront describe-function --name spa-rewrite | ConvertFrom-Json).FunctionSummary.FunctionMetadata.FunctionARN
}

$stripArn = (aws cloudfront describe-function --name strip-media 2>$null | ConvertFrom-Json).FunctionSummary.FunctionMetadata.FunctionARN
if (-not $stripArn) {
    aws cloudfront create-function --name strip-media --function-config '{"Comment":"Strip /media prefix","Runtime":"cloudfront-js-2.0"}' --function-code 'function handler(event) { var request = event.request; request.uri = request.uri.replace(/^\/media/, ""); return request; }' 2>$null | Out-Null
    aws cloudfront publish-function --name strip-media --if-match (aws cloudfront describe-function --name strip-media --query 'ETag' --output text) 2>$null | Out-Null
    $stripArn = (aws cloudfront describe-function --name strip-media | ConvertFrom-Json).FunctionSummary.FunctionMetadata.FunctionARN
}

# CloudFront OAC
$oacId = (aws cloudfront list-origin-access-controls --query "OriginAccessControlList.Items[?Name=='gearvault-oac'].Id" --output text 2>$null)
if (-not $oacId -or $oacId -eq "None") {
    $oacResp = aws cloudfront create-origin-access-control --origin-access-control-config '{"Name":"gearvault-oac","Description":"OAC for GearVault S3","SigningProtocol":"sigv4","SigningBehavior":"always","OriginAccessControlOriginType":"s3"}' | ConvertFrom-Json
    $oacId = $oacResp.OriginAccessControl.Id
}

# CloudFront Multi-Origin Distribution
$cfDistId = (aws cloudfront list-distributions --query "DistributionList.Items[?Comment=='GearVault Production Multi-Origin Distribution'].Id" --output text 2>$null)
$cfDomain = ""
if (-not $cfDistId -or $cfDistId -eq "None") {
    $distConfig = @"
{
  "CallerReference": "gearvault-$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())",
  "Comment": "GearVault Production Multi-Origin Distribution",
  "Enabled": true,
  "WebACLId": "$wafArn",
  "Origins": {
    "Quantity": 3,
    "Items": [
      {
        "Id": "frontend-s3",
        "DomainName": "$FrontendBucket.s3.$Region.amazonaws.com",
        "OriginAccessControlId": "$oacId",
        "S3OriginConfig": { "OriginAccessIdentity": "" }
      },
      {
        "Id": "media-s3",
        "DomainName": "$MediaBucket.s3.$Region.amazonaws.com",
        "OriginAccessControlId": "$oacId",
        "S3OriginConfig": { "OriginAccessIdentity": "" }
      },
      {
        "Id": "alb-api",
        "DomainName": "$AlbDns",
        "CustomOriginConfig": {
          "HTTPPort": 80,
          "HTTPSPort": 443,
          "OriginProtocolPolicy": "http-only",
          "OriginSslProtocols": { "Quantity": 1, "Items": ["TLSv1.2"] },
          "OriginReadTimeout": 30,
          "OriginKeepaliveTimeout": 5
        },
        "CustomHeaders": {
          "Quantity": 1,
          "Items": [{ "HeaderName": "X-Origin-Verify", "HeaderValue": "$OriginVerifySecret" }]
        }
      }
    ]
  },
  "DefaultCacheBehavior": {
    "TargetOriginId": "frontend-s3",
    "ViewerProtocolPolicy": "redirect-to-https",
    "AllowedMethods": { "Quantity": 2, "Items": ["GET", "HEAD"], "CachedMethods": { "Quantity": 2, "Items": ["GET", "HEAD"] } },
    "CachePolicyId": "658327ea-f89d-4fab-a63d-7e88639e58f6",
    "FunctionAssociations": { "Quantity": 1, "Items": [{ "FunctionARN": "$spaArn", "EventType": "viewer-request" }] },
    "Compress": true
  },
  "CacheBehaviors": {
    "Quantity": 2,
    "Items": [
      {
        "PathPattern": "/api/*",
        "TargetOriginId": "alb-api",
        "ViewerProtocolPolicy": "redirect-to-https",
        "AllowedMethods": { "Quantity": 7, "Items": ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"], "CachedMethods": { "Quantity": 2, "Items": ["GET", "HEAD"] } },
        "CachePolicyId": "4135ea2d-6df8-44a3-9df3-4b5a84be39ad",
        "OriginRequestPolicyId": "b689b0a8-53d0-40ab-baf2-68738e2966ac",
        "Compress": true
      },
      {
        "PathPattern": "/media/*",
        "TargetOriginId": "media-s3",
        "ViewerProtocolPolicy": "redirect-to-https",
        "AllowedMethods": { "Quantity": 2, "Items": ["GET", "HEAD"], "CachedMethods": { "Quantity": 2, "Items": ["GET", "HEAD"] } },
        "CachePolicyId": "658327ea-f89d-4fab-a63d-7e88639e58f6",
        "FunctionAssociations": { "Quantity": 1, "Items": [{ "FunctionARN": "$stripArn", "EventType": "viewer-request" }] },
        "Compress": true
      }
    ]
  }
}
"@
    $distConfig | Out-File -FilePath "scratch/deploy-cf-dist.json" -Encoding utf8
    $distResp = aws cloudfront create-distribution --distribution-config file://scratch/deploy-cf-dist.json | ConvertFrom-Json
    $cfDistId = $distResp.Distribution.Id
    $cfDomain = $distResp.Distribution.DomainName
} else {
    $cfDomain = (aws cloudfront get-distribution --id $cfDistId | ConvertFrom-Json).Distribution.DomainName
}

# Attach S3 bucket policies for CloudFront OAC access
$s3OacPolicy = @"
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowCloudFrontOAC",
      "Effect": "Allow",
      "Principal": { "Service": "cloudfront.amazonaws.com" },
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::$FrontendBucket/*",
      "Condition": { "StringEquals": { "AWS:SourceArn": "arn:aws:cloudfront::$AccountId`:distribution/$cfDistId" } }
    },
    {
      "Sid": "PublicReadGetObject",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::$FrontendBucket/*"
    }
  ]
}
"@
$s3OacPolicy | Out-File -FilePath "scratch/deploy-frontend-oac.json" -Encoding utf8
aws s3api put-bucket-policy --bucket $FrontendBucket --policy file://scratch/deploy-frontend-oac.json 2>$null | Out-Null

$mediaOacPolicy = @"
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowCloudFrontOAC",
      "Effect": "Allow",
      "Principal": { "Service": "cloudfront.amazonaws.com" },
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::$MediaBucket/*",
      "Condition": { "StringEquals": { "AWS:SourceArn": "arn:aws:cloudfront::$AccountId`:distribution/$cfDistId" } }
    }
  ]
}
"@
$mediaOacPolicy | Out-File -FilePath "scratch/deploy-media-oac.json" -Encoding utf8
aws s3api put-bucket-policy --bucket $MediaBucket --policy file://scratch/deploy-media-oac.json 2>$null | Out-Null

# 10. Background Automation Tier (Amazon EventBridge Scheduler)
Log-Step "PHASE 10" "Creating EventBridge Scheduler Role & 5-Minute Recurring Job"
$schedTrust = '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"scheduler.amazonaws.com"},"Action":"sts:AssumeRole"}]}'
$schedTrust | Out-File -FilePath "scratch/deploy-sched-trust.json" -Encoding utf8
aws iam create-role --role-name gearvault-scheduler-role --assume-role-policy-document file://scratch/deploy-sched-trust.json
aws iam attach-role-policy --role-name gearvault-scheduler-role --policy-arn arn:aws:iam::aws:policy/AmazonECS_FullAccess

$schedPassRole = '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Action":"iam:PassRole","Resource":"arn:aws:iam::' + $AccountId + ':role/gearvault-task*"}]}'
$schedPassRole | Out-File -FilePath "scratch/deploy-sched-passrole.json" -Encoding utf8
aws iam put-role-policy --role-name gearvault-scheduler-role --policy-name SchedulerPassRole --policy-document file://scratch/deploy-sched-passrole.json

$schedTarget = @"
{
  "Arn": "arn:aws:ecs:$Region`:$AccountId`:cluster/gearvault",
  "RoleArn": "arn:aws:iam::$AccountId`:role/gearvault-scheduler-role",
  "Input": "{\"containerOverrides\":[{\"name\":\"api\",\"command\":[\"flask\",\"jobs\",\"run\"]}]}",
  "EcsParameters": {
    "TaskDefinitionArn": "arn:aws:ecs:$Region`:$AccountId`:task-definition/gearvault-api",
    "LaunchType": "FARGATE",
    "NetworkConfiguration": {
      "awsvpcConfiguration": {
        "Subnets": ["$appA"],
        "SecurityGroups": ["$appSg"],
        "AssignPublicIp": "DISABLED"
      }
    }
  }
}
"@
$schedTarget | Out-File -FilePath "scratch/deploy-sched-target.json" -Encoding utf8
aws scheduler create-schedule --name gearvault-run-jobs --schedule-expression "rate(5 minutes)" --flexible-time-window Mode=OFF --target file://scratch/deploy-sched-target.json --region $Region

# 11. Observability Tier & Frontend Deployment
Log-Step "PHASE 11" "Creating SNS Topic, CloudWatch Alarms, Building & Syncing Frontend"
$sns = (aws sns create-topic --name gearvault-alerts --region $Region | ConvertFrom-Json).TopicArn

# Alarms
aws cloudwatch put-metric-alarm `
  --alarm-name "GearVault-High-5XX-Errors" `
  --metric-name HTTPCode_Target_5XX_Count `
  --namespace AWS/ApplicationELB `
  --statistic Sum `
  --period 300 `
  --evaluation-periods 1 `
  --threshold 10 `
  --comparison-operator GreaterThanThreshold `
  --dimensions Name=LoadBalancer,Value=$alb.LoadBalancerName `
  --alarm-actions $sns `
  --region $Region

aws cloudwatch put-metric-alarm `
  --alarm-name "GearVault-RDS-High-CPU" `
  --metric-name CPUUtilization `
  --namespace AWS/RDS `
  --statistic Average `
  --period 300 `
  --evaluation-periods 2 `
  --threshold 80 `
  --comparison-operator GreaterThanThreshold `
  --dimensions Name=DBInstanceIdentifier,Value=gearvault-postgres `
  --alarm-actions $sns `
  --region $Region

# Build Frontend (using relative /api for unified CloudFront CDN origin proxying)
Set-Location frontend
"VITE_API_URL=/api" | Out-File -FilePath ".env.production" -Encoding utf8
npm run build
aws s3 sync dist/ "s3://$FrontendBucket" --delete --region $Region
Set-Location ..

Write-Host "`n========================================================" -ForegroundColor Green
Write-Host "                DEPLOYMENT COMPLETE!                    " -ForegroundColor Green
Write-Host "========================================================" -ForegroundColor Green
if ($cfDomain) {
    Write-Host "🚀 Live CloudFront URL (Primary): https://$cfDomain" -ForegroundColor Green
}
Write-Host "🌐 S3 Website Hosting: http://$FrontendBucket.s3-website.$Region.amazonaws.com" -ForegroundColor Cyan
Write-Host "🔌 Direct ALB Endpoint: http://$AlbDns/api/health" -ForegroundColor Cyan
Write-Host "📦 Equipment seeded: 11 items with authentic product photos" -ForegroundColor Yellow

