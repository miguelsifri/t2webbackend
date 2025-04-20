const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const webpush = require('web-push');

const vapidKeys = {
  publicKey: 'BF_rJlyHtR9-loT7pX5YEA8brsLlDtgME2ZX4dI0fu7zwrpA_8BP3xErit66X95bv8xzjYuGpw4NO_KtzDY3LZk',
  privateKey: 'WKyuBA1aC02cmbl4fXHvrUOIBKnLtvc6YLeryO0u098'
};

webpush.setVapidDetails(
  'mailto:sebalopeza@uc.cl',
  vapidKeys.publicKey,
  vapidKeys.privateKey
);

let subscriptions = [];


const app = express();
const port = 3000;


app.use(cors());
app.use('/uploads', express.static('uploads', {
  setHeaders: (res) => {
    res.set('Access-Control-Allow-Origin', '*');
  }
}));

const storage = multer.diskStorage({
  destination: 'uploads/',
  filename: (_, file, cb) => {
    cb(null, file.originalname); // ✅ conservar nombre del frontend
  }
});

const sendNotificationToAll = async () => {
  if (subscriptions.length === 0) return;

  const payload = JSON.stringify({
    title: '📸 Nueva imagen subida',
    body: 'Un usuario acaba de subir una nueva imagen a la galería.'
  });

  const results = await Promise.allSettled(
    subscriptions.map(sub => webpush.sendNotification(sub, payload))
  );

  console.log(`🔔 Notificaciones enviadas: ${results.length}`);
};


const upload = multer({ storage });

app.post('/upload', upload.single('image'), async (req, res) => {
  res.status(200).json({ path: `/uploads/${req.file.filename}` });
  try {
    await sendNotificationToAll();
  } catch (err) {
    console.error('❌ Error al enviar notificaciones:', err);
  }
});

app.get('/gallery', (req, res) => {
  const files = fs.readdirSync('uploads');
  res.json(files.map(file => `/uploads/${file}`));
});

app.delete('/delete/:filename', (req, res) => {
  const { filename } = req.params;
  const filePath = path.join(__dirname, 'uploads', filename);

  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    res.status(200).json({ message: 'Imagen eliminada' });
  } else {
    res.status(404).json({ message: 'Archivo no encontrado' });
  }
});


app.post('/subscribe', express.json(), (req, res) => {
  subscriptions.push(req.body);
  fs.writeFileSync('subs.json', JSON.stringify(subscriptions, null, 2));
  res.status(201).json({ message: 'Suscripción guardada' });
});

if (fs.existsSync('subs.json')) {
  subscriptions = JSON.parse(fs.readFileSync('subs.json'));
}

app.listen(port, () => {
  console.log(`Servidor escuchando en http://localhost:${port}`);
});
