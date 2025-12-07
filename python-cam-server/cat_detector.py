#!/usr/bin/env python3
"""
Cat Face Detection with Feeder State Machine & Google Sheet Logging
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
STREAM_URL = "http://10.158.22.107:81/stream"
CASCADE_FILENAME = 'haarcascade_frontalcatface.xml'

# Blynk API
FEEDER_API_URL_OPEN = "https://blynk.cloud/external/api/update?token=g-bdAArnro7kshKZ7LR4WB6nrya8iH9I&V4=1"
FEEDER_API_URL_CLOSE = "https://blynk.cloud/external/api/update?token=g-bdAArnro7kshKZ7LR4WB6nrya8iH9I&V4=0"

# Google Sheet API (ADDED)
GOOGLE_SHEET_URL = "https://script.google.com/macros/s/AKfycbxMkEDfAY4H6qHA4m_PYA7CfTSJc7RJhyZtuLFwGn2i38mE7Uxy7UVkYE1RI4zBUL-KjQ/exec"

COOLDOWN_HOURS = 2  # <--- ระยะเวลา Cooldown (ชั่วโมง)

class CatDetector:
    def __init__(self, stream_url):
        """Initialize the cat detector"""
        self.stream_url = stream_url
        self.stream_handler = None
        self.bytes_buffer = b''
        self.frame_count = 0
        
        # --- ส่วนจัดการ State การให้อาหาร ---
        self.last_feed_time = 0
        self.cooldown_seconds = COOLDOWN_HOURS * 3600  # แปลงชั่วโมงเป็นวินาที
        
        # --- ส่วนโหลดโมเดล Haar Cascade ---
        cascade_path = os.path.join(cv2.data.haarcascades, CASCADE_FILENAME)
        if not os.path.exists(cascade_path):
            cascade_path = CASCADE_FILENAME

        logger.info(f"Loading Cascade Classifier from: {cascade_path}")
        self.model = cv2.CascadeClassifier(cascade_path)
        
        if self.model.empty():
            logger.error("Error: Could not load cascade classifier XML file!")
            raise SystemExit("Exit: Model not found")
            
    def connect_stream(self):
        """Connect using requests library"""
        try:
            self.stream_handler = requests.get(self.stream_url, stream=True, timeout=30)
            if self.stream_handler.status_code == 200:
                self.bytes_buffer = b'' 
                return True
            else:
                logger.error(f"Failed to connect: {self.stream_handler.status_code}")
                return False
        except Exception as e:
            logger.error(f"Connection failed: {e}")
            return False
    
    def get_frame_from_stream(self):
        """Get frame using requests stream"""
        if not self.stream_handler: return False, None
        try:
            for chunk in self.stream_handler.iter_content(chunk_size=1024):
                self.bytes_buffer += chunk
                a = self.bytes_buffer.find(b'\xff\xd8')
                b = self.bytes_buffer.find(b'\xff\xd9')
                if a != -1 and b != -1:
                    jpg = self.bytes_buffer[a:b+2]
                    self.bytes_buffer = self.bytes_buffer[b+2:] 
                    frame = cv2.imdecode(np.frombuffer(jpg, dtype=np.uint8), cv2.IMREAD_COLOR)
                    if frame is not None: return True, frame
                    break
        except Exception as e:
            logger.error(f"Stream read error: {e}")
            return False, None
        return False, None
    
    def detect_cats(self, frame):
        """Detect cat faces"""
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        faces = self.model.detectMultiScale(
            gray, scaleFactor=1.1, minNeighbors=5, minSize=(30, 30)
        )
        cats_detected = []
        for (x, y, w, h) in faces:
            cats_detected.append({'bbox': (x, y, x + w, y + h)})
        return cats_detected

    def call_feeder_api(self):
        """Function to call API (Run in separate thread)"""
        # ฟังก์ชันนี้ทำงานใน Thread แยก
        try:
            # 1. สั่งเปิดเครื่องให้อาหาร (Blynk)
            logger.info(">> FEEDER: OPENING...")
            response = requests.get(FEEDER_API_URL_OPEN) 
            if response.status_code == 200:
                logger.info("Blynk Open Success")
            else:
                logger.warning(f"Blynk Open Failed: {response.status_code}")

            # ---------------------------------------------------------
            # 2. ส่งข้อมูลเข้า Google Sheet (NEW)
            # ---------------------------------------------------------
            logger.info(">> LOGGING TO GOOGLE SHEET...")
            try:
                # ส่ง GET Request พร้อม param pic=""
                sheet_response = requests.get(GOOGLE_SHEET_URL, params={'pic': "eiei"})
                
                if sheet_response.status_code == 200:
                     logger.info("Google Sheet Log Success")
                else:
                     logger.warning(f"Google Sheet Log Failed: {sheet_response.status_code}")
            except Exception as e:
                logger.error(f"Failed to call Google Sheet: {e}")
            # ---------------------------------------------------------

            # 3. รอ 1 วินาที
            time.sleep(1)

            # 4. สั่งปิดเครื่องให้อาหาร (Blynk)
            logger.info(">> FEEDER: CLOSING...")
            response = requests.get(FEEDER_API_URL_CLOSE) 
            if response.status_code == 200:
                logger.info("Blynk Close Success")
            else:
                logger.warning(f"Blynk Close Failed: {response.status_code}")
            
            logger.info(">> FEEDING SEQUENCE COMPLETE <<")
            
        except Exception as e:
            logger.error(f"Failed to call API Sequence: {e}")

    def process_feeding_logic(self, cats_detected):
        """Check logic for feeding"""
        if not cats_detected:
            return

        current_time = time.time()
        time_diff = current_time - self.last_feed_time

        # เช็คว่าพ้นช่วง Cooldown หรือยัง
        if time_diff > self.cooldown_seconds:
            logger.info("Cat detected! State: READY -> FEEDING")
            
            # 1. อัปเดตเวลาล่าสุดทันที (กันไม่ให้เข้า loop ยิงซ้ำ)
            self.last_feed_time = current_time
            
            # 2. เรียก API (ใช้ Thread เพื่อไม่ให้วิดีโอกระตุก)
            # ตัว Thread จะไปเรียก call_feeder_api ซึ่งข้างในมีทั้ง Blynk และ Google Sheet
            t = threading.Thread(target=self.call_feeder_api)
            t.start()
        else:
            # อยู่ในช่วง Cooldown ไม่ทำอะไร
            pass

    def draw_interface(self, frame, cats_detected):
        """Draw detections and status"""
        # วาดกรอบแมว
        for cat in cats_detected:
            x1, y1, x2, y2 = cat['bbox']
            cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 0), 2)
            cv2.putText(frame, "Cat", (x1, y1-10), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)

        # คำนวณสถานะเพื่อแสดงผล
        current_time = time.time()
        time_remaining = self.cooldown_seconds - (current_time - self.last_feed_time)
        
        # สร้างแถบสถานะด้านล่าง
        h, w = frame.shape[:2]
        cv2.rectangle(frame, (0, h-40), (w, h), (0, 0, 0), -1)
        
        if time_remaining <= 0:
            status_text = "STATE: READY TO FEED"
            color = (0, 255, 0) # เขียว
        else:
            m, s = divmod(int(time_remaining), 60)
            h_rem, m = divmod(m, 60)
            status_text = f"STATE: COOLDOWN ({h_rem:02d}:{m:02d}:{s:02d})"
            color = (0, 0, 255) # แดง

        cv2.putText(frame, status_text, (10, h-10), cv2.FONT_HERSHEY_SIMPLEX, 0.7, color, 2)
        return frame
    
    def run(self):
        """Main loop"""
        if not self.connect_stream(): return
        
        logger.info("Starting detection... Press 'q' to quit")
        
        try:
            while True:
                ret, frame = self.get_frame_from_stream()
                if not ret:
                    if self.stream_handler: self.stream_handler.close()
                    self.connect_stream()
                    continue
                
                self.frame_count += 1
                
                # 1. Detect
                cats_detected = self.detect_cats(frame)
                
                # 2. Process Logic (State Machine)
                self.process_feeding_logic(cats_detected)
                
                # 3. Draw UI
                frame = self.draw_interface(frame, cats_detected)
                
                # 4. Show
                cv2.imshow('Smart Cat Feeder', frame)
                
                if cv2.waitKey(1) & 0xFF == ord('q'):
                    break
        
        except KeyboardInterrupt:
            logger.info("Interrupted")
        finally:
            if self.stream_handler: self.stream_handler.close()
            cv2.destroyAllWindows()

if __name__ == "__main__":
    detector = CatDetector(STREAM_URL)
    detector.run()