// src/App.jsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

// ← 1回だけでOK：デザインCSSを読み込む（置き場所: src/styles/style.css）
import "./styles/style.css";

export default function App() {
  const navigate = useNavigate();

  // 既存のロジックはそのまま使えるよう、必要最低限の状態だけ管理
  const [alarmDate, setAlarmDate] = useState(""); // "YYYY-MM-DD"
  const [alarmTime, setAlarmTime] = useState(""); // "HH:MM"
  const [snooze, setSnooze] = useState(() => {
    // 既存と整合：localStorageにあれば初期値に反映
    const v = localStorage.getItem("snooze");
    return v ? Number(v) : 3;
  });

  // デザインHTMLの要件：今日〜1週間後、今日を選んだら時刻のminを現在時刻にする
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

    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    setMinTime(`${hh}:${mm}`);

    // 既存設定がある場合に復元（任意）
    const storedTime = localStorage.getItem("alarmTime");
    const storedDate = localStorage.getItem("alarmDate");
    if (storedTime) setAlarmTime(storedTime);
    if (storedDate) setAlarmDate(storedDate);

    // 📍 追加: 現在地を自動で home に設定
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

  // 日付変更時に minTime を切り替え
  const handleChangeDate = (value) => {
    setAlarmDate(value);
    const today = new Date().toISOString().split("T")[0];
    if (value === today) {
      const now = new Date();
      const hh = String(now.getHours()).padStart(2, "0");
      const mm = String(now.getMinutes()).padStart(2, "0");
      const mt = `${hh}:${mm}`;
      setMinTime(mt);
      if (alarmTime && alarmTime < mt) setAlarmTime("");
    } else {
      setMinTime(""); // 制約解除
    }
  };

  // 既存のアラーム設定ボタンと同じ役割：
  // localStorage へ保存 → /alarm へ遷移（既存 Alarm.jsx のロジックはそのまま動く）
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

    navigate("/alarm");
  };

  return (
    <main>
      {/* ───────── ヘッダー（デザインそのまま）───────── */}
      <header>
        <h1>強制移動アラーム</h1>
        <p>強制移動アラームを使って、遅刻を回避しよう！</p>
      </header>

      {/* ───────── 設定フォーム（既存ハンドラは無改変）───────── */}
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

          {/* スヌーズ設定（丸枠見出し＋横並び） */}
          <h3 className="indexsettitle">スヌーズを設定</h3>
          <div className="container">
            <div className="item">
              <label htmlFor="snoozeMinutes">間隔</label>
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

          {/* 決定ボタン（スタイルのみ付与、機能は handleSubmit が担当） */}
          <input type="submit" value="アラームを設定" className="btn1" />
        </form>
      </section>
    </main>
  );
}
