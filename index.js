const express = require("express");
const app = express();
const cors = require("cors");
require("dotenv").config();
const port = process.env.PORT || 8080;
const { MongoClient, ServerApiVersion } = require("mongodb");

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
  } catch (err) {
    console.error("MongoDB connection faild:", err);
  }
}

run().catch(console.dir);

//test route
app.get("/", (req, res) => {
  res.send("My Server is Runing 🚀");
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
