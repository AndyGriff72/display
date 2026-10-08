import { BrowserRouter, NavLink, Route, Routes, useLocation } from "react-router-dom";
import BoardEditorPage from "./pages/BoardEditorPage";
import ConnectionPage from "./pages/ConnectionPage";
import DataSourcesPage from "./pages/DataSourcesPage";
import ScreenPage from "./pages/ScreenPage";
import { csrfToken } from "./api/client";

const userName = document.querySelector<HTMLMetaElement>('meta[name="user-name"]')?.content ?? "";

export default function App() {
  return (
    <BrowserRouter>
      <Nav />
      <Routes>
        <Route path="/" element={<BoardEditorPage />} />
        <Route path="/boards/:id" element={<BoardEditorPage />} />
        <Route path="/data-sources" element={<DataSourcesPage />} />
        <Route path="/connection" element={<ConnectionPage />} />
        <Route path="/screen/:key" element={<ScreenPage />} />
        <Route path="*" element={<main className="page">There is no page here.</main>} />
      </Routes>
    </BrowserRouter>
  );
}

function Nav() {
  // The board editor lives at / for a new board and /boards/:id for a saved one.
  const { pathname } = useLocation();
  const onBoards = pathname === "/" || pathname.startsWith("/boards");
  // A screen shows the board alone.
  if (pathname.startsWith("/screen/")) return null;
  return (
    <nav className="topnav">
      <span className="brand">Display Board</span>
      <NavLink to="/" className={() => (onBoards ? "active" : "")}>
        Boards
      </NavLink>
      <NavLink to="/data-sources">Data sources</NavLink>
      <NavLink to="/connection">Connection</NavLink>
      <span className="topnav-user">
        {userName}
        <form method="post" action="/logout">
          <input type="hidden" name="_token" value={csrfToken()} />
          <button type="submit">Sign out</button>
        </form>
      </span>
    </nav>
  );
}
