from paddleocr import PaddleOCR
import os
import logging

# Set logging level to reduce clutter in logs
logging.getLogger("ppocr").setLevel(logging.WARNING)

class OCRManager:
    def __init__(self):
        print("Initializing PaddleOCR (English model)...")
        # use_angle_cls is used to automatically rotate text if screenshot is rotated
        self.ocr = PaddleOCR(use_angle_cls=True, lang="en", show_log=False)

    def extract_text(self, image_path: str) -> str:
        if not os.path.exists(image_path):
            raise FileNotFoundError(f"Image not found at {image_path}")
        
        try:
            result = self.ocr.ocr(image_path, cls=True)
            text_lines = []
            if result and result[0]:
                for line in result[0]:
                    text_lines.append(line[1][0])
            return " ".join(text_lines)
        except Exception as e:
            print(f"PaddleOCR Exception: {e}")
            return ""

ocr_manager = None

def get_ocr_manager():
    global ocr_manager
    if ocr_manager is None:
        ocr_manager = OCRManager()
    return ocr_manager
