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

  // ★音源変更のたびに localStorage と 共有 <audio> を同期
  useEffect(() => {
    localStorage.setItem("alarmSound", alarmSound);
    if (window.__alarmEl) {
      const el = window.__alarmEl;
      const abs = new URL(`/${alarmSound}`, window.location.origin).href;
      if (el.src !== abs) {
        try {
          el.pause();
          el.currentTime = 0;
          el.src = `/${alarmSound}`;
          el.load();
          // 許可維持のためミュートで先行再生（失敗は無視）
          el.muted = true;
          el.play().catch(() => {});
        } catch {}
      }
    }
  }, [alarmSound]);

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

  /// App.jsx の handleSubmit 内（抜粋）
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!alarmDate || !alarmTime) { alert("日付と時刻を設定してください。"); return; }

    // 1) 共有インスタンスを用意（あれば再利用）
    const sound = alarmSound || "alarm.mp3";
    const el = window.__alarmEl || new Audio();
    el.loop = true;
    el.preload = "auto";
    const abs = new URL(`/${sound}`, window.location.origin).href;
    if (el.src !== abs) { el.src = `/${sound}`; el.load(); }

    try {
      // 2) ユーザー操作中にミュートで再生開始（ここが“解除”の核）
      el.muted = true;
      await el.play();           // ★ 必ず await
      window.__alarmEl = el;     // 3) グローバルに保持（遷移後も同じ要素を使う）
    } catch (err) {
      console.warn("音声の事前再生に失敗:", err);
      alert("スマホ自動再生のために『音声を有効化』を先にタップしてください。");
      return;
    }

    // 既存保存
    localStorage.setItem("alarmDate", alarmDate);
    localStorage.setItem("alarmTime", alarmTime);
    localStorage.setItem("snooze", String(snooze));
    localStorage.setItem("alarmSound", sound);

    // 4) 再生を維持したまま遷移（ミュートのまま走らせる）
    navigate("/alarm");
  };


  return (
    <main>
      <header style={{ textAlign: "center", padding: "16px 12px" }}>
        <h1>歩刑（とけい）</h1>
        <p style={{ margin: "10px 0 0", fontSize: "0.865rem", lineHeight: 1.5 }}>
          自宅からの脱出を保証！<br />
          100m以上移動しない限りアラームは鳴り止まない。<br />
          遅刻常習犯のあなたにぴったりの<strong>歩刑（とけい）！</strong><br />
          ※位置情報を使用します。
        </p>
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
                <option value="OneSong.mp3">NTTデータのうた</option>
              </select>
            </div>
          </div>
          <input type="submit" value="アラームを設定" className="btn1" />
        </form>
      </section>
      
    </main>
  );
}
