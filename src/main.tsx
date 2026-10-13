import ReactDOM from "react-dom/client";
import "./themes/load-fonts";
import "./styles/app.css";
import "./styles/prose.css";
import { App } from "./ui/App";

// No StrictMode: its double-run effects would double-register Rust watchers and race the cold-start open queue.
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(<App />);
