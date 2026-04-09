import logging
import io
from PIL import Image

# Setup logging
logging.basicConfig(level=logging.INFO)

from .fashion_validator import validate_fashion_image, is_fashion_image
from .batch import validate_fashion_images_batch
from .metrics import get_metrics, export_metrics

def create_example_image():
    # Create a 224x224 gray square
    img = Image.new('RGB', (224, 224), color=(128, 128, 128))
    img_byte_arr = io.BytesIO()
    img.save(img_byte_arr, format='JPEG')
    return img_byte_arr.getvalue()

def main():
    print("--- FashionVision Example Usage ---")
    
    # 1. Single validation
    print("\n[Case 1] Single Validation:")
    image_bytes = create_example_image()
    # Note: CLIP might predict this as non-fashion if it's just a gray square, 
    # but let's see how the system handles it.
    result = validate_fashion_image(image_bytes)
    print(f"Is Fashion: {result['is_fashion']}")
    print(f"Subject: {result['detected_subject']}")
    print(f"Reason: {result['reason']}")

    # 2. Batch Validation
    print("\n[Case 2] Batch Validation (Parallel):")
    images = [image_bytes] * 3
    results = validate_fashion_images_batch(images, parallel=True)
    for i, res in enumerate(results):
        print(f"Image {i+1}: {res['is_fashion']} ({res['detected_subject']})")

    # 3. Metrics
    print("\n[Case 3] Metrics Export:")
    current_metrics = get_metrics()
    print(f"Total Validations: {current_metrics['total_validations']}")
    print(f"Avg Inference Time: {current_metrics['avg_inference_time_ms']:.2f}ms")
    print(f"Approval Rate: {current_metrics['approval_rate']:.1f}%")
    
    # Export for Prometheus
    prom_data = export_metrics(format='prometheus')
    print("\nPrometheus Metrics (first 5 lines):")
    print("\n".join(prom_data.split('\n')[:5]))

if __name__ == "__main__":
    main()
