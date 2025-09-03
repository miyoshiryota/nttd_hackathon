// src/Alarm.jsx
import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MapContainer, TileLayer, Marker, Circle } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// アイコン調整
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

export default function Alarm() {
  const navigate = useNavigate();

  const [status, setStatus] = useState("待機中");
  const [alarmDateTimeLabel, setAlarmDateTimeLabel] = useState("");
  const [snoozeLabel, setSnoozeLabel] = useState("");
  const [remainLabel, setRemainLabel] = useState("--:--");
  const [curPos, setCurPos] = useState(null); // {lat, lng}
  const [home, setHome] = useState(null);     // {lat, lng}
  const [radius, setRadius] = useState(100);
  const [track, setTrack] = useState([]);     // 履歴ピン

  const audioRef = useRef(null);
  const intervalRef = useRef(null);
  const timeoutRef = useRef(null);
  const schedBaseRef = useRef(null);
  const snoozeMinRef = useRef(3);
  const geoIntervalRef = useRef(null);
  const maxRingTimeoutRef = useRef(null);

  // ---------- ユーティリティ ----------
  const parseHome = () => {
    try {
      const s = localStorage.getItem("home");
      if (!s) return null;
      const obj = JSON.parse(s);
      if (typeof obj?.lat === "number" && typeof obj?.lng === "number") return obj;
      return null;
    } catch {
      return null;
    }
  };

  const getPlannedDate = () => {
    const d = localStorage.getItem("alarmDate");
    const t = localStorage.getItem("alarmTime");
    if (!t) return null;
    const dateStr = d || new Date().toISOString().split("T")[0];
    const dt = new Date(`${dateStr}T${t}`);
    return isNaN(dt.getTime()) ? null : dt;
  };

  const getDistanceMeters = ([lat1, lon1], [lat2, lon2]) => {
    const toRad = (d) => (d * Math.PI) / 180;
    const R = 6371000;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const fmtJpShort = (d) => {
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mi = String(d.getMinutes()).padStart(2, "0");
    return `${mm}月${dd}日${hh}:${mi}`;
  };

  const fmtRemain = (ms) => {
    const sec = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    const pad = (n) => String(n).padStart(2, "0");
    return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  };

  // ---------- アラーム ----------
  const startRinging = async () => {
    setStatus("アラーム鳴動中");
    if (!audioRef.current) {
      audioRef.current = new Audio("/alarm.mp3");
      audioRef.current.loop = true;
    }
    try { await audioRef.current.play(); } catch {}

    // 鳴動を最大15分で自動停止
    if (maxRingTimeoutRef.current) clearTimeout(maxRingTimeoutRef.current);
    maxRingTimeoutRef.current = setTimeout(() => stopRinging(), 15 * 60 * 1000);

    // 10秒ごとに現在地を更新して履歴に追加
    if ("geolocation" in navigator && !geoIntervalRef.current) {
      const updatePos = () => {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            setCurPos(p);
            setTrack(prev => [...prev.slice(-29), p]); // 最新30件保持
          },
          () => {}
        );
      };
      updatePos();
      geoIntervalRef.current = setInterval(updatePos, 10000);
    }
  };

  const stopRinging = () => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.currentTime = 0; }
    if (geoIntervalRef.current) {
      clearInterval(geoIntervalRef.current);
      geoIntervalRef.current = null;
    }
    if (maxRingTimeoutRef.current) {
      clearTimeout(maxRingTimeoutRef.current);
      maxRingTimeoutRef.current = null;
    }
    setStatus("停止しました（スヌーズを再設定）");
  };

  const scheduleNextBySnooze = () => {
    const base = schedBaseRef.current ?? new Date();
    const next = new Date(base.getTime());
    next.setMinutes(next.getMinutes() + (snoozeMinRef.current || 3));

    const y = next.getFullYear();
    const m = String(next.getMonth() + 1).padStart(2, "0");
    const d = String(next.getDate()).padStart(2, "0");
    const hh = String(next.getHours()).padStart(2, "0");
    const mi = String(next.getMinutes()).padStart(2, "0");
    localStorage.setItem("alarmDate", `${y}-${m}-${d}`);
    localStorage.setItem("alarmTime", `${hh}:${mi}`);

    setAlarmDateTimeLabel(fmtJpShort(next));
    setSnoozeLabel(`${snoozeMinRef.current}分`);

    if (!intervalRef.current) intervalRef.current = setInterval(tick, 1000);
    setStatus("次回のアラームを予定しました");
    schedBaseRef.current = next;
  };

  const stopAlarm = () => { stopRinging(); scheduleNextBySnooze(); };

  const checkAndRingIfAtHome = () => {
    if (!home || !("geolocation" in navigator)) { startRinging(); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        const p = { lat: latitude, lng: longitude };
        setCurPos(p);
        setTrack(prev => [...prev.slice(-29), p]);
        const dist = getDistanceMeters([latitude, longitude], [home.lat, home.lng]);
        if (dist <= radius) startRinging();
        else { setStatus("自宅外と判定：次回へスヌーズ"); scheduleNextBySnooze(); }
      },
      () => { startRinging(); }
    );
  };

  const tick = () => {
    const now = new Date();
    const base = schedBaseRef.current;
    if (!base) return;
    const remain = base.getTime() - now.getTime();
    setRemainLabel(fmtRemain(remain));
    if (remain <= 0 && intervalRef.current) {
      clearInterval(intervalRef.current); intervalRef.current = null;
      checkAndRingIfAtHome();
    }
  };

  // ---------- 初期化 ----------
  useEffect(() => {
    const planned = getPlannedDate();
    if (!planned) {
      setStatus("アラーム設定が見つかりません。設定画面に戻ります。");
      timeoutRef.current = setTimeout(() => navigate("/"), 1200);
      return;
    }
    schedBaseRef.current = planned;
    setAlarmDateTimeLabel(fmtJpShort(planned));

    const sn = Number(localStorage.getItem("snooze") || "3");
    snoozeMinRef.current = isNaN(sn) ? 3 : sn;
    setSnoozeLabel(`${snoozeMinRef.current}分`);

    const h = parseHome(); setHome(h);
    const r = Number(localStorage.getItem("radius") || "100");
    setRadius(isNaN(r) ? 100 : r);

    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setCurPos(p);
          setTrack([p]);
        },
        () => { if (h) { setCurPos(h); setTrack([h]); } }
      );
    } else if (h) { setCurPos(h); setTrack([h]); }

    intervalRef.current = setInterval(tick, 1000);
    setStatus("予定時刻を監視中…");

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (geoIntervalRef.current) clearInterval(geoIntervalRef.current);
      if (audioRef.current) { audioRef.current.pause(); audioRef.current.currentTime = 0; }
      if (maxRingTimeoutRef.current) clearTimeout(maxRingTimeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  return (
    <main>
      <header>
        <h1>強制移動アラーム</h1>
        <p>強制移動アラームを使って、遅刻を回避しよう！</p>
      </header>

      <section>
        <div className="alarm" style={{ marginTop: 8 }}>{remainLabel}</div>
      </section>

      <section style={{ marginTop: 12 }}>
        <div className="outputsettitle">{status}</div>
      </section>

      <button className="btn2" onClick={stopAlarm}>アラームを停止</button>

      <section>
        <h3 className="outputsettitle">現在地</h3>
        {home && (
          <MapContainer
            center={home}
            zoom={16}
            style={{ height: 320, borderRadius: 12, overflow: "hidden", margin: "12px auto", maxWidth: 720 }}
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
            />
            {/* home（自宅）ピン */}
            <Marker position={home} />
            {/* home半径の円 */}
            <Circle center={home} radius={radius} pathOptions={{ color: "#2b6cb0", fillColor: "#4299e1", fillOpacity: 0.15 }} />
            {/* 現在地ピン */}
            {curPos && <Marker position={curPos} />}
            {/* 履歴ピン */}
            {track.map((p, idx) => <Marker key={idx} position={p} />)}
          </MapContainer>
        )}
      </section>

      <section>
        <h3 className="outputsettitle">アラームを確認</h3>
        <div className="container">
          <div className="item">
            <label className="label-DTData">設定日時</label>
            <p id="alarmDateTimeData" style={{ fontSize: 24 }}>{alarmDateTimeLabel}</p>
          </div>
          <div className="item">
            <label className="label-SMData">スヌーズ間隔</label>
            <p id="snoozeMinutesData" style={{ fontSize: 24 }}>{snoozeLabel}</p>
          </div>
        </div>
      </section>
    </main>
  );
}
