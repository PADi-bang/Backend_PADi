const { initializeApp, cert } = require('firebase-admin/app');
const { getMessaging } = require('firebase-admin/messaging');
const path = require('path');
const fs = require('fs');

// Path ke file kredensial (pastikan file firebase-adminsdk.json ada di folder backend)
const serviceAccountPath = path.join(__dirname, '../../firebase-adminsdk.json');

let app = null;

// Inisialisasi Firebase Admin jika file kredensial tersedia
if (fs.existsSync(serviceAccountPath)) {
  try {
    const serviceAccount = require(serviceAccountPath);
    app = initializeApp({
      credential: cert(serviceAccount)
    });
    console.log('Firebase Admin SDK initialized successfully.');
  } catch (error) {
    console.error('Error initializing Firebase Admin SDK:', error);
  }
} else {
  console.warn('Warning: firebase-adminsdk.json not found in backend/. Push notifications will not work.');
}

/**
 * Mengirim push notification ke user dengan FCM Token
 * @param {string} fcmToken - Token device pengguna
 * @param {string} title - Judul notifikasi
 * @param {string} body - Isi notifikasi
 * @param {object} data - Data tambahan (opsional)
 */
const sendPushNotification = async (fcmToken, title, body, data = {}) => {
  if (!app) {
    console.log('Firebase Admin not initialized. Skipping notification:', title);
    return;
  }

  if (!fcmToken) {
    console.log('No FCM Token provided. Skipping notification:', title);
    return;
  }

  try {
    const message = {
      notification: {
        title,
        body
      },
      data: {
        click_action: 'FLUTTER_NOTIFICATION_CLICK',
        ...data
      },
      android: {
        priority: 'high',
        notification: {
          channelId: 'high_importance_channel'
        }
      },
      token: fcmToken
    };

    const response = await getMessaging(app).send(message);
    console.log('Successfully sent message:', response);
    return response;
  } catch (error) {
    console.error('Error sending message:', error);
    throw error;
  }
};

module.exports = {
  sendPushNotification
};
