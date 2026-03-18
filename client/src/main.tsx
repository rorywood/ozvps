import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { initErrorTracking } from "./lib/error-tracking";

initErrorTracking();

createRoot(document.getElementById("root")!).render(<App />);
