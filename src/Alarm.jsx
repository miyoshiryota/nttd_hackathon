// src/Alarm.jsx
import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// ★ポイント
// - localStorage: alarmDate/alarmTime/snooze/home/radius を利用
// - 予定到達で現在地を取得 → home半径「内なら鳴動 / 外ならスヌーズ」
// - 停止で音停止＆「直前の予定時刻ベース」にスヌーズを再設定
// - 追加: 残り時間の大きな表示（毎秒更新）
// - 追加: 地図の円を目立つ色で常時表示＆必ず反映

export default function Alarm() {
  const navigate = useNavigate();

  // 表示・状態
  const [status, setStatus] = useState("待機中");
  const [alarmDateTimeLabel, setAlarmDateTimeLabel] = useState("");
  const [snoozeLabel, setSnoozeLabel] = useState("");
  const [remainLabel, setRemainLabel] = useState("--:--"); // ← 残り時間の表示
  const [curPos, setCurPos] = useState(null); // {lat, lng}
  const [home, setHome] = useState(null);     // {lat, lng}
  const [radius, setRadius] = useState(100);  // m

  // 内部参照（副作用で使う）
  const mapRef = useRef(null);
  const mapInitedRef = useRef(false);
  const curMarkerRef = useRef(null);
  const homeMarkerRef = useRef(null);
  const circleRef = useRef(null);

  const audioRef = useRef(null);
  const intervalRef = useRef(null);
  const watchIdRef = useRef(null);
  const timeoutRef = useRef(null);

  // 予定（基準）日時とスヌーズ
  const schedBaseRef = useRef(null); // Dateオブジェクト（「予定時刻」）
  const snoozeMinRef = useRef(3);

  // ---------- ユーティリティ ----------
  const parseHome = () => {
    try {
      const s = localStorage.getItem("home");
      if (!s) return null;
      const obj = JSON.parse(s);
      if (typeof obj?.lat === "number" && typeof obj?.lng === "number") {
        return { lat: obj.lat, lng: obj.lng };
      }
      return null;
    } catch {
      return null;
    }
  };

  const getPlannedDate = () => {
    const d = localStorage.getItem("alarmDate"); // "YYYY-MM-DD" or null
    const t = localStorage.getItem("alarmTime"); // "HH:MM" or null
    if (!t) return null;
    // 日付がなければ今日扱い（後方互換）。あれば結合。
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

  // 残り時間表示用（1時間以上は HH:MM:SS、未満は MM:SS）
  const fmtRemain = (ms) => {
    const sec = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    const pad = (n) => String(n).padStart(2, "0");
    return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  };

  // ---------- 地図 ----------
  const ensureMap = (center) => {
    if (mapInitedRef.current) {
      // 既存マーカー更新
      if (curMarkerRef.current) curMarkerRef.current.setLatLng(center);
      else
        curMarkerRef.current = L.marker(center, { title: "現在地" }).addTo(
          mapRef.current
        );
      mapRef.current.setView(center, 16);
      // ★ 地図更新時も円を必ず反映
      updateHomeCircle();
      return;
    }

    // 初期化
    mapRef.current = L.map("map").setView(center, 16);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
      maxZoom: 19,
    }).addTo(mapRef.current);

    curMarkerRef.current = L.marker(center, { title: "現在地" }).addTo(
      mapRef.current
    );

    // home があれば描画
    if (home) {
      homeMarkerRef.current = L.marker([home.lat, home.lng], {
        title: "自宅",
      }).addTo(mapRef.current);
      circleRef.current = L.circle([home.lat, home.lng], {
        radius: radius,
        weight: 2,
        color: "#2b6cb0",
        fillColor: "#4299e1",
        fillOpacity: 0.15,
      }).addTo(mapRef.current);
    }

    mapInitedRef.current = true;
  };

  const updateHomeCircle = () => {
    if (!mapRef.current || !home) return;
    // 自宅マーカー
    if (!homeMarkerRef.current) {
      homeMarkerRef.current = L.marker([home.lat, home.lng], {
        title: "自宅",
      }).addTo(mapRef.current);
    } else {
      homeMarkerRef.current.setLatLng([home.lat, home.lng]);
    }
    // 円（見やすい色で）
    const circleOpts = {
      radius: radius,
      weight: 2,
      color: "#2b6cb0",
      fillColor: "#4299e1",
      fillOpacity: 0.15,
    };
    if (!circleRef.current) {
      circleRef.current = L.circle([home.lat, home.lng], circleOpts).addTo(
        mapRef.current
      );
    } else {
      circleRef.current.setLatLng([home.lat, home.lng]);
      circleRef.current.setRadius(radius);
      circleRef.current.setStyle(circleOpts);
    }
  };

  // ---------- アラーム制御 ----------
  const startRinging = async () => {
    setStatus("アラーム鳴動中");
    if (!audioRef.current) {
      audioRef.current = new Audio("/alarm.mp3"); // public/alarm.mp3
      audioRef.current.loop = true;
    }
    try {
      await audioRef.current.play();
    } catch (e) {
      console.warn("ブラウザの自動再生制限で再生できない可能性があります。", e);
      // 失敗してもボタンでユーザー操作すれば再生可能
    }

    // 現在地の連続監視（地図更新）
    if ("geolocation" in navigator) {
      watchIdRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          const { latitude, longitude } = pos.coords;
          setCurPos({ lat: latitude, lng: longitude });
          ensureMap({ lat: latitude, lng: longitude });
        },
        (err) => {
          console.warn("watchPosition error:", err);
        },
        { enableHighAccuracy: true, maximumAge: 10000, timeout: 10000 }
      );
    }
  };

  const stopRinging = () => {
    if (audioRef.current) {
      // 一旦止める
      try {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      } catch {}
    }
    if (watchIdRef.current != null && "geolocation" in navigator) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setStatus("停止しました（スヌーズを再設定）");
  };

  const scheduleNextBySnooze = () => {
    // 「直前の予定時刻」を基準にスヌーズ分を加算（遅延が積み上がりにくい設計）
    const base = schedBaseRef.current ?? new Date();
    const next = new Date(base.getTime());
    next.setMinutes(next.getMinutes() + (snoozeMinRef.current || 3));

    // 保存（既存キーと互換）
    const y = next.getFullYear();
    const m = String(next.getMonth() + 1).padStart(2, "0");
    const d = String(next.getDate()).padStart(2, "0");
    const hh = String(next.getHours()).padStart(2, "0");
    const mi = String(next.getMinutes()).padStart(2, "0");
    localStorage.setItem("alarmDate", `${y}-${m}-${d}`);
    localStorage.setItem("alarmTime", `${hh}:${mi}`);

    // 画面表示を更新
    setAlarmDateTimeLabel(fmtJpShort(next));
    setSnoozeLabel(`${snoozeMinRef.current}分`);

    // 次チェックも回しておく（秒刻みで監視）
    if (!intervalRef.current) {
      intervalRef.current = setInterval(tick, 1000);
    }
    setStatus("次回のアラームを予定しました");
    schedBaseRef.current = next;
  };

  const stopAlarm = () => {
    stopRinging();
    scheduleNextBySnooze();
  };

  // 予定到達時に位置を確認
  const checkAndRingIfAtHome = () => {
    if (!home) {
      // 自宅未設定なら普通に鳴らす（仕様に合わせてここは調整可）
      startRinging();
      return;
    }
    if (!("geolocation" in navigator)) {
      startRinging();
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setCurPos({ lat: latitude, lng: longitude });
        ensureMap({ lat: latitude, lng: longitude });

        const dist = getDistanceMeters(
          [latitude, longitude],
          [home.lat, home.lng]
        );
        // 自宅の半径内にいる → アラーム鳴動
        if (dist <= radius) {
          startRinging();
        } else {
          // 自宅から離れていれば鳴らさず次回へ
          setStatus("自宅外と判定：次回へスヌーズ");
          scheduleNextBySnooze();
        }
      },
      (err) => {
        console.warn("現在地の取得に失敗:", err);
        // 位置が取れない場合は安全側で鳴らす
        startRinging();
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 10000 }
    );
  };

  // 秒刻みで予定到達を監視（＋残り時間を更新）
  const tick = () => {
    const now = new Date();
    const base = schedBaseRef.current;
    if (!base) return;

    // 追加：残り時間ラベルを更新
    const remain = base.getTime() - now.getTime();
    setRemainLabel(fmtRemain(remain));

    if (remain <= 0) {
      // 一度だけ動作するようにインターバルを止めてから実行
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      checkAndRingIfAtHome();
    }
  };

  // ---------- 初期化 ----------
  useEffect(() => {
    // 設定の復元
    const planned = getPlannedDate();
    if (!planned) {
      setStatus("アラーム設定が見つかりません。設定画面に戻ります。");
      // 少し待って戻る
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

    // 地図は現在地が取れ次第初期化する（鳴動時にもwatchで更新）
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude } = pos.coords;
          setCurPos({ lat: latitude, lng: longitude });
          ensureMap({ lat: latitude, lng: longitude });
          updateHomeCircle(); // 初期化直後にも円を反映
        },
        () => {
          // 取得失敗でもhomeがあればそこへ
          if (h) {
            ensureMap({ lat: h.lat, lng: h.lng });
            updateHomeCircle();
          }
        }
      );
    } else if (h) {
      ensureMap({ lat: h.lat, lng: h.lng });
      updateHomeCircle();
    }

    // 予定時刻の監視を開始
    intervalRef.current = setInterval(tick, 1000);
    setStatus("予定時刻を監視中…");

    return () => {
      // クリーンアップ
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (watchIdRef.current != null && "geolocation" in navigator) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      if (audioRef.current) {
        try {
          audioRef.current.pause();
          audioRef.current.currentTime = 0;
        } catch {}
      }
      // Leaflet破棄（任意）
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        mapInitedRef.current = false;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  return (
    <main>
      {/* ヘッダー（デザイン） */}
      <header>
        <h1>強制移動アラーム</h1>
        <p>強制移動アラームを使って、遅刻を回避しよう！</p>
      </header>

      {/* 追加：残り時間（大きく） */}
      <section>
        <div className="alarm" style={{ marginTop: 8 }}>{remainLabel}</div>
      </section>

      {/* 現在の状態表示 */}
      <section style={{ marginTop: 12 }}>
        <div className="outputsettitle" style={{ display: "inline-block" }}>
          {status}
        </div>
      </section>

      {/* 停止ボタン（デザイン：.btn2） */}
      <button className="btn2" onClick={stopAlarm}>
        アラームを停止
      </button>

      {/* 現在地（地図） */}
      <section>
        <h3 className="outputsettitle">現在地</h3>
        <div
          id="map"
          style={{
            height: 320,
            borderRadius: 12,
            overflow: "hidden",
            margin: "12px auto",
            maxWidth: 720,
          }}
        />
      </section>

      {/* アラーム確認（デザイン：ラベルに .label-*） */}
      <section>
        <h3 className="outputsettitle">アラームを確認</h3>
        <div className="container">
          <div className="item">
            <label className="label-DTData">設定日時</label>
            <p id="alarmDateTimeData" style={{ fontSize: 24 }}>
              {alarmDateTimeLabel}
            </p>
          </div>
          <div className="item">
            <label className="label-SMData">スヌーズ間隔</label>
            <p id="snoozeMinutesData" style={{ fontSize: 24 }}>
              {snoozeLabel}
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
