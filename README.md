# Chat App Server

Node.js backend for a real-time chat application using **Express**, **Socket.IO**, and **Firebase (Firestore + FCM)**.

## Features

- User registration and login with hashed passwords (`bcrypt`)
- Real-time messaging with Socket.IO
- Message history retrieval from Firestore
- User online/offline and typing indicators
- Push notification delivery via Firebase Cloud Messaging (FCM)
- Feedback submission API

## Tech Stack

- Node.js
- Express
- Socket.IO
- Firebase Admin SDK (Firestore + Messaging)
- bcrypt
- CORS

## Project Structure

```text
chatappserver/
├── README.md
└── appserver/
    ├── package.json
    └── src/
        ├── server.js
        ├── index.js
        ├── newkey.json   # Firebase service account (Firestore)
        └── auth.json     # Firebase service account (Messaging)
```

## Prerequisites

- Node.js 18+ (recommended)
- npm
- Firebase project with:
  - Firestore enabled
  - Cloud Messaging enabled
  - Service account keys

## Setup

1. Go to the server folder:

   ```bash
   cd appserver
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Add Firebase credentials in:
   - `appserver/src/newkey.json`
   - `appserver/src/auth.json`

## Run

From `appserver/`:

```bash
npm start
```

Server starts on:

- `5000` (HTTP server used with Socket.IO)
- `7001` (Express app listener)

## REST APIs

Base URL examples:
- `http://localhost:7001`
- `http://localhost:5000` (same Express routes are mounted on app)

Available endpoints in `src/server.js`:

- `POST /register`
- `POST /login`
- `GET /users`
- `POST /logout`
- `POST /api/submit-feedback`
- `POST /api/save-fcm-token`

## Socket.IO Events

Key events:

- Client emits: `join`, `sendMessage`, `typing`, `setoffline`, `getMessages`, `checkUserStatus`
- Server emits: `previousMessages`, `newMessage`, `typing`, `userStatus`

## Frontend CORS Origins

Allowed origins currently configured:

- `https://ichatwithyou.vercel.app`
- `http://localhost:3000`

## Notes

- There is no automated test suite configured yet (`npm test` is a placeholder).
- Keep Firebase key files private and never commit production secrets.