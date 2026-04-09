import io
import pytest
from PIL import Image
import unittest.mock as mock
import concurrent.futures

from api.ai.fashion_validator import is_fashion_image, validate_fashion_image, _open_image, _is_likely_illustration
from api.ai.batch import validate_fashion_images_batch
from api.ai.cache import clear_cache

# Helper to create dummy images
def create_dummy_image(color=(200, 200, 200), size=(224, 224)):
    img = Image.new('RGB', size, color=color)
    img_byte_arr = io.BytesIO()
    img.save(img_byte_arr, format='JPEG')
    return img_byte_arr.getvalue()

@pytest.fixture(autouse=True)
def reset_state():
    clear_cache()
    yield

# --- Layer 1: Heuristics & Image Decoding Tests ---

def test_open_image_valid():
    data = create_dummy_image()
    img = _open_image(data)
    assert isinstance(img, Image.Image)
    assert img.size == (224, 224)

def test_open_image_too_small():
    data = create_dummy_image(size=(100, 100))
    img = _open_image(data)
    assert img is None

def test_open_image_corrupted():
    img = _open_image(b"not an image")
    assert img is None

def test_is_likely_illustration_true():
    # Saturated red image (anime-like heuristic)
    img = Image.new('RGB', (128, 128), color=(255, 0, 0)) # High saturation
    assert _is_likely_illustration(img) is True

def test_is_likely_illustration_false():
    # Gray image (photo-like heuristic)
    img = Image.new('RGB', (128, 128), color=(128, 128, 128))
    assert _is_likely_illustration(img) is False

# --- Layer 2: CLIP Validation Tests (Mocked) ---

@mock.patch('api.ai.fashion_validator._predict')
def test_validate_fashion_image_pass(mock_predict):
    mock_predict.return_value = {
        "best_idx": 0, # "a professional e-commerce product shot..."
        "max_prob": 0.95,
        "probs": [0.95] + [0.005]*33,
        "inference_time_ms": 100
    }
    data = create_dummy_image()
    res = validate_fashion_image(data)
    assert res['is_fashion'] is True
    assert "professional e-commerce" in res['detected_subject']

@mock.patch('api.ai.fashion_validator._predict')
def test_validate_fashion_image_fail_non_fashion(mock_predict):
    mock_predict.return_value = {
        "best_idx": 26, # "a photo of food..."
        "max_prob": 0.92,
        "probs": [0.0]*26 + [0.92] + [0.0]*7, # non-fashion indices are 24-33
        "inference_time_ms": 100
    }
    data = create_dummy_image()
    res = validate_fashion_image(data)
    assert res['is_fashion'] is False
    assert "non-fashion" in res['reason']

@mock.patch('api.ai.fashion_validator._predict')
def test_validate_fashion_image_low_confidence(mock_predict):
    mock_predict.return_value = {
        "best_idx": 0,
        "max_prob": 0.35, # Below 0.40 threshold
        "probs": [0.35, 0.30, 0.25] + [0.01]*31,
        "inference_time_ms": 100
    }
    data = create_dummy_image()
    res = validate_fashion_image(data)
    assert res['is_fashion'] is False
    assert "below threshold" in res['reason']

# --- Cache Tests ---

@mock.patch('api.ai.fashion_validator._predict')
def test_caching(mock_predict):
    mock_predict.return_value = {
        "best_idx": 0,
        "max_prob": 0.95,
        "probs": [0.95]*34,
        "inference_time_ms": 100
    }
    data = create_dummy_image()
    
    # First call - cache miss
    validate_fashion_image(data)
    assert mock_predict.call_count == 1
    
    # Second call - cache hit
    validate_fashion_image(data)
    assert mock_predict.call_count == 1

# --- Batch Processing Tests ---

@mock.patch('api.ai.fashion_validator._predict')
def test_batch_validation(mock_predict):
    mock_predict.return_value = {
        "best_idx": 0,
        "max_prob": 0.95,
        "probs": [0.0]*34,
        "inference_time_ms": 10   
    }
    images = [create_dummy_image() for _ in range(3)]
    results = validate_fashion_images_batch(images, parallel=True)
    assert len(results) == 3
    assert all(r['is_fashion'] for r in results)

# --- Error Handling & Concurrency ---

@mock.patch('api.ai.fashion_validator._predict')
def test_inference_timeout(mock_predict):
    mock_predict.return_value = {"error": "timeout"}
    data = create_dummy_image()
    res = validate_fashion_image(data)
    assert res['is_fashion'] is False
    assert "timeout" in res['reason']

def test_concurrency():
    # Call is_fashion_image from multiple threads
    # Use real function but mock _predict to be fast
    with mock.patch('api.ai.fashion_validator._predict') as mock_p:
        mock_p.return_value = {"best_idx": 0, "max_prob": 0.9, "probs": [0.9]*34}
        data = create_dummy_image()
        
        with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
            futures = [executor.submit(is_fashion_image, data) for _ in range(10)]
            results = [f.result() for f in futures]
            
        assert all(results)
