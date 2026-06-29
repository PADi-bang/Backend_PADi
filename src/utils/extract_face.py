import sys
import json
import os
import cv2
import numpy as np
import mediapipe as mp

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"status": "error", "message": "Image path argument is missing"}))
        sys.exit(1)

    image_path = sys.argv[1]
    
    if not os.path.exists(image_path):
        print(json.dumps({"status": "error", "message": "File not found"}))
        sys.exit(1)

    try:
        try:
            import tflite_runtime.interpreter as tflite
        except ImportError:
            import tensorflow.lite.python.interpreter as tflite
    except ImportError:
         print(json.dumps({"status": "error", "message": "tflite_runtime or tensorflow not installed"}))
         sys.exit(1)

    # Resolve paths
    # We are in backend/src/utils/extract_face.py
    # Model should be at backend/public/models/mobilefacenet.tflite
    base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    model_path = os.path.join(base_dir, 'public', 'models', 'mobilefacenet.tflite')

    if not os.path.exists(model_path):
        print(json.dumps({"status": "error", "message": f"Model not found at {model_path}"}))
        sys.exit(1)

    # 1. Load image using OpenCV
    image = cv2.imread(image_path)
    if image is None:
        print(json.dumps({"status": "error", "message": "Could not read image file"}))
        sys.exit(1)

    # OpenCV uses BGR by default, MediaPipe needs RGB
    image_rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
    h, w, _ = image.shape

    # 2. Detect face using MediaPipe
    mp_face_detection = mp.solutions.face_detection
    with mp_face_detection.FaceDetection(model_selection=1, min_detection_confidence=0.5) as face_detection:
        results = face_detection.process(image_rgb)
        
        if not results.detections:
            print(json.dumps({"status": "error", "message": "Wajah tidak terdeteksi"}))
            sys.exit(0) # Not 1, so Node.js can handle the logic properly
            
        detection = results.detections[0]
        bboxC = detection.location_data.relative_bounding_box
        
        xmin = int(bboxC.xmin * w)
        ymin = int(bboxC.ymin * h)
        width = int(bboxC.width * w)
        height = int(bboxC.height * h)

        # Expand bounding box slightly to match BlazeFace / ML Kit behavior (inner core vs full head)
        # MediaPipe usually returns the inner core. 
        # For MobileFaceNet, we usually need the face properly framed.
        rawCropW = width
        rawCropH = height
        rawCropX = xmin
        rawCropY = ymin

        baseCropW = rawCropW * 1.35
        baseCropH = rawCropH * 1.35
        baseCropX = rawCropX - (rawCropW * 0.175)
        baseCropY = rawCropY - (rawCropH * 0.25)

        # Square Crop
        maxDimension = max(baseCropW, baseCropH)
        centerX = baseCropX + baseCropW / 2
        centerY = baseCropY + baseCropH / 2

        cropX = max(0, int(centerX - maxDimension / 2))
        cropY = max(0, int(centerY - maxDimension / 2))
        cropW = int(maxDimension)
        cropH = int(maxDimension)

        # Validate boundaries
        if cropX + cropW > w:
            cropW = w - cropX
        if cropY + cropH > h:
            cropH = h - cropY

        # Prevent empty crop
        if cropW <= 0 or cropH <= 0:
            print(json.dumps({"status": "error", "message": "Invalid crop boundaries"}))
            sys.exit(0)

        cropped_face = image_rgb[cropY:cropY+cropH, cropX:cropX+cropW]

        # 3. Resize to 112x112
        resized_face = cv2.resize(cropped_face, (112, 112))

        # 4. Normalize to [-1, 1]
        normalized_face = (resized_face.astype(np.float32) - 127.5) / 127.5
        input_data = np.expand_dims(normalized_face, axis=0)

        # 5. Run MobileFaceNet
        interpreter = tflite.Interpreter(model_path=model_path)
        interpreter.allocate_tensors()

        input_details = interpreter.get_input_details()
        output_details = interpreter.get_output_details()

        interpreter.set_tensor(input_details[0]['index'], input_data)
        interpreter.invoke()

        embedding = interpreter.get_tensor(output_details[0]['index'])[0]

        # Print success
        print(json.dumps({"status": "success", "embedding": embedding.tolist()}))

if __name__ == '__main__':
    main()
