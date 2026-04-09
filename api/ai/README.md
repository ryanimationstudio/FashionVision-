# FashionVision - Fashion Image Validator

FashionVision is a production-hardened AI module designed to classify and validate images for fashion-related applications. It uses a hybrid approach combining fast pixel-level heuristics with CLIP (Contrastive Language-Image Pre-training) zero-shot classification to ensure only high-quality, relevant fashion photography enters your system.

## Key Features

- **Hybrid Validation**: Fast cartoon/illustration detection short-circuits CLIP for non-photographic content.
- **CLIP Zero-Shot**: Classified across 34 specific prompts including global ethnic wear, formal attire, and sportswear.
- **Fail-CLOSED**: Any uncertainty (low confidence) or model failure results in immediate rejection to protect system integrity.
- **Production Ready**:
    - **Caching**: MD5 hashing + TTLCache for 100x speedup on repeated requests.
    - **Timeout Protection**: 30-second inference limit to prevent hangs.
    - **Metrics**: Detailed structured logging (JSON) and Prometheus output.
    - **Parallel Batching**: Efficiently process multiple images using standard thread pooling.
    - **Configuration**: YAML-based config with environment variable overrides.

## Installation

```bash
pip install torch torchvision transformers pillow pyyaml structlog cachetools prometheus_client
```

## Quick Start

```python
from api.ai.fashion_validator import validate_fashion_image

# Load your image bytes
with open('photo.jpg', 'rb') as f:
    image_bytes = f.read()

# Validate
result = validate_fashion_image(image_bytes)

if result['is_fashion']:
    print(f"Fashion detected: {result['detected_subject']}")
else:
    print(f"Rejected: {result['reason']}")
```

## Batch Processing

```python
from api.ai.batch import validate_fashion_images_batch

images = [img1_bytes, img2_bytes, img3_bytes]
results = validate_fashion_images_batch(images, parallel=True)

for res in results:
    print(res['is_fashion'])
```

## Configuration

Settings are managed via `fashion_vision_config.yaml`. Values can be overridden using environment variables prefixed with `FASHIONVISION_` (e.g., `FASHIONVISION_CONFIDENCE_THRESHOLD=0.45`).

| Setting | Default | Description |
|---------|---------|-------------|
| `confidence_threshold` | 0.40 | CLIP softmax probability required to pass |
| `min_image_dimension` | 224 | Minimum image size (width/height) |
| `inference_timeout_seconds` | 30 | Max time for CLIP inference |
| `cache_enabled` | true | Memory caching of results |

## Metrics

Structured logs are emitted as JSON. You can also export Prometheus format metrics.

```python
from api.ai.metrics import get_metrics, export_metrics

print(get_metrics())
# Export for Prometheus scraper
prom_data = export_metrics(format='prometheus')
```

## Testing

Run the comprehensive test suite:

```bash
python -m pytest api/ai/tests/test_fashion_vision.py
```

## License
MIT
