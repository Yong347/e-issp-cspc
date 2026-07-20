// frontend/src/main.jsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { AuthProvider } from './context/AuthContext'
import { CycleProvider } from './context/CycleContext'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <CycleProvider>
        <App />
      </CycleProvider>
    </AuthProvider>
  </React.StrictMode>,
)