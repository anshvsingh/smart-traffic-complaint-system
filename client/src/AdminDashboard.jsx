
import { useEffect, useState } from "react";
import axios from "axios";
import Aura from "./Aura";
import "./AdminDashboard.css";

const API = "http://localhost:5050/api";

const STATUSES = [
  "Submitted",
  "Under Review",
  "Assigned to Department",
  "Accepted by Department",
  "In Progress",
  "Work in Progress",
  "Work Completed",
  "Resolved",
  "Rejected",
];

const PRIORITIES = ["Low", "Medium", "High"];

const DEPARTMENTS = [
  "Roads & Maintenance",
  "Traffic Signal Department",
  "Traffic Police",
  "Electrical Department",
  "Transport Department",
];

function AdminDashboard({ user, onLogout }) {
  const [complaints, setComplaints] = useState([]);
  const [stats, setStats] = useState({ total: 0, byStatus: {} });
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState("");
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("info");
  const [filter, setFilter] = useState("All");
  const [assignments, setAssignments] = useState({});

  const authConfig = () => ({
    headers: {
      Authorization: `Bearer ${localStorage.getItem("token")}`,
    },
  });

  const showMessage = (text, type = "info") => {
    setMessage(text);
    setMessageType(type);
  };

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

      showMessage(
        error.response?.data?.message ||
          "Unable to load administrator data.",
        "error"
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const assignComplaint = async (complaintId) => {
    const assignedDepartment = assignments[complaintId];

    if (!assignedDepartment) {
      showMessage("Please select a department first.", "error");
      return;
    }

    setUpdating(complaintId);
    setMessage("");

    try {
      const response = await axios.patch(
        `${API}/admin/complaints/${complaintId}/assign`,
        { assignedDepartment },
        authConfig()
      );

      const updatedComplaint = response.data.complaint;

      if (updatedComplaint) {
        setComplaints((previous) =>
          previous.map((item) =>
            item._id === complaintId ? updatedComplaint : item
          )
        );
      } else {
        await loadData();
      }

      showMessage("Complaint assigned successfully.", "success");
    } catch (error) {
      showMessage(
        error.response?.data?.message ||
          "Unable to assign complaint. Make sure the department account exists.",
        "error"
      );
    } finally {
      setUpdating("");
    }
  };

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
      showMessage("Complaint updated successfully.", "success");
    } catch (error) {
      if (error.response?.status === 401) {
        onLogout();
        return;
      }

      showMessage(
        error.response?.data?.message ||
          "Unable to update complaint.",
        "error"
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
    (stats.byStatus?.["Assigned to Department"] || 0) +
    (stats.byStatus?.["Accepted by Department"] || 0) +
    (stats.byStatus?.["In Progress"] || 0) +
    (stats.byStatus?.["Work in Progress"] || 0) +
    (stats.byStatus?.["Work Completed"] || 0);

  const resolvedCount = stats.byStatus?.Resolved || 0;
  const rejectedCount = stats.byStatus?.Rejected || 0;

  const filteredComplaints =
    filter === "All"
      ? complaints
      : complaints.filter((item) => item.status === filter);

  const getImageUrl = (imageUrl) => {
    if (!imageUrl) return null;
    if (imageUrl.startsWith("http")) return imageUrl;
    return `http://localhost:5050${imageUrl}`;
  };

  const getStatusClass = (status) => {
    return (status || "Submitted")
      .toLowerCase()
      .replaceAll(" ", "-");
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
            <span className="kicker reveal" style={{ "--i": 0 }}>
              Administrator dashboard
            </span>

            <h2 className="display reveal" style={{ "--i": 1 }}>
              Manage your <em>city.</em>
            </h2>

            <p className="lede reveal" style={{ "--i": 2 }}>
              Monitor citizen complaints, set priorities and move every
              report towards resolved.
            </p>
          </div>
        </section>

        <section
          className="admin-stats reveal"
          style={{ "--i": 3 }}
          aria-label="Complaint summary"
        >
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

        {message && (
          <div
            className={`admin-message ${messageType}`}
            role="status"
          >
            {message}
          </div>
        )}

        <section className="admin-section">
          <div className="admin-section-heading">
            <div>
              <span className="kicker">Citizen reports</span>
              <h2>Manage complaints</h2>
              <p>
                Review reports, assign departments and update their progress.
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
            <div className="admin-empty">
              Loading complaints...
            </div>
          ) : filteredComplaints.length === 0 ? (
            <div className="empty-state">
              <h3>No complaints found</h3>
              <p>There are no complaints matching this filter.</p>
            </div>
          ) : (
            <div className="complaint-card-list">
              {filteredComplaints.map((complaint) => {
                const prediction = complaint.aiPrediction;
                const imageUrl = getImageUrl(complaint.imageUrl);

                return (
                  <article
                    className="complaint-card"
                    key={complaint._id}
                  >
                    <div className="complaint-card-top">
                      <div>
                        <span className="complaint-id">
                          COMPLAINT #
                          {complaint._id.slice(-6).toUpperCase()}
                        </span>

                        <h3>{complaint.category}</h3>
                      </div>

                      <span
                        className={`complaint-status-badge ${getStatusClass(
                          complaint.status
                        )}`}
                      >
                        {complaint.status || "Submitted"}
                      </span>
                    </div>

                    <div className="complaint-card-main">
                      <div className="complaint-report">
                        {imageUrl && (
                          <img
                            className="complaint-image"
                            src={imageUrl}
                            alt="Complaint evidence"
                            onError={(event) => {
                              event.currentTarget.hidden = true;
                            }}
                          />
                        )}

                        <div className="complaint-report-details">
                          <span className="complaint-label">
                            DESCRIPTION
                          </span>

                          <p>
                            {complaint.description ||
                              "No description provided."}
                          </p>

                          <span className="complaint-label">
                            LOCATION
                          </span>

                          <p>
                            {complaint.location || "Not provided"}
                          </p>
                        </div>
                      </div>

                      <div className="complaint-information">
                        <div className="complaint-info-item">
                          <span className="complaint-label">
                            REPORTED BY
                          </span>

                          <strong>
                            {complaint.user?.name || "Unknown"}
                          </strong>

                          <small>
                            {complaint.user?.email || "N/A"}
                          </small>
                        </div>

                        <div className="complaint-info-item">
                          <span className="complaint-label">
                            DATE REPORTED
                          </span>

                          <strong>
                            {formatDate(complaint.createdAt)}
                          </strong>
                        </div>

                        <div className="complaint-info-item">
                          <span className="complaint-label">
                            AI IMAGE ANALYSIS
                          </span>

                          {prediction?.status === "Completed" ? (
                            <>
                              <strong>
                                {prediction.category || "N/A"}
                              </strong>

                              <small>
                                Confidence:{" "}
                                {typeof prediction.confidence === "number"
                                  ? `${(
                                      prediction.confidence * 100
                                    ).toFixed(2)}%`
                                  : "N/A"}
                              </small>
                            </>
                          ) : (
                            <strong>
                              {prediction?.status || "Not Requested"}
                            </strong>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="complaint-card-controls">
                      <div className="complaint-control">
                        <label htmlFor={`status-${complaint._id}`}>
                          Complaint status
                        </label>

                        <select
                          id={`status-${complaint._id}`}
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
                      </div>

                      <div className="complaint-control">
                        <label htmlFor={`priority-${complaint._id}`}>
                          Priority
                        </label>

                        <select
                          id={`priority-${complaint._id}`}
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
                      </div>

                      <div className="complaint-control department-control">
                        <label htmlFor={`department-${complaint._id}`}>
                          Assign department
                        </label>

                        <select
                          id={`department-${complaint._id}`}
                          value={
                            assignments[complaint._id] ||
                            complaint.assignedDepartment ||
                            ""
                          }
                          disabled={updating === complaint._id}
                          onChange={(event) =>
                            setAssignments((previous) => ({
                              ...previous,
                              [complaint._id]: event.target.value,
                            }))
                          }
                        >
                          <option value="">
                            Choose department
                          </option>

                          {DEPARTMENTS.map((department) => (
                            <option
                              key={department}
                              value={department}
                            >
                              {department}
                            </option>
                          ))}
                        </select>

                        <button
                          type="button"
                          className="assign-button"
                          disabled={updating === complaint._id}
                          onClick={() =>
                            assignComplaint(complaint._id)
                          }
                        >
                          {updating === complaint._id
                            ? "Saving..."
                            : "Assign Department"}
                        </button>
                      </div>
                    </div>

                    <div className="complaint-card-footer">
                      <span>
                        Assigned to:{" "}
                        <strong>
                          {complaint.assignedDepartment ||
                            "Not assigned"}
                        </strong>
                      </span>

                      <span>
                        Priority:{" "}
                        <strong>
                          {complaint.priority || "Medium"}
                        </strong>
                      </span>
                    </div>
                  </article>
                );
              })}
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
