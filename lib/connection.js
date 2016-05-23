const events = require('events');
const url = require('url');
const http = require('@scola/api-http');
const ClientRequest = require('./client-request');
const ClientResponse = require('./client-response');
const ServerRequestAdapter = require('./server-request-adapter');
const ServerResponseAdapter = require('./server-response-adapter');

const ID_HEADER = 'X-Request-Id';

class Connection extends events.EventEmitter {
  constructor(router, socket, codec, connector) {
    super();

    this.router = router;
    this.socket = socket;
    this.codec = codec;
    this.connector = connector;

    const address = url.parse(socket.url);
    this.remoteAddress = address.hostname;
    this.remotePort = address.port;

    this.id = 0;
    this.requests = {};

    this.socket.on('close', this.handleClose.bind(this));
    this.socket.on('error', this.handleError.bind(this));
    this.socket.on('message', this.handleMessage.bind(this));
  }

  request(options, callback) {
    options = Object.assign({}, options);

    if (callback) {
      options.headers = Object.assign(options.headers || {}, {
        [ID_HEADER]: ++this.id
      });
    }

    const request = new ClientRequest(this, options, callback);

    if (callback) {
      this.requests[this.id] = request;
    }

    return request;
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

        if (typeof data[0] === 'string') {
          this.handleRequest(data);
        } else {
          this.handleResponse(data);
        }
      });
    });

    decoder.end(encodedData);
  }

  handleRequest(data) {
    const requestAdapter = new ServerRequestAdapter(this, ...data);
    const responseAdapter = new ServerResponseAdapter(this);

    const request = new http.ServerRequest(requestAdapter);
    const response = new http.ServerResponse(responseAdapter);

    if (request.getHeader(ID_HEADER)) {
      response.setHeader(ID_HEADER, request.getHeader(ID_HEADER));
    }

    this.router.handleRequest(request, response);
  }

  handleResponse(data) {
    const response = new ClientResponse(this, ...data);

    if (response.getHeader(ID_HEADER)) {
      const id = Number(response.getHeader(ID_HEADER));

      if (this.requests[id]) {
        this.requests[id].handleResponse(response);
        delete this.requests[id];
      }
    }
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
