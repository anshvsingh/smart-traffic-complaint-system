
import { useState } from "react";
import axios from "axios";
import Dashboard from "./Dashboard";
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
      return savedToken && savedUser ? JSON.parse(savedUser) : null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

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
  };

  if (user) {
    return <Dashboard user={user} onLogout={handleLogout} />;
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="brand-icon">↗</div>

        <p className="eyebrow">SMART CITY · CONNECTED CITIZENS</p>

        <h1>
          Traffic<span>Care</span>
        </h1>

        <p className="subtitle">
          Report traffic problems. Help make your city better.
        </p>

        <div className="auth-tabs">
          <button
            type="button"
            className={mode === "login" ? "active" : ""}
            onClick={() => {
              setMode("login");
              setMessage("");
            }}
          >
            Login
          </button>

          <button
            type="button"
            className={mode === "register" ? "active" : ""}
            onClick={() => {
              setMode("register");
              setMessage("");
            }}
          >
            Register
          </button>
        </div>

        <h2>
          {mode === "login" ? "Welcome back" : "Create your account"}
        </h2>

        <p className="form-subtitle">
          {mode === "login"
            ? "Sign in to manage your traffic complaints."
            : "Join your community and report traffic problems."}
        </p>

        <form onSubmit={handleSubmit}>
          {mode === "register" && (
            <label>
              Full name
              <input
                type="text"
                name="name"
                placeholder="Enter your full name"
                value={form.name}
                onChange={handleChange}
                required
              />
            </label>
          )}

          <label>
            Email address
            <input
              type="email"
              name="email"
              placeholder="you@example.com"
              value={form.email}
              onChange={handleChange}
              required
            />
          </label>

          <label>
            Password
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

          {message && (
            <p className="auth-message" role="alert">
              {message}
            </p>
          )}

          <button
            className="submit-button"
            type="submit"
            disabled={loading}
          >
            {loading
              ? "Please wait..."
              : mode === "login"
                ? "Sign in →"
                : "Create account →"}
          </button>
        </form>

        <p className="switch-text">
          {mode === "login"
            ? "New to TrafficCare? "
            : "Already registered? "}
          <button
            type="button"
            onClick={() => {
              setMode(mode === "login" ? "register" : "login");
              setMessage("");
            }}
          >
            {mode === "login" ? "Register here" : "Sign in"}
          </button>
        </p>

        <footer>
          SMART TRAFFIC COMPLAINT &amp; MONITORING SYSTEM
        </footer>
      </section>
    </main>
  );
}

export default App;
