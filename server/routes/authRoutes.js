
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");

const router = express.Router();

// Citizen registration
router.post("/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (
      typeof name !== "string" ||
      typeof email !== "string" ||
      typeof password !== "string" ||
      !name.trim() ||
      !email.trim() ||
      password.length < 8
    ) {
      return res.status(400).json({
        status: "error",
        message: "Provide a name, valid email, and password of at least 8 characters",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const existingUser = await User.findOne({ email: normalizedEmail });

    if (existingUser) {
      return res.status(409).json({
        status: "error",
        message: "An account with this email already exists",
      });
    }

    // Never accept a role from the registration request.
    const user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      password,
      role: "citizen",
    });

    return res.status(201).json({
      status: "success",
      message: "Registration successful",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        status: "error",
        message: "An account with this email already exists",
      });
    }

    console.error("Registration error:", error.message);

    return res.status(500).json({
      status: "error",
      message: "Unable to register account",
    });
  }
});

// Citizen login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (
      typeof email !== "string" ||
      typeof password !== "string" ||
      !email.trim() ||
      !password
    ) {
      return res.status(400).json({
        status: "error",
        message: "Email and password are required",
      });
    }

    const user = await User.findOne({
      email: email.trim().toLowerCase(),
    }).select("+password");

    // Use the same response for an unknown email and a wrong password.
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({
        status: "error",
        message: "Invalid email or password",
      });
    }

    if (!process.env.JWT_SECRET) {
      console.error("JWT_SECRET is not configured");

      return res.status(500).json({
        status: "error",
        message: "Authentication is not configured",
      });
    }

    const token = jwt.sign(
      { role: user.role },
      process.env.JWT_SECRET,
      {
        subject: user._id.toString(),
        expiresIn: "1h",
      }
    );

    return res.status(200).json({
      status: "success",
      message: "Login successful",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Login error:", error.message);

    return res.status(500).json({
      status: "error",
      message: "Unable to log in",
    });
  }
});

module.exports = router;
