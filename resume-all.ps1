<#
.SYNOPSIS
    GearVault - Resume All Compute & Database (Instant Wake-Up)
.DESCRIPTION
    Brings the paused infrastructure back online:
    1. Starts Amazon RDS PostgreSQL instance and waits for it to become available
    2. Enables EventBridge 5-minute cron schedule
    3. Scales ECS Fargate tasks back to 2 desired tasks
    
    The entire application will be live again within 2-3 minutes!
#>

[CmdletBinding()]
param(
    [string]$Region = "ap-south-1"
)

Write-Host "`n========================================================" -ForegroundColor Cyan
Write-Host " RESUMING GEARVAULT PRODUCTION INFRASTRUCTURE" -ForegroundColor Green
Write-Host "========================================================" -ForegroundColor Cyan

# 1. Start Amazon RDS PostgreSQL
Write-Host "`n[1/3] Starting Amazon RDS PostgreSQL (gearvault-postgres)..." -ForegroundColor Cyan
try {
    aws rds start-db-instance --db-instance-identifier gearvault-postgres --region $Region
    Write-Host "Waiting for database to become available (takes ~1-2 min)..."
    aws rds wait db-instance-available --db-instance-identifier gearvault-postgres --region $Region
    Write-Host "Database is online and available!" -ForegroundColor Green
} catch {
    Write-Host "RDS instance was already available or starting." -ForegroundColor Yellow
}

# 2. Enable EventBridge Scheduler
Write-Host "`n[2/3] Enabling EventBridge Scheduler (gearvault-run-jobs)..." -ForegroundColor Cyan
aws scheduler update-schedule --name gearvault-run-jobs --state ENABLED --region $Region
Write-Host "EventBridge 5-minute recurring background job enabled!" -ForegroundColor Green

# 3. Scale ECS Fargate Tasks to 2
Write-Host "`n[3/3] Scaling ECS Fargate service (gearvault-api) to 2 tasks..." -ForegroundColor Cyan
aws ecs update-service --cluster gearvault --service gearvault-api --desired-count 2 --region $Region
Write-Host "ECS tasks booting up across Availability Zones..." -ForegroundColor Green

Write-Host "`n========================================================" -ForegroundColor Green
Write-Host " GEARVAULT IS FULLY RESUMED & ONLINE!" -ForegroundColor Green
Write-Host "========================================================" -ForegroundColor Green
Write-Host "Frontend URL: http://gearvault-frontend-852544369619.s3-website.ap-south-1.amazonaws.com"
Write-Host "ALB Health: http://gearvault-alb-826579585.ap-south-1.elb.amazonaws.com/api/health"
