# Cat Detection from IP Camera Stream

This script uses **YOLOv8** to detect cats in real-time from your ESP32-CAM stream.

## Features

- 🐱 Real-time cat detection using YOLOv8 (open-source model)
- 📹 Streams from ESP32-CAM at `http://10.17.120.107:81/stream`
- 📊 Live display with bounding boxes and confidence scores
- 🎥 Optional video saving capability
- 🔄 Automatic reconnection if stream drops

## Requirements

- Python 3.8+
- pip (Python package manager)

## Installation

1. **Install dependencies:**
```bash
pip install -r requirements.txt
```

This will install:
- `opencv-python` - For video processing
- `ultralytics` - YOLOv8 framework
- `torch` - Deep learning framework (pre-trained weights)
- `torchvision` - Vision utilities
- `numpy` - Numerical computing
- `Pillow` - Image processing

## Usage

### Basic Usage

```bash
python cat_detector.py
```

The script will:
1. Load YOLOv8 model (nano version for fast inference)
2. Connect to the IP camera stream
3. Detect cats in real-time
4. Display the video with bounding boxes around detected cats
5. Log detections to console

### Press `q` to quit the application

## Configuration

Edit `cat_detector.py` to modify:

```python
STREAM_URL = "http://10.17.120.107:81/stream"  # Camera stream URL
MODEL_NAME = "yolov8n.pt"                       # Model size (n=nano, s=small, m=medium, l=large, x=xlarge)
CONFIDENCE_THRESHOLD = 0.5                      # Detection confidence (0-1)
```

## Model Sizes

- **yolov8n** (nano) - Fastest, lowest accuracy - ~3ms inference
- **yolov8s** (small) - Fast, good accuracy - ~11ms inference
- **yolov8m** (medium) - Balanced - ~25ms inference
- **yolov8l** (large) - Slower, higher accuracy - ~50ms inference
- **yolov8x** (xlarge) - Slowest, best accuracy - ~97ms inference

For ESP32-CAM streams, use **nano** or **small** model for best real-time performance.

## Output

- Real-time video window showing:
  - Green bounding boxes around detected cats
  - Confidence scores
  - Frame count and number of cats detected
  - Console logs with detection information

## Optional: Save Detection Video

Modify the last line in `main()`:
```python
detector.run(save_video=True)  # Saves output to 'cat_detection.mp4'
```

## Troubleshooting

1. **Connection Error**: Check if camera stream is accessible at `http://10.17.120.107:81/stream`
2. **Slow Performance**: Use smaller model (nano) or reduce frame resolution
3. **No Cats Detected**: Adjust `CONFIDENCE_THRESHOLD` lower (0.3-0.4)
4. **GPU Memory Error**: Use smaller model or reduce input resolution

## Model Info

- **Framework**: YOLOv8 (Ultralytics)
- **Dataset**: COCO (Common Objects in Context)
- **Cat Class ID**: 15 (in COCO dataset)
- **License**: AGPL-3.0 (free for non-commercial use)

## References

- YOLOv8 Documentation: https://docs.ultralytics.com/
- COCO Dataset Classes: https://cocodataset.org/#explore
