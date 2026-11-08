# ICSI 418Y Programming Assignment 4: Project Management Application

## Overview

This project is a project management application built using React, Express, and MongoDB. It allows registered users to create projects, manage project membership, and manage user stories within individual projects.

PA4 extends the PA3 application by adding a User Stories Backlog with creation, editing, assignment, status tracking, and deletion functionality.

## Features

### Project Management
- User registration and login
- Create and view projects
- Assign project leads
- Add and remove project members
- Prevent duplicate project memberships
- Prevent removal of project leads

### User Stories Backlog
- Create user stories for selected projects
- Add a title and description using the user story format
- Set priority to High, Medium, or Low
- Track status as To Do, In Progress, or Done
- Assign stories to project members or leave them Unassigned
- View story descriptions
- Edit existing user stories
- Delete stories with confirmation
- Maintain stories under their original projects
- Refresh the backlog after changes

### Assignment Validation
- Only current project members and the project lead can be assigned stories
- Prevent removal of members who still have assigned user stories
- Validate required fields and story information
- Validate project and story IDs
- Prevent invalid cross-project story operations

## Technologies

- React
- Vite
- Node.js
- Express
- MongoDB

## Project Structure

- `client/` — React frontend
- `server/` — Express backend

## Running the Application

### 1. Configure the backend

Create a `server/.env` file containing your MongoDB connection string:

```env
MONGO_URI=your_mongodb_connection_string
```

Replace the example value with your own MongoDB connection string.

Do not upload or commit the `.env` file to GitHub.

### 2. Start the backend

From the project root:

```bash
cd server
npm install
node server.js
```

The backend runs on port 9000.

### 3. Start the frontend

Open a second terminal from the project root:

```bash
cd client
npm install
npm run dev
```

Open the local URL displayed by Vite in your browser.

## Database Collections

The application uses the following MongoDB collections:

- `users`
- `projects`
- `projectMemberships`
- `UserStories`

Each user story is stored as a separate MongoDB document containing:

- `_id`
- `project_id`
- `title`
- `description`
- `priority`
- `status`
- `assigned_user_id`

The `project_id` associates each story with its project. The `assigned_user_id` references the assigned user or is null when the story is unassigned.

## Testing

The application should be tested for:

1. Creating user stories.
2. Viewing stories in the correct project backlog.
3. Editing story titles, descriptions, priorities, statuses, and assignments.
4. Deleting stories with confirmation.
5. Assigning and unassigning project members.
6. Preventing removal of members who have assigned stories.
7. Switching between projects and verifying that stories remain associated with the correct project.
8. Refreshing the browser and verifying that stories persist in MongoDB.
9. Validating required fields and invalid assignments.

## GitHub Repository

https://github.com/daniekesh24/icsi418y-pa4
