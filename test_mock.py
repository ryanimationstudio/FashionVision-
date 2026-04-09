# D:\Final Year Project\test_mock.py
from api.ai.fashion_validator import is_fashion_image, validate_fashion_image

print("🧪 Running Mock Tests...\n")

# Test with invalid bytes
result = is_fashion_image(b"this is not an image")
print(f"1. Invalid image test: {result} (Expected: False) → {'✅' if result == False else '❌'}")

response = validate_fashion_image(b"invalid data")
print(f"2. Detailed validator: is_fashion={response['is_fashion']} → {'✅' if response['is_fashion'] == False else '❌'}")

print("\n✅ Mock tests completed!")