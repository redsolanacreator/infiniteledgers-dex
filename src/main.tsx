import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { WalletProvider } from "./context/WalletContext";
import { NetworkStatusProvider } from "./context/NetworkStatusContext";
import { PoolsProvider } from "./context/PoolsContext";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <NetworkStatusProvider>
        <WalletProvider>
          <PoolsProvider>
            <App />
          </PoolsProvider>
        </WalletProvider>
      </NetworkStatusProvider>
    </BrowserRouter>
  </React.StrictMode>
);
