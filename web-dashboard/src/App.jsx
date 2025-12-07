import { useState, useEffect } from 'react'
import './App.css'

function App() {
  const [waterLevel, setWaterLevel] = useState(0)
  const [humidity, setHumidity] = useState(0)
  const [temperature, setTemperature] = useState(0)
  const [foodLevel, setFoodLevel] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // --- BLYNK CONFIGURATION ---
  const BLYNK_TOKEN = 'g-bdAArnro7kshKZ7LR4WB6nrya8iH9I'
  const BASE_URL = 'https://blynk.cloud/external/api'

  // --- Fetching Logic ---
  
  // V1: Water Level
  useEffect(() => {
    const fetchWaterLevel = async () => {
      try {
        const response = await fetch(`${BASE_URL}/get?token=${BLYNK_TOKEN}&V1`)
        if (response.ok) {
          const text = await response.text()
          const rawValue = parseInt(text)
          const percentage = Math.min(Math.max((rawValue / 5000) * 100, 0), 100)
          setWaterLevel(Math.round(percentage))
        }
      } catch (err) { console.error(err) }
    }
    fetchWaterLevel()
    const interval = setInterval(fetchWaterLevel, 5000)
    return () => clearInterval(interval)
  }, [])

  // V3: Humidity
  useEffect(() => {
    const fetchHumidity = async () => {
      try {
        const response = await fetch(`${BASE_URL}/get?token=${BLYNK_TOKEN}&V3`)
        if (response.ok) {
          const text = await response.text()
          setHumidity(parseFloat(text).toFixed(1))
        }
      } catch (err) { console.error(err) }
    }
    fetchHumidity()
    const interval = setInterval(fetchHumidity, 5000)
    return () => clearInterval(interval)
  }, [])

  // V2: Temperature
  useEffect(() => {
    const fetchTemperature = async () => {
      try {
        const response = await fetch(`${BASE_URL}/get?token=${BLYNK_TOKEN}&V2`)
        if (response.ok) {
          const text = await response.text()
          setTemperature(parseFloat(text).toFixed(1))
        }
      } catch (err) { console.error(err) }
    }
    fetchTemperature()
    const interval = setInterval(fetchTemperature, 5000)
    return () => clearInterval(interval)
  }, [])

  // V5: Food Level (Ultrasonic)
  useEffect(() => {
    const fetchFoodLevel = async () => {
      try {
        const response = await fetch(`${BASE_URL}/get?token=${BLYNK_TOKEN}&V5`)
        if (response.ok) {
          const text = await response.text()
          const distanceCm = parseFloat(text)
          const tankDepth = 20 
          let percentage = ((tankDepth - distanceCm) / tankDepth) * 100
          percentage = Math.min(Math.max(percentage, 0), 100)
          setFoodLevel(Math.round(percentage))
        }
      } catch (err) { console.error(err) }
    }
    fetchFoodLevel()
    const interval = setInterval(fetchFoodLevel, 5000)
    return () => clearInterval(interval)
  }, [])

  // V4: Servo
  const handleFeeding = async () => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch(`${BASE_URL}/update?token=${BLYNK_TOKEN}&V4=1`)
      if (response.ok) {
        // alert ไม่ต้องมีก็ได้ ให้ปุ่มเปลี่ยนสถานะเอา เพื่อความสวยงาม
      } else {
        setError('Connection Failed')
      }
    } catch (err) {
      setError('Network Error', err)
    } finally {
      setTimeout(() => setLoading(false), 2000) // หน่วงเวลาปุ่มสักนิดให้ดูเหมือนทำงานเสร็จ
    }
  }

  return (
    <div className="min-h-screen p-6 sm:p-12 flex items-center justify-center">
      
      <div className="max-w-5xl w-full grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
        
        {/* LEFT COLUMN: Main Action & Mascot */}
        <div className="flex flex-col items-center justify-center space-y-8">
          
          <div className="text-center float">
            <h1 className="text-6xl font-black text-amber-500 drop-shadow-sm tracking-wide">
              Neko<span className="text-gray-700">Feed</span>
            </h1>
            <p className="text-gray-500 text-xl mt-2 font-medium">Smart Care for Your Cat 🐾</p>
          </div>

          {/* Big Feeding Button */}
          <div className="relative group w-full max-w-sm">
            <div className="absolute -inset-1 bg-gradient-to-r from-pink-400 to-orange-400 rounded-[50px] blur opacity-75 group-hover:opacity-100 transition duration-1000 group-hover:duration-200 animate-pulse"></div>
            <button
              onClick={handleFeeding}
              disabled={loading}
              className="paw-btn relative w-full py-12 px-8 flex flex-col items-center justify-center space-y-4"
            >
              <span className="text-7xl filter drop-shadow-lg">
                {loading ? '🤤' : '🐟'}
              </span>
              <span className="text-2xl font-bold text-white tracking-wider uppercase">
                {loading ? 'Yummy Time...' : 'Feed Me Now!'}
              </span>
            </button>
            {error && <p className="text-red-500 text-center mt-2 font-bold bg-white/80 rounded-lg py-1 px-3">{error}</p>}
          </div>

          {/* Mascot Decoration (Optional ASCII or Emoji Art) */}
          <div className="text-center opacity-50">
            <pre className="text-xs sm:text-sm font-mono text-amber-700 leading-none">
{`      |\\__/,|   (\`\\
    _.|o o  |_   ) )
-(((---(((----------------`}
            </pre>
          </div>
        </div>


        {/* RIGHT COLUMN: Dashboard Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">

            {/* Food Level (Big Card) */}
            <div className="cat-card cat-ears ear-orange sm:col-span-2 p-6 flex flex-col items-center bg-orange-50/50">
                <div className="w-full flex justify-between items-center mb-4">
                    <h3 className="text-xl font-bold text-amber-600">📦 Food Stock</h3>
                    <span className="text-2xl">🍗</span>
                </div>
                <div className="text-5xl font-black text-amber-500 mb-4">{foodLevel}%</div>
                <div className="w-full h-8 bg-white rounded-full border-2 border-amber-100 p-1">
                    <div 
                        className="h-full rounded-full bg-gradient-to-r from-yellow-300 to-amber-500 liquid-bar transition-all duration-700 ease-out"
                        style={{ width: `${foodLevel}%` }}
                    ></div>
                </div>
            </div>

            {/* Water Level */}
            <div className="cat-card cat-ears ear-blue p-6 flex flex-col items-center bg-blue-50/50">
                <div className="text-3xl mb-2">💧</div>
                <h3 className="text-lg font-bold text-blue-400 mb-1">Water</h3>
                <p className="text-4xl font-bold text-blue-500 mb-3">{waterLevel}%</p>
                <div className="w-full h-4 bg-blue-100 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-400 transition-all duration-500" style={{ width: `${waterLevel}%` }}></div>
                </div>
            </div>

             {/* Temperature */}
             <div className="cat-card cat-ears ear-red p-6 flex flex-col items-center bg-red-50/50">
                <div className="text-3xl mb-2">🌡️</div>
                <h3 className="text-lg font-bold text-red-400 mb-1">Temp</h3>
                <p className="text-4xl font-bold text-red-500 mb-3">{temperature}°</p>
                <div className="text-xs text-red-300">Room Condition</div>
            </div>

             {/* Humidity */}
             <div className="cat-card cat-ears ear-green p-6 flex flex-col items-center bg-green-50/50">
                <div className="text-3xl mb-2">☁️</div>
                <h3 className="text-lg font-bold text-green-500 mb-1">Humidity</h3>
                <p className="text-4xl font-bold text-green-600 mb-3">{humidity}%</p>
                <div className="text-xs text-green-400">Moisture Level</div>
            </div>

        </div>

      </div>
    </div>
  )
}

export default App