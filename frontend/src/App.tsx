import Home from "./pages/home/page";
import {
  BrowserRouter as Router,
  Routes,
  Route,
} from "react-router-dom";
import Canvas from "./pages/canvas/index";

export function App() {
  return (
      <Router>
      <Routes>
      <Route path="/" element={<Home/>}/>
      <Route path="/canvas" element={<Canvas />}/>
      </Routes>
      </Router>
  );
}

export default App;
