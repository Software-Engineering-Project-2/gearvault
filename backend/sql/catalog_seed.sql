insert into item_categories (name, description) values
  ('Cameras', 'Cameras and lenses'), ('Audio', 'Recording equipment'),
  ('Lighting', 'Studio and event lights'), ('Computers', 'Production computers'),
  ('Event Gear', 'Projectors and presentation gear') on conflict (name) do nothing;

insert into items (sku, name, description, image_path, purchase_price, purchase_date, replacement_price, category_id, active)
select inventory.sku, inventory.name, inventory.description, inventory.image_path, inventory.purchase_price,
       inventory.purchase_date::date, inventory.replacement_price, categories.id, true
from (
  values
    ('CAM-001', 'Canon EOS R6', 'Full-frame mirrorless camera body', 'product_images/Canon E0S R6.png', 185000, '2025-01-15', 225000, 'Cameras'),
    ('CAM-002', 'Sony A7 IV', 'Full-frame hybrid camera body', 'product_images/Sony A7 IV.png', 210000, '2024-06-20', 255000, 'Cameras'),
    ('LEN-001', 'Sony 24-70mm f/2.8 Lens', 'Professional standard zoom lens', 'product_images/Sony 24-70mm f 2.8 Lens.png', 145000, '2024-03-10', 175000, 'Cameras'),
    ('AUD-001', 'Wireless Microphone Kit', 'Dual-channel lavalier microphone system', 'product_images/Wireless Microphone Kit.png', 18000, '2025-05-12', 25000, 'Audio'),
    ('AUD-002', 'Rode Shotgun Microphone', 'Camera-mounted directional microphone', 'product_images/Rode Shotgun Microphone.png', 22000, '2023-11-05', 30000, 'Audio'),
    ('LGT-001', 'LED Panel Light', 'Bi-colour LED light panel with stand', 'product_images/LED Panel Light.png', 8000, '2024-09-18', 12000, 'Lighting'),
    ('LGT-002', 'Godox Softbox Kit', 'Two-light softbox studio kit', 'product_images/Godox Softbox Kit.png', 14000, '2025-02-28', 20000, 'Lighting'),
    ('CMP-001', 'MacBook Pro 14-inch', 'Apple Silicon laptop for editing', 'product_images/MacBook Pro 14-inch.png', 175000, '2024-10-01', 220000, 'Computers'),
    ('CMP-002', 'Editing Monitor 27-inch', '4K colour-accurate production monitor', 'product_images/Editing Monitor 27-inch.png', 32000, '2023-08-14', 45000, 'Computers'),
    ('EVT-001', 'Epson Projector', 'Full HD event projector', 'product_images/Epson Projector.png', 55000, '2024-01-22', 75000, 'Event Gear'),
    ('EVT-002', 'Portable PA Speaker', 'Battery-powered PA speaker with microphone', 'product_images/Portable PA Speaker.png', 28000, '2025-03-15', 40000, 'Event Gear')
) as inventory(sku, name, description, image_path, purchase_price, purchase_date, replacement_price, category_name)
join item_categories as categories on categories.name = inventory.category_name
on conflict (sku) do nothing;
