import { useState, useEffect } from "react";

export const GPS = () => {
  const [position, setPosition] = useState({ lat: null, lng: null });
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!navigator.geolocation) {
      setError("Geolocationはサポートされていません");
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setPosition({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
      },
      (err) => {
        setError(err.message);
      },
      {
        enableHighAccuracy: true, // 高精度モード
        maximumAge: 0,
        timeout: 5000,
      }
    );

    // コンポーネントがアンマウントされたら監視を停止
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  return (
    <div>
      <h2>GPS情報</h2>
      {error && <p>エラー: {error}</p>}
      <p>緯度: {position.lat}</p>
      <p>経度: {position.lng}</p>
    </div>
  );
};
