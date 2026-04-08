import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'

// Catch uncaught errors and show them on screen
window.addEventListener('error', (e) => {
  document.getElementById('root')!.innerHTML = `<pre style="color:red;padding:20px;font-size:14px;word-wrap:break-word;white-space:pre-wrap">${e.message}\n\n${e.filename}:${e.lineno}</pre>`
})

window.addEventListener('unhandledrejection', (e) => {
  document.getElementById('root')!.innerHTML = `<pre style="color:red;padding:20px;font-size:14px;word-wrap:break-word;white-space:pre-wrap">Unhandled promise rejection:\n${e.reason}</pre>`
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
