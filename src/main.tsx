import '@fontsource/archivo/500.css'
import '@fontsource/archivo/700.css'
import '@fontsource/archivo/900.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Root } from './Root.tsx'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root path={window.location.pathname} />
  </StrictMode>,
)
