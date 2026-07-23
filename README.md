# A-Level Hub

A social networking website where Cambridge students share questions, solutions, and study notes.

**Module:** CST2120 - Web Applications and Databases
**Student ID:** M01067508
**Stack:** Node.js · Express · MongoDB

---

## Table of Contents

1. [Requirements](#1-requirements)
2. [Install the npm packages](#2-install-the-npm-packages)
3. [Start MongoDB](#3-start-mongodb)
4. [Get your API keys](#4-get-your-api-keys)
5. [Create the .env file](#5-create-the-env-file)
6. [Run the server](#6-run-the-server)


---

## 1. Requirements

Install these before you start:

| Software | Version | Download |
|---|---|---|
| Node.js | latest | https://nodejs.org |
| MongoDB | v6 portable | https://www.dropbox.com/scl/fi/cykmy6vxjiah01h6f6qx4/PortableMongoDB_6.0.zip?rlkey=y5g04anu498m6hf03inh0bo89&e=1&dl=0 |

Check they are installed:

```bash
node -v
npm -v
```

---

## 2. Install the npm packages

Open a terminal **in the project folder** (the one containing `server.js`) and run:

```bash
npm install express cors express-session mongodb bcrypt dotenv express-fileupload uuid
```

### What each package does

| Package | Purpose |
|---|---|
| `express` | The web server and routing |
| `cors` | Allows the front end to call the API |
| `express-session` | Keeps users logged in with a session cookie |
| `mongodb` | Connects to the MongoDB database |
| `bcrypt` | Hashes passwords so they are never stored in plain text |
| `dotenv` | Reads the API keys from the `.env` file |
| `express-fileupload` | Handles image uploads (posts and profile pictures) |
| `uuid` | Gives every uploaded image a unique filename |

### Important: `package.json` must use ES modules

This project uses `import` syntax, so `package.json` **must** contain this line:

```json
{
  "type": "module"
}
```

## 3. Start MongoDB
 
MongoDB must be running before the server will start. On a standard install it already runs
in the background as a service, so there is normally **nothing to start by hand**.
 
Open **MongoDB Compass** to connect to it and view the data:
 
1. Launch **MongoDB Compass**.
2. In the connection box, enter the URI:
```
   mongodb://127.0.0.1:27017
```
 
3. Click **Connect**.
4. The **`EasyTutor`** database appears in the left sidebar (it shows up once the site has
   saved some data - see the note below).
- **Connection URI:** `mongodb://127.0.0.1:27017`
- **Database name:** `EasyTutor`
You do **not** need to create the database or any collections by hand - MongoDB creates them
automatically the first time data is saved. So `EasyTutor` will not appear in Compass until
you have registered your first account on the site.
 
> **Compass is only a viewer.** The website works whether or not Compass is open - it is used
> to inspect the data (users, posts, conversations, and so on), not to run the database.
 
---

## 4. Get your API keys

The site uses **three** third-party APIs, but only **two** need a key.

| Widget | Service | Key needed? |
|---|---|---|
| Quote of the Day | API Ninjas | Yes |
| On This Day | Byabbe (Wikipedia) |n**No key at all** |
| Practice Question | Google Gemini | Yes |

### 4a. Google Gemini key (for the Practice Question widget)

1. Go to **https://aistudio.google.com/app/apikey**
2. Sign in with any Google account.
3. Accept the Terms of Service if prompted.
4. Click **Create API key**.
5. Choose **Create API key in new project** (a Google Cloud project is created automatically - you do **not** need a Cloud account or billing).
6. Wait a few seconds. The key appears.
7. Click the copy icon.

**Free tier:** no credit card required.

### 4b. API Ninjas key (for the Quote of the Day widget)

1. Go to **https://api-ninjas.com**
2. Click **Sign Up** and register with your email.
3. Verify your email address if asked.
4. Log in, then open your **account / profile** page.
5. Your API key is shown there - copy it.

### 4c. On This Day - nothing to do

The On This Day widget uses `https://byabbe.se/on-this-day/` which is completely free and needs **no key, no sign-up, and no account**. It works as soon as the server starts.

---

## 5. Create the `.env` file

The `.env` file stores your API keys so they are never written inside the code.

### Steps

1. In the **project root folder** — the same folder as `server.js` - create a new file.
2. Name it exactly **`.env`** (starting with a dot, and with **no** `.txt` extension).
3. Paste in the two keys, one per line:

```
GEMINI_API_KEY=AIzaSyYourActualGeminiKeyHere
NINJA_API_KEY=YourActualNinjaKeyHere
```

4. Save the file and **restart the server** — `.env` is only read at startup.

### Formatting rules

**No spaces around the `=` sign.**

```
GEMINI_API_KEY=AIzaSy123abc     CORRECT
GEMINI_API_KEY = AIzaSy123abc   WRONG - the spaces become part of the value
GEMINI_API_KEY= AIzaSy123abc    WRONG - the leading space breaks the key
```

Also:

- **No quotes** around the value - write `GEMINI_API_KEY=AIza123`, not `GEMINI_API_KEY="AIza123"`.
- **No semicolons** at the end of the line.
- **No trailing spaces** after the key.
- The variable names must be spelled **exactly** as shown - they are matched by `process.env.GEMINI_API_KEY` and `process.env.NINJA_API_KEY` in the code.

### Keep it private

Never commit `.env` to GitHub.

---

## 6. Run the server
 
**Step 1 - go to the dropbox portable mongoDB folder.** 
 
**Step 2 - start the server cmd:**

**Step 2 - start the compass cmd:**

**Step 2 - start the server.js in VS code terminal**
 
```bash
node server.js
```
 
You should see:
 
```
MongoDB connected → EasyTutor
A-level Hub server running on http://localhost:8080/M01067508
```
 
**Step 3 — open the site** in a browser at:
 
**http://localhost:8080/M01067508**
 
Register an account, log in, and the site is ready to use.
 
> Visiting `http://localhost:8080/` redirects to `/M01067508` automatically.
 
### Stopping the server
 
Press **`Ctrl + C`** in the terminal running the server. This shuts it down and disconnects
it from MongoDB.
 
---
