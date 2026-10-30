# GearVault — Cloud Architecture Figures

Figures are generated from `src/make_gearvault_figs.py` (`py -I src/make_gearvault_figs.py <out_dir>` writes SVGs;
PNGs were rendered at 2x with headless Edge).

| Fig | File | Shows |
|-----|------|-------|
| 1 | `fig1_overall_architecture` | Whole system: edge, VPC, compute, data, managed services |
| 2 | `fig2_network_topology` | 2 AZs × 3 subnet tiers, route tables, security-group chain |
| 3 | `fig3_request_routing` | WAF → CloudFront behaviours → S3 / ALB → Fargate → RDS |
| 4 | `fig4_deployment_pipeline` | `deploy-all.ps1` Phases 0–11 |
| 5 | `fig5_compute_containers` | Source → Docker → ECR → task def → service → tasks, scaling |
| 6 | `fig6_media_upload` | Presigned-URL upload and the two read paths |
| 7 | `fig7_jobs_observability` | EventBridge jobs; CloudWatch → alarms → SNS |
| 8 | `fig8_operations_lifecycle` | deploy / pause / resume / teardown runbooks |
| 9 | `fig9_dev_prod_parity` | docker-compose services vs. AWS counterparts |

## AWS resources (region ap-south-1 unless noted)

| # | Service | Resource(s) | Configuration |
|---|---------|-------------|---------------|
| 1 | Amazon VPC | `gearvault-vpc` | 10.0.0.0/16, DNS hostnames on |
| 2 | Subnets | 2 public, 2 private-app, 2 private-data | 10.0.1/2.0/24 · 10.0.10/20.0/24 · 10.0.30/40.0/24 across ap-south-1a/b |
| 3 | Internet Gateway | `gearvault-igw` | attached to VPC |
| 4 | NAT Gateway + Elastic IP | `gearvault-nat` | single NAT in public subnet A (cost-optimised) |
| 5 | Route tables | `gearvault-public-rt`, `gearvault-private-rt` | 0.0.0.0/0 → IGW / → NAT |
| 6 | VPC Gateway Endpoint | S3 (`com.amazonaws.ap-south-1.s3`) | on private route table |
| 7 | Security groups | `gearvault-alb-sg`, `gearvault-app-sg`, `gearvault-db-sg` | 80 from CloudFront prefix list → 5000 from ALB SG → 5432 from app SG |
| 8 | Amazon S3 | `gearvault-frontend-<acct>` | React/Vite SPA build |
| 9 | Amazon S3 | `gearvault-media-<acct>` | `items/*` (public via OAC), `condition/*` (presigned only); CORS GET/PUT |
| 10 | Amazon RDS | `gearvault-postgres` + `gearvault-db-subnet-group` | PostgreSQL 16, db.t4g.micro, Multi-AZ, 20 GB gp3, encrypted, private, TLS |
| 11 | AWS Secrets Manager | `gearvault/production/credentials`, `gearvault/origin-verify-secret` | DATABASE_URL + JWT_SECRET_KEY; CloudFront→ALB header secret |
| 12 | Elastic Load Balancing | `gearvault-alb`, target group `gearvault-api-tg`, listener :80 + header rule | IP targets :5000, health `/api/health`, default 403 |
| 13 | Amazon ECR | `gearvault-api` | image `:v2`, scan on push |
| 14 | AWS IAM | `gearvault-task-exec`, `gearvault-task`, `gearvault-scheduler-role` | pull/secrets/logs · S3 media get/put · RunTask + PassRole |
| 15 | Amazon ECS (Fargate) | cluster `gearvault`, task def `gearvault-api`, service `gearvault-api` | 0.5 vCPU / 1 GB, 2 tasks, circuit breaker + rollback |
| 16 | Application Auto Scaling | target tracking `ecs-cpu-target-tracking` | 60 % CPU, min 2 / max 4 |
| 17 | AWS WAF (us-east-1, global) | `gearvault-waf` | CommonRuleSet + 100 req / 5 min per IP on `/api/auth/` |
| 18 | Amazon CloudFront | distribution, OAC `gearvault-oac` | origins: S3 frontend, S3 media, ALB |
| 19 | CloudFront Functions | `spa-rewrite`, `strip-media` | viewer-request URL rewrites |
| 20 | Amazon EventBridge Scheduler | `gearvault-run-jobs` | rate(5 minutes) → ECS RunTask `flask jobs run` |
| 21 | Amazon CloudWatch | log group `/ecs/gearvault-api`; alarms `GearVault-High-5XX-Errors`, `GearVault-RDS-High-CPU` | 5XX > 10 / 5 min; CPU > 80 % (2 × 5 min) |
| 22 | Amazon SNS | `gearvault-alerts` | alarm action topic |
| 23 | AWS STS | caller identity; task-role temporary credentials | used by scripts and boto3 presigning |
