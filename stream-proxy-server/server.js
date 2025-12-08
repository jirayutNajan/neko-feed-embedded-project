const express = require('express');
const axios = require('axios');
const cors = require('cors');
const EventEmitter = require('events');

const app = express();
const PORT = process.env.PORT || 3000;
const STREAM_URL = process.env.STREAM_URL || "http://172.20.10.12:81/stream";

// --- ส่วนของการจัดการ Feed ---
const BLYNK_TOKEN = "g-bdAArnro7kshKZ7LR4WB6nrya8iH9I";
const BLYNK_URL_ON = `https://blynk.cloud/external/api/update?token=${BLYNK_TOKEN}&V4=1`;
const BLYNK_URL_OFF = `https://blynk.cloud/external/api/update?token=${BLYNK_TOKEN}&V4=0`;

// ตัวแปรควบคุมการให้อาหาร
let canFeed = true;
let lastFeedTime = null; // เก็บเวลาล่าสุดที่กด feed
const FEED_COOLDOWN = 2 * 60 * 60 * 1000; // 2 ชั่วโมง (ในหน่วยมิลลิวินาที)
// --------------------------

app.use(cors());

// ตัวกระจายสัญญาณ (Event Emitter)
const streamEmitter = new EventEmitter();
streamEmitter.setMaxListeners(100); 

let isStreaming = false;

// ฟังก์ชันเชื่อมต่อกล้อง (คงเดิม)
const startStreamSource = async () => {
    if (isStreaming) return;

    console.log(`Connecting to camera source: ${STREAM_URL}`);
    try {
        const response = await axios({
            method: 'GET',
            url: STREAM_URL,
            responseType: 'stream',
            timeout: 0,
            validateStatus: (status) => status < 500,
        });

        isStreaming = true;
        console.log("Connected to camera source!");

        response.data.on('data', (chunk) => {
            streamEmitter.emit('data', chunk);
        });

        response.data.on('end', () => {
            console.log("Camera stream ended. Reconnecting...");
            isStreaming = false;
            setTimeout(startStreamSource, 2000);
        });

        response.data.on('error', (err) => {
            console.error("Camera stream error:", err.message);
            isStreaming = false;
        });

    } catch (error) {
        console.error('Failed to connect to camera:', error.message);
        isStreaming = false;
        setTimeout(startStreamSource, 5000);
    }
};

startStreamSource();

// --- API สำหรับการ Streaming ---
app.get('/stream', (req, res) => {
    res.writeHead(200, {
        'Content-Type': 'multipart/x-mixed-replace; boundary=123456789000000000000987654321',
        'Connection': 'keep-alive',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'Access-Control-Allow-Origin': '*'
    });

    const onData = (chunk) => {
        res.write(chunk);
    };

    streamEmitter.on('data', onData);

    req.on('close', () => {
        streamEmitter.removeListener('data', onData);
    });
    
    if (!isStreaming) {
        startStreamSource();
    }
});

// --- API ใหม่: สั่งให้อาหาร (/feed) ---
app.get('/feed', async (req, res) => {
    // 1. เช็คว่ากดได้หรือยัง
    if (!canFeed) {
        // คำนวณเวลาที่เหลือ
        let nextFeed = new Date(lastFeedTime.getTime() + FEED_COOLDOWN);
        return res.status(429).json({ 
            success: false, 
            message: 'ยังไม่ครบ 2 ชั่วโมง', 
            lastFeedTime: lastFeedTime,
            nextFeedAvailableAt: nextFeed
        });
    }

    try {
        // ล็อคทันทีเพื่อกันคนกดรัวๆ
        canFeed = false;
        lastFeedTime = new Date();

        console.log(`Starting Feed process at ${lastFeedTime}`);

        // 2. เรียก API Blynk V4 = 1
        await axios.get(BLYNK_URL_ON);
        console.log("Blynk V4 set to 1");

        // 3. รอ 1 วินาที
        await new Promise(resolve => setTimeout(resolve, 1000));

        // 4. เรียก API Blynk V4 = 0
        await axios.get(BLYNK_URL_OFF);
        console.log("Blynk V4 set to 0");

        // 5. ตั้งเวลา 2 ชั่วโมง เพื่อปลดล็อคให้กดได้ใหม่
        console.log("Cooldown started: 2 hours");
        setTimeout(() => {
            canFeed = true;
            console.log("Cooldown finished. Can feed again.");
        }, FEED_COOLDOWN);

        res.json({ 
            success: true, 
            message: 'ให้อาหารสำเร็จ เริ่มนับเวลา 2 ชั่วโมง',
            timestamp: lastFeedTime 
        });

    } catch (error) {
        console.error("Feed Error:", error.message);
        // กรณี Error อาจจะเลือกเปิด canFeed ให้กดใหม่ได้ หรือจะล็อคไว้ก็ได้
        // ในที่นี้ขอเปิดคืนให้เผื่อระบบเน็ตมีปัญหาจะได้ลองใหม่
        canFeed = true; 
        lastFeedTime = null;
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการเรียก Blynk API' });
    }
});

// ... (Code ส่วนบนเหมือนเดิม) ...

// --- API ใหม่: ดูเวลาแบบ Real-time (SSE) (/time) ---
app.get('/time', (req, res) => {
    // 1. ตั้ง Header สำหรับ Server-Sent Events (SSE)
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*'
    });

    // ฟังก์ชันส่งข้อมูล
    const sendTimeUpdate = () => {
        let responseData;

        if (canFeed) {
            // กรณีให้อาหารได้ (User ขอ: return canfeed: false ซึ่งน่าจะหมายถึง "สถานะติด cooldown = false")
            responseData = {
                cooldown: false,
                message: "Ready to feed"
            };
        } else {
            // กรณีติด Cooldown (User ขอ: return เวลา)
            const now = new Date().getTime();
            const target = lastFeedTime.getTime() + FEED_COOLDOWN;
            const remaining = target - now;

            if (remaining <= 0) {
                // ถ้านับถอยหลังหมดแล้ว แต่ตัวแปรยังไม่เปลี่ยน
                canFeed = true;
                responseData = {
                    cooldown: false,
                    message: "Cooldown finished"
                };
            } else {
                // คำนวณเวลาที่เหลือเป็น ชั่วโมง:นาที:วินาที
                const hours = Math.floor((remaining / (1000 * 60 * 60)) % 24);
                const minutes = Math.floor((remaining / (1000 * 60)) % 60);
                const seconds = Math.floor((remaining / 1000) % 60);

                responseData = {
                    cooldown: true,
                    remainingMs: remaining, // ส่งหน่วย ms ไปเผื่อ Frontend ใช้คำนวณ
                    remainingTime: `${hours}h ${minutes}m ${seconds}s` // ส่งข้อความให้อ่านง่าย
                };
            }
        }

        // ส่งข้อมูลในรูปแบบ SSE: "data: {json}\n\n"
        res.write(`data: ${JSON.stringify(responseData)}\n\n`);
    };

    // ส่งข้อมูลทันทีที่เชื่อมต่อ
    sendTimeUpdate();

    // ตั้ง Loop ส่งข้อมูลทุก 1 วินาที
    const intervalId = setInterval(sendTimeUpdate, 1000);

    // เมื่อ Client ปิด Connection ให้หยุด Loop
    req.on('close', () => {
        clearInterval(intervalId);
        // console.log('Client disconnected from time stream');
    });
});

// ... (Code ส่วนล่างเหมือนเดิม) ...

app.get('/health', (req, res) => {
    res.json({ status: isStreaming ? 'connected' : 'disconnected', listeners: streamEmitter.listenerCount('data') });
});

app.listen(PORT, () => {
    console.log(`Broadcast server running on http://localhost:${PORT}`);
});