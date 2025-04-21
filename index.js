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

const skipNgrokWarning = (req, res, next) => {
  res.setHeader("ngrok-skip-browser-warning", "true");
  next();
};


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

const sendNotificationToAll = async (typeNotif) => {
  if (subscriptions.length === 0) return;
  let payload;
  if (typeNotif === 'delete') {
    payload = JSON.stringify({
      title: '🗑️ Imagen eliminada',
      body: 'Un usuario acaba de eliminar una imagen de la galería.'
    });
  } else if (typeNotif === 'upload') {
    payload = JSON.stringify({
      title: '📸 Nueva imagen subida',
      body: 'Un usuario acaba de subir una nueva imagen a la galería.'
    });
  }
  const results = await Promise.allSettled(
    subscriptions.map(sub => webpush.sendNotification(sub, payload))
  );
  console.log('Notificaciones enviadas:', results.length);
};



const upload = multer({ storage });

app.post('/upload', skipNgrokWarning, upload.single('image'), async (req, res) => {
  const filename = req.file.filename;

  const metadata = {
    timestamp: req.body.timestamp || null,
    latitud: req.body.latitud || null,
    longitud: req.body.longitud || null
  };

  fs.writeFileSync(
    path.join(__dirname, 'uploads', `${filename}.json`),
    JSON.stringify(metadata, null, 2)
  );

  res.status(200).json({ path: `/uploads/${filename}` });

  try {
    await sendNotificationToAll("upload");
  } catch (err) {
    console.error('❌ Error al enviar notificaciones:', err);
  }
});


app.get('/gallery', skipNgrokWarning, (req, res) => {
  const files = fs.readdirSync('uploads');
  const images = files
    .filter(file => !file.endsWith('.json'))
    .map(file => {
      let metadata = {};
      const jsonPath = path.join(__dirname, 'uploads', `${file}.json`);
      if (fs.existsSync(jsonPath)) {
        try {
          metadata = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
        } catch (err) {
          console.error(`Error leyendo metadata para ${file}:`, err);
        }
      }

      return {
        path: `/uploads/${file}`,
        timestamp: metadata.timestamp || null,
        latitud: metadata.latitud || null,
        longitud: metadata.longitud || null
      };
    });

  res.json(images);
});


app.delete('/delete/:filename', skipNgrokWarning, async (req, res) => {
  const { filename } = req.params;
  const filePath = path.join(__dirname, 'uploads', filename);

  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  
    const metadataPath = `${filePath}.json`;
    if (fs.existsSync(metadataPath)) {
      fs.unlinkSync(metadataPath);
    }
  
    res.status(200).json({ message: 'Imagen y metadatos eliminados' });
    try {
      await sendNotificationToAll("delete");
    } catch (err) {
      console.error('❌ Error al enviar notificaciones:', err);
    }
  } else {
    res.status(404).json({ message: 'Archivo no encontrado' });
  }
});


app.post('/subscribe', skipNgrokWarning, express.json(), (req, res) => {
  const exists = subscriptions.find(sub => sub.endpoint === req.body.endpoint);
  if (exists) {
    return res.status(409).json({ message: 'Ya estás suscrito' });
  }
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
