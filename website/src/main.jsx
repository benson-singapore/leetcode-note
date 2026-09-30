import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import Website from "./Website.jsx";
import "./site.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <Website />
    </BrowserRouter>
  </React.StrictMode>,
);
