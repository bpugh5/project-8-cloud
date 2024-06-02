const express = require('express')
const morgan = require('morgan')

const api = require('./api')
const { connectToDb } = require('./lib/mongo')
const { mainConsumer } = require('./models/photo');

const app = express()
const port = process.env.PORT || 8000


/*
 * Morgan is a popular logger.
 */
app.use(morgan('dev'))

app.use(express.json())
app.use(express.static('public'))
app.use(
  '/media/images', 
  express.static(`${__dirname}/uploads`)
);


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

app.use('*', function (err, req, res, next) {
  console.error(err);
  res.status(500).send({
    error: "An error occurred. Try again later."
  });
})

connectToDb(function () {
  mainConsumer();
  app.listen(port, function () {
    console.log("== Server is running on port", port)
  })
})
