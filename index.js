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

    // users related
    app.post("/users", async (req, res) => {
      const user = req.body;
      console.log(user);
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

      const result = await usersCollection.insertOne(user);
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

    // PATCH /users/:email
    app.patch("/users/:email", async (req, res) => {
      try {
        const email = req.params.email;
        const updateData = req.body;

        const result = await usersCollection.findOneAndUpdate(
          { email },
          { $set: updateData },
          { returnDocument: "after" }
        );

        if (!result.value) {
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
