import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "leaflet/dist/leaflet.css";
import "./wardogs/app.css";
import { WardogsApp } from "./wardogs/App";

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root");

createRoot(root).render(
  <StrictMode>
    <WardogsApp />
  </StrictMode>,
);
