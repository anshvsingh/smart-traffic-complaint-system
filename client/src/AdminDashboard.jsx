
import { useEffect, useState } from "react";
import axios from "axios";
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
          <div className="admin-logo">↗</div>
          <div>
            <h1>TrafficCare</h1>
            <span>SMART CITY · ADMINISTRATION</span>
          </div>
        </div>

        <div className="admin-user">
          <div className="admin-avatar">
            {(user?.name || "A").charAt(0).toUpperCase()}
          </div>

          <div className="admin-user-details">
            <strong>{user?.name || "Administrator"}</strong>
            <span>Administrator account</span>
          </div>

          <button onClick={onLogout} className="admin-logout">
            Log out
          </button>
        </div>
      </header>

      <div className="admin-content">
        <section className="admin-banner">
          <div>
            <span className="admin-kicker">
              ADMINISTRATOR DASHBOARD
            </span>
            <h2>Manage your city.</h2>
            <p>
              Monitor citizen complaints, manage priorities
              and help make your streets safer.
            </p>
          </div>

          <div className="admin-banner-icon">🏙️</div>
        </section>

        <section className="admin-stats">
          <article className="admin-stat-card">
            <span>📋</span>
            <div>
              <p>Total complaints</p>
              <strong>{stats.total || 0}</strong>
            </div>
          </article>

          <article className="admin-stat-card">
            <span>⏳</span>
            <div>
              <p>Active complaints</p>
              <strong>{activeCount}</strong>
            </div>
          </article>

          <article className="admin-stat-card">
            <span>✓</span>
            <div>
              <p>Resolved complaints</p>
              <strong>{resolvedCount}</strong>
            </div>
          </article>

          <article className="admin-stat-card">
            <span>✕</span>
            <div>
              <p>Rejected complaints</p>
              <strong>{rejectedCount}</strong>
            </div>
          </article>
        </section>

        <section className="admin-section">
          <div className="admin-section-heading">
            <div>
              <span className="admin-kicker">CITIZEN REPORTS</span>
              <h2>Manage complaints</h2>
              <p>
                Review reports submitted by citizens and
                update their progress.
              </p>
            </div>

            <button
              className="admin-refresh"
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
            <div className="admin-empty">
              <div>📭</div>
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
                            <div style={{ marginTop: "10px" }}>
                              <img
                                src={imageUrl}
                                alt="Citizen's complaint"
                                style={{
                                  width: "130px",
                                  height: "95px",
                                  objectFit: "cover",
                                  borderRadius: "8px",
                                }}
                              />
                            </div>
                          )}

                          <div style={{ marginTop: "10px" }}>
                            <strong>AI Analysis</strong>

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
