
import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import "./DepartmentDashboard.css";

const API_URL = "http://localhost:5050/api";

function DepartmentDashboard({ user, onLogout }) {
  const [complaints, setComplaints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedComplaint, setSelectedComplaint] = useState(null);
  const [progressMessages, setProgressMessages] = useState({});
  const [updating, setUpdating] = useState(false);
  const [notice, setNotice] = useState("");

  const getHeaders = () => ({
    Authorization: `Bearer ${localStorage.getItem("token")}`,
  });

  const fetchComplaints = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const response = await axios.get(
        `${API_URL}/department/complaints`,
        { headers: getHeaders() }
      );

      const refreshed = response.data.complaints || [];
      setComplaints(refreshed);

      // Keep the details modal updated only if it is already open.
      setSelectedComplaint((current) => {
        if (!current) return null;

        return (
          refreshed.find((item) => item._id === current._id) || null
        );
      });
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "Unable to load assigned complaints."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchComplaints();
  }, [fetchComplaints]);

  const handleAccept = async (complaintId) => {
    try {
      setUpdating(true);
      setNotice("");

      await axios.patch(
        `${API_URL}/department/complaints/${complaintId}/accept`,
        {},
        { headers: getHeaders() }
      );

      setNotice("Complaint accepted successfully.");
      await fetchComplaints();
    } catch (err) {
      setNotice(
        err.response?.data?.message ||
          "Unable to accept complaint."
      );
    } finally {
      setUpdating(false);
    }
  };

  const handleProgress = async (complaintId, completed = false) => {
    const message = progressMessages[complaintId] || "";

    if (!message.trim()) {
      setNotice("Please enter a progress message.");
      return;
    }

    try {
      setUpdating(true);
      setNotice("");

      await axios.patch(
        `${API_URL}/department/complaints/${complaintId}/progress`,
        {
          message: message.trim(),
          status: completed
            ? "Work Completed"
            : "Work in Progress",
        },
        { headers: getHeaders() }
      );

      setProgressMessages((previous) => ({
        ...previous,
        [complaintId]: "",
      }));

      setNotice(
        completed
          ? "Work marked as completed. Awaiting admin verification."
          : "Progress update submitted successfully."
      );

      await fetchComplaints();
    } catch (err) {
      setNotice(
        err.response?.data?.message ||
          "Unable to submit progress update."
      );
    } finally {
      setUpdating(false);
    }
  };

  const getStatusClass = (status) =>
    (status || "Submitted")
      .toLowerCase()
      .replace(/\s+/g, "-");

  const getCount = (status) =>
    complaints.filter(
      (complaint) => complaint.departmentStatus === status
    ).length;

  const formatDate = (date) => {
    if (!date) return "Date unavailable";
    return new Date(date).toLocaleString();
  };

  const getImageUrl = (imageUrl) => {
    if (!imageUrl) return null;

    if (
      imageUrl.startsWith("http://") ||
      imageUrl.startsWith("https://")
    ) {
      return imageUrl;
    }

    return `http://localhost:5050${imageUrl.startsWith("/") ? "" : "/"}${imageUrl}`;
  };

  return (
    <main className="department-page">
      <header className="department-header">
        <div>
          <h1>Traffic<span>Care</span></h1>
          <p>Department Management Portal</p>
        </div>

        <div className="department-user">
          <div>
            <strong>{user.name}</strong>
            <span>{user.department || "Department"}</span>
          </div>

          <button onClick={onLogout}>Logout</button>
        </div>
      </header>

      <section className="department-content">
        <div className="department-welcome">
          <div>
            <p className="department-eyebrow">
              DEPARTMENT WORKSPACE
            </p>

            <h2>Assigned Complaints</h2>

            <p>
              Review assignments, record progress, and report
              completed work to the administration.
            </p>
          </div>

          <button
            className="department-refresh"
            onClick={fetchComplaints}
            disabled={loading}
          >
            Refresh
          </button>
        </div>

        {notice && (
          <div className="department-notice" role="status">
            {notice}
          </div>
        )}

        <section className="department-stats">
          <article>
            <span>Total Assigned</span>
            <strong>{complaints.length}</strong>
          </article>

          <article>
            <span>Awaiting Acceptance</span>
            <strong>{getCount("Assigned")}</strong>
          </article>

          <article>
            <span>In Progress</span>
            <strong>
              {getCount("Work in Progress") + getCount("Accepted")}
            </strong>
          </article>

          <article>
            <span>Work Completed</span>
            <strong>{getCount("Work Completed")}</strong>
          </article>
        </section>

        {loading ? (
          <div className="department-empty">
            Loading assigned complaints...
          </div>
        ) : error ? (
          <div className="department-error">
            {error}
            <button onClick={fetchComplaints}>Try again</button>
          </div>
        ) : complaints.length === 0 ? (
          <div className="department-empty">
            <h3>No assigned complaints yet</h3>
            <p>
              New complaints forwarded by the administrator
              will appear here.
            </p>
          </div>
        ) : (
          <section className="department-list">
            {complaints.map((complaint) => (
              <article
                className="department-complaint"
                key={complaint._id}
              >
                <div className="department-complaint-top">
                  <div>
                    <span className="department-category">
                      {complaint.category}
                    </span>

                    <h3>
                      {complaint.description || "Traffic complaint"}
                    </h3>
                  </div>

                  <span
                    className={`department-status ${getStatusClass(
                      complaint.departmentStatus
                    )}`}
                  >
                    {complaint.departmentStatus}
                  </span>
                </div>

                <div className="department-meta">
                  <span>
                    <strong>Location:</strong>{" "}
                    {complaint.location || "Not provided"}
                  </span>

                  <span>
                    <strong>Citizen:</strong>{" "}
                    {complaint.user?.name || "Unknown"}
                  </span>

                  <span>
                    <strong>Submitted:</strong>{" "}
                    {formatDate(complaint.createdAt)}
                  </span>
                </div>

                {complaint.imageUrl && (
                  <img
                    className="department-complaint-image"
                    src={getImageUrl(complaint.imageUrl)}
                    alt="Complaint evidence"
                  />
                )}

                <div className="department-actions">
                  <button
                    className="department-secondary-button"
                    onClick={() => setSelectedComplaint(complaint)}
                  >
                    View Details
                  </button>

                  {complaint.departmentStatus === "Assigned" && (
                    <button
                      className="department-primary-button"
                      onClick={() => handleAccept(complaint._id)}
                      disabled={updating}
                    >
                      Accept Assignment
                    </button>
                  )}
                </div>

                {["Accepted", "Work in Progress"].includes(
                  complaint.departmentStatus
                ) && (
                  <div className="department-progress-form">
                    <label>
                      Progress update

                      <textarea
                        value={progressMessages[complaint._id] || ""}
                        onChange={(event) =>
                          setProgressMessages((previous) => ({
                            ...previous,
                            [complaint._id]: event.target.value,
                          }))
                        }
                        placeholder="Describe the work completed or current progress..."
                        rows={3}
                      />
                    </label>

                    <div>
                      <button
                        className="department-secondary-button"
                        disabled={updating}
                        onClick={() =>
                          handleProgress(complaint._id, false)
                        }
                      >
                        Update Progress
                      </button>

                      <button
                        className="department-primary-button"
                        disabled={updating}
                        onClick={() =>
                          handleProgress(complaint._id, true)
                        }
                      >
                        Mark Work Completed
                      </button>
                    </div>
                  </div>
                )}

                {complaint.departmentStatus === "Work Completed" && (
                  <p className="department-completed-note">
                    Work submitted as completed. Waiting for
                    administrator verification.
                  </p>
                )}
              </article>
            ))}
          </section>
        )}
      </section>

      {selectedComplaint && (
        <div
          className="department-modal-backdrop"
          onClick={() => setSelectedComplaint(null)}
        >
          <section
            className="department-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              className="department-modal-close"
              onClick={() => setSelectedComplaint(null)}
            >
              ×
            </button>

            <p className="department-eyebrow">
              COMPLAINT DETAILS
            </p>

            <h2>{selectedComplaint.category}</h2>

            <p>{selectedComplaint.description}</p>

            <p>
              <strong>Location:</strong>{" "}
              {selectedComplaint.location || "Not provided"}
            </p>

            <p>
              <strong>Citizen:</strong>{" "}
              {selectedComplaint.user?.name || "Unknown"}
            </p>

            <p>
              <strong>Status:</strong>{" "}
              {selectedComplaint.status}
            </p>

            <h3>Progress History</h3>

            <div className="department-timeline">
              {selectedComplaint.progressUpdates?.length ? (
                [...selectedComplaint.progressUpdates]
                  .reverse()
                  .map((update, index) => (
                    <article key={update._id || index}>
                      <strong>{update.role}</strong>
                      <p>{update.message}</p>
                      <span>{formatDate(update.createdAt)}</span>
                    </article>
                  ))
              ) : (
                <p>No progress updates recorded yet.</p>
              )}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

export default DepartmentDashboard;
