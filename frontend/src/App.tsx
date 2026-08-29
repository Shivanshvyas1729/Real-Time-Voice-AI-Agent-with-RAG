import { useEffect } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Stream from './pages/Stream'
import api from './utils/api'
import './App.css'

function App() {
  useEffect(() => {
    // Silent background ping to wake up free-tier backend (e.g. Render cold start) on page load
    const warmupBackend = async () => {
      try {
        await api.get('/health')
      } catch {
        // Silent catch: Ignore errors if offline or still booting up
      }
    }
    warmupBackend()
  }, [])

  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/" element={<Stream />} />
        <Route path="/stream" element={<Stream />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
