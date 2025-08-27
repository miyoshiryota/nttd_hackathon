import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Leafletのデフォルトアイコン問題回避（必要なら）
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

export default function SettingPage() {
  const navigate = useNavigate();
  const [time, setTime] = useState("");
  const [snooze, setSnooze] = useState(5);

  const handleSetAlarm = () => {
    if (!time) {
      alert("アラーム時刻を指定してください");
      return;
    }
    if (snooze < 1) {
      alert("スヌーズ間隔は1分以上にしてください");
      return;
    }

    // 過去時刻チェック
    const now = new Date();
    const [hh, mm] = time.split(":").map((s) => Number(s));
    const target = new Date();
    target.setHours(hh, mm, 0, 0);

    if (target.getTime() <= now.getTime()) {
      alert("過去の時刻は設定できません。未来の時刻を選んでください。");
      return;
    }

    // === ここで現在地を取得 ===
    if (!navigator.geolocation) {
      alert("位置情報が使えません");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const home = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        };
        localStorage.setItem("alarmTime", time); // "HH:MM"
        localStorage.setItem("snooze", String(snooze));
        localStorage.setItem("home", JSON.stringify(home));
        navigate("/alarm");
      },
      (err) => {
        console.error("位置情報エラー:", err);
        alert("現在地が取得できませんでした");
      },
      { enableHighAccuracy: true }
    );
  };

  return (
    <div className="page">
      <h1>アラーム設定</h1>
      <label>
        アラーム時刻:
        <input
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
        />
      </label>
      <br />
      <label>
        スヌーズ間隔（分）:
        <input
          type="number"
          min="1"
          value={snooze}
          onChange={(e) => setSnooze(Number(e.target.value))}
        />
      </label>
      <br />
      <button onClick={handleSetAlarm}>アラームを設定して次へ</button>
    </div>
  );
}
