#!/usr/bin/env python3
"""
Cat Detection - SSD MobileNet V2 (Local File Version)
"""

import cv2
import numpy as np
import requests
import logging
import os
import time
import threading

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# --- CONFIGURATION ---
STREAM_URL = "http://localhost:3000/stream"

# ชื่อไฟล์ Model (ต้องวางไว้โฟลเดอร์เดียวกับไฟล์ Python นี้)
MODEL_WEIGHTS = "frozen_inference_graph.pb"
MODEL_CONFIG = "ssd_mobilenet_v2_coco_2018_03_29.pbtxt"

# API Settings
FEEDER_API_URL_OPEN = "http://localhost:3000/feed"
GOOGLE_SHEET_URL = "https://script.google.com/macros/s/AKfycbxMkEDfAY4H6qHA4m_PYA7CfTSJc7RJhyZtuLFwGn2i38mE7Uxy7UVkYE1RI4zBUL-KjQ/exec"

class CatDetectorDNN:
    def __init__(self, stream_url):
        self.stream_url = stream_url
        self.stream_handler = None
        self.bytes_buffer = b''
        self.is_api_running = False
        
        # --- ตรวจสอบไฟล์ Model ในเครื่อง ---
        if not os.path.exists(MODEL_WEIGHTS) or not os.path.exists(MODEL_CONFIG):
            logger.error("!!! MODEL FILES NOT FOUND !!!")
            logger.error(f"Missing: {MODEL_WEIGHTS} or {MODEL_CONFIG}")
            logger.error("Please download them manually and place in this folder.")
            raise SystemExit("Exit: Missing model files")

        logger.info("Loading Neural Network from local files...")
        try:
            # โหลด Model จากไฟล์ในเครื่อง
            self.net = cv2.dnn.readNetFromTensorflow(MODEL_WEIGHTS, MODEL_CONFIG)
            
            # ตั้งค่าให้ใช้ CPU (ถ้ามี GPU ให้เปลี่ยนเป็น CUDA ได้)
            self.net.setPreferableBackend(cv2.dnn.DNN_BACKEND_OPENCV)
            self.net.setPreferableTarget(cv2.dnn.DNN_TARGET_CPU)
            
            logger.info(">>> MODEL LOADED SUCCESSFULLY <<<")
        except Exception as e:
            logger.error(f"Error loading model: {e}")
            raise SystemExit("Exit: Model load failed")

    def connect_stream(self):
        try:
            logger.info(f"Connecting to stream: {self.stream_url}")
            if self.stream_handler:
                try: self.stream_handler.close()
                except: pass
            self.stream_handler = requests.get(self.stream_url, stream=True, timeout=10)
            if self.stream_handler.status_code == 200:
                self.bytes_buffer = b'' 
                return True
            return False
        except Exception as e:
            logger.error(f"Connection failed: {e}")
            return False
    
    def get_frame(self):
        if not self.stream_handler: return False, None
        try:
            for chunk in self.stream_handler.iter_content(chunk_size=4096):
                self.bytes_buffer += chunk
                a = self.bytes_buffer.find(b'\xff\xd8')
                if a != -1:
                    b = self.bytes_buffer.find(b'\xff\xd9', a)
                    if b != -1:
                        jpg = self.bytes_buffer[a:b+2]
                        self.bytes_buffer = self.bytes_buffer[b+2:] 
                        if len(jpg) > 0:
                            try:
                                frame = cv2.imdecode(np.frombuffer(jpg, dtype=np.uint8), cv2.IMREAD_COLOR)
                                if frame is not None: return True, frame
                            except: pass
                        break
        except: return False, None
        return False, None
    
    def detect_cats(self, frame):
        h, w = frame.shape[:2]
        
        # Resize เป็น 300x300 เพื่อส่งให้ AI
        blob = cv2.dnn.blobFromImage(frame, size=(300, 300), swapRB=True, crop=False)
        self.net.setInput(blob)
        detections = self.net.forward()
        
        cats_detected = []
        for i in range(detections.shape[2]):
            confidence = detections[0, 0, i, 2]
            
            # กรองความมั่นใจ (ปรับได้: 0.3 - 0.5)
            if confidence > 0.4:  
                class_id = int(detections[0, 0, i, 1])
                
                # Class 17 = Cat (COCO Standard)
                if class_id == 17: 
                    box = detections[0, 0, i, 3:7] * np.array([w, h, w, h])
                    (startX, startY, endX, endY) = box.astype("int")
                    
                    # ป้องกันกรอบหลุดจอ
                    startX, startY = max(0, startX), max(0, startY)
                    endX, endY = min(w, endX), min(h, endY)
                    
                    cats_detected.append({'bbox': (startX, startY, endX, endY), 'conf': confidence})

        if cats_detected:
            logger.info(f"Found {len(cats_detected)} cat(s)")
        return cats_detected

    def call_feeder_api(self):
        """ยิง API สั่งให้อาหารและลง Log"""
        try:
            logger.info(">> TRIGGER: FEEDING...")
            # 1. สั่งเปิดประตู
            requests.get(FEEDER_API_URL_OPEN) 
            
            # 2. ลง Google Sheet
            try: requests.get(GOOGLE_SHEET_URL, params={'pic': "Cat Detected (DNN)"})
            except: pass
            
            logger.info(">> DONE <<")
        except Exception as e:
            logger.error(f"API Error: {e}")
        finally:
            self.is_api_running = False

    def process_logic(self, cats):
        """ถ้าเจอแมว และไม่ได้กำลังทำงานอยู่ ให้สั่งงาน"""
        if cats and not self.is_api_running:
            self.is_api_running = True
            threading.Thread(target=self.call_feeder_api).start()

    def draw_ui(self, frame, cats):
        h, w = frame.shape[:2]
        
        # วาดกรอบแมว
        for cat in cats:
            x1, y1, x2, y2 = cat['bbox']
            conf = cat['conf'] * 100
            
            cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 0), 2)
            
            label = f"CAT {conf:.0f}%"
            y_label = y1 - 10 if y1 - 10 > 10 else y1 + 10
            cv2.putText(frame, label, (x1, y_label), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 2)

        # Status Bar
        if self.is_api_running:
            status = "STATUS: FEEDING..."
            color = (0, 255, 255)
        else:
            status = "STATUS: WATCHING (Local Model)"
            color = (0, 255, 0)
            
        cv2.putText(frame, status, (10, h-10), cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2)
        return frame

    def run(self):
        if not self.connect_stream(): return
        logger.info("Starting System... Press 'q' to quit")
        
        try:
            while True:
                ret, frame = self.get_frame()
                if not ret:
                    if not self.stream_handler or self.stream_handler.raw.closed:
                        logger.warning("Stream lost, reconnecting...")
                        self.connect_stream()
                        time.sleep(1)
                    continue
                
                # 1. Detect
                cats = self.detect_cats(frame)
                
                # 2. Logic
                self.process_logic(cats)
                
                # 3. Draw
                frame = self.draw_ui(frame, cats)
                
                cv2.imshow('Cat Feeder AI', frame)
                if cv2.waitKey(1) & 0xFF == ord('q'): break
                
        except KeyboardInterrupt:
            logger.info("Interrupted")
        finally:
            if self.stream_handler: self.stream_handler.close()
            cv2.destroyAllWindows()

if __name__ == "__main__":
    detector = CatDetectorDNN(STREAM_URL)
    detector.run()