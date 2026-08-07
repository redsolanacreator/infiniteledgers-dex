import { Navigate, Route, Routes } from "react-router-dom";
import Header from "./components/Header";
import StatusBanner from "./components/StatusBanner";
import SwapPage from "./pages/SwapPage";
import PoolsPage from "./pages/PoolsPage";
import PoolDetailPage from "./pages/PoolDetailPage";
import LiquidityPage from "./pages/LiquidityPage";

export default function App() {
  return (
    <div className="app-shell">
      <StatusBanner />
      <Header />
      <Routes>
        <Route path="/" element={<Navigate to="/swap" replace />} />
        <Route path="/swap" element={<SwapPage />} />
        <Route path="/pools" element={<PoolsPage />} />
        <Route path="/pools/:poolKey" element={<PoolDetailPage />} />
        <Route path="/liquidity" element={<LiquidityPage />} />
        <Route path="*" element={<Navigate to="/swap" replace />} />
      </Routes>
      <footer className="footer">
        Infinite Ledgers · {`infiniteledgers-1`} · AMM contract{" "}
        inf1nc5t…knfe8
      </footer>
    </div>
  );
}
