import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
// Bundled so the interface keeps its typefaces offline. Every subset is declared, and
// Chromium loads only the ones the page's text needs.
import '@fontsource/inter/400.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/800.css'
import '@fontsource/vt323/400.css'
import './styles/tokens.css'
import './styles/global.css'
import './styles/workspace.css'
import './styles/feature-workspace.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
