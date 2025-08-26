import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MapContainer, TileLayer, Marker, Circle } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// アイコン設定
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

// Haversine 
function getDistance(pos1, pos2) {
  const [lat1, lon1] = pos1;
  const [lat2, lon2] = pos2;
  const R = 6371e3;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(Δφ / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export default function AlarmPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState("セット済み。アラームを待機中...");
  const [home, setHome] = useState(null);
  const [alarmPlaying, setAlarmPlaying] = useState(false);
  const [currentPos, setCurrentPos] = useState(null);
  const audioRef = useRef(null);
  const timerRef = useRef(null);
  const watchRef = useRef(null);
  const snoozeRef = useRef(null);

  useEffect(() => {
    // 初期ロード：設定があるか確認
    const storedHome = localStorage.getItem("home");
    const alarmTime = localStorage.getItem("alarmTime");
    const snooze = localStorage.getItem("snooze");

    setHome(JSON.parse(storedHome));
    snoozeRef.current = Number(snooze);

    // audio 準備
    audioRef.current = new Audio("/alarm.mp3");
    audioRef.current.loop = true;

    // 現在地監視（マップ表示用）
    if (navigator.geolocation) {
      const id = navigator.geolocation.watchPosition(
        (pos) => {
          setCurrentPos([pos.coords.latitude, pos.coords.longitude]);
        },
        (err) => {
          console.error("位置情報エラー:", err);
        },
        { enableHighAccuracy: true, maximumAge: 5000 }
      );
      watchRef.current = id;
    }

    // アラーム時刻を計算してsetTimeout
    // scheduleNextAlarm(alarmTime);

    return () => {
      // クリーンアップ
      if (timerRef.current) clearTimeout(timerRef.current);
      if (watchRef.current) navigator.geolocation.clearWatch(watchRef.current);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  // これは設定画面でやるべき
  // 次回のアラーム（当日または翌日）
/*   function scheduleNextAlarm(alarmTimeStr) {
    const now = new Date();
    const [hh, mm] = alarmTimeStr.split(":").map((s) => Number(s));
    const target = new Date(now);
    target.setHours(hh, mm, 0, 0);
    if (target.getTime() <= now.getTime()) {
      // 既に過ぎているなら翌日
      target.setDate(target.getDate() + 1);
    }
    const wait = target.getTime() - now.getTime();
    setStatus(`アラーム設定中 (${alarmTimeStr}) — 発動まで ${Math.round(wait / 1000)} 秒`);
    timerRef.current = setTimeout(() => {
      onAlarmTimeReached();
    }, wait);
  }
 */
  // アラーム時刻到来
  function onAlarmTimeReached() {
    setStatus("時刻到来。位置を確認します...");
    const storedHome = JSON.parse(localStorage.getItem("home"));
    if (!navigator.geolocation) {
      setStatus("位置情報利用不可のため終了");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const cur = [pos.coords.latitude, pos.coords.longitude];
        const dist = getDistance(cur, [storedHome.lat, storedHome.lng]);
        if (dist > 100) {
          setStatus("自宅から100mより外にいるためアラーム終了");
          // 終了（必要なら次回アラームは設定したままにする or 値を消す）
        } else {
          // within -> start ringing
          startAlarmLoop();
        }
      },
      (err) => {
        console.error("位置情報エラー:", err);
        setStatus("位置情報取得に失敗。再試行をスヌーズで行います");
        // schedule snooze anyway
        scheduleSnooze();
      },
      { enableHighAccuracy: true }
    );
  }

  // 鳴動処理開始
  function startAlarmLoop() {
    setStatus("アラーム鳴動中（停止ボタンで停止）。最大15分で自動停止します");
    // play (may be blocked by browser autoplay policies if no user gesture; user arrived here by interaction)
    audioRef.current.play().catch((e) => {
      console.warn("autoplay blocked:", e);
    });
    setAlarmPlaying(true);

    // 15分で強制停止し、スヌーズをスケジュール
    timerRef.current = setTimeout(() => {
      stopAlarmInternal();
      setStatus("15分経過によりアラーム停止。スヌーズをスケジュールします");
      scheduleSnooze();
    }, 15 * 60 * 1000);
  }

  function stopAlarmInternal() {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setAlarmPlaying(false);
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  // ユーザーがアラーム停止を押したとき
  function handleStopButton() {
    stopAlarmInternal();
    setStatus("アラーム停止。スヌーズをスケジュールします");
    scheduleSnooze();
  }

  // スヌーズ処理: snoozeRef.current 分後に再チェック
  function scheduleSnooze() {
    const snoozeMin = snoozeRef.current || 5;
    setStatus(`スヌーズ中 (${snoozeMin}分後に再チェックします)`);
    timerRef.current = setTimeout(() => {
      // 再チェック時は自宅から100m以内かを確認 -> if inside, start alarm; if outside, finish
      const storedHome = JSON.parse(localStorage.getItem("home"));
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const cur = [pos.coords.latitude, pos.coords.longitude];
          const dist = getDistance(cur, [storedHome.lat, storedHome.lng]);
          if (dist > 100) {
            setStatus("スヌーズ時の確認: 自宅外のためアラーム終了");
            // done
          } else {
            startAlarmLoop();
          }
        },
        (err) => {
          console.error("位置情報エラー:", err);
          // 失敗したらもう一度スヌーズ（再試行の方針）
          scheduleSnooze();
        },
        { enableHighAccuracy: true }
      );
    }, (snoozeMin * 60 * 1000));
  }

  return (
    <div className="page">
      <h1>アラーム画面</h1>
      <p>{status}</p>

      <div style={{ height: 300, marginTop: 12 }}>
        {home && (
          <MapContainer
            center={currentPos || [home.lat, home.lng]}
            zoom={17}
            style={{ height: "100%", width: "100%" }}
          >
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            <Marker position={[home.lat, home.lng]}>
            </Marker>
            <Circle center={[home.lat, home.lng]} radius={100} pathOptions={{ color: "blue", fillOpacity: 0.12 }} />
            {currentPos && <Marker position={currentPos} />}
          </MapContainer>
        )}
      </div>

      {alarmPlaying && (
        <div style={{ marginTop: 12 }}>
          <button onClick={handleStopButton} className="stop-button">アラームを停止</button>
        </div>
      )}
      <div style={{ marginTop: 12 }}>
        <button onClick={() => navigate("/")}>設定に戻る</button>
      </div>
    </div>
  );
}
