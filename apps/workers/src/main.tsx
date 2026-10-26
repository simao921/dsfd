import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { PortalApp } from '../../../packages/portal-ui/src/PortalApp';
import '../../../packages/portal-ui/src/portal.css';

createRoot(document.getElementById('root')!).render(<React.StrictMode><BrowserRouter><PortalApp kind="workers" /></BrowserRouter></React.StrictMode>);
