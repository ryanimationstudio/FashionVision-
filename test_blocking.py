# D:\Final Year Project\test_blocking.py
from api.ai.fashion_validator import is_fashion_image

test_cases = [
    # Fashion (should PASS ✅)
    ("dress.jpg", True),
    ("shirt_on_hanger.jpg", True),
    ("shoes_product.jpg", True),
    
    # Non-Fashion (should BLOCK ❌)
    ("dog.jpg", False),           # Animal
    ("cat.jpg", False),           # Animal
    ("pizza.jpg", False),         # Food
    ("burger.jpg", False),        # Food
    ("car.jpg", False),           # Vehicle
    ("bike.jpg", False),          # Vehicle
    ("mountain.jpg", False),      # Nature
    ("tree.jpg", False),          # Nature
    ("living_room.jpg", False),   # Interior
    ("iphone.jpg", False),        # Electronics
    ("laptop.jpg", False),        # Electronics
    ("selfie_face.jpg", False),   # Person without fashion
    ("football.jpg", False),      # Sports equipment
]

print("🧪 Testing non-fashion blocking...\n")
for filename, expected in test_cases:
    try:
        with open(filename, "rb") as f:
            result = is_fashion_image(f.read())
        status = "✅" if result == expected else "❌"
        print(f"{status} {filename:20s} | Expected: {expected:5} | Got: {result:5}")
    except FileNotFoundError:
        print(f"⚠️  {filename:20s} | File not found (create for testing)")