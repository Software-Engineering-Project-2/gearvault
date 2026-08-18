insert into item_categories (name, description) values
  ('Cameras', 'Cameras and lenses'), ('Audio', 'Recording equipment'),
  ('Lighting', 'Studio and event lights'), ('Computers', 'Production computers'),
  ('Event Gear', 'Projectors and presentation gear') on conflict (name) do nothing;

insert into items (sku, name, description, purchase_price, purchase_date, replacement_price, category_id, active)
select inventory.sku, inventory.name, inventory.description, inventory.purchase_price,
       current_date, inventory.replacement_price, categories.id, true
from (
  values
    ('CAM-001', 'Canon EOS R6', 'Full-frame mirrorless camera body', 185000, 225000, 'Cameras'),
    ('CAM-002', 'Sony A7 IV', 'Full-frame hybrid camera body', 210000, 255000, 'Cameras'),
    ('LEN-001', 'Sony 24-70mm f/2.8 Lens', 'Professional standard zoom lens', 145000, 175000, 'Cameras'),
    ('AUD-001', 'Wireless Microphone Kit', 'Dual-channel lavalier microphone system', 18000, 25000, 'Audio'),
    ('AUD-002', 'Rode Shotgun Microphone', 'Camera-mounted directional microphone', 22000, 30000, 'Audio'),
    ('LGT-001', 'LED Panel Light', 'Bi-colour LED light panel with stand', 8000, 12000, 'Lighting'),
    ('LGT-002', 'Godox Softbox Kit', 'Two-light softbox studio kit', 14000, 20000, 'Lighting'),
    ('CMP-001', 'MacBook Pro 14-inch', 'Apple Silicon laptop for editing', 175000, 220000, 'Computers'),
    ('CMP-002', 'Editing Monitor 27-inch', '4K colour-accurate production monitor', 32000, 45000, 'Computers'),
    ('EVT-001', 'Epson Projector', 'Full HD event projector', 55000, 75000, 'Event Gear'),
    ('EVT-002', 'Portable PA Speaker', 'Battery-powered PA speaker with microphone', 28000, 40000, 'Event Gear')
) as inventory(sku, name, description, purchase_price, replacement_price, category_name)
join item_categories as categories on categories.name = inventory.category_name
on conflict (sku) do nothing;
