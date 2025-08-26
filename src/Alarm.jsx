/**
 * AlarmPage.jsx（超ていねい解説付き・完成版）
 * ------------------------------------------------------------
 * 機能：
 *  - アラーム「設定時刻」になるまで：自宅ピンと100m円だけ表示（履歴ピンはナシ）
 *  - アラーム鳴動中：30秒ごとに現在地を取り直し、地図にピンを“追加”していく
 *  - 自宅から100m超えたら自動停止（任意で変更可）
 *
 * 前提：
 *  - 依存：npm i react-router-dom react-leaflet leaflet
 *  - 地図のCSS：import "leaflet/dist/leaflet.css" が必要（下で読み込み済み）
 *  - /public/alarm.mp3 をプロジェクトに置く（音が鳴る）
 *  - localStorage に保存されていること：
 *      "home": {"lat": 数値, "lng": 数値} を JSON 文字列で
 *      "alarmTime": "HH:MM" 例："07:30"
 *      "snooze": "5" など（分）
 */

import React, { useEffect, useRef, useState } from "react"; // React と3つのフック（状態・副作用・参照）
import { useNavigate } from "react-router-dom";              // 画面遷移用のフック（設定画面へ戻る等）
import { MapContainer, TileLayer, Marker, Circle } from "react-leaflet"; // 地図の主要コンポーネント
import L from "leaflet";                                     // Leaflet 本体（ピン画像の設定などで使用）
import "leaflet/dist/leaflet.css";                           // 地図表示に必須のCSS（これがないと崩れる）

// --- Leaflet のデフォルトピン画像を Vite でも確実に表示させるための設定 ---
delete L.Icon.Default.prototype._getIconUrl;                 // 既定のパス解決を無効化して…
L.Icon.Default.mergeOptions({                                // 画像URLを手動で教える
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png", // 高解像度用
  iconUrl:       "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",    // 通常用
  shadowUrl:     "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",  // 影
});

// --- 2点の緯度経度（度）から“地球上の距離[m]”を計算（ハーサイン式） ---
function getDistance(pos1, pos2) {
  const [lat1, lon1] = pos1;                                // 1点目の [緯度, 経度]
  const [lat2, lon2] = pos2;                                // 2点目の [緯度, 経度]
  const R = 6371e3;                                         // 地球半径（約6371km）をメートルで
  const φ1 = (lat1 * Math.PI) / 180;                        // “度”→“ラジアン”に変換
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;               // 緯度差（ラジアン）
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;               // 経度差（ラジアン）

  // 球面三角法：ハーサイン式で中心角を求める
  const a =
    Math.sin(Δφ / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * (Math.sin(Δλ / 2) ** 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)); // 中心角（ラジアン）

  return R * c;                                             // 距離[m]
}

// --- 画面コンポーネント本体 ---
export default function AlarmPage() {
  const navigate = useNavigate();                           // ボタンで「/」へ戻る等に使用

  // 画面に表示・反映したい“状態（state）”
  const [status, setStatus] = useState("セット済み。アラームを待機中..."); // ステータス文言
  const [home, setHome] = useState(null);                   // 自宅座標 {lat, lng}
  const [alarmPlaying, setAlarmPlaying] = useState(false);  // 鳴動中フラグ（UI制御に使う）
  const [currentPos, setCurrentPos] = useState(null);       // 地図の中心更新用（任意・最後の現在地）
  const [track, setTrack] = useState([]);                   // ★ 鳴動中に30秒ごと追加される“履歴ピン”配列

  // 画面表示に直接は出さない“参照（ref）”＝裏方の道具
  const audioRef = useRef(null);                            // new Audio("/alarm.mp3") を保持
  const timerRef = useRef(null);                            // setTimeout のID（鳴動15分やスヌーズ用）
  const snoozeRef = useRef(null);                           // スヌーズ分（数値で保持）
  const checkIntervalRef = useRef(null);                    // ★ 30秒ごとの setInterval のID

  // --- 初期処理（マウント時1回だけ） ---
  useEffect(() => {
    // localStorage から設定値を取り出す
    const storedHome = localStorage.getItem("home");        // 例："{"lat":35.6,"lng":139.7}"
    const alarmTime  = localStorage.getItem("alarmTime");   // 例："07:30"
    const snooze     = localStorage.getItem("snooze");      // 例："5"

    // 設定がなければ戻す
    if (!storedHome || !alarmTime || !snooze) {
      alert("設定が見つかりません。設定画面に戻ります");
      navigate("/");                                        // ルートへ遷移
      return;                                               // この先は実行しない
    }

    setHome(JSON.parse(storedHome));                        // 文字列→オブジェクトに変換して state に保存
    snoozeRef.current = Number(snooze);                     // "5" などを数値 5 に

    // アラーム音の用意（/public/alarm.mp3 を参照）
    audioRef.current = new Audio("/alarm.mp3");
    audioRef.current.loop = true;                           // 鳴動中はループ再生

    // 要件：鳴動前は位置取得しない（履歴ピンは増やさない）
    // → なので watchPosition は使わず、時刻まで待つ

    // 次に鳴らすべき時刻までの待ち時間を計算し、タイマーをセット
    scheduleNextAlarm(alarmTime);

    // クリーンアップ（画面離脱時）：タイマーや音・interval を止める
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current); // 予約タイマー停止
      if (audioRef.current) {                               // 念のため音を確実に止める
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
      if (checkIntervalRef.current) {                       // 30秒ごとの interval も停止
        clearInterval(checkIntervalRef.current);
        checkIntervalRef.current = null;
      }
    };
  }, []);                                                   // [] なので“最初の1回だけ”

  // --- 次のアラーム発動までの wait を計算し、onAlarmTimeReached を予約 ---
  function scheduleNextAlarm(alarmTimeStr) {
    const now = new Date();                                 // 現在日時
    const [hh, mm] = alarmTimeStr.split(":").map(Number);   // "07:30" → [7, 30]
    const target = new Date(now);                           // 今日をベースに…
    target.setHours(hh, mm, 0, 0);                          // 今日の 07:30 に設定

    if (target.getTime() <= now.getTime()) {                // 既に過ぎていれば…
      target.setDate(target.getDate() + 1);                 // 翌日の 07:30 に繰り上げ
    }

    const wait = target.getTime() - now.getTime();          // 何ミリ秒後か
    setStatus(`アラーム設定中 (${alarmTimeStr}) — 発動まで ${Math.round(wait / 1000)} 秒`);

    // wait ミリ秒後に「時刻到来」を発火
    timerRef.current = setTimeout(() => {
      onAlarmTimeReached();
    }, wait);
  }

  // --- アラーム設定時刻になったら呼ばれる：現在地を1回だけ取得し、次の行動を決める ---
  function onAlarmTimeReached() {
    setStatus("時刻到来。位置を確認します...");
    const storedHome = JSON.parse(localStorage.getItem("home")); // 念のため最新を再読込

    // 端末が位置情報に非対応なら諦める
    if (!navigator.geolocation) {
      setStatus("位置情報利用不可のため終了");
      return;
    }

    // 現在地を“1回だけ”取得（ここではまだ履歴ピンは増やさない）
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const cur = [pos.coords.latitude, pos.coords.longitude];     // 現在地 [lat, lng]
        const dist = getDistance(cur, [storedHome.lat, storedHome.lng]); // 自宅との距離[m]

        if (dist > 100) {                                            // 100mより外なら
          setStatus("自宅から100mより外にいるためアラーム終了");     // 鳴らさず終了
        } else {
          startAlarmLoop();                                           // 100m以内 → 鳴動開始
        }
      },
      (err) => {
        console.error("位置情報エラー:", err);                       // 失敗ログ
        setStatus("位置情報取得に失敗。再試行をスヌーズで行います"); // 文言更新
        scheduleSnooze();                                             // 後で再チェック
      },
      { enableHighAccuracy: true }                                    // できるだけ正確に取りたい
    );
  }

  // --- アラーム鳴動の開始：音を鳴らし、30秒ごとに現在地をサンプリングして履歴ピンを追加 ---
  function startAlarmLoop() {
    setStatus("アラーム鳴動中（停止ボタンで停止）。最大15分で自動停止します"); // 文言
    audioRef.current.play().catch((e) => {                           // 再生（自動再生ブロックの可能性あり）
      console.warn("autoplay blocked:", e);
    });
    setAlarmPlaying(true);                                           // UI：停止ボタンを出す

    // 鳴り始め直後に1回サンプル（“鳴り始めの位置”もピンに残す）
    const sampleOnce = () => {
      const storedHome = JSON.parse(localStorage.getItem("home"));   // 最新の自宅座標を読む
      if (!storedHome) return;

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const cur = [pos.coords.latitude, pos.coords.longitude];   // 現在地
          setCurrentPos(cur);                                        // 地図中心の更新に使う（任意）
          setTrack((prev) => [...prev, cur]);                        // ★ 履歴配列に1点“追加”

          const dist = getDistance(cur, [storedHome.lat, storedHome.lng]); // 自宅との距離
          if (dist > 100) {                                          // 100mを超えたら
            setStatus("自宅から100m以上離れたためアラーム停止");     // 文言更新
            stopAlarmInternal();                                      // 音・interval を止める（履歴は保持）
          }
        },
        (err) => console.error("位置情報エラー:", err),              // 取得失敗はログだけ（次回で再挑戦）
        { enableHighAccuracy: true, maximumAge: 0 }                   // キャッシュを使わず“取り直し”
      );
    };

    sampleOnce();                                                     // 鳴り始めの1点を即記録
    if (checkIntervalRef.current) clearInterval(checkIntervalRef.current); // 二重起動防止
    checkIntervalRef.current = setInterval(sampleOnce, 30 * 1000);   // ★ 以後30秒ごとにサンプル

    // 安全装置：15分で自動停止 → その後はスヌーズへ
    timerRef.current = setTimeout(() => {
      stopAlarmInternal();                                            // 音とintervalを止める
      setStatus("15分経過によりアラーム停止。スヌーズをスケジュールします");
      scheduleSnooze();                                               // 後で再チェック
    }, 15 * 60 * 1000);
  }

  // --- 鳴動停止の共通処理（手動・自動どちらでも呼ぶ） ---
  function stopAlarmInternal() {
    if (audioRef.current) {                                           // 音があれば
      audioRef.current.pause();                                       // 停止
      audioRef.current.currentTime = 0;                               // 再生位置を先頭へ
    }
    setAlarmPlaying(false);                                           // UI：停止ボタンを隠す

    if (timerRef.current) {                                           // setTimeout の掃除
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (checkIntervalRef.current) {                                   // ★ 30秒 interval を掃除
      clearInterval(checkIntervalRef.current);
      checkIntervalRef.current = null;
    }

    // 履歴ピン（track）は残しておく：移動の軌跡を振り返れる
    // （不要なら setTrack([]) で消す実装に変更してOK）
  }

  // --- 停止ボタン（ユーザー操作）のハンドラ ---
  function handleStopButton() {
    stopAlarmInternal();                                              // 共通停止
    setStatus("アラーム停止。スヌーズをスケジュールします");          // 文言更新
    scheduleSnooze();                                                 // 後で再チェック予約
  }

  // --- スヌーズ：snooze分後に“1回だけ”現在地を再取得して、内/外で分岐 ---
  function scheduleSnooze() {
    const snoozeMin = snoozeRef.current || 5;                         // 未設定時は5分に
    setStatus(`スヌーズ中 (${snoozeMin}分後に再チェックします)`);        // 文言

    // snoozeMin 分後に“1回だけ”チェック
    timerRef.current = setTimeout(() => {
      const storedHome = JSON.parse(localStorage.getItem("home"));    // 最新を再読込
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const cur = [pos.coords.latitude, pos.coords.longitude];
          const dist = getDistance(cur, [storedHome.lat, storedHome.lng]);

          if (dist > 100) {                                           // 外なら
            setStatus("スヌーズ時の確認: 自宅外のためアラーム終了");     // ここでは終了
          } else {                                                    // 内なら
            startAlarmLoop();                                         // 再び鳴らす（また30秒ごと記録）
          }
        },
        (err) => {
          console.error("位置情報エラー:", err);                      // 失敗したら
          scheduleSnooze();                                           // もう一度スヌーズ（リトライ方針）
        },
        { enableHighAccuracy: true }
      );
    }, snoozeMin * 60 * 1000);                                        // 分 → ミリ秒変換
  }

  // --- 画面描画（JSX）：ステータス、地図、自宅円、履歴ピン、ボタン ---
  return (
    <div className="page">{/* 必要なら .page にスタイルを当てる */}
      <h1>アラーム画面</h1>
      <p>{status}</p> {/* 進行状況をテキストで見せる */}

      <div style={{ height: 300, marginTop: 12 }}>
        {home && (                                                   // 自宅座標が読み込めたら地図を出す
          <MapContainer
            center={currentPos || [home.lat, home.lng]}              // 地図の中心：最新の現在地 or 自宅
            zoom={17}                                                // 拡大率（大きいほど拡大）
            style={{ height: "100%", width: "100%" }}                // 親divいっぱいに広げる
          >
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" /> {/* OSM タイル */}
            <Marker position={[home.lat, home.lng]} />               {/* 自宅ピン */}
            <Circle
              center={[home.lat, home.lng]}                          // 自宅中心に
              radius={100}                                           // 半径100mの円（判定と合わせる）
              pathOptions={{ color: "blue", fillOpacity: 0.12 }}     // 見た目：薄い青
            />
            {/* 履歴ピン：鳴動前は track=[] → 何も表示されない。鳴動開始後は30秒ごとに増える */}
            {track.map((p, i) => (
              <Marker key={i} position={p} />
            ))}
          </MapContainer>
        )}
      </div>

      {/* 鳴っているときだけ“停止ボタン”を表示 */}
      {alarmPlaying && (
        <div style={{ marginTop: 12 }}>
          <button onClick={handleStopButton} className="stop-button">
            アラームを停止
          </button>
        </div>
      )}

      {/* 設定画面（"/"）へ戻るボタン */}
      <div style={{ marginTop: 12 }}>
        <button onClick={() => navigate("/")}>設定に戻る</button>
      </div>
    </div>
  );
}
