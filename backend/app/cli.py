import os
from datetime import datetime, timezone
from decimal import Decimal
import click
from flask.cli import with_appcontext

from app.extensions import db
from app.models import Category, DamageType, Item, Role, User


def seed_canonical_data():
    """Seeds baseline canonical roles and damage types (used in tests and flask seed)."""
    # 1. Canonical Roles
    role_definitions = [
        (1, "customer"),
        (2, "staff"),
        (3, "manager"),
    ]
    for r_id, r_name in role_definitions:
        existing_role = db.session.get(Role, r_id) or Role.query.filter_by(name=r_name).first()
        if not existing_role:
            db.session.add(Role(id=r_id, name=r_name))
        elif existing_role.name != r_name:
            existing_role.name = r_name
    db.session.commit()

    # 2. Canonical Damage Types
    damage_defaults = [
        ("Cosmetic", 0.05, "Surface scratches, scuffs, minor cosmetic wear not affecting functionality."),
        ("Functional", 0.20, "Partial impairment, broken switch/mount, requires servicing."),
        ("Major/Total Loss", 1.00, "Complete device failure, shattered sensor/glass, water submersion, or total destruction."),
    ]
    for name, weight, desc in damage_defaults:
        dt = DamageType.query.filter_by(name=name).first()
        if not dt:
            db.session.add(DamageType(name=name, weight=Decimal(str(weight)), description=desc))
        else:
            dt.weight = Decimal(str(weight))
            dt.description = desc
    db.session.commit()


def seed_catalog():
    """Seeds initial categories and inventory items idempotently from catalog_seed.sql."""
    categories_data = [
        ("Cameras", "Cameras and lenses"),
        ("Audio", "Recording equipment"),
        ("Lighting", "Studio and event lights"),
        ("Computers", "Production computers"),
        ("Event Gear", "Projectors and presentation gear"),
    ]
    for cat_name, desc in categories_data:
        cat = Category.query.filter_by(name=cat_name).first()
        if not cat:
            db.session.add(Category(name=cat_name, description=desc))
        else:
            cat.description = desc
    db.session.commit()

    items_data = [
        ("CAM-001", "Canon EOS R6", "Full-frame mirrorless camera body", "product_images/Canon E0S R6.png", 185000, "2025-01-15", 225000, "Cameras"),
        ("CAM-002", "Sony A7 IV", "Full-frame hybrid camera body", "product_images/Sony A7 IV.png", 210000, "2024-06-20", 255000, "Cameras"),
        ("LEN-001", "Sony 24-70mm f/2.8 Lens", "Professional standard zoom lens", "product_images/Sony 24-70mm f 2.8 Lens.png", 145000, "2024-03-10", 175000, "Cameras"),
        ("AUD-001", "Wireless Microphone Kit", "Dual-channel lavalier microphone system", "product_images/Wireless Microphone Kit.png", 18000, "2025-05-12", 25000, "Audio"),
        ("AUD-002", "Rode Shotgun Microphone", "Camera-mounted directional microphone", "product_images/Rode Shotgun Microphone.png", 22000, "2023-11-05", 30000, "Audio"),
        ("LGT-001", "LED Panel Light", "Bi-colour LED light panel with stand", "product_images/LED Panel Light.png", 8000, "2024-09-18", 12000, "Lighting"),
        ("LGT-002", "Godox Softbox Kit", "Two-light softbox studio kit", "product_images/Godox Softbox Kit.png", 14000, "2025-02-28", 20000, "Lighting"),
        ("CMP-001", "MacBook Pro 14-inch", "Apple Silicon laptop for editing", "product_images/MacBook Pro 14-inch.png", 175000, "2024-10-01", 220000, "Computers"),
        ("CMP-002", "Editing Monitor 27-inch", "4K colour-accurate production monitor", "product_images/Editing Monitor 27-inch.png", 32000, "2023-08-14", 45000, "Computers"),
        ("EVT-001", "Epson Projector", "Full HD event projector", "product_images/Epson Projector.png", 55000, "2024-01-22", 75000, "Event Gear"),
        ("EVT-002", "Portable PA Speaker", "Battery-powered PA speaker with microphone", "product_images/Portable PA Speaker.png", 28000, "2025-03-15", 40000, "Event Gear"),
    ]

    for sku, name, desc, img_path, purchase_price, purchase_date_str, repl_price, cat_name in items_data:
        cat = Category.query.filter_by(name=cat_name).first()
        if not cat:
            continue
        p_date = datetime.strptime(purchase_date_str, "%Y-%m-%d").date()
        item = Item.query.filter_by(sku=sku).first()
        if not item:
            item = Item(
                sku=sku,
                name=name,
                description=desc,
                image_path=img_path,
                purchase_price=Decimal(str(purchase_price)),
                purchase_date=p_date,
                replacement_price=Decimal(str(repl_price)),
                category_id=cat.id,
                active=True,
            )
            db.session.add(item)
        else:
            item.name = name
            item.description = desc
            item.image_path = img_path
            item.purchase_price = Decimal(str(purchase_price))
            item.purchase_date = p_date
            item.replacement_price = Decimal(str(repl_price))
            item.category_id = cat.id
            item.active = True
    db.session.commit()


def seed_dev_users():
    """Seeds development users only if SEED_DEV_USERS=true and DEV_USERS_PASSWORD is set."""
    seed_flag = os.getenv("SEED_DEV_USERS", "false").strip().lower() in ("true", "1", "yes")
    if not seed_flag:
        return

    dev_password = os.getenv("DEV_USERS_PASSWORD")
    if not dev_password:
        raise RuntimeError("SEED_DEV_USERS is true, but DEV_USERS_PASSWORD environment variable is not set.")

    dev_users = [
        ("customer@test.com", "Customer Test User", 1),
        ("staff@test.com", "Staff Test User", 2),
        ("manager@test.com", "Manager Test User", 3),
    ]
    for email, full_name, role_id in dev_users:
        user = User.query.filter_by(email=email).first()
        if not user:
            user = User(email=email, full_name=full_name, role_id=role_id)
            user.set_password(dev_password)
            db.session.add(user)
        else:
            user.role_id = role_id
            user.set_password(dev_password)
    db.session.commit()


@click.command("seed")
@with_appcontext
def seed_command():
    """Idempotently seed canonical roles, damage types, catalog items, and optional dev users."""
    click.echo("Seeding canonical roles and damage types...")
    seed_canonical_data()

    click.echo("Seeding catalog categories and inventory items...")
    seed_catalog()

    if os.getenv("SEED_DEV_USERS", "false").strip().lower() in ("true", "1", "yes"):
        click.echo("Seeding development users...")
        seed_dev_users()
    else:
        click.echo("Skipping development users (SEED_DEV_USERS is not true).")

    click.echo("Database seeding completed successfully.")


@click.command("create-user")
@click.option("--email", required=True, help="User email address.")
@click.option("--full-name", required=True, help="User full name.")
@click.option(
    "--role",
    required=True,
    type=click.Choice(["manager", "staff", "customer"], case_sensitive=False),
    help="Role assigned to user.",
)
@click.option(
    "--password",
    prompt=False,
    default=None,
    help="User password (if omitted, reads from NEW_USER_PASSWORD env or prompts).",
)
@with_appcontext
def create_user_command(email, full_name, role, password):
    """Create a new user with the specified role, reading password securely."""
    email_clean = email.strip().lower()
    full_name_clean = full_name.strip()
    role_clean = role.strip().lower()

    # 1. Check if user already exists
    existing_user = User.query.filter(db.func.lower(User.email) == email_clean).first()
    if existing_user:
        click.secho(
            f"Error: User with email '{email_clean}' already exists (ID: {existing_user.id}, Role: {existing_user.role}).",
            fg="red",
            err=True,
        )
        raise SystemExit(1)

    # 2. Get password: from option, or NEW_USER_PASSWORD env, or interactive prompt
    pwd = password or os.getenv("NEW_USER_PASSWORD")
    if not pwd:
        pwd = click.prompt("Password", hide_input=True, confirmation_prompt=True)

    if not pwd or len(pwd.strip()) == 0:
        click.secho("Error: Password cannot be empty.", fg="red", err=True)
        raise SystemExit(1)

    # 3. Resolve role object
    role_obj = Role.query.filter(db.func.lower(Role.name) == role_clean).first()
    if not role_obj:
        seed_canonical_data()
        role_obj = Role.query.filter(db.func.lower(Role.name) == role_clean).first()

    if not role_obj:
        click.secho(f"Error: Role '{role_clean}' not found in database.", fg="red", err=True)
        raise SystemExit(1)

    # 4. Create and persist user
    new_user = User(
        email=email_clean,
        full_name=full_name_clean,
        role_id=role_obj.id,
    )
    new_user.set_password(pwd)
    db.session.add(new_user)
    db.session.commit()

    click.secho(
        f"Success: Created user '{new_user.email}' with role '{role_obj.name}' (ID: {new_user.id}).",
        fg="green",
    )
