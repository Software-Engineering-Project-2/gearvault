<#
.SYNOPSIS
    GearVault - Pause All Compute & Database (Cost-Saving Sleep Mode)
.DESCRIPTION
    Suspends active compute instances to save money without deleting any infrastructure or losing data:
    1. Scales ECS Fargate tasks to 0 (Stops container billing to $0.00)
    2. Disables EventBridge 5-minute cron schedule
    3. Stops Amazon RDS PostgreSQL instance (Stops DB compute billing)
    
    All database tables, data, configurations, and endpoints remain completely intact!
#>

[CmdletBinding()]
param(
    [string]$Region = "ap-south-1"
)

Write-Host "`n========================================================" -ForegroundColor Yellow
Write-Host " PAUSING GEARVAULT PRODUCTION INFRASTRUCTURE" -ForegroundColor Magenta
Write-Host "========================================================" -ForegroundColor Yellow

# 1. Scale ECS Fargate Tasks to 0
Write-Host "`n[1/3] Scaling ECS Fargate service (gearvault-api) to 0 tasks..." -ForegroundColor Cyan
aws ecs update-service --cluster gearvault --service gearvault-api --desired-count 0 --region $Region
Write-Host "ECS compute billing suspended (desiredCount = 0)." -ForegroundColor Green

# 2. Disable EventBridge Scheduler
Write-Host "`n[2/3] Pausing EventBridge Scheduler (gearvault-run-jobs)..." -ForegroundColor Cyan
aws scheduler update-schedule --name gearvault-run-jobs --state DISABLED --region $Region
Write-Host "EventBridge 5-minute recurring background job disabled." -ForegroundColor Green

# 3. Stop RDS PostgreSQL Database
Write-Host "`n[3/3] Stopping Amazon RDS PostgreSQL (gearvault-postgres)..." -ForegroundColor Cyan
try {
    aws rds stop-db-instance --db-instance-identifier gearvault-postgres --region $Region
    Write-Host "RDS instance stop initiated. (Takes ~2-3 min to enter 'stopped' state)." -ForegroundColor Green
} catch {
    Write-Warning "Could not stop RDS instance directly: $_"
}

Write-Host "`n========================================================" -ForegroundColor Green
Write-Host " GEARVAULT IS NOW PAUSED (SLEEP MODE ACTIVE)!" -ForegroundColor Green
Write-Host "========================================================" -ForegroundColor Green
Write-Host "Compute charges (ECS & RDS) are now suspended."
Write-Host "To bring everything back online, simply run: .\resume-all.ps1" -ForegroundColor Yellow
