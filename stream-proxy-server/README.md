# Stream Proxy Server

Express.js server ที่รับสตรีมภาพจาก URL ภายนอกและสตรีมต่อให้ client

## การติดตั้ง

```bash
npm install
```

## การใช้งาน

### เริ่มต้น server

```bash
npm start
```

หรือใช้ nodemon สำหรับ development:

```bash
npm run dev
```

### ตั้งค่า Environment Variables (Optional)

```bash
PORT=3000
STREAM_URL=http://10.158.22.107:81/stream
```

Default values:
- PORT: 3000
- STREAM_URL: http://10.158.22.107:81/stream

## Endpoints

- `GET /` - ข้อมูลเกี่ยวกับ server
- `GET /stream` - สตรีมภาพจาก source URL
- `GET /health` - Health check endpoint

## ตัวอย่างการใช้งาน

เปิด browser ไปที่:
```
http://localhost:3000/stream
```

หรือใช้ใน HTML:
```html
<img src="http://localhost:3000/stream" />
```

