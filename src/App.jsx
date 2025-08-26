import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MapContainer, TileLayer, Marker, Circle } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Leafletのデフォルトアイコン問題回避
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
  const [currentPos, setCurrentPos] = useState(null);
  const [watchId, setWatchId] = useState(null);

  // 起動時に現在地を取得して表示（地図上）
  useEffect(() => {
    if (!navigator.geolocation) {
      alert("位置情報が使えません");
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        setCurrentPos([pos.coords.latitude, pos.coords.longitude]);
      },
      (err) => {
        console.error("位置情報エラー:", err);
      },
      { enableHighAccuracy: true, maximumAge: 10000 }
    );
    setWatchId(id);
    return () => {
      if (watchId) navigator.geolocation.clearWatch(watchId);
      navigator.geolocation.clearWatch(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSetAlarm = () => {
    if (!time) {
      alert("アラーム時刻を指定してください");
      return;
    }
    if (!currentPos) {
      alert("現在地が取得できていません");
      return;
    }

    const home = { lat: currentPos[0], lng: currentPos[1] };
    localStorage.setItem("alarmTime", time); // "HH:MM"
    localStorage.setItem("snooze", String(snooze));
    localStorage.setItem("home", JSON.stringify(home));
    // 設定完了してアラーム画面へ遷移
    navigate("/alarm");
  };

  return (
    <div className="page">
      <h1>アラーム設定</h1>
      <label>
        アラーム時刻:
        <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
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

      <div style={{ marginTop: 12 }}>
        <h3>現在位置（これを自宅位置として保存します）</h3>
        {currentPos ? (
          <div className="map-wrap">
            <MapContainer center={currentPos} zoom={17} style={{ height: "300px" }}>
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              <Marker position={currentPos} />
              <Circle center={currentPos} radius={100} pathOptions={{ color: "blue", fillOpacity: 0.15 }} />
            </MapContainer>
          </div>
        ) : (
          <p>現在地を取得中…（ブラウザの位置情報許可を確認してください）</p>
        )}
      </div>
    </div>
  );
}
