-- Upload products from products_details1.xlsx to seller MK VARKEY as draft mode entries.
-- Generated automatically from Excel rows with non-empty Product Name.

WITH input_data (
  name, category_slug, sub_category_slug, product_type_slug, brand,
  mrp, price, stock, description, short_description, sku,
  highlights_text, specifications_text,
  package_weight, package_length, package_width, package_height,
  manufacturer_name, manufacturer_country, ingredients, directions, important_note,
  origin_country, is_cod_available, ships_internationally, item_condition, base_slug
) AS (
  VALUES
  ('Hyalu-Cica Water-Fit Sun Serum SPF50+ PA+ (50 ml)', 'beauty-personal-care', 'skincare', 'sunscreen', 'SKIN1004', 1499.00, 1499.00, 25, 'SPF50+ PA++++ protection; Lightweight serum texture; Contains Centella Asiatica; Hydrating formula; Suitable for all skin types; No white cast; Daily wear sunscreen.', 'Lightweight Korean sunscreen with Centella & Hyaluronic Acid that hydrates and protects skin.', 'MKV-SKIN-0001', 'Hydrating Korean sunscreen with broad-spectrum UV protection and lightweight non-sticky finish.', 'Type: Sunscreen | Texture: Serum | Skin Type: All | SPF: 50+ PA++++', 80.00, 14.00, 5.00, 4.00, 'SKIN1004 Co., Ltd.', 'South Korea', 'Centella Asiatica Extract, Hyaluronic Acid, Niacinamide, UV Filters', 'Apply evenly on face and neck before sun exposure.', 'For external use only. Reapply every 2-3 hours.', 'India', true, true, 'brand_new', 'hyalu-cica-water-fit-sun-serum-spf50-pa-50-ml'),
  ('Beauty of Joseon Ginseng Cleansing Oil (210 ml)', 'beauty-personal-care', 'skincare', 'face-wash', 'Beauty of Joseon', 1899.00, 1899.00, 25, 'Deep cleansing oil; Removes waterproof makeup; Lightweight texture; Nourishes skin; Contains ginseng extract; Non-stripping formula.', 'Gentle cleansing oil with ginseng seed oil to remove makeup, dirt and sunscreen.', 'MKV-SKIN-0002', 'Korean cleansing oil that melts makeup and impurities while keeping skin soft and hydrated.', 'Type: Cleansing Oil | Skin Type: All | Texture: Oil', 260.00, 18.00, 6.00, 6.00, 'Goodai Global Inc.', 'South Korea', 'Ginseng Seed Oil, Soybean Oil, Olive Oil', 'Massage onto dry skin and rinse with lukewarm water.', 'Avoid contact with eyes.', 'India', true, true, 'brand_new', 'beauty-of-joseon-ginseng-cleansing-oil-210-ml'),
  ('Madagascar Centella Travel Kit', 'beauty-personal-care', 'skincare', 'skin-care-kits', 'SKIN1004', 1999.00, 1999.00, 25, 'Includes 5 skincare essentials; Travel-friendly sizes; Centella-based soothing care; Hydrating and calming; Suitable for sensitive skin.', 'Travel-sized Korean skincare kit with toner, ampoule, cleansing oil and soothing cream.', 'MKV-SKIN-0003', 'Complete Korean skincare trial kit for hydration, calming and daily skincare routine.', 'Type: Trial Kit | Skin Type: All | Includes: Toner, Ampoule, Cream, Oil', 400.00, 20.00, 15.00, 6.00, 'SKIN1004 Co., Ltd.', 'South Korea', 'Centella Asiatica Extract, Hyaluronic Acid, Botanical Extracts', 'Use products step-by-step after cleansing.', 'Store in a cool dry place.', 'India', true, true, 'brand_new', 'madagascar-centella-travel-kit'),
  ('Madagascar Centella Quick Calming Pad (130 ml / 70 pcs)', 'beauty-personal-care', 'skincare', 'serums', 'SKIN1004', 1799.00, 1799.00, 25, 'Pre-soaked calming pads; Helps reduce redness; Gentle exfoliation; Hydrating formula; Suitable for sensitive skin.', 'Soothing toner pads with Centella to calm sensitive and irritated skin.', 'MKV-SKIN-0004', 'Cooling calming pads infused with Centella to refresh and soothe stressed skin.', 'Type: Toner Pads | Skin Type: Sensitive | Qty: 70 pads', 300.00, 10.00, 9.00, 9.00, 'SKIN1004 Co., Ltd.', 'South Korea', 'Centella Asiatica Extract, Panthenol, Glycerin', 'Swipe gently across clean skin.', 'Close lid tightly after use.', 'India', true, true, 'brand_new', 'madagascar-centella-quick-calming-pad-130-ml-70-pcs'),
  ('Madagascar Centella Poremizing Quick Clay Stick Mask (27 g)', 'beauty-personal-care', 'skincare', 'face-wash', 'SKIN1004', 1299.00, 1299.00, 25, 'Easy stick application; Controls excess sebum; Pore tightening care; Contains red bean extract; Wash-off clay mask.', 'Quick clay stick mask with red bean and 5 clays to absorb oil and tighten pores.', 'MKV-SKIN-0005', 'Mess-free clay stick mask that deeply cleans pores and leaves skin smooth and refreshed.', 'Type: Clay Mask | Texture: Stick | Skin Type: Oily/Combination', 90.00, 12.00, 4.00, 4.00, 'SKIN1004 Co., Ltd.', 'South Korea', 'Kaolin, Bentonite, Red Bean Powder, Centella Extract', 'Apply evenly, leave for 3-5 mins, rinse off.', 'Do not use on broken or irritated skin.', 'India', true, true, 'brand_new', 'madagascar-centella-poremizing-quick-clay-stick-mask-27-g'),
  ('SKIN1004 Madagascar Centella Poremizing Clear Toner (210 ml)', 'beauty-personal-care', 'skincare', 'toners', 'SKIN1004', 1799.00, 1799.00, 25, 'Controls excess oil; Minimizes pores; Hydrating formula; Gentle exfoliation; Suitable for oily skin.', 'Oil-control toner with Himalayan pink salt and Centella for pore care.', 'MKV-SKIN-0006', 'Refreshing toner that helps tighten pores and balance sebum.', 'Type: Toner | Skin Type: Oily/Combination | Size: 210 ml', 260.00, 18.00, 6.00, 6.00, 'SKIN1004 Co., Ltd.', 'South Korea', 'Centella Extract, Pink Salt, Niacinamide', 'Apply using cotton pad after cleansing.', 'Avoid direct eye contact.', 'India', true, true, 'brand_new', 'skin1004-madagascar-centella-poremizing-clear-toner-210-ml'),
  ('SKIN1004 Madagascar Centella Light Cleansing Oil (30 ml)', 'beauty-personal-care', 'skincare', 'face-wash', 'SKIN1004', 799.00, 799.00, 25, 'Deep cleansing; Gentle formula; Removes impurities; Hydrating texture.', 'Lightweight cleansing oil for makeup and sunscreen removal.', 'MKV-SKIN-0007', 'Travel-friendly cleansing oil with Centella for fresh and clean skin.', 'Type: Cleansing Oil | Size: 30 ml', 80.00, 10.00, 4.00, 4.00, 'SKIN1004 Co., Ltd.', 'South Korea', 'Centella Extract, Plant Oils', 'Massage onto dry skin and rinse.', 'External use only.', 'India', true, true, 'brand_new', 'skin1004-madagascar-centella-light-cleansing-oil-30-ml'),
  ('SKIN1004 Madagascar Centella Ampoule (55 ml)', 'beauty-personal-care', 'skincare', 'serums', 'SKIN1004', 1499.00, 1499.00, 25, 'Hydrates skin; Calms redness; Lightweight serum texture; Daily use.', 'Soothing ampoule with pure Centella extract for calming sensitive skin.', 'MKV-SKIN-0008', 'Minimal ingredient ampoule designed to soothe and hydrate irritated skin.', 'Type: Serum/Ampoule | Size: 55 ml', 120.00, 12.00, 5.00, 5.00, 'SKIN1004 Co., Ltd.', 'South Korea', 'Centella Asiatica Extract', 'Apply after toner and gently pat into skin.', 'Patch test recommended.', 'India', true, true, 'brand_new', 'skin1004-madagascar-centella-ampoule-55-ml'),
  ('SKIN1004 Tone Brightening Capsule Ampoule (30 ml)', 'beauty-personal-care', 'skincare', 'serums', 'SKIN1004', 1699.00, 1699.00, 25, 'Improves dullness; Hydrating capsules; Lightweight formula; Brightening care.', 'Brightening serum with capsule technology for radiant skin.', 'MKV-SKIN-0009', 'Glow-enhancing ampoule that improves uneven skin tone.', 'Type: Brightening Serum | Size: 30 ml', 100.00, 11.00, 5.00, 5.00, 'SKIN1004 Co., Ltd.', 'South Korea', 'Niacinamide, Centella Extract, Capsules', 'Use after cleansing and toning.', 'Store away from sunlight.', 'India', true, true, 'brand_new', 'skin1004-tone-brightening-capsule-ampoule-30-ml'),
  ('SKIN1004 Centella Air-Fit Sunscream Plus SPF50+ PA++++ (50 ml)', 'beauty-personal-care', 'skincare', 'sunscreen', 'SKIN1004', 1499.00, 1499.00, 25, 'SPF50+ protection; Non-sticky finish; No white cast; Daily use.', 'Lightweight sunscreen with broad-spectrum UV protection.', 'MKV-SKIN-0010', 'Hydrating sunscreen suitable for all skin types.', 'Type: Sunscreen | SPF50+ PA++++ | Size: 50 ml', 90.00, 15.00, 5.00, 4.00, 'SKIN1004 Co., Ltd.', 'South Korea', 'Centella Extract, UV Filters', 'Apply before sun exposure.', 'Reapply every 2-3 hours.', 'India', true, true, 'brand_new', 'skin1004-centella-air-fit-sunscream-plus-spf50-pa-50-ml'),
  ('SKIN1004 Tone Brightening Capsule Cream (75 ml)', 'beauty-personal-care', 'skincare', 'face-creams', 'SKIN1004', 1799.00, 1799.00, 25, 'Hydrating texture; Brightening care; Gentle daily moisturizer.', 'Brightening cream that improves dull and uneven skin tone.', 'MKV-SKIN-0011', 'Capsule cream for radiant and healthy-looking skin.', 'Type: Face Cream | Size: 75 ml', 140.00, 15.00, 6.00, 5.00, 'SKIN1004 Co., Ltd.', 'South Korea', 'Niacinamide, Centella Extract', 'Apply evenly as final skincare step.', 'For external use only.', 'India', true, true, 'brand_new', 'skin1004-tone-brightening-capsule-cream-75-ml'),
  ('SKIN1004 Madagascar Centella Cream (30 ml)', 'beauty-personal-care', 'skincare', 'face-creams', 'SKIN1004', 1399.00, 1399.00, 25, 'Lightweight cream; Hydrates skin; Supports skin barrier.', 'Hydrating Korean moisturizer with Centella for soothing care.', 'MKV-SKIN-0012', 'Daily moisturizing cream suitable for sensitive skin.', 'Type: Moisturizer | Size: 30 ml', 90.00, 12.00, 5.00, 4.00, 'SKIN1004 Co., Ltd.', 'South Korea', 'Centella Extract, Botanical Oils', 'Apply after serum.', 'Store in cool dry place.', 'India', true, true, 'brand_new', 'skin1004-madagascar-centella-cream-30-ml'),
  ('SKIN1004 Centella Poremizing Light Gel Cream (75 ml)', 'beauty-personal-care', 'skincare', 'face-creams', 'SKIN1004', 1699.00, 1699.00, 25, 'Controls oil; Lightweight hydration; Cooling texture.', 'Cooling gel moisturizer with niacinamide for oily skin.', 'MKV-SKIN-0013', 'Refreshing gel cream that hydrates without heaviness.', 'Type: Gel Cream | Size: 75 ml', 130.00, 15.00, 6.00, 5.00, 'SKIN1004 Co., Ltd.', 'South Korea', 'Niacinamide, Centella Extract', 'Apply on clean skin.', 'Avoid eye area.', 'India', true, true, 'brand_new', 'skin1004-centella-poremizing-light-gel-cream-75-ml'),
  ('SKIN1004 Madagascar Centella Hyalu-Cica Sleeping Pack', 'beauty-personal-care', 'skincare', 'serums', 'SKIN1004', 1599.00, 1599.00, 25, 'Deep hydration; Overnight repair; Soothing effect.', 'Overnight sleeping mask with Hyalu-Cica hydration care.', 'MKV-SKIN-0014', 'Hydrating overnight mask that refreshes tired skin.', 'Type: Sleeping Pack | Skin Type: All', 120.00, 14.00, 5.00, 4.00, 'SKIN1004 Co., Ltd.', 'South Korea', 'Hyaluronic Acid, Centella Extract', 'Apply as last step before sleep.', 'Use 2-3 times weekly.', 'India', true, true, 'brand_new', 'skin1004-madagascar-centella-hyalu-cica-sleeping-pack'),
  ('SKIN1004 Madagascar Centella Tea-Trica B5 Cream (75 ml)', 'beauty-personal-care', 'skincare', 'face-creams', 'SKIN1004', 1799.00, 1799.00, 25, 'Soothes irritation; Moisturizes skin; Lightweight cream.', 'Tea tree and B5 cream for calming acne-prone skin.', 'MKV-SKIN-0015', 'Calming moisturizer designed for oily and acne-prone skin.', 'Type: Face Cream | Size: 75 ml', 140.00, 15.00, 6.00, 5.00, 'SKIN1004 Co., Ltd.', 'South Korea', 'Tea Tree, Panthenol (B5), Centella Extract', 'Apply after serum.', 'Patch test before use.', 'India', true, true, 'brand_new', 'skin1004-madagascar-centella-tea-trica-b5-cream-75-ml'),
  ('SKIN1004 Madagascar Centella Soothing Cream (30 ml)', 'beauty-personal-care', 'skincare', 'face-creams', 'SKIN1004', 1499.00, 1499.00, 25, 'Calms irritation; Strengthens skin barrier; Lightweight hydration; Suitable for sensitive skin.', 'Hydrating soothing cream with Centella for sensitive skin.', 'MKV-SKIN-0016', 'Gentle moisturizer that soothes and hydrates stressed skin.', 'Type: Soothing Cream | Size: 30 ml', 90.00, 12.00, 5.00, 4.00, 'SKIN1004 Co., Ltd.', 'South Korea', 'Centella Extract, Ceramide Complex, Panthenol', 'Apply evenly after serum.', 'Patch test recommended.', 'India', true, true, 'brand_new', 'skin1004-madagascar-centella-soothing-cream-30-ml'),
  ('SKIN1004 Madagascar Centella Ampoule Kit (120 ml)', 'beauty-personal-care', 'skincare', 'skin-care-kits', 'SKIN1004', 2999.00, 2999.00, 25, 'Includes 4 ampoules; Travel-friendly kit; Hydrating and calming formulas.', 'Multi-ampoule skincare set with soothing and brightening care.', 'MKV-SKIN-0017', 'Complete ampoule kit for hydration, calming and brightening.', 'Type: Serum Kit | Size: 120 ml', 350.00, 22.00, 18.00, 6.00, 'SKIN1004 Co., Ltd.', 'South Korea', 'Centella Extract, Niacinamide, Tea Tree', 'Use ampoules after toner.', 'Store in cool dry place.', 'India', true, true, 'brand_new', 'skin1004-madagascar-centella-ampoule-kit-120-ml'),
  ('SKIN1004 Centella Double Cleansing Duo Set', 'beauty-personal-care', 'skincare', 'face-wash', 'SKIN1004', 2499.00, 2499.00, 25, 'Removes makeup; Deep cleanses pores; Gentle daily cleanser.', 'Korean cleansing duo with cleansing oil and ampoule foam.', 'MKV-SKIN-0018', 'Double cleansing skincare combo for clean and refreshed skin.', 'Type: Gift Set | Includes Oil & Foam', 450.00, 22.00, 15.00, 7.00, 'SKIN1004 Co., Ltd.', 'South Korea', 'Centella Extract, Plant Oils, Mild Cleansers', 'Use cleansing oil followed by foam cleanser.', 'Avoid eye contact.', 'India', true, true, 'brand_new', 'skin1004-centella-double-cleansing-duo-set'),
  ('SKIN1004 Madagascar Centella Glow 1004 Duo Set', 'beauty-personal-care', 'skincare', 'serums', 'SKIN1004', 2799.00, 2799.00, 25, 'Brightening care; Hydrating serum; Lightweight texture.', 'Glow-enhancing skincare duo for hydration and radiance.', 'MKV-SKIN-0019', 'Radiance-boosting Korean skincare duo set.', 'Type: Duo Set | Skin Type: All', 300.00, 20.00, 14.00, 6.00, 'SKIN1004 Co., Ltd.', 'South Korea', 'Centella Extract, Probiotics, Hyaluronic Acid', 'Apply serum before moisturizer.', 'External use only.', 'India', true, true, 'brand_new', 'skin1004-madagascar-centella-glow-1004-duo-set'),
  ('SKIN1004 Madagascar Centella Soothing Cream (75 ml)', 'beauty-personal-care', 'skincare', 'face-creams', 'SKIN1004', 1999.00, 1999.00, 25, 'Deep hydration; Soothes skin; Supports skin barrier.', 'Barrier-strengthening soothing cream with ceramide complex.', 'MKV-SKIN-0020', 'Moisturizing cream for dry and sensitive skin.', 'Type: Soothing Cream | Size: 75 ml', 160.00, 16.00, 6.00, 5.00, 'SKIN1004 Co., Ltd.', 'South Korea', 'Centella Extract, Ceramides, Panthenol', 'Apply after serum.', 'Store away from sunlight.', 'India', true, true, 'brand_new', 'skin1004-madagascar-centella-soothing-cream-75-ml'),
  ('SKIN1004 Centella Watergel Sheet Mask (25 ml x 5)', 'beauty-personal-care', 'skincare', 'face-creams', 'SKIN1004', 999.00, 999.00, 25, 'Soothes irritation; Deep hydration; Cooling effect; Sensitive skin friendly.', 'Hydrating sheet mask with chamomile and glycerin.', 'MKV-SKIN-0021', 'Refreshing Korean sheet mask set for calming care.', 'Type: Sheet Mask | Qty: 5', 180.00, 20.00, 15.00, 3.00, 'SKIN1004 Co., Ltd.', 'South Korea', 'Centella Extract, Chamomile, Glycerin', 'Leave mask on for 15-20 minutes.', 'Single use only.', 'India', true, true, 'brand_new', 'skin1004-centella-watergel-sheet-mask-25-ml-x-5'),
  ('SKIN1004 Hyalu-Cica Water-Fit Sun Serum SPF50+ PA++++ (50 ml)', 'beauty-personal-care', 'skincare', 'sunscreen', 'SKIN1004', 1499.00, 1499.00, 25, 'Broad-spectrum protection; Lightweight serum texture; No white cast.', 'Hydrating Korean sunscreen with hyaluronic acid and Centella.', 'MKV-SKIN-0022', 'Daily sunscreen with hydration and UV protection.', 'Type: Sunscreen | SPF50+ PA++++', 90.00, 15.00, 5.00, 4.00, 'SKIN1004 Co., Ltd.', 'South Korea', 'Centella Extract, Hyaluronic Acid, UV Filters', 'Apply before sun exposure.', 'Reapply every 2-3 hours.', 'India', true, true, 'brand_new', 'skin1004-hyalu-cica-water-fit-sun-serum-spf50-pa-50-ml'),
  ('SKIN1004 Madagascar Centella Poremizing Clear Toner (210 ml)', 'beauty-personal-care', 'skincare', 'toners', 'SKIN1004', 1799.00, 1799.00, 25, 'Balances sebum; Refreshing texture; Hydrating formula.', 'Oil-control toner with pore-minimizing care.', 'MKV-SKIN-0023', 'Gentle toner for smoother and refined pores.', 'Type: Toner | Size: 210 ml', 260.00, 18.00, 6.00, 6.00, 'SKIN1004 Co., Ltd.', 'South Korea', 'Centella Extract, Pink Salt, Niacinamide', 'Use after cleansing.', 'Avoid direct eye contact.', 'India', true, true, 'brand_new', 'skin1004-madagascar-centella-poremizing-clear-toner-210-ml'),
  ('SKIN1004 Madagascar Centella Tea-Trica Relief Ampoule', 'beauty-personal-care', 'skincare', 'serums', 'SKIN1004', 1699.00, 1699.00, 25, 'Controls excess oil; Hydrates skin; Lightweight serum.', 'Tea tree ampoule for soothing acne-prone skin.', 'MKV-SKIN-0024', 'Calming ampoule for sensitive and acne-prone skin.', 'Type: Ampoule | Skin Type: Oily/Acne-prone', 120.00, 12.00, 5.00, 5.00, 'SKIN1004 Co., Ltd.', 'South Korea', 'Tea Tree, Centella Extract, Panthenol', 'Apply after toner.', 'Patch test before use.', 'India', true, true, 'brand_new', 'skin1004-madagascar-centella-tea-trica-relief-ampoule'),
  ('SKIN1004 Tea-Trica Purifying Toner (210 ml)', 'beauty-personal-care', 'skincare', 'toners', 'SKIN1004', 1799.00, 1799.00, 25, 'Purifies pores; Soothes irritation; Controls oil.', 'Acne care toner with Tea Tree and Centella.', 'MKV-SKIN-0025', 'Refreshing toner designed for acne-prone skin.', 'Type: Toner | Size: 210 ml', 260.00, 18.00, 6.00, 6.00, 'SKIN1004 Co., Ltd.', 'South Korea', 'Tea Tree, Centella Extract, Salicylic Acid', 'Apply using cotton pad.', 'For external use only.', 'India', true, true, 'brand_new', 'skin1004-tea-trica-purifying-toner-210-ml'),
  ('SKIN1004 Madagascar Centella Hyalu-Cica Brightening Toner', 'beauty-personal-care', 'skincare', 'toners', 'SKIN1004', 1899.00, 1899.00, 25, 'Brightens skin; Refreshes and hydrates; Lightweight daily toner.', 'Hydrating toner with Hyaluronic Acid, Cica and Niacinamide.', 'MKV-SKIN-0026', 'Hydrating Korean toner for glowing skin.', '210 ml | Suitable for all skin types', 300.00, 18.00, 6.00, 6.00, 'SKIN1004 Co., Ltd.', 'South Korea', 'Centella Asiatica, Hyaluronic Acid, Niacinamide', 'Apply after cleansing using cotton pad or palms.', 'Patch test recommended before use.', 'India', true, true, 'brand_new', 'skin1004-madagascar-centella-hyalu-cica-brightening-toner'),
  ('SKIN1004 Centella Tone Brightening Boosting Toner', 'beauty-personal-care', 'skincare', 'toners', 'SKIN1004', 1999.00, 1999.00, 25, 'Helps brighten dull skin; Smoothens texture; Gentle exfoliation.', 'Mild exfoliating toner with Niacinamide & Madecassoside.', 'MKV-SKIN-0027', 'Brightening toner suitable for sensitive skin.', '210 ml | Alcohol-free formula', 320.00, 18.00, 6.00, 6.00, 'SKIN1004 Co., Ltd.', 'South Korea', 'Niacinamide, Madecassoside, Centella Extract', 'Use after cleansing before serum.', 'Avoid contact with eyes.', 'India', true, true, 'brand_new', 'skin1004-centella-tone-brightening-boosting-toner'),
  ('SKIN1004 Madagascar Centella Probio-Cica Essence Toner', 'beauty-personal-care', 'skincare', 'toners', 'SKIN1004', 2299.00, 2299.00, 25, 'Deep hydration; Calms irritated skin; Supports skin barrier.', 'Nourishing calming toner with fermented Centella.', 'MKV-SKIN-0028', 'Rich essence toner for dry and sensitive skin.', '210 ml | Barrier care toner', 330.00, 18.00, 6.00, 6.00, 'SKIN1004 Co., Ltd.', 'South Korea', 'Fermented Centella, Ceramides, Probiotics', 'Apply evenly after cleansing.', 'Store in cool dry place.', 'India', true, true, 'brand_new', 'skin1004-madagascar-centella-probio-cica-essence-toner'),
  ('SKIN1004 Centella Probio-Cica Intensive Ampoule', 'beauty-personal-care', 'skincare', 'serums', 'SKIN1004', 2499.00, 2499.00, 25, 'Strengthens skin barrier; Deep moisturization; Soothes skin.', 'Barrier repair ampoule with fermented Centella & Ceramides.', 'MKV-SKIN-0029', 'Intensive ampoule for dry to combination skin.', '50 ml | Dropper bottle', 140.00, 12.00, 5.00, 5.00, 'SKIN1004 Co., Ltd.', 'South Korea', 'Centella Ferment, Ceramides, Panthenol', 'Apply few drops before moisturizer.', 'For external use only.', 'India', true, true, 'brand_new', 'skin1004-centella-probio-cica-intensive-ampoule'),
  ('SKIN1004 Hyalu-CICA Blue Serum', 'beauty-personal-care', 'skincare', 'serums', 'SKIN1004', 2199.00, 2199.00, 25, 'Boosts hydration; Refreshes skin; Lightweight texture.', 'Hydrating serum with Hyaluronic Acid and Cica.', 'MKV-SKIN-0030', 'Blue serum for glowing and healthy skin.', '50 ml | Suitable for all skin types', 150.00, 12.00, 5.00, 5.00, 'SKIN1004 Co., Ltd.', 'South Korea', 'Hyaluronic Acid, Centella Extract, Niacinamide', 'Apply after toner and before cream.', 'Use sunscreen during daytime.', 'India', true, true, 'brand_new', 'skin1004-hyalu-cica-blue-serum'),
  ('Beauty of Joseon Relief Sun Aqua-fresh Rice + B5 SPF50+ PA++++', 'beauty-personal-care', 'skincare', 'sunscreen', 'Beauty of Joseon', 1499.00, 1499.00, 25, 'Broad-spectrum protection; Lightweight finish; No white cast.', 'Moisturizing Korean sunscreen with Rice extract and Vitamin B5.', 'MKV-SKIN-0031', 'Hydrating sunscreen suitable for daily use.', '50 ml | SPF50+ PA++++', 100.00, 15.00, 5.00, 4.00, 'Beauty of Joseon', 'South Korea', 'Rice Extract, Panthenol, UV Filters', 'Apply generously before sun exposure.', 'Reapply every 2-3 hours.', 'India', true, true, 'brand_new', 'beauty-of-joseon-relief-sun-aqua-fresh-rice-b5-spf50-pa'),
  ('Beauty of Joseon Matte Sunstick Mugwort + Camelia', 'beauty-personal-care', 'skincare', 'serums', 'Beauty of Joseon', 1275.00, 1275.00, 25, 'Controls excess oil; Easy reapplication; Smooth matte finish.', 'Portable matte sunscreen stick for oily skin.', 'MKV-SKIN-0032', 'Convenient SPF stick for outdoor use.', '18 gm | SPF50+ PA++++', 80.00, 10.00, 4.00, 3.00, 'Beauty of Joseon', 'South Korea', 'Mugwort, Camelia, UV Filters', 'Apply directly on face and neck.', 'Do not store in direct heat.', 'India', true, true, 'brand_new', 'beauty-of-joseon-matte-sunstick-mugwort-camelia'),
  ('Beauty of Joseon Revive Serum: Ginseng + Snail Mucin', 'beauty-personal-care', 'skincare', 'serums', 'Beauty of Joseon', 1599.00, 1599.00, 25, 'Improves skin elasticity; Hydrates deeply; Gives healthy glow.', 'Revitalizing serum with Ginseng and Snail Mucin.', 'MKV-SKIN-0033', 'Korean serum for anti-aging and nourishment.', '30 ml | Dropper serum', 110.00, 11.00, 5.00, 5.00, 'Beauty of Joseon', 'South Korea', 'Ginseng Root Water, Snail Secretion Filtrate', 'Apply after toner.', 'Patch test before use.', 'India', true, true, 'brand_new', 'beauty-of-joseon-revive-serum-ginseng-snail-mucin'),
  ('Dot & Key Pomegranate Retinol + Caffeine Eye Cream', 'beauty-personal-care', 'skincare', 'face-creams', 'Dot & Key', 695.00, 695.00, 25, 'Boosts collagen; Reduces fine lines; Restores moisture.', 'Eye cream for dark circles and puffiness.', 'MKV-SKIN-0034', 'Brightening eye cream with Retinol and Caffeine.', '20 ml | Fragrance-free', 70.00, 12.00, 4.00, 3.00, 'Dot & Key Wellness Pvt Ltd.', 'India', 'Retinol, Caffeine, Pomegranate Extract', 'Apply small amount around eyes at night.', 'Use sunscreen during daytime.', 'India', true, true, 'brand_new', 'dot-key-pomegranate-retinol-caffeine-eye-cream'),
  ('Cosrx Advanced Snail 96 Mucin Power Essence', 'beauty-personal-care', 'skincare', 'serums', 'Cosrx', 1450.00, 1450.00, 25, 'Improves skin texture; Deep hydration; Lightweight essence.', 'Snail mucin essence for hydration and skin repair.', 'MKV-SKIN-0035', 'Popular Korean essence for glowing skin.', '100 ml | Pump bottle', 180.00, 16.00, 5.00, 5.00, 'COSRX Inc.', 'South Korea', '96% Snail Secretion Filtrate', 'Apply after toner and before moisturizer.', 'Avoid using on broken skin.', 'India', true, true, 'brand_new', 'cosrx-advanced-snail-96-mucin-power-essence'),
  ('Cosrx Advanced Snail 92 All In One Cream (100 ml)', 'beauty-personal-care', 'skincare', 'face-creams', 'COSRX', 1450.00, 1450.00, 25, 'Lightweight gel cream with 92% snail mucin that deeply moisturizes, repairs damaged skin barrier, and improves skin texture.', 'Nourishing snail mucin cream for hydration and skin repair.', 'MKV-SKIN-0036', 'Hydrating, soothing, skin-repairing, lightweight formula', '100 ml', 150.00, 8.00, 8.00, 6.00, 'COSRX Inc.', 'South Korea', 'Snail Secretion Filtrate, Hyaluronic Acid, Panthenol', 'Apply after serum as the final moisturizer step.', 'Patch test recommended before use.', 'India', true, true, 'brand_new', 'cosrx-advanced-snail-92-all-in-one-cream-100-ml'),
  ('COSRX Aloe Soothing Sun Cream SPF50 PA+++', 'beauty-personal-care', 'skincare', 'sunscreen', 'COSRX', 950.00, 950.00, 25, 'Broad-spectrum sunscreen that protects skin from harmful UV rays while keeping skin hydrated and soothed.', 'Moisturizing sunscreen with Aloe Vera protection.', 'MKV-SKIN-0037', 'SPF50 PA+++, non-sticky, moisturizing finish', '50 ml', 100.00, 14.00, 5.00, 4.00, 'COSRX Inc.', 'South Korea', 'Aloe Vera Leaf Extract, UV Filters, Glycerin', 'Apply generously before sun exposure. Reapply every 2-3 hours.', 'Avoid direct contact with eyes.', 'India', true, true, 'brand_new', 'cosrx-aloe-soothing-sun-cream-spf50-pa'),
  ('Cosrx AHA/BHA Clarifying Treatment Toner', 'beauty-personal-care', 'skincare', 'toners', 'COSRX', 1250.00, 1250.00, 25, 'Daily exfoliating toner formulated with AHA and BHA to remove dead skin cells, unclog pores, and improve skin texture.', 'Gentle exfoliating toner for clearer skin.', 'MKV-SKIN-0038', 'Mild exfoliation, pore care, smoother skin texture', '150 ml', 180.00, 16.00, 5.00, 5.00, 'COSRX Inc.', 'South Korea', 'AHA, BHA, Mineral Water, Panthenol', 'Spray onto cotton pad and gently wipe over cleansed face.', 'Use sunscreen during daytime while using exfoliants.', 'India', true, true, 'brand_new', 'cosrx-aha-bha-clarifying-treatment-toner'),
  ('Bare Anatomy Expert Anti-Dandruff Shampoo', 'beauty-personal-care', 'skincare', 'serums', 'Bare Anatomy', 249.00, 249.00, 25, '• Helps gently cleanse hair and scalp
• Suitable for daily or regular use
• Supports smoother softer hair texture
• Helps improve manageability and shine
• Lightweight and non-heavy formula
• Helps maintain scalp freshness
• Nourishes dry rough hair strands
• Helps reduce visible frizz and dullness
• Suitable for multiple hair types
• Designed for healthier-looking hair
• Helps strengthen weak hair strands
• Comfortable easy-rinse formula
• Suitable for men and women
• Supports clean refreshed scalp feel
• Improves overall hair appearance', 'Bare Anatomy Expert Anti-Dandruff Shampoo is specially formulated to help improve overall hair health while targeting concerns like dandruff, oily scalp, dry flakes. The lightweight formula gently cleanses hair and scalp without stripping natural moisture, leaving hair soft, smooth, refreshed and manageable after every wash. Suitable for regular use by men and women and designed for healthier-looking, nourished and shinier hair.', 'MKV-SKIN-0039', 'Bare Anatomy Expert Anti-Dandruff Shampoo helps improve hair texture and overall manageability with its nourishing and lightweight care formula. Enriched with ingredients like Salicylic Acid, Biotin, Rosemary, it helps cleanse, hydrate and refresh the scalp and hair without making it feel heavy. The formula supports softer smoother hair, helps reduce dryness, frizz or buildup depending on hair concern and leaves hair looking shinier, healthier and easier to manage with regular use. Suitable for all hair types.', 'Form: Liquid / Cream
Concern: Dandruff, Oily Scalp, Dry Flakes
Texture: Smooth Lightweight Formula
Hair Type: All Hair Types
Product Type: Shampoo
Size: 100 ml', 200.00, 0.00, 0.00, 0.00, 'Bare Anatomy', 'India', 'Salicylic Acid, Biotin, Rosemary
Aqua (Water)
Glycerin
Mild Cleansing Agents
Plant Proteins
Conditioning Base
Fragrance', 'Apply on wet hair, massage gently into scalp and hair, leave for 1-2 minutes and rinse thoroughly. Repeat if required.', 'For external use only. Avoid direct contact with eyes. Store in a cool and dry place away from direct sunlight.', 'India', true, true, 'brand_new', 'bare-anatomy-expert-anti-dandruff-shampoo'),
  ('Bare Anatomy Anti-Hair Fall Shampoo', 'beauty-personal-care', 'skincare', 'serums', 'Bare Anatomy', 249.00, 249.00, 25, '• Helps gently cleanse hair and scalp
• Suitable for daily or regular use
• Supports smoother softer hair texture
• Helps improve manageability and shine
• Lightweight and non-heavy formula
• Helps maintain scalp freshness
• Nourishes dry rough hair strands
• Helps reduce visible frizz and dullness
• Suitable for multiple hair types
• Designed for healthier-looking hair
• Helps strengthen weak hair strands
• Comfortable easy-rinse formula
• Suitable for men and women
• Supports clean refreshed scalp feel
• Improves overall hair appearance', 'Bare Anatomy Anti-Hair Fall Shampoo is specially formulated to help improve overall hair health while targeting concerns like hair fall, weak hair. The lightweight formula gently cleanses hair and scalp without stripping natural moisture, leaving hair soft, smooth, refreshed and manageable after every wash. Suitable for regular use by men and women and designed for healthier-looking, nourished and shinier hair.', 'MKV-SKIN-0040', 'Bare Anatomy Anti-Hair Fall Shampoo helps improve hair texture and overall manageability with its nourishing and lightweight care formula. Enriched with ingredients like Biotin, Keratin, Caffeine, it helps cleanse, hydrate and refresh the scalp and hair without making it feel heavy. The formula supports softer smoother hair, helps reduce dryness, frizz or buildup depending on hair concern and leaves hair looking shinier, healthier and easier to manage with regular use. Suitable for all hair types.', 'Form: Liquid / Cream
Concern: Hair Fall, Weak Hair
Texture: Smooth Lightweight Formula
Hair Type: All Hair Types
Product Type: Shampoo
Size: 100 ml', 200.00, 0.00, 0.00, 0.00, 'Bare Anatomy', 'India', 'Biotin, Keratin, Caffeine
Aqua (Water)
Glycerin
Mild Cleansing Agents
Plant Proteins
Conditioning Base
Fragrance', 'Apply on wet hair, massage gently into scalp and hair, leave for 1-2 minutes and rinse thoroughly. Repeat if required.', 'For external use only. Avoid direct contact with eyes. Store in a cool and dry place away from direct sunlight.', 'India', true, true, 'brand_new', 'bare-anatomy-anti-hair-fall-shampoo'),
  ('Bare Anatomy Ultra Smoothing Shampoo', 'beauty-personal-care', 'skincare', 'serums', 'Bare Anatomy', 299.00, 299.00, 25, '• Helps gently cleanse hair and scalp
• Suitable for daily or regular use
• Supports smoother softer hair texture
• Helps improve manageability and shine
• Lightweight and non-heavy formula
• Helps maintain scalp freshness
• Nourishes dry rough hair strands
• Helps reduce visible frizz and dullness
• Suitable for multiple hair types
• Designed for healthier-looking hair
• Helps strengthen weak hair strands
• Comfortable easy-rinse formula
• Suitable for men and women
• Supports clean refreshed scalp feel
• Improves overall hair appearance', 'Bare Anatomy Ultra Smoothing Shampoo is specially formulated to help improve overall hair health while targeting concerns like dry & frizzy hair. The lightweight formula gently cleanses hair and scalp without stripping natural moisture, leaving hair soft, smooth, refreshed and manageable after every wash. Suitable for regular use by men and women and designed for healthier-looking, nourished and shinier hair.', 'MKV-SKIN-0041', 'Bare Anatomy Ultra Smoothing Shampoo helps improve hair texture and overall manageability with its nourishing and lightweight care formula. Enriched with ingredients like Hyaluronic Acid, Argan Oil, it helps cleanse, hydrate and refresh the scalp and hair without making it feel heavy. The formula supports softer smoother hair, helps reduce dryness, frizz or buildup depending on hair concern and leaves hair looking shinier, healthier and easier to manage with regular use. Suitable for all hair types.', 'Form: Liquid / Cream
Concern: Dry & Frizzy Hair
Texture: Smooth Lightweight Formula
Hair Type: All Hair Types
Product Type: Shampoo
Size: 100 ml', 200.00, 0.00, 0.00, 0.00, 'Bare Anatomy', 'India', 'Hyaluronic Acid, Argan Oil
Aqua (Water)
Glycerin
Mild Cleansing Agents
Plant Proteins
Conditioning Base
Fragrance', 'Apply on wet hair, massage gently into scalp and hair, leave for 1-2 minutes and rinse thoroughly. Repeat if required.', 'For external use only. Avoid direct contact with eyes. Store in a cool and dry place away from direct sunlight.', 'India', true, true, 'brand_new', 'bare-anatomy-ultra-smoothing-shampoo'),
  ('Bare Anatomy Damage Repair Shampoo', 'beauty-personal-care', 'skincare', 'serums', 'Bare Anatomy', 499.00, 499.00, 25, '• Helps gently cleanse hair and scalp
• Suitable for daily or regular use
• Supports smoother softer hair texture
• Helps improve manageability and shine
• Lightweight and non-heavy formula
• Helps maintain scalp freshness
• Nourishes dry rough hair strands
• Helps reduce visible frizz and dullness
• Suitable for multiple hair types
• Designed for healthier-looking hair
• Helps strengthen weak hair strands
• Comfortable easy-rinse formula
• Suitable for men and women
• Supports clean refreshed scalp feel
• Improves overall hair appearance', 'Bare Anatomy Damage Repair Shampoo is specially formulated to help improve overall hair health while targeting concerns like damaged hair. The lightweight formula gently cleanses hair and scalp without stripping natural moisture, leaving hair soft, smooth, refreshed and manageable after every wash. Suitable for regular use by men and women and designed for healthier-looking, nourished and shinier hair.', 'MKV-SKIN-0042', 'Bare Anatomy Damage Repair Shampoo helps improve hair texture and overall manageability with its nourishing and lightweight care formula. Enriched with ingredients like Coconut Milk, Plant Proteins, it helps cleanse, hydrate and refresh the scalp and hair without making it feel heavy. The formula supports softer smoother hair, helps reduce dryness, frizz or buildup depending on hair concern and leaves hair looking shinier, healthier and easier to manage with regular use. Suitable for all hair types.', 'Form: Liquid / Cream
Concern: Damaged Hair
Texture: Smooth Lightweight Formula
Hair Type: All Hair Types
Product Type: Shampoo
Size: 250 ml', 200.00, 0.00, 0.00, 0.00, 'Bare Anatomy', 'India', 'Coconut Milk, Plant Proteins
Aqua (Water)
Glycerin
Mild Cleansing Agents
Plant Proteins
Conditioning Base
Fragrance', 'Apply on wet hair, massage gently into scalp and hair, leave for 1-2 minutes and rinse thoroughly. Repeat if required.', 'For external use only. Avoid direct contact with eyes. Store in a cool and dry place away from direct sunlight.', 'India', true, true, 'brand_new', 'bare-anatomy-damage-repair-shampoo'),
  ('Bare Anatomy NatureXScience Rosemary & Coconut Milk Hydrating Shampoo', 'beauty-personal-care', 'skincare', 'serums', 'Bare Anatomy', 545.00, 545.00, 25, '• Helps gently cleanse hair and scalp
• Suitable for daily or regular use
• Supports smoother softer hair texture
• Helps improve manageability and shine
• Lightweight and non-heavy formula
• Helps maintain scalp freshness
• Nourishes dry rough hair strands
• Helps reduce visible frizz and dullness
• Suitable for multiple hair types
• Designed for healthier-looking hair
• Helps strengthen weak hair strands
• Comfortable easy-rinse formula
• Suitable for men and women
• Supports clean refreshed scalp feel
• Improves overall hair appearance', 'Bare Anatomy NatureXScience Rosemary & Coconut Milk Hydrating Shampoo is specially formulated to help improve overall hair health while targeting concerns like dry hair, dullness. The lightweight formula gently cleanses hair and scalp without stripping natural moisture, leaving hair soft, smooth, refreshed and manageable after every wash. Suitable for regular use by men and women and designed for healthier-looking, nourished and shinier hair.', 'MKV-SKIN-0043', 'Bare Anatomy NatureXScience Rosemary & Coconut Milk Hydrating Shampoo helps improve hair texture and overall manageability with its nourishing and lightweight care formula. Enriched with ingredients like Rosemary, Coconut Milk, it helps cleanse, hydrate and refresh the scalp and hair without making it feel heavy. The formula supports softer smoother hair, helps reduce dryness, frizz or buildup depending on hair concern and leaves hair looking shinier, healthier and easier to manage with regular use. Suitable for all hair types.', 'Form: Liquid / Cream
Concern: Dry Hair, Dullness
Texture: Smooth Lightweight Formula
Hair Type: All Hair Types
Product Type: Shampoo
Size: 200 ml', 200.00, 0.00, 0.00, 0.00, 'Bare Anatomy', 'India', 'Rosemary, Coconut Milk
Aqua (Water)
Glycerin
Mild Cleansing Agents
Plant Proteins
Conditioning Base
Fragrance', 'Apply on wet hair, massage gently into scalp and hair, leave for 1-2 minutes and rinse thoroughly. Repeat if required.', 'For external use only. Avoid direct contact with eyes. Store in a cool and dry place away from direct sunlight.', 'India', true, true, 'brand_new', 'bare-anatomy-naturexscience-rosemary-coconut-milk-hydrating-shampoo'),
  ('Bare Anatomy Oil Control Shampoo', 'beauty-personal-care', 'skincare', 'serums', 'Bare Anatomy', 499.00, 499.00, 25, '• Helps gently cleanse hair and scalp
• Suitable for daily or regular use
• Supports smoother softer hair texture
• Helps improve manageability and shine
• Lightweight and non-heavy formula
• Helps maintain scalp freshness
• Nourishes dry rough hair strands
• Helps reduce visible frizz and dullness
• Suitable for multiple hair types
• Designed for healthier-looking hair
• Helps strengthen weak hair strands
• Comfortable easy-rinse formula
• Suitable for men and women
• Supports clean refreshed scalp feel
• Improves overall hair appearance', 'Bare Anatomy Oil Control Shampoo is specially formulated to help improve overall hair health while targeting concerns like oily scalp, excess oil. The lightweight formula gently cleanses hair and scalp without stripping natural moisture, leaving hair soft, smooth, refreshed and manageable after every wash. Suitable for regular use by men and women and designed for healthier-looking, nourished and shinier hair.', 'MKV-SKIN-0044', 'Bare Anatomy Oil Control Shampoo helps improve hair texture and overall manageability with its nourishing and lightweight care formula. Enriched with ingredients like Salicylic Acid, Tea Tree, Hyaluronic Acid, it helps cleanse, hydrate and refresh the scalp and hair without making it feel heavy. The formula supports softer smoother hair, helps reduce dryness, frizz or buildup depending on hair concern and leaves hair looking shinier, healthier and easier to manage with regular use. Suitable for all hair types.', 'Form: Liquid / Cream
Concern: Oily Scalp, Excess Oil
Texture: Smooth Lightweight Formula
Hair Type: All Hair Types
Product Type: Shampoo
Size: 236 ml', 200.00, 0.00, 0.00, 0.00, 'Bare Anatomy', 'India', 'Salicylic Acid, Tea Tree, Hyaluronic Acid
Aqua (Water)
Glycerin
Mild Cleansing Agents
Plant Proteins
Conditioning Base
Fragrance', 'Apply on wet hair, massage gently into scalp and hair, leave for 1-2 minutes and rinse thoroughly. Repeat if required.', 'For external use only. Avoid direct contact with eyes. Store in a cool and dry place away from direct sunlight.', 'India', true, true, 'brand_new', 'bare-anatomy-oil-control-shampoo'),
  ('Bare Anatomy Curl Defining Shampoo', 'beauty-personal-care', 'skincare', 'serums', 'Bare Anatomy', 499.00, 499.00, 25, '• Helps gently cleanse hair and scalp
• Suitable for daily or regular use
• Supports smoother softer hair texture
• Helps improve manageability and shine
• Lightweight and non-heavy formula
• Helps maintain scalp freshness
• Nourishes dry rough hair strands
• Helps reduce visible frizz and dullness
• Suitable for multiple hair types
• Designed for healthier-looking hair
• Helps strengthen weak hair strands
• Comfortable easy-rinse formula
• Suitable for men and women
• Supports clean refreshed scalp feel
• Improves overall hair appearance', 'Bare Anatomy Curl Defining Shampoo is specially formulated to help improve overall hair health while targeting concerns like curly hair, frizz. The lightweight formula gently cleanses hair and scalp without stripping natural moisture, leaving hair soft, smooth, refreshed and manageable after every wash. Suitable for regular use by men and women and designed for healthier-looking, nourished and shinier hair.', 'MKV-SKIN-0045', 'Bare Anatomy Curl Defining Shampoo helps improve hair texture and overall manageability with its nourishing and lightweight care formula. Enriched with ingredients like Curl Enhancers, Plant Oils, it helps cleanse, hydrate and refresh the scalp and hair without making it feel heavy. The formula supports softer smoother hair, helps reduce dryness, frizz or buildup depending on hair concern and leaves hair looking shinier, healthier and easier to manage with regular use. Suitable for all hair types.', 'Form: Liquid / Cream
Concern: Curly Hair, Frizz
Texture: Smooth Lightweight Formula
Hair Type: All Hair Types
Product Type: Shampoo
Size: 250 ml', 200.00, 0.00, 0.00, 0.00, 'Bare Anatomy', 'India', 'Curl Enhancers, Plant Oils
Aqua (Water)
Glycerin
Mild Cleansing Agents
Plant Proteins
Conditioning Base
Fragrance', 'Apply on wet hair, massage gently into scalp and hair, leave for 1-2 minutes and rinse thoroughly. Repeat if required.', 'For external use only. Avoid direct contact with eyes. Store in a cool and dry place away from direct sunlight.', 'India', true, true, 'brand_new', 'bare-anatomy-curl-defining-shampoo'),
  ('Bare Anatomy Anti Frizz Shampoo', 'beauty-personal-care', 'skincare', 'serums', 'Bare Anatomy', 499.00, 499.00, 25, '• Helps gently cleanse hair and scalp
• Suitable for daily or regular use
• Supports smoother softer hair texture
• Helps improve manageability and shine
• Lightweight and non-heavy formula
• Helps maintain scalp freshness
• Nourishes dry rough hair strands
• Helps reduce visible frizz and dullness
• Suitable for multiple hair types
• Designed for healthier-looking hair
• Helps strengthen weak hair strands
• Comfortable easy-rinse formula
• Suitable for men and women
• Supports clean refreshed scalp feel
• Improves overall hair appearance', 'Bare Anatomy Anti Frizz Shampoo is specially formulated to help improve overall hair health while targeting concerns like frizz, rough hair. The lightweight formula gently cleanses hair and scalp without stripping natural moisture, leaving hair soft, smooth, refreshed and manageable after every wash. Suitable for regular use by men and women and designed for healthier-looking, nourished and shinier hair.', 'MKV-SKIN-0046', 'Bare Anatomy Anti Frizz Shampoo helps improve hair texture and overall manageability with its nourishing and lightweight care formula. Enriched with ingredients like Hyaluronic Acid, Argan Oil, it helps cleanse, hydrate and refresh the scalp and hair without making it feel heavy. The formula supports softer smoother hair, helps reduce dryness, frizz or buildup depending on hair concern and leaves hair looking shinier, healthier and easier to manage with regular use. Suitable for all hair types.', 'Form: Liquid / Cream
Concern: Frizz, Rough Hair
Texture: Smooth Lightweight Formula
Hair Type: All Hair Types
Product Type: Shampoo
Size: 250 ml', 200.00, 0.00, 0.00, 0.00, 'Bare Anatomy', 'India', 'Hyaluronic Acid, Argan Oil
Aqua (Water)
Glycerin
Mild Cleansing Agents
Plant Proteins
Conditioning Base
Fragrance', 'Apply on wet hair, massage gently into scalp and hair, leave for 1-2 minutes and rinse thoroughly. Repeat if required.', 'For external use only. Avoid direct contact with eyes. Store in a cool and dry place away from direct sunlight.', 'India', true, true, 'brand_new', 'bare-anatomy-anti-frizz-shampoo'),
  ('Bare Anatomy Anti-Frizz Leave In Conditioner', 'beauty-personal-care', 'skincare', 'serums', 'Bare Anatomy', 399.00, 399.00, 25, '• Helps gently cleanse hair and scalp
• Suitable for daily or regular use
• Supports smoother softer hair texture
• Helps improve manageability and shine
• Lightweight and non-heavy formula
• Helps maintain scalp freshness
• Nourishes dry rough hair strands
• Helps reduce visible frizz and dullness
• Suitable for multiple hair types
• Designed for healthier-looking hair
• Helps strengthen weak hair strands
• Comfortable easy-rinse formula
• Suitable for men and women
• Supports clean refreshed scalp feel
• Improves overall hair appearance', 'Bare Anatomy Anti-Frizz Leave In Conditioner is specially formulated to help improve overall hair health while targeting concerns like frizz, dry hair. The lightweight formula gently cleanses hair and scalp without stripping natural moisture, leaving hair soft, smooth, refreshed and manageable after every wash. Suitable for regular use by men and women and designed for healthier-looking, nourished and shinier hair.', 'MKV-SKIN-0047', 'Bare Anatomy Anti-Frizz Leave In Conditioner helps improve hair texture and overall manageability with its nourishing and lightweight care formula. Enriched with ingredients like Hyaluronic Acid, Plant Proteins, it helps cleanse, hydrate and refresh the scalp and hair without making it feel heavy. The formula supports softer smoother hair, helps reduce dryness, frizz or buildup depending on hair concern and leaves hair looking shinier, healthier and easier to manage with regular use. Suitable for all hair types.', 'Form: Liquid / Cream
Concern: Frizz, Dry Hair
Texture: Smooth Lightweight Formula
Hair Type: All Hair Types
Product Type: Conditioner
Size: 150 ml', 200.00, 0.00, 0.00, 0.00, 'Bare Anatomy', 'India', 'Hyaluronic Acid, Plant Proteins
Aqua (Water)
Glycerin
Mild Cleansing Agents
Plant Proteins
Conditioning Base
Fragrance', 'Apply on wet hair, massage gently into scalp and hair, leave for 1-2 minutes and rinse thoroughly. Repeat if required.', 'For external use only. Avoid direct contact with eyes. Store in a cool and dry place away from direct sunlight.', 'India', true, true, 'brand_new', 'bare-anatomy-anti-frizz-leave-in-conditioner'),
  ('Bare Anatomy Nature X Science Rosemary & Coconut Milk Conditioner', 'beauty-personal-care', 'skincare', 'serums', 'Bare Anatomy', 399.00, 399.00, 25, '• Helps gently cleanse hair and scalp
• Suitable for daily or regular use
• Supports smoother softer hair texture
• Helps improve manageability and shine
• Lightweight and non-heavy formula
• Helps maintain scalp freshness
• Nourishes dry rough hair strands
• Helps reduce visible frizz and dullness
• Suitable for multiple hair types
• Designed for healthier-looking hair
• Helps strengthen weak hair strands
• Comfortable easy-rinse formula
• Suitable for men and women
• Supports clean refreshed scalp feel
• Improves overall hair appearance', 'Bare Anatomy Nature X Science Rosemary & Coconut Milk Conditioner is specially formulated to help improve overall hair health while targeting concerns like dry hair, roughness. The lightweight formula gently cleanses hair and scalp without stripping natural moisture, leaving hair soft, smooth, refreshed and manageable after every wash. Suitable for regular use by men and women and designed for healthier-looking, nourished and shinier hair.', 'MKV-SKIN-0048', 'Bare Anatomy Nature X Science Rosemary & Coconut Milk Conditioner helps improve hair texture and overall manageability with its nourishing and lightweight care formula. Enriched with ingredients like Rosemary, Coconut Milk, it helps cleanse, hydrate and refresh the scalp and hair without making it feel heavy. The formula supports softer smoother hair, helps reduce dryness, frizz or buildup depending on hair concern and leaves hair looking shinier, healthier and easier to manage with regular use. Suitable for all hair types.', 'Form: Liquid / Cream
Concern: Dry Hair, Roughness
Texture: Smooth Lightweight Formula
Hair Type: All Hair Types
Product Type: Conditioner
Size: 150 ml', 200.00, 0.00, 0.00, 0.00, 'Bare Anatomy', 'India', 'Rosemary, Coconut Milk
Aqua (Water)
Glycerin
Mild Cleansing Agents
Plant Proteins
Conditioning Base
Fragrance', 'Apply on wet hair, massage gently into scalp and hair, leave for 1-2 minutes and rinse thoroughly. Repeat if required.', 'For external use only. Avoid direct contact with eyes. Store in a cool and dry place away from direct sunlight.', 'India', true, true, 'brand_new', 'bare-anatomy-nature-x-science-rosemary-coconut-milk-conditioner'),
  ('Bare Anatomy Anti-Dandruff Hair Conditioner', 'beauty-personal-care', 'skincare', 'serums', 'Bare Anatomy', 449.00, 449.00, 25, '• Helps gently cleanse hair and scalp
• Suitable for daily or regular use
• Supports smoother softer hair texture
• Helps improve manageability and shine
• Lightweight and non-heavy formula
• Helps maintain scalp freshness
• Nourishes dry rough hair strands
• Helps reduce visible frizz and dullness
• Suitable for multiple hair types
• Designed for healthier-looking hair
• Helps strengthen weak hair strands
• Comfortable easy-rinse formula
• Suitable for men and women
• Supports clean refreshed scalp feel
• Improves overall hair appearance', 'Bare Anatomy Anti-Dandruff Hair Conditioner is specially formulated to help improve overall hair health while targeting concerns like flaky scalp, breakage. The lightweight formula gently cleanses hair and scalp without stripping natural moisture, leaving hair soft, smooth, refreshed and manageable after every wash. Suitable for regular use by men and women and designed for healthier-looking, nourished and shinier hair.', 'MKV-SKIN-0049', 'Bare Anatomy Anti-Dandruff Hair Conditioner helps improve hair texture and overall manageability with its nourishing and lightweight care formula. Enriched with ingredients like Biotin, Salicylic Acid, Rosemary, it helps cleanse, hydrate and refresh the scalp and hair without making it feel heavy. The formula supports softer smoother hair, helps reduce dryness, frizz or buildup depending on hair concern and leaves hair looking shinier, healthier and easier to manage with regular use. Suitable for all hair types.', 'Form: Liquid / Cream
Concern: Flaky Scalp, Breakage
Texture: Smooth Lightweight Formula
Hair Type: All Hair Types
Product Type: Conditioner
Size: 175 ml', 200.00, 0.00, 0.00, 0.00, 'Bare Anatomy', 'India', 'Biotin, Salicylic Acid, Rosemary
Aqua (Water)
Glycerin
Mild Cleansing Agents
Plant Proteins
Conditioning Base
Fragrance', 'Apply on wet hair, massage gently into scalp and hair, leave for 1-2 minutes and rinse thoroughly. Repeat if required.', 'For external use only. Avoid direct contact with eyes. Store in a cool and dry place away from direct sunlight.', 'India', true, true, 'brand_new', 'bare-anatomy-anti-dandruff-hair-conditioner'),
  ('Bare Anatomy Curl Intensifying Leave In Conditioner Cream', 'beauty-personal-care', 'skincare', 'face-creams', 'Bare Anatomy', 449.00, 449.00, 25, '• Helps gently cleanse hair and scalp
• Suitable for daily or regular use
• Supports smoother softer hair texture
• Helps improve manageability and shine
• Lightweight and non-heavy formula
• Helps maintain scalp freshness
• Nourishes dry rough hair strands
• Helps reduce visible frizz and dullness
• Suitable for multiple hair types
• Designed for healthier-looking hair
• Helps strengthen weak hair strands
• Comfortable easy-rinse formula
• Suitable for men and women
• Supports clean refreshed scalp feel
• Improves overall hair appearance', 'Bare Anatomy Curl Intensifying Leave In Conditioner Cream is specially formulated to help improve overall hair health while targeting concerns like curly hair, frizz. The lightweight formula gently cleanses hair and scalp without stripping natural moisture, leaving hair soft, smooth, refreshed and manageable after every wash. Suitable for regular use by men and women and designed for healthier-looking, nourished and shinier hair.', 'MKV-SKIN-0050', 'Bare Anatomy Curl Intensifying Leave In Conditioner Cream helps improve hair texture and overall manageability with its nourishing and lightweight care formula. Enriched with ingredients like Curl Defining Actives, Shea Butter, it helps cleanse, hydrate and refresh the scalp and hair without making it feel heavy. The formula supports softer smoother hair, helps reduce dryness, frizz or buildup depending on hair concern and leaves hair looking shinier, healthier and easier to manage with regular use. Suitable for all hair types.', 'Form: Liquid / Cream
Concern: Curly Hair, Frizz
Texture: Smooth Lightweight Formula
Hair Type: All Hair Types
Product Type: Conditioner
Size: 140 ml', 200.00, 0.00, 0.00, 0.00, 'Bare Anatomy', 'India', 'Curl Defining Actives, Shea Butter
Aqua (Water)
Glycerin
Mild Cleansing Agents
Plant Proteins
Conditioning Base
Fragrance', 'Apply on wet hair, massage gently into scalp and hair, leave for 1-2 minutes and rinse thoroughly. Repeat if required.', 'For external use only. Avoid direct contact with eyes. Store in a cool and dry place away from direct sunlight.', 'India', true, true, 'brand_new', 'bare-anatomy-curl-intensifying-leave-in-conditioner-cream')
),
prepared AS (
  SELECT
    'd4b2e915-7dce-4af8-b156-3845e7835c11'::uuid AS seller_id,
    i.name,
    i.description,
    i.short_description,
    c1.id AS category_id,
    c2.id AS sub_category_id,
    c3.id AS product_type_id,
    i.brand,
    i.sku,
    i.price::numeric(12,2) AS price,
    i.mrp::numeric(12,2) AS mrp,
    i.stock::integer AS stock,
    i.highlights_text,
    i.specifications_text,
    i.package_weight::numeric(12,2) AS package_weight,
    i.package_length::numeric(12,2) AS package_length,
    i.package_width::numeric(12,2) AS package_width,
    i.package_height::numeric(12,2) AS package_height,
    i.manufacturer_name,
    i.manufacturer_country,
    i.ingredients,
    i.directions,
    i.important_note,
    i.origin_country,
    i.is_cod_available::boolean AS is_cod_available,
    i.ships_internationally::boolean AS ships_internationally,
    i.item_condition,
    i.base_slug || '-' || substr(md5(i.name || i.sku),1,8) AS slug
  FROM input_data i
  LEFT JOIN public.categories c1 ON c1.slug = i.category_slug
  LEFT JOIN public.categories c2 ON c2.slug = i.sub_category_slug
  LEFT JOIN public.categories c3 ON c3.slug = i.product_type_slug
),
ins AS (
  INSERT INTO public.products (
    seller_id, name, slug, description, short_description,
    category, sub_category, product_type,
    brand, sku, price, mrp, currency, stock,
    image_url, images, videos, highlights, specifications,
    package_weight, package_length, package_width, package_height,
    shipping_type,
    manufacturer_name,
    approval_status, is_active,
    is_cod_available,
    origin_country,
    default_selling_price,
    ships_internationally,
    item_condition,
    ingredients, directions, manufacturer_country, important_note
  )
  SELECT
    p.seller_id,
    p.name,
    p.slug,
    p.description,
    p.short_description,
    p.category_id,
    p.sub_category_id,
    p.product_type_id,
    p.brand,
    p.sku,
    p.price,
    p.mrp,
    'INR',
    p.stock,
    '',
    ARRAY[]::text[],
    ARRAY[]::text[],
    CASE WHEN coalesce(trim(p.highlights_text), '') = '' THEN ARRAY[]::text[] ELSE ARRAY[p.highlights_text] END,
    COALESCE((SELECT jsonb_object_agg(trim(split_part(x,':',1)), trim(split_part(x,':',2))) FROM unnest(string_to_array(p.specifications_text,'|')) AS x WHERE x LIKE '%:%'), '{}'::jsonb),
    p.package_weight,
    p.package_length,
    p.package_width,
    p.package_height,
    'shiprocket',
    p.manufacturer_name,
    'pending',
    false,
    p.is_cod_available,
    p.origin_country,
    p.price,
    p.ships_internationally,
    p.item_condition,
    p.ingredients,
    p.directions,
    p.manufacturer_country,
    p.important_note
  FROM prepared p
  WHERE p.category_id IS NOT NULL
    AND p.sub_category_id IS NOT NULL
    AND p.product_type_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.products x
      WHERE x.seller_id = p.seller_id
        AND lower(x.name) = lower(p.name)
    )
  RETURNING id, name
)
SELECT
  (SELECT count(*) FROM input_data) AS total_input_rows,
  (SELECT count(*) FROM prepared WHERE category_id IS NOT NULL AND sub_category_id IS NOT NULL AND product_type_id IS NOT NULL) AS category_mapped_rows,
  (SELECT count(*) FROM ins) AS inserted_rows,
  (SELECT count(*) FROM public.products p WHERE p.seller_id = 'd4b2e915-7dce-4af8-b156-3845e7835c11'::uuid) AS seller_total_products,
  (
    SELECT count(*)
    FROM public.products p
    WHERE p.seller_id = 'd4b2e915-7dce-4af8-b156-3845e7835c11'::uuid
      AND p.approval_status = 'pending'
      AND p.is_active = false
  ) AS seller_pending_inactive_products;