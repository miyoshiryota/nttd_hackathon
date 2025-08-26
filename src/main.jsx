import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import { BrowserRouter, Routes, Route } from 'react-router-dom';

// ページコンポーネント
import App from './App';       // 設定画面
import Alarm from './Alarm';   // アラーム画面

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        {/* 設定画面 */}
        <Route path="/" element={<App />} />
        {/* アラーム画面 */}
        <Route path="/alarm" element={<Alarm />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
