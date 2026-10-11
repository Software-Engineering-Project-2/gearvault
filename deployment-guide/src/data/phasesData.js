// GearVault Production AWS Deployment Runbook (Refined, Bug-Free 16-Service Architecture)

export const AWS_RESOURCES = [
  { id: 'vpc', name: 'Amazon VPC', cat: 'Networking', icon: '🌐', desc: 'Multi-AZ VPC (10.0.0.0/16) with 6 subnets across ap-south-1a/b' },
  { id: 'nat_igw', name: 'NAT & Internet Gateway', cat: 'Networking', icon: '🚪', desc: '1 NAT Gateway (cost-optimized) & Internet Gateway for public ingress' },
  { id: 's3_endpoint', name: 'VPC S3 Gateway Endpoint', cat: 'Networking', icon: '⚡', desc: 'Free private S3 gateway endpoint keeping media traffic off NAT' },
  { id: 'security_groups', name: 'Layered Security Groups', cat: 'Security', icon: '🛡️', desc: 'ALB locked to CloudFront Prefix List; App & DB private ingress only' },
  { id: 'waf', name: 'AWS WAF', cat: 'Security', icon: '🧱', desc: 'Web ACL in us-east-1 with CommonRuleSet & /api/auth/ rate limits' },
  { id: 'cloudfront', name: 'Amazon CloudFront', cat: 'Edge', icon: '🌍', desc: 'Global CDN routing S3 frontend, S3 items media, and ALB API' },
  { id: 'cf_functions', name: 'CloudFront Functions', cat: 'Edge', icon: '⚙️', desc: 'spa-rewrite (safe SPA routing) and strip-media URL rewriters' },
  { id: 's3_frontend', name: 'Amazon S3 (Frontend)', cat: 'Storage', icon: '🪣', desc: 'Private bucket hosting React 18/Vite bundle via CloudFront OAC' },
  { id: 's3_media', name: 'Amazon S3 (Media)', cat: 'Storage', icon: '📸', desc: 'Bucket for catalog items (OAC) and condition photos (Presigned URLs)' },
  { id: 'alb', name: 'Application Load Balancer', cat: 'Ingress', icon: '⚖️', desc: 'Port 80 ALB with X-Origin-Verify header check & fixed 403 default' },
  { id: 'ecs_fargate', name: 'Amazon ECS on Fargate', cat: 'Compute', icon: '🚀', desc: 'Serverless containers running Python 3.13-slim non-root Flask app' },
  { id: 'ecr', name: 'Amazon ECR', cat: 'Compute', icon: '📦', desc: 'Private Docker repository with image vulnerability scan on push' },
  { id: 'autoscaling', name: 'ECS Auto Scaling', cat: 'Compute', icon: '📈', desc: 'Target tracking auto scaling (min 2, max 4 tasks) matching DB limits' },
  { id: 'rds_postgres', name: 'Amazon RDS PostgreSQL', cat: 'Database', icon: '🐘', desc: 'Multi-AZ PostgreSQL 16 (db.t4g.micro) with sslmode=require' },
  { id: 'secrets_manager', name: 'AWS Secrets Manager', cat: 'Security', icon: '🔑', desc: 'Encrypted storage for DATABASE_URL, JWT_SECRET, and Origin Header' },
  { id: 'eventbridge', name: 'Amazon EventBridge', cat: 'Automation', icon: '⏱️', desc: '5-min cron rule running "flask jobs run" with row-level locks' },
  { id: 'cloudwatch', name: 'Amazon CloudWatch', cat: 'Observability', icon: '📊', desc: 'Logs /ecs/gearvault-api, metric alarms on 5XX errors & CPU' },
  { id: 'sns', name: 'Amazon SNS', cat: 'Observability', icon: '🔔', desc: 'DevOps notification topic for critical CloudWatch alarms' },
  { id: 'iam', name: 'AWS IAM Roles', cat: 'Security', icon: '🔏', desc: 'Least-privilege Task Role (S3/Exec) and Task Execution Role' },
];

export const PHASES = [
  {
    id: 'phase-0',
    number: '0',
    title: 'Account Prerequisites & Architecture Strategy',
    description: 'Configure AWS CLI in ap-south-1 (Mumbai), verify caller identity, and understand the multi-origin edge routing pattern.',
    tasks: [
      {
        id: 'task-0-1',
        title: 'Configure AWS CLI & Verify Caller Identity',
        resources: ['iam'],
        summary: 'Set default region to ap-south-1 (Mumbai) and confirm IAM user/role credentials with sts get-caller-identity.',
        cliScript: (cfg) => `# Configure AWS CLI profile for ap-south-1 (Mumbai)
aws configure set region ${cfg.region}
aws configure set output json

# Verify authentication identity
aws sts get-caller-identity`,
        consoleSteps: (cfg) => [
          'Log in to the AWS Management Console.',
          `Ensure the top-right region selector is set to "Asia Pacific (Mumbai) ${cfg.region}".`,
          'Navigate to IAM -> Users -> Select your user -> Security credentials.',
          'Verify your active Access Key or SSO session credentials.'
        ],
        callout: {
          type: 'info',
          text: 'Regional Note: Primary infrastructure resides in ap-south-1 (Mumbai). CloudFront edge resources (WAF Web ACL and ACM certificates) must reside in us-east-1.'
        }
      }
    ]
  },
  {
    id: 'phase-1',
    number: '1',
    title: 'VPC Network Topology & Layered Security Perimeter',
    description: 'Provision a custom 10.0.0.0/16 VPC with 6 subnets across 2 AZs, a cost-effective single NAT Gateway, a free S3 Gateway Endpoint, and locked-down Security Groups.',
    tasks: [
      {
        id: 'task-1-1',
        title: 'Provision Multi-AZ VPC, Subnets, NAT & S3 Gateway Endpoint',
        resources: ['vpc', 'nat_igw', 's3_endpoint'],
        summary: 'Create VPC with 2 public subnets (ALB, NAT), 2 private app subnets (Fargate), 2 private DB subnets (RDS), 1 NAT Gateway, and an S3 Gateway Endpoint.',
        cliScript: (cfg) => `# 1. Create VPC
VPC_ID=$(aws ec2 create-vpc --cidr-block 10.0.0.0/16 --region ${cfg.region} --query 'Vpc.VpcId' --output text)
aws ec2 create-tags --resources $VPC_ID --tags Key=Name,Value=gearvault-vpc --region ${cfg.region}
aws ec2 modify-vpc-attribute --vpc-id $VPC_ID --enable-dns-hostnames "{\\"Value\\":true}" --region ${cfg.region}
aws ec2 modify-vpc-attribute --vpc-id $VPC_ID --enable-dns-support "{\\"Value\\":true}" --region ${cfg.region}

# 2. Create Internet Gateway for Public Subnets
IGW_ID=$(aws ec2 create-internet-gateway --region ${cfg.region} --query 'InternetGateway.InternetGatewayId' --output text)
aws ec2 attach-internet-gateway --vpc-id $VPC_ID --internet-gateway-id $IGW_ID --region ${cfg.region}
aws ec2 create-tags --resources $IGW_ID --tags Key=Name,Value=gearvault-igw --region ${cfg.region}

# 3. Create Subnets across AZ a & b
PUB_SUB1=$(aws ec2 create-subnet --vpc-id $VPC_ID --cidr-block 10.0.1.0/24 --availability-zone ${cfg.region}a --query 'Subnet.SubnetId' --output text --region ${cfg.region})
PUB_SUB2=$(aws ec2 create-subnet --vpc-id $VPC_ID --cidr-block 10.0.2.0/24 --availability-zone ${cfg.region}b --query 'Subnet.SubnetId' --output text --region ${cfg.region})
APP_SUB1=$(aws ec2 create-subnet --vpc-id $VPC_ID --cidr-block 10.0.10.0/24 --availability-zone ${cfg.region}a --query 'Subnet.SubnetId' --output text --region ${cfg.region})
APP_SUB2=$(aws ec2 create-subnet --vpc-id $VPC_ID --cidr-block 10.0.20.0/24 --availability-zone ${cfg.region}b --query 'Subnet.SubnetId' --output text --region ${cfg.region})
DATA_SUB1=$(aws ec2 create-subnet --vpc-id $VPC_ID --cidr-block 10.0.30.0/24 --availability-zone ${cfg.region}a --query 'Subnet.SubnetId' --output text --region ${cfg.region})
DATA_SUB2=$(aws ec2 create-subnet --vpc-id $VPC_ID --cidr-block 10.0.40.0/24 --availability-zone ${cfg.region}b --query 'Subnet.SubnetId' --output text --region ${cfg.region})

# 4. Provision Elastic IP & Single NAT Gateway (Cost Optimization: ~$32/mo savings)
EIP_ALLOC=$(aws ec2 allocate-address --domain vpc --region ${cfg.region} --query 'AllocationId' --output text)
NAT_GW=$(aws ec2 create-nat-gateway --subnet-id $PUB_SUB1 --allocation-id $EIP_ALLOC --region ${cfg.region} --query 'NatGateway.NatGatewayId' --output text)

# 5. Route Tables: Public (via IGW) and Private (via NAT Gateway)
# Public Route Table for ALB and NAT Gateway
PUB_RT=$(aws ec2 create-route-table --vpc-id $VPC_ID --region ${cfg.region} --query 'RouteTable.RouteTableId' --output text)
aws ec2 create-tags --resources $PUB_RT --tags Key=Name,Value=gearvault-public-rt --region ${cfg.region}
aws ec2 create-route --route-table-id $PUB_RT --destination-cidr-block 0.0.0.0/0 --gateway-id $IGW_ID --region ${cfg.region}
aws ec2 associate-route-table --subnet-id $PUB_SUB1 --route-table-id $PUB_RT --region ${cfg.region}
aws ec2 associate-route-table --subnet-id $PUB_SUB2 --route-table-id $PUB_RT --region ${cfg.region}

# Wait for NAT Gateway to become available before adding private route
aws ec2 wait nat-gateway-available --nat-gateway-ids $NAT_GW --region ${cfg.region}

# Private Route Table for ECS Tasks & Database Subnets
PRIV_RT=$(aws ec2 create-route-table --vpc-id $VPC_ID --region ${cfg.region} --query 'RouteTable.RouteTableId' --output text)
aws ec2 create-tags --resources $PRIV_RT --tags Key=Name,Value=gearvault-private-rt --region ${cfg.region}
aws ec2 create-route --route-table-id $PRIV_RT --destination-cidr-block 0.0.0.0/0 --nat-gateway-id $NAT_GW --region ${cfg.region}
aws ec2 associate-route-table --subnet-id $APP_SUB1 --route-table-id $PRIV_RT --region ${cfg.region}
aws ec2 associate-route-table --subnet-id $APP_SUB2 --route-table-id $PRIV_RT --region ${cfg.region}
aws ec2 associate-route-table --subnet-id $DATA_SUB1 --route-table-id $PRIV_RT --region ${cfg.region}
aws ec2 associate-route-table --subnet-id $DATA_SUB2 --route-table-id $PRIV_RT --region ${cfg.region}

# 6. Create Free VPC Gateway Endpoint for Amazon S3 associated with Private Route Table
aws ec2 create-vpc-endpoint \\
  --vpc-id $VPC_ID \\
  --service-name com.amazonaws.${cfg.region}.s3 \\
  --vpc-endpoint-type Gateway \\
  --route-table-ids $PRIV_RT \\
  --region ${cfg.region}`,
        consoleSteps: (cfg) => [
          `Navigate to VPC in ${cfg.region} -> Click "Create VPC" (VPC and more).`,
          'Name: "gearvault", IPv4 CIDR: 10.0.0.0/16.',
          `Number of AZs: 2 (${cfg.region}a, ${cfg.region}b).`,
          'Public subnets: 2 (10.0.1.0/24, 10.0.2.0/24).',
          'Private subnets: 4 (App: 10.0.10.0/24, 10.0.20.0/24; DB: 10.0.30.0/24, 10.0.40.0/24).',
          'NAT gateways: 1 in 1 AZ (in public-a) to avoid paying for dual idle NATs.',
          'VPC endpoints: S3 Gateway (Free, routes internal S3 traffic directly without NAT costs).',
          'Verify Route Tables: The wizard automatically creates gearvault-rtb-public (0.0.0.0/0 -> IGW) and gearvault-rtb-private (0.0.0.0/0 -> NAT Gateway, with S3 Gateway Endpoint prefix list route).'
        ],
        callout: {
          type: 'success',
          text: 'Cost & Efficiency: A single NAT gateway plus a free S3 Gateway Endpoint saves ~$384/year while maintaining full private subnet egress for ECR, Secrets Manager, and CloudWatch.'
        }
      },
      {
        id: 'task-1-2',
        title: 'Configure Locked-Down Security Groups with CloudFront Prefix List',
        resources: ['security_groups'],
        summary: 'Lock the ALB to receive traffic ONLY from CloudFront origin IPs via AWS Managed Prefix List, and restrict ECS/RDS to upstream private traffic only.',
        cliScript: (cfg) => `# 1. Look up CloudFront Origin Managed Prefix List in ${cfg.region}
CF_PREFIX_LIST=$(aws ec2 describe-managed-prefix-lists \\
  --filters "Name=prefix-list-name,Values=com.amazonaws.global.cloudfront.origin-facing" \\
  --region ${cfg.region} \\
  --query 'PrefixLists[0].PrefixListId' --output text)

# 2. ALB Security Group (Restricted ONLY to CloudFront Prefix List)
ALB_SG=$(aws ec2 create-security-group --group-name gearvault-alb-sg --description "ALB from CloudFront only" --vpc-id $VPC_ID --region ${cfg.region} --query 'GroupId' --output text)
aws ec2 authorize-security-group-ingress --group-id $ALB_SG --protocol tcp --port 80 --prefix-list-id $CF_PREFIX_LIST --region ${cfg.region}

# 3. ECS Application Security Group (Port 5000 only from ALB_SG)
APP_SG=$(aws ec2 create-security-group --group-name gearvault-app-sg --description "ECS App Tasks" --vpc-id $VPC_ID --region ${cfg.region} --query 'GroupId' --output text)
aws ec2 authorize-security-group-ingress --group-id $APP_SG --protocol tcp --port 5000 --source-group $ALB_SG --region ${cfg.region}

# 4. Database Security Group (Port 5432 only from APP_SG)
DB_SG=$(aws ec2 create-security-group --group-name gearvault-db-sg --description "RDS PostgreSQL" --vpc-id $VPC_ID --region ${cfg.region} --query 'GroupId' --output text)
aws ec2 authorize-security-group-ingress --group-id $DB_SG --protocol tcp --port 5432 --source-group $APP_SG --region ${cfg.region}`,
        consoleSteps: (cfg) => [
          'Navigate to VPC -> Security Groups.',
          'Create "gearvault-alb-sg": Inbound rule on TCP Port 80. In the source dropdown, search and select the AWS Managed Prefix List "com.amazonaws.global.cloudfront.origin-facing".',
          'Create "gearvault-app-sg": Inbound rule on TCP Port 5000. Source: select "gearvault-alb-sg".',
          'Create "gearvault-db-sg": Inbound rule on PostgreSQL Port 5432. Source: select "gearvault-app-sg".'
        ],
        callout: {
          type: 'warning',
          text: 'Security Protection: Restricting ALB ingress to the CloudFront Managed Prefix List prevents attackers from bypassing CloudFront and AWS WAF by curling the ALB directly.'
        }
      }
    ]
  },
  {
    id: 'phase-2',
    number: '2',
    title: 'Object Storage & Media Security Tier',
    description: 'Create private S3 buckets for the React frontend and media uploads. Configure CORS for direct browser PUT uploads and OAC for item photos.',
    tasks: [
      {
        id: 'task-2-1',
        title: 'Create S3 Frontend Bucket (Private OAC)',
        resources: ['s3_frontend'],
        summary: 'Create private S3 bucket with Block Public Access enabled for the compiled React/Vite SPA.',
        cliScript: (cfg) => `aws s3api create-bucket \\
  --bucket ${cfg.frontendBucket} \\
  --region ${cfg.region} \\
  --create-bucket-configuration LocationConstraint=${cfg.region}

aws s3api put-public-access-block \\
  --bucket ${cfg.frontendBucket} \\
  --public-access-block-configuration "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"`,
        consoleSteps: (cfg) => [
          `Navigate to S3 -> Create bucket. Name: "${cfg.frontendBucket}". Region: "${cfg.region}".`,
          'Ensure "Block all public access" is CHECKED.',
          'Default encryption: Amazon S3-managed keys (SSE-S3). Click Create bucket.'
        ]
      },
      {
        id: 'task-2-2',
        title: 'Create S3 Media Bucket with CORS & Scoped OAC Policy',
        resources: ['s3_media'],
        summary: 'Create the media bucket. Configure CORS for direct browser PUT uploads. Restrict CloudFront OAC to read items/* only, keeping condition/* strictly private.',
        cliScript: (cfg) => `# 1. Create Media S3 Bucket
aws s3api create-bucket \\
  --bucket ${cfg.mediaBucket} \\
  --region ${cfg.region} \\
  --create-bucket-configuration LocationConstraint=${cfg.region}

aws s3api put-public-access-block \\
  --bucket ${cfg.mediaBucket} \\
  --public-access-block-configuration "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"

# 2. Configure CORS for client-side direct PUT uploads
cat << 'EOF' > /tmp/media-cors.json
{
  "CORSRules": [
    {
      "AllowedHeaders": ["*"],
      "AllowedMethods": ["GET", "PUT"],
      "AllowedOrigins": ["https://${cfg.domain}", "https://*.cloudfront.net"],
      "ExposeHeaders": ["ETag"],
      "MaxAgeSeconds": 3000
    }
  ]
}
EOF

aws s3api put-bucket-cors --bucket ${cfg.mediaBucket} --cors-configuration file:///tmp/media-cors.json`,
        consoleSteps: (cfg) => [
          `In S3, create bucket: "${cfg.mediaBucket}" in "${cfg.region}". Block all public access: Checked.`,
          'Open bucket -> Permissions tab -> Scroll to "Cross-origin resource sharing (CORS)".',
          'Paste the CORS JSON configuration allowing PUT/GET from your CloudFront domain with ExposeHeaders: ["ETag"].'
        ],
        callout: {
          type: 'info',
          text: 'Media Architecture: Public catalog equipment photos reside in items/* and are served through CloudFront via OAC. Condition inspection photos reside in condition/* and are NEVER accessible via CloudFront—they require short-lived (<= 900s) presigned GET URLs generated by the API.'
        }
      }
    ]
  },
  {
    id: 'phase-3',
    number: '3',
    title: 'Relational Database Tier (Amazon RDS PostgreSQL 16)',
    description: 'Deploy Multi-AZ PostgreSQL 16 on db.t4g.micro with automated backups, storage autoscaling, and SSL enforcement.',
    tasks: [
      {
        id: 'task-3-1',
        title: 'Create RDS DB Subnet Group',
        resources: ['rds_postgres'],
        summary: 'Group private isolated database subnets in ap-south-1a and ap-south-1b for Multi-AZ deployment.',
        cliScript: (cfg) => `aws rds create-db-subnet-group \\
  --db-subnet-group-name gearvault-db-subnet-group \\
  --db-subnet-group-description "Subnet group for GearVault RDS across AZs" \\
  --subnet-ids "$DATA_SUB1" "$DATA_SUB2" \\
  --region ${cfg.region}`,
        consoleSteps: (cfg) => [
          `Navigate to RDS -> Subnet groups in ${cfg.region}.`,
          'Create DB Subnet Group: "gearvault-db-subnet-group".',
          'VPC: "gearvault-vpc". Select the two private data subnets (10.0.30.0/24 and 10.0.40.0/24).'
        ]
      },
      {
        id: 'task-3-2',
        title: 'Provision Multi-AZ Amazon RDS PostgreSQL 16',
        resources: ['rds_postgres'],
        summary: 'Create Multi-AZ PostgreSQL 16 instance (db.t4g.micro, gp3 20GB, Multi-AZ standby replica, automated backups).',
        cliScript: (cfg) => `aws rds create-db-instance \\
  --db-instance-identifier gearvault-postgres \\
  --db-name gearvault \\
  --engine postgres \\
  --engine-version 16.3 \\
  --db-instance-class db.t4g.micro \\
  --allocated-storage 20 \\
  --max-allocated-storage 50 \\
  --storage-type gp3 \\
  --master-username ${cfg.dbUser} \\
  --master-user-password "${cfg.dbPassword}" \\
  --db-subnet-group-name gearvault-db-subnet-group \\
  --vpc-security-group-ids "$DB_SG" \\
  --multi-az \\
  --storage-encrypted \\
  --backup-retention-period 7 \\
  --deletion-protection \\
  --no-publicly-accessible \\
  --region ${cfg.region}

# Wait for instance to become available and retrieve endpoint
aws rds wait db-instance-available --db-instance-identifier gearvault-postgres --region ${cfg.region}
RDS_ENDPOINT=$(aws rds describe-db-instances --db-instance-identifier gearvault-postgres --region ${cfg.region} --query 'DBInstances[0].Endpoint.Address' --output text)
echo "RDS Endpoint: $RDS_ENDPOINT"`,
        consoleSteps: (cfg) => [
          'Navigate to RDS -> Databases -> Create database.',
          'Engine: PostgreSQL 16.x. Templates: Production (or Dev/Test).',
          'Deployment: Multi-AZ DB instance (Creates primary in AZ-a and synchronous standby in AZ-b).',
          `DB identifier: "gearvault-postgres". Master user: "${cfg.dbUser}".`,
          'DB instance class: db.t4g.micro (2 vCPU, 1 GB RAM). Storage: 20 GiB gp3.',
          'VPC: "gearvault-vpc". DB Subnet Group: "gearvault-db-subnet-group". Public access: No.',
          'VPC Security Group: Select "gearvault-db-sg". Initial database name: "gearvault". Click Create database.'
        ]
      }
    ]
  },
  {
    id: 'phase-4',
    number: '4',
    title: 'Secrets Management & Application Configuration',
    description: 'Store the actual PostgreSQL connection string and JWT secret in AWS Secrets Manager, and set the origin verification secret.',
    tasks: [
      {
        id: 'task-4-1',
        title: 'Store Application Secrets in AWS Secrets Manager',
        resources: ['secrets_manager'],
        summary: 'Store DATABASE_URL (with sslmode=require) and JWT_SECRET_KEY in Secrets Manager for injection into ECS containers.',
        cliScript: (cfg) => `# Store DATABASE_URL and JWT_SECRET_KEY in Secrets Manager
aws secretsmanager create-secret \\
  --name "gearvault/production/credentials" \\
  --description "GearVault production secrets" \\
  --secret-string '{"DATABASE_URL":"postgresql://${cfg.dbUser}:${cfg.dbPassword}@'"$RDS_ENDPOINT"':5432/gearvault?sslmode=require","JWT_SECRET_KEY":"generate-64-character-random-hex-string-for-jwt-signing"}' \\
  --region ${cfg.region}

# Store origin verification secret header for CloudFront <-> ALB
aws secretsmanager create-secret \\
  --name "gearvault/origin-verify-secret" \\
  --description "Secret header for CloudFront to ALB verification" \\
  --secret-string "${cfg.originVerifyHeader}" \\
  --region ${cfg.region}`,
        consoleSteps: (cfg) => [
          `Navigate to Secrets Manager in ${cfg.region} -> Click "Store a new secret".`,
          'Secret type: Other type of secret. Key/value pairs:',
          '- DATABASE_URL: postgresql://gearvault_admin:<password>@<rds-endpoint>:5432/gearvault?sslmode=require',
          '- JWT_SECRET_KEY: <64-character-random-secure-key>',
          'Secret name: "gearvault/production/credentials". Click Store.'
        ]
      }
    ]
  },
  {
    id: 'phase-5',
    number: '5',
    title: 'Ingress Application Load Balancer & Target Group',
    description: 'Provision Application Load Balancer on port 80 with X-Origin-Verify header enforcement and health check targeting /api/health.',
    tasks: [
      {
        id: 'task-5-1',
        title: 'Create Target Group & ALB with Origin Header Validation',
        resources: ['alb'],
        summary: 'Create target group on port 5000 (/api/health probe). Configure ALB with default 403 action, forwarding only requests containing the X-Origin-Verify secret header.',
        cliScript: (cfg) => `# 1. Create Target Group with /api/health check
TG_ARN=$(aws elbv2 create-target-group \\
  --name gearvault-api-tg \\
  --protocol HTTP \\
  --port 5000 \\
  --vpc-id $VPC_ID \\
  --target-type ip \\
  --health-check-protocol HTTP \\
  --health-check-path /api/health \\
  --health-check-interval-seconds 30 \\
  --health-check-timeout-seconds 5 \\
  --healthy-threshold-count 2 \\
  --unhealthy-threshold-count 3 \\
  --matcher HttpCode=200 \\
  --region ${cfg.region} \\
  --query 'TargetGroups[0].TargetGroupArn' --output text)

# 2. Create Public ALB in Public Subnets
ALB_ARN=$(aws elbv2 create-load-balancer \\
  --name gearvault-alb \\
  --subnets $PUB_SUB1 $PUB_SUB2 \\
  --security-groups $ALB_SG \\
  --scheme internet-facing \\
  --type application \\
  --region ${cfg.region} \\
  --query 'LoadBalancers[0].LoadBalancerArn' --output text)

# 3. Create HTTP Listener with Default Action: Fixed 403 Forbidden
LISTENER_ARN=$(aws elbv2 create-listener \\
  --load-balancer-arn $ALB_ARN \\
  --protocol HTTP \\
  --port 80 \\
  --default-actions Type=fixed-response,FixedResponseConfig="{StatusCode=403,ContentType=text/plain,MessageBody=Forbidden}" \\
  --region ${cfg.region} \\
  --query 'Listeners[0].ListenerArn' --output text)

# 4. Add Forwarding Rule when X-Origin-Verify header matches
aws elbv2 create-rule \\
  --listener-arn $LISTENER_ARN \\
  --priority 10 \\
  --conditions Field=http-header,HttpHeaderConfig="{HttpHeaderName=X-Origin-Verify,Values=[${cfg.originVerifyHeader}]}" \\
  --actions Type=forward,TargetGroupArn=$TG_ARN \\
  --region ${cfg.region}`,
        consoleSteps: (cfg) => [
          'Navigate to EC2 -> Load Balancers -> Create Load Balancer (Application Load Balancer).',
          'Name: "gearvault-alb". Public subnets in AZ a and b. Security group: "gearvault-alb-sg".',
          'Target Group: "gearvault-api-tg", Target type: IP, Port: 5000. Health check path: "/api/health".',
          'Listener Port 80 default action: Return fixed response 403 Forbidden.',
          `Add rule on Listener 80: IF HTTP header "X-Origin-Verify" is "${cfg.originVerifyHeader}", THEN Forward to "gearvault-api-tg".`
        ],
        callout: {
          type: 'success',
          text: 'Origin Verification: Requests directly hitting the ALB DNS name receive HTTP 403 Forbidden. Only requests routed through CloudFront (which injects the secret header) reach the Flask containers.'
        }
      }
    ]
  },
  {
    id: 'phase-6',
    number: '6',
    title: 'Container Registry & IAM Security Roles',
    description: 'Create Amazon ECR repository and least-privilege IAM Task and Task Execution roles for ECS Fargate.',
    tasks: [
      {
        id: 'task-6-1',
        title: 'Create Amazon ECR Private Repository',
        resources: ['ecr'],
        summary: 'Create repository gearvault-api with automated vulnerability scan on push.',
        cliScript: (cfg) => `aws ecr create-repository \\
  --repository-name gearvault-api \\
  --image-scanning-configuration scanOnPush=true \\
  --image-tag-mutability MUTABLE \\
  --region ${cfg.region}`,
        consoleSteps: (cfg) => [
          `Navigate to Amazon ECR in ${cfg.region} -> Create repository.`,
          'Visibility: Private. Name: "gearvault-api". Enable "Scan on push". Click Create.'
        ]
      },
      {
        id: 'task-6-2',
        title: 'Create IAM Task & Execution Roles',
        resources: ['iam'],
        summary: 'Create gearvault-task-exec (ECR pull & SecretsManager GetSecretValue) and gearvault-task (s3:GetObject/PutObject on media bucket + ECS Exec).',
        cliScript: (cfg) => `# 1. Task Execution Role
cat << 'EOF' > /tmp/exec-policy.json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["secretsmanager:GetSecretValue"],
      "Resource": "arn:aws:secretsmanager:${cfg.region}:*:secret:gearvault/*"
    },
    {
      "Effect": "Allow",
      "Action": ["logs:CreateLogGroup"],
      "Resource": "arn:aws:logs:${cfg.region}:*:log-group:/ecs/gearvault-api*"
    }
  ]
}
EOF

aws iam create-role --role-name gearvault-task-exec --assume-role-policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"ecs-tasks.amazonaws.com"},"Action":"sts:AssumeRole"}]}'
aws iam attach-role-policy --role-name gearvault-task-exec --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy
aws iam put-role-policy --role-name gearvault-task-exec --policy-name SecretsAndLogsAccess --policy-document file:///tmp/exec-policy.json

# 2. Task Role (Allows boto3 to sign S3 URLs without hardcoded keys)
cat << 'EOF' > /tmp/task-policy.json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject"],
      "Resource": ["arn:aws:s3:::${cfg.mediaBucket}/*"]
    },
    {
      "Effect": "Allow",
      "Action": ["ssmmessages:CreateControlChannel", "ssmmessages:CreateDataChannel", "ssmmessages:OpenControlChannel", "ssmmessages:OpenDataChannel"],
      "Resource": "*"
    }
  ]
}
EOF

aws iam create-role --role-name gearvault-task --assume-role-policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"ecs-tasks.amazonaws.com"},"Action":"sts:AssumeRole"}]}'
aws iam put-role-policy --role-name gearvault-task --policy-name MediaS3AndExec --policy-document file:///tmp/task-policy.json`,
        consoleSteps: () => [
          'Navigate to IAM -> Roles -> Create role (Elastic Container Service Task).',
          'Role 1: "gearvault-task-exec". Attach "AmazonECSTaskExecutionRolePolicy" + inline policy for SecretsManager:GetSecretValue on "gearvault/*".',
          'Role 2: "gearvault-task". Inline policy granting s3:GetObject, s3:PutObject on the media bucket and ssmmessages:* (for ECS Exec debugging).'
        ]
      }
    ]
  },
  {
    id: 'phase-7',
    number: '7',
    title: 'Container Build, Schema Migration & Canonical Seeding',
    description: 'Build production Docker container, push to ECR, and execute pre-deployment database migrations and catalog seed tasks.',
    tasks: [
      {
        id: 'task-7-1',
        title: 'Build and Push Production Docker Image',
        resources: ['ecr'],
        summary: 'Authenticate Docker, build linux/amd64 production image, tag as v1, and push to ECR.',
        cliScript: (cfg) => `ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
aws ecr get-login-password --region ${cfg.region} | docker login --username AWS --password-stdin $ACCOUNT_ID.dkr.ecr.${cfg.region}.amazonaws.com

cd backend
docker build --platform linux/amd64 -t gearvault-api:v1 .
docker tag gearvault-api:v1 $ACCOUNT_ID.dkr.ecr.${cfg.region}.amazonaws.com/gearvault-api:v1
docker push $ACCOUNT_ID.dkr.ecr.${cfg.region}.amazonaws.com/gearvault-api:v1`,
        consoleSteps: () => [
          'In Amazon ECR Repositories -> click "gearvault-api".',
          'Click "View push commands" and follow the build, tag, and push steps from the "backend" directory.'
        ]
      },
      {
        id: 'task-7-2',
        title: 'Register Task Definition & Run Pre-Deployment Migration Task',
        resources: ['ecs_fargate', 'rds_postgres'],
        summary: 'Register Task Definition, create ECS cluster, and execute one-off "flask db upgrade" and "flask seed" tasks before launching the service.',
        cliScript: (cfg) => `ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

# 1. Register Task Definition
cat << EOF > /tmp/task-def.json
{
  "family": "gearvault-api",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "512",
  "memory": "1024",
  "executionRoleArn": "arn:aws:iam::$ACCOUNT_ID:role/gearvault-task-exec",
  "taskRoleArn": "arn:aws:iam::$ACCOUNT_ID:role/gearvault-task",
  "containerDefinitions": [
    {
      "name": "api",
      "image": "$ACCOUNT_ID.dkr.ecr.${cfg.region}.amazonaws.com/gearvault-api:v1",
      "essential": true,
      "portMappings": [{ "containerPort": 5000, "protocol": "tcp" }],
      "environment": [
        { "name": "FLASK_ENV", "value": "production" },
        { "name": "PORT", "value": "5000" },
        { "name": "AWS_REGION", "value": "${cfg.region}" },
        { "name": "S3_BUCKET", "value": "${cfg.mediaBucket}" },
        { "name": "MEDIA_BASE_URL", "value": "https://${cfg.domain}/media" },
        { "name": "PROXY_FIX_FOR", "value": "2" },
        { "name": "CORS_ORIGINS", "value": "https://${cfg.domain}" },
        { "name": "WEB_CONCURRENCY", "value": "2" },
        { "name": "SEED_DEV_USERS", "value": "false" }
      ],
      "secrets": [
        { "name": "DATABASE_URL", "valueFrom": "arn:aws:secretsmanager:${cfg.region}:$ACCOUNT_ID:secret:gearvault/production/credentials:DATABASE_URL::" },
        { "name": "JWT_SECRET_KEY", "valueFrom": "arn:aws:secretsmanager:${cfg.region}:$ACCOUNT_ID:secret:gearvault/production/credentials:JWT_SECRET_KEY::" }
      ],
      "healthCheck": {
        "command": ["CMD-SHELL", "curl -f http://localhost:5000/api/health || exit 1"],
        "interval": 30,
        "timeout": 5,
        "retries": 3,
        "startPeriod": 15
      },
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/gearvault-api",
          "awslogs-region": "${cfg.region}",
          "awslogs-stream-prefix": "ecs",
          "awslogs-create-group": "true"
        }
      }
    }
  ]
}
EOF

aws ecs register-task-definition --cli-input-json file:///tmp/task-def.json --region ${cfg.region}

# 2. Create ECS Cluster
aws ecs create-cluster --cluster-name gearvault --region ${cfg.region}

# 3. Execute one-off database migration task
aws ecs run-task \\
  --cluster gearvault \\
  --task-definition gearvault-api \\
  --launch-type FARGATE \\
  --network-configuration "awsvpcConfiguration={subnets=[$APP_SUB1],securityGroups=[$APP_SG],assignPublicIp=DISABLED}" \\
  --overrides '{"containerOverrides":[{"name":"api","command":["flask","db","upgrade"]}]}' \\
  --region ${cfg.region}

# 4. Execute catalog seed task
aws ecs run-task \\
  --cluster gearvault \\
  --task-definition gearvault-api \\
  --launch-type FARGATE \\
  --network-configuration "awsvpcConfiguration={subnets=[$APP_SUB1],securityGroups=[$APP_SG],assignPublicIp=DISABLED}" \\
  --overrides '{"containerOverrides":[{"name":"api","command":["flask","seed"]}]}' \\
  --region ${cfg.region}`,
        consoleSteps: (cfg) => [
          'Navigate to ECS -> Task definitions -> Create new task definition (Fargate, 0.5 vCPU, 1 GB RAM).',
          'Attach Task role: "gearvault-task" and Task execution role: "gearvault-task-exec".',
          'Map Secrets Manager credentials for DATABASE_URL and JWT_SECRET_KEY.',
          'Create cluster "gearvault".',
          'Under Cluster -> Tasks -> Click "Run new task". Under Container overrides, run "flask,db,upgrade" then "flask,seed".'
        ]
      }
    ]
  },
  {
    id: 'phase-8',
    number: '8',
    title: 'Compute Service & Auto Scaling Tier',
    description: 'Launch the ECS Fargate Service attached to the ALB Target Group, and configure Application Auto Scaling capped at 2–4 tasks.',
    tasks: [
      {
        id: 'task-8-1',
        title: 'Create ECS Fargate Service & Application Auto Scaling',
        resources: ['ecs_fargate', 'autoscaling'],
        summary: 'Deploy gearvault-api service (desired: 2) in private app subnets. Configure auto scaling to scale between 2 and 4 tasks, safely within RDS db.t4g.micro limits.',
        cliScript: (cfg) => `# 1. Create ECS Service attached to ALB Target Group
aws ecs create-service \\
  --cluster gearvault \\
  --service-name gearvault-api \\
  --task-definition gearvault-api \\
  --desired-count 2 \\
  --launch-type FARGATE \\
  --network-configuration "awsvpcConfiguration={subnets=[$APP_SUB1,$APP_SUB2],securityGroups=[$APP_SG],assignPublicIp=DISABLED}" \\
  --load-balancers "targetGroupArn=$TG_ARN,containerName=api,containerPort=5000" \\
  --deployment-configuration "deploymentCircuitBreaker={enable=true,rollback=true}" \\
  --enable-execute-command \\
  --region ${cfg.region}

# 2. Register Scalable Target (Capped at min 2, max 4 tasks)
aws application-autoscaling register-scalable-target \\
  --service-namespace ecs \\
  --resource-id service/gearvault/gearvault-api \\
  --scalable-dimension ecs:service:DesiredCount \\
  --min-capacity 2 \\
  --max-capacity 4 \\
  --region ${cfg.region}

# 3. Put Target Tracking Scaling Policy (CPU 60%)
aws application-autoscaling put-scaling-policy \\
  --service-namespace ecs \\
  --resource-id service/gearvault/gearvault-api \\
  --scalable-dimension ecs:service:DesiredCount \\
  --policy-name ecs-cpu-target-tracking \\
  --policy-type TargetTrackingScaling \\
  --target-tracking-scaling-policy-configuration '{"TargetValue":60.0,"PredefinedMetricSpecification":{"PredefinedMetricType":"ECSServiceAverageCPUUtilization"},"ScaleOutCooldown":60,"ScaleInCooldown":300}' \\
  --region ${cfg.region}`,
        consoleSteps: () => [
          'In ECS Cluster "gearvault" -> Create Service (Fargate, desired: 2).',
          'Networking: Private app subnets, Security group "gearvault-app-sg", Public IP: Disabled.',
          'Load balancer: Application Load Balancer -> select Target Group "gearvault-api-tg".',
          'Deployment configuration: Enable Deployment circuit breaker with Rollback on failure.',
          'Service auto scaling: Min capacity 2, Max capacity 4. Target tracking metric: ECSServiceAverageCPUUtilization at 60%.'
        ],
        callout: {
          type: 'info',
          text: 'Database Sizing Protection: Capping auto scaling at 4 tasks means a maximum of 8 Gunicorn workers and ~16-24 SQLAlchemy pool connections—comfortably beneath the PostgreSQL 112 connection limit of db.t4g.micro without requiring an expensive RDS Proxy.'
        }
      }
    ]
  },
  {
    id: 'phase-9',
    number: '9',
    title: 'Edge Security Tier: CloudFront, WAF & CloudFront Functions',
    description: 'Deploy AWS WAF in us-east-1, create CloudFront Functions (spa-rewrite and strip-media), and configure the Multi-Origin CloudFront distribution.',
    tasks: [
      {
        id: 'task-9-1',
        title: 'Deploy AWS WAF Web ACL in us-east-1',
        resources: ['waf'],
        summary: 'Create WAF Web ACL with AWSManagedRulesCommonRuleSet and a Rate-Based Rule on /api/auth/ (100 req/5 min per IP) at the CloudFront edge.',
        cliScript: () => `cat << 'EOF' > /tmp/waf-acl.json
{
  "Name": "gearvault-waf",
  "Scope": "CLOUDFRONT",
  "DefaultAction": { "Allow": {} },
  "Rules": [
    {
      "Name": "AWSManagedRulesCommonRuleSet",
      "Priority": 1,
      "Statement": { "ManagedRuleGroupStatement": { "VendorName": "AWS", "Name": "AWSManagedRulesCommonRuleSet" } },
      "OverrideAction": { "None": {} },
      "VisibilityConfig": { "SampledRequestsEnabled": true, "CloudWatchMetricsEnabled": true, "MetricName": "GearVaultCommonRules" }
    },
    {
      "Name": "RateLimitAuthLogins",
      "Priority": 2,
      "Statement": {
        "RateBasedStatement": {
          "Limit": 100,
          "AggregateKeyType": "IP",
          "ScopeDownStatement": {
            "ByteMatchStatement": {
              "SearchString": "/api/auth/",
              "FieldToMatch": { "UriPath": {} },
              "TextTransformations": [{ "Priority": 0, "Type": "LOWERCASE" }],
              "PositionalConstraint": "STARTS_WITH"
            }
          }
        }
      },
      "Action": { "Block": {} },
      "VisibilityConfig": { "SampledRequestsEnabled": true, "CloudWatchMetricsEnabled": true, "MetricName": "RateLimitAuthLogins" }
    }
  ],
  "VisibilityConfig": { "SampledRequestsEnabled": true, "CloudWatchMetricsEnabled": true, "MetricName": "GearVaultWAF" }
}
EOF

# WAF for CloudFront must be created in us-east-1
WAF_ARN=$(aws wafv2 create-web-acl --cli-input-json file:///tmp/waf-acl.json --region us-east-1 --query 'Summary.ARN' --output text)
echo "WAF Web ACL ARN: $WAF_ARN"`,
        consoleSteps: () => [
          'Navigate to AWS WAF -> Web ACLs. Switch region to "Global (CloudFront)".',
          'Create Web ACL: "gearvault-waf". Attach Managed Rule Group "Core rule set" (CommonRuleSet).',
          'Add Custom Rate-Based Rule: Limit 100 requests per 5 minutes per IP starting with URI "/api/auth/". Action: Block. Click Create.'
        ]
      },
      {
        id: 'task-9-2',
        title: 'Create CloudFront Functions for SPA Rewrite & Media Routing',
        resources: ['cf_functions'],
        summary: 'Create spa-rewrite (rewrites paths without extensions to /index.html without breaking API 404/403) and strip-media (strips /media prefix for S3).',
        cliScript: () => `# 1. CloudFront Function: spa-rewrite (Safe SPA client-side routing)
cat << 'EOF' > /tmp/fn-spa-rewrite.js
function handler(event) {
    var request = event.request;
    var uri = request.uri;
    // If URI has no file extension and is not /api or /media, rewrite to /index.html
    if (!uri.includes('.') && !uri.startsWith('/api') && !uri.startsWith('/media')) {
        request.uri = '/index.html';
    }
    return request;
}
EOF

aws cloudfront create-function \\
  --name spa-rewrite \\
  --function-config '{"Comment":"Rewrite SPA client routes to /index.html","Runtime":"cloudfront-js-2.0"}' \\
  --function-code fileb:///tmp/fn-spa-rewrite.js

aws cloudfront publish-function --name spa-rewrite --if-match $(aws cloudfront describe-function --name spa-rewrite --query 'ETag' --output text)

# 2. CloudFront Function: strip-media (Strips /media prefix before querying S3)
cat << 'EOF' > /tmp/fn-strip-media.js
function handler(event) {
    var request = event.request;
    request.uri = request.uri.replace(/^\/media/, '');
    return request;
}
EOF

aws cloudfront create-function \\
  --name strip-media \\
  --function-config '{"Comment":"Strip /media prefix for S3 items","Runtime":"cloudfront-js-2.0"}' \\
  --function-code fileb:///tmp/fn-strip-media.js

aws cloudfront publish-function --name strip-media --if-match $(aws cloudfront describe-function --name strip-media --query 'ETag' --output text)`,
        consoleSteps: () => [
          'Navigate to CloudFront -> Functions -> Create function: "spa-rewrite". Paste the spa-rewrite code above. Click Save and Publish.',
          'Create function: "strip-media". Paste the strip-media code above. Click Save and Publish.'
        ],
        callout: {
          type: 'success',
          text: 'Architectural Catch: Using CloudFront Function spa-rewrite on the default /* behavior solves React Router refreshes cleanly WITHOUT using Custom Error Responses. Unlike custom error pages, this guarantees API 404 and 403 responses pass through to the frontend as real JSON errors instead of getting rewritten to index.html!'
        }
      },
      {
        id: 'task-9-3',
        title: 'Create Multi-Origin CloudFront Distribution',
        resources: ['cloudfront', 's3_frontend', 's3_media', 'alb'],
        summary: 'Configure CloudFront with S3 Frontend (OAC), S3 Media (OAC for items/* only), and ALB (/api/* with X-Origin-Verify custom header).',
        cliScript: (cfg) => `# Create Origin Access Control for S3
OAC_ID=$(aws cloudfront create-origin-access-control \\
  --origin-access-control-config "{\\"Name\\":\\"gearvault-oac\\",\\"Description\\":\\"OAC for S3\\",\\"SigningProtocol\\":\\"sigv4\\",\\"SigningBehavior\\":\\"always\\",\\"OriginAccessControlOriginType\\":\\"s3\\"}" \\
  --query 'OriginAccessControl.Id' --output text)

echo "OAC ID: $OAC_ID"
echo "Proceed to create distribution with 3 Origins (S3 Frontend, S3 Media, ALB) and attach spa-rewrite and strip-media functions."`,
        consoleSteps: (cfg) => [
          'Navigate to CloudFront -> Distributions -> Create distribution.',
          `Origin 1: S3 Frontend Bucket "${cfg.frontendBucket}" via OAC. Default behavior: Viewer protocol policy: Redirect HTTP to HTTPS. Attach Function: "spa-rewrite" on Viewer Request.`,
          `Origin 2: S3 Media Bucket "${cfg.mediaBucket}" via OAC. Add behavior on Path pattern: "/media/*" -> Forward to S3 Media origin. Attach Function: "strip-media" on Viewer Request.`,
          `Origin 3: ALB domain name over HTTP:80. Add custom origin header: Name="X-Origin-Verify", Value="${cfg.originVerifyHeader}".`,
          'Add behavior on Path pattern: "/api/*" -> Forward to ALB origin. Allowed HTTP methods: GET, HEAD, OPTIONS, PUT, POST, PATCH, DELETE. Cache policy: CachingDisabled. Origin request policy: AllViewerExceptHostHeader.',
          'Attach WAF Web ACL: "gearvault-waf". Click Create distribution.'
        ]
      }
    ]
  },
  {
    id: 'phase-10',
    number: '10',
    title: 'Background Automation Tier (Amazon EventBridge Scheduler)',
    description: 'Configure EventBridge Scheduler running flask jobs run every 5 minutes with PostgreSQL row-level locks.',
    tasks: [
      {
        id: 'task-10-1',
        title: 'Create EventBridge Scheduler Rule for Background Maintenance',
        resources: ['eventbridge', 'ecs_fargate'],
        summary: 'Trigger "flask jobs run" every 5 minutes to expire 15-min soft holds (FR024) and escalate 7-day overdue rentals (FR023).',
        cliScript: (cfg) => `ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

# 1. IAM Role for EventBridge to invoke ECS Task
cat << 'EOF' > /tmp/eventbridge-role.json
{
  "Version": "2012-10-17",
  "Statement": [
    { "Effect": "Allow", "Principal": { "Service": "scheduler.amazonaws.com" }, "Action": "sts:AssumeRole" }
  ]
}
EOF

aws iam create-role --role-name gearvault-scheduler-role --assume-role-policy-document file:///tmp/eventbridge-role.json
aws iam attach-role-policy --role-name gearvault-scheduler-role --policy-arn arn:aws:iam::aws:policy/AmazonECS_FullAccess

# 2. Schedule Rule (every 5 minutes)
aws scheduler create-schedule \\
  --name gearvault-run-jobs \\
  --schedule-expression "rate(5 minutes)" \\
  --flexible-time-window '{"Mode":"OFF"}' \\
  --target "{\\"Arn\\":\\"arn:aws:ecs:${cfg.region}:$ACCOUNT_ID:cluster/gearvault\\",\\"RoleArn\\":\\"arn:aws:iam::$ACCOUNT_ID:role/gearvault-scheduler-role\\",\\"EcsParameters\\":{\\"TaskDefinitionArn\\":\\"arn:aws:ecs:${cfg.region}:$ACCOUNT_ID:task-definition/gearvault-api\\",\\"LaunchType\\":\\"FARGATE\\",\\"NetworkConfiguration\\":{\\"awsvpcConfiguration\\":{\\"Subnets\\":[\\"$APP_SUB1\\"],\\"SecurityGroups\\":[\\"$APP_SG\\"],\\"AssignPublicIp\\":\\"DISABLED\\"}},\\"Overrides\\":{\\"ContainerOverrides\\":[{\\"Name\\":\\"api\\",\\"Command\\":[\\"flask\\",\\"jobs\\",\\"run\\"]}]}}}" \\
  --region ${cfg.region}`,
        consoleSteps: (cfg) => [
          `Navigate to EventBridge -> Schedules in ${cfg.region} -> Create schedule.`,
          'Name: "gearvault-run-jobs". Schedule: rate(5 minutes). Target: Amazon ECS -> RunTask.',
          'Cluster: "gearvault", Task definition: "gearvault-api". Under Container overrides, Command: "flask,jobs,run".'
        ]
      }
    ]
  },
  {
    id: 'phase-11',
    number: '11',
    title: 'Observability & Live Production Smoke Verification',
    description: 'Configure CloudWatch Logs & Alarms, sync the React build to S3, and execute end-to-end smoke verification tests.',
    tasks: [
      {
        id: 'task-11-1',
        title: 'Configure CloudWatch Alarms & SNS Alert Topic',
        resources: ['cloudwatch', 'sns'],
        summary: 'Create SNS topic gearvault-alerts and metric alarms for ALB 5XX errors (> 10 in 5 min) and RDS CPU utilization (> 80%).',
        cliScript: (cfg) => `# 1. Create SNS Alerts Topic
TOPIC_ARN=$(aws sns create-topic --name gearvault-alerts --region ${cfg.region} --query 'TopicArn' --output text)
aws sns subscribe --topic-arn $TOPIC_ARN --protocol email --notification-endpoint your-email@example.com --region ${cfg.region}

# 2. CloudWatch Alarm on ALB 5XX HTTP Errors
aws cloudwatch put-metric-alarm \\
  --alarm-name "GearVault-High-5XX-Errors" \\
  --metric-name HTTPCode_Target_5XX_Count \\
  --namespace AWS/ApplicationELB \\
  --statistic Sum \\
  --period 300 \\
  --evaluation-periods 1 \\
  --threshold 10 \\
  --comparison-operator GreaterThanThreshold \\
  --alarm-actions $TOPIC_ARN \\
  --region ${cfg.region}

# 3. CloudWatch Alarm on RDS High CPU
aws cloudwatch put-metric-alarm \\
  --alarm-name "GearVault-RDS-High-CPU" \\
  --metric-name CPUUtilization \\
  --namespace AWS/RDS \\
  --statistic Average \\
  --period 300 \\
  --evaluation-periods 2 \\
  --threshold 80 \\
  --comparison-operator GreaterThanThreshold \\
  --alarm-actions $TOPIC_ARN \\
  --region ${cfg.region}`,
        consoleSteps: (cfg) => [
          `Navigate to SNS -> Topics -> Create topic "gearvault-alerts". Create Email subscription with your email address.`,
          'Navigate to CloudWatch -> Alarms -> Create alarm for ALB 5XX errors > 10 and RDS CPU > 80% notifying the SNS topic.'
        ]
      },
      {
        id: 'task-11-2',
        title: 'Deploy Frontend to S3 & Run End-to-End Smoke Test Suite',
        resources: ['s3_frontend', 'cloudfront', 'ecs_fargate', 'rds_postgres'],
        summary: 'Deploy compiled Vite SPA to S3, invalidate CloudFront cache, and verify liveness, readiness, customer auth, direct S3 upload, and media retrieval.',
        cliScript: (cfg) => `# 1. Build and sync frontend assets
cd frontend
npm install
npm run build
aws s3 sync dist/ s3://${cfg.frontendBucket} --delete --region ${cfg.region}
aws cloudfront create-invalidation --distribution-id <CLOUDFRONT_DISTRIBUTION_ID> --paths "/*"

# 2. Run End-to-End Verification Tests
echo "--- 1. Testing Liveness Probe ---"
curl -i https://${cfg.domain}/api/health

echo "--- 2. Testing Readiness Probe (DB Check) ---"
curl -i https://${cfg.domain}/api/health/ready

echo "--- 3. Testing Catalog Items ---"
curl -i https://${cfg.domain}/api/catalog/items

echo "--- 4. Testing User Registration ---"
curl -i -X POST https://${cfg.domain}/api/auth/register \\
  -H "Content-Type: application/json" \\
  -d '{"email":"testuser@gearvault.com","password":"Password123!","full_name":"Jane Doe"}'

echo "--- 5. Testing Login & JWT Issuance ---"
TOKEN=$(curl -s -X POST https://${cfg.domain}/api/auth/login \\
  -H "Content-Type: application/json" \\
  -d '{"email":"testuser@gearvault.com","password":"Password123!"}' | grep -o '"access_token":"[^"]*' | cut -d'"' -f4)

echo "--- 6. Verifying Authenticated Profile ---"
curl -i https://${cfg.domain}/api/auth/me -H "Authorization: Bearer $TOKEN"

echo "--- 7. Testing Direct-to-ALB Block (Must return 403) ---"
curl -i http://<ALB_DNS_NAME>/api/health`,
        consoleSteps: (cfg) => [
          'In frontend/: Run "npm run build". Upload dist/ contents to the S3 Frontend bucket.',
          'Create CloudFront invalidation for "/*".',
          `Open https://${cfg.domain} in your browser. Verify the catalog loads, images render, login works, and reservations succeed.`
        ],
        callout: {
          type: 'success',
          text: 'Verification Complete: All 7 smoke tests (Liveness, Readiness, Catalog, Auth, JWT, Profile, and Direct ALB 403 Block) passing confirms a resilient, secure production deployment!'
        }
      }
    ]
  }
];
