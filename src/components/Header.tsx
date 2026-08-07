import { NavLink } from "react-router-dom";
import Logo from "./Logo";
import ConnectWalletButton from "./ConnectWalletButton";

export default function Header() {
  return (
    <header className="header">
      <div className="header-left">
        <div className="brand">
          <Logo />
          <span>
            Infinite <span className="brand-name-accent">Ledgers</span>
          </span>
        </div>
        <nav className="nav">
          <NavLink to="/swap" className={({ isActive }) => (isActive ? "active" : "")}>
            Swap
          </NavLink>
          <NavLink to="/pools" className={({ isActive }) => (isActive ? "active" : "")}>
            Pools
          </NavLink>
          <NavLink
            to="/liquidity"
            className={({ isActive }) => (isActive ? "active" : "")}
          >
            Liquidity
          </NavLink>
        </nav>
      </div>
      <ConnectWalletButton />
    </header>
  );
}
