
const User = require("./models/User");

const departments = [
  {
    name: "Roads Department",
    email: "roads@trafficcare.com",
    department: "Roads & Maintenance",
    passwordKey: "DEPT_ROADS_PASSWORD",
  },
  {
    name: "Traffic Police",
    email: "police@trafficcare.com",
    department: "Traffic Police",
    passwordKey: "DEPT_POLICE_PASSWORD",
  },
  {
    name: "Electrical Department",
    email: "electrical@trafficcare.com",
    department: "Electrical Department",
    passwordKey: "DEPT_ELECTRICAL_PASSWORD",
  },
  {
    name: "Transport Department",
    email: "transport@trafficcare.com",
    department: "Transport Department",
    passwordKey: "DEPT_TRANSPORT_PASSWORD",
  },
  {
    name: "Traffic Signal Department",
    email: "signals@trafficcare.com",
    department: "Traffic Signal Department",
    passwordKey: "DEPT_SIGNALS_PASSWORD",
  },
];

const seedDepartments = async () => {
  console.log("Checking department accounts...");

  for (const department of departments) {
    const existingUser = await User.findOne({
      email: department.email,
    });

    if (existingUser) {
      console.log(`Already exists: ${department.department}`);
      continue;
    }

    const password = process.env[department.passwordKey];

    if (!password || password.length < 8) {
      throw new Error(
        `Missing or invalid environment variable: ${department.passwordKey}`
      );
    }

    await User.create({
      name: department.name,
      email: department.email,
      password,
      role: "department",
      department: department.department,
    });

    console.log(`Created: ${department.department}`);
  }

  console.log("Department account setup completed.");
};

module.exports = seedDepartments;
