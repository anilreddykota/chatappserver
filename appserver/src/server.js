// server.js
const express = require('express');
const firebaseAdmin = require('firebase-admin');
const bcrypt = require('bcrypt');
const app = express();
const http = require('http');
const server = http.createServer(app);
const io = require("socket.io")(server, {
    allowRequest: (req, callback) => {
      callback(null, true);
    },
    cors: {
      origin: ['https://ichatwithyou.vercel.app',"http://localhost:3000"],
      methods: ['GET', 'POST'],
    }
  });
  
const cors = require('cors'); 
app.use(cors());
app.use(express.json());
// Initialize Firebase Admin SDK
const serviceAccount = require('./newkey.json');
firebaseAdmin.initializeApp({
  credential: firebaseAdmin.credential.cert(serviceAccount),
  storageBucket: 'chatappsocketanil.appspot.com'
});

const db = firebaseAdmin.firestore();

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
    console.log(passwordMatch, password, userData)

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
// Function to generate a unique conversation ID
function generateConversationId(userId1, userId2) {
    // Sort the user IDs to ensure consistency
    const sortedUserIds = [userId1, userId2].sort();

    // Concatenate the sorted user IDs to form the conversation ID
    return sortedUserIds.join('_');
}


io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // Handle 'join' event when a user joins the chat
    socket.on('join', async ({ userId, reciverId }) => {
      socket.join(userId);
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
        io.to(userId).emit('previousMessages', { messages });
      } catch (error) {
        console.error('Error fetching previous messages:', error);
      }
    
      // Send a welcome message to the specific user who joined
      io.to(userId).emit('newMessage', { senderId: 'system', text: 'Welcome to the chat!' });
    });
        socket.on('getMessages', async ({ userId, reciverId }) => {
        try {
          // Generate a unique conversation ID based on user IDs
          const conversationId = generateConversationId(userId, reciverId);
    
          const messagesRef = db.collection('messages').doc(conversationId).collection('messages');
          const snapshot = await messagesRef.orderBy('timestamp', 'asc').get();
    
          const messages = [];
          snapshot.forEach((doc) => {
            messages.push({ id: doc.id, ...doc.data() });
          });
    
          // Emit the 'previousMessages' event to the specific user who requested it
          io.to(userId).emit('previousMessages', { messages });
        } catch (error) {
          console.error('Error fetching previous messages:', error);
        }
         });
    // Handle 'sendMessage' event when a user sends a message
        socket.on('sendMessage', async(data) => {
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
            io.to(senderId).emit('newMessage', { senderId, receiverId, text, timestamp, conversationId });

            // Emit the message to the receiver
            io.to(receiverId).emit('newMessage', { senderId, receiverId, text, timestamp, conversationId });

            // console.log('Message sent successfully');
        } catch (error) {
            console.error('Error sending message:', error);
        }
    });

    // Disconnect event
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
    });
});

const PORT = 5000;

server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

app.listen(7001, () => {
    console.log(`Server is running on port 7001`);
});
