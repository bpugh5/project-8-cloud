const express = require('express')
const morgan = require('morgan')

const multer = require('multer');

// const upload = multer({ "dest": `${__dirname}/uploads`})

const imageTypes = {
  'image/jpeg': 'jpg',
  'image/png': 'png'
};

const upload = multer({
  storage: multer.diskStorage({
    filename: (req, file, callback) => {
      const filename = crypto.pseudoRandomBytes(16).toString('hex');
      const extension = imageTypes[file.mimetype];
      callback(null, `${filename}.${extension}`);
    }
  }),

  fileFilter: (req, file, callback) => {
    callback(null, !!imageTypes[file.mimetype]);
  }
});

const api = require('./api')
const { connectToDb } = require('./lib/mongo')

const app = express()
const port = process.env.PORT || 8000

apipp.get('/images/:id', (req, res, next) => {
  console.log(req.params.id);
  const path = `${__dirname}/uploads/${req.params.id}`;
  res.setHeader("Content-Type", "image/jpeg").sendFile(path);
});

app.post('/images', upload.single('image'), (req, res, next) => {
  console.log("req.body = " + JSON.stringify(req.body, null, 4));
  console.log("req.body = " + JSON.stringify(req.file, null, 4));
  res.send({"status": "ok", "id": req.file.filename});
});

/*
 * Morgan is a popular logger.
 */
app.use(morgan('dev'))

app.use(express.json())
app.use(express.static('public'))

/*
 * All routes for the API are written in modules in the api/ directory.  The
 * top-level router lives in api/index.js.  That's what we include here, and
 * it provides all of the routes.
 */
app.use('/', api)

app.use('*', function (req, res, next) {
  res.status(404).json({
    error: "Requested resource " + req.originalUrl + " does not exist"
  })
})

connectToDb(function () {
  app.listen(port, function () {
    console.log("== Server is running on port", port)
  })
})
