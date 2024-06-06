/*
 * Photo schema and data accessor methods.
 */

const { ObjectId, GridFSBucket } = require('mongodb')

const { getDbReference } = require('../lib/mongo')
const { extractValidFields } = require('../lib/validation')

const amqp = require('amqplib');
const rabbitmqHost = process.env.RABBITMQ_HOST;
const rabbitmqUrl = `amqp://${rabbitmqHost}`;

const sizeOf = require('image-size');
const Jimp = require('jimp');

async function getChannel() {
  const connection = await amqp.connect(rabbitmqUrl);
  const channel = await connection.createChannel();
  return channel;
}

exports.getChannel = getChannel

async function updatePhotoSizeById(id, photosData) {
  const photo = await Jimp.read(photosData).then((photo) => {
    return photo.resize(100, 100);
  });

  const photoBuffer = await photo.getBufferAsync(Jimp.MIME_JPEG);

  const db = getDbReference();

  const bucket = new GridFSBucket(db, {bucketName: 'thumbs'});
  const metadata = {
    contentType: 'image/jpeg',
    height: sizeOf(photoBuffer).height,
    width: sizeOf(photoBuffer).width,
  };
  const photoBucket = new GridFSBucket(db, {bucketName: 'photos' });
  const returnedPhoto = await photoBucket.find({_id: ObjectId(id)}).toArray();
  const uploadStream = bucket.openUploadStream(
    returnedPhoto[0].filename,
    { metadata: metadata }
  );
  uploadStream.end(photoBuffer);
}

async function mainConsumer() {
  try {
    const channel = await getChannel();
    await channel.assertQueue('photos');
    channel.consume('photos', async (msg) => {
        if (msg) {

          const id = msg.content.toString();
          const downloadStream = await getDownloadStreamById(id);
          const photosData = [];
          downloadStream.on('data', (data) => {
            photosData.push(data);
          });
          downloadStream.on('end', async () => {
            const result = await updatePhotoSizeById(id, Buffer.concat(photosData));
          });
        }

        channel.ack(msg);
      });
  } catch (err) {
    console.error(err);
  }
}

exports.mainConsumer = mainConsumer

async function getDownloadStreamById(id) {
  const db = getDbReference();
  const bucket = new GridFSBucket(db, {bucketName: 'photos' });
  const object = await bucket.find({_id: ObjectId(id)}).toArray();
  return bucket.openDownloadStreamByName(object[0].filename);
}

/*
 * Schema describing required/optional fields of a photo object.
 */
const PhotoSchema = {
  businessId: { required: true },
  caption: { required: false }
}
exports.PhotoSchema = PhotoSchema

/*
 * Executes a DB query to insert a new photo into the database.  Returns
 * a Promise that resolves to the ID of the newly-created photo entry.
 */
async function insertNewPhoto(photo) {
  photo = extractValidFields(photo, PhotoSchema)
  photo.businessId = ObjectId(photo.businessId)
  const db = getDbReference()
  const collection = db.collection('photos')
  const result = await collection.insertOne(photo)
  return result.insertedId
}
exports.insertNewPhoto = insertNewPhoto

/*
 * Executes a DB query to fetch a single specified photo based on its ID.
 * Returns a Promise that resolves to an object containing the requested
 * photo.  If no photo with the specified ID exists, the returned Promise
 * will resolve to null.
 */
async function getPhotoById(id) {
  const db = getDbReference()
  const bucket = new GridFSBucket(db, {bucketName: 'photos' });
  if (!ObjectId.isValid(id)) {
    return null
  } else {
    const results = await bucket.find({_id: new ObjectId(id) }).toArray();
    return results[0]
  }
}

exports.getPhotoById = getPhotoById