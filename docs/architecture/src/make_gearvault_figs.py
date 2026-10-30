"""GearVault cloud-architecture figures (paper style). Usage: py -I make_gearvault_figs.py <out_dir>"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from figlib import Fig, build

OUT = sys.argv[1]
ONLY = sys.argv[2:]


def want(n):
    return not ONLY or n in ONLY


# =============================================================================
# Figure 1 — Overall production architecture
# =============================================================================
def fig1():
    f = Fig(1900, 1180)
    # users
    f.mtext(85, 440, ["Users", "(browser)"], 17)
    f.mtext(85, 500, ["customer /", "staff / manager"], 13, lh=16, italic=True)
    f.line([(130, 440), (197, 440)])

    # global edge
    f.cont(180, 330, 455, 790, "Global edge")
    f.box(318, 440, 240, 62, "AWS WAF Web ACL", "core rules · auth rate limit")
    f.box(318, 580, 240, 62, "Amazon CloudFront", "HTTPS · 3 origins · OAC")
    f.box(318, 715, 240, 62, "CloudFront Functions", "spa-rewrite · strip-media", dash=True)
    f.line([(318, 471), (318, 548)])
    f.line([(318, 684), (318, 612)], dash=True)
    f.label(326, 652, "viewer-request", anchor="start", size=12.5)

    # region
    f.cont(520, 60, 1885, 1110, "AWS Region · ap-south-1 (Mumbai)")
    f.cyl(720, 170, 170, 84, ["S3 Frontend", "Bucket"])
    f.label(815, 166, "React 18 / Vite", anchor="start")
    f.label(815, 184, "build (SPA)", anchor="start")
    f.cyl(1300, 170, 200, 84, ["S3 Media", "Bucket"])
    f.label(1410, 166, "items/*  — public via CDN", anchor="start")
    f.label(1410, 184, "condition/*  — private", anchor="start")

    # CloudFront -> origins (non-crossing fan-out)
    f.line([(438, 560), (470, 560), (470, 170), (634, 170)])
    f.label(585, 162, "default /*", size=13)
    f.line([(438, 580), (485, 580), (485, 245), (1230, 245), (1230, 213)])
    f.label(880, 237, "/media/*  (OAC, items/* only)", size=13)
    f.line([(438, 600), (500, 600), (500, 420), (524, 420)])

    # VPC
    f.cont(580, 290, 1470, 1085, "VPC · 10.0.0.0/16")
    f.zone(655, 330, 1010, 1065, "Availability Zone ap-south-1a")
    f.zone(1040, 330, 1440, 1065, "Availability Zone ap-south-1b")
    for (x1, x2), cidrs in (((670, 995), ("10.0.1.0/24", "10.0.10.0/24", "10.0.30.0/24")),
                            ((1055, 1425), ("10.0.2.0/24", "10.0.20.0/24", "10.0.40.0/24"))):
        for (y1, y2), kind, c in zip(((360, 515), (545, 775), (805, 1050)),
                                     ("Public subnet", "Private app subnet", "Private data subnet"), cidrs):
            f.zone(x1, y1, x2, y2, None, stroke="#666", dash=False, sw=0.9, rx=6)
            f.label(x1 + 10, (y2 - 8) if kind.endswith("data subnet") else (y1 + 16), f"{kind} {c}", anchor="start", size=12)

    f.box(580, 420, 110, 50, ["Internet", "Gateway"], size=15)
    f.box(850, 480, 130, 50, "NAT Gateway", "+ Elastic IP", size=15.5, subsize=12.5)
    f.box(1047, 435, 250, 62, "Application Load Balancer", "HTTP :80 · default 403", size=16.5)
    f.line([(635, 425), (921, 425)])
    f.label(778, 415, "/api/*  + X-Origin-Verify", size=13)

    # ECS service
    f.rect(685, 615, 710, 130, rx=10, dash=True, sw=1.1, fill="none")
    f.label(1036, 739, "ECS service · 2–4 tasks", size=12.5)
    f.box(832, 690, 250, 62, "Fargate Task", "Flask · Gunicorn :5000")
    f.box(1240, 690, 250, 62, "Fargate Task", "Flask · Gunicorn :5000")
    f.line([(1047, 466), (1047, 590)], arrow=False)
    f.line([(832, 590), (1240, 590)], arrow=False)
    f.line([(832, 590), (832, 658)])
    f.line([(1240, 590), (1240, 658)])
    f.label(1055, 540, ":5000 from alb-sg", anchor="start", size=12.5)

    # egress via NAT
    f.line([(870, 659), (870, 506)], dash=True)
    f.label(878, 535, "egress via NAT", anchor="start", size=12)
    f.line([(785, 480), (580, 480), (580, 446)], dash=True)

    # S3 gateway endpoint
    f.box(1345, 290, 170, 40, "S3 Gateway Endpoint", size=14.5)
    f.line([(1345, 659), (1345, 311)], dash=True)
    f.label(1337, 470, "media I/O, no NAT", size=12, rotate=-90)
    f.line([(1345, 270), (1345, 213)])

    # data tier
    f.line([(832, 721), (832, 889)])
    f.line([(1240, 721), (1240, 795), (832, 795)], arrow=False)
    f.label(842, 850, ":5432 · TLS (db-sg)", anchor="start", size=12.5)
    f.cyl(832, 935, 210, 96, ["RDS PostgreSQL 16", "Primary"], size=15, sub="db.t4g.micro · encrypted")
    f.cyl(1240, 935, 210, 96, ["RDS PostgreSQL 16", "Standby"], size=15, sub="Multi-AZ · gp3")
    f.line([(938, 940), (1134, 940)], dash=True, both=True)
    f.label(1036, 930, "sync replication")

    # regional managed services
    f.zone(1530, 330, 1870, 1000, "Regional managed services")
    svc = [(380, "Amazon ECR", "image · scan on push"),
           (480, "Secrets Manager", "DB URL · JWT · origin secret"),
           (580, "IAM Roles", "task-exec · task · scheduler"),
           (680, "EventBridge Scheduler", "rate(5 min) → flask jobs run"),
           (790, "Amazon CloudWatch", "logs · 5XX & RDS-CPU alarms"),
           (900, "Amazon SNS", "gearvault-alerts topic")]
    for cy, a, b in svc:
        f.box(1700, cy, 300, 62, a, b, size=16.5)
    for cy, *_ in svc[:5]:
        f.line([(1550, cy), (1505, cy)], arrow=False)
    f.line([(1505, 380), (1505, 790)], arrow=False)
    f.line([(1505, 690), (1366, 690)])
    f.line([(1700, 821), (1700, 868)])
    f.line([(1700, 931), (1700, 958)])
    f.text(1700, 980, "E-mail alert", 15.5)

    f.save(OUT, "fig1_overall_architecture",
           "Figure 1.  GearVault production architecture on AWS — edge, network, compute, data and managed services.",
           1150)


# =============================================================================
# Figure 2 — Network topology & security groups
# =============================================================================
def fig2():
    f = Fig(1760, 1010)
    f.text(575, 34, "Internet  (CloudFront edge)", 16)
    f.line([(575, 42), (575, 67)])
    f.cont(60, 90, 1090, 920, "VPC gearvault-vpc · 10.0.0.0/16 · DNS hostnames on")
    f.box(575, 90, 170, 44, "Internet Gateway", size=15.5)
    f.zone(95, 130, 560, 900, "Availability Zone ap-south-1a")
    f.zone(590, 130, 1055, 900, "Availability Zone ap-south-1b")
    f.line([(575, 112), (575, 160)], arrow=False)
    f.line([(327, 160), (822, 160)], arrow=False)
    f.line([(327, 160), (327, 179)])
    f.line([(822, 160), (822, 179)])

    rows = [(255, "Public subnet", ("10.0.1.0/24", "10.0.2.0/24"),
             (["ALB node (gearvault-alb)", "NAT Gateway + Elastic IP", "auto-assign public IP"],
              ["ALB node (gearvault-alb)", "auto-assign public IP"])),
            (505, "Private app subnet", ("10.0.10.0/24", "10.0.20.0/24"),
             (["ECS Fargate API task", "migrate / seed / jobs tasks", "no public IP"],
              ["ECS Fargate API task", "no public IP"])),
            (755, "Private data subnet", ("10.0.30.0/24", "10.0.40.0/24"),
             (["RDS PostgreSQL primary", "gearvault-db-subnet-group"],
              ["RDS PostgreSQL standby", "gearvault-db-subnet-group"]))]
    for cy, kind, cidrs, subs in rows:
        for cx, c, s in zip((327, 822), cidrs, subs):
            f.box(cx, cy, 410, 150, f"{kind} · {c}", s, size=16.5, subsize=13.5)
    # NAT dependency
    f.line([(260, 430), (260, 331)], dash=True)
    f.label(268, 395, "0.0.0.0/0 → NAT", anchor="start", size=12.5)
    f.line([(822, 430), (822, 400), (420, 400), (420, 331)], dash=True)
    f.label(730, 392, "single shared NAT (cost)", size=12.5)
    f.line([(533, 755), (616, 755)], dash=True, both=True)
    f.label(575, 745, "sync", size=12.5)

    # route tables
    f.cont(1130, 90, 1700, 420, "Route tables")
    f.box(1415, 175, 500, 74, "gearvault-public-rt",
          ["0.0.0.0/0 → Internet Gateway", "associated: public subnets A, B"], size=16.5)
    f.box(1415, 320, 500, 100, "gearvault-private-rt",
          ["0.0.0.0/0 → NAT Gateway", "S3 prefix list → S3 Gateway Endpoint",
           "associated: app A/B, data A/B"], size=16.5)

    # SG chain
    f.cont(1130, 460, 1700, 920, "Security-group chain (least privilege)")
    sg = [(530, "CloudFront origin-facing prefix list", "com.amazonaws.global.cloudfront.origin-facing"),
          (640, "gearvault-alb-sg", "inbound TCP 80 from the prefix list only"),
          (750, "gearvault-app-sg", "inbound TCP 5000 from alb-sg only"),
          (860, "gearvault-db-sg", "inbound TCP 5432 from app-sg only")]
    for cy, a, b in sg:
        f.box(1415, cy, 480, 58, a, b, size=16.5)
    for (y1, *_), (y2, *_), lab in zip(sg, sg[1:], ("TCP 80", "TCP 5000", "TCP 5432")):
        f.line([(1415, y1 + 29), (1415, y2 - 30)])
        f.label(1425, (y1 + y2) / 2 + 5, lab, anchor="start")

    f.save(OUT, "fig2_network_topology",
           "Figure 2.  Network topology — two Availability Zones, three subnet tiers, route tables and the security-group chain.",
           975)


# =============================================================================
# Figure 3 — Request routing through the edge and API tiers
# =============================================================================
def fig3():
    f = Fig(1650, 1250, dy=-110)
    NX = 1130
    f.text(560, 1282, "Browser request (HTTPS)", 17)
    f.line([(560, 1262), (560, 1197)])
    f.box(560, 1165, 800, 62, "AWS WAF Web ACL  (gearvault-waf, scope CLOUDFRONT)",
          "AWSManagedRulesCommonRuleSet · rate limit 100 requests / 5 min per IP on /api/auth/*")
    f.note(960, 1165, NX, ["Evaluated at the edge before any origin is reached;",
                           "matching requests are blocked with HTTP 403"])
    f.line([(560, 1134), (560, 1092)])
    f.box(560, 1060, 800, 62, "CloudFront distribution — behaviour chosen by path pattern",
          "viewer protocol policy: redirect HTTP → HTTPS")
    f.note(960, 1060, NX, ["Three origins: S3 frontend, S3 media and the ALB;",
                           "S3 origins are signed with Origin Access Control"])
    L1, L2, L3 = 230, 520, 880
    f.line([(560, 1029), (560, 1000)], arrow=False)
    f.line([(L1, 1000), (L3, 1000)], arrow=False)
    for x, lab in ((L1, "default  /*"), (L2, "/media/*"), (L3, "/api/*")):
        f.line([(x, 1000), (x, 967)])
        f.label(x + 8, 990, lab, anchor="start")

    # lane 1 & 2
    f.box(L1, 935, 250, 62, "spa-rewrite", "no extension → /index.html")
    f.box(L2, 935, 250, 62, "strip-media", "/media/items/x → /items/x")
    f.cyl(L1, 820, 210, 90, ["S3 Frontend", "Bucket"])
    f.cyl(L2, 820, 210, 90, ["S3 Media Bucket", "items/* only"])
    for x in (L1, L2):
        f.line([(x, 904), (x, 866)])
        f.line([(x, 775), (x, 738)])
    f.text(L1, 722, "index.html · JS · CSS", 16)
    f.text(L2, 722, "Catalog equipment image", 16)
    f.mtext(L1, 640, ["React Router deep links load", "without custom error pages,", "so API 404s stay JSON"],
            14.5, lh=19, italic=True)
    f.mtext(L2, 640, ["condition/* photos are never", "reachable through the CDN;", "they need presigned URLs"],
            14.5, lh=19, italic=True)

    # lane 3
    f.box(L3, 935, 340, 62, "Origin request to ALB", "+ X-Origin-Verify · CachingDisabled")
    f.note(L3 + 170, 935, NX, ["Secret header is added by CloudFront and never seen",
                               "by the browser; API responses are not cached"])
    f.line([(L3, 904), (L3, 852)])
    f.box(L3, 820, 340, 62, "Application Load Balancer", "alb-sg: TCP 80 from CloudFront only")
    f.note(L3 + 170, 820, NX, ["The ALB cannot be reached from the open internet:",
                               "only CloudFront edge IP ranges are admitted"])
    f.line([(L3, 789), (L3, 741)])
    f.diamond(L3, 700, 170, 80, "Header valid?")
    f.line([(L3 + 85, 700), (1069, 700)], dash=True)
    f.label(L3 + 95, 692, "no", anchor="start")
    f.box(1185, 700, 230, 58, "Fixed response 403", "direct-to-ALB requests", dash=True)
    f.line([(L3, 660), (L3, 622)])
    f.label(L3 + 8, 645, "yes", anchor="start")
    f.box(L3, 590, 340, 62, "Target group gearvault-api-tg", "IP targets :5000 · health /api/health")
    f.note(L3 + 170, 590, NX, ["Task IPs register automatically (awsvpc); 2 healthy /",
                               "3 unhealthy checks decide which tasks get traffic"])
    f.line([(L3, 559), (L3, 512)])
    f.box(L3, 480, 340, 62, "Gunicorn on ECS Fargate", "2 sync workers · app-sg · 2 AZs")
    f.note(L3 + 170, 480, NX, ["Non-root python:3.13-slim container;",
                               "auto-scaled between 2 and 4 tasks on 60 % CPU"])
    f.line([(L3, 449), (L3, 402)])
    f.box(L3, 370, 340, 62, "Flask middleware", "ProxyFix · CORS · JWT + RBAC")
    f.note(L3 + 170, 370, NX, ["ProxyFix trusts 2 hops (CloudFront + ALB) for client IP;",
                               "the role is read from the database, not the token"])
    f.line([(L3, 339), (L3, 292)])
    f.box(L3, 260, 340, 62, "Route blueprints", "/auth · /catalog · /uploads · /health")
    f.note(L3 + 170, 260, NX, ["Pricing, damage, notification and audit services",
                               "run inside the request handler"])
    f.cyl(L2, 260, 230, 90, ["RDS PostgreSQL 16", "Multi-AZ"], size=15)
    f.line([(636, 260), (709, 260)], both=True)
    f.label(672, 250, "SQL · TLS")
    f.line([(L3, 229), (L3, 187)])
    f.text(L3, 170, "JSON response", 17)

    f.save(OUT, "fig3_request_routing",
           "Figure 3.  Request path — how a browser request is filtered at the edge and routed to S3 or the API tier.",
           1338)


# =============================================================================
# Figure 4 — Automated provisioning pipeline (deploy-all.ps1)
# =============================================================================
def fig4():
    W_ = 470
    P = lambda lab, sub, note: dict(type="box", w=W_, label=lab, sub=sub, note=note)
    nodes = [
        P("Phase 0 · Account & region", "sts get-caller-identity · ap-south-1",
          ["Reads the account ID; bucket names and fresh JWT /", "origin secrets are derived at run time"]),
        P("Phase 1 · Network tier", "VPC · 6 subnets · IGW · NAT · route tables · S3 endpoint · SGs",
          ["10.0.0.0/16 across ap-south-1a/b with one NAT Gateway;", "waits until the NAT Gateway is available"]),
        P("Phase 2 · Object storage", "S3 frontend + media buckets · CORS · access block",
          ["gearvault-frontend-<account> holds the SPA,", "gearvault-media-<account> holds photos"]),
        P("Phase 3 · Database tier", "DB subnet group · RDS PostgreSQL 16 Multi-AZ",
          ["db.t4g.micro, 20 GB gp3, encrypted, not public;", "blocks ~8–10 min on db-instance-available"]),
        P("Phase 4 · Secrets", "gearvault/production/credentials · origin-verify secret",
          ["DATABASE_URL (sslmode=require) + JWT_SECRET_KEY;", "nothing secret is baked into the image"]),
        P("Phase 5 · Ingress", "target group :5000 · internet-facing ALB · listener :80",
          ["IP-type targets with /api/health checks;", "ALB spans both public subnets"]),
        P("Phase 6 · Registry & IAM", "ECR repo · task-exec + task roles · docker build/push :v2",
          ["Image built for linux/amd64 and scanned on push;", "roles trusted by ecs-tasks.amazonaws.com"]),
        P("Phase 7 · Cluster & schema", "ECS cluster · task definition · migrate + seed tasks",
          ["0.5 vCPU / 1 GB task; one-off RunTask runs flask db upgrade,", "then flask seed (5 categories, 11 items)"]),
        P("Phase 8 · Service & scaling", "Fargate service × 2 · circuit breaker · 60 % CPU target",
          ["Rolling deploy (100 % min / 200 % max) with auto rollback;", "Application Auto Scaling keeps 2–4 tasks"]),
        P("Phase 9 · Edge security", "WAF (us-east-1) · CloudFront functions · OAC · distribution",
          ["WAF for CloudFront is global, so the Web ACL lives in", "us-east-1; the distribution fronts S3 and the ALB"]),
        P("Phase 10 · Automation", "scheduler IAM role · rate(5 minutes) schedule",
          ["Scheduler may RunTask and iam:PassRole the task roles;", "runs flask jobs run in a private subnet"]),
        P("Phase 11 · Observability & frontend", "SNS topic · CloudWatch alarms · npm build → S3 sync",
          ["Alarms on ALB 5XX > 10 / 5 min and RDS CPU > 80 %;", "Vite build is synced to S3 with --delete"]),
    ]

    def extras(f, pos):
        groups = [(0, 4, "Foundation"), (5, 8, "Application"), (9, 11, "Edge & operations")]
        bx = pos[0]["left"] - 70
        for a, b, lab in groups:
            y1, y2 = pos[b]["top"] + 4, pos[a]["bottom"] - 4
            f.line([(bx + 12, y1), (bx, y1), (bx, y2), (bx + 12, y2)], arrow=False, sw=1.2)
            f.label(bx - 12, (y1 + y2) / 2, lab, size=15, rotate=-90)

    build(OUT, "fig4_deployment_pipeline", "deploy-all.ps1  (Phases 0 → 11)", nodes,
          "Operator workstation\n(AWS CLI v2 · Docker · Node 20)", "Production live\n9 / 9 smoke tests passed",
          "Figure 4.  Automated provisioning pipeline (deploy-all.ps1) — each phase depends on the ones below it.",
          extras, W=1560, XC=560, NOTE_X=880, GAP=26)


# =============================================================================
# Figure 5 — Container build, compute and scaling
# =============================================================================
def fig5():
    nodes = [
        dict(type="box", w=440, label="Backend source", sub="Flask 3.1 · SQLAlchemy 2 · Alembic · Gunicorn",
             note=["Single Flask app: auth, catalog / bookings,", "uploads and health blueprints"]),
        dict(type="box", w=440, label="Docker build", sub="python:3.13-slim · non-root uid 1000 · HEALTHCHECK",
             note=["--platform linux/amd64 so the image runs on Fargate;", "curl health check on /api/health"]),
        dict(type="box", w=440, label="Amazon ECR · gearvault-api", sub="tag :v2 · scan on push",
             note=["Private registry; images are scanned for", "known vulnerabilities when pushed"]),
        dict(type="box", w=440, label="ECS task definition", sub="FARGATE · awsvpc · 0.5 vCPU / 1 GB · port 5000",
             note=["Plain env: FLASK_ENV, S3_BUCKET, CORS_ORIGINS, PROXY_FIX_FOR;", "secrets come from Secrets Manager"]),
        dict(type="pair", w=214, h=58, size=16, labels=["Task-exec role", "Task role"],
             subs=["pull · secrets · logs", "S3 media get / put"],
             note=["Exec role is used by the ECS agent; the task role gives", "the app short-lived STS keys (no static keys)"]),
        dict(type="box", w=440, label="ECS service · gearvault-api", sub="desired 2 · circuit breaker + rollback",
             note=["New revisions roll out task by task;", "a failing deployment rolls back automatically"]),
        dict(type="trio", w=140, h=56, size=15, labels=["Task", "Task", "Extra tasks"],
             subs=["ap-south-1a", "ap-south-1b", "scale-out to 4"], dash_idx=[2],
             note=["Tasks spread over two AZs; the cap of 4 keeps", "connections within db.t4g.micro limits"]),
    ]

    def extras(f, pos):
        td, svc, tr = pos[3], pos[5], pos[6]
        f.cyl(170, td["cy"], 190, 80, ["Secrets", "Manager"])
        f.line([(266, td["cy"]), (td["left"] - 1, td["cy"])])
        f.label((266 + td["left"]) / 2, td["cy"] - 8, "secrets", size=12.5)
        f.box(170, svc["cy"], 220, 64, ["Application", "Auto Scaling"], "60 % CPU · 2–4 tasks", size=15.5,
              subsize=12.5, dash=True)
        f.line([(281, svc["cy"]), (svc["left"] - 1, svc["cy"])], dash=True)
        f.cyl(170, tr["cy"], 190, 80, ["CloudWatch Logs", "/ecs/gearvault-api"], size=14)
        f.line([(tr["left"], tr["cy"]), (267, tr["cy"])])
        f.label((267 + tr["left"]) / 2, tr["cy"] - 8, "awslogs", size=12.5)

    build(OUT, "fig5_compute_containers", "Container & compute tier", nodes,
          "backend/  (deployment branch)", "Registered IP targets in gearvault-api-tg (ALB)",
          "Figure 5.  From source code to running containers — image build, task definition, roles and auto scaling.",
          extras, W=1560, XC=620, NOTE_X=900)


# =============================================================================
# Figure 6 — Media upload and retrieval (presigned URLs)
# =============================================================================
def fig6():
    nodes = [
        dict(type="box", w=440, label="POST /api/uploads/presign", sub="Bearer JWT · type, content_type, file_size",
             note=["The browser asks the API for permission to upload;", "the file itself never passes through Flask"]),
        dict(type="box", w=440, label="Request validation", sub="image/jpeg · png · webp only · ≤ 5 MB",
             note=["Rejects other file types and oversized files", "with HTTP 400 before anything is signed"]),
        dict(type="diamond", w=150, label="Role allowed?"),
        dict(type="pair", w=230, h=58, size=15.5, labels=["Item photo key", "Condition photo key"],
             subs=["items/<uuid>.jpg", "condition/<rental>/<uuid>.jpg"], in_label="yes",
             note=["Keys are generated by the server (UUID),", "so clients cannot overwrite other objects"]),
        dict(type="box", w=440, label="boto3 presigned PUT URL", sub="SigV4 · task-role STS credentials · ≤ 900 s",
             note=["Signed with the ECS task role's temporary credentials;", "the URL expires after at most 15 minutes"]),
        dict(type="box", w=440, label="Direct PUT from browser to S3", sub="bucket CORS allows GET / PUT · ETag exposed",
             note=["Upload bandwidth goes straight to S3,", "keeping Fargate tasks small"]),
        dict(type="cyl2", w=200, h=80, size=15, labels=["S3 media\nitems/*", "S3 media\ncondition/*"],
             note=["One bucket, two prefixes with different", "visibility rules"]),
        dict(type="pair", w=230, h=58, size=15.5, labels=["CloudFront /media/*", "Presigned GET"],
             subs=["OAC read · cached", "≤ 900 s · issued by API"],
             note=["Catalog photos are public through the CDN;", "inspection photos stay private"]),
    ]

    def extras(f, pos):
        d = pos[2]
        f.line([(620 - 75, d["cy"]), (316, d["cy"])], dash=True)
        f.label(450, d["cy"] - 8, "no")
        f.box(220, d["cy"], 190, 58, "HTTP 403", "wrong role", dash=True)
        f.mtext(220, d["cy"] + 62, ["items: manager only", "condition: staff / manager"], 13.5, lh=17, italic=True)

    build(OUT, "fig6_media_upload", "Media upload & retrieval", nodes,
          "Manager / staff selects a photo\n(browser)", "Image shown in catalog or return inspection",
          "Figure 6.  Presigned-URL media pipeline — uploads go directly to S3; reads go through CloudFront or short-lived URLs.",
          extras, W=1560, XC=620, NOTE_X=900)


# =============================================================================
# Figure 7 — Background jobs and observability
# =============================================================================
def fig7():
    f = Fig(1500, 930)
    # left: scheduled maintenance
    f.cont(80, 140, 660, 800, "Scheduled maintenance")
    X = 370
    f.text(X, 860, "rate(5 minutes) · flexible window OFF", 16.5)
    f.line([(X, 840), (X, 772)])
    f.box(X, 740, 420, 58, "EventBridge Scheduler", "schedule gearvault-run-jobs")
    f.line([(X, 711), (X, 662)])
    f.box(X, 630, 420, 58, "Scheduler IAM role", "ecs:RunTask · iam:PassRole gearvault-task*")
    f.line([(X, 601), (X, 552)])
    f.box(X, 520, 420, 58, "ECS RunTask (Fargate)", "private app subnet · app-sg · flask jobs run")
    f.line([(X, 491), (X, 466)], arrow=False)
    f.line([(255, 466), (485, 466)], arrow=False)
    f.line([(255, 466), (255, 446)])
    f.line([(485, 466), (485, 446)])
    f.box(255, 410, 215, 70, "expire_holds", ["held > 15 min", "→ Expired + notify"], size=16, subsize=12.5)
    f.box(485, 410, 215, 70, "escalate_overdue", ["> 7 days overdue →", "presumed lost + charge"], size=16, subsize=12.5)
    f.line([(255, 375), (255, 352)], arrow=False)
    f.line([(485, 375), (485, 352)], arrow=False)
    f.line([(255, 352), (485, 352)], arrow=False)
    f.line([(X, 352), (X, 332)])
    f.box(X, 305, 420, 52, "SELECT … FOR UPDATE SKIP LOCKED", size=15.5)
    f.line([(X, 279), (X, 247)])
    f.cyl(X, 205, 300, 80, "RDS PostgreSQL", sub="bookings · rentals · notifications · audit log")
    f.line([(X, 165), (X, 112)])
    f.mtext(X, 80, ["Expired holds, replacement charges,", "in-app notifications, financial audit log"], 16.5)

    # right: observability
    f.cont(760, 140, 1420, 800, "Observability")
    R = 1090
    f.text(R, 860, "Running stack (ECS · ALB · RDS)", 16.5)
    f.line([(R, 840), (R, 768)])
    xs = (885, 1090, 1295)
    for x, a, b in zip(xs, ("Container stdout", "ALB metrics", "RDS metrics"),
                       ("Gunicorn access / error", "HTTPCode_Target_5XX", "CPUUtilization")):
        f.box(x, 735, 190, 62, a, b, size=15.5, subsize=12.5)
    for x in xs:
        f.line([(x, 704), (x, 680)], arrow=False)
    f.line([(885, 680), (1295, 680)], arrow=False)
    f.line([(R, 680), (R, 657)])
    f.box(R, 625, 420, 62, "Amazon CloudWatch", "Logs /ecs/gearvault-api · Metrics")
    f.line([(R, 594), (R, 572)], arrow=False)
    f.line([(945, 572), (1235, 572)], arrow=False)
    f.line([(945, 572), (945, 549)])
    f.line([(1235, 572), (1235, 549)])
    f.box(945, 515, 270, 66, "High-5XX-Errors", "Sum > 10 in 5 min", size=16)
    f.box(1235, 515, 270, 66, "RDS-High-CPU", "Avg > 80 % for 2 × 5 min", size=16)
    f.line([(945, 482), (945, 460)], arrow=False)
    f.line([(1235, 482), (1235, 460)], arrow=False)
    f.line([(945, 460), (1235, 460)], arrow=False)
    f.line([(R, 460), (R, 437)])
    f.box(R, 405, 420, 62, "Amazon SNS · gearvault-alerts", "alarm action → e-mail subscription")
    f.line([(R, 374), (R, 332)])
    f.box(R, 300, 420, 62, "Operator response", "inspect logs · roll back / scale · pause")
    f.line([(R, 269), (R, 112)])
    f.mtext(R, 80, ["Service restored", "(see Fig. 8 for runbooks)"], 16.5)

    f.save(OUT, "fig7_jobs_observability",
           "Figure 7.  Background automation (left) and monitoring / alerting (right).", 905)


# =============================================================================
# Figure 8 — Operations lifecycle (deploy / pause / resume / teardown)
# =============================================================================
def fig8():
    f = Fig(1700, 860)
    S = {"np": 230, "run": 850, "pause": 1450}
    for k, lab, sub in (("np", "Not provisioned", "no resources · $0"),
                        ("run", "Running (live)", "2 tasks · RDS up · jobs every 5 min"),
                        ("pause", "Paused (sleep mode)", "0 tasks · RDS stopped · jobs off")):
        f.rect(S[k] - 160, 155, 320, 90, rx=14, sw=1.8)
        f.mtext(S[k], 188, [lab], 19)
        f.label(S[k], 222, sub, size=14)
    f.line([(390, 180), (689, 180)])
    f.label(540, 170, "deploy-all.ps1  (Phases 0–11)")
    f.line([(689, 222), (391, 222)])
    f.label(540, 240, "teardown-all.ps1")
    f.line([(1010, 180), (1289, 180)])
    f.label(1150, 170, "pause-all.ps1")
    f.line([(1289, 222), (1011, 222)])
    f.label(1150, 240, "resume-all.ps1  (2–3 min)")
    f.line([(1450, 246), (1450, 300), (230, 300), (230, 247)], dash=True)
    f.label(840, 292, "teardown-all.ps1 also works from the paused state")
    f.text(850, 60, "Every runbook is a PowerShell script driving the AWS CLI in ap-south-1", 16.5,
           italic=True)

    # teardown detail
    f.cont(40, 360, 640, 790, "teardown-all.ps1 · reverse dependency order")
    steps = ["Scheduler schedule + scheduler role", "CloudWatch alarms, SNS topic, log group",
             "ECS scaling target, service, task defs, cluster", "ECR repository (force)",
             "Task + task-exec IAM roles", "ALB (wait deleted) + target group",
             "Secrets (force delete, no recovery)", "CloudFront functions, OAC, WAF ACL",
             "RDS instance (wait deleted) + subnet group", "Empty and delete both S3 buckets",
             "VPC endpoint, NAT + EIP, SGs, RTs, subnets, IGW, VPC"]
    for i, s in enumerate(steps):
        f.text(70, 410 + i * 33, f"{i + 1:>2}.", 15.5, anchor="end" if False else "start")
        f.text(102, 410 + i * 33, s, 15.5, anchor="start")

    # pause / resume detail
    def seq(x1, x2, title, items, note=None):
        f.cont(x1, 360, x2, 790, title)
        cx = (x1 + x2) / 2
        ys = [450, 560, 670]
        for y, (a, b) in zip(ys, items):
            f.box(cx, y, x2 - x1 - 60, 62, a, b, size=16)
        for y1, y2 in zip(ys, ys[1:]):
            f.line([(cx, y1 + 31), (cx, y2 - 32)])
        if note:
            f.mtext(cx, 745, note, 13.5, lh=17, italic=True)

    seq(680, 1150, "pause-all.ps1", [("1 · ECS desired count → 0", "container billing stops"),
                                     ("2 · Scheduler → DISABLED", "no jobs while asleep"),
                                     ("3 · RDS stop-db-instance", "compute stops, data kept")],
        ["Still billed while paused: NAT Gateway, ALB, EIP,", "RDS storage, S3, Secrets Manager"])
    seq(1190, 1660, "resume-all.ps1", [("1 · RDS start + wait available", "database first"),
                                       ("2 · Scheduler → ENABLED", "jobs resume"),
                                       ("3 · ECS desired count → 2", "tasks register with ALB")],
        ["Order matters: tasks only start once", "the database accepts connections"])

    f.save(OUT, "fig8_operations_lifecycle",
           "Figure 8.  Operations lifecycle — provisioning, cost-saving sleep mode and full teardown runbooks.", 830)


# =============================================================================
# Figure 9 — Local development parity
# =============================================================================
def fig9():
    f = Fig(1500, 830)
    f.cont(80, 110, 620, 750, "Local stack — docker-compose.yml")
    f.cont(880, 110, 1420, 750, "AWS production — ap-south-1")
    rows = [
        ("Vite dev server", "localhost:5173 → API :5000", "static build", "S3 frontend + CloudFront", "VITE_API_URL=/api (same origin)"),
        ("backend container", "gunicorn · db upgrade on start", "same Docker image", "ECS Fargate service", "image from ECR · 2–4 tasks"),
        ("migrate-seed container", "flask db upgrade && flask seed", "same CLI commands", "One-off ECS RunTask", "container command overrides"),
        ("postgres:16-alpine", "named volume postgres_data", "PostgreSQL 16", "RDS PostgreSQL Multi-AZ", "encrypted gp3 · TLS required"),
        ("minio + minio-init", "bucket gearvault-media · items/ public", "S3 API (boto3)", "S3 media bucket", "OAC items/* · presigned condition/*"),
        ("Compose env vars", "dev JWT secret · minioadmin keys", "credentials", "Secrets Manager + IAM task role", "no static keys in containers"),
    ]
    for i, (a, a2, mid, b, b2) in enumerate(rows):
        cy = 190 + i * 100
        f.box(350, cy, 440, 62, a, a2)
        f.box(1150, cy, 440, 62, b, b2)
        f.line([(571, cy), (929, cy)], dash=True, both=True)
        f.label(750, cy - 8, mid)
    f.save(OUT, "fig9_dev_prod_parity",
           "Figure 9.  Development / production parity — each local compose service and its AWS counterpart.", 795)


for n, fn in (("1", fig1), ("2", fig2), ("3", fig3), ("4", fig4), ("5", fig5), ("6", fig6), ("7", fig7),
              ("8", fig8), ("9", fig9)):
    if want(n):
        fn()
