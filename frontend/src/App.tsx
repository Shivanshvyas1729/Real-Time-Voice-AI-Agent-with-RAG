import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Stream from './pages/Stream'
import './App.css'

function App() {
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
