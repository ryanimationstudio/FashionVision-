import concurrent.futures
import logging
from typing import List, Dict

from . import fashion_validator

logger = logging.getLogger(__name__)

def validate_fashion_images_batch(image_list: List[bytes], parallel: bool = True) -> List[Dict]:
    """
    Validate multiple images efficiently.
    
    Args:
      image_list: List of image byte strings
      parallel: Use ThreadPoolExecutor for parallel processing
    
    Returns:
      List of validation results (same format as validate_fashion_image)
    """
    if not image_list:
        return []
        
    results = [None] * len(image_list)
    
    if parallel:
        with concurrent.futures.ThreadPoolExecutor() as executor:
            # We map index to future so we can preserve order
            future_to_index = {
                executor.submit(fashion_validator.validate_fashion_image, img): i 
                for i, img in enumerate(image_list)
            }
            
            for future in concurrent.futures.as_completed(future_to_index):
                index = future_to_index[future]
                try:
                    result = future.result()
                    results[index] = result
                except Exception as e:
                    logger.error("Batch parallel execution failed for image %d: %s", index, e)
                    results[index] = {
                        "is_fashion": False,
                        "detected_subject": "error",
                        "reason": f"Execution failed: {str(e)}"
                    }
    else:
        for i, img in enumerate(image_list):
            try:
                results[i] = fashion_validator.validate_fashion_image(img)
            except Exception as e:
                logger.error("Batch sequential execution failed for image %d: %s", i, e)
                results[i] = {
                    "is_fashion": False,
                    "detected_subject": "error",
                    "reason": f"Execution failed: {str(e)}"
                }
                
    return results
