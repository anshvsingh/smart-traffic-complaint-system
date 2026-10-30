
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
  const [loading, setLoading] = useState(false);

  const authConfig = () => ({
    headers: {
      Authorization: `Bearer ${localStorage.getItem("token")}`,
    },
  });

  const loadComplaints = async () => {
    try {
      const response = await axios.get(API, authConfig());
      setComplaints(response.data.complaints || []);
      setMessage("");
    } catch (error) {
      setMessage(
        error.response?.status === 401
          ? "Your session has expired. Please log in again."
          : "Could not load your complaints. Check that the server is running."
      );
      if (error.response?.status === 401) {
        onLogout();
      }
    }
  };

  useEffect(() => {
    loadComplaints();
  }, []);

  const handleChange = (event) => {
    setForm({
      ...form,
      [event.target.name]: event.target.value,
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      await axios.post(API, form, authConfig());

      setMessage("Complaint submitted successfully!");
      setForm({
        category: "Pothole",
        description: "",
        location: "",
      });

      await loadComplaints();
    } catch (error) {
      setMessage(
        error.response?.data?.message ||
          "Could not submit complaint. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="dashboard-page">
      <header className="dashboard-header">
        <div>
          <h1>TrafficCare</h1>
          <p>Citizen Complaint Portal</p>
        </div>

        <button type="button" onClick={onLogout}>
          Logout
        </button>
      </header>

      <section className="dashboard-hero">
        <p className="eyebrow">YOUR CITY, YOUR VOICE</p>
        <h2>Make your streets safer.</h2>
        <p>Report traffic issues and follow their progress.</p>
        {user?.name && <p>Welcome, {user.name}</p>}
      </section>

      <section className="dashboard-card">
        <h2>Submit a complaint</h2>
        <p>Tell us about a traffic problem in your area.</p>

        <form onSubmit={handleSubmit} className="complaint-form">
          <label>
            Complaint category
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
            Location
            <input
              name="location"
              value={form.location}
              onChange={handleChange}
              placeholder="e.g. Near college main gate"
              required
            />
          </label>

          <label>
            Describe the issue
            <textarea
              name="description"
              value={form.description}
              onChange={handleChange}
              placeholder="Explain the traffic problem..."
              rows="4"
              maxLength="2000"
              required
            />
          </label>

          <button
            type="submit"
            className="submit-button"
            disabled={loading}
          >
            {loading ? "Submitting..." : "Submit complaint →"}
          </button>
        </form>

        {message && (
          <p className="dashboard-message" role="status">
            {message}
          </p>
        )}
      </section>

      <section className="dashboard-card">
        <h2>My complaints</h2>
        <p>View the traffic issues you have reported.</p>

        <button type="button" onClick={loadComplaints}>
          Refresh complaints
        </button>

        {complaints.length === 0 ? (
          <p>No complaints found for your account.</p>
        ) : (
          <div className="complaint-list">
            {complaints.map((complaint) => (
              <article
                className="complaint-item"
                key={complaint._id}
              >
                <h3>{complaint.category}</h3>
                <p>{complaint.description}</p>
                <p>
                  <strong>Location:</strong> {complaint.location}
                </p>
                <p>
                  <strong>Reported:</strong>{" "}
                  {complaint.createdAt
                    ? new Date(complaint.createdAt).toLocaleString()
                    : "Date unavailable"}
                </p>
                <span className="status-pill">
                  {complaint.status}
                </span>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

export default Dashboard;
