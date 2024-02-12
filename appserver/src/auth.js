const admin = require('firebase-admin');

const authenticateUser = async (req, res, next) => {
  const idToken = req.headers.authorization;

  if (!idToken) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    req.uid = decodedToken.uid;
    return next();
  } catch (error) {
    console.error('Error verifying Firebase ID token:', error);
    return res.status(403).json({ error: 'Unauthorized' });
  }
};

module.exports = authenticateUser;
