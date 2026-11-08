
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { MongoClient, ObjectId } = require("mongodb");

const app = express();

app.use(cors());
app.use(express.json());

const client = new MongoClient(process.env.MONGO_URI);
const validStatuses = ["Planning", "Active", "Completed"];

async function startServer() {
  try {
    await client.connect();
    console.log("Connected to MongoDB successfully!");

    const db = client.db("pa2");

    // Existing Assignment 2 users
    const users = db.collection("users");

    // Assignment 3 collections
    const projects = db.collection("projects");
    const memberships = db.collection("projectMemberships");
    const stories = db.collection("UserStories");

    // Prevent duplicate membership records
    await memberships.createIndex(
      { project_id: 1, user_id: 1 },
      { unique: true }
    );

    // ---------------- SIGN UP ----------------
    app.post("/signup", async (req, res) => {
      try {
        const { f_name, l_name, username, password } = req.body;

        if (
          typeof f_name !== "string" ||
          !f_name.trim() ||
          typeof l_name !== "string" ||
          !l_name.trim() ||
          typeof username !== "string" ||
          !username.trim() ||
          typeof password !== "string" ||
          !password
        ) {
          return res.status(400).json({
            message: "Please fill in all fields.",
          });
        }

        const cleanUsername = username.trim();

        const existingUser = await users.findOne({
          username: cleanUsername,
        });

        if (existingUser) {
          return res.status(409).json({
            message: "Username already exists.",
          });
        }

        await users.insertOne({
          f_name: f_name.trim(),
          l_name: l_name.trim(),
          username: cleanUsername,
          password,
        });

        return res.status(201).json({
          message: "Account created successfully!",
        });
      } catch (error) {
        console.error("Signup error:", error);

        return res.status(500).json({
          message: "Server error. Please try again.",
        });
      }
    });

    // ---------------- LOGIN ----------------
    app.post("/login", async (req, res) => {
      try {
        const { username, password } = req.body;

        if (
          typeof username !== "string" ||
          !username.trim() ||
          typeof password !== "string" ||
          !password
        ) {
          return res.status(400).json({
            message: "Please enter your username and password.",
          });
        }

        const user = await users.findOne({
          username: username.trim(),
        });

        if (!user || user.password !== password) {
          return res.status(401).json({
            message: "Invalid username or password.",
          });
        }

        return res.status(200).json({
          message: "Login successful!",
        });
      } catch (error) {
        console.error("Login error:", error);

        return res.status(500).json({
          message: "Server error. Please try again.",
        });
      }
    });

    // ---------------- GET REGISTERED USERS ----------------
    app.get("/users", async (req, res) => {
      try {
        const registeredUsers = await users
          .find({})
          .project({ password: 0 })
          .sort({ username: 1 })
          .toArray();

        return res.json(registeredUsers);
      } catch (error) {
        console.error("Get users error:", error);

        return res.status(500).json({
          message: "Unable to retrieve users.",
        });
      }
    });

    // ---------------- CREATE PROJECT ----------------
    app.post("/projects", async (req, res) => {
      let createdProjectId;

      try {
        const { name, description, status, project_lead_id } = req.body;

        if (
          typeof name !== "string" ||
          !name.trim() ||
          typeof description !== "string" ||
          !description.trim() ||
          typeof status !== "string" ||
          !validStatuses.includes(status) ||
          typeof project_lead_id !== "string" ||
          !ObjectId.isValid(project_lead_id)
        ) {
          return res.status(400).json({
            message:
              "Provide a project name, description, valid status, and Project Lead.",
          });
        }

        const leadId = new ObjectId(project_lead_id);

        const lead = await users.findOne({ _id: leadId });

        if (!lead) {
          return res.status(400).json({
            message: "The selected Project Lead does not exist.",
          });
        }

        const project = {
          name: name.trim(),
          description: description.trim(),
          status,
          project_lead_id: leadId,
        };

        const result = await projects.insertOne(project);
        createdProjectId = result.insertedId;

        // Automatically make the Project Lead a member
        await memberships.insertOne({
          project_id: createdProjectId,
          user_id: leadId,
        });

        return res.status(201).json({
          message: "Project created successfully!",
          project: {
            _id: createdProjectId,
            ...project,
            project_lead: {
              f_name: lead.f_name,
              l_name: lead.l_name,
              username: lead.username,
            },
          },
        });
      } catch (error) {
        console.error("Create project error:", error);

        // Clean up if the membership could not be created
        if (createdProjectId) {
          try {
            await memberships.deleteOne({
              project_id: createdProjectId,
            });

            await projects.deleteOne({
              _id: createdProjectId,
            });
          } catch (cleanupError) {
            console.error("Project cleanup error:", cleanupError);
          }
        }

        return res.status(500).json({
          message: "Unable to create the project.",
        });
      }
    });

    // ---------------- LIST PROJECTS ----------------
    app.get("/projects", async (req, res) => {
      try {
        const allProjects = await projects
          .aggregate([
            {
              $lookup: {
                from: "users",
                localField: "project_lead_id",
                foreignField: "_id",
                as: "lead",
              },
            },
            {
              $unwind: {
                path: "$lead",
                preserveNullAndEmptyArrays: true,
              },
            },
            {
              $project: {
                name: 1,
                description: 1,
                status: 1,
                project_lead_id: 1,
                project_lead: {
                  f_name: "$lead.f_name",
                  l_name: "$lead.l_name",
                  username: "$lead.username",
                },
              },
            },
            { $sort: { name: 1 } },
          ])
          .toArray();

        return res.json(allProjects);
      } catch (error) {
        console.error("Get projects error:", error);

        return res.status(500).json({
          message: "Unable to retrieve projects.",
        });
      }
    });

    // ---------------- LIST PROJECT MEMBERS ----------------
    app.get("/projects/:projectId/members", async (req, res) => {
      try {
        const { projectId } = req.params;

        if (!ObjectId.isValid(projectId)) {
          return res.status(400).json({
            message: "Invalid project ID.",
          });
        }

        const projectObjectId = new ObjectId(projectId);

        const project = await projects.findOne({
          _id: projectObjectId,
        });

        if (!project) {
          return res.status(404).json({
            message: "Project not found.",
          });
        }

        const projectMembers = await memberships
          .aggregate([
            { $match: { project_id: projectObjectId } },
            {
              $lookup: {
                from: "users",
                localField: "user_id",
                foreignField: "_id",
                as: "user",
              },
            },
            { $unwind: "$user" },
            {
              $project: {
                _id: 1,
                project_id: 1,
                user_id: 1,
                f_name: "$user.f_name",
                l_name: "$user.l_name",
                username: "$user.username",
                is_project_lead: {
                  $eq: ["$user_id", project.project_lead_id],
                },
              },
            },
            { $sort: { username: 1 } },
          ])
          .toArray();

        return res.json(projectMembers);
      } catch (error) {
        console.error("Get members error:", error);

        return res.status(500).json({
          message: "Unable to retrieve project members.",
        });
      }
    });

    // ---------------- ADD PROJECT MEMBER ----------------
    app.post("/projects/:projectId/members", async (req, res) => {
      try {
        const { projectId } = req.params;
        const { user_id } = req.body;

        if (
          !ObjectId.isValid(projectId) ||
          typeof user_id !== "string" ||
          !ObjectId.isValid(user_id)
        ) {
          return res.status(400).json({
            message: "A valid project ID and user ID are required.",
          });
        }

        const projectObjectId = new ObjectId(projectId);
        const userObjectId = new ObjectId(user_id);

        const project = await projects.findOne({
          _id: projectObjectId,
        });

        if (!project) {
          return res.status(404).json({
            message: "Project not found.",
          });
        }

        const user = await users.findOne({
          _id: userObjectId,
        });

        if (!user) {
          return res.status(404).json({
            message: "User not found.",
          });
        }

        const existingMembership = await memberships.findOne({
          project_id: projectObjectId,
          user_id: userObjectId,
        });

        if (existingMembership) {
          return res.status(409).json({
            message: "User is already a member of this project.",
          });
        }

        await memberships.insertOne({
          project_id: projectObjectId,
          user_id: userObjectId,
        });

        return res.status(201).json({
          message: "Member added successfully!",
        });
      } catch (error) {
        if (error.code === 11000) {
          return res.status(409).json({
            message: "User is already a member of this project.",
          });
        }

        console.error("Add member error:", error);

        return res.status(500).json({
          message: "Unable to add member.",
        });
      }
    });

    // ---------------- REMOVE PROJECT MEMBER ----------------
    app.delete(
      "/projects/:projectId/members/:userId",
      async (req, res) => {
        try {
          const { projectId, userId } = req.params;

          if (
            !ObjectId.isValid(projectId) ||
            !ObjectId.isValid(userId)
          ) {
            return res.status(400).json({
              message: "Invalid project ID or user ID.",
            });
          }

          const projectObjectId = new ObjectId(projectId);
          const userObjectId = new ObjectId(userId);

          const project = await projects.findOne({
            _id: projectObjectId,
          });

          if (!project) {
            return res.status(404).json({
              message: "Project not found.",
            });
          }

          const user = await users.findOne({
            _id: userObjectId,
          });

          if (!user) {
            return res.status(404).json({
              message: "User not found.",
            });
          }

          if (project.project_lead_id.equals(userObjectId)) {
            return res.status(400).json({
              message: "The Project Lead cannot be removed.",
            });
          }

          const assignedStory = await stories.findOne({
            project_id: projectObjectId,
            assigned_user_id: userObjectId,
          });

          if (assignedStory) {
            return res.status(409).json({
              message: "This member still has assigned user stories. Reassign, unassign, or delete those stories before removing the member.",
            });
          }

          const result = await memberships.deleteOne({
            project_id: projectObjectId,
            user_id: userObjectId,
          });

          if (result.deletedCount === 0) {
            return res.status(404).json({
              message: "This user is not a member of the project.",
            });
          }

          return res.json({
            message: "Member removed successfully!",
          });
        } catch (error) {
          console.error("Remove member error:", error);

          return res.status(500).json({
            message: "Unable to remove member.",
          });
        }
      }
    );


    // ---------------- USER STORIES ----------------

    const storyPriorities = ["High", "Medium", "Low"];
    const storyStatuses = ["To Do", "In Progress", "Done"];

    // List stories belonging to one project
    app.get("/projects/:projectId/stories", async (req, res) => {
      try {
        const { projectId } = req.params;

        if (!ObjectId.isValid(projectId)) {
          return res.status(400).json({ message: "Invalid project ID." });
        }

        const projectObjectId = new ObjectId(projectId);
        const project = await projects.findOne({ _id: projectObjectId });

        if (!project) {
          return res.status(404).json({ message: "Project not found." });
        }

        const projectStories = await stories
          .find({ project_id: projectObjectId })
          .sort({ _id: 1 })
          .toArray();

        const result = await Promise.all(
          projectStories.map(async (story) => {
            let assigned_user = null;

            if (story.assigned_user_id) {
              const assignedUser = await users.findOne(
                { _id: story.assigned_user_id },
                { projection: { f_name: 1, l_name: 1, username: 1 } }
              );

              if (assignedUser) {
                assigned_user = assignedUser;
              }
            }

            return { ...story, assigned_user };
          })
        );

        return res.json(result);
      } catch (error) {
        console.error("List stories error:", error);
        return res.status(500).json({ message: "Unable to load user stories." });
      }
    });

    // Create a user story
    app.post("/projects/:projectId/stories", async (req, res) => {
      try {
        const { projectId } = req.params;
        const { title, description, priority, assigned_user_id } = req.body;

        if (!ObjectId.isValid(projectId)) {
          return res.status(400).json({ message: "Invalid project ID." });
        }

        if (
          typeof title !== "string" || !title.trim() ||
          typeof description !== "string" || !description.trim() ||
          !storyPriorities.includes(priority)
        ) {
          return res.status(400).json({
            message: "A title, description, and valid priority are required.",
          });
        }

        const projectObjectId = new ObjectId(projectId);
        const project = await projects.findOne({ _id: projectObjectId });

        if (!project) {
          return res.status(404).json({ message: "Project not found." });
        }

        let assignedUserObjectId = null;

        if (assigned_user_id !== undefined && assigned_user_id !== null && assigned_user_id !== "") {
          if (!ObjectId.isValid(assigned_user_id)) {
            return res.status(400).json({ message: "Invalid assigned user ID." });
          }

          assignedUserObjectId = new ObjectId(assigned_user_id);

          const assignedUser = await users.findOne({ _id: assignedUserObjectId });
          if (!assignedUser) {
            return res.status(404).json({ message: "Assigned user not found." });
          }

          const isProjectLead =
            project.project_lead_id &&
            project.project_lead_id.toString() === assignedUserObjectId.toString();

          const isMember = await memberships.findOne({
            project_id: projectObjectId,
            user_id: assignedUserObjectId,
          });

          if (!isProjectLead && !isMember) {
            return res.status(400).json({
              message: "The assigned user must belong to this project.",
            });
          }
        }

        const newStory = {
          project_id: projectObjectId,
          title: title.trim(),
          description: description.trim(),
          priority,
          status: "To Do",
          assigned_user_id: assignedUserObjectId,
        };

        const result = await stories.insertOne(newStory);

        return res.status(201).json({
          message: "User story created successfully.",
          story: { ...newStory, _id: result.insertedId },
        });
      } catch (error) {
        console.error("Create story error:", error);
        return res.status(500).json({ message: "Unable to create user story." });
      }
    });

    // Edit a user story
    app.put("/projects/:projectId/stories/:storyId", async (req, res) => {
      try {
        const { projectId, storyId } = req.params;
        const { title, description, priority, status, assigned_user_id } = req.body;

        if (!ObjectId.isValid(projectId) || !ObjectId.isValid(storyId)) {
          return res.status(400).json({ message: "Invalid project ID or story ID." });
        }

        if (
          typeof title !== "string" || !title.trim() ||
          typeof description !== "string" || !description.trim() ||
          !storyPriorities.includes(priority) ||
          !storyStatuses.includes(status)
        ) {
          return res.status(400).json({
            message: "Valid title, description, priority, and status are required.",
          });
        }

        const projectObjectId = new ObjectId(projectId);
        const storyObjectId = new ObjectId(storyId);

        const project = await projects.findOne({ _id: projectObjectId });
        if (!project) {
          return res.status(404).json({ message: "Project not found." });
        }

        const existingStory = await stories.findOne({
          _id: storyObjectId,
          project_id: projectObjectId,
        });

        if (!existingStory) {
          return res.status(404).json({ message: "User story not found in this project." });
        }

        let assignedUserObjectId = null;

        if (assigned_user_id !== undefined && assigned_user_id !== null && assigned_user_id !== "") {
          if (!ObjectId.isValid(assigned_user_id)) {
            return res.status(400).json({ message: "Invalid assigned user ID." });
          }

          assignedUserObjectId = new ObjectId(assigned_user_id);

          const assignedUser = await users.findOne({ _id: assignedUserObjectId });
          if (!assignedUser) {
            return res.status(404).json({ message: "Assigned user not found." });
          }

          const isProjectLead =
            project.project_lead_id &&
            project.project_lead_id.toString() === assignedUserObjectId.toString();

          const isMember = await memberships.findOne({
            project_id: projectObjectId,
            user_id: assignedUserObjectId,
          });

          if (!isProjectLead && !isMember) {
            return res.status(400).json({
              message: "The assigned user must belong to this project.",
            });
          }
        }

        const updates = {
          title: title.trim(),
          description: description.trim(),
          priority,
          status,
          assigned_user_id: assignedUserObjectId,
        };

        await stories.updateOne(
          { _id: storyObjectId, project_id: projectObjectId },
          { $set: updates }
        );

        const updatedStory = await stories.findOne({
          _id: storyObjectId,
          project_id: projectObjectId,
        });

        return res.json({
          message: "User story updated successfully.",
          story: updatedStory,
        });
      } catch (error) {
        console.error("Update story error:", error);
        return res.status(500).json({ message: "Unable to update user story." });
      }
    });

    // Delete a user story
    app.delete("/projects/:projectId/stories/:storyId", async (req, res) => {
      try {
        const { projectId, storyId } = req.params;

        if (!ObjectId.isValid(projectId) || !ObjectId.isValid(storyId)) {
          return res.status(400).json({ message: "Invalid project ID or story ID." });
        }

        const projectObjectId = new ObjectId(projectId);
        const storyObjectId = new ObjectId(storyId);

        const result = await stories.deleteOne({
          _id: storyObjectId,
          project_id: projectObjectId,
        });

        if (result.deletedCount === 0) {
          return res.status(404).json({ message: "User story not found in this project." });
        }

        return res.json({ message: "User story deleted successfully." });
      } catch (error) {
        console.error("Delete story error:", error);
        return res.status(500).json({ message: "Unable to delete user story." });
      }
    });

    // ---------------- SERVER STATUS ----------------
    app.get("/", (req, res) => {
      res.send("Server is running");
    });

    app.listen(9000, () => {
      console.log("Server running on port 9000");
    });
  } catch (error) {
    console.error("MongoDB connection failed:", error.message);
    process.exitCode = 1;
  }
}

startServer();
