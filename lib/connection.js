const events = require('events');
const http = require('@scola/api-http');
const ServerRequestAdapter = require('./server-request-adapter');
const ServerResponseAdapter = require('./server-response-adapter');

class Connection extends events.EventEmitter {
  constructor(router, socket, codec, connector) {
    super();

    this.router = router;
    this.socket = socket;
    this.codec = codec;
    this.connector = connector;

    this.id = 0;
    this.requests = {};

    this.socket.on('close', this.handleClose.bind(this));
    this.socket.on('error', this.handleError.bind(this));
    this.socket.on('message', this.handleMessage.bind(this));
  }

  handleClose() {
    if (this.connector) {
      this.connector.closeConnection(this);
    }
  }

  handleError(error, ...args) {
    if (this.connector) {
      this.connector.emit('error', error, ...args);
    } else {
      this.emit('error', error, ...args);
    }
  }

  handleMessage(encodedData) {
    encodedData = encodedData.data ? encodedData.data : encodedData;

    const decoder = new this.codec.Decoder();

    decoder.on('error', (error) => {
      this.handleError(error);
    });

    decoder.on('data', (data) => {
      this.checkData(data, (error) => {
        if (error) {
          this.handleError(error);
          return;
        }

        if (typeof data[0] === 'number') {
          this.handleResponse(data);
        } else {
          this.handleRequest(data);
        }
      });
    });

    decoder.end(encodedData);
  }

  handleRequest(data) {
    const requestAdapter = new ServerRequestAdapter(this.socket, ...data);
    const responseAdapter = new ServerResponseAdapter(this.socket, this.codec);

    const request = new http.ServerRequest(requestAdapter);
    const response = new http.ServerResponse(responseAdapter);

    this.router.handleRequest(request, response);
  }

  checkData(data, callback) {
    if (!Array.isArray(data)) {
      callback(new Error('Not an array'));
      return;
    }

    if (data.length !== 3) {
      callback(new Error('Invalid number of elements'));
      return;
    }

    if (typeof data[0] !== 'number' && typeof data[0] !== 'string') {
      callback(new Error('Identifier is invalid'));
      return;
    }

    if (data[1] === null || typeof data[1] !== 'object') {
      callback(new Error('Headers are invalid'));
      return;
    }

    callback(null, data);
  }
}

module.exports = Connection;
