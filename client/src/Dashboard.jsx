
import { useEffect, useState } from "react";
import axios from "axios";

const API = "http://localhost:5050/api/complaints";

function Dashboard({ user, onLogout }) {
  const [form, setForm] = useState({
    category: "Pothole",
    description: "",
    location: "",
  });

  const [complaints, setComplaints] = useState([]);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("success");
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);

  const authConfig = () => ({
    headers: {
      Authorization: `Bearer ${localStorage.getItem("token")}`,
    },
  });

  const loadComplaints = async () => {
    setFetching(true);

    try {
      const response = await axios.get(API, authConfig());
      setComplaints(response.data.complaints || []);
    } catch (error) {
      if (error.response?.status === 401) {
        onLogout();
      } else {
        setMessage("Could not load your complaints. Please try again.");
        setMessageType("error");
      }
    } finally {
      setFetching(false);
    }
  };

  useEffect(() => {
    loadComplaints();
  }, []);

  const handleChange = (event) => {
    setForm((previous) => ({
      ...previous,
      [event.target.name]: event.target.value,
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      await axios.post(API, form, authConfig());

      setMessage("Your complaint has been submitted successfully.");
      setMessageType("success");

      setForm({
        category: "Pothole",
        description: "",
        location: "",
      });

      await loadComplaints();
    } catch (error) {
      if (error.response?.status === 401) {
        onLogout();
        return;
      }

      setMessage(
        error.response?.data?.message ||
          "Unable to submit complaint. Please try again."
      );
      setMessageType("error");
    } finally {
      setLoading(false);
    }
  };

  const getStatusClass = (status) => {
    switch (status) {
      case "Resolved":
        return "resolved";
      case "In Progress":
        return "in-progress";
      case "Under Review":
        return "under-review";
      case "Rejected":
        return "rejected";
      default:
        return "submitted";
    }
  };

  const formatDate = (date) => {
    if (!date) return "Date unavailable";

    return new Date(date).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  const resolvedCount = complaints.filter(
    (item) => item.status === "Resolved"
  ).length;

  const activeCount = complaints.filter(
    (item) =>
      item.status !== "Resolved" && item.status !== "Rejected"
  ).length;

  return (
    <main className="portal">
      <header className="portal-header">
        <div className="portal-brand">
          <div className="portal-logo">↗</div>
          <div>
            <h1>TrafficCare</h1>
            <span>SMART CITY · CITIZEN PORTAL</span>
          </div>
        </div>

        <div className="portal-user">
          <div className="user-avatar">
            {(user?.name || "C").charAt(0).toUpperCase()}
          </div>

          <div className="user-details">
            <strong>{user?.name || "Citizen"}</strong>
            <span>Citizen account</span>
          </div>

          <button className="logout-button" onClick={onLogout}>
            Log out
          </button>
        </div>
      </header>

      <div className="portal-content">
        <section className="welcome-banner">
          <div>
            <span className="welcome-label">CITIZEN DASHBOARD</span>
            <h2>Your city. Your voice.</h2>
            <p>
              Help make your streets safer by reporting traffic
              issues and tracking their progress.
            </p>
          </div>
          <div className="welcome-icon">🏙️</div>
        </section>

        <section className="stats-grid">
          <article className="stat-card">
            <span className="stat-icon">📋</span>
            <div>
              <span>Total complaints</span>
              <strong>{complaints.length}</strong>
            </div>
          </article>

          <article className="stat-card">
            <span className="stat-icon">⏳</span>
            <div>
              <span>Active complaints</span>
              <strong>{activeCount}</strong>
            </div>
          </article>

          <article className="stat-card">
            <span className="stat-icon">✓</span>
            <div>
              <span>Resolved complaints</span>
              <strong>{resolvedCount}</strong>
            </div>
          </article>
        </section>

        <section className="portal-section">
          <div className="section-heading">
            <div>
              <span className="section-kicker">REPORT AN ISSUE</span>
              <h2>Submit a complaint</h2>
              <p>Give us the details so the right team can take action.</p>
            </div>
          </div>

          <div className="portal-card">
            <form onSubmit={handleSubmit} className="modern-complaint-form">
              <label>
                <span>Complaint category</span>
                <select
                  name="category"
                  value={form.category}
                  onChange={handleChange}
                  required
                >
                  <option value="Pothole">Pothole / Road damage</option>
                  <option value="Traffic Signal">Traffic signal issue</option>
                  <option value="Illegal Parking">Illegal parking</option>
                  <option value="Road Blockage">Road blockage</option>
                  <option value="Traffic Congestion">Traffic congestion</option>
                  <option value="Street Lighting">Street lighting</option>
                  <option value="Accident">Accident / Hazard</option>
                  <option value="Pedestrian Safety">Pedestrian safety</option>
                  <option value="Road Sign">Damaged or missing road sign</option>
                  <option value="Public Transport">Public transport issue</option>
                  <option value="Other">Other traffic issue</option>
                </select>
              </label>

              <label>
                <span>Location</span>
                <input
                  name="location"
                  value={form.location}
                  onChange={handleChange}
                  placeholder="e.g. Near college main gate"
                  required
                />
              </label>

              <label>
                <span>Description</span>
                <textarea
                  name="description"
                  value={form.description}
                  onChange={handleChange}
                  placeholder="Describe the traffic issue, its severity and any other useful details..."
                  rows={5}
                  maxLength={2000}
                  required
                />
                <small>{form.description.length}/2000 characters</small>
              </label>

              <button
                className="modern-submit-button"
                type="submit"
                disabled={loading}
              >
                {loading ? "Submitting..." : "Submit complaint →"}
              </button>
            </form>

            {message && (
              <div
                className={`portal-message ${messageType}`}
                role="status"
              >
                {message}
              </div>
            )}
          </div>
        </section>

        <section className="portal-section">
          <div className="section-heading complaints-heading">
            <div>
              <span className="section-kicker">YOUR REPORTS</span>
              <h2>My complaints</h2>
              <p>Keep track of the issues you have reported.</p>
            </div>

            <button
              className="refresh-button"
              type="button"
              onClick={loadComplaints}
              disabled={fetching}
            >
              {fetching ? "Refreshing..." : "↻ Refresh"}
            </button>
          </div>

          {complaints.length === 0 ? (
            <div className="empty-state">
              <div>📭</div>
              <h3>No complaints yet</h3>
              <p>Your submitted complaints will appear here.</p>
            </div>
          ) : (
            <div className="modern-complaint-list">
              {complaints.map((complaint) => (
                <article
                  className="modern-complaint-card"
                  key={complaint._id}
                >
                  <div className="complaint-card-top">
                    <div>
                      <span className="complaint-reference">
                        COMPLAINT · {complaint._id.slice(-6).toUpperCase()}
                      </span>
                      <h3>{complaint.category}</h3>
                    </div>

                    <span
                      className={`modern-status ${getStatusClass(
                        complaint.status
                      )}`}
                    >
                      {complaint.status || "Submitted"}
                    </span>
                  </div>

                  <p className="complaint-description">
                    {complaint.description}
                  </p>

                  <div className="complaint-card-footer">
                    <span>📍 {complaint.location}</span>
                    <span>📅 {formatDate(complaint.createdAt)}</span>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <footer className="portal-footer">
          <span>TrafficCare</span>
          <span>Building safer streets together.</span>
        </footer>
      </div>
    </main>
  );
}

export default Dashboard;
