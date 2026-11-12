
import { useEffect, useState } from "react";
import axios from "axios";
import Aura from "./Aura";

const API = "http://localhost:5050/api/complaints";
const SERVER_URL = "http://localhost:5050";

function Dashboard({ user, onLogout }) {
  const [form, setForm] = useState({
    category: "Pothole",
    description: "",
    location: "",
  });

  const [image, setImage] = useState(null);
  const [imagePreview, setImagePreview] = useState("");
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

  useEffect(() => {
    return () => {
      if (imagePreview) {
        URL.revokeObjectURL(imagePreview);
      }
    };
  }, [imagePreview]);

  const handleChange = (event) => {
    setForm((previous) => ({
      ...previous,
      [event.target.name]: event.target.value,
    }));
  };

  const handleImageChange = (event) => {
    const selectedFile = event.target.files?.[0];

    // Drop any previous selection first, so a rejected file doesn't leave
    // the old image attached (and previewed) while the input looks empty.
    setImage(null);
    setImagePreview("");

    if (!selectedFile) return;

    if (!["image/jpeg", "image/png"].includes(selectedFile.type)) {
      setMessage("Please select a JPG or PNG image.");
      setMessageType("error");
      event.target.value = "";
      return;
    }

    if (selectedFile.size > 10 * 1024 * 1024) {
      setMessage("The image must be 10 MB or smaller.");
      setMessageType("error");
      event.target.value = "";
      return;
    }

    setImage(selectedFile);
    setImagePreview(URL.createObjectURL(selectedFile));
    setMessage("");
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      const formData = new FormData();

      formData.append("category", form.category);
      formData.append("description", form.description);
      formData.append("location", form.location);

      if (image) {
        formData.append("image", image);
      }

      const response = await axios.post(API, formData, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      });

      const savedComplaint = response.data.complaint;
      const prediction = savedComplaint?.aiPrediction;

      if (prediction?.status === "Completed") {
        setMessage(
          `Complaint submitted! AI prediction: ${prediction.category} (${(prediction.confidence * 100).toFixed(1)}% confidence).`
        );
      } else if (prediction?.status === "Failed") {
        setMessage(
          "Complaint submitted, but AI prediction failed. You can still report the issue normally."
        );
      } else {
        setMessage("Your complaint has been submitted successfully.");
      }

      setMessageType("success");

      setForm({
        category: "Pothole",
        description: "",
        location: "",
      });

      setImage(null);
      setImagePreview("");

      const fileInput = document.getElementById("complaint-image");
      if (fileInput) fileInput.value = "";

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
    (item) => item.status !== "Resolved" && item.status !== "Rejected"
  ).length;

  return (
    <main className="portal">
      <header className="portal-header">
        <div className="portal-brand">
          <span className="wordmark">
            Traffic<span>Care</span>
          </span>
          <span className="kicker">Citizen portal</span>
        </div>

        <div className="portal-user">
          <div className="user-avatar" aria-hidden="true">
            {(user?.name || "C").charAt(0).toUpperCase()}
          </div>

          <div className="user-details">
            <strong>{user?.name || "Citizen"}</strong>
            <span>Citizen account</span>
          </div>

          <button className="logout-button lift" onClick={onLogout}>
            Log out
          </button>
        </div>
      </header>

      <div className="portal-content">
        <section className="portal-hero">
          <Aura />

          <div className="portal-hero-inner">
            <span className="kicker reveal" style={{ "--i": 0 }}>
              Hello, {user?.name?.split(" ")[0] || "there"}
            </span>
            <h2 className="display reveal" style={{ "--i": 1 }}>Your city. Your voice.</h2>
            <p className="lede reveal" style={{ "--i": 2 }}>
              Report potholes, broken signals and blocked roads, then follow
              each report until it is fixed.
            </p>
            <a className="lavender-link reveal" style={{ "--i": 3 }} href="#report">
              Report an issue ↓
            </a>
          </div>
        </section>

        <section className="stats-grid reveal" style={{ "--i": 4 }} aria-label="Complaint summary">
          <article className="stat-card">
            <span>Total complaints</span>
            <strong>{complaints.length}</strong>
          </article>

          <article className="stat-card">
            <span>Active complaints</span>
            <strong>{activeCount}</strong>
          </article>

          <article className="stat-card">
            <span>Resolved complaints</span>
            <strong>{resolvedCount}</strong>
          </article>
        </section>

        <section className="portal-section section-split" id="report">
          <div className="section-heading">
            <div>
              <span className="kicker">Report an issue</span>
              <h2>Submit a complaint</h2>
              <p>Give us the details so the right team can take action.</p>
            </div>
          </div>

          <div className="portal-card">
            <form onSubmit={handleSubmit} className="modern-complaint-form">
              <label className="field">
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

              <label className="field">
                <span>Location</span>
                <input
                  name="location"
                  value={form.location}
                  onChange={handleChange}
                  placeholder="e.g. Near college main gate"
                  maxLength={200}
                  required
                />
              </label>

              <label className="field">
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

              <label className="field">
                <span>Road image (optional)</span>
                <input
                  id="complaint-image"
                  type="file"
                  accept="image/jpeg,image/png"
                  onChange={handleImageChange}
                />
                <small>
                  JPG or PNG, up to 10 MB. Our AI model checks the photo for
                  potholes, road damage, or a normal road.
                </small>
              </label>

              {imagePreview && (
                <div className="image-preview">
                  <p>Image preview</p>
                  <img src={imagePreview} alt="Selected road" />
                  <button
                    type="button"
                    className="button-ghost lift"
                    onClick={() => {
                      setImage(null);
                      setImagePreview("");
                      const input = document.getElementById("complaint-image");
                      if (input) input.value = "";
                    }}
                  >
                    Remove image
                  </button>
                </div>
              )}

              <button
                className="modern-submit-button lift"
                type="submit"
                disabled={loading}
              >
                {loading ? "Submitting..." : <>Submit complaint <span className="arrow" aria-hidden="true">→</span></>}
              </button>
            </form>

            {message && (
              <div
                className={`notice ${messageType}`}
                role={messageType === "error" ? "alert" : "status"}
                aria-live={messageType === "error" ? "assertive" : "polite"}
              >
                {message}
              </div>
            )}
          </div>
        </section>

        <section className="portal-section">
          <div className="section-heading">
            <div>
              <span className="kicker">Your reports</span>
              <h2>My complaints</h2>
              <p>Keep track of the issues you have reported.</p>
            </div>

            <button
              className="refresh-button lift"
              type="button"
              onClick={loadComplaints}
              disabled={fetching}
            >
              {fetching ? "Refreshing..." : "↻ Refresh"}
            </button>
          </div>

          {complaints.length === 0 ? (
            <div className="empty-state">
              <h3>No complaints yet</h3>
              <p>Your submitted complaints will appear here.</p>
            </div>
          ) : (
            <div className="modern-complaint-list">
              {complaints.map((complaint) => (
                <article className="modern-complaint-card" key={complaint._id}>
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

                  <div className="complaint-body">
                    <p className="complaint-description">
                      {complaint.description}
                    </p>

                    {complaint.aiPrediction?.status === "Completed" && (
                      <div className="ai-panel">
                        <strong>AI road analysis</strong>
                        <p>Prediction: {complaint.aiPrediction.category}</p>
                        <p>
                          Confidence:{" "}
                          {(complaint.aiPrediction.confidence * 100).toFixed(1)}%
                        </p>
                        <small>
                          AI assistance only; verify the road condition manually.
                        </small>
                      </div>
                    )}

                    {complaint.aiPrediction?.status === "Failed" && (
                      <p className="ai-muted">
                        AI analysis was unavailable for this image.
                      </p>
                    )}
                  </div>

                  {complaint.imageUrl && (
                    <div className="complaint-media">
                      <img
                        src={`${SERVER_URL}${complaint.imageUrl}`}
                        alt="Road reported in complaint"
                        loading="lazy"
                        onError={(event) => {
                          event.currentTarget.hidden = true;
                        }}
                      />
                    </div>
                  )}

                  <div className="complaint-card-footer">
                    <span>📍 {complaint.location}</span>
                    <span>{formatDate(complaint.createdAt)}</span>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <footer className="portal-footer">
          <span className="wordmark">
            Traffic<span>Care</span>
          </span>
          <span>Building safer streets together.</span>
        </footer>
      </div>
    </main>
  );
}

export default Dashboard;
