const express = require("express");
const app = express();
const cors = require("cors");
require("dotenv").config();
const port = process.env.PORT || 8080;
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

// middleware
app.use(cors());
app.use(express.json());

const uri = process.env.DB_URI;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();
    console.log("db connected");
    const db = client.db("RedPulse");
    const usersCollection = db.collection("users");
    const donationCollection = db.collection("donationRequests");

    // users related
    app.post("/users", async (req, res) => {
      const user = req.body;
      const newUser = {
        ...user,
        created_at: new Date(),
      };
      const email = user.email;

      if (!email) {
        return res.status(400).send({ message: "Email is required" });
      }
      // Check if user already exists
      const existsUser = await usersCollection.findOne({ email });
      if (existsUser) {
        return res.status(409).send({
          message: `User with email ${email} already exists`,
          emailReceived: email,
        });
      }

      const result = await usersCollection.insertOne(newUser);
      res.status(201).send(result);

      console.log("MongoDB connected successfully");
    });

    // user get API with optional status filter
    app.get("/users", async (req, res) => {
      try {
        const limit = Number(req.query.limit) || 10;
        const skip = Number(req.query.skip) || 0;
        const status = req.query.status; // "active" or "blocked"

        // Build query object
        const query = {};
        if (status) query.status = status;

        const users = await usersCollection
          .find(query)
          .skip(skip)
          .limit(limit)
          .toArray();

        const totalUsers = await usersCollection.countDocuments(query);

        res.send({ users, totalUsers });
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Failed to fetch users" });
      }
    });

    // Get single user by email
    app.get("/users/:email", async (req, res) => {
      try {
        const email = req.params.email;
        const user = await usersCollection.findOne({ email });

        if (!user) return res.status(404).send({ message: "User not found" });

        res.send(user);
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Failed to fetch user" });
      }
    });

    // user-profile/:email - user profile update
    app.patch("/user-profile/:email", async (req, res) => {
      try {
        const email = req.params.email;
        const updateData = req.body;

        const result = await usersCollection.findOneAndUpdate(
          { email },
          { $set: updateData },
          { returnDocument: "after" }
        );

        // console.log(result);

        if (!result) {
          return res.status(404).send({ message: "User not found" });
        }

        res.send(result.value);
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Failed to update user" });
      }
    });

    // user update aips
    app.patch("/users/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const { role, status } = req.body; // ✅ accept role and status

        const query = { _id: new ObjectId(id) };
        const existingUser = await usersCollection.findOne(query);

        if (!existingUser) {
          return res.status(404).send({ message: "User not found" });
        }

        const allowedRoles = ["donor", "admin", "volunteer"];
        const allowedStatus = ["active", "blocked"];

        const updateInfo = { $set: {} };

        // Update role if valid and different
        if (role && allowedRoles.includes(role) && role !== existingUser.role) {
          updateInfo.$set.role = role;
        }

        // Update status if valid and different
        if (
          status &&
          allowedStatus.includes(status) &&
          status !== existingUser.status
        ) {
          updateInfo.$set.status = status;
        }

        // Always update timestamp if anything is changing
        if (Object.keys(updateInfo.$set).length > 0) {
          updateInfo.$set.updated_at = new Date();
        } else {
          return res.status(400).send({ message: "No valid changes provided" });
        }

        const result = await usersCollection.updateOne(query, updateInfo);
        res.send(result);
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Failed to update user" });
      }
    });

    // donation related
    app.post("/donation-requests", async (req, res) => {
      try {
        const donationRequest = req.body;

        // Basic validation
        const requiredFields = [
          "requesterName",
          "requesterEmail",
          "recipientName",
          "recipientDivision",
          "recipientDistrict",
          "recipientUpazila",
          "recipientUnion",
          "hospitalName",
          "fullAddress",
          "bloodGroup",
          "donationDate",
          "donationTime",
          "requestMessage",
        ];

        for (let field of requiredFields) {
          if (!donationRequest[field]) {
            return res.status(400).send({ message: `${field} is required` });
          }
        }

        // Set default status if not provided
        if (!donationRequest.status) donationRequest.status = "pending";

        const result = await donationCollection.insertOne(donationRequest);
        res.status(201).send({ success: true, result });
      } catch (err) {
        console.error(err);
        res.status(500).send({
          success: false,
          message: "Failed to create donation request",
        });
      }
    });

    // Get all donation requests
    app.get("/donation-requests", async (req, res) => {
      try {
        const limit = Number(req.query.limit) || 20;
        const skip = Number(req.query.skip) || 0;
        const status = req.query.status; // optional filter

        const query = {};
        if (status) query.status = status;

        const requests = await donationCollection
          .find(query)
          .skip(skip)
          .limit(limit)
          .toArray();

        const totalRequests = await donationCollection.countDocuments(query);

        res.send({ requests, totalRequests });
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Failed to fetch donation requests" });
      }
    });

    // Update donation request status
    app.patch("/donation-requests/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const { status } = req.body; // only allow status update

        if (!["pending", "approved", "rejected"].includes(status)) {
          return res.status(400).send({ message: "Invalid status" });
        }

        const result = await donationCollection.findOneAndUpdate(
          { _id: new ObjectId(id) },
          { $set: { status, updated_at: new Date() } },
          { returnDocument: "after" }
        );

        if (!result.value)
          return res
            .status(404)
            .send({ message: "Donation request not found" });

        res.send(result.value);
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Failed to update donation request" });
      }
    });

    // Get a single donation request by ID
    // app.get("/donation-requests/:id", async (req, res) => {
    //   try {
    //     const id = req.params.id;
    //     const request = await donationCollection.findOne({
    //       _id: new ObjectId(id),
    //     });

    //     if (!request)
    //       return res
    //         .status(404)
    //         .send({ message: "Donation request not found" });

    //     res.send(request);
    //   } catch (err) {
    //     console.error(err);
    //     res.status(500).send({ message: "Failed to fetch donation request" });
    //   }
    // });

    // get donation requests by email (latest 3)
    app.get("/donation-requests", async (req, res) => {
      try {
        const email = req.query.email;
        const limit = parseInt(req.query.limit) || 0;

        const result = await donationCollection
          .find({ requesterEmail: email })
          .sort({ created_at: -1 }) // latest first
          .limit(limit)
          .toArray();

        res.send(result);
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Failed to fetch donation requests" });
      }
    });

    // last of main async function
  } catch (err) {
    console.error("MongoDB connection faild:", err);
  }
  // users API
}

run().catch(console.dir);

//test route
app.get("/", (req, res) => {
  res.send("My Server is Runing 🚀");
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
