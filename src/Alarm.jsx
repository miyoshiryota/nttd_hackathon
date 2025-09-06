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

  // home取得
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

  // アラーム日時取得
  const getPlannedDate = () => {
    const d = localStorage.getItem("alarmDate");
    const t = localStorage.getItem("alarmTime");
    if (!t) return null;
    const dateStr = d || new Date().toISOString().split("T")[0];
    const dt = new Date(`${dateStr}T${t}`);
    return isNaN(dt.getTime()) ? null : dt;
  };

  // 2点間の距離計算
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

  // 日時
  const fmtJpShort = (d) => {
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mi = String(d.getMinutes()).padStart(2, "0");
    return `${mm}月${dd}日${hh}:${mi}`;
  };

  // 残り時間
  const fmtRemain = (ms) => {
    const sec = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    const pad = (n) => String(n).padStart(2, "0");
    return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  };

  // アラームのループを完全終了する
  const endAlarmLoop = () => {
  // 鳴ってたら念のため止める
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    if (geoIntervalRef.current) {
      clearInterval(geoIntervalRef.current);
      geoIntervalRef.current = null;
    }
    if (maxRingTimeoutRef.current) {
      clearTimeout(maxRingTimeoutRef.current);
      maxRingTimeoutRef.current = null;
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    // 次回予定をクリア
    schedBaseRef.current = null;
    localStorage.removeItem("alarmDate");
    localStorage.removeItem("alarmTime");

    setRemainLabel("--:--");
    setStatus("自宅外と判定：アラームを終了しました");
  };

  
  // アラーム開始 : 音楽再生(15分で自動停止), 10秒ごとに現在地更新
  const startRinging = async () => {
    setStatus("アラーム鳴動中");
    const sound = localStorage.getItem("alarmSound") || "alarm.mp3";

    // ★ ここがポイント：先頭でプリム済みaudioを拾う
    const primed = window.__alarmEl;
    if (primed) {
      try {
        const abs = new URL(`/${sound}`, window.location.origin).href;
        if (primed.src !== abs) {
          primed.pause();
          primed.currentTime = 0;
          primed.src = `/${sound}`;
          primed.load();
          await primed.play().catch(() => {});
        }
        primed.muted = false;        // ← ミュート解除
        primed.volume = 1.0;
        await primed.play();
        audioRef.current = primed;   // 停止時に参照できるよう保持
      } catch (e) {
        console.warn("プリム済みaudioの再生に失敗。フォールバックします:", e);
      }
    }

    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.loop = true;
    }
    // 音源を毎回同期（選択の変更や404に強くする）
    const targetSrc = `/${sound}`;
    const currentSrc = audioRef.current.src;
    const absTarget = new URL(targetSrc, window.location.origin).href;
    if (currentSrc !== absTarget) {
      audioRef.current.src = targetSrc;
      audioRef.current.load();
    }
    try {
      await audioRef.current.play();
    } catch (e) {
      console.error("音声再生に失敗:", e);
      setStatus("音声の自動再生に失敗しました。");
    }
    // 鳴動を最大15分で自動停止
    if (maxRingTimeoutRef.current) clearTimeout(maxRingTimeoutRef.current);
    maxRingTimeoutRef.current = setTimeout(() => stopRinging(), 15 * 60 * 1000);

  };

  // アラーム停止 : 音楽停止(15分で自動停止もクリア), 現在地取得停止
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

  // スヌーズ後のアラーム時間設定
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

  // ボタン押下時にアラーム停止 + スヌーズ設定
  const stopAlarm = () => { stopRinging(); scheduleNextBySnooze(); };

  // 自宅半径100m以内であればアラームを鳴らし、以外であればアラーム停止
  const checkAndRingIfAtHome = () => {
    if (!home || !("geolocation" in navigator)) { startRinging(); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        const p = { lat: latitude, lng: longitude };
        setCurPos(p);
        setTrack(prev => [...prev.slice(-29), p]);
        const dist = getDistanceMeters([latitude, longitude], [home.lat, home.lng]);
        if (dist <= radius) {
          startRinging(); // 円内 → 鳴らす
        } else {
          endAlarmLoop(); // 円外 → ループ終了（スヌーズしない）
        }
      },
      () => { startRinging(); } // 取得失敗は従来通り安全側で鳴らす
   );
  };

  // 残り時間の計算（1秒ごとに呼び出される）. 0秒になった時だけ鳴動判定
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

    const h = parseHome(); 
    setHome(h);
    const r = Number(localStorage.getItem("radius") || "100");
    setRadius(isNaN(r) ? 100 : r);

    // 画面表示中は常に現在地を 10 秒ごとに更新
    if ("geolocation" in navigator) {
      const updatePos = () => {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            setCurPos(p);
            setTrack(prev => [...prev.slice(-29), p]); // 最新30件保持
          },
          () => { if (h) { setCurPos(h); setTrack([h]); } }
        );
      };
      updatePos();
      geoIntervalRef.current = setInterval(updatePos, 10000);
    } else if (h) {
      setCurPos(h);
      setTrack([h]);
    }

    intervalRef.current = setInterval(tick, 1000);
    setStatus("予定時刻を監視中…");

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (geoIntervalRef.current) clearInterval(geoIntervalRef.current); // ←追加
      if (audioRef.current) { audioRef.current.pause(); audioRef.current.currentTime = 0; }
      if (maxRingTimeoutRef.current) clearTimeout(maxRingTimeoutRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  return (
    <main>
      <header>
        <h1>歩刑（とけい）</h1>
        <p>設定時刻までに家を出ないと・・・</p>
      </header>

      <section>
        <div className="alarm" style={{ marginTop: 8 }}>{remainLabel}</div>
      </section>

      <section style={{ marginTop: 12 }}>
        <div className="indexsettitle">{status}</div>
      </section>

      {status === "アラーム鳴動中" && (
        <button className="btn1" onClick={stopAlarm}>
          アラームを停止
        </button>
      )}

      <br />

      <section>
        <h3 className="outputsettitle">現在地</h3>
        {home && (
          <MapContainer
            center={home}
            zoom={16}
            style={{ height: 320, borderRadius: 12, overflow: "hidden", margin: "12px auto" , maxWidth: 470}}
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
            />
            {/* home（自宅）ピン */}
            <Marker position={home} />
            {/* home半径の円 */}
            <Circle center={home} radius={radius} pathOptions={{ color: "#009bc6", fillColor: "#4299e1", fillOpacity: 0.15 }} />
            {/* 現在地ピン */}
            {curPos && <Marker position={curPos} />}
            {/* 履歴ピン */}
            {track.map((p, idx) => <Marker key={idx} position={p} />)}
          </MapContainer>
        )}
      </section>

      <section>
        <br />
        <h3 className="outputsettitle">アラームを確認</h3>
        <div className="container">
          <div className="item">
            <label className="label-DTData">設定日時</label>
            <p id="alarmDateTimeData" style={{ fontSize: 20 }}>{alarmDateTimeLabel}</p>
          </div>
          <div className="item">
            <label className="label-SMData">スヌーズ間隔</label>
            <p id="snoozeMinutesData" style={{ fontSize: 20 }}>{snoozeLabel}</p>
          </div>
        </div>
  {/*       <button
          className="btn1"
          onClick={() => {
            // ① プリム済み Audio を停止
            if (window.__alarmEl) {
              window.__alarmEl.pause();
              window.__alarmEl.currentTime = 0;
              window.__alarmEl = null;
            }

            // ② 設定系の localStorage をクリア
            localStorage.removeItem("alarmDate");
            localStorage.removeItem("alarmTime");
            localStorage.removeItem("alarmSound");
            localStorage.removeItem("snooze");

            // ③ 設定画面に戻る
            navigate("/");
          }}
        >
          設定画面に戻る
        </button> */}

      </section>
    </main>
  );
}