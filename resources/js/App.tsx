import { BrowserRouter, NavLink, Route, Routes, useLocation } from "react-router-dom";
import BoardEditorPage from "./pages/BoardEditorPage";
import ConnectionPage from "./pages/ConnectionPage";
import DataSourcesPage from "./pages/DataSourcesPage";

export default function App() {
  return (
    <BrowserRouter>
      <Nav />
      <Routes>
        <Route path="/" element={<BoardEditorPage />} />
        <Route path="/boards/:id" element={<BoardEditorPage />} />
        <Route path="/data-sources" element={<DataSourcesPage />} />
        <Route path="/connection" element={<ConnectionPage />} />
        <Route path="*" element={<main className="page">There is no page here.</main>} />
      </Routes>
    </BrowserRouter>
  );
}

function Nav() {
  // The board editor lives at / for a new board and /boards/:id for a saved one.
  const { pathname } = useLocation();
  const onBoards = pathname === "/" || pathname.startsWith("/boards");
  return (
    <nav className="topnav">
      <span className="brand">Display Board</span>
      <NavLink to="/" className={() => (onBoards ? "active" : "")}>
        Boards
      </NavLink>
      <NavLink to="/data-sources">Data sources</NavLink>
      <NavLink to="/connection">Connection</NavLink>
    </nav>
  );
}
