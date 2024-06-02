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

async function updateImageSizeById(id, imageData) {
  const image = await Jimp.read(imageData).then((image) => {
    return image.resize(100, 100);
  });

  const imageBuffer = await image.getBufferAsync(Jimp.MIME_JPEG);

  const db = getDbReference();

  const bucket = new GridFSBucket(db, {bucketName: 'thumbs'});
  const metadata = {
    contentType: 'image/jpeg',
    height: sizeOf(imageBuffer).height,
    width: sizeOf(imageBuffer).width,
  };
  const uploadStream = bucket.openUploadStream(
    `${id}.jpg`,
    { metadata: metadata }
  );
  uploadStream.write(imageBuffer);
}

async function mainConsumer() {
  try {
    const channel = await getChannel();
    await channel.assertQueue('images');
      channel.consume('images', async (msg) =>  {
        if (msg) {
          const id = msg.content.toString();
          const downloadStream = await getDownloadStreamById(id);
          const imageData = [];
          downloadStream.on('data', (data) => {
            imageData.push(data);
          });
          downloadStream.on('end', async () => {
            const result = await updateImageSizeById(id, Buffer.concat(imageData));
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
  const bucket = new GridFSBucket(db, {bucketName: 'images' });
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
  const bucket = new GridFSBucket(db, {bucketName: 'images' });
  if (!ObjectId.isValid(id)) {
    return null
  } else {
    const results = await bucket.find({_id: new ObjectId(id) }).toArray();
    return results[0]
  }
}

exports.getPhotoById = getPhotoById