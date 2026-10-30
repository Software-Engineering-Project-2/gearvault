# GearVault - Cloud Production Deployment & Operations Guide
> **Target Audience:** Engineering Collaborators, DevOps Engineers & Reviewers  
> **Repository Branch:** `deployment`  
> **AWS Coverage:** 18 AWS Services across 11 Integrated Architecture Tiers  
> **Primary Region:** `ap-south-1` (Mumbai) | **Global WAF Region:** `us-east-1` (N. Virginia)

---

## 📋 Table of Contents
1. [Architecture Overview](#1-architecture-overview)
2. [Prerequisites & System Requirements](#2-prerequisites--system-requirements)
3. [Automated One-Click Deployment](#3-automated-one-click-deployment)
4. [Phase-by-Phase Architecture Deep Dive](#4-phase-by-phase-architecture-deep-dive)
5. [Authentic Equipment Catalog & Product Images](#5-authentic-equipment-catalog--product-images)
6. [Post-Deployment Verification & Smoke Tests](#6-post-deployment-verification--smoke-tests)
7. [Default Roles & Admin Account Creation](#7-default-roles--admin-account-creation)
8. [Sleep Mode: Pausing & Resuming Infrastructure](#8-sleep-mode-pausing--resuming-infrastructure)
9. [Complete Clean Teardown ($0.00/hr)](#9-complete-clean-teardown-000hr)
10. [Troubleshooting & Common Gotchas](#10-troubleshooting--common-gotchas)

---

## 1. Architecture Overview

GearVault is deployed as a resilient, multi-tier enterprise web application following the **AWS Well-Architected Framework**:

```
[ User Browser / Client ]
           │
           ▼ (HTTPS / Port 443)
┌────────────────────────────────────────────────────────────────────────┐
│  AWS Edge Tier                                                         │
│   ├─ AWS WAF v2 (Layer 7 Defense: AWSManagedRulesCommonRuleSet)        │
│   └─ Amazon CloudFront Multi-Origin Global CDN                         │
│        ├─ CloudFront Function: spa-rewrite (SPA client-side routing)  │
│        └─ CloudFront Function: strip-media (Prefix normalization)      │
└──────────┬───────────────────────────────┬─────────────────────────────┘
           │                               │
    Default /* (GET/HEAD)            /api/* (All Verbs)
           │                               │ (Injects X-Origin-Verify)
           ▼                               ▼
┌───────────────────────┐       ┌────────────────────────────────────────┐
│  Amazon S3 (Storage)  │       │  Application Load Balancer (ALB)       │
│  ├─ Frontend SPA      │       │  (Public Subnets AZ-A & AZ-B)          │
│  └─ Media / Uploads   │       └──────────────────┬─────────────────────┘
│  (Locked with OAC)    │                          │ (Port 5000)
└───────────────────────┘                          ▼
                                ┌────────────────────────────────────────┐
                                │  Amazon ECS Fargate (Compute Tier)     │
                                │  ├─ Service: gearvault-api (Min 2)     │
                                │  ├─ CPU Target Tracking Auto-Scaling   │
                                │  ├─ Circuit Breaker with Auto-Rollback │
                                │  └─ Task Execution / IAM Least Priv    │
                                └──────────────────┬─────────────────────┘
                                                   │ (Port 5432)
                                                   ▼
                                ┌────────────────────────────────────────┐
                                │  Amazon RDS Multi-AZ PostgreSQL 16     │
                                │  ├─ Isolated Database Subnets (2 AZs)  │
                                │  ├─ Encrypted Storage (AWS KMS gp3)    │
                                │  └─ Automated Backups & Maintenance    │
                                └────────────────────────────────────────┘

[ Supporting Cloud Services ]
 ├─ AWS Secrets Manager      : Injects encrypted DATABASE_URL, JWT_SECRET_KEY, Origin Secret
 ├─ Amazon ECR               : Non-root immutable container registry (scan on push)
 ├─ Amazon EventBridge       : Recurring 5-minute background maintenance jobs (cron)
 ├─ Amazon CloudWatch & SNS  : Target 5XX & RDS CPU utilization alarms with SNS notifications
 └─ VPC Gateway Endpoints    : Private zero-cost routing to Amazon S3
```

---

## 2. Prerequisites & System Requirements

Before launching the deployment, ensure your local workstation or bastion host has the following tools installed and active:

1. **AWS CLI (v2)**
   - Verify installation: `aws --version`
   - Configure credentials:
     ```bash
     aws configure
     ```
     - Default Region: `ap-south-1`
     - Ensure the IAM user/role has permissions to provision VPC, EC2, ECS, ECR, RDS, S3, CloudFront, WAF, SecretsManager, EventBridge, and CloudWatch.
2. **Docker Desktop**
   - Ensure the Docker daemon is running (`docker info`).
   - Used during Phase 6 to build the production Linux/AMD64 non-root Flask container.
3. **Node.js (v18+) & npm**
   - Verify: `node -v` and `npm -v`
   - Used in Phase 11 to compile the React SPA production bundle.
4. **PowerShell (v5.1+ or v7 Core)**
   - Both Windows PowerShell and cross-platform PowerShell Core (`pwsh`) are supported.

---

## 3. Automated One-Click Deployment

The entire multi-tier infrastructure across all 18 AWS services can be provisioned from scratch with a single command:

```powershell
powershell -ExecutionPolicy Bypass -File .\deploy-all.ps1
```

### What to Expect:
- **Total Execution Time:** ~12–15 minutes (most of which is AWS creating the Multi-AZ RDS PostgreSQL database and provisioning CloudFront edge locations).
- **Zero Interactive Prompts:** The script generates strong cryptographic secrets, automatically detects your AWS Account ID, and binds all resources dynamically.
- **Terminal Summary:** Upon completion, the script prints:
  - 🚀 **Live CloudFront URL (Primary HTTPS entry point)**
  - 🌐 **S3 Direct Hosting URL**
  - 🔌 **ALB Direct Health Endpoint**
  - 📦 **Confirmation of 11 authentic inventory items seeded**

---

## 4. Phase-by-Phase Architecture Deep Dive

The automation script executes 11 distinct deployment phases in topological dependency order:

### Phase 0 & 1: Networking & Multi-AZ Topology
- **VPC CIDR:** `10.0.0.0/16` with DNS hostnames and resolution enabled.
- **6 Subnets across 2 Availability Zones (`ap-south-1a` & `ap-south-1b`):**
  - Public Subnets (`10.0.1.0/24`, `10.0.2.0/24`): Host the Internet Gateway (IGW), NAT Gateway, and ALB.
  - Private App Subnets (`10.0.10.0/24`, `10.0.20.0/24`): Host ECS Fargate container tasks without public IPs.
  - Isolated DB Subnets (`10.0.100.0/24`, `10.0.200.0/24`): Host the RDS PostgreSQL database with no direct internet access.
- **NAT Gateway & Elastic IP:** Allows private ECS containers to download OS security patches, pull pip packages, and push logs.
- **VPC S3 Gateway Endpoint (`vpce`):** Routes all S3 traffic privately across AWS's internal network with zero NAT data-transfer fees.
- **Least-Privilege Security Groups:**
  - `gearvault-alb-sg`: Allows inbound HTTP 80 from CloudFront and internet.
  - `gearvault-app-sg`: Allows inbound port 5000 strictly from `gearvault-alb-sg`.
  - `gearvault-db-sg`: Allows inbound port 5432 strictly from `gearvault-app-sg`.

### Phase 2: S3 Buckets & Static Asset Storage
- Creates two globally unique buckets:
  - `gearvault-frontend-<AccountId>`: Hosts the compiled React single-page application.
  - `gearvault-media-<AccountId>`: Secure store for uploaded equipment images and media files.
- Configures bucket policies with Origin Access Control (OAC) to prevent unauthorized public access.

### Phase 3: Amazon RDS Multi-AZ PostgreSQL
- Creates DB Subnet Group spanning both isolated subnets.
- Provisions `db.t4g.micro` PostgreSQL 16 engine with gp3 storage, KMS encryption, and automated backups enabled.
- Deploys Multi-AZ replication to ensure seamless failover in case of AZ outage.

### Phase 4: AWS Secrets Manager
- Generates strong random passwords and JWT secret keys.
- Creates `gearvault/production/credentials` holding `DATABASE_URL` and `JWT_SECRET_KEY`.
- Creates `gearvault/origin-verify-secret` holding the secret header string for CloudFront-to-ALB validation.

### Phase 5: Ingress Tier (Application Load Balancer)
- Deploys an internet-facing Application Load Balancer (`gearvault-alb`) across public subnets.
- Registers target group `gearvault-api-tg` targeting ECS task IPs with health check path `/api/health`.

### Phase 6: Containerization (ECR & Docker)
- Provisions AWS ECR repository `gearvault-api` with image vulnerability scanning on push.
- Authenticates local Docker CLI with ECR.
- Builds non-root container image targeting `linux/amd64` and tags it `:v1` / `:latest`.
- Creates IAM Task Execution Role (`gearvault-task-exec`) and Task Role (`gearvault-task`).

### Phase 7: Compute Tier (ECS Cluster & Migrations)
- Creates ECS Cluster `gearvault` with Fargate capacity provider.
- Registers task definition with environment secrets referenced directly from Secrets Manager.
- Launches one-off standalone Fargate tasks to execute:
  1. `flask db upgrade` (applies all PostgreSQL schema baseline migrations)
  2. `flask seed` (seeds the database with categories, roles, and product inventory)

### Phase 8: ECS Fargate Service & Auto-Scaling
- Launches `gearvault-api` service with minimum 2 tasks distributed across both AZs.
- Enables ECS Deployment Circuit Breaker with automated rollback on failure.
- Registers Target Tracking Scaling Policy targeting 60% average CPU utilization (scales out to 4 tasks).

### Phase 9: Edge Tier (CloudFront, WAF & OAC)
- Deploys **AWS WAF v2** Web ACL in `us-east-1` with `AWSManagedRulesCommonRuleSet`.
- Deploys **CloudFront Functions**:
  - `spa-rewrite`: Seamlessly handles HTML5 client-side routing by rewriting route requests (e.g., `/equipment`, `/rentals`) to `/index.html`.
  - `strip-media`: Normalizes media paths by removing the `/media/` prefix before forwarding to S3.
- Provisions **CloudFront Multi-Origin Distribution**:
  - `/*` routes to S3 Frontend.
  - `/api/*` routes to ALB with `X-Origin-Verify` origin protection header.
  - `/media/*` routes to S3 Media Bucket with OAC SigV4 authentication.

### Phase 10: Background Automation Tier
- Creates EventBridge Scheduler role and schedule `gearvault-run-jobs`.
- Triggers `flask jobs run` every 5 minutes on ECS Fargate to evaluate overdue rentals, calculate damage fees, and update item statuses.

### Phase 11: Observability & Frontend Sync
- Creates SNS alert topic `gearvault-alerts`.
- Creates CloudWatch Alarms for ALB 5XX error rates and RDS CPU utilization.
- Compiles the frontend SPA with relative `/api` configuration and syncs to S3.

---

## 5. Authentic Equipment Catalog & Product Images

To ensure a realistic demonstration, the equipment catalog includes 11 items across 5 categories, each seeded with authentic high-resolution product photography:

| SKU | Equipment Name | Category | Daily Rate | Image Preview URL |
| :--- | :--- | :--- | :--- | :--- |
| `CAM-001` | **Canon EOS R6** | Cameras | ₹2,484 | [Canon EOS R6 Photo](https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=800&q=80) |
| `CAM-002` | **Sony A7 IV** | Cameras | ₹2,018 | [Sony A7 IV Photo](https://images.unsplash.com/photo-1502920917128-1aa500764cbd?w=800&q=80) |
| `LEN-001` | **Sony 24-70mm f/2.8 Lens** | Cameras | ₹1,123 | [Sony 24-70mm GM Photo](https://images.unsplash.com/photo-1617005082133-548c4dd27f35?w=800&q=80) |
| `AUD-001` | **Wireless Microphone Kit** | Audio | ₹348 | [Wireless Mic Photo](https://images.unsplash.com/photo-1590602847861-f357a9332bbc?w=800&q=80) |
| `AUD-002` | **Rode Shotgun Microphone** | Audio | ₹291 | [Rode Shotgun Mic Photo](https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?w=800&q=80) |
| `LGT-001` | **LED Panel Light** | Lighting | ₹145 | [LED Studio Light Photo](https://images.unsplash.com/photo-1524368535928-5b5e00ddc76b?w=800&q=80) |
| `LGT-002` | **Godox Softbox Kit** | Lighting | ₹259 | [Godox Studio Kit Photo](https://images.unsplash.com/photo-1514565131-fce0801e5785?w=800&q=80) |
| `CMP-001` | **MacBook Pro 14-inch** | Computers | ₹2,350 | [MacBook Pro Photo](https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=800&q=80) |
| `CMP-002` | **Editing Monitor 27-inch** | Computers | ₹160 | [4K Production Monitor Photo](https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?w=800&q=80) |
| `EVT-001` | **Epson Projector** | Event Gear | ₹876 | [Epson HD Projector Photo](https://images.unsplash.com/photo-1517604931442-7e0c8ed2963c?w=800&q=80) |
| `EVT-002` | **Portable PA Speaker** | Event Gear | ₹490 | [PA Audio Speaker Photo](https://images.unsplash.com/photo-1545454675-3531b543be5d?w=800&q=80) |

> **Note:** Because image URLs are pre-configured in `backend/sql/catalog_seed.sql` and `backend/app/cli.py`, `flask seed` automatically populates these images during deployment with zero broken image links.

---

## 6. Post-Deployment Verification & Smoke Tests

Run these quick checks from your terminal to verify end-to-end functionality:

### 1. API Health Check
```powershell
curl -i http://<ALB-DNS-NAME>/api/health
# Response: HTTP/1.1 200 OK -> {"status":"healthy"}
```

### 2. Verify Edge Origin Shielding
```powershell
# Attempting direct access to ALB without CloudFront header:
curl -i http://<ALB-DNS-NAME>/api/items
# Notice: In locked mode, ALB verifies X-Origin-Verify header.
```

### 3. Verify CloudFront HTTPS Endpoint
```powershell
curl -i https://<YOUR-CLOUDFRONT-DOMAIN>/api/health
# Response: HTTP/2 200 OK via CloudFront
```

---

## 7. Default Roles & Admin Account Creation

The database includes three role levels:
- `customer` (Role ID: 1)
- `staff` (Role ID: 2)
- `manager` (Role ID: 3)

### Creating Customers
Customers can register directly on the live web portal at `/register`.

### Creating a Manager or Staff Account
To bootstrap an admin manager account on the production database without opening external ports, run a one-off Fargate task:

```powershell
$Region = "ap-south-1"
$Subnet = (aws ec2 describe-subnets --filters "Name=tag:Name,Values=gearvault-app-a" --region $Region --query "Subnets[0].SubnetId" --output text)
$Sg = (aws ec2 describe-security-groups --filters "Name=group-name,Values=gearvault-app-sg" --region $Region --query "SecurityGroups[0].GroupId" --output text)

aws ecs run-task `
  --cluster gearvault `
  --task-definition gearvault-api `
  --launch-type FARGATE `
  --network-configuration "awsvpcConfiguration={subnets=[$Subnet],securityGroups=[$Sg],assignPublicIp=DISABLED}" `
  --overrides '{"containerOverrides":[{"name":"api","command":["flask","create-user","--email","manager@gearvault.com","--full-name","Operations Manager","--role","manager","--password","SecureAdminPass123!"]}]}' `
  --region $Region
```

You can now log in at `/login` with `manager@gearvault.com` and password `SecureAdminPass123!`.

---

## 8. Sleep Mode: Pausing & Resuming Infrastructure

To prevent unexpected billing while keeping all database data, tables, and networking intact between testing sessions:

### Pause (Sleep Mode)
```powershell
powershell -ExecutionPolicy Bypass -File .\pause-all.ps1
```
- Scales ECS tasks to 0 (Stops container billing to $0.00).
- Suspends EventBridge 5-minute recurring job.
- Stops the Amazon RDS PostgreSQL instance.

### Resume (Wake Up)
```powershell
powershell -ExecutionPolicy Bypass -File .\resume-all.ps1
```
- Restarts the RDS PostgreSQL instance.
- Restores ECS Fargate desired tasks to 2.
- Re-enables the EventBridge recurring job.

---

## 9. Complete Clean Teardown ($0.00/hr)

When testing or evaluation is completed, run the teardown automation to permanently destroy all resources and avoid ongoing AWS credit consumption:

```powershell
powershell -ExecutionPolicy Bypass -File .\teardown-all.ps1
```

### Safety Features of `teardown-all.ps1`:
- **Strict Reverse Order:** Solves AWS dependency locks (breaks security group cyclic rules, drains ECS before deleting ALB, deletes CloudFront before deleting S3, deletes NAT Gateway before releasing EIP).
- **Zero Orphaned Resources:** Force-empties S3 buckets, skips RDS snapshots, and bypasses Secrets Manager 30-day recovery windows.
- **Ongoing Cost:** Guaranteed **$0.00 / hr**.

---

## 10. Troubleshooting & Common Gotchas

| Issue | Cause | Resolution |
| :--- | :--- | :--- |
| `Cannot connect to Docker daemon` | Docker Desktop is closed | Start Docker Desktop and wait until the whale icon is steady. |
| `BucketAlreadyExists` | Bucket name collision | S3 bucket names include `-$AccountId` for global uniqueness. Ensure your AWS credentials are valid. |
| `WAF InvalidParameter` | WAF region mismatch | CloudFront-scoped WAF Web ACLs must strictly be created in region `us-east-1`. The deploy script handles this automatically. |
| `InvalidSecurityGroupID` | Cyclic SG dependency during teardown | `teardown-all.ps1` automatically revokes ingress rules between `app-sg` and `db-sg` before deletion. |
| `CloudFront distribution takes ~5 min` | Global POP propagation | CloudFront provisions across 400+ edge locations. The script continues while CloudFront deploys in parallel. |

---

*Authored by the GearVault DevOps Team. Maintained on branch `deployment`.*
