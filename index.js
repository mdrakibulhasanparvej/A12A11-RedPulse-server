const express = require("express");
const app = express();
const cors = require("cors");
require("dotenv").config();
const port = process.env.PORT || 8080;
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const stripe = require("stripe")(process.env.STRIPE_SECTET);

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
    const donationCollection = db.collection("donationRequests");
    const donationFundCollection = db.collection("donationPaymentInfo");

    // ================ users related ========================
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
    });

    // user get API with optional status filter
    app.get("/users", async (req, res) => {
      try {
        const limit = Number(req.query.limit) || 1000;
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
        const updateData = {
          ...req.body,
          updated_at: new Date(),
        };

        const result = await usersCollection.findOneAndUpdate(
          { email },
          { $set: updateData },
          { returnDocument: "after" }
        );

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
        const { role, status } = req.body; // accept role and status

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

    // user delete
    app.delete("/user/:id", async (req, res) => {
      try {
        const id = req.params.id;

        const result = await usersCollection.findOneAndDelete({
          _id: new ObjectId(id),
        });

        if (!result) {
          return res.status(404).send({ message: "User not found" });
        }

        res.send({
          success: true,
          message: "User deleted successfully",
          data: result.value,
        });
      } catch (error) {
        res.status(500).send({
          success: false,
          message: "Server error",
          error: error.message,
        });
      }
    });

    // ====================== donation related ========================
    app.post("/donation-requests", async (req, res) => {
      try {
        const donationRequest = req.body;

        // Validate required fields
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

        // Add backend timestamps
        const donation = {
          ...donationRequest,
          status: donationRequest.status || "pending",
          created_at: new Date(),
        };

        const result = await donationCollection.insertOne(donation);
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
    // app.get("/donation-request-all/:id?", async (req, res) => {
    //   try {
    //     const id = req.params.id; // optional param
    //     const email = req.query.email;
    //     const status = req.query.status;
    //     const skip = Number(req.query.skip) || 0;
    //     const limit = Number(req.query.limit) || 20;

    //     // Build query dynamically
    //     const query = {};
    //     if (id) query._id = new ObjectId(id);
    //     if (email) query.requesterEmail = email;
    //     if (status) query.status = status;

    //     const requests = await donationCollection
    //       .find(query)
    //       .sort({ created_at: -1 }) // latest first
    //       .skip(skip)
    //       .limit(limit)
    //       .toArray();

    //     const totalRequests = await donationCollection.countDocuments(query);

    //     res.send({ requests, totalRequests });
    //   } catch (err) {
    //     console.error(err);
    //     res.status(500).send({ message: "Failed to fetch donation requests" });
    //   }
    // });
    app.get("/donation-request-all", async (req, res) => {
      try {
        const {
          id,
          email,
          status,
          bloodGroup,
          division,
          district,
          recipientName,
          search,
          skip,
          limit,
          sortBy = "created_at",
          order = "desc",
        } = req.query;

        const query = {};

        if (id && ObjectId.isValid(id)) {
          query._id = new ObjectId(id);
        }

        if (email) query.requesterEmail = email;
        if (status) query.status = status;
        if (bloodGroup) query.bloodGroup = bloodGroup;
        if (division) query.recipientDivision = division;
        if (district) query.recipientDistrict = district;
        if (recipientName) query.recipientName = recipientName;

        if (search) {
          query.$or = [
            { recipientDistrict: { $regex: search, $options: "i" } },
            { recipientUpazila: { $regex: search, $options: "i" } },
            {
              bloodGroup: { $regex: search, $options: "i" },
            },
          ];
        }

        const allowedSortFields = [
          "created_at",
          "donationDate",
          "status",
          "bloodGroup",
        ];

        const safeSortBy = allowedSortFields.includes(sortBy)
          ? sortBy
          : "created_at";

        const sortOrder = order === "asc" ? 1 : -1;

        const skipNum = Math.max(Number(skip));
        const limitNum = Math.min(Math.max(Number(limit)));

        const requests = await donationCollection
          .find(query)
          .sort({ [safeSortBy]: sortOrder })
          .skip(skipNum)
          .limit(limitNum)
          .toArray();

        const totalRequests = await donationCollection.countDocuments(query);

        res.send({ requests, totalRequests });
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Failed to fetch donation requests" });
      }
    });

    // Update donation request status && doner info && create request full update
    app.patch("/donation-request-all/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const { status, donorName, donorEmail, ...rest } = req.body;

        // 1️⃣ Find existing request
        const existing = await donationCollection.findOne({
          _id: new ObjectId(id),
        });

        if (!existing) {
          return res
            .status(404)
            .send({ message: "Donation request not found" });
        }

        // 2️⃣ Block updates if status is final (done/cancel)
        if (existing.status === "done" || existing.status === "cancel") {
          return res.status(403).send({
            message: "Cannot update request once it is done or cancelled",
          });
        }

        // 3️⃣ Prepare updateDoc
        const updateDoc = { ...rest, updated_at: new Date() };

        // 4️⃣ Validate status if provided
        if (status) {
          if (!["pending", "inprogress", "done", "cancel"].includes(status)) {
            return res.status(400).send({ message: "Invalid status" });
          }
          updateDoc.status = status;
        }

        // 5️⃣ Include donor info if provided
        if (donorName) updateDoc.donorName = donorName;
        if (donorEmail) updateDoc.donorEmail = donorEmail;

        // 6️⃣ Clean undefined fields (optional but safe)
        Object.keys(updateDoc).forEach((key) => {
          if (updateDoc[key] === undefined) delete updateDoc[key];
        });

        // 7️⃣ Perform update
        const result = await donationCollection.findOneAndUpdate(
          { _id: new ObjectId(id) },
          { $set: updateDoc },
          { returnDocument: "after" }
        );

        res.send(result.value);
      } catch (err) {
        console.error("PATCH error:", err);
        res.status(500).send({ message: "Failed to update donation request" });
      }
    });

    // delete donation requested
    app.delete("/donation-request-all/:id", async (req, res) => {
      try {
        const id = req.params.id;

        const result = await donationCollection.findOneAndDelete({
          _id: new ObjectId(id),
        });

        if (!result) {
          return res
            .status(404)
            .send({ message: "Donation request not found" });
        }

        res.send({
          success: true,
          message: "Donation request deleted successfully",
          data: result.value,
        });
      } catch (error) {
        res.status(500).send({
          success: false,
          message: "Server error",
          error: error.message,
        });
      }
    });

    // ======================== payment related api ==========================
    app.post("/create-checkout-session", async (req, res) => {
      try {
        const { amount, email, name } = req.body;

        const session = await stripe.checkout.sessions.create({
          payment_method_types: ["card"],
          mode: "payment",
          customer_email: email,
          metadata: {
            name: name, //  customer name from frontend
            email: email, //  customer name from frontend
            amount: amount,
          },
          line_items: [
            {
              price_data: {
                currency: "bdt",
                product_data: {
                  name: "Blood Donation Funding",
                  description: `Donation by ${name}`,
                },
                unit_amount: amount * 100, // Stripe uses cents
              },
              quantity: 1,
            },
          ],
          success_url: `${process.env.SITE_DOMAIN}/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${process.env.SITE_DOMAIN}/dashboard/payment-cenceled`,
        });

        res.send({ url: session.url });
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Payment session failed" });
      }
    });

    // POST /api/donation/confirm
    app.post("/donation-payment-info", async (req, res) => {
      try {
        const { sessionId } = req.body;

        if (!sessionId)
          return res.status(400).send({ message: "No session_id provided" });

        // Fetch the session from Stripe
        const session = await stripe.checkout.sessions.retrieve(sessionId);

        // console.log(session);

        if (session.payment_status !== "paid") {
          return res.status(400).send({ message: "Payment not completed" });
        }

        // Prepare donation document
        const donationData = {
          name: session.metadata?.name || "donor name",
          payment_holder: session.customer_details?.name || "card holder name",
          email: session.customer_details?.email || "donor email",
          amount: session.amount_total / 100, // from cents
          transition_id: session.payment_intent,
          payment_method_types: session.payment_method_types,
          created_at: new Date(),
          status: "paid",
        };

        // console.log(donationData);

        // Insert into MongoDB
        const resutl = await donationFundCollection.insertOne(donationData);

        res.send({ success: true, donation: donationData });
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Failed to confirm donation" });
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
