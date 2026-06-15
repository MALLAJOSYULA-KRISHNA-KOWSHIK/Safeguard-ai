import os
from ultralytics import YOLO
import cv2
import numpy as np


class PPEDetector:
    VIOLATION_CLASSES = {'no_glove', 'no_goggles', 'no_helmet', 'no_mask', 'no_shoes'}

    def __init__(self, model_path=None, confidence=0.45):
        if model_path is None:
            model_path = os.path.join(
                os.path.dirname(__file__),
                "..",
                "ai_engine",
                "runs",
                "detect",
                "train-2",
                "weights",
                "best.pt",
            )
        self.model = YOLO(model_path)
        self.confidence = confidence

    def detect_frame(self, frame: np.ndarray) -> dict:
        results = self.model(frame, conf=self.confidence, imgsz=640, verbose=False)
        detections = []
        violations = []

        for r in results:
            for box in r.boxes:
                cls_name = self.model.names[int(box.cls)]
                detection = {
                    "class": cls_name,
                    "confidence": float(box.conf),
                    "bbox": box.xyxy[0].tolist(),
                    "is_violation": cls_name in self.VIOLATION_CLASSES
                }
                detections.append(detection)
                if detection["is_violation"]:
                    violations.append(detection)

        return {"detections": detections, "violations": violations, "frame_clean": len(violations) == 0}

    def annotate_frame(self, frame: np.ndarray, detections: list) -> np.ndarray:
        annotated = frame.copy()
        for det in detections:
            color = (0, 255, 0) if not det["is_violation"] else (0, 0, 255)
            x1, y1, x2, y2 = [int(v) for v in det["bbox"]]
            cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 2)
            cv2.putText(
                annotated,
                f"{det['class']} {det['confidence']:.2f}",
                (x1, y1 - 10),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.5,
                color,
                2,
            )
        return annotated
