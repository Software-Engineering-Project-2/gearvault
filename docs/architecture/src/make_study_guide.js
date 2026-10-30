// GearVault — Cloud Architecture Study Guide (.docx)
// usage: node make_study_guide.js <figDir> <out.docx>
const fs = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, ImageRun, HeadingLevel, AlignmentType, Table, TableRow, TableCell,
  WidthType, ShadingType, BorderStyle, LevelFormat, PageBreak, TableOfContents, Header, Footer, PageNumber,
  PageOrientation, SectionType, TabStopType,
} = require("docx");

const FIG = process.argv[2];
const OUT = process.argv[3];

const FONT = "Calibri";
const MONO = "Consolas";
const ACCENT = "1F3864";
const MUTED = "595959";
const A4 = { width: 11906, height: 16838 };
const MARGIN = 1134; // 2 cm
const CW = A4.width - 2 * MARGIN; // portrait content width (DXA)
const CW_L = A4.height - 2 * MARGIN; // landscape content width

// ----------------------------------------------------------------- inline markup
// **bold**, `code`, _italic_
function runs(text, base = {}) {
  const out = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(new TextRun({ text: text.slice(last, m.index), ...base }));
    const t = m[0];
    if (t.startsWith("**")) out.push(new TextRun({ text: t.slice(2, -2), bold: true, ...base }));
    else if (t.startsWith("`")) out.push(new TextRun({ text: t.slice(1, -1), font: MONO, size: 19, ...base }));
    else out.push(new TextRun({ text: t.slice(1, -1), italics: true, ...base }));
    last = m.index + t.length;
  }
  if (last < text.length) out.push(new TextRun({ text: text.slice(last), ...base }));
  return out;
}

const body = []; // portrait content after the landscape figure
const front = []; // title + toc + chapters before landscape page
let target = front;

const H1 = (t) => target.push(new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore: true, children: [new TextRun(t)] }));
const H2 = (t) => target.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(t)] }));
const H3 = (t) => target.push(new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun(t)] }));
const P = (t, opts = {}) => target.push(new Paragraph({ children: runs(t), spacing: { after: 120 }, ...opts }));

let numCounter = 0;
const numRefs = [];
function bullets(items, level = 0) {
  for (const it of items) {
    if (Array.isArray(it)) { bullets(it, level + 1); continue; }
    target.push(new Paragraph({ numbering: { reference: "bullets", level }, spacing: { after: 60 }, children: runs(it) }));
  }
}
function numbered(items) {
  const ref = `num${++numCounter}`;
  numRefs.push(ref);
  for (const it of items) {
    target.push(new Paragraph({ numbering: { reference: ref, level: 0 }, spacing: { after: 60 }, children: runs(it) }));
  }
}

function callout(title, lines, fill = "EAF1FB", bar = "2E5597") {
  const border = { style: BorderStyle.SINGLE, size: 4, color: "BFBFBF" };
  const cell = new TableCell({
    width: { size: CWnow(), type: WidthType.DXA },
    shading: { fill, type: ShadingType.CLEAR, color: "auto" },
    margins: { top: 100, bottom: 100, left: 180, right: 180 },
    borders: { top: border, bottom: border, right: border, left: { style: BorderStyle.SINGLE, size: 24, color: bar } },
    children: [
      new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: title, bold: true, color: bar })] }),
      ...lines.map((l) => new Paragraph({ spacing: { after: 40 }, children: runs(l) })),
    ],
  });
  target.push(new Table({ width: { size: CWnow(), type: WidthType.DXA }, columnWidths: [CWnow()], rows: [new TableRow({ children: [cell] })] }));
  target.push(new Paragraph({ spacing: { after: 80 }, children: [] }));
}
const keyIdea = (lines) => callout("Key idea", lines);
const sayThis = (lines) => callout("Say this in the viva", lines, "EEF6EC", "38761D");
const caution = (lines) => callout("Be ready for this", lines, "FDF3E7", "B45F06");

let landscape = false;
const CWnow = () => (landscape ? CW_L : CW);

function table(headers, rows, ratios) {
  const total = CWnow();
  const sum = ratios.reduce((a, b) => a + b, 0);
  const widths = ratios.map((r) => Math.floor((r / sum) * total));
  widths[widths.length - 1] += total - widths.reduce((a, b) => a + b, 0);
  const border = { style: BorderStyle.SINGLE, size: 4, color: "A6A6A6" };
  const borders = { top: border, bottom: border, left: border, right: border };
  const mk = (txt, i, head) => new TableCell({
    width: { size: widths[i], type: WidthType.DXA },
    borders,
    shading: head ? { fill: "DCE3EE", type: ShadingType.CLEAR, color: "auto" } : undefined,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children: String(txt).split("\n").map((ln) => new Paragraph({ children: runs(ln, { size: 19, ...(head ? { bold: true } : {}) }) })),
  });
  target.push(new Table({
    width: { size: total, type: WidthType.DXA },
    columnWidths: widths,
    rows: [
      new TableRow({ tableHeader: true, children: headers.map((h, i) => mk(h, i, true)) }),
      ...rows.map((r) => new TableRow({ cantSplit: true, children: r.map((c, i) => mk(c, i, false)) })),
    ],
  }));
  target.push(new Paragraph({ spacing: { after: 100 }, children: [] }));
}

function pngSize(p) {
  const b = fs.readFileSync(p);
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}
function figure(file, caption, widthIn = 6.5) {
  const p = path.join(FIG, file);
  const [w, h] = pngSize(p);
  const wpx = Math.round(widthIn * 96);
  const hpx = Math.round((wpx * h) / w);
  target.push(new Paragraph({
    alignment: AlignmentType.CENTER, keepNext: true, spacing: { before: 120, after: 60 },
    children: [new ImageRun({ type: "png", data: fs.readFileSync(p), transformation: { width: wpx, height: hpx } })],
  }));
  target.push(new Paragraph({
    alignment: AlignmentType.CENTER, spacing: { after: 200 },
    children: [new TextRun({ text: caption, italics: true, size: 19, color: MUTED })],
  }));
}

// =================================================================== CONTENT
// ---------------------------------------------------------------- title page
front.push(
  new Paragraph({ spacing: { before: 2800 }, children: [] }),
  new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "GearVault", size: 64, bold: true, color: ACCENT })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [new TextRun({ text: "Cloud Architecture Study Guide", size: 40, color: ACCENT })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 600 }, children: [new TextRun({ text: "From the overall pipeline down to every AWS subsystem", italics: true, size: 26, color: MUTED })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Equipment rental management platform on AWS (ap-south-1, Mumbai)", size: 24 })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 1800 }, children: [new TextRun({ text: "23 AWS resources · 9 architecture figures · viva preparation", size: 24 })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Prepared by Sathyanarayanan", size: 24 })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Cloud Architecture — Project Review", size: 24, color: MUTED })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "October 2026", size: 24, color: MUTED })] }),
);
front.push(new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore: true, children: [new TextRun("Contents")] }));
front.push(new TableOfContents("Contents", { hyperlink: true, headingStyleRange: "1-2" }));

// ---------------------------------------------------------------- 1
H1("1. How to Use This Guide");
P("This guide explains the GearVault cloud architecture in the same order you should present it: first the **one overall diagram** (Figure 1), then each **subsystem** in turn, from the network up to operations. Every chapter has the same shape:");
bullets([
  "**What it is** — the job of the subsystem in one or two sentences.",
  "**How it works in GearVault** — the actual configuration from `deploy-all.ps1`, the deployment runbook and `deploy-state.json`.",
  "**Why it was designed this way** — the trade-off or requirement behind it.",
  "**Say this in the viva** — a short answer you can repeat to your teacher.",
]);
P("The nine figures are in `docs/architecture/` of the repository as high-resolution PNG and SVG files, so you can also project them directly.");
H2("1.1 The 30-second pitch");
sayThis([
  "\"GearVault is a three-tier web application on AWS. Users only enter through **CloudFront protected by AWS WAF**. Static content is served from **private S3 buckets**, and API calls go through a **header-locked Application Load Balancer** to **auto-scaled containers on ECS Fargate** in private subnets across two Availability Zones. Data lives in a **Multi-AZ RDS PostgreSQL** database. Secrets come from **Secrets Manager**, permissions from **IAM roles with temporary STS credentials**, background jobs from **EventBridge Scheduler**, and monitoring from **CloudWatch and SNS**. The whole stack is provisioned, paused, resumed and destroyed by PowerShell runbooks that drive the AWS CLI.\"",
]);
H2("1.2 Reading order");
table(["Ch.", "Subsystem", "Figure", "Question it answers"], [
  ["3", "Overall architecture", "Fig. 1", "What are all the pieces and how do they connect?"],
  ["4", "Network foundation", "Fig. 2", "Where does everything live and who can talk to whom?"],
  ["5", "Edge and request routing", "Fig. 3", "What happens to one browser request?"],
  ["6", "Compute and containers", "Fig. 5", "How does code become running, scalable containers?"],
  ["7", "Data tier and secrets", "Fig. 1, 2", "Where is data stored and how is it protected?"],
  ["8", "Media storage pipeline", "Fig. 6", "How are photos uploaded and served?"],
  ["9", "Identity and security model", "—", "How is every layer secured?"],
  ["10", "Background automation", "Fig. 7 (left)", "What runs without a user?"],
  ["11", "Observability", "Fig. 7 (right)", "How do we know something is wrong?"],
  ["12", "Deployment pipeline", "Fig. 4", "How is the whole stack built?"],
  ["13", "Operations lifecycle", "Fig. 8", "How is it paused, resumed and torn down?"],
  ["14", "Dev / prod parity", "Fig. 9", "How does local development match production?"],
], [1, 4, 2, 7]);

// ---------------------------------------------------------------- 2
H1("2. The Application in Brief");
P("Before the cloud design makes sense, you need to know what the application does, because every architectural choice serves one of these functions.");
H2("2.1 What GearVault does");
P("GearVault is an **equipment rental management system** (cameras, audio, computers and similar gear). It supports three roles:");
table(["Role", "What they do in the app"], [
  ["Customer", "Browses the catalog, checks availability for a time window, places a **15-minute soft hold**, confirms payment, views bookings and rentals, raises damage disputes."],
  ["Staff", "Works the rental counter: hands equipment over, records **condition photos**, processes returns and damage assessments."],
  ["Manager", "Manages inventory and item photos, resolves disputes (override), views analytics, exports monthly CSV reports and the financial audit log, assigns user roles."],
], [1.2, 6]);
H2("2.2 Business logic that shapes the cloud design");
bullets([
  "**Soft holds expire after 15 minutes** and **overdue rentals escalate after 7 days** → this needs a **scheduler** (EventBridge, Chapter 10).",
  "**Two customers must not book the same item for overlapping windows** → the hold uses a database row lock (`SELECT … FOR UPDATE`), so we need a **real relational database** with transactions (RDS PostgreSQL, Chapter 7).",
  "**Item photos are public; condition photos are evidence and private** → the media bucket uses **two prefixes with different access paths** (Chapter 8).",
  "**Prices use depreciation** (straight-line, 20 % salvage floor, category lifespans) and **damage deductions use severity × weight × depreciated value**, with ₹500/day late fees → these are pure Python services inside the API containers and need no extra AWS service.",
  "**Money-related actions are audited** → a `financial_audit_log` table in RDS.",
]);
H2("2.3 Technology stack");
table(["Layer", "Technology"], [
  ["Frontend", "React 18 single-page app built with Vite (Node 20); Tailwind CSS, Chart.js, Lucide icons"],
  ["Backend", "Python 3.13, Flask 3.1, SQLAlchemy 2.0, Alembic (Flask-Migrate), Flask-JWT-Extended, Flask-Limiter, Marshmallow, bcrypt"],
  ["Web server", "Gunicorn (2 sync workers) inside a `python:3.13-slim` Docker image, running as a non-root user"],
  ["Database", "PostgreSQL 16 (12 tables: roles, users, item_categories, items, bookings, rentals, payments, item_condition_log, damage_types, damage_assessments, notifications, financial_audit_log)"],
  ["Object storage", "Amazon S3 in production, MinIO locally — same S3 API through boto3"],
  ["Infrastructure", "AWS CLI v2 driven by PowerShell runbooks (`deploy-all.ps1`, `pause-all.ps1`, `resume-all.ps1`, `teardown-all.ps1`)"],
], [1.3, 6]);
H2("2.4 Design goals");
P("The architecture was designed against five goals. Keep them in mind; most viva questions are really asking which goal a decision serves.");
table(["Goal", "How the architecture meets it"], [
  ["High availability", "Everything important runs in **two Availability Zones**: ALB nodes, Fargate tasks, RDS primary + standby."],
  ["Security (defence in depth)", "WAF → CloudFront → prefix-list-locked ALB → secret header → private subnets → security-group chain → TLS to the database → secrets in Secrets Manager → IAM roles, no static keys."],
  ["Scalability", "Stateless containers behind a load balancer, auto-scaled on CPU (2–4 tasks); static content and images offloaded to S3 + CDN; uploads go straight to S3."],
  ["Cost efficiency", "Serverless containers (no idle EC2), one NAT Gateway, free S3 Gateway Endpoint, small db.t4g.micro instance, and a **sleep mode** that stops compute."],
  ["Operational simplicity", "Managed services everywhere (RDS, Fargate, CloudFront, Scheduler), scripted provisioning, health checks, automatic rollback and alarms."],
], [1.6, 6]);

// ---------------------------------------------------------------- 3 (landscape figure follows)
H1("3. The Overall Architecture (Figure 1)");
P("Figure 1 on the next page is the **one image to show** if you only get one. It contains all 23 resources. Read it from left to right, following the direction a request travels:");
numbered([
  "**Users (browser)** — customers, staff and managers.",
  "**Global edge** — AWS WAF filters the request, CloudFront decides where it goes, CloudFront Functions rewrite URLs.",
  "**AWS Region ap-south-1** — two S3 buckets at the top (frontend and media), the VPC in the middle, and the regional managed services on the right.",
  "**Inside the VPC** — two Availability Zones (columns) × three subnet tiers (rows): public (ALB, NAT), private app (Fargate tasks), private data (RDS primary and standby).",
  "**Managed services** — ECR (images), Secrets Manager (credentials), IAM (roles), EventBridge Scheduler (jobs), CloudWatch (logs and alarms) and SNS (alerts).",
]);
H2("3.1 The three request paths");
P("Everything in Figure 1 serves one of three paths through CloudFront:");
table(["URL path", "Destination", "Purpose"], [
  ["`/*` (default)", "S3 frontend bucket (via OAC)", "Delivers the React app: index.html, JavaScript, CSS."],
  ["`/media/*`", "S3 media bucket, `items/*` only (via OAC)", "Delivers public catalog equipment photos, cached at the edge."],
  ["`/api/*`", "Internet Gateway → ALB → Fargate tasks → RDS", "Every dynamic operation: login, booking, returns, analytics."],
], [1.4, 3, 4]);
P("Because all three paths share one CloudFront domain, the browser talks to a **single origin**. The production build uses `VITE_API_URL=/api`, so API calls are same-origin and the frontend needs no hard-coded load-balancer address.");
H2("3.2 Tracing one API request end-to-end");
numbered([
  "The browser sends `POST /api/bookings/hold` over HTTPS to the CloudFront domain.",
  "**AWS WAF** checks it against the AWS managed common rule set and the auth rate limit. Malicious requests are blocked with 403.",
  "**CloudFront** matches the `/api/*` behaviour: caching disabled, all HTTP methods allowed. It adds the secret `X-Origin-Verify` header and forwards to the ALB.",
  "The request enters the VPC through the **Internet Gateway**. The ALB's **security group** only admits CloudFront's IP ranges.",
  "The **ALB listener rule** checks the secret header. If it matches, the request goes to the **target group**; if not, the ALB returns a fixed 403.",
  "The target group picks a **healthy Fargate task** in either AZ on port 5000.",
  "**Gunicorn → Flask** processes it: ProxyFix restores the real client IP, the JWT is verified, the user's role is loaded from the database (RBAC), and the route handler runs.",
  "The handler talks to **RDS PostgreSQL** over TLS on port 5432, locks the item row, checks for overlap, prices the booking and writes a held booking.",
  "The JSON response returns through ALB → CloudFront → browser.",
]);
H2("3.3 The 23 resources at a glance");
table(["#", "Service / resource", "Tier", "One-line role"], [
  ["1", "Amazon VPC", "Network", "Private, isolated network for all compute and data"],
  ["2", "Subnets (6)", "Network", "Public / app / data tiers in two AZs"],
  ["3", "Internet Gateway", "Network", "VPC's door to the internet"],
  ["4", "NAT Gateway + Elastic IP", "Network", "Outbound-only internet for private tasks"],
  ["5", "Route tables (2)", "Network", "Send public traffic to IGW, private to NAT"],
  ["6", "S3 Gateway Endpoint", "Network", "Private, free path from VPC to S3"],
  ["7", "Security groups (3)", "Network / security", "Least-privilege firewall chain"],
  ["8", "S3 frontend bucket", "Storage", "Hosts the built React app"],
  ["9", "S3 media bucket", "Storage", "Item photos (public) and condition photos (private)"],
  ["10", "RDS PostgreSQL 16", "Data", "Multi-AZ relational database"],
  ["11", "Secrets Manager", "Security", "DB URL, JWT key, origin secret"],
  ["12", "ALB + target group", "Ingress", "Header-locked load balancing with health checks"],
  ["13", "Amazon ECR", "Compute", "Private Docker image registry"],
  ["14", "IAM roles (3)", "Security", "Permissions without static keys"],
  ["15", "Amazon ECS on Fargate", "Compute", "Serverless containers running the API"],
  ["16", "Application Auto Scaling", "Compute", "2–4 tasks on 60 % CPU"],
  ["17", "AWS WAF", "Edge / security", "Blocks attacks and brute force at the edge"],
  ["18", "Amazon CloudFront + OAC", "Edge", "Global entry point and path router"],
  ["19", "CloudFront Functions (2)", "Edge", "URL rewrites for SPA and media"],
  ["20", "EventBridge Scheduler", "Automation", "Runs maintenance jobs every 5 minutes"],
  ["21", "Amazon CloudWatch", "Observability", "Logs, metrics and alarms"],
  ["22", "Amazon SNS", "Observability", "Alarm notifications"],
  ["23", "AWS STS", "Security", "Temporary credentials for roles and scripts"],
], [0.5, 3, 1.8, 5]);

// landscape page with figure 1 -> separate section
const landscapeSection = [];
target = landscapeSection;
landscape = true;
figure("fig1_overall_architecture.png", "Figure 1. GearVault production architecture on AWS — edge, network, compute, data and managed services.", 9.6);
landscape = false;
target = body;

// ---------------------------------------------------------------- 4 Network
H1("4. Network Foundation (Figure 2)");
figure("fig2_network_topology.png", "Figure 2. Network topology — two Availability Zones, three subnet tiers, route tables and the security-group chain.");
H2("4.1 Amazon VPC");
P("**What it is:** a logically isolated virtual network in AWS. Nothing inside it can be reached from the internet unless we explicitly allow it.");
P("**In GearVault:** `gearvault-vpc` with CIDR `10.0.0.0/16` (65,536 addresses) and DNS hostnames enabled, so services inside it can resolve AWS endpoints such as the RDS hostname.");
H2("4.2 Subnets and the three-tier layout");
P("The VPC is divided into six /24 subnets (256 addresses each): **three tiers × two Availability Zones**. An Availability Zone (AZ) is a physically separate data centre within the region, so spreading every tier across `ap-south-1a` and `ap-south-1b` means one data-centre failure cannot take the application down.");
table(["Tier", "AZ a", "AZ b", "Contains", "Internet access"], [
  ["Public", "10.0.1.0/24", "10.0.2.0/24", "ALB nodes, NAT Gateway", "Inbound and outbound via IGW"],
  ["Private app", "10.0.10.0/24", "10.0.20.0/24", "Fargate API tasks, migration/seed/job tasks", "Outbound only, via NAT"],
  ["Private data", "10.0.30.0/24", "10.0.40.0/24", "RDS primary and standby", "None needed"],
], [1.3, 1.3, 1.3, 2.6, 2]);
keyIdea([
  "Each tier is only as exposed as its job requires. Only the load balancer is public; the application and the database have **no public IP addresses at all**.",
]);
H2("4.3 Internet Gateway (IGW)");
P("**What it is:** the VPC's two-way connection to the internet. **In GearVault:** `gearvault-igw` lets CloudFront reach the ALB in the public subnets, and carries the NAT Gateway's outbound traffic.");
H2("4.4 NAT Gateway and Elastic IP");
P("**What it is:** a managed device that lets resources in private subnets start **outbound** connections while staying unreachable from outside.");
P("**In GearVault:** a single NAT Gateway in public subnet A with a static Elastic IP. Fargate tasks use it to pull the image from ECR, fetch secrets from Secrets Manager and ship logs to CloudWatch.");
caution([
  "**Trade-off:** one NAT Gateway instead of one per AZ saves about $32 a month, but it is a single point of failure for **outbound** traffic. If AZ a fails, tasks in AZ b keep serving requests but cannot start new tasks or pull images until AZ a recovers. The fix is a second NAT Gateway in AZ b with its own route table.",
]);
H2("4.5 Route tables");
table(["Route table", "Routes", "Associated subnets"], [
  ["gearvault-public-rt", "`0.0.0.0/0 → Internet Gateway`", "Public A, Public B"],
  ["gearvault-private-rt", "`0.0.0.0/0 → NAT Gateway`\nS3 prefix list → S3 Gateway Endpoint", "App A/B, Data A/B"],
], [2, 3.5, 2]);
P("A subnet is \"public\" only because its route table points to the IGW. That is the whole difference between public and private subnets.");
H2("4.6 S3 Gateway Endpoint");
P("**What it is:** a free VPC endpoint that adds a route for Amazon S3 to the private route table. **Why:** without it, media traffic from the tasks would go through the NAT Gateway, which charges per GB processed. With it, S3 traffic stays on the AWS network, is cheaper, and never touches the internet.");
H2("4.7 Security groups — the least-privilege chain");
P("A security group is a stateful firewall attached to a resource. GearVault chains three of them so each layer only accepts traffic from the layer directly in front of it:");
table(["Security group", "Inbound rule", "Effect"], [
  ["gearvault-alb-sg", "TCP 80 from the AWS-managed prefix list `com.amazonaws.global.cloudfront.origin-facing`", "Only CloudFront edge servers can reach the ALB"],
  ["gearvault-app-sg", "TCP 5000 from `gearvault-alb-sg`", "Only the ALB can reach the containers"],
  ["gearvault-db-sg", "TCP 5432 from `gearvault-app-sg`", "Only the containers can reach the database"],
], [1.8, 3.6, 2.6]);
sayThis([
  "\"Rules reference **other security groups**, not IP addresses, so when tasks scale up or move, the rules still apply automatically. An attacker would have to get past CloudFront, the secret header and two security groups before even reaching the database port.\"",
]);

// ---------------------------------------------------------------- 5 Edge
H1("5. Edge Security and Request Routing (Figure 3)");
figure("fig3_request_routing.png", "Figure 3. Request path — how a browser request is filtered at the edge and routed to S3 or the API tier.", 6.2);
P("Figure 3 is drawn **bottom-to-top**: the browser request enters at the bottom and the response leaves at the top. The three lanes are the three CloudFront behaviours.");
H2("5.1 AWS WAF — the first line of defence");
P("**What it is:** a web application firewall that inspects HTTP requests before they reach any origin.");
table(["Rule", "Type", "What it does"], [
  ["AWSManagedRulesCommonRuleSet", "AWS managed rule group", "Blocks common exploits (OWASP-style: SQL injection, XSS, bad inputs, known bad bots)"],
  ["RateLimitAuthLogins", "Rate-based rule, action Block", "Blocks an IP that sends more than **100 requests in 5 minutes** to paths starting with `/api/auth/` (login and registration brute force)"],
], [2.6, 2, 4]);
P("**Why us-east-1?** A WAF Web ACL attached to CloudFront has scope `CLOUDFRONT`, which is global, and AWS requires global WAF resources to be created in us-east-1, even though the rest of the app is in Mumbai.");
P("The Flask app also has its own limit (10 per minute on register and login through Flask-Limiter), but that counter lives in each worker's memory, so it is not shared between tasks. The **WAF rule is the reliable, global limit**.");
H2("5.2 Amazon CloudFront — the single entry point");
P("**What it is:** AWS's content delivery network, with edge locations worldwide. **In GearVault** it is the only public entry point and acts as a **path-based router** with three origins:");
table(["Behaviour", "Origin", "Settings"], [
  ["Default `/*`", "S3 frontend bucket", "Origin Access Control, viewer request → `spa-rewrite`, redirect HTTP → HTTPS, cached"],
  ["`/media/*`", "S3 media bucket", "Origin Access Control, viewer request → `strip-media`, cached"],
  ["`/api/*`", "ALB (HTTP :80)", "Custom header `X-Origin-Verify`, CachingDisabled, all methods (GET, HEAD, OPTIONS, PUT, POST, PATCH, DELETE), forward all viewer headers except Host"],
], [1.4, 2, 5]);
H3("Origin Access Control (OAC)");
P("OAC makes CloudFront **sign every request to S3 with SigV4**. The buckets block all public access, and their bucket policies only accept requests signed by this distribution. Users can therefore read files only **through** CloudFront, never directly from S3.");
H2("5.3 CloudFront Functions");
P("Small JavaScript functions (runtime `cloudfront-js-2.0`) that run at the edge on the **viewer request**, before the cache is checked.");
table(["Function", "Logic", "Why"], [
  ["spa-rewrite", "If the URI has no file extension and does not start with `/api` or `/media`, rewrite it to `/index.html`", "React Router pages like `/bookings` exist only in the browser. Without this, refreshing a page would ask S3 for a missing file."],
  ["strip-media", "Remove the leading `/media` from the URI", "The browser asks for `/media/items/x.jpg`, but the S3 object key is `items/x.jpg`."],
], [1.5, 3.5, 3.8]);
keyIdea([
  "The usual SPA trick is a CloudFront **custom error response** (turn every 403/404 into index.html). That would also turn a real API 404 into an HTML page and break the frontend's error handling. A viewer-request function only rewrites page routes, so **API errors stay JSON**.",
]);
H2("5.4 Locking the origin: prefix list + secret header");
P("If anyone could call the ALB directly, they would bypass both WAF and CloudFront. GearVault closes this hole with two independent controls:");
numbered([
  "**Network layer:** the ALB security group only admits the CloudFront origin-facing prefix list.",
  "**Application layer:** CloudFront adds the header `X-Origin-Verify: <secret>`. The ALB listener's **default action is a fixed 403 Forbidden**; a rule with priority 10 forwards to the target group **only if the header matches**. The secret is stored in Secrets Manager (`gearvault/origin-verify-secret`).",
]);
P("The production smoke test `directAlbBlock` confirmed this: calling the ALB's DNS name directly returned **403 Forbidden**.");
H2("5.5 Application Load Balancer and target group");
table(["Setting", "Value", "Meaning"], [
  ["Scheme / subnets", "internet-facing, public A + B", "One ALB node per AZ"],
  ["Listener", "HTTP :80, default 403, header rule → forward", "See 5.4"],
  ["Target group", "`gearvault-api-tg`, target type **ip**, port 5000", "Fargate tasks register by their private IP (awsvpc networking)"],
  ["Health check", "`GET /api/health`, healthy after 2, unhealthy after 3", "Unhealthy tasks stop receiving traffic"],
], [1.8, 3.2, 3.2]);
P("The backend has two probes: `/api/health` (**liveness**: returns 200 without touching the database) and `/api/health/ready` (**readiness**: runs `SELECT 1` against PostgreSQL). The ALB uses liveness, so a short database blip does not cause every task to be marked unhealthy at once.");
H2("5.6 Inside the container: ProxyFix, JWT and RBAC");
bullets([
  "**ProxyFix (x_for = 2):** the request passed through two proxies (CloudFront, then the ALB). ProxyFix trusts exactly two `X-Forwarded-*` hops, so Flask sees the real client IP and scheme.",
  "**JWT authentication:** the client sends `Authorization: Bearer <token>`. The token is signed with `JWT_SECRET_KEY` from Secrets Manager and expires after 60 minutes.",
  "**RBAC:** decorators (`customer_required`, `staff_required`, `manager_required`) check the role. The role is **read from the database** on every request, not trusted from the token, so a role change takes effect immediately.",
]);

// ---------------------------------------------------------------- 6 Compute
H1("6. Compute and Containers (Figure 5)");
figure("fig5_compute_containers.png", "Figure 5. From source code to running containers — image build, task definition, roles and auto scaling.");
H2("6.1 The container image");
P("The backend is packaged with a Dockerfile based on `python:3.13-slim`:");
bullets([
  "Installs only `curl` (for the health check) and `libpq5` (the PostgreSQL client library).",
  "Runs as a **non-root user** (`appuser`, uid 1000), which limits the damage if the app is compromised.",
  "Declares a `HEALTHCHECK` that curls `/api/health`.",
  "Starts `gunicorn --config gunicorn.conf.py wsgi:app`, binding `0.0.0.0:5000` with 2 sync workers and a 120 s timeout. Logs go to stdout, where Fargate's log driver collects them.",
  "Built with `--platform linux/amd64` so an image built on any laptop runs on Fargate's x86 hosts.",
]);
H2("6.2 Amazon ECR");
P("**What it is:** a private Docker registry. **In GearVault:** repository `gearvault-api`, image tag `:v2`, with **scan on push** enabled, so every pushed image is checked for known OS and package vulnerabilities (CVEs).");
H2("6.3 ECS task definition");
P("The task definition is the \"recipe\" for a container: which image, how much CPU and memory, which ports, environment and secrets.");
table(["Field", "Value"], [
  ["Family / launch type", "`gearvault-api`, FARGATE, network mode `awsvpc` (each task gets its own private IP and security group)"],
  ["Size", "0.5 vCPU, 1 GB memory"],
  ["Port", "Container port 5000/tcp"],
  ["Environment", "FLASK_ENV=production, PORT=5000, WEB_CONCURRENCY=2, PROXY_FIX_FOR=2, AWS_REGION, S3_BUCKET, CORS_ORIGINS"],
  ["Secrets", "DATABASE_URL and JWT_SECRET_KEY, read from `gearvault/production/credentials` in Secrets Manager"],
  ["Logging", "`awslogs` driver → log group `/ecs/gearvault-api`, stream prefix `ecs`"],
  ["Health check", "`curl -f http://localhost:5000/api/health`, every 30 s, 3 retries, 15 s start period"],
  ["Roles", "Execution role `gearvault-task-exec`, task role `gearvault-task`"],
], [2, 6]);
H2("6.4 ECS cluster and service");
P("**Amazon ECS on Fargate** runs containers without servers to manage: we never patch or size an EC2 instance. The **cluster** `gearvault` is a logical grouping. The **service** `gearvault-api` keeps the desired number of tasks running and registered with the ALB.");
table(["Service setting", "Value", "Why"], [
  ["Desired count", "2", "One task per AZ for high availability"],
  ["Subnets / SG", "App A + App B, `gearvault-app-sg`, no public IP", "Tasks are private"],
  ["Load balancer", "Target group `gearvault-api-tg`, container `api:5000`", "Automatic registration and deregistration"],
  ["Deployment", "minimumHealthyPercent 100, maximumPercent 200", "New tasks start before old ones stop: zero-downtime rolling deploy"],
  ["Circuit breaker", "enabled, rollback = true", "If new tasks keep failing health checks, ECS automatically rolls back to the last working version"],
], [1.8, 3.4, 3.4]);
H2("6.5 Application Auto Scaling");
P("A **target-tracking** policy (`ecs-cpu-target-tracking`) keeps the service's **average CPU at 60 %**: it adds tasks when CPU is higher and removes them when lower, between **2 and 4 tasks**. Scale-out cooldown is 60 s (react quickly to load); scale-in cooldown is 300 s (avoid flapping).");
keyIdea([
  "Why cap at 4 tasks? Each task runs Gunicorn workers with their own database connection pools. A db.t4g.micro PostgreSQL instance supports a limited number of connections, so the scaling cap protects the database from being overwhelmed. **Scale limits are chosen to match the weakest downstream component.**",
]);
H2("6.6 Why Fargate and not EC2 or Lambda?");
table(["Option", "Verdict for GearVault"], [
  ["EC2 instances", "Would require patching, AMI management and capacity planning. Pays for idle capacity."],
  ["AWS Lambda", "Flask + SQLAlchemy keep persistent DB pools and long requests (CSV reports, analytics). Lambda cold starts and connection storms against RDS would need RDS Proxy and code changes."],
  ["**ECS Fargate (chosen)**", "Runs the **same Docker image** used locally, scales per task, no servers to manage, and can scale to zero in sleep mode."],
], [2, 6]);

// ---------------------------------------------------------------- 7 Data
H1("7. Data Tier and Secrets");
P("The data tier is shown in Figure 1 (bottom of the VPC) and Figure 2 (private data subnets).");
H2("7.1 Amazon RDS for PostgreSQL");
P("**What it is:** a managed relational database. AWS handles installation, patching, backups and failover.");
table(["Setting", "Value", "Why"], [
  ["Identifier / engine", "`gearvault-postgres`, PostgreSQL 16.13", "Same major version as local development"],
  ["Instance class", "db.t4g.micro (Graviton, burstable)", "Cheapest class suited to a project workload"],
  ["Storage", "20 GB gp3, **encrypted at rest**", "Encryption with AWS-managed KMS key"],
  ["Availability", "**Multi-AZ**", "Synchronous standby in the other AZ; automatic failover"],
  ["Network", "DB subnet group (data A + B), **not publicly accessible**, `gearvault-db-sg`", "Only the app tier can connect"],
  ["Encryption in transit", "`sslmode=require` in the connection string", "TLS between containers and the database"],
  ["Backups", "Automated, 1-day retention", "Point-in-time recovery within the last day"],
], [1.8, 3.2, 3.2]);
H3("How Multi-AZ failover works");
P("Every write to the primary is **synchronously replicated** to the standby in the other AZ before it is acknowledged. If the primary fails (hardware, AZ outage, or during maintenance), RDS promotes the standby and **repoints the same DNS name** to it, typically within one to two minutes. The application reconnects using the same endpoint; no configuration change is needed. The standby does not serve reads; it exists only for availability.");
H2("7.2 Schema management");
P("The database schema is version-controlled as an Alembic migration (`0001_initial_schema`). During deployment, the same container image is run as a **one-off ECS task** with the command overridden to `flask db upgrade`, then `flask seed` (roles, damage types, 5 categories, 11 items). This keeps schema changes inside the private network; no one connects to the database from outside.");
H2("7.3 Concurrency control in the database");
bullets([
  "**Booking holds** lock the item row (`SELECT … FOR UPDATE`) while checking for overlapping bookings, so two customers cannot hold the same item for the same window, even when their requests hit different tasks.",
  "**Background jobs** use `FOR UPDATE SKIP LOCKED`, so two overlapping job runs process different rows instead of the same row twice (Chapter 10).",
]);
H2("7.4 AWS Secrets Manager");
P("**What it is:** an encrypted store for secrets, with fine-grained IAM access control and auditing.");
table(["Secret", "Contents", "Consumer"], [
  ["`gearvault/production/credentials`", "JSON: `DATABASE_URL` (with sslmode=require) and `JWT_SECRET_KEY`", "ECS injects both as environment variables when a task starts"],
  ["`gearvault/origin-verify-secret`", "Random 64-character value", "CloudFront custom origin header and ALB listener rule"],
], [2.8, 3.4, 2.6]);
P("The JWT and origin secrets are **generated fresh** by the deploy script (two concatenated GUIDs). The image and the repository code contain **no secrets**; the app refuses to start if `DATABASE_URL` or `JWT_SECRET_KEY` is missing.");

// ---------------------------------------------------------------- 8 Media
H1("8. Media Storage Pipeline (Figure 6)");
figure("fig6_media_upload.png", "Figure 6. Presigned-URL media pipeline — uploads go directly to S3; reads go through CloudFront or short-lived URLs.", 6.2);
H2("8.1 The two S3 buckets");
table(["Bucket", "Contents", "Access"], [
  ["`gearvault-frontend-<account>`", "Built React app (`npm run build` → `dist/`, synced with `aws s3 sync --delete`)", "Read only by CloudFront via OAC"],
  ["`gearvault-media-<account>`", "`items/<uuid>.jpg` — catalog photos\n`condition/<rental_id>/<uuid>.jpg` — inspection photos", "items/* via CloudFront OAC; condition/* only via presigned GET URLs; CORS allows browser GET/PUT"],
], [2.6, 3.6, 3]);
H2("8.2 Upload flow, step by step");
numbered([
  "A manager (item photo) or staff member (condition photo) picks an image in the browser.",
  "The browser calls `POST /api/uploads/presign` with its JWT and `type`, `content_type`, `file_size` (and `rental_id` for condition photos).",
  "Flask validates: only **JPEG, PNG or WebP**, at most **5 MB**. Anything else → HTTP 400.",
  "Flask checks the role: item photos need **manager**; condition photos need **staff or manager**. Otherwise → HTTP 403.",
  "Flask builds the object key itself with a random UUID, so a client cannot choose or overwrite another object's key.",
  "boto3 signs a **presigned PUT URL** with the task role's **temporary STS credentials**, valid for at most **900 seconds**.",
  "The browser **uploads the file directly to S3** with that URL. The file never passes through the API containers.",
  "The returned key is stored in the database with the item or condition log.",
]);
H2("8.3 Two read paths");
table(["Prefix", "Read path", "Why"], [
  ["`items/*`", "`https://<cloudfront>/media/items/x.jpg` → strip-media → S3 via OAC, cached at the edge", "Catalog photos are public and requested often, so caching makes them fast and cheap"],
  ["`condition/*`", "API returns a **presigned GET URL** valid ≤ 900 s", "Damage evidence is private; only authorised users get a short-lived link"],
], [1.3, 4, 3.5]);
sayThis([
  "\"Uploads use **presigned URLs**, so the API only authorises and signs; S3 carries the bandwidth. This keeps the containers small and fast, and because the signing uses the ECS **task role's temporary credentials**, there are no AWS access keys anywhere in the application.\"",
]);

// ---------------------------------------------------------------- 9 Security model
H1("9. Identity and Security Model");
P("Security is not one service; it is a set of layers. This chapter collects them in one place.");
H2("9.1 IAM roles");
table(["Role", "Trusted by", "Permissions", "Used for"], [
  ["gearvault-task-exec", "ecs-tasks.amazonaws.com", "AmazonECSTaskExecutionRolePolicy + `secretsmanager:GetSecretValue`, `logs:CreateLogGroup`", "The **ECS agent**: pull image from ECR, inject secrets, write logs"],
  ["gearvault-task", "ecs-tasks.amazonaws.com", "`s3:GetObject`, `s3:PutObject` on the media bucket; `ssmmessages:*` for ECS Exec", "The **application code**: sign presigned URLs, access media"],
  ["gearvault-scheduler-role", "scheduler.amazonaws.com", "AmazonECS_FullAccess + `iam:PassRole` on `gearvault-task*`", "EventBridge Scheduler: start the job task and hand it its roles"],
], [2, 2, 3.4, 2.6]);
keyIdea([
  "**Execution role vs task role:** the execution role is used by ECS **before and around** your container (pulling the image, fetching secrets, shipping logs). The task role is used **by your code inside** the container. Keeping them separate means the application cannot read secrets it was never meant to read directly, and the ECS agent cannot touch S3.",
]);
H2("9.2 AWS STS — temporary credentials");
P("When a task assumes its role, **AWS Security Token Service** issues short-lived credentials (access key, secret, session token) that rotate automatically. boto3 finds them through the default credential chain (the container metadata endpoint). That is why `storage_service.py` only passes explicit keys when `AWS_ACCESS_KEY_ID` is set, which happens only for local MinIO. The deploy scripts use `sts get-caller-identity` to discover the account ID.");
H2("9.3 Defence in depth — threat to control");
table(["Threat", "Control(s)"], [
  ["SQL injection, XSS, malicious bots", "WAF managed common rule set; SQLAlchemy parameterised queries; Marshmallow input validation"],
  ["Password brute force", "WAF rate rule (100 / 5 min / IP on /api/auth/); Flask-Limiter 10/min; bcrypt password hashing"],
  ["Bypassing CloudFront/WAF by calling the ALB", "ALB SG limited to CloudFront prefix list; secret header rule; default 403"],
  ["Direct access to app or database", "Private subnets, no public IPs; SG chain alb → app → db"],
  ["Reading S3 files directly", "Block Public Access on both buckets; OAC; presigned URLs for private photos"],
  ["Leaked credentials", "No secrets in code or image; Secrets Manager; IAM roles with STS temporary keys"],
  ["Data theft at rest / in transit", "RDS storage encryption; TLS to the database (sslmode=require); HTTPS to viewers"],
  ["Privilege escalation in the app", "RBAC with role read from the database on every request; server-generated S3 keys"],
  ["Compromised container", "Non-root user; minimal slim image; ECR vulnerability scanning; narrowly scoped task role"],
  ["Accidental bad release", "Health checks, deployment circuit breaker with automatic rollback"],
], [3, 6]);

// ---------------------------------------------------------------- 10 Jobs
H1("10. Background Automation (Figure 7, left)");
figure("fig7_jobs_observability.png", "Figure 7. Background automation (left) and monitoring / alerting (right).");
P("Some business rules must run even when nobody is using the app. GearVault uses **Amazon EventBridge Scheduler** instead of a cron daemon on a server.");
H2("10.1 How the schedule runs");
numbered([
  "Schedule `gearvault-run-jobs` fires on `rate(5 minutes)` (flexible time window off, so it is on time).",
  "EventBridge assumes `gearvault-scheduler-role`, which may call `ecs:RunTask` and `iam:PassRole` the task roles.",
  "It starts a **one-off Fargate task** from the same task definition, in private app subnet A with `gearvault-app-sg`, with the command overridden to `flask jobs run`.",
  "The task runs the two jobs, commits, and exits. Billing stops when it exits.",
]);
H2("10.2 The two jobs");
table(["Job", "Rule (SRS reference)", "Effect"], [
  ["`expire_holds()`", "FR024: unpaid soft holds expire after 15 minutes", "Booking status `held` → `Expired`, customer gets an in-app notification, the item becomes available again"],
  ["`escalate_overdue_rentals()`", "FR023 / BR4: rentals more than 7 days overdue", "Rental marked presumed lost, full replacement price charged against the deposit, financial audit log entry written"],
], [2.2, 3, 3.8]);
H2("10.3 Why this design is safe");
bullets([
  "**Idempotent:** running a job twice produces the same result, because each job only selects rows still in the triggering state.",
  "**Concurrency-safe:** `SELECT … FOR UPDATE SKIP LOCKED` means overlapping runs skip rows another run has locked, so nothing is processed twice.",
  "**Defence in depth:** `create_hold()` also calls `expire_holds()` before checking availability, so a stale hold never blocks a new customer even if the scheduler is paused.",
  "**Serverless:** no always-on worker; you pay for a few seconds of Fargate every five minutes.",
]);

// ---------------------------------------------------------------- 11 Observability
H1("11. Observability (Figure 7, right)");
H2("11.1 Amazon CloudWatch");
bullets([
  "**Logs:** Gunicorn access and error logs plus Flask application logs go to stdout; the `awslogs` driver ships them to the log group `/ecs/gearvault-api`.",
  "**Metrics:** the ALB, ECS and RDS publish metrics automatically (request counts, 5XX errors, CPU, connections). ECS CPU also drives auto scaling.",
  "**Alarms:** two metric alarms watch the most important failure signals.",
]);
table(["Alarm", "Metric", "Condition", "Meaning"], [
  ["GearVault-High-5XX-Errors", "AWS/ApplicationELB `HTTPCode_Target_5XX_Count`", "Sum > 10 in one 5-minute period", "The application is throwing server errors"],
  ["GearVault-RDS-High-CPU", "AWS/RDS `CPUUtilization`", "Average > 80 % for 2 consecutive 5-minute periods", "The database is overloaded (slow queries or too much traffic)"],
], [2.4, 2.8, 2.2, 2.4]);
H2("11.2 Amazon SNS");
P("**What it is:** a publish/subscribe notification service. Both alarms have the topic `gearvault-alerts` as their alarm action; an e-mail subscription delivers the alert to the operator, who inspects the logs and can roll back, scale or pause the stack (Chapter 13).");
P("Health is also checked continuously at three levels: the **container HEALTHCHECK**, the **ALB target-group health check**, and the **ECS deployment circuit breaker**.");

// ---------------------------------------------------------------- 12 Deployment
H1("12. Deployment Pipeline (Figure 4)");
figure("fig4_deployment_pipeline.png", "Figure 4. Automated provisioning pipeline (deploy-all.ps1) — each phase depends on the ones below it.", 5.6);
P("`deploy-all.ps1` provisions the whole production stack from an empty account with the AWS CLI. The phases are ordered by **dependency**: you cannot create an RDS instance before its subnets exist, or an ECS service before its image, roles and target group exist.");
table(["Phase", "Creates", "Notes"], [
  ["0 · Account", "Reads account ID with `sts get-caller-identity`", "Derives bucket names; generates JWT and origin secrets"],
  ["1 · Network", "VPC, 6 subnets, IGW, EIP + NAT, route tables, S3 endpoint, 3 SGs", "Waits for `nat-gateway-available`"],
  ["2 · Storage", "Frontend and media buckets, website/CORS settings", ""],
  ["3 · Database", "DB subnet group, Multi-AZ RDS PostgreSQL 16", "Waits ~8–10 min for `db-instance-available`"],
  ["4 · Secrets", "credentials secret, origin-verify secret", "DATABASE_URL built from the new RDS endpoint"],
  ["5 · Ingress", "Target group, ALB, :80 listener", "Waits for `load-balancer-available`"],
  ["6 · Registry & IAM", "ECR repo, task-exec + task roles; `docker build` + `push :v2`", ""],
  ["7 · Cluster & schema", "ECS cluster, log group, task definition; migrate and seed tasks", "Waits for each one-off task to stop"],
  ["8 · Service & scaling", "ECS service (2 tasks, circuit breaker), scalable target 2–4, CPU policy", ""],
  ["9 · Edge", "CloudFront Functions, OAC (WAF Web ACL and distribution per the runbook)", "WAF in us-east-1"],
  ["10 · Automation", "Scheduler role, `gearvault-run-jobs` schedule", ""],
  ["11 · Observability & frontend", "SNS topic, 2 alarms, `npm run build`, `s3 sync`", "Then smoke tests"],
], [2, 4.2, 2.8]);
H2("12.1 Production verification — smoke tests");
P("After deployment, nine smoke tests were run and **all passed** (recorded in `deploy-state.json`):");
table(["Test", "Result"], [
  ["Liveness `/api/health`", "200 OK"], ["Readiness `/api/health/ready`", "200 OK (DB connected)"],
  ["Catalog items", "200 OK, 11 items"], ["Categories", "200 OK, 5 categories"],
  ["Registration", "201 Created"], ["Login / JWT issued", "200 OK"],
  ["Authenticated profile `/api/auth/me`", "200 OK, role customer"],
  ["Direct ALB access (must fail)", "403 Forbidden"], ["Through CloudFront", "200 OK"],
], [5, 4]);
caution([
  "Be honest if asked: the script automates phases 0–11, but the **WAF Web ACL, the CloudFront distribution, the ALB header rule and the task-role S3 policy** were created from the deployment-guide runbook (the interactive guide in `deployment-guide/`), not by `deploy-all.ps1` itself. The script also creates some settings more loosely than the final deployment (for example the ALB SG opened to 0.0.0.0/0). The figures show the **deployed, hardened state**.",
]);

// ---------------------------------------------------------------- 13 Operations
H1("13. Operations Lifecycle (Figure 8)");
figure("fig8_operations_lifecycle.png", "Figure 8. Operations lifecycle — provisioning, cost-saving sleep mode and full teardown runbooks.");
H2("13.1 Three states, four runbooks");
table(["Runbook", "From → to", "What it does"], [
  ["deploy-all.ps1", "Not provisioned → Running", "Builds everything (Chapter 12)"],
  ["pause-all.ps1", "Running → Paused", "1) ECS desired count → 0  2) Scheduler → DISABLED  3) RDS stop-db-instance"],
  ["resume-all.ps1", "Paused → Running", "1) RDS start, **wait until available**  2) Scheduler → ENABLED  3) ECS desired count → 2"],
  ["teardown-all.ps1", "Running/Paused → Not provisioned", "Deletes all resources in **reverse dependency order** (11 steps)"],
], [1.8, 2.6, 4.6]);
H2("13.2 Why order matters");
bullets([
  "**Resume** starts the database first: if tasks started before RDS was available, their readiness checks and first requests would fail.",
  "**Teardown** deletes consumers before providers: schedules and services before the cluster, the ALB before its subnets, the NAT Gateway (and its Elastic IP) before the VPC. AWS refuses to delete resources that are still in use, so a wrong order would fail halfway.",
]);
H2("13.3 Cost while paused");
P("Pausing stops **compute** billing (Fargate tasks and RDS instance hours) but keeps all data and configuration. Some resources still cost money while paused: the NAT Gateway, the ALB, the Elastic IP, RDS storage, S3 storage and Secrets Manager secrets. Note that AWS automatically restarts a stopped RDS instance after **7 days**, so a long pause needs a second `pause-all.ps1` or a full teardown.");

// ---------------------------------------------------------------- 14 Parity
H1("14. Development / Production Parity (Figure 9)");
figure("fig9_dev_prod_parity.png", "Figure 9. Development / production parity — each local compose service and its AWS counterpart.");
P("`docker-compose.yml` reproduces the production architecture on a laptop, so code that works locally works in AWS. This follows the **12-factor app** principle of keeping development and production as similar as possible.");
table(["Local (docker-compose)", "Production (AWS)", "What stays the same"], [
  ["Vite dev server :5173", "S3 frontend + CloudFront", "Same React code; production uses a static build"],
  ["backend container (gunicorn)", "ECS Fargate service", "**Same Dockerfile and image**"],
  ["migrate-seed container", "One-off ECS RunTask", "Same `flask db upgrade` / `flask seed` commands"],
  ["postgres:16-alpine", "RDS PostgreSQL 16 Multi-AZ", "Same engine major version"],
  ["minio + minio-init", "S3 media bucket", "Same S3 API through boto3 (endpoint URL is the only switch)"],
  ["Compose environment variables", "Secrets Manager + IAM task role", "Same variable names; production has no static keys"],
], [2.6, 2.6, 3.6]);

// ---------------------------------------------------------------- 15 Well-Architected
H1("15. AWS Well-Architected Review");
P("The AWS Well-Architected Framework judges a design against six pillars. This is a useful way to summarise the project for a cloud architecture course.");
table(["Pillar", "Evidence in GearVault"], [
  ["Operational excellence", "Scripted deploy/pause/resume/teardown runbooks; health checks at three levels; structured logs in CloudWatch; smoke tests; alarms with SNS."],
  ["Security", "WAF, CloudFront-only ingress, secret origin header, private subnets, SG chain, OAC, presigned URLs, Secrets Manager, IAM roles with STS, encryption at rest and in transit, non-root containers, image scanning."],
  ["Reliability", "Two AZs for ALB, tasks and database; Multi-AZ RDS failover; ECS replaces failed tasks; circuit breaker rollback; idempotent, lock-safe jobs."],
  ["Performance efficiency", "CDN caching of frontend and public images; direct-to-S3 uploads; stateless containers scaled on CPU; right-sized Fargate tasks."],
  ["Cost optimisation", "Fargate (no idle servers), Graviton db.t4g.micro, single NAT, free S3 Gateway Endpoint, scale cap of 4, sleep mode, full teardown."],
  ["Sustainability", "Managed, shared infrastructure; ARM-based database; compute scaled down or paused when idle."],
], [2, 7]);

// ---------------------------------------------------------------- 16 Limitations
H1("16. Known Limitations and Improvements");
P("Examiners respect a student who knows the weaknesses of their own design. These are real, specific to this deployment, and each has a clear fix.");
table(["Limitation", "Risk", "Improvement"], [
  ["CloudFront → ALB uses HTTP on port 80", "Traffic between edge and ALB is not encrypted (inside AWS's network, but still plaintext)", "ACM certificate on an HTTPS :443 listener; set origin protocol to HTTPS only"],
  ["Single NAT Gateway", "Outbound access lost if AZ a fails", "One NAT per AZ with per-AZ route tables"],
  ["CORS reflects any Origin", "The code builds an allow-list but then echoes every Origin header", "Apply the `CORS_ORIGINS` list; with same-origin `/api` the risk is low because tokens are sent in headers, not cookies"],
  ["Flask-Limiter uses in-memory storage", "Limits are per worker, not global", "Rely on WAF (already in place) or use Redis/ElastiCache storage"],
  ["Secrets present in local files", "`deploy-all.ps1` default DB password and `deploy-state.json` hold real secret values", "Rotate the secrets; remove them from files; use Secrets Manager rotation"],
  ["Broad scheduler / exec policies", "AmazonECS_FullAccess and `Resource: *` grant more than needed", "Scope to `ecs:RunTask` on the task definition and specific secret ARNs"],
  ["Backups: 1-day retention, no final snapshot on teardown", "Limited recovery window; data lost on teardown", "7–35 day retention, deletion protection, final snapshot"],
  ["Manual scripted deployment, drift vs. runbook", "Script and real state can diverge", "Infrastructure as Code (CloudFormation/CDK/Terraform) and a CI/CD pipeline (GitHub Actions or CodePipeline)"],
  ["No custom domain", "Users see a cloudfront.net address", "Route 53 domain + ACM certificate on CloudFront"],
], [2.6, 3, 3.4]);

// ---------------------------------------------------------------- 17 Viva Q&A
H1("17. Viva Questions and Model Answers");
const qa = [
  ["Why did you put CloudFront in front of the load balancer?",
    "It gives one HTTPS entry point for the frontend, images and API; caches static content close to users; lets WAF filter traffic at the edge; and keeps the S3 buckets private through OAC. Same-origin `/api` also avoids cross-origin requests."],
  ["How do you stop someone from bypassing CloudFront and WAF?",
    "Two controls: the ALB security group only accepts CloudFront's managed prefix list, and the ALB listener forwards only requests carrying the secret `X-Origin-Verify` header; everything else gets a fixed 403. The smoke test confirmed a direct ALB call returns 403."],
  ["What happens if one Availability Zone fails?",
    "The ALB stops routing to the failed AZ, the task in the other AZ keeps serving, and ECS launches replacement tasks in the healthy AZ. RDS fails over to the standby and keeps the same endpoint. The weak spot is the single NAT Gateway, which limits outbound traffic until AZ a recovers."],
  ["Why ECS Fargate rather than EC2 or Lambda?",
    "Fargate runs our existing Docker image with no servers to patch. Lambda would struggle with persistent database pools and long-running requests, and EC2 would mean managing instances and paying for idle capacity."],
  ["What is the difference between the task role and the execution role?",
    "The execution role is used by the ECS agent to pull the image, read secrets and write logs. The task role is used by our code inside the container; in GearVault it only allows S3 get/put on the media bucket."],
  ["How are secrets handled?",
    "The database URL, JWT key and origin secret live in Secrets Manager. ECS injects them into the container at start-up using the execution role. Nothing secret is in the code or the image, and AWS keys are never stored because roles provide temporary STS credentials."],
  ["Why presigned URLs for uploads?",
    "The API only authorises and signs; the browser uploads straight to S3. This keeps large files off the containers and lets S3 handle bandwidth. The URLs expire within 15 minutes and the server chooses the object key."],
  ["Why are item photos public but condition photos private?",
    "Catalog photos are meant for everyone, so they are cached by CloudFront. Condition photos are evidence in damage disputes; CloudFront cannot read them, and users get a short-lived presigned GET link only through the API after authorisation."],
  ["How does auto scaling work and why is the maximum 4?",
    "Target tracking keeps average CPU at 60 %, scaling between 2 and 4 tasks. The cap protects the small db.t4g.micro instance from too many connections."],
  ["How are database migrations run in production?",
    "The same image runs as a one-off Fargate task with the command overridden to `flask db upgrade`, then `flask seed`, inside the private subnet. No one connects to the database from outside."],
  ["How do background jobs avoid double-processing?",
    "EventBridge Scheduler starts a Fargate task every 5 minutes. The jobs are idempotent and use `SELECT … FOR UPDATE SKIP LOCKED`, so overlapping runs never process the same row."],
  ["How would you know the application is failing?",
    "CloudWatch alarms on ALB 5XX errors and RDS CPU notify an SNS topic that e-mails the operator. Logs are in `/ecs/gearvault-api`, and health checks at the container, target group and deployment level remove or roll back bad tasks."],
  ["What happens when you deploy a new version?",
    "A new task definition revision is registered and the service performs a rolling update: new tasks start (up to 200 %), pass health checks, then old tasks drain. If new tasks keep failing, the circuit breaker rolls back automatically."],
  ["Why is the WAF created in us-east-1 when the app is in Mumbai?",
    "WAF Web ACLs for CloudFront have global scope, and AWS requires global WAF resources to be created in us-east-1."],
  ["What is the S3 Gateway Endpoint for?",
    "It routes S3 traffic from the private subnets directly over the AWS network instead of through the NAT Gateway: free, faster, and private."],
  ["How do you control cost?",
    "Serverless containers, a small Graviton database, one NAT, the free S3 endpoint, a scaling cap, and runbooks to pause compute or tear down everything when not needed."],
  ["What would you improve next?",
    "HTTPS between CloudFront and the ALB with ACM, a second NAT Gateway, a CORS allow-list, tighter IAM policies, longer backups, and moving the scripts to Infrastructure as Code with a CI/CD pipeline."],
];
qa.forEach(([q, a], i) => {
  target.push(new Paragraph({ keepNext: true, spacing: { before: 160, after: 60 }, children: [new TextRun({ text: `Q${i + 1}. ${q}`, bold: true, color: ACCENT })] }));
  P(a);
});

// ---------------------------------------------------------------- Glossary
H1("Appendix A. Glossary");
table(["Term", "Meaning"], [
  ["Availability Zone (AZ)", "A physically separate data centre (or group) within an AWS region, with independent power and networking."],
  ["CIDR", "Notation for an IP address range, e.g. 10.0.0.0/16 = 65,536 addresses; /24 = 256 addresses."],
  ["Public / private subnet", "A subnet is public if its route table sends 0.0.0.0/0 to an Internet Gateway; otherwise it is private."],
  ["NAT Gateway", "Lets private resources make outbound connections without accepting inbound ones."],
  ["Security group", "Stateful firewall attached to a resource's network interface; rules can reference other security groups."],
  ["Managed prefix list", "A named set of IP ranges maintained by AWS, e.g. all CloudFront origin-facing addresses."],
  ["CDN", "Content Delivery Network: servers worldwide that cache and serve content close to users."],
  ["OAC", "Origin Access Control: CloudFront signs requests to S3 so the bucket can stay private."],
  ["WAF / Web ACL", "Web Application Firewall and its list of rules applied to HTTP requests."],
  ["ALB / target group", "Layer-7 load balancer; the target group is the set of task IPs it forwards to, with health checks."],
  ["Fargate", "Serverless compute for containers; AWS manages the servers."],
  ["Task definition / task / service", "Container recipe / one running copy / controller that keeps N copies running behind a load balancer."],
  ["awsvpc", "ECS network mode giving every task its own private IP and security group."],
  ["Target tracking", "Auto scaling that adjusts capacity to keep a metric (CPU) near a target value."],
  ["Circuit breaker", "ECS feature that stops a failing deployment and rolls back automatically."],
  ["Multi-AZ (RDS)", "A synchronous standby database in another AZ with automatic failover."],
  ["Presigned URL", "A time-limited URL signed with AWS credentials that grants one specific S3 action on one object."],
  ["STS", "Security Token Service: issues temporary credentials when a role is assumed."],
  ["Liveness / readiness probe", "Health checks for \"process is alive\" versus \"ready to serve, dependencies reachable\"."],
  ["Idempotent", "Running an operation more than once has the same effect as running it once."],
  ["Infrastructure as Code (IaC)", "Defining infrastructure in version-controlled templates (CloudFormation, CDK, Terraform)."],
], [2.4, 6.6]);

// =================================================================== DOCUMENT
const numberingConfig = [
  {
    reference: "bullets",
    levels: [
      { level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 270 } } } },
      { level: 1, format: LevelFormat.BULLET, text: "–", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 1080, hanging: 270 } } } },
    ],
  },
  ...numRefs.map((ref) => ({
    reference: ref,
    levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 320 } } } }],
  })),
];

const header = () => new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: "GearVault — Cloud Architecture Study Guide", size: 16, color: "808080" })] })] });
const footer = () => new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: ["Page ", PageNumber.CURRENT], size: 16, color: "808080" })] })] });
const portrait = { page: { size: A4, margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN } } };

const doc = new Document({
  creator: "Sathyanarayanan",
  title: "GearVault — Cloud Architecture Study Guide",
  features: { updateFields: true },
  styles: {
    default: { document: { run: { font: FONT, size: 21 }, paragraph: { spacing: { line: 276 } } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 34, bold: true, font: FONT, color: ACCENT }, paragraph: { spacing: { before: 120, after: 200 }, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 27, bold: true, font: FONT, color: "2E5597" }, paragraph: { spacing: { before: 260, after: 120 }, outlineLevel: 1, keepNext: true } },
      { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 23, bold: true, font: FONT, color: "404040" }, paragraph: { spacing: { before: 180, after: 80 }, outlineLevel: 2, keepNext: true } },
    ],
  },
  numbering: { config: numberingConfig },
  sections: [
    { properties: portrait, headers: { default: header() }, footers: { default: footer() }, children: front },
    {
      properties: { type: SectionType.NEXT_PAGE, page: { size: { width: A4.width, height: A4.height, orientation: PageOrientation.LANDSCAPE }, margin: { top: 900, bottom: 900, left: MARGIN, right: MARGIN } } },
      headers: { default: header() }, footers: { default: footer() }, children: landscapeSection,
    },
    { properties: { ...portrait, type: SectionType.NEXT_PAGE }, headers: { default: header() }, footers: { default: footer() }, children: body },
  ],
});

Packer.toBuffer(doc).then((buf) => { fs.writeFileSync(OUT, buf); console.log("wrote", OUT, buf.length); });
