
import { useLayoutEffect, useRef, useState } from "react";
import axios from "axios";
import Dashboard from "./Dashboard";
import AdminDashboard from "./AdminDashboard";
import Aura from "./Aura";
import "./App.css";

const API_URL = "http://localhost:5050/api";

function App() {
  const [mode, setMode] = useState("login");

  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
  });

  const [user, setUser] = useState(() => {
    try {
      const savedToken = localStorage.getItem("token");
      const savedUser = localStorage.getItem("user");
      return savedToken && savedUser
        ? JSON.parse(savedUser)
        : null;
    } catch {
      return null;
    }
  });

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const loginTabRef = useRef(null);
  const registerTabRef = useRef(null);
  const indicatorRef = useRef(null);

  // Slide the tab underline under the active tab. Only `transform` changes,
  // so the browser animates it on the compositor. Re-measured once web fonts
  // load and on resize, because tab widths depend on the font.
  useLayoutEffect(() => {
    const measure = () => {
      const tab = (mode === "login" ? loginTabRef : registerTabRef).current;
      const bar = indicatorRef.current;
      if (!tab || !bar) return;
      bar.style.transform = `translate3d(${tab.offsetLeft}px, 0, 0) scaleX(${tab.offsetWidth})`;
    };

    measure();
    document.fonts?.ready?.then(measure);
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [mode, user]);

  const switchMode = (next) => {
    setMode(next);
    setMessage("");
  };

  const handleChange = (event) => {
    setForm((previous) => ({
      ...previous,
      [event.target.name]: event.target.value,
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setMessage("");
    setLoading(true);

    try {
      const endpoint =
        mode === "login" ? "/auth/login" : "/auth/register";

      const payload = {
        email: form.email.trim(),
        password: form.password,
      };

      if (mode === "register") {
        payload.name = form.name.trim();
      }

      const response = await axios.post(
        `${API_URL}${endpoint}`,
        payload
      );

      if (mode === "register") {
        setMessage("Registration successful! Please log in.");
        setMode("login");

        setForm((previous) => ({
          ...previous,
          password: "",
        }));
      } else {
        const loggedInUser = response.data.user;

        localStorage.setItem("token", response.data.token);
        localStorage.setItem("user", JSON.stringify(loggedInUser));

        setUser(loggedInUser);
        // The dashboard replaces the login form in place; start it at the top
        // instead of inheriting the form's scroll position.
        window.scrollTo(0, 0);
      }
    } catch (error) {
      setMessage(
        error.response?.data?.message ||
          "Unable to connect to the server. Make sure the backend is running."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");

    setUser(null);
    setMode("login");
    setForm({ name: "", email: "", password: "" });
    setMessage("");
    window.scrollTo(0, 0);
  };

  // Role-based dashboard routing
  if (user) {
    if (user.role === "admin") {
      return (
        <AdminDashboard
          user={user}
          onLogout={handleLogout}
        />
      );
    }

    return (
      <Dashboard
        user={user}
        onLogout={handleLogout}
      />
    );
  }

  return (
    <main className="auth-page">
      <Aura />

      <section className="auth-intro">
        <h1 className="wordmark reveal" style={{ "--i": 0 }}>
          Traffic<span>Care</span>
        </h1>

        <p className="display reveal" style={{ "--i": 1 }}>
          Reporting that turns <em>potholes</em>, <em>broken signals</em>,{" "}
          <em>blocked roads</em> and <em>congestion</em> into safer streets.
        </p>

        <div className="auth-intro-foot reveal" style={{ "--i": 3 }}>
          <p>
            Snap a photo, drop a location, and our road-damage model gives your
            report a head start with the city team.
          </p>
          <span className="lavender-link">Smart Traffic Complaint System ↓</span>
        </div>
      </section>

      <section className="auth-card reveal" style={{ "--i": 2 }}>
        <div className="auth-tabs">
          <button
            type="button"
            ref={loginTabRef}
            className={mode === "login" ? "active" : ""}
            onClick={() => switchMode("login")}
          >
            Login
          </button>

          <button
            type="button"
            ref={registerTabRef}
            className={mode === "register" ? "active" : ""}
            onClick={() => switchMode("register")}
          >
            Register
          </button>

          <span className="tab-indicator" aria-hidden="true" ref={indicatorRef} />
        </div>

        {/* key={mode} remounts this block so it cross-fades on every switch */}
        <div className="swap" key={mode}>
          <h2>
            {mode === "login"
              ? "Welcome back"
              : "Create your account"}
          </h2>

          <p className="form-subtitle">
            {mode === "login"
              ? "Sign in to manage your traffic complaints."
              : "Join your community and report traffic problems."}
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Always rendered so it can animate open/closed; disabled + inert
              while collapsed so it is skipped by validation, focus and AT. */}
          <div
            className={`collapse ${mode === "register" ? "open" : ""}`}
            inert={mode !== "register"}
          >
            <div>
              <label className="field">
                <span>Full name</span>
                <input
                  type="text"
                  name="name"
                  placeholder="Enter your full name"
                  value={form.name}
                  onChange={handleChange}
                  disabled={mode !== "register"}
                  required
                />
              </label>
            </div>
          </div>

          <label className="field">
            <span>Email address</span>
            <input
              type="email"
              name="email"
              placeholder="you@example.com"
              value={form.email}
              onChange={handleChange}
              required
            />
          </label>

          <label className="field">
            <span>Password</span>
            <input
              type="password"
              name="password"
              placeholder="Enter your password"
              value={form.password}
              onChange={handleChange}
              minLength={8}
              required
            />
          </label>

          <div className={`collapse ${message ? "open" : ""}`}>
            <div>
              {message && (
                <p className="auth-message" role="alert">
                  {message}
                </p>
              )}
            </div>
          </div>

          <button
            className="submit-button lift"
            type="submit"
            disabled={loading}
          >
            <span className="swap" key={loading ? "loading" : mode}>
              {loading
                ? "Please wait..."
                : mode === "login"
                  ? <>Sign in <span className="arrow" aria-hidden="true">→</span></>
                  : <>Create account <span className="arrow" aria-hidden="true">→</span></>}
            </span>
          </button>
        </form>

        <p className="switch-text">
          {mode === "login"
            ? "New to TrafficCare? "
            : "Already registered? "}

          <button
            type="button"
            onClick={() => switchMode(mode === "login" ? "register" : "login")}
          >
            {mode === "login" ? "Register here" : "Sign in"}
          </button>
        </p>
      </section>
    </main>
  );
}

export default App;
