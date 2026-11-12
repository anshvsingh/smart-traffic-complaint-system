
import { useEffect, useState } from "react";
import axios from "axios";
import Aura from "./Aura";
import "./AdminDashboard.css";

const API = "http://localhost:5050/api";

const STATUSES = [
  "Submitted",
  "Under Review",
  "In Progress",
  "Resolved",
  "Rejected",
];

const PRIORITIES = ["Low", "Medium", "High"];

function AdminDashboard({ user, onLogout }) {
  const [complaints, setComplaints] = useState([]);
  const [stats, setStats] = useState({ total: 0, byStatus: {} });
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState("");
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState("All");

  const authConfig = () => ({
    headers: {
      Authorization: `Bearer ${localStorage.getItem("token")}`,
    },
  });

  const loadData = async () => {
    setLoading(true);
    setMessage("");

    try {
      const [complaintResponse, dashboardResponse] =
        await Promise.all([
          axios.get(`${API}/admin/complaints`, authConfig()),
          axios.get(`${API}/admin/dashboard`, authConfig()),
        ]);

      setComplaints(complaintResponse.data.complaints || []);
      setStats(dashboardResponse.data);
    } catch (error) {
      if (error.response?.status === 401) {
        onLogout();
        return;
      }

      if (error.response?.status === 403) {
        setMessage(
          "Access denied. Your account does not have administrator permissions."
        );
      } else {
        setMessage(
          error.response?.data?.message ||
            "Unable to load administrator data."
        );
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const updateComplaint = async (id, field, value) => {
    setUpdating(id);
    setMessage("");

    try {
      const response = await axios.patch(
        `${API}/admin/complaints/${id}`,
        { [field]: value },
        authConfig()
      );

      const updatedComplaint = response.data.complaint;

      setComplaints((previous) =>
        previous.map((item) =>
          item._id === id ? updatedComplaint : item
        )
      );

      const dashboardResponse = await axios.get(
        `${API}/admin/dashboard`,
        authConfig()
      );

      setStats(dashboardResponse.data);
      setMessage("Complaint updated successfully.");
    } catch (error) {
      if (error.response?.status === 401) {
        onLogout();
        return;
      }

      setMessage(
        error.response?.data?.message ||
          "Unable to update complaint."
      );
    } finally {
      setUpdating("");
    }
  };

  const formatDate = (date) => {
    if (!date) return "N/A";

    return new Date(date).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  const activeCount =
    (stats.byStatus?.Submitted || 0) +
    (stats.byStatus?.["Under Review"] || 0) +
    (stats.byStatus?.["In Progress"] || 0);

  const resolvedCount = stats.byStatus?.Resolved || 0;
  const rejectedCount = stats.byStatus?.Rejected || 0;

  const filteredComplaints =
    filter === "All"
      ? complaints
      : complaints.filter((item) => item.status === filter);

  const getImageUrl = (imageUrl) => {
    if (!imageUrl) return null;
    return `http://localhost:5050${imageUrl}`;
  };

  return (
    <main className="admin-portal">
      <header className="admin-header">
        <div className="admin-brand">
          <h1 className="wordmark">
            Traffic<span>Care</span>
          </h1>
          <span className="kicker">Administration</span>
        </div>

        <div className="admin-user">
          <div className="admin-avatar" aria-hidden="true">
            {(user?.name || "A").charAt(0).toUpperCase()}
          </div>

          <div className="admin-user-details">
            <strong>{user?.name || "Administrator"}</strong>
            <span>Administrator account</span>
          </div>

          <button onClick={onLogout} className="logout-button lift">
            Log out
          </button>
        </div>
      </header>

      <div className="admin-content">
        <section className="portal-hero">
          <Aura />

          <div className="portal-hero-inner">
            <span className="kicker reveal" style={{ "--i": 0 }}>Administrator dashboard</span>
            <h2 className="display reveal" style={{ "--i": 1 }}>
              Manage your <em>city.</em>
            </h2>
            <p className="lede reveal" style={{ "--i": 2 }}>
              Monitor citizen complaints, set priorities and move every report
              towards resolved.
            </p>
          </div>
        </section>

        <section className="admin-stats reveal" style={{ "--i": 3 }} aria-label="Complaint summary">
          <article className="admin-stat-card">
            <p>Total complaints</p>
            <strong>{stats.total || 0}</strong>
          </article>

          <article className="admin-stat-card">
            <p>Active complaints</p>
            <strong>{activeCount}</strong>
          </article>

          <article className="admin-stat-card">
            <p>Resolved complaints</p>
            <strong>{resolvedCount}</strong>
          </article>

          <article className="admin-stat-card">
            <p>Rejected complaints</p>
            <strong>{rejectedCount}</strong>
          </article>
        </section>

        <section className="admin-section">
          <div className="admin-section-heading">
            <div>
              <span className="kicker">Citizen reports</span>
              <h2>Manage complaints</h2>
              <p>
                Review reports submitted by citizens and
                update their progress.
              </p>
            </div>

            <button
              className="refresh-button lift"
              onClick={loadData}
              disabled={loading}
            >
              {loading ? "Loading..." : "↻ Refresh"}
            </button>
          </div>

          {message && (
            <div className="admin-message" role="status">
              {message}
            </div>
          )}

          <div className="admin-filter">
            <label htmlFor="status-filter">Filter by status:</label>
            <select
              id="status-filter"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
            >
              <option value="All">All complaints</option>
              {STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </div>

          {loading ? (
            <div className="admin-empty">Loading complaints...</div>
          ) : filteredComplaints.length === 0 ? (
            <div className="empty-state">
              <h3>No complaints found</h3>
              <p>There are no complaints matching this filter.</p>
            </div>
          ) : (
            <div className="admin-table-wrapper">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Complaint</th>
                    <th>Citizen</th>
                    <th>Location</th>
                    <th>Date</th>
                    <th>Status</th>
                    <th>Priority</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredComplaints.map((complaint) => {
                    const prediction = complaint.aiPrediction;
                    const imageUrl = getImageUrl(complaint.imageUrl);

                    return (
                      <tr key={complaint._id}>
                        <td>
                          <strong>{complaint.category}</strong>

                          <small>
                            #{complaint._id.slice(-6).toUpperCase()}
                          </small>

                          <p className="admin-description">
                            {complaint.description}
                          </p>

                          {imageUrl && (
                            <img
                              className="admin-thumb"
                              src={imageUrl}
                              alt="Citizen's complaint"
                              onError={(event) => {
                                event.currentTarget.hidden = true;
                              }}
                            />
                          )}

                          <div className="admin-ai">
                            <strong>AI analysis</strong>

                            {prediction?.status === "Completed" ? (
                              <>
                                <p>
                                  Prediction:{" "}
                                  <strong>
                                    {prediction.category || "N/A"}
                                  </strong>
                                </p>

                                <p>
                                  Confidence:{" "}
                                  {typeof prediction.confidence === "number"
                                    ? `${(prediction.confidence * 100).toFixed(2)}%`
                                    : "N/A"}
                                </p>
                              </>
                            ) : (
                              <p>
                                {prediction?.status || "Not Requested"}
                              </p>
                            )}
                          </div>
                        </td>

                        <td>
                          <strong>
                            {complaint.user?.name || "Unknown"}
                          </strong>
                          <small>
                            {complaint.user?.email || "N/A"}
                          </small>
                        </td>

                        <td>{complaint.location}</td>

                        <td>{formatDate(complaint.createdAt)}</td>

                        <td>
                          <select
                            className="admin-select"
                            value={complaint.status || "Submitted"}
                            disabled={updating === complaint._id}
                            onChange={(event) =>
                              updateComplaint(
                                complaint._id,
                                "status",
                                event.target.value
                              )
                            }
                          >
                            {STATUSES.map((status) => (
                              <option key={status} value={status}>
                                {status}
                              </option>
                            ))}
                          </select>
                        </td>

                        <td>
                          <select
                            className="admin-select"
                            value={complaint.priority || "Medium"}
                            disabled={updating === complaint._id}
                            onChange={(event) =>
                              updateComplaint(
                                complaint._id,
                                "priority",
                                event.target.value
                              )
                            }
                          >
                            {PRIORITIES.map((priority) => (
                              <option key={priority} value={priority}>
                                {priority}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <footer className="admin-footer">
          <strong>TrafficCare Administration</strong>
          <span>Building safer streets together.</span>
        </footer>
      </div>
    </main>
  );
}

export default AdminDashboard;
