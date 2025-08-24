import { GPS } from "./components/GPS";
import { Link } from "react-router-dom";

export const App = () => {
  return (
    <div>
      <h1>強制移動アラーム</h1>
      <GPS />
      <Link to='/test'>
        ボタン
      </Link>
    </div>
  );
};
