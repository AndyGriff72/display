import { BrowserRouter, NavLink, Route, Routes } from "react-router-dom";
import BoardEditorPage from "./pages/BoardEditorPage";
import ConnectionPage from "./pages/ConnectionPage";

export default function App() {
  return (
    <BrowserRouter>
      <nav className="topnav">
        <span className="brand">Display Board</span>
        <NavLink to="/" end>
          Board
        </NavLink>
        <NavLink to="/connection">Connection</NavLink>
      </nav>
      <Routes>
        <Route path="/" element={<BoardEditorPage />} />
        <Route path="/connection" element={<ConnectionPage />} />
        <Route path="*" element={<main className="page">There is no page here.</main>} />
      </Routes>
    </BrowserRouter>
  );
}
