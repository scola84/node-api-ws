const events = require('@scola/events');
const url = require('url');
const http = require('@scola/api-http');

const ClientRequest = require('./client-request');
const ClientResponse = require('./client-response');
const ServerRequestAdapter = require('./server-request-adapter');
const ServerResponseAdapter = require('./server-response-adapter');

class Connection extends events.EventEmitter {
  constructor(router, socket, codec, options) {
    super();

    this.router = router;
    this.socket = socket;
    this.codec = codec;

    this.options = Object.assign({
      idHeader: 'x-id'
    }, options);

    const address = this.normalizeAddress(socket);
    this.remoteAddress = address.remoteAddress;
    this.remotePort = address.remotePort;

    this.id = 0;
    this.requests = {};

    this.bindSocket();
  }

  close(code, reason) {
    this.socket.close(code, reason);
    this.unbindSocket();
  }

  request(options, callback) {
    options = Object.assign({}, options);

    if (callback) {
      options.headers = Object.assign(options.headers || {}, {
        [this.options.idHeader]: ++this.id
      });
    }

    const request = new ClientRequest(this, options, callback);

    if (callback) {
      this.requests[this.id] = request;
    }

    return request;
  }

  bindSocket() {
    this.socket.onclose = this.handleClose.bind(this);
    this.socket.onerror = this.handleError.bind(this);
    this.socket.onmessage = this.handleMessage.bind(this);
  }

  unbindSocket() {
    this.socket.onclose = null;
    this.socket.onerror = null;
    this.socket.onmessage = null;
  }

  handleClose(event) {
    this.unbindSocket();
    this.emit('close', event, this);
  }

  handleError(error) {
    this.emit('error', error);
  }

  handleMessage(encodedData) {
    encodedData = encodedData.data ? encodedData.data : encodedData;
    const decoder = new this.codec.Decoder();

    decoder.once('error', (error) => {
      decoder.removeAllListeners();
      this.close(1003);
      this.emit('error', error);
    });

    decoder.once('data', (data) => {
      decoder.removeAllListeners();

      this.checkProtocol(data, (error) => {
        if (error) {
          this.close(1002);
          this.emit('error', new Error('Protocol error: ' + error.message));
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

    if (request.getHeader(this.options.idHeader)) {
      response.setHeader(this.options.idHeader,
        request.getHeader(this.options.idHeader));
    }

    this.router.handleRequest(request, response);
  }

  handleResponse(data) {
    const response = new ClientResponse(this, ...data);

    if (response.getHeader(this.options.idHeader)) {
      const id = Number(response.getHeader(this.options.idHeader));

      if (this.requests[id]) {
        this.requests[id].handleResponse(response);
        delete this.requests[id];
      }
    }
  }

  checkProtocol(data, callback) {
    if (!Array.isArray(data) || data.length !== 3) {
      callback(new Error('Message has an invalid structure'));
      return;
    }

    const isRequest = (/^(GET|POST|PUT|DELETE)\s(.+)$/).test(data[0]);
    const isResponse = typeof data[0] === 'number';

    if (!isRequest && !isResponse) {
      callback(new Error('Message identifier is invalid'));
      return;
    }

    if (data[1] === null || typeof data[1] !== 'object') {
      callback(new Error('Message headers are invalid'));
      return;
    }

    callback(null, data);
  }

  normalizeAddress(socket) {
    const address = {};

    if (socket.url) {
      const parsedUrl = url.parse(socket.url);
      address.remoteAddress = parsedUrl.hostname;
      address.remotePort = parsedUrl.port;
    } else if (socket.upgradeReq) {
      address.remoteAddress = socket.upgradeReq.connection.remoteAddress;
      address.remotePort = socket.upgradeReq.connection.remotePort;
    }

    return address;
  }
}

module.exports = Connection;
