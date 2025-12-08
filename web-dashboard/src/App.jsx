import { useState, useEffect } from 'react'
import "./App.css"

function App() {
  // --- STATE ---
  const [waterLevel, setWaterLevel] = useState(0)
  const [humidity, setHumidity] = useState(0)
  const [temperature, setTemperature] = useState(0)
  const [foodLevel, setFoodLevel] = useState(0)
  
  // --- Vibration State ---
  const [vibration, setVibration] = useState(0) 

  // Loading & Connection
  const [feedingLoading, setFeedingLoading] = useState(false)
  const [isFirstLoad, setIsFirstLoad] = useState(true)
  const [error, setError] = useState('')
  const [isConnected, setIsConnected] = useState(false)
  const [lastUpdate, setLastUpdate] = useState(null)
  
  // Camera State
  const [cameraError, setCameraError] = useState(false)

  // --- COOLDOWN STATE ---
  const [isCooldown, setIsCooldown] = useState(false)
  const [cooldownTime, setCooldownTime] = useState('')

  // --- CONFIGURATION ---
  const SERVER_URL = 'http://localhost:3000' 
  
  // Blynk Config
  const BLYNK_TOKEN = 'g-bdAArnro7kshKZ7LR4WB6nrya8iH9I'
  const BASE_BLYNK_URL = 'https://blynk.cloud/external/api'
  const UPDATE_INTERVAL = 2000 

  // Camera URL
  const STREAM_URL = `${SERVER_URL}/stream`

  // --- 1. Realtime Timer (SSE) from Node Server ---
  useEffect(() => {
    const evtSource = new EventSource(`${SERVER_URL}/time`)

    evtSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        if (data.cooldown) {
            setIsCooldown(true)
            setCooldownTime(data.remainingTime)
        } else {
            setIsCooldown(false)
            setCooldownTime('')
        }
      } catch (e) {
        console.error("SSE Parse Error", e)
      }
    }

    evtSource.onerror = (err) => {
        console.error("Timer Stream Error:", err)
    }

    return () => {
      evtSource.close()
    }
  }, [])

  // --- 2. Sensor Fetching Loop (Blynk) ---
  useEffect(() => {
    let isMounted = true

    const fetchAllData = async () => {
      try {
        const [waterRes, humidityRes, tempRes, foodRes, vibRes] = await Promise.all([
          fetch(`${BASE_BLYNK_URL}/get?token=${BLYNK_TOKEN}&V1`),
          fetch(`${BASE_BLYNK_URL}/get?token=${BLYNK_TOKEN}&V3`),
          fetch(`${BASE_BLYNK_URL}/get?token=${BLYNK_TOKEN}&V2`),
          fetch(`${BASE_BLYNK_URL}/get?token=${BLYNK_TOKEN}&V5`),
          fetch(`${BASE_BLYNK_URL}/get?token=${BLYNK_TOKEN}&V6`)
        ])

        if (!isMounted) return

        // --- Process Data ---
        // Water Level (V1)
        if (waterRes.ok) {
          const rawValue = parseInt(await waterRes.text())
          const percentage = Math.min(Math.max((rawValue / 2200) * 100, 0), 100)
          setWaterLevel(Math.round(percentage))
        }

        // Humidity (V3)
        if (humidityRes.ok) {
          const value = parseFloat(await humidityRes.text())
          setHumidity(value.toFixed(1))
        }

        // Temperature (V2)
        if (tempRes.ok) {
          const value = parseFloat(await tempRes.text())
          setTemperature(value.toFixed(1))
        }

        // Food Level (V5)
        if (foodRes.ok) {
          const distanceCm = parseFloat(await foodRes.text())
          if(distanceCm !== 0) {
            const tankDepth = 12
            let percentage = ((tankDepth - distanceCm) / tankDepth) * 100
            percentage = Math.min(Math.max(percentage, 0), 100)
            setFoodLevel(Math.round(percentage))
          }
        }

        // Vibration (V6)
        if (vibRes.ok) {
            const val = parseInt(await vibRes.text())
            setVibration(isNaN(val) ? 0 : val)
        }

        setIsConnected(true)
        setLastUpdate(new Date())
        
      } catch (err) {
        console.error("Sensor Fetch Error:", err)
        if (isMounted) setIsConnected(false)
      } finally {
        if (isMounted) setIsFirstLoad(false)
      }
    }

    fetchAllData()
    const interval = setInterval(fetchAllData, UPDATE_INTERVAL)

    return () => {
      isMounted = false
      clearInterval(interval)
    }
  }, [])

  // --- 3. Handle Feeding via Node Server ---
  const handleFeeding = async () => {
    if (isCooldown) return

    setFeedingLoading(true)
    setError('')
    
    try {
      const response = await fetch(`${SERVER_URL}/feed`)
      const result = await response.json()

      if (response.ok && result.success) {
        console.log("Feeding success:", result.message)
      } else {
        setError(result.message || 'Server denied feeding')
      }
    } catch (err) {
      setError('Cannot connect to Feeder Server')
      console.error(err)
    } finally {
      setTimeout(() => setFeedingLoading(false), 500)
    }
  }

  const retryCamera = () => {
    setCameraError(false)
  }

  return (
    <div className="min-h-screen p-6 sm:p-12 flex items-center justify-center bg-gradient-to-br from-amber-50 via-orange-50 to-pink-50">
      
      {/* Status Bar */}
      <div className="fixed top-4 right-4 z-50 flex items-center space-x-2 bg-white rounded-full px-4 py-2 shadow-lg border-2 border-gray-100 transition-all duration-300">
        <div className={`w-3 h-3 rounded-full transition-colors duration-300 ${isConnected ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`}></div>
        <span className="text-sm font-medium text-gray-600">
          {isConnected ? 'System Online' : 'Retrying...'}
        </span>
        {lastUpdate && (
          <span className="text-xs text-gray-400 border-l pl-2 ml-1 hidden sm:inline">
            {lastUpdate.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
        )}
      </div>

      <div className="max-w-6xl w-full grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
        
        {/* LEFT COLUMN: Controls */}
        <div className="flex flex-col items-center justify-center space-y-8 lg:sticky lg:top-12">
          
          <div className="text-center">
            <h1 className="text-6xl font-black text-amber-500 drop-shadow-sm tracking-wide">
              Neko<span className="text-gray-700">Feed</span>
            </h1>
            <p className="text-gray-500 text-xl mt-2 font-medium">Smart Care for Your Cat 🐾</p>
          </div>

          {/* Big Feeding Button */}
          <div className="relative group w-full max-w-sm">
            {!isCooldown && (
                <div className={`absolute -inset-1 bg-gradient-to-r from-pink-400 to-orange-400 rounded-full blur opacity-75 group-hover:opacity-100 transition duration-1000 group-hover:duration-200 ${isConnected ? 'animate-pulse' : ''}`}></div>
            )}
            
            <button
              onClick={handleFeeding}
              disabled={feedingLoading || !isConnected || isCooldown}
              className={`relative w-full py-12 px-8 flex flex-col items-center justify-center space-y-4 rounded-full shadow-2xl transition-all duration-300 transform 
                ${isCooldown 
                    ? 'bg-gray-200 cursor-not-allowed scale-100 shadow-none' 
                    : 'bg-gradient-to-br from-orange-400 to-pink-500 hover:shadow-pink-300 hover:scale-105 active:scale-95'
                }
                disabled:opacity-80
              `}
            >
              <span className="text-7xl filter drop-shadow-lg grayscale-0 transition-all duration-300">
                {feedingLoading ? '🤤' : (isCooldown ? '⏳' : '🐟')}
              </span>
              
              <div className="flex flex-col items-center">
                <span className={`text-2xl font-bold tracking-wider uppercase ${isCooldown ? 'text-gray-500' : 'text-white'}`}>
                    {feedingLoading ? 'Serving...' : (isCooldown ? 'Wait Time' : 'Feed Me!')}
                </span>
                
                {isCooldown && (
                    <span className="text-sm font-mono text-gray-500 mt-1 bg-gray-300/50 px-3 py-1 rounded-full">
                        {cooldownTime}
                    </span>
                )}
              </div>
            </button>

            {error && <p className="text-red-500 text-center mt-2 font-bold bg-white/80 rounded-lg py-1 px-3 shadow-sm">{error}</p>}
          </div>

          {/* ASCII Cat Image */}
          <div className="text-center opacity-50 hidden lg:block">
            <pre className="text-xs sm:text-sm font-mono text-amber-700 leading-none">
{`      |\\__/,|   (\`\\
    _.|o o  |_   ) )
-(((---(((----------------`}
            </pre>
          </div>

          {/* --- MOVED HERE: Vibration Status --- */}
          <div className={`w-full max-w-sm p-4 flex items-center justify-between backdrop-blur-sm rounded-3xl shadow-lg border transition-all duration-500
              ${vibration === 1 
                  ? 'bg-rose-50 border-rose-300 shadow-rose-100' // Style when Detected
                  : 'bg-emerald-50 border-emerald-200' // Style when Normal
              }`}>
              
              <div className="flex items-center space-x-4">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center text-2xl shadow-inner
                      ${vibration === 1 ? 'bg-rose-200 animate-bounce' : 'bg-emerald-200'}
                  `}>
                      {vibration === 1 ? '🫨' : '🛡️'}
                  </div>
                  <div>
                      <h3 className={`font-bold ${vibration === 1 ? 'text-rose-700' : 'text-emerald-700'}`}>
                          Security / Motion
                      </h3>
                      <p className={`text-sm ${vibration === 1 ? 'text-rose-500 font-semibold' : 'text-emerald-500'}`}>
                          {vibration === 1 ? 'Vibration Detected!' : 'Status: Normal'}
                      </p>
                  </div>
              </div>

              {/* Status Indicator Dot */}
              <div className="flex flex-col items-center pr-2">
                  <div className={`w-4 h-4 rounded-full ${vibration === 1 ? 'bg-rose-500 animate-ping' : 'bg-emerald-400'}`}></div>
              </div>
          </div>

        </div>

        {/* RIGHT COLUMN: Camera & Sensors */}
        {isFirstLoad ? (
            <div className="w-full h-96 flex flex-col items-center justify-center text-amber-400 animate-pulse space-y-4">
                <div className="w-16 h-16 border-4 border-amber-300 border-t-transparent rounded-full animate-spin"></div>
                <span className="text-2xl font-bold">Connecting to Smart Home...</span>
            </div>
        ) : (
            <div className="space-y-6">
                
                {/* Camera Live Stream */}
                <div className="w-full bg-black rounded-3xl overflow-hidden shadow-2xl border-4 border-white relative group">
                    <div className="absolute top-4 left-4 z-10 flex items-center space-x-2 bg-black/50 backdrop-blur-md px-3 py-1 rounded-full text-white/90">
                        <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                        <span className="text-xs font-bold tracking-wider">LIVE CAM</span>
                    </div>

                    <div className="aspect-video bg-gray-900 flex items-center justify-center relative">
                        {!cameraError ? (
                            <img 
                                src={STREAM_URL}
                                alt="Cat Camera" 
                                className="w-full h-full object-cover"
                                onError={() => setCameraError(true)} 
                            />
                        ) : (
                            <div className="flex flex-col items-center text-gray-500 space-y-2 cursor-pointer p-10" onClick={retryCamera}>
                                <span className="text-4xl">📹</span>
                                <span className="text-sm font-medium">Camera Offline</span>
                                <span className="text-xs text-gray-600 bg-gray-800 px-2 py-1 rounded hover:bg-gray-700 transition">Click to Retry</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Sensors Grid (Vibration Removed from here) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    {/* 1. Food Level */}
                    <div className="sm:col-span-2 p-6 flex flex-col items-center bg-orange-50/90 backdrop-blur-sm rounded-3xl shadow-lg border border-orange-200 relative overflow-hidden">
                        <div className="w-full flex justify-between items-center mb-2">
                            <h3 className="text-lg font-bold text-amber-700">📦 Food Stock</h3>
                            <span className="text-xl">🍗</span>
                        </div>
                        <div className="flex items-end space-x-2 mb-3">
                            <span className="text-5xl font-black text-amber-500 leading-none">{foodLevel}</span>
                            <span className="text-lg font-bold text-amber-400 mb-1">%</span>
                        </div>
                        <div className="w-full h-6 bg-white rounded-full border border-amber-100 p-1 overflow-hidden">
                            <div 
                                className="h-full rounded-full bg-gradient-to-r from-yellow-400 to-orange-500 transition-all duration-1000 ease-out"
                                style={{ width: `${foodLevel}%` }}
                            ></div>
                        </div>
                    </div>

                    {/* 2. Water Level */}
                    <div className="p-5 flex flex-col bg-blue-50/90 backdrop-blur-sm rounded-3xl shadow-lg border border-blue-200">
                        <div className="flex justify-between items-start mb-2">
                            <h3 className="font-bold text-blue-500">Water</h3>
                            <div className="text-2xl">💧</div>
                        </div>
                        <div className="flex items-end space-x-1 mb-2">
                             <span className="text-4xl font-bold text-blue-600">{waterLevel}</span>
                             <span className="text-sm text-blue-400 mb-1">%</span>
                        </div>
                        <div className="w-full h-3 bg-blue-100 rounded-full overflow-hidden">
                            <div className="h-full bg-blue-400 transition-all duration-1000" style={{ width: `${waterLevel}%` }}></div>
                        </div>
                    </div>

                    {/* 3. Temp & Humidity */}
                    <div className="p-5 flex flex-col bg-white/80 backdrop-blur-sm rounded-3xl shadow-lg border border-gray-100">
                         <div className="flex justify-between items-start mb-1">
                            <h3 className="font-bold text-gray-500">Room</h3>
                            <div className="text-2xl">🏠</div>
                        </div>
                        
                        <div className="flex justify-between items-center mt-2 border-b border-gray-100 pb-2">
                            <span className="text-sm text-gray-400">Temp</span>
                            <span className="text-xl font-bold text-gray-700">{temperature}°C</span>
                        </div>
                        <div className="flex justify-between items-center mt-2 pt-1">
                            <span className="text-sm text-gray-400">Humidity</span>
                            <span className="text-xl font-bold text-gray-700">{humidity}%</span>
                        </div>
                    </div>

                </div>
            </div>
        )}

      </div>
    </div>
  )
}

export default App