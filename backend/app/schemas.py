from marshmallow import Schema, fields, validate, ValidationError


class LoginSchema(Schema):
    email = fields.Email(required=True, error_messages={"required": "Email is required."})
    password = fields.String(required=True, error_messages={"required": "Password is required."})


class RegisterSchema(Schema):
    email = fields.Email(required=True, error_messages={"required": "Email is required."})
    password = fields.String(
        required=True,
        validate=validate.Length(min=6, error="Password must be at least 6 characters long."),
        error_messages={"required": "Password is required."},
    )
    full_name = fields.String(load_default="")
    phone = fields.String(load_default=None, allow_none=True)


class BookingHoldSchema(Schema):
    item_id = fields.Integer(required=True, error_messages={"required": "Item ID is required."})
    start_ts = fields.String(required=True, error_messages={"required": "Start timestamp is required."})
    end_ts = fields.String(required=True, error_messages={"required": "End timestamp is required."})


class ReturnProcessSchema(Schema):
    notes = fields.String(load_default="", allow_none=True)
    photo_url = fields.String(load_default="", allow_none=True)
    has_damage = fields.Boolean(load_default=False)
    damage_type_id = fields.Integer(load_default=None, allow_none=True)
    severity = fields.Integer(
        load_default=None,
        allow_none=True,
        validate=validate.Range(min=1, max=5, error="Severity must be between 1 and 5."),
    )
    force_presumed_lost = fields.Boolean(load_default=False)
