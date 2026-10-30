"use client";
import { useEffect } from 'react';
export default function OfflineInstall() { useEffect(() => { if (document.querySelector('[data-app-offline-client]'))
    return; const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = '/offline.css'; link.setAttribute('data-app-offline-style', ''); document.head.append(link); const script = document.createElement('script'); script.src = '/offline-client.js'; script.defer = true; script.setAttribute('data-app-offline-client', ''); document.head.append(script); }, []); return null; }
