insert into item_categories (name, description) values
  ('Cameras', 'Cameras and lenses'), ('Audio', 'Recording equipment'),
  ('Lighting', 'Studio and event lights'), ('Computers', 'Production computers'),
  ('Event Gear', 'Projectors and presentation gear') on conflict (name) do nothing;

insert into items (sku, name, description, image_path, purchase_price, purchase_date, replacement_price, category_id, active)
select inventory.sku, inventory.name, inventory.description, inventory.image_path, inventory.purchase_price,
       inventory.purchase_date::date, inventory.replacement_price, categories.id, true
from (
  values
    ('CAM-001', 'Canon EOS R6', 'Full-frame mirrorless camera body', 'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=800&q=80', 185000, '2025-01-15', 225000, 'Cameras'),
    ('CAM-002', 'Sony A7 IV', 'Full-frame hybrid camera body', 'https://images.unsplash.com/photo-1502920917128-1aa500764cbd?w=800&q=80', 210000, '2024-06-20', 255000, 'Cameras'),
    ('LEN-001', 'Sony 24-70mm f/2.8 Lens', 'Professional standard zoom lens', 'https://images.unsplash.com/photo-1617005082133-548c4dd27f35?w=800&q=80', 145000, '2024-03-10', 175000, 'Cameras'),
    ('AUD-001', 'Wireless Microphone Kit', 'Dual-channel lavalier microphone system', 'https://images.unsplash.com/photo-1590602847861-f357a9332bbc?w=800&q=80', 18000, '2025-05-12', 25000, 'Audio'),
    ('AUD-002', 'Rode Shotgun Microphone', 'Camera-mounted directional microphone', 'https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?w=800&q=80', 22000, '2023-11-05', 30000, 'Audio'),
    ('LGT-001', 'LED Panel Light', 'Bi-colour LED light panel with stand', 'https://images.unsplash.com/photo-1524368535928-5b5e00ddc76b?w=800&q=80', 8000, '2024-09-18', 12000, 'Lighting'),
    ('LGT-002', 'Godox Softbox Kit', 'Two-light softbox studio kit', 'https://images.unsplash.com/photo-1514565131-fce0801e5785?w=800&q=80', 14000, '2025-02-28', 20000, 'Lighting'),
    ('CMP-001', 'MacBook Pro 14-inch', 'Apple Silicon laptop for editing', 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=800&q=80', 175000, '2024-10-01', 220000, 'Computers'),
    ('CMP-002', 'Editing Monitor 27-inch', '4K colour-accurate production monitor', 'https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?w=800&q=80', 32000, '2023-08-14', 45000, 'Computers'),
    ('EVT-001', 'Epson Projector', 'Full HD event projector', 'https://images.unsplash.com/photo-1517604931442-7e0c8ed2963c?w=800&q=80', 55000, '2024-01-22', 75000, 'Event Gear'),
    ('EVT-002', 'Portable PA Speaker', 'Battery-powered PA speaker with microphone', 'https://images.unsplash.com/photo-1545454675-3531b543be5d?w=800&q=80', 28000, '2025-03-15', 40000, 'Event Gear')
) as inventory(sku, name, description, image_path, purchase_price, purchase_date, replacement_price, category_name)
join item_categories as categories on categories.name = inventory.category_name
on conflict (sku) do nothing;
