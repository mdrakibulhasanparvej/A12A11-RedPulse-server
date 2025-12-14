const express = require("express");
const app = express();
const cors = require("cors");
require("dotenv").config();
const port = process.env.PORT || 6000;

// middleware
app.use(cors());
app.use(express.json());

//test route
app.get("/", (req, res) => {
  res.send("My Server is Runing 🚀");
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
