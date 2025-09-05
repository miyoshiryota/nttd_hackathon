import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./styles/style.css";

export default function App() {
  const navigate = useNavigate();
  const [alarmDate, setAlarmDate] = useState(""); // "YYYY-MM-DD"
  const [alarmTime, setAlarmTime] = useState(""); // "HH:MM"
  const [snooze, setSnooze] = useState(() => {
    const v = localStorage.getItem("snooze");
    return v ? Number(v) : 3;
  });
  const [alarmSound, setAlarmSound] = useState(() => {
    return localStorage.getItem("alarmSound") || "alarm.mp3";
  });

  // デザインHTMLの要件：今日〜1週間後、今日を選んだら時刻のminを現在時刻+1分にする
  const [minDate, setMinDate] = useState("");
  const [maxDate, setMaxDate] = useState("");
  const [minTime, setMinTime] = useState("");

  useEffect(() => {
    const now = new Date();
    const toYMD = (d) => d.toISOString().split("T")[0];
    const today = toYMD(now);
    const weekLater = new Date(now);
    weekLater.setDate(now.getDate() + 7);

    setMinDate(today);
    setMaxDate(toYMD(weekLater));
    setAlarmDate((prev) => prev || today);

    // 「現在時刻 +1分」にする
    const nowPlus1 = new Date(now.getTime() + 60 * 1000);
    const hh = String(nowPlus1.getHours()).padStart(2, "0");
    const mm = String(nowPlus1.getMinutes()).padStart(2, "0");
    setMinTime(`${hh}:${mm}`);

    // 既存設定がある場合に復元（任意）
    const storedTime = localStorage.getItem("alarmTime");
    const storedDate = localStorage.getItem("alarmDate");
    if (storedTime) setAlarmTime(storedTime);
    if (storedDate) setAlarmDate(storedDate);


    // 現在地を自動で home に設定
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const h = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          };
          localStorage.setItem("home", JSON.stringify(h));
        },
        (err) => {
          console.error("位置情報の取得に失敗しました:", err);
          alert("位置情報が取得できませんでした。ブラウザの設定を確認してください。");
        }
      );
    } else {
      alert("このブラウザは位置情報をサポートしていません。");
    }
  }, []);

  // 日付変更時に minTime を切り替え（当日選択なら現在時刻+1分）
  const handleChangeDate = (value) => {
    setAlarmDate(value);
    const today = new Date().toISOString().split("T")[0];
    if (value === today) {
      const now = new Date();
      const nowPlus1 = new Date(now.getTime() + 60 * 1000); // +1分
      const hh = String(nowPlus1.getHours()).padStart(2, "0");
      const mm = String(nowPlus1.getMinutes()).padStart(2, "0");
      const mt = `${hh}:${mm}`;
      setMinTime(mt);

      // （既存の挙動は保持しているためここはそのまま）
      if (alarmTime && alarmTime < mt) {
        setAlarmTime(mt);
      }
    } else {
      setMinTime(""); // 制約解除
    }
  };

  // localStorage へ保存 → /alarm へ遷移
  const handleSubmit = (e) => {
    e.preventDefault();
    if (!alarmDate || !alarmTime) {
      alert("日付と時刻を設定してください。");
      return;
    }
    // 既存実装と互換のため、時刻とスヌーズは従来キーで保存
    localStorage.setItem("alarmDate", alarmDate);
    localStorage.setItem("alarmTime", alarmTime);
    localStorage.setItem("snooze", String(snooze));
    localStorage.setItem("alarmSound", alarmSound);

    navigate("/alarm");
  };

  return (
    <main>
      <header>
        <h1>強制移動アラーム</h1>
        <p>強制移動アラームを使って、遅刻を回避しよう！</p>
      </header>

      <br />
      <br />

      <section>
        <form onSubmit={handleSubmit}>
          {/* 見出しの丸枠 */}
          <h3 className="indexsettitle">日時を設定</h3>

          {/* 横並びコンテナ */}
          <div className="container">
            {/* 日付 */}
            <div className="item">
              <label htmlFor="alarmDate">日付</label>
              <input
                id="alarmDate"
                type="date"
                required
                min={minDate}
                max={maxDate}
                value={alarmDate}
                onChange={(e) => handleChangeDate(e.target.value)}
              />
            </div>

            {/* 時刻 */}
            <div className="item">
              <label htmlFor="alarmTime">時間</label>
              <input
                id="alarmTime"
                type="time"
                required
                min={minTime || undefined}
                value={alarmTime}
                onChange={(e) => setAlarmTime(e.target.value)}
              />
            </div>
          </div>

          <br />
          <br />

          {/* スヌーズ設定 */}
          <h3 className="indexsettitle">スヌーズを設定</h3>
          <div className="container">
            <div className="item">
              <label htmlFor="snoozeMinutes"></label>
              <select
                id="snoozeMinutes"
                required
                value={snooze}
                onChange={(e) => setSnooze(Number(e.target.value))}
              >
                {Array.from({ length: 15 }, (_, i) => 1 + i).map((m) => (
                  <option key={m} value={m}>
                    {m}分
                  </option>
                ))}
              </select>
            </div>
          </div>

          <br />
          <br />

          {/* アラーム音 */}
          <h3 className="indexsettitle">アラーム音を選択</h3>
          <div className="container">
            <div className="item">
              <label htmlFor="alarmSound">アラーム音</label>
              <select
                id="alarmSound"
                value={alarmSound}
                onChange={(e) => setAlarmSound(e.target.value)}
              >
                <option value="alarm.mp3">ピピピピッ系</option>
                <option value="alarm2.mp3">ジリジリジリ系</option>
              </select>
            </div>
          </div>

          <input type="submit" value="アラームを設定" className="btn1" />
        </form>
      </section>
    </main>
  );
}
