import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import TrayPopover from './TrayPopover.jsx'
import { I18nProvider } from './i18n'
import { initFontZoomShortcuts } from './utils/fontScale'
import './index.css'

initFontZoomShortcuts()

const isTrayPopover = new URLSearchParams(window.location.search).get('tray') === '1'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <I18nProvider>
      <BrowserRouter>
        {isTrayPopover ? <TrayPopover /> : <App />}
      </BrowserRouter>
    </I18nProvider>
  </React.StrictMode>,
)
