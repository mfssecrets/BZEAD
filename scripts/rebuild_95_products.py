#!/usr/bin/env python3
"""Rebuild products_bulk_upload_dashboard.csv with all 95 products."""
import csv

with open('/workspaces/bzead/products_bulk_upload_CLEAN_95.csv', 'r', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    headers = reader.fieldnames
    clean_products = list(reader)

MISSING_PRODUCTS = [
    # 67 - Lakme glitterati Eye Pencil
    {"name": "Lakme glitterati Eye Pencil | Mysterious Black | 1.2 gm",
     "brand": "Lakme", "cat": "beauty-personal-care", "sub": "makeup", "ptype": "eyeliner",
     "mrp": "160", "price": "130", "mfg": "Hindustan Unilever Ltd",
     "specs": '{"Makeup Color Family": "Blacks", "Finish": "Metallic Finish, Glitter Finish", "Product Type": "Eye Pencil", "Country of Origin": "India"}',
     "desc": "Lakme glitterati Eye Pencil in Mysterious Black adds a glittery dramatic look to your eyes. The metallic glitter formula delivers rich pigmentation with a single stroke for stunning eye definition.",
     "highlights": '["Metallic glitter formula for intense eye definition", "Long-lasting vibrant wear", "Easy to apply with smooth glide", "Water-resistant formula", "Ophthalmologically tested"]',
     "directions": "Apply along the lash line from inner to outer corner. Smudge for a smoky look. Remove with gentle makeup remover.",
     "w": "12", "wunit": "G", "l": "4", "wi": "2", "h": "15"},
    # 68 - Lakme Showstopper
    {"name": "Lakme Showstopper Collection Unreal Precision Liquid Eye Liner - Black (4.5 ml)",
     "brand": "Lakme", "cat": "beauty-personal-care", "sub": "makeup", "ptype": "eyeliner",
     "mrp": "160", "price": "130", "mfg": "Hindustan Unilever Ltd",
     "specs": '{"Makeup Color Family": "Blacks", "Active Ingredients": "Olive, Aqua", "Finish": "Glossy Finish", "Product Type": "Liquid Eyeliner", "Country of Origin": "India"}',
     "desc": "The Lakme Showstopper Collection Unreal Precision Liquid Eye Liner gives your eyes perfect definition and shine. Water-based glossy formula with single-stroke precision application.",
     "highlights": '["Water-based glossy formula", "Precise fine tip applicator", "Rich intense color in one stroke", "Create smouldering bold eye looks", "Long-lasting formula"]',
     "directions": "Apply along the lash line from inner to outer corner in one confident stroke. For bold look draw a thick line.",
     "w": "12", "wunit": "G", "l": "4", "wi": "2", "h": "15"},
    # 69 - Lakme Eyebrow Pencil
    {"name": "Lakme Eyebrow Pencil - Black (1.2 gm)",
     "brand": "Lakme", "cat": "beauty-personal-care", "sub": "makeup", "ptype": "eyebrow-pencil",
     "mrp": "160", "price": "130", "mfg": "Fiabila India Pvt. Ltd.",
     "specs": '{"Makeup Color Family": "Blacks", "Finish": "Matte Finish, Natural Finish", "Product Type": "Eyebrow Pencil", "Country of Origin": "India"}',
     "desc": "Lakme Eyebrow Pencil gives a well-defined groomed shape to your eyebrows. Water resistant long lasting smudge-free formula for perfectly accentuated brows.",
     "highlights": '["Water resistant and smudge-free formula", "Long-lasting wear without touch-ups", "Precisely shaped tip for natural hair-like strokes", "Easy to sharpen pencil", "Suitable for bold or subtle brow looks"]',
     "directions": "Brush brows into shape. Use short hair-like strokes to fill sparse areas. Build intensity as desired.",
     "w": "12", "wunit": "G", "l": "4", "wi": "2", "h": "15"},
    # 70 - Lakme Unreal 3D Brow Definer
    {"name": "Lakme Unreal 3D Brow Definer, Graphite, 1.19 gm",
     "brand": "Lakme", "cat": "beauty-personal-care", "sub": "makeup", "ptype": "eyebrow-pencil",
     "mrp": "249", "price": "199", "mfg": "Hindustan Unilever Ltd",
     "specs": '{"Makeup Color Family": "Greys", "Finish": "Natural Finish", "Product Type": "Brow Definer", "Country of Origin": "India"}',
     "desc": "Lakme Unreal 3D Brow Definer in Graphite creates natural-looking fuller brows with precise micro-strokes. Ultra-fine tip delivers hair-like strokes for a realistic 3D brow effect.",
     "highlights": '["Ultra-fine tip for precise micro-strokes", "3D brow effect for natural fuller-looking brows", "Long-lasting formula", "Graphite shade suits all complexions", "Ergonomic design for easy use"]',
     "directions": "Use short upward strokes in the direction of hair growth to fill and define brows. Build for desired fullness.",
     "w": "12", "wunit": "G", "l": "4", "wi": "2", "h": "15"},
    # 71 - Lakme Kajal Twin Pack
    {"name": "Lakme 9 to 5 Eyeconic Kajal Twin Pack, lasts upto 24hrs, Pack of 2- Deep Black, 0.35 gm + 0.35 gm",
     "brand": "Lakme", "cat": "beauty-personal-care", "sub": "makeup", "ptype": "kajal",
     "mrp": "299", "price": "249", "mfg": "Hindustan Unilever Ltd",
     "specs": '{"Complexion": "All Complexions", "Skin Type": "All Skin Types", "Speciality": "24 Hour Stay", "Makeup Color Family": "Blacks", "Finish": "Matte Finish", "Product Type": "Kajal", "Country of Origin": "India"}',
     "desc": "Lakme 9 to 5 Eyeconic Kajal Twin Pack gives you intense deep black eyes that last up to 24 hours. Transfer-proof waterproof and smudge-proof formula. Twin pack for great value.",
     "highlights": '["24-hour long-lasting formula", "Transfer-proof and waterproof", "Smudge-resistant for all-day wear", "Intense deep black color", "Ophthalmologically tested", "Twin pack for value"]',
     "directions": "Draw a neat stroke starting from the inner corner of the eye extending outwards on upper lid. Apply to lower lid as desired.",
     "w": "15", "wunit": "G", "l": "4", "wi": "3", "h": "15"},
    # 72 - MARS Lip Liner
    {"name": "MARS Edge of Desire Matte Lip Liner (03-BLOOD BATH) 1.4 gm",
     "brand": "MARS", "cat": "beauty-personal-care", "sub": "makeup", "ptype": "lip-liner",
     "mrp": "160", "price": "129", "mfg": "Zebra Brands Limited",
     "specs": '{"Makeup Color Family": "Reds", "Finish": "Matte Finish", "Product Type": "Lip Liner", "Country of Origin": "PRC"}',
     "desc": "MARS Edge of Desire Matte Lip Liner in 03-Blood Bath delivers one-swipe application with excellent pigmentation. Long-lasting formula stays for hours without fading or bleeding.",
     "highlights": '["One swipe smooth application", "Long-lasting matte finish", "Creamy texture that glides without tugging", "Rich bold pigmentation", "Prevents feathering and lip bleeding"]',
     "directions": "Choose a lip liner matching your lipstick shade. Start from cupid bow and line the lips precisely. Fill in for longer wear.",
     "w": "14", "wunit": "G", "l": "4", "wi": "2", "h": "15"},
    # 73 - Swiss Beauty Makeup Fixer 70ml
    {"name": "Swiss Beauty Makeup Fixer (70 ml)",
     "brand": "Swiss Beauty", "cat": "beauty-personal-care", "sub": "makeup", "ptype": "makeup-fixer",
     "mrp": "220", "price": "179", "mfg": "Global Beauty Group Limited",
     "specs": '{"Skin Type": "Sensitive Skin, Dry Skin, All Skin Types", "Finish": "Natural Finish", "Product Type": "Makeup Fixer Spray", "Country of Origin": "PRC"}',
     "desc": "Swiss Beauty Makeup Fixer locks down your makeup and keeps it fresh all day. Shake Hold Spritz and Fix this double-duty fixer is perfect whether headed to work a party or a day out.",
     "highlights": '["Long-lasting makeup setting spray", "Suitable for all skin types including sensitive", "Lightweight non-sticky formula", "Travel-friendly 70ml size", "Keeps makeup intact all day"]',
     "directions": "Fix it and step out. Shake the bottle. Hold 12 inches from face. Spritz 2-3 times in Z pattern. Let dry naturally.",
     "w": "100", "wunit": "G", "l": "5", "wi": "5", "h": "15"},
    # 74 - Swiss Beauty Matte Makeup Fixer 70ml
    {"name": "Swiss Beauty Matte Makeup Fixer Spray 70 ml",
     "brand": "Swiss Beauty", "cat": "beauty-personal-care", "sub": "makeup", "ptype": "makeup-fixer",
     "mrp": "220", "price": "179", "mfg": "Global Beauty Group Limited",
     "specs": '{"Finish": "Matte Finish", "Product Type": "Makeup Fixer Spray", "Country of Origin": "PRC"}',
     "desc": "Swiss Beauty Matte Makeup Fixer Spray sets your makeup for a matte shine-free finish. Keeps your makeup locked all day long for flawless long-lasting wear in any weather.",
     "highlights": '["Matte finish setting spray", "Controls shine all day long", "Locks makeup for hours", "Lightweight non-greasy formula", "70ml convenient travel size"]',
     "directions": "Shake well before use. Hold at arm length from face. Spray lightly in Z or T pattern. Allow to dry.",
     "w": "100", "wunit": "G", "l": "5", "wi": "5", "h": "15"},
    # 75 - Swiss Beauty Select Prep Set 120ml
    {"name": "Swiss Beauty Select Prep Set Matte Make Up Fixer With Vitamin E - 120 ml",
     "brand": "Swiss Beauty", "cat": "beauty-personal-care", "sub": "makeup", "ptype": "makeup-fixer",
     "mrp": "299", "price": "249", "mfg": "Global Beauty Group Limited",
     "specs": '{"Finish": "Matte Finish", "Active Ingredients": "Vitamin E", "Product Type": "Makeup Fixer Spray", "Country of Origin": "PRC"}',
     "desc": "Swiss Beauty Select Prep Set Matte Makeup Fixer with Vitamin E preps skin before makeup and sets it for long-lasting matte finish. Enriched with Vitamin E for added skincare benefits.",
     "highlights": '["Prep and set formula with nourishing Vitamin E", "Matte finish for all-day wear", "Larger 120ml size for extended use", "Hydrates while setting makeup", "Suitable for all skin types"]',
     "directions": "Use as primer before makeup or spray after makeup to set. Hold 12 inches from face. Spray lightly. Allow to dry.",
     "w": "140", "wunit": "G", "l": "5", "wi": "5", "h": "17"},
    # 76 - Swiss Beauty Bold Matt Lip Liner -13
    {"name": "Swiss Beauty Bold Matt Lip Liner -13 (1.6 gm)",
     "brand": "Swiss Beauty", "cat": "beauty-personal-care", "sub": "makeup", "ptype": "lip-liner",
     "mrp": "160", "price": "129", "mfg": "Global Beauty Group Limited",
     "specs": '{"Finish": "Creamy Finish, Matte Finish", "Product Type": "Lip Liner", "Country of Origin": "PRC"}',
     "desc": "Swiss Beauty Bold Matt Lip Liner shade 13 delivers rich highly pigmented color with a creamy matte finish. Infused with castor seed oil and glycerine to keep lips moisturised.",
     "highlights": '["Highly pigmented shade 13", "Creamy matte formula for long wear", "Moisturises lips with castor seed oil and glycerine", "Prevents feathering and bleeding", "Long-lasting vibrant color"]',
     "directions": "Using the tip of the wand start application on your upper lip from your cupid bow. Line lips precisely for defined pout.",
     "w": "16", "wunit": "G", "l": "4", "wi": "2", "h": "15"},
    # 77 - Swiss Beauty Bold Matte Lip Liner Pack of 12
    {"name": "Swiss Beauty Bold Matte Lip Liner - Multicolor - Pack of 12",
     "brand": "Swiss Beauty", "cat": "beauty-personal-care", "sub": "makeup", "ptype": "lip-liner",
     "mrp": "350", "price": "279", "mfg": "Global Beauty Group Limited",
     "specs": '{"Finish": "Creamy Finish, Matte Finish", "Product Type": "Lip Liner Set", "Country of Origin": "PRC"}',
     "desc": "Swiss Beauty Bold Matte Lip Liner Pack of 12 includes 12 rich and highly pigmented shades. Complete lip liner collection for all occasions infused with glycerine to keep lips moisturised.",
     "highlights": '["Pack of 12 highly pigmented shades", "Creamy matte formula for all-day wear", "Moisturises lips with castor seed oil and glycerine", "Prevents feathering and bleeding", "Value-for-money complete collection"]',
     "directions": "Using the tip of the wand start on upper lip from cupid bow. Line and fill lips for lasting color.",
     "w": "160", "wunit": "G", "l": "8", "wi": "5", "h": "5"},
    # 78 - MARS Dance of Joy 02
    {"name": "MARS 12 Shades Dance of Joy Eyeshadow Palette (02-Multicolor) 13.2 gm",
     "brand": "MARS", "cat": "beauty-personal-care", "sub": "makeup", "ptype": "eyeshadow-palette",
     "mrp": "165", "price": "135", "mfg": "Zebra Brands Limited",
     "specs": '{"Makeup Color Family": "Multicolor", "Finish": "Shimmery Finish, Matte Finish", "Product Type": "Eyeshadow Palette", "Country of Origin": "PRC"}',
     "desc": "MARS 12 Shades Dance of Joy Eyeshadow Palette 02-Multicolor offers 6 shimmers and 6 matte shades for versatile day-to-night looks. Highly pigmented formula for smooth professional application.",
     "highlights": '["6 shimmer and 6 matte shades", "Mix of finishes for day-to-night looks", "Highly pigmented formula", "Smooth and blendable texture", "Compact palette for easy travel"]',
     "directions": "Prep eyelids with eyeshadow primer. Apply with eyeshadow brush. Blend edges for seamless look.",
     "w": "165", "wunit": "G", "l": "8", "wi": "4", "h": "4"},
    # 79 - MARS Dance of Joy 03
    {"name": "MARS 12 Shades Dance of Joy Eyeshadow Palette (03-Multicolor) 13.2 gm",
     "brand": "MARS", "cat": "beauty-personal-care", "sub": "makeup", "ptype": "eyeshadow-palette",
     "mrp": "165", "price": "135", "mfg": "Zebra Brands Limited",
     "specs": '{"Makeup Color Family": "Multicolor", "Finish": "Shimmery Finish, Matte Finish", "Product Type": "Eyeshadow Palette", "Country of Origin": "PRC"}',
     "desc": "MARS 12 Shades Dance of Joy Eyeshadow Palette 03-Multicolor offers 6 shimmers and 6 matte shades. Create stunning eye looks for every occasion with this versatile palette.",
     "highlights": '["6 shimmer and 6 matte shades", "Mix of finishes for versatile looks", "Highly pigmented formula", "Smooth blendable texture", "Compact palette design"]',
     "directions": "Prep eyelids with primer. Apply with brush. Layer and blend for desired intensity and finish.",
     "w": "165", "wunit": "G", "l": "8", "wi": "4", "h": "4"},
    # 80 - MARS Dance of Joy 01
    {"name": "MARS 12 Shades Dance of Joy Eyeshadow Palette (01-Multicolor) 13.2 gm",
     "brand": "MARS", "cat": "beauty-personal-care", "sub": "makeup", "ptype": "eyeshadow-palette",
     "mrp": "165", "price": "135", "mfg": "Zebra Brands Limited",
     "specs": '{"Makeup Color Family": "Multicolor", "Finish": "Shimmery Finish, Matte Finish", "Product Type": "Eyeshadow Palette", "Country of Origin": "PRC"}',
     "desc": "MARS 12 Shades Dance of Joy Eyeshadow Palette 01-Multicolor features 6 shimmers and 6 matte shades for creating versatile eye looks from everyday to special occasions.",
     "highlights": '["6 shimmer and 6 matte shades", "Versatile palette for any occasion", "Highly pigmented formula", "Smooth blendable texture", "Convenient compact design"]',
     "directions": "Prep eyelids with primer. Apply with brush. Build up layers for more intensity.",
     "w": "165", "wunit": "G", "l": "8", "wi": "4", "h": "4"},
    # 81 - MARS Back to Basics
    {"name": "MARS 12 Shades Back to Basics Eyeshadow Palette (Shade-01) 14.4 gm",
     "brand": "MARS", "cat": "beauty-personal-care", "sub": "makeup", "ptype": "eyeshadow-palette",
     "mrp": "165", "price": "135", "mfg": "Zebra Brands Limited",
     "specs": '{"Makeup Color Family": "Multicolor", "Finish": "Shimmery Finish, Matte Finish", "Product Type": "Eyeshadow Palette", "Country of Origin": "PRC"}',
     "desc": "MARS 12 Shades Back to Basics Eyeshadow Palette Shade-01 contains 12 carefully curated shades. Perfect for everyday and special occasion eye looks with smooth blendable formula.",
     "highlights": '["12 carefully curated shades", "Mix of shimmer and matte finishes", "Highly pigmented formula", "Easy to blend for seamless looks", "Versatile everyday essential palette"]',
     "directions": "Prep eyelids with primer. Apply lighter shades on lids and darker shades in crease. Blend well.",
     "w": "165", "wunit": "G", "l": "8", "wi": "4", "h": "4"},
    # 82 - MARS Mesmereyes 16-color
    {"name": "MARS Mesmereyes Smoky Eyes 16-Color Eyeshadow Palette (03-Multicolor) 20.8 gm",
     "brand": "MARS", "cat": "beauty-personal-care", "sub": "makeup", "ptype": "eyeshadow-palette",
     "mrp": "170", "price": "140", "mfg": "Zebra Brands Limited",
     "specs": '{"Makeup Color Family": "Multicolor", "Color Name": "Multicolor", "Finish": "Shimmery Finish, Matte Finish", "Product Type": "Eyeshadow Palette", "Country of Origin": "PRC"}',
     "desc": "MARS Mesmereyes Smoky Eyes 16-Color Eyeshadow Palette 03-Multicolor is your guide to creating mesmerizing smoky eye looks. 16 rich shades for professional-level eye artistry.",
     "highlights": '["16 rich eyeshadow shades", "Perfect for smoky eye looks", "Mix of shimmer and matte finishes", "Highly pigmented professional formula", "Long-lasting mesmerizing wear"]',
     "directions": "Prep eyelids with primer. Build up dark shades in outer corner and crease. Blend lightly for smoky effect.",
     "w": "220", "wunit": "G", "l": "10", "wi": "5", "h": "4"},
    # 83 - MARS Metallic Liquid Glitter Eyeshadow
    {"name": "MARS Metallic Liquid Glitter Eyeshadow (02-Golden Beam) 5.5 ml",
     "brand": "MARS", "cat": "beauty-personal-care", "sub": "makeup", "ptype": "eyeshadow",
     "mrp": "160", "price": "130", "mfg": "Zebra Brands Limited",
     "specs": '{"Makeup Color Family": "Golds", "Finish": "Shimmery Finish, Metallic Finish", "Product Type": "Liquid Eyeshadow", "Country of Origin": "PRC"}',
     "desc": "MARS Metallic Liquid Glitter Eyeshadow in 02-Golden Beam delivers brilliant metallic gold glitter for eyes that dazzle. Liquid formula glides on smoothly for intense sparkle.",
     "highlights": '["Brilliant metallic gold glitter finish", "Liquid formula for smooth precise application", "Intense shimmer and sparkle", "Long-lasting wear", "Easy to apply with precision wand"]',
     "directions": "Apply the liquid eyeshadow directly on clean dry eyelids using the applicator. Layer for more intensity.",
     "w": "60", "wunit": "G", "l": "4", "wi": "3", "h": "12"},
    # 84 - MARS Blooming
    {"name": "MARS Blooming Matte & Shimmer Eyeshadow Palette (03-Imperial) 4.8 gm",
     "brand": "MARS", "cat": "beauty-personal-care", "sub": "makeup", "ptype": "eyeshadow-palette",
     "mrp": "160", "price": "130", "mfg": "Zebra Brands Limited",
     "specs": '{"Makeup Color Family": "Multicolor", "Color Name": "Multicolor", "Finish": "Shimmery Finish, Matte Finish", "Product Type": "Eyeshadow Palette", "Country of Origin": "PRC"}',
     "desc": "MARS Blooming Matte & Shimmer Eyeshadow Palette in 03-Imperial features a beautiful combination of matte and shimmer shades. Create blooming ethereal eye looks with ease.",
     "highlights": '["Imperial color combination of matte and shimmer", "3 matte and 3 shimmer shades", "Rich pigmentation", "Smooth blendable formula", "Perfect for day-to-night eye looks"]',
     "directions": "Apply matte shades to lid and shimmer to center. Blend edges for seamless transition. Layer for intensity.",
     "w": "60", "wunit": "G", "l": "8", "wi": "4", "h": "2"},
    # 85 - MARS Northern Lights
    {"name": "MARS Northern Lights In A Pan Eyeshadow (02-NORWEGIAN NIGHTS) 0.5 gm",
     "brand": "MARS", "cat": "beauty-personal-care", "sub": "makeup", "ptype": "eyeshadow",
     "mrp": "160", "price": "130", "mfg": "Zebra Brands Limited",
     "specs": '{"Makeup Color Family": "Multicolor", "Finish": "Multi-Chromatic Finish, Shimmery Finish", "Product Type": "Eyeshadow", "Country of Origin": "PRC"}',
     "desc": "MARS Northern Lights In A Pan Eyeshadow in 02-Norwegian Nights contains dual shimmer shades inspired by the Northern Lights aurora. Create multi-chromatic dazzling eye looks.",
     "highlights": '["Dual shimmer shades in one compact", "Multi-chromatic finish inspired by Northern Lights aurora", "Intense shimmer and sparkle", "Long-lasting wear", "Eye-catching color payoff"]',
     "directions": "Apply the shimmer shade on eyelids using a brush or fingertip. Build up for more intensity and sparkle.",
     "w": "20", "wunit": "G", "l": "5", "wi": "5", "h": "2"},
    # 86 - MARS City Paradise
    {"name": "MARS The City Paradise Makeup Kit (01-Mumbai) 16 gm",
     "brand": "MARS", "cat": "beauty-personal-care", "sub": "makeup", "ptype": "eyeshadow-palette",
     "mrp": "165", "price": "135", "mfg": "Zebra Brands Limited",
     "specs": '{"Makeup Color Family": "Multicolor", "Finish": "Shimmery Finish, Matte Finish", "Product Type": "Makeup Palette", "Country of Origin": "PRC"}',
     "desc": "MARS The City Paradise Makeup Kit 01-Mumbai is inspired by the vibrant city of Mumbai. Contains extremely pigmented shades for stunning city-inspired makeup looks.",
     "highlights": '["City Paradise inspired color collection", "Extremely pigmented shades", "Mix of matte and shimmer finishes", "Rich color payoff without fallout", "Long-lasting wear"]',
     "directions": "Apply with eyeshadow brush. Use lighter shades as base and darker shades to define. Blend well for seamless look.",
     "w": "165", "wunit": "G", "l": "8", "wi": "4", "h": "4"},
    # 87 - MARS Foundation SPF50
    {"name": "MARS SPF50 PA++++ High Coverage Liquid Foundation (SHADE-07) 40 ml",
     "brand": "MARS", "cat": "beauty-personal-care", "sub": "makeup", "ptype": "foundation",
     "mrp": "190", "price": "155", "mfg": "Zebra Brands Limited",
     "specs": '{"Complexion": "Deep Complexion, Medium Complexion", "Skin Type": "All Skin Types", "Coverage": "High Coverage", "SPF": "SPF50 PA++++", "Finish": "Natural Finish", "Product Type": "Liquid Foundation", "Country of Origin": "PRC"}',
     "desc": "MARS SPF50 PA++++ High Coverage Liquid Foundation in Shade-07 provides full coverage with sun protection. Convenient pump dispenser for precise application suitable for all skin types.",
     "highlights": '["High coverage formula for full coverage", "SPF50 PA++++ sun protection", "Convenient pump dispenser", "Suitable for all skin types", "Natural-looking finish", "Generous 40ml size"]',
     "directions": "Apply 1-2 pumps on clean moisturized skin. Blend with brush or sponge in outward strokes. Build up for more coverage.",
     "w": "200", "wunit": "G", "l": "5", "wi": "5", "h": "12"},
    # 88 - MARS Foundation SPF30
    {"name": "MARS SPF30 PA++++ Zero Blend Weightless Liquid Foundation (03-CASHEW DELIGHT) 30 ml",
     "brand": "MARS", "cat": "beauty-personal-care", "sub": "makeup", "ptype": "foundation",
     "mrp": "190", "price": "155", "mfg": "Zebra Brands Limited",
     "specs": '{"Complexion": "Light Complexion, Medium Complexion", "Skin Type": "All Skin Types", "SPF": "SPF30 PA++++", "Finish": "Natural Finish", "Product Type": "Liquid Foundation", "Country of Origin": "PRC"}',
     "desc": "MARS SPF30 PA++++ Zero Blend Weightless Liquid Foundation in Cashew Delight is ultra-lightweight formula that blends effortlessly for a second-skin finish with sun protection.",
     "highlights": '["Zero Blend weightless formula", "SPF30 PA++++ sun protection", "Cashew Delight for light-medium complexion", "Effortless blending for second-skin finish", "30ml travel-friendly size"]',
     "directions": "Apply 1-2 pumps on clean moisturized skin. Blend with fingertips or brush. The zero-blend formula melts into skin.",
     "w": "160", "wunit": "G", "l": "5", "wi": "4", "h": "12"},
    # 89 - MARS Fantasy Face Palette
    {"name": "MARS Fantasy Face Palette (Shade-03) 20 gm",
     "brand": "MARS", "cat": "beauty-personal-care", "sub": "makeup", "ptype": "face-palette",
     "mrp": "165", "price": "135", "mfg": "Zebra Brands Limited",
     "specs": '{"Makeup Color Family": "Multicolor", "Finish": "Shimmery Finish, Matte Finish", "Product Type": "Face Palette", "Country of Origin": "PRC"}',
     "desc": "MARS Fantasy Face Palette Shade-03 is your all-in-one face palette. Contains highlighter blush and contour shades for complete face sculpting with fantasy makeup looks.",
     "highlights": '["All-in-one face palette", "Contains highlighter, blush and contour shades", "Rich pigmentation", "Buildable coverage for day and night looks", "Creates stunning fantasy makeup looks"]',
     "directions": "Use highlighter on high points of face, blush on cheeks, contour along jawline and temples. Blend well with brush.",
     "w": "165", "wunit": "G", "l": "8", "wi": "5", "h": "4"},
    # 90 - MARS Flush of Love Blusher
    {"name": "MARS Flush of Love Face Blusher (Shade-04) 8 gm",
     "brand": "MARS", "cat": "beauty-personal-care", "sub": "makeup", "ptype": "blush",
     "mrp": "160", "price": "130", "mfg": "Zebra Brands Limited",
     "specs": '{"Finish": "Natural Finish", "Product Type": "Blush", "Country of Origin": "PRC"}',
     "desc": "MARS Flush of Love Face Blusher Shade-04 delivers a natural rosy flush to the cheeks. Easy to blend formula with single swipe pigmentation for a healthy youthful glow.",
     "highlights": '["Easy to blend and long-lasting", "Natural finish for youthful healthy glow", "Single swipe pigmentation", "Lightweight finely milled texture", "Blends seamlessly into skin"]',
     "directions": "Smile and apply blush to the apples of cheeks using a fluffy blush brush. Blend upward toward temples.",
     "w": "160", "wunit": "G", "l": "8", "wi": "4", "h": "4"},
    # 91 - Swiss Beauty Cream It Up Blusher
    {"name": "Swiss Beauty Cream It Up Blusher (5-Cheek-o-Pink)",
     "brand": "Swiss Beauty", "cat": "beauty-personal-care", "sub": "makeup", "ptype": "blush",
     "mrp": "160", "price": "129", "mfg": "Global Beauty Group Limited",
     "specs": '{"Makeup Color Family": "Pinks", "Finish": "Creamy Finish", "Product Type": "Cream Blusher", "Country of Origin": "PRC"}',
     "desc": "Swiss Beauty Cream It Up Blusher in Cheek-o-Pink shade delivers a natural flushed look with a creamy texture. Easy to blend for a seamless radiant finish that lasts all day.",
     "highlights": '["Creamy blendable formula", "Natural-looking flushed finish", "Long-lasting wear", "Buildable pigmentation", "Cheek-o-Pink shade for fresh healthy glow"]',
     "directions": "Apply cream blusher to the apples of cheeks with fingertips or blush brush. Tap and blend for seamless finish.",
     "w": "80", "wunit": "G", "l": "7", "wi": "7", "h": "2"},
    # 92 - Swiss Beauty Bake Me Up
    {"name": "Swiss Beauty Bake Me Up Blush & Highlighter 12 gm, Pink Macaron",
     "brand": "Swiss Beauty", "cat": "beauty-personal-care", "sub": "makeup", "ptype": "blush",
     "mrp": "165", "price": "135", "mfg": "Global Beauty Group Limited",
     "specs": '{"Makeup Color Family": "Pinks", "Finish": "Shimmery Finish, Natural Finish", "Product Type": "Blush and Highlighter", "Country of Origin": "PRC"}',
     "desc": "Swiss Beauty Bake Me Up Blush & Highlighter in Pink Macaron combines blush and highlighter for a dual-purpose makeup product. Delivers a baked lit-from-within glow.",
     "highlights": '["2-in-1 Blush and Highlighter", "Baked formula for lit-from-within glow", "Pink Macaron shade", "Long-lasting wear", "Buildable pigmentation for day or night"]',
     "directions": "Swirl brush across baked palette. Apply blush to cheeks and highlighter to high points of face like cheekbones.",
     "w": "120", "wunit": "G", "l": "8", "wi": "5", "h": "2"},
    # 93 - Swiss Beauty Ultra Blush Palette
    {"name": "Swiss Beauty Ultra Blush Palette 3 (16 gm)",
     "brand": "Swiss Beauty", "cat": "beauty-personal-care", "sub": "makeup", "ptype": "blush",
     "mrp": "165", "price": "135", "mfg": "Global Beauty Group Limited",
     "specs": '{"Makeup Color Family": "Multicolor", "Finish": "Dewy Finish, Shimmery Finish, Matte Finish", "Product Type": "Blush Palette", "Country of Origin": "PRC"}',
     "desc": "Swiss Beauty Ultra Blush Palette 3 contains 8 highly pigmented shades for creating versatile blush looks. Choose from matte shimmer and dewy finishes for all occasions.",
     "highlights": '["8 highly pigmented blush shades", "Mix of dewy, shimmer and matte finishes", "Ultra-blendable formula", "Long-lasting vibrant color", "Versatile palette for all occasions"]',
     "directions": "Apply desired shade to cheeks with a blush brush. Blend in circular or upward strokes for a natural finish.",
     "w": "165", "wunit": "G", "l": "10", "wi": "8", "h": "2"},
    # 94 - Swiss Beauty Craze Lip & Cheek Mud
    {"name": "Swiss Beauty Craze Lip & Cheek Mud 5 gm, Playful Pink",
     "brand": "Swiss Beauty", "cat": "beauty-personal-care", "sub": "makeup", "ptype": "blush",
     "mrp": "160", "price": "129", "mfg": "Global Beauty Group Limited",
     "specs": '{"Makeup Color Family": "Pinks", "Finish": "Matte Finish", "Product Type": "Lip and Cheek Mud", "Country of Origin": "PRC"}',
     "desc": "Swiss Beauty Craze Lip & Cheek Mud in Playful Pink is a versatile 2-in-1 product for both lips and cheeks. The mud texture delivers natural buildable color for a playful look.",
     "highlights": '["Versatile 2-in-1 for lips and cheeks", "Mud texture for natural application", "Playful Pink shade", "Buildable pigmentation", "Long-lasting matte finish"]',
     "directions": "For lips: Apply directly from stick to lips and blend with fingertip. For cheeks: Dot on cheeks and blend with fingertips.",
     "w": "60", "wunit": "G", "l": "5", "wi": "3", "h": "8"},
    # 95 - Swiss Beauty Select High on Blush
    {"name": "Swiss Beauty Select High on Blush (4 Burnt Rose) 8 gm",
     "brand": "Swiss Beauty", "cat": "beauty-personal-care", "sub": "makeup", "ptype": "blush",
     "mrp": "160", "price": "129", "mfg": "Global Beauty Group Limited",
     "specs": '{"Makeup Color Family": "Pinks", "Finish": "Natural Finish", "Product Type": "Blush", "Country of Origin": "PRC"}',
     "desc": "Swiss Beauty Select High on Blush in Burnt Rose shade delivers a warm natural flush to the cheeks. The highly pigmented formula blends seamlessly for a lit-from-within glow.",
     "highlights": '["Burnt Rose shade for warm natural flush", "Highly pigmented formula", "Seamless effortless blending", "Long-lasting wear", "Creates a lit-from-within healthy glow"]',
     "directions": "Apply to the apples of cheeks and blend upward toward temples with a fluffy brush for a natural flush.",
     "w": "80", "wunit": "G", "l": "7", "wi": "7", "h": "2"},
]

NOTE = "For external use only. Avoid contact with eyes; if contact occurs, rinse immediately with water. Keep out of reach of children. Do not use on sensitive, broken, or irritated skin."

all_products = list(clean_products)

for mp in MISSING_PRODUCTS:
    row = {h: '' for h in headers}
    row['item_condition'] = 'brand_new'
    row['name'] = mp['name']
    row['category_slug'] = mp['cat']
    row['sub_category_slug'] = mp['sub']
    row['product_type_slug'] = mp['ptype']
    row['brand'] = mp['brand']
    row['mrp'] = mp['mrp']
    row['price'] = mp['price']
    row['stock'] = '25'
    row['description'] = mp['desc']
    row['short_description'] = mp['desc'][:200]
    row['packing_type_name'] = 'Corrugated Box'
    row['package_weight'] = mp['w']
    row['package_weight_unit_code'] = mp['wunit']
    row['package_length'] = mp['l']
    row['package_length_unit_code'] = 'CM'
    row['package_width'] = mp['wi']
    row['package_width_unit_code'] = 'CM'
    row['package_height'] = mp['h']
    row['package_height_unit_code'] = 'CM'
    row['highlights_json'] = mp['highlights']
    row['specifications_json'] = mp['specs']
    row['manufacturer_name'] = mp['mfg']
    row['manufacturer_country'] = 'India'
    row['directions'] = mp['directions']
    row['important_note'] = NOTE
    row['is_cod_available'] = 'true'
    row['ships_internationally'] = 'true'
    row['sku'] = ''
    row['image_urls_json'] = '[]'
    row['video_urls_json'] = '[]'
    row['size_variants_json'] = '[]'
    row['color_variants_json'] = '[]'
    row['variant_combinations_json'] = '[]'
    row['ingredients_json'] = '[]'
    row['special_day_offers_json'] = '[]'
    row['quantity_offers_json'] = '[]'
    row['condition_details_json'] = '{}'
    row['return_policy_json'] = '{}'
    all_products.append(row)

output_path = '/workspaces/bzead/products_bulk_upload_dashboard.csv'
with open(output_path, 'w', encoding='utf-8', newline='') as f:
    writer = csv.DictWriter(f, fieldnames=headers)
    writer.writeheader()
    writer.writerows(all_products)

print(f"Written {len(all_products)} products to {output_path}")

# Verify
with open(output_path, 'r', encoding='utf-8') as f:
    verify = list(csv.DictReader(f))

print(f"Verification: {len(verify)} rows")
brands = {}
for p in verify:
    b = p.get('brand', '').strip()
    brands[b] = brands.get(b, 0) + 1
for brand, count in sorted(brands.items()):
    print(f"  {brand}: {count}")
print("\nProducts 65-70:")
for p in verify[64:70]:
    print(f"  {p['name'][:65]} | {p['brand']} | mrp:{p['mrp']}")
print("\nProducts 93-95:")
for p in verify[92:95]:
    print(f"  {p['name'][:65]} | {p['brand']} | mrp:{p['mrp']}")
