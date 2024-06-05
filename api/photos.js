/*
 * API sub-router for businesses collection endpoints.
 */

const crypto = require('crypto')
const { Router } = require('express')
const { getChannel } = require('../models/photo')

const { validateAgainstSchema } = require('../lib/validation')
const {
  PhotoSchema,
  insertNewPhoto,
  getPhotoById
} = require('../models/photo')

const router = Router()

const multer = require('multer');
const fs = require('fs');
const { GridFSBucket } = require('mongodb');
const { getDbReference } = require('../lib/mongo');

function getImageDownloadStreamByFilename(filename) {
  const db = getDbReference();
  const bucket = new GridFSBucket(db, {bucketName: 'images' });
  return bucket.openDownloadStreamByName(filename)
}

function getThumbDownloadStreamByFilename(filename) {
  const db = getDbReference();
  const bucket = new GridFSBucket(db, { bucketName: 'thumbs' });
  return bucket.openDownloadStreamByName(filename);
}

function removeUploadedFile(file) {
  return new Promise((resolve, reject) => {
    fs.unlink(file.path, (err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

function saveImageFile(req, res) {
  if (req.file && req.body && req.body.businessId) {
    try {
      return new Promise((resolve, reject) => {
        const db = getDbReference();
        const bucket = new GridFSBucket(db, {bucketName: 'images'});
        const metadata = {
          contentType: req.file.mimetype,
          businessId: req.body.businessId,
          caption: req.body.caption
        };
        const uploadStream = bucket.openUploadStream(
          req.file.filename,
          { metadata: metadata }
        );
        fs.createReadStream(req.file.path).pipe(uploadStream).on('error', (err) => {
          reject(err);
        })
        .on('finish', (result) => {
          resolve(result._id);
        });
      });
    } catch (err) {
      next(err);
    }
  } else {
    res.status(400).send({
      err: "Request body needs 'image' file and 'businessId'"
    })
  }
}

const imageTypes = {
  'image/jpeg': 'jpg',
  'image/png': 'png'
};

const upload = multer({
  storage: multer.diskStorage({
    destination: `${__dirname}/uploads`,
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


/*
 * POST /photos - Route to create a new photo.
 */
router.post('/', upload.single('image'), async (req, res) => {
  if (validateAgainstSchema(req.body, PhotoSchema)) {
    try {
      const id = await saveImageFile(req, res);
      await removeUploadedFile(req.file);
      const channel = await getChannel();
      await channel.assertQueue('images');
      channel.sendToQueue('images', Buffer.from(id.toString()));
      res.status(201).send({
        id: id,
        links: {
          photo: `/photos/${id}`,
          business: `/businesses/${req.body.businessId}`
        }
      })
    } catch (err) {
      console.error(err)
      res.status(500).send({
        error: "Error inserting photo into DB.  Please try again later."
      })
    }
  } else {
    res.status(400).send({
      error: "Request body is not a valid photo object"
    })
  }
})

/*
 * GET /photos/{id} - Route to fetch info about a specific photo.
 */
router.get('/:id', async (req, res, next) => {
  try {
    const photo = await getPhotoById(req.params.id)
    if (photo) {
      const responseBody = {
        _id: photo._id,
        url: `/media/images/${photo.filename}`,
        contentType: photo.metadata.contentType,
        businessId: photo.metadata.businessId,
        size: photo.metadata.size
      };
      res.status(200).send(responseBody);
    } else {
      next()
    }
  } catch (err) {
    console.error(err)
    res.status(500).send({
      error: "Unable to fetch photo.  Please try again later."
    })
  }
})

router.get('/media/images/:filename', (req, res, next) => {
  getImageDownloadStreamByFilename(req.params.filename)
  .on('file', (file) => {
    res.status(200).type(file.metadata.contentType);
  })
  .on('error', (err) => {
    if (err.code === 'ENOENT') {
      next();
    } else {
      next(err);
    }
  }).pipe(res);
});

router.get('/media/thumbs/:filename', (req, res, next) => {
  getThumbDownloadStreamByFilename(req.params.filename)
  .on('file', (file) => {
    res.status(200).type(file.metadata.contentType);
  })
  .on('error', (err) => {
    if (err.code === 'ENOENT') {
      next();
    } else {
      next(err);
    }
  }).pipe(res);
});

module.exports = router
