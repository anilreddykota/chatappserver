const express = require('express');
const firebaseAdmin = require('firebase-admin');
const adminFirestore = require('firebase-admin');
const adminMessaging = require('firebase-admin');
const bcrypt = require('bcrypt');
const app = express();
const http = require('http');
const server = http.createServer(app);
const io = require("socket.io")(server, {
  allowRequest: (req, callback) => {
    callback(null, true);
  },
  cors: {
    origin: ['https://ichatwithyou.vercel.app', "http://localhost:3000"],
    methods: ['GET', 'POST'],
  }
});

const cors = require('cors');
app.use(cors());
app.use(express.json());

// Check if the default app is already initialized
if (!firebaseAdmin.apps.length) {
  // Initialize default Firebase app for Firestore
  const serviceAccountFirestore = require('./newkey.json');
  adminFirestore.initializeApp({
    credential: adminFirestore.credential.cert(serviceAccountFirestore),
    storageBucket: 'chatappsocketanil.appspot.com'

  });
}

// Initialize default Firebase app for Messaging
const serviceAccountMessaging = require('./auth.json');
const { error } = require('console');
adminMessaging.initializeApp({
  credential: adminMessaging.credential.cert(serviceAccountMessaging),
  storageBucket: 'chatappsocketanil.appspot.com'
}, "messages");

// Use the adminFirestore instance for Firestore operations
const db = adminFirestore.firestore();

// Use the adminMessaging instance for Firebase Cloud Messaging
const messaging = adminMessaging.messaging();

// Now you can use 'db' for Firestore operations and 'messaging' for FCM


// Now you can use 'db' for Firestore operations and 'messaging' for FCM

// Implement your Firebase Authentication routes and Firestore interactions here
app.post('/register', async (req, res) => {
  const { email, password, nickname, mobileNumber } = req.body;

  try {
    // Check if the email is already registered
    const emailCheck = await db.collection('users').where('email', '==', email).get();

    if (!emailCheck.empty) {
      return res.json({ message: 'Email is already registered' });
    }

    // Check if the nickname is already taken
    const nicknameCheck = await db.collection('users').where('nickname', '==', nickname).get();

    if (!nicknameCheck.empty) {
      return res.json({ message: 'Nickname is already taken' });
    }

    // Hash the password before storing it
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create a new user in Firestore users collection with hashed password
    const userRef = await db.collection('users').add({
      email,
      password: hashedPassword,
      nickname,
      mobileNumber,
    });

    res.status(200).json({ message: 'User registered successfully' });
  } catch (error) {
    console.error('Error registering user:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.post('/login', async (req, res) => {
  // Get the user's email and password from the request body
  const { email, password } = req.body;

  try {
    // Find the user by email in Firestore
    const userSnapshot = await db.collection('users').where('email', '==', email).get();

    if (userSnapshot.empty) {
      // User not found
      return res.json({ message: 'Incorrect email or password' });
    }

    // Extract user data
    const userData = userSnapshot.docs[0].data();

    // Compare the provided password with the stored hash
    const passwordMatch = await bcrypt.compare(password, userData.password);
    // console.log(passwordMatch, password, userData)

    if (passwordMatch) {
      // Passwords match, user authenticated
      res.json({ message: 'success', userRecord: userSnapshot.docs[0].id });
    } else {
      // Incorrect password
      res.json({ error: 'Incorrect email or password' });
    }
  } catch (error) {
    console.error('Error logging in:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});
app.post('/api/submit-feedback', async (req, res) => {
  try {
    const feedbackData = req.body;
    // Add the feedback to the Firestore collection
    const feedbackRef = await db.collection('feedback').add(feedbackData);
    res.status(200).json({ message: 'Feedback added successfully' });
  } catch (error) {
    console.error('Error adding feedback:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
app.get('/users', async (req, res) => {
  try {
    const usersSnapshot = await db.collection('users').get();
    const users = [];

    usersSnapshot.forEach((doc) => {
      users.push({
        uid: doc.id,
        ...doc.data(),
      });
    });

    res.status(200).json(users);
  } catch (error) {
    console.error('Error getting users:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});
app.post('/api/save-fcm-token', async (req, res) => {
  const { token, userId } = req.body;

  try {
    // Check if the FCM token already exists for the user
    const tokenRef = await db.collection("users").doc(userId).collection("tokens").where("token", "==", token).get();

    if (tokenRef.empty) {
      // If the token does not exist, add it to the collection
      await db.collection("users").doc(userId).collection("tokens").add({
        token,
      });

      res.status(200).json({ message: 'FCM token received and saved successfully' });
    } else {
      res.status(200).json({ message: 'FCM token already exists for this user' });
    }
  } catch (error) {
    console.error('Error saving/retrieving FCM token:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/logout', (req, res) => {
  const { userId } = req.body;

  // Delete tokens from the "tokens" collection of the specified user
  const tokensCollection = db.collection("users").doc(userId).collection("tokens");

  tokensCollection.get()
    .then((snapshot) => {
      if (snapshot.empty) {
        console.log('No tokens found for the user');
        return;
      }

      // Delete each document in the "tokens" collection
      const deletePromises = snapshot.docs.map((doc) => doc.ref.delete());

      // Wait for all delete operations to complete
      return Promise.all(deletePromises);
    })
    .then(() => {
      console.log('Tokens deleted successfully');
      res.status(200).json({ message: 'Tokens deleted successfully' });
    })
    .catch((error) => {
      console.error('Error deleting tokens:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    });
});
const sendPushNotification = async (token, text, from) => {
  try {
    const message = {
      data: {
        message: text,
        from: from,
      },
      token: token
    };

    await messaging.send(message);
  } catch (error) {

    // console.log(error);
  }
};

// Function to generate a unique conversation ID
function generateConversationId(userId1, userId2) {
  // Sort the user IDs to ensure consistency
  const sortedUserIds = [userId1, userId2].sort();

  // Concatenate the sorted user IDs to form the conversation ID
  return sortedUserIds.join('_');
}
const onlineUsers = {};
const typingUsers = {};
const socketIds = {};

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);
  // Handle 'join' event when a user joins the chat
  socket.on('join', async ({ userId, reciverId }) => {
    socket.join(userId);
    socketIds[userId] = socket.id;
    onlineUsers[userId] = true; // Set user online
    console.log(`User ${userId} joined the chat with ${reciverId}`);


    try {
      // Generate a unique conversation ID based on user IDs
      const conversationId = generateConversationId(userId, reciverId);

      const messagesRef = db.collection('messages').doc(conversationId).collection('messages');
      const snapshot = await messagesRef.orderBy('timestamp', 'asc').get();

      const messages = [];
      snapshot.forEach((doc) => {
        messages.push({ id: doc.id, ...doc.data() });
      });

      // Emit the 'previousMessages' event to the specific user who joined
      io.to(socketIds[userId]).emit('previousMessages', { messages });
    } catch (error) {
      console.error('Error fetching previous messages:', error);
    }

    // Send a welcome message to the specific user who joined
  });


  socket.on("setoffline", ({ senderId, offline }) => {
    onlineUsers[senderId] = offline;
    io.emit("userStatus", { userId: senderId, isOnline: offline });
    // console.log(onlineUsers)
    // console.log(socketIds);
  });
  socket.on("checkUserStatus", (userId) => {
    io.emit('userStatus', { userId, isOnline: onlineUsers[userId] });

  })

  // Handle 'typing' event
  socket.on('typing', ({ senderId, receiverId, isTyping }) => {
    // Update the typing status of the sender
    typingUsers[senderId] = isTyping;

    // Broadcast the 'typing' event to the recipient
    io.to(socketIds[receiverId]).emit('typing', { userId: senderId, isTyping: typingUsers[receiverId] });

    // Set a timeout to clear typing status after 3 seconds if not updated
    if (isTyping) {
      setTimeout(() => {
        // Clear typing status
        typingUsers[senderId] = false;

        // Broadcast the 'typing' event to the recipient with isTyping set to false
        if (receiverId) {
          io.to(socketIds[receiverId]).emit('typing', { userId: senderId, isTyping: false });
        }
      }, 3000);
    }
  });

  socket.on('getMessages', async ({ userId, reciverId }) => {
    try {
      // Generate a unique conversation ID based on user IDs
      const conversationId = generateConversationId(userId, reciverId);

      const messagesRef = db.collection('messages').doc(conversationId).collection('messages');
      const snapshot = await messagesRef.orderBy('timestamp', 'asc').get();
      // console.log(messages);
      const messages = [];
      snapshot.forEach((doc) => {
        messages.push({ id: doc.id, ...doc.data() });
      });
      // Emit the 'previousMessages' event to the specific user who requested it
      io.to(socketIds[userId]).emit('previousMessages', { messages });
    } catch (error) {
      console.error('Error fetching previous messages:', error);
    }
  });
  // Handle 'sendMessage' event when a user sends a message
  socket.on('checkUserStatus', ({ userId }) => {
    const isOnline = onlineUsers.hasOwnProperty(userId);
    io.to(socket.id).emit('userStatus', { userId, isOnline });
  });
  socket.on('sendMessage', async (data) => {
    const { senderId, receiverId, text } = data;

    try {
      // Generate a unique conversation ID based on user IDs
      const conversationId = generateConversationId(senderId, receiverId);

      const messagesRef = db.collection('messages').doc(conversationId).collection('messages');
      const timestamp = new Date();

      // Save the message to Firestore with the unique conversation ID
      await messagesRef.add({
        senderId,
        receiverId,
        text,
        timestamp,
      });

      // Emit the message to the sender
      if (senderId !== receiverId) {
        io.to(socketIds[senderId]).emit('newMessage', { senderId, receiverId, text, timestamp, conversationId });
      }

      // Emit the message to the receiver
      io.to(socketIds[receiverId]).emit('newMessage', { senderId, receiverId, text, timestamp, conversationId });

      
        console.log('Sent push notification');
        const userDocRef = db.collection("users").doc(receiverId);

        // Fetch user data including nickname
        userDocRef.get()
          .then((userDoc) => {
            if (!userDoc.exists) {
              console.log('User document not found for the receiver');
              return;
            }
            const userData = userDoc.data();
            const receiverNickname = userData.nickname;


            const tokensCollection = userDocRef.collection("tokens");
            tokensCollection.get()
              .then((snapshot) => {
                if (snapshot.empty) {
                  console.log('No tokens found for the user');
                  return;
                }
                // Process each document in the "tokens" collection
                snapshot.forEach((doc) => {
                  const tokenData = doc.data();
                  sendPushNotification(tokenData.token, text, receiverNickname)
                });

              })
          })

          .catch((error) => {
            console.error('Error retrieving tokens:', error);
          });
      

      // console.log('Message sent successfully');
    } catch (error) {
      console.error('Error sending message:', error);
    }
  });

  // Disconnect event
  socket.on('disconnect', () => {
    const disconnectedUser = Object.keys(onlineUsers).find((userId) => onlineUsers[userId] === socket.id);
    if (disconnectedUser) {
      delete onlineUsers[disconnectedUser];
      io.emit('userStatus', { userId: disconnectedUser, isOnline: false });
      console.log('User disconnected:', socket.id);
    }
  });
});
const PORT = 5000;

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

app.listen(7001, () => {
  console.log(`Server is running on port 7001`);
});
